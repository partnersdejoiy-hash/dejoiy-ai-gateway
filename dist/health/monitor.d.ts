/**
 * Continuous per-provider health monitoring.
 */
import type { AIProvider, HealthStatus } from "../types.js";
export interface HealthMonitorOptions {
    intervalMs: number;
    timeoutMs: number;
    onUpdate?: (name: string, status: HealthStatus) => void;
}
export declare class HealthMonitor {
    private providers;
    private opts;
    private statuses;
    private draining;
    private timer;
    private stopped;
    constructor(providers: Map<string, AIProvider>, opts: HealthMonitorOptions);
    start(): void;
    stop(): void;
    setDraining(name: string, draining: boolean): void;
    isDraining(name: string): boolean;
    getStatus(name: string): HealthStatus | undefined;
    getAllStatuses(): Map<string, HealthStatus>;
    private checkOne;
}
