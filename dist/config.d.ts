/**
 * Environment-based configuration for the DEJOIY AI Gateway.
 * Every setting comes from env vars — no secrets are ever hard-coded.
 */
import type { LogicalModelMapping } from "./types.js";
export interface ProviderConfig {
    enabled: boolean;
    url: string;
    apiKey?: string;
    model: string;
    timeoutMs: number;
    weight: number;
}
export type ProviderKey = "vllm" | "llamacpp" | "localai" | "sglang" | "tgi" | "koboldcpp" | "spacebunny" | "gemini" | "groq" | "openrouter" | "cerebras";
export declare const PROVIDER_KEYS: ProviderKey[];
export interface GatewayConfig {
    port: number;
    host: string;
    requireAuth: boolean;
    gatewayApiKeys: string[];
    rateLimitPerMinute: number;
    requestTimeoutMs: number;
    healthCheckIntervalMs: number;
    healthCheckTimeoutMs: number;
    circuitBreakerFailureThreshold: number;
    circuitBreakerCooldownMs: number;
    circuitBreakerSuccessThreshold: number;
    maxQueueSize: number;
    queueTimeoutMs: number;
    maxConcurrency: number;
    dbPath: string;
    logicalModels: LogicalModelMapping[];
    providers: Record<ProviderKey, ProviderConfig>;
}
export declare function loadConfig(env?: NodeJS.ProcessEnv): GatewayConfig;
/** Safe summary for startup logging — never includes secrets. */
export declare function configSummary(config: GatewayConfig): Record<string, unknown>;
