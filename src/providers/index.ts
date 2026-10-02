/**
 * Provider factory — constructs every enabled provider from gateway config.
 * A misconfigured provider is skipped (warn) instead of crashing the gateway.
 */
import type { AIProvider } from "../types.js";
import type { GatewayConfig, ProviderKey } from "../config.js";
import { createVllmProvider } from "./vllm/index.js";
import { createLlamacppProvider } from "./llamacpp/index.js";
import { createLocalaiProvider } from "./localai/index.js";
import { createSglangProvider } from "./sglang/index.js";
import { createTgiProvider } from "./tgi/index.js";
import { createKoboldcppProvider } from "./koboldcpp/index.js";
import { createSpacebunnyProvider } from "./spacebunny/index.js";
import { createGeminiProvider } from "./gemini/index.js";
import { createGroqProvider } from "./groq/index.js";
import { createOpenrouterProvider } from "./openrouter/index.js";
import { createCerebrasProvider } from "./cerebras/index.js";

export const ALL_PROVIDER_KEYS: ProviderKey[] = [
  "vllm",
  "llamacpp",
  "localai",
  "sglang",
  "tgi",
  "koboldcpp",
  "spacebunny",
  "gemini",
  "groq",
  "openrouter",
  "cerebras",
];

const FACTORIES: Record<ProviderKey, (cfg: GatewayConfig["providers"][ProviderKey]) => AIProvider> = {
  vllm: createVllmProvider,
  llamacpp: createLlamacppProvider,
  localai: createLocalaiProvider,
  sglang: createSglangProvider,
  tgi: createTgiProvider,
  koboldcpp: createKoboldcppProvider,
  spacebunny: createSpacebunnyProvider,
  gemini: createGeminiProvider,
  groq: createGroqProvider,
  openrouter: createOpenrouterProvider,
  cerebras: createCerebrasProvider,
};

export function createProviders(config: GatewayConfig): Map<string, AIProvider> {
  const map = new Map<string, AIProvider>();
  for (const key of ALL_PROVIDER_KEYS) {
    const pcfg = config.providers[key];
    if (!pcfg?.enabled) continue;
    try {
      const provider = FACTORIES[key](pcfg);
      map.set(key, provider);
      console.log(`[providers] enabled: ${key} (model=${pcfg.model})`);
    } catch (err) {
      console.warn(
        `[providers] skipping ${key}: ${(err as Error).message}`,
      );
    }
  }
  return map;
}
