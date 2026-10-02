import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

export function createKoboldcppProvider(cfg: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    name: "koboldcpp",
    baseUrl: cfg.url,
    apiKey: cfg.apiKey,
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    capabilities: { contextLength: 32768, vision: false, toolCalling: false, jsonMode: false, streaming: true, maxOutputTokens: 4096 },
  });
}
