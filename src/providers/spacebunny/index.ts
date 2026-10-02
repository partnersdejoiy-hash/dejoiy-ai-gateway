import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

/**
 * Space Bunny provider. Base URL is fully configurable via SPACE_BUNNY_URL —
 * no endpoint is assumed. If the URL is not configured, the provider reports
 * UNAVAILABLE on health checks instead of failing at construction.
 */
export function createSpacebunnyProvider(cfg: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    name: "spacebunny",
    baseUrl: cfg.url || "http://127.0.0.1:9/unconfigured",
    apiKey: cfg.apiKey,
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    capabilities: { contextLength: 65536, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
  });
}
