import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

/** Google Gemini via its OpenAI-compatible endpoint. */
export function createGeminiProvider(cfg: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    name: "gemini",
    baseUrl: cfg.url,
    apiKey: cfg.apiKey,
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    capabilities: { contextLength: 1048576, vision: true, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
  });
}
