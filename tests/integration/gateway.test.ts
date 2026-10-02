/**
 * Integration tests: full gateway HTTP API with mock providers.
 */
import type { AddressInfo } from "node:net";
import { loadConfig, GatewayConfig } from "../../src/config.js";
import { createApp } from "../../src/gateway/app.js";
import { ModelRouter } from "../../src/router/router.js";
import {
  AIChunk, AIProvider, AIResponse, ChatRequest, HealthStatus, Model, ProviderError,
} from "../../src/types.js";

function healthy(): HealthStatus {
  return {
    state: "HEALTHY", latencyMs: 20, modelLoaded: true,
    activeRequests: 0, queueLength: 0, errorRate: 0, lastCheckAt: Date.now(),
  };
}

class MockProvider implements AIProvider {
  constructor(public name: string, private fail = false) {}
  async models(): Promise<Model[]> {
    return [{ id: "m", provider: this.name, capabilities: {
      contextLength: 131072, vision: false, toolCalling: true,
      jsonMode: true, streaming: true, maxOutputTokens: 8192,
    }}];
  }
  async healthCheck(): Promise<HealthStatus> { return healthy(); }
  async chat(request: ChatRequest): Promise<AIResponse> {
    if (this.fail) throw new ProviderError(this.name, "PROVIDER_UNAVAILABLE", true, "down");
    return {
      id: "chatcmpl-test", model: request._providerModel ?? "m", provider: this.name,
      content: `hello from ${this.name}`, finishReason: "stop", latencyMs: 5,
      promptTokens: 3, completionTokens: 4, totalTokens: 7,
    };
  }
  async *stream(request: ChatRequest): AsyncIterable<AIChunk> {
    yield { id: "s", model: "m", provider: this.name, delta: "hi", done: false };
    yield { id: "s", model: "m", provider: this.name, delta: "", done: true };
  }
}

function makeConfig(over: Partial<GatewayConfig> = {}): GatewayConfig {
  const base = loadConfig({
    ...process.env,
    REQUIRE_AUTH: "false",
    HEALTH_CHECK_INTERVAL_MS: "60000",
    DB_PATH: ":memory:",
    LOGICAL_MODELS_JSON: JSON.stringify([
      { logicalModel: "kaali-fast", providers: [{ provider: "p1", model: "m1" }, { provider: "p2", model: "m2" }] },
    ]),
  });
  return { ...base, ...over };
}

describe("gateway API", () => {
  let server: ReturnType<typeof import("http").createServer> | any;
  let baseUrl: string;
  let router: ModelRouter;

  async function start(providers: Map<string, AIProvider>, configOver: Partial<GatewayConfig> = {}) {
    const config = makeConfig(configOver);
    router = new ModelRouter(providers, config);
    router.start();
    const app = createApp(router, config);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    // allow staggered health checks to complete
    await new Promise((r) => setTimeout(r, 900));
  }

  afterEach(async () => {
    await router?.stop().catch(() => undefined);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  test("POST /v1/chat/completions returns OpenAI shape", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]));
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("kaali-fast");
    expect(body.choices[0].message.content).toBe("hello from p1");
    expect(body.usage.total_tokens).toBe(7);
  });

  test("failover: p1 down → p2 serves", async () => {
    await start(new Map([["p1", new MockProvider("p1", true)], ["p2", new MockProvider("p2")]]));
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.choices[0].message.content).toBe("hello from p2");
  });

  test("streaming returns SSE", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]));
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }], stream: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("data: ");
    expect(text).toContain("[DONE]");
  });

  test("GET /v1/models lists logical models", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]));
    const res = await fetch(`${baseUrl}/v1/models`);
    const body: any = await res.json();
    expect(body.data.map((m: any) => m.id)).toContain("kaali-fast");
  });

  test("GET /health and /health/providers", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]));
    const h: any = await (await fetch(`${baseUrl}/health`)).json();
    expect(h.status).toBe("ok");
    expect(h.providers.p1).toBe("HEALTHY");
    const hp: any = await (await fetch(`${baseUrl}/health/providers`)).json();
    expect(hp[0].name).toBe("p1");
    expect(hp[0].circuit).toBe("CLOSED");
  });

  test("GET /metrics exposes prometheus counters", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]));
    await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }] }),
    });
    const text = await (await fetch(`${baseUrl}/metrics`)).text();
    expect(text).toContain("gateway_requests_total");
  });

  test("auth enforced when REQUIRE_AUTH=true", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]), {
      requireAuth: true,
      gatewayApiKeys: ["secret-key"],
    });
    const noKey = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kaali-fast", messages: [] }),
    });
    expect(noKey.status).toBe(401);
    const withKey = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": "secret-key" },
      body: JSON.stringify({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(withKey.status).toBe(200);
  });

  test("invalid body → 400", async () => {
    await start(new Map([["p1", new MockProvider("p1")]]));
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });
});
