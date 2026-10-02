/**
 * Priority request queue with concurrency limiting.
 * Absorbs bursty load (e.g. 24 workers firing at once) and sheds excess.
 */
import { RequestPriority } from "../types.js";
export interface QueueOptions {
    maxSize: number;
    timeoutMs: number;
    maxConcurrency: number;
}
export declare class RequestQueue {
    private opts;
    private waiting;
    private active;
    constructor(opts: QueueOptions);
    getLength(): number;
    getActiveCount(): number;
    enqueue<T>(priority: RequestPriority, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T>;
    private pump;
}
