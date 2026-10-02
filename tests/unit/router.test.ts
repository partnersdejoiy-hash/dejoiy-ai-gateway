/**
 * Unit tests: ModelRouter scoring, failover, capability matching, fallback.
 */
import { ModelRouter } from "../../src/router/router.js";
import type { GatewayConfig } from "../../src/config.js";
import {
  AIChunk,
  AIProvider,
  AIResponse,
  ChatRequest,
  HealthStatus,
  Model,
  ProviderError,
} from "../../src/types.js";

function healthy(latencyMs = 50): HealthStatus {
  return {
    state: "HEALTHY", latencyMs, modelLoaded: true,
    activeRequests: 0, queueLength: 0, errorRate: 0, lastCheckAt: Date.now(),
  };
}

class MockProvider implements AIProvider {
  calls = 0;
  constructor(
    public name: string,
    private behavior: "ok" | "fail-retryable" | "fail-auth" | "slow" = "ok",
    private caps: Partial<Model["capabilities"]> = {},
  ) {}
  async models(): Promise<Model[]> {
    return [{
      id: `${this.name}-model`, provider: this.name,
      capabilities: {
        contextLength: 131072, vision: false, toolCalling: true,
        jsonMode: true, streaming: true, maxOutputTokens: 8192, ...this.caps,
      },
    }];
  }
  async healthCheck(): Promise<HealthStatus> {
    if (this.behavior === "fail-retryable") {
      return { ...healthy(), state: "UNAVAILABLE", modelLoaded: false };
    }
    return healthy(this.behavior === "slow" ? 2000 : 50);
  }
  async chat(request: ChatRequest): Promise<AIResponse> {
    this.calls++;
    if (this.behavior === "fail-retryable") {
      throw new ProviderError(this.name, "PROVIDER_UNAVAILABLE", true, "down");
    }
    if (this.behavior === "fail-auth") {
      throw new ProviderError(this.name, "AUTH_FAILED", false, "bad key");
    }
    if (this.behavior === "slow") {
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      id: "r1", model: request.model, provider: this.name,
      content: `from-${this.name}`, finishReason: "stop", latencyMs: 10,
    };
  }
  async *stream(_request: ChatRequest): AsyncIterable<AIChunk> {
    yield { id: "s1", model: "m", provider: this.name, delta: "hi", done: false };
    yield { id: "s1", model: "m", provider: this.name, delta: "", done: true };
  }
}

function testConfig(over: Partial<GatewayConfig> = {}): GatewayConfig {
  const providers = {} as GatewayConfig["providers"];
  for (const k of ["groq", "gemini", "vllm"] as const) {
    providers[k] = { enabled: true, url: "http://x", model: "m", timeoutMs: 5000, weight: 1 };
  }
  return {
    port: 0, host: "127.0.0.1", requireAuth: false, gatewayApiKeys: [],
    rateLimitPerMinute: 1000, requestTimeoutMs: 5000,
    healthCheckIntervalMs: 60000, healthCheckTimeoutMs: 2000,
    circuitBreakerFailureThreshold: 5, circuitBreakerCooldownMs: 60000,
    circuitBreakerSuccessThreshold: 1,
    maxQueueSize: 100, queueTimeoutMs: 5000, maxConcurrency: 8,
    dbPath: ":memory:",
    logicalModels: [
      {
        logicalModel: "kaali-fast",
        providers: [
          { provider: "groq", model: "m1" },
          { provider: "gemini", model: "m2" },
          { provider: "vllm", model: "m3" },
        ],
      },
      {
        logicalModel: "kaali-smart",
        providers: [{ provider: "vllm", model: "m3" }],
        fallbackChain: ["kaali-fast"],
      },
    ],
    providers,
    ...over,
  } as GatewayConfig;
}

const req = (model = "kaali-fast"): ChatRequest => ({
  model, messages: [{ role: "user", content: "hello" }],
});

afterEach(() => jest.restoreAllMocks());

