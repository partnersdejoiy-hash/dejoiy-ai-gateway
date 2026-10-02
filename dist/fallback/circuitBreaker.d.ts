/**
 * Per-provider circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN.
 */
import type { CircuitBreakerState } from "../types.js";
export interface CircuitBreakerOptions {
    failureThreshold: number;
    cooldownMs: number;
    successThreshold: number;
}
export declare class CircuitBreaker {
    private provider;
    private opts;
    private state;
    private consecutiveFailures;
    private consecutiveSuccesses;
    private openedAt;
    private onChange?;
    constructor(provider: string, opts: CircuitBreakerOptions);
    onStateChange(cb: (s: CircuitBreakerState) => void): void;
    private emit;
    canExecute(): boolean;
    recordSuccess(): void;
    recordFailure(): void;
    forceOpen(): void;
    forceClosed(): void;
    private open;
    private close;
    getState(): CircuitBreakerState;
}
