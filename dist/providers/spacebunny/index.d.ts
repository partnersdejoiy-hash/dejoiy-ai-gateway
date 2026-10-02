import type { ProviderConfig } from "../../config.js";
import type { AIProvider } from "../../types.js";
/**
 * Space Bunny provider. Base URL is fully configurable via SPACE_BUNNY_URL —
 * no endpoint is assumed. If the URL is not configured, the provider reports
 * UNAVAILABLE on health checks instead of failing at construction.
 */
export declare function createSpacebunnyProvider(cfg: ProviderConfig): AIProvider;