describe("ModelRouter", () => {
  test("routes to a healthy provider", async () => {
    const groq = new MockProvider("groq");
    const router = new ModelRouter(new Map([["groq", groq]]), testConfig());
    router.start();
    try {
      const res = await router.chat(req());
      expect(res.content).toBe("from-groq");
      expect(groq.calls).toBe(1);
    } finally {
      await router.stop();
    }
  });

  test("fails over when first provider errors", async () => {
    const bad = new MockProvider("groq", "fail-retryable");
    // force groq to be tried first by making gemini slow
    const slowGemini = new MockProvider("gemini", "slow");
    const router = new ModelRouter(
      new Map([["groq", bad], ["gemini", slowGemini]]),
      testConfig(),
    );
    router.start();
    try {
      // wait for staggered health checks: groq → UNAVAILABLE, gemini → HEALTHY
      await new Promise((r) => setTimeout(r, 1200));
      const res = await router.chat(req());
      expect(res.provider).toBe("gemini");
      expect(bad.calls).toBe(0); // unhealthy → never attempted
      expect(slowGemini.calls).toBe(1);
    } finally {
      await router.stop();
    }
  });

  test("all providers down → ALL_PROVIDERS_FAILED (never raw error)", async () => {
    const bad = new MockProvider("groq", "fail-retryable");
    // health says UNAVAILABLE so it's filtered; add one that fails at call time
    const flaky = new MockProvider("gemini");
    jest.spyOn(flaky, "healthCheck").mockResolvedValue(healthy(50));
    jest.spyOn(flaky, "chat").mockRejectedValue(
      new ProviderError("gemini", "PROVIDER_UNAVAILABLE", true, "boom"),
    );
    const router = new ModelRouter(new Map([["groq", bad], ["gemini", flaky]]), testConfig());
    router.start();
    try {
      await expect(router.chat(req())).rejects.toMatchObject({ code: "ALL_PROVIDERS_FAILED" });
    } finally {
      await router.stop();
    }
  });

  test("unknown model → MODEL_UNAVAILABLE", async () => {
    const router = new ModelRouter(new Map([["groq", new MockProvider("groq")]]), testConfig());
    router.start();
    try {
      await expect(router.chat(req("nope"))).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    } finally {
      await router.stop();
    }
  });

  test("fallback chain applied when model candidates all fail", async () => {
    const vllmFail = new MockProvider("vllm", "fail-retryable");
    jest.spyOn(vllmFail, "healthCheck").mockResolvedValue(healthy(50));
    jest.spyOn(vllmFail, "chat").mockRejectedValue(
      new ProviderError("vllm", "PROVIDER_UNAVAILABLE", true, "down"),
    );
    const groq = new MockProvider("groq");
    const router = new ModelRouter(new Map([["vllm", vllmFail], ["groq", groq]]), testConfig());
    router.start();
    try {
      const res = await router.chat(req("kaali-smart"));
      expect(res.provider).toBe("groq"); // via kaali-fast fallback
      expect(res.model).toBe("kaali-fast");
    } finally {
      await router.stop();
    }
  });

  test("vision request skips non-vision providers", async () => {
    const noVision = new MockProvider("groq", "ok", { vision: false });
    const vision = new MockProvider("gemini", "ok", { vision: true });
    const router = new ModelRouter(new Map([["groq", noVision], ["gemini", vision]]), testConfig());
    router.start();
    try {
      const res = await router.chat({
        model: "kaali-fast",
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "http://x/img.png" } }] }],
      });
      expect(res.provider).toBe("gemini");
      expect(noVision.calls).toBe(0);
    } finally {
      await router.stop();
    }
  });

  test("AUTH_FAILED fails fast without leaking to other providers", async () => {
    const badAuth = new MockProvider("groq", "fail-auth");
    const good = new MockProvider("gemini");
    const router = new ModelRouter(new Map([["groq", badAuth], ["gemini", good]]), testConfig());
    router.start();
    try {
      await expect(router.chat(req())).rejects.toMatchObject({ code: "AUTH_FAILED" });
      expect(good.calls).toBe(0);
    } finally {
      await router.stop();
    }
  });

  test("getProviderStatuses returns scored list", async () => {
    const router = new ModelRouter(
      new Map([["groq", new MockProvider("groq")], ["gemini", new MockProvider("gemini")]]),
      testConfig(),
    );
    router.start();
    try {
      // wait for initial staggered health checks
      await new Promise((r) => setTimeout(r, 1200));
      const statuses = router.getProviderStatuses();
      expect(statuses.length).toBe(2);
      expect(statuses[0]).toHaveProperty("circuit", "CLOSED");
      expect(statuses[0].health.state).toBe("HEALTHY");
    } finally {
      await router.stop();
    }
  });
});
