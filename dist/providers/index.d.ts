/**
 * Provider factory — constructs every enabled provider from gateway config.
 * A misconfigured provider is skipped (warn) instead of crashing the gateway.
 */
import type { AIProvider } from "../types.js";
import type { GatewayConfig, ProviderKey } from "../config.js";
export declare const ALL_PROVIDER_KEYS: ProviderKey[];
export declare function createProviders(config: GatewayConfig): Map<string, AIProvider>;
