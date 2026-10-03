import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

/**
 * Pollinations.ai — free, keyless OpenAI-compatible text API.
 * No signup, no API key, generous anonymous rate limits.
 * Used as the last-resort failover so the gateway never goes fully dark.
 * Docs: https://github.com/pollinations/pollinations
 */
export function createPollinationsProvider(cfg: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    name: "pollinations",
    baseUrl: cfg.url,
    apiKey: undefined, // keyless by design
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    capabilities: {
      contextLength: 32768,
      vision: false,
      toolCalling: false,
      jsonMode: true,
      streaming: true,
      maxOutputTokens: 4096,
    },
  });
}
