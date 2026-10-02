/**
 * Unit tests: provider adapters + error normalization (fetch mocked).
 */
import { OpenAICompatibleProvider, normalizeError } from "../../src/providers/base.js";
import { createGroqProvider } from "../../src/providers/groq/index.js";
import { createOpenrouterProvider } from "../../src/providers/openrouter/index.js";
import { ProviderError } from "../../src/types.js";
import type { ProviderConfig } from "../../src/config.js";

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  enabled: true,
  url: "http://localhost:9999/v1",
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 5000,
  weight: 1,
  ...over,
});

function mockFetchOnce(status: number, body: unknown) {
  const mock = jest.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  return mock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("normalizeError", () => {
  test("401 → AUTH_FAILED non-retryable", () => {
    const e = normalizeError("groq", new Error("x"), 401);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.code).toBe("AUTH_FAILED");
    expect(e.retryable).toBe(false);
  });
  test("429 → PROVIDER_RATE_LIMITED retryable", () => {
    const e = normalizeError("groq", new Error("x"), 429);
    expect(e.code).toBe("PROVIDER_RATE_LIMITED");
    expect(e.retryable).toBe(true);
  });
  test("503 → PROVIDER_OVERLOADED retryable", () => {
    const e = normalizeError("groq", new Error("x"), 503);
    expect(e.code).toBe("PROVIDER_OVERLOADED");
    expect(e.retryable).toBe(true);
  });
  test("connection refused → PROVIDER_UNAVAILABLE retryable", () => {
    const e = normalizeError("vllm", new TypeError("fetch failed"));
    expect(e.code).toBe("PROVIDER_UNAVAILABLE");
    expect(e.retryable).toBe(true);
  });
  test("400 → INVALID_REQUEST non-retryable", () => {
    const e = normalizeError("groq", new Error("bad"), 400);
    expect(e.code).toBe("INVALID_REQUEST");
    expect(e.retryable).toBe(false);
  });
});

describe("OpenAICompatibleProvider.chat", () => {
  test("maps OpenAI response to AIResponse", async () => {
    mockFetchOnce(200, {
      id: "chatcmpl-1",
      choices: [{ message: { content: "hello", tool_calls: undefined }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const p = new OpenAICompatibleProvider({
      name: "test", baseUrl: "http://x/v1", defaultModel: "m", timeoutMs: 5000,
    });
    const res = await p.chat({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }], _providerModel: "m" });
    expect(res.content).toBe("hello");
    expect(res.provider).toBe("test");
    expect(res.promptTokens).toBe(10);
    expect(res.finishReason).toBe("stop");
  });

  test("429 response → ProviderError retryable", async () => {
    mockFetchOnce(429, { error: { message: "slow down" } });
    const p = createGroqProvider(cfg());
    await expect(
      p.chat({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }], _providerModel: "m" }),
    ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true });
  });

  test("sends Bearer auth header when apiKey set", async () => {
    const spy = mockFetchOnce(200, {
      choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
    });
    const p = createOpenrouterProvider(cfg({ apiKey: "secret-123" }));
    await p.chat({ model: "kaali-fast", messages: [{ role: "user", content: "hi" }], _providerModel: "m" });
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer secret-123");
    expect(headers["X-Title"]).toBe("DEJOIY AI Gateway");
  });
});

describe("OpenAICompatibleProvider.stream", () => {
  test("parses SSE chunks and [DONE]", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      "data: [DONE]",
    ].join("\n");
    jest.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );
    const p = new OpenAICompatibleProvider({
      name: "test", baseUrl: "http://x/v1", defaultModel: "m", timeoutMs: 5000,
    });
    const deltas: string[] = [];
    let done = false;
    for await (const chunk of p.stream({
      model: "kaali-fast", messages: [{ role: "user", content: "hi" }], _providerModel: "m",
    })) {
      deltas.push(chunk.delta);
      if (chunk.done) done = true;
    }
    expect(deltas.join("")).toBe("Hello");
    expect(done).toBe(true);
  });
});

describe("healthCheck", () => {
  test("200 on /models → HEALTHY", async () => {
    mockFetchOnce(200, { data: [{ id: "m" }] });
    const p = new OpenAICompatibleProvider({
      name: "test", baseUrl: "http://x/v1", defaultModel: "m", timeoutMs: 5000,
    });
    const h = await p.healthCheck();
    expect(h.state).toBe("HEALTHY");
    expect(h.modelLoaded).toBe(true);
  });

  test("429 → RATE_LIMITED", async () => {
    mockFetchOnce(429, {});
    const p = new OpenAICompatibleProvider({
      name: "test", baseUrl: "http://x/v1", defaultModel: "m", timeoutMs: 5000,
    });
    const h = await p.healthCheck();
    expect(h.state).toBe("RATE_LIMITED");
  });

  test("connection failure → UNAVAILABLE", async () => {
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("fetch failed"));
    const p = new OpenAICompatibleProvider({
      name: "test", baseUrl: "http://x/v1", defaultModel: "m", timeoutMs: 5000,
    });
    const h = await p.healthCheck();
    expect(h.state).toBe("UNAVAILABLE");
  });
});
