import type { ProviderConfig } from "../../config.js";
import type { AIProvider, HealthStatus } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

/**
 * Space Bunny provider (spacebunnymodel.com).
 *
 * Space Bunny's hosted API does not implement GET /models (returns 404), so
 * the default OpenAI-compatible health probe always reports UNAVAILABLE.
 * This subclass overrides the health check with a minimal chat-completions
 * call instead — a tiny "ping" that costs a negligible number of tokens.
 *
 * Base URL is fully configurable via SPACE_BUNNY_URL. If the URL is not
 * configured, the provider reports UNAVAILABLE instead of failing at
 * construction.
 */
class SpaceBunnyProvider extends OpenAICompatibleProvider {
  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    // Unconfigured placeholder URL -> stay UNAVAILABLE without network I/O.
    if (this.baseUrl.includes("127.0.0.1:9")) {
      return {
        state: "UNAVAILABLE",
        latencyMs: 0,
        modelLoaded: false,
        activeRequests: 0,
        queueLength: 0,
        errorRate: 1,
        lastCheckAt: Date.now(),
      };
    }
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey
            ? { Authorization: `Bearer ${this.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(Math.min(this.timeoutMs, 10000)),
      });
      const latencyMs = Date.now() - started;
      if (res.status === 401 || res.status === 403) {
        return {
          state: "UNAVAILABLE",
          latencyMs,
          modelLoaded: false,
          activeRequests: 0,
          queueLength: 0,
          errorRate: 1,
          lastCheckAt: Date.now(),
        };
      }
      if (res.status === 429) {
        return {
          state: "RATE_LIMITED",
          latencyMs,
          modelLoaded: false,
          activeRequests: 0,
          queueLength: 0,
          errorRate: 1,
          lastCheckAt: Date.now(),
        };
      }
      if (!res.ok) {
        return {
          state: "UNAVAILABLE",
          latencyMs,
          modelLoaded: false,
          activeRequests: 0,
          queueLength: 0,
          errorRate: 1,
          lastCheckAt: Date.now(),
        };
      }
      return {
        state: "HEALTHY",
        latencyMs,
        modelLoaded: true,
        activeRequests: 0,
        queueLength: 0,
        errorRate: 0,
        lastCheckAt: Date.now(),
      };
    } catch {
      return {
        state: "UNAVAILABLE",
        latencyMs: Date.now() - started,
        modelLoaded: false,
        activeRequests: 0,
        queueLength: 0,
        errorRate: 1,
        lastCheckAt: Date.now(),
      };
    }
  }
}

export function createSpacebunnyProvider(cfg: ProviderConfig): AIProvider {
  return new SpaceBunnyProvider({
    name: "spacebunny",
    baseUrl: cfg.url || "http://127.0.0.1:9/unconfigured",
    apiKey: cfg.apiKey,
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    capabilities: { contextLength: 65536, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
  });
}
