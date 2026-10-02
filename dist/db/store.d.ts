import type { RequestLog } from "../types.js";
export declare function hashKey(key: string): string;
export declare class RequestStore {
    private db;
    constructor(dbPath: string);
    private safe;
    logRequest(l: RequestLog): void;
    logFailover(requestId: string, fromProvider: string | null, toProvider: string, reason: string): void;
    recordUsage(provider: string, tokens: number): void;
    logHealthCheck(provider: string, state: string, latencyMs: number, message?: string): void;
    recordCircuitState(provider: string, state: string, consecutiveFailures: number, openedAt: number | null): void;
    close(): void;
}
