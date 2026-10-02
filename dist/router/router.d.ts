/**
 * ModelRouter — the heart of the DEJOIY AI Gateway.
 *
 * Pipeline per request:
 *   1. resolve logical model → ordered provider candidates
 *   2. filter by capability compatibility
 *   3. score candidates (health × latency × capacity × weight − errorRate)
 *   4. execute in score order with queue + retry + circuit breaker
 *   5. on total failure, walk the model's fallbackChain
 *
 * Bots never see raw provider errors — only normalized ProviderError.
 */
import { AIChunk, AIProvider, AIResponse, ChatRequest, CircuitState, HealthStatus } from "../types.js";
import type { GatewayConfig } from "../config.js";
export interface ProviderStatusInfo {
    name: string;
    enabled: boolean;
    health: HealthStatus;
    circuit: CircuitState;
    score: number;
    activeRequests: number;
    totalRequests: number;
    totalErrors: number;
    draining: boolean;
}
export declare class ModelRouter {
    private providers;
    private config;
    private registry;
    private monitor;
    private breakers;
    private queue;
    private metrics;
    private store;
    private activeRequests;
    private totalRequests;
    private totalErrors;
    private recentOutcomes;
    private capsCache;
    private scores;
    constructor(providers: Map<string, AIProvider>, config: GatewayConfig);
    start(): void;
    stop(): Promise<void>;
    setProviderDraining(name: string, draining: boolean): void;
    chat(request: ChatRequest): Promise<AIResponse>;
    stream(request: ChatRequest): AsyncIterable<AIChunk>;
    getProviderStatuses(): ProviderStatusInfo[];
    getMetricsText(): Promise<string>;
    private tryCandidates;
    private executeChat;
    private executeStream;
    private finalize;
    private scoreCandidates;
    private requiredCapabilities;
    private satisfies;
    private getCapabilities;
    private recordOutcome;
    private errorRate;
    private bumpActive;
    private log;
}
