export declare function isRetryable(err: unknown): boolean;
export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs?: number;
}
export declare function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs?: number): number;
export declare function sleep(ms: number): Promise<void>;
/**
 * Run fn, retrying on retryable errors with exponential backoff + jitter.
 * Non-retryable errors are rethrown immediately.
 */
export declare function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T>;
