export declare class GatewayMetrics {
    private registry;
    private requests;
    private failovers;
    private latency;
    private tokens;
    private providerHealthy;
    private queueLength;
    private activeRequests;
    constructor();
    observeRequest(provider: string, model: string, status: "success" | "failed", latencyMs: number): void;
    observeFailover(fromProvider: string, toProvider: string, reason: string): void;
    setProviderHealth(provider: string, healthy: number): void;
    setQueueLength(n: number): void;
    setActiveRequests(n: number): void;
    observeTokens(provider: string, prompt: number, completion: number): void;
    getPrometheusText(): Promise<string>;
}
