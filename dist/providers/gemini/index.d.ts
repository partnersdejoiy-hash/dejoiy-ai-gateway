import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
/** Google Gemini via its OpenAI-compatible endpoint. */
export declare function createGeminiProvider(cfg: ProviderConfig): AIProvider;
