import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

export function createSglangProvider(cfg: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    name: "sglang",
    baseUrl: cfg.url,
    apiKey: cfg.apiKey,
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    capabilities: { contextLength: 131072, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
  });
}
