/**
 * Retry helpers: exponential backoff with jitter for transient failures.
 */
import { ProviderError } from "../types.js";

export function isRetryable(err: unknown): boolean {
  return err instanceof ProviderError && err.retryable;
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
}

export function backoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs = 10000,
): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  // jitter: 50%–100% of the exponential delay
  return Math.floor(exp * (0.5 + Math.random() * 0.5));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run fn, retrying on retryable errors with exponential backoff + jitter.
 * Non-retryable errors are rethrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const maxDelay = opts.maxDelayMs ?? 10000;
  let lastError: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const canRetry = isRetryable(err);
      const isLast = attempt === opts.maxAttempts - 1;
      if (!canRetry || isLast) throw err;
      await sleep(backoffDelayMs(attempt, opts.baseDelayMs, maxDelay));
    }
  }
  throw lastError;
}
