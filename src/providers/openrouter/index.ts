import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
import { OpenAICompatibleProvider } from "../base.js";

export function createOpenrouterProvider(cfg: ProviderConfig): AIProvider {
  return new OpenAICompatibleProvider({
    name: "openrouter",
    baseUrl: cfg.url,
    apiKey: cfg.apiKey,
    defaultModel: cfg.model,
    timeoutMs: cfg.timeoutMs,
    extraHeaders: {
      "HTTP-Referer": "https://dejoiy.ai",
      "X-Title": "DEJOIY AI Gateway",
    },
    capabilities: { contextLength: 131072, vision: true, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
  });
}
