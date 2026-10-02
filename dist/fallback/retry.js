"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRetryable = isRetryable;
exports.backoffDelayMs = backoffDelayMs;
exports.sleep = sleep;
exports.withRetry = withRetry;
/**
 * Retry helpers: exponential backoff with jitter for transient failures.
 */
const types_js_1 = require("../types.js");
function isRetryable(err) {
    return err instanceof types_js_1.ProviderError && err.retryable;
}
function backoffDelayMs(attempt, baseDelayMs, maxDelayMs = 10000) {
    const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    // jitter: 50%–100% of the exponential delay
    return Math.floor(exp * (0.5 + Math.random() * 0.5));
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Run fn, retrying on retryable errors with exponential backoff + jitter.
 * Non-retryable errors are rethrown immediately.
 */
async function withRetry(fn, opts) {
    const maxDelay = opts.maxDelayMs ?? 10000;
    let lastError;
    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            const canRetry = isRetryable(err);
            const isLast = attempt === opts.maxAttempts - 1;
            if (!canRetry || isLast)
                throw err;
            await sleep(backoffDelayMs(attempt, opts.baseDelayMs, maxDelay));
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry.js.map