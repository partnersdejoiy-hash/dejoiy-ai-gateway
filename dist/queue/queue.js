"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueue = void 0;
/**
 * Priority request queue with concurrency limiting.
 * Absorbs bursty load (e.g. 24 workers firing at once) and sheds excess.
 */
const types_js_1 = require("../types.js");
const PRIORITY_ORDER = {
    CRITICAL: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
};
class RequestQueue {
    opts;
    waiting = [];
    active = 0;
    constructor(opts) {
        this.opts = opts;
    }
    getLength() {
        return this.waiting.length;
    }
    getActiveCount() {
        return this.active;
    }
    enqueue(priority, signal, fn) {
        if (signal?.aborted) {
            return Promise.reject(new types_js_1.ProviderError("", "INVALID_REQUEST", false, "request aborted before queue"));
        }
        if (this.waiting.length >= this.opts.maxSize) {
            return Promise.reject(new types_js_1.ProviderError("", "PROVIDER_OVERLOADED", true, "gateway queue full"));
        }
        return new Promise((resolve, reject) => {
            const entry = {
                priority,
                fn,
                resolve: resolve,
                reject,
                enqueuedAt: Date.now(),
                signal,
            };
            // insert sorted by priority (stable FIFO within a level)
            let idx = this.waiting.length;
            for (let i = 0; i < this.waiting.length; i++) {
                if (PRIORITY_ORDER[this.waiting[i].priority] > PRIORITY_ORDER[priority]) {
                    idx = i;
                    break;
                }
            }
            this.waiting.splice(idx, 0, entry);
            if (signal) {
                signal.addEventListener("abort", () => {
                    const at = this.waiting.indexOf(entry);
                    if (at >= 0) {
                        this.waiting.splice(at, 1);
                        reject(new types_js_1.ProviderError("", "INVALID_REQUEST", false, "request aborted in queue"));
                    }
                }, { once: true });
            }
            // queue-wait timeout
            setTimeout(() => {
                const at = this.waiting.indexOf(entry);
                if (at >= 0) {
                    this.waiting.splice(at, 1);
                    reject(new types_js_1.ProviderError("", "PROVIDER_TIMEOUT", true, "queue wait timeout"));
                }
            }, this.opts.timeoutMs).unref?.();
            this.pump();
        });
    }
    pump() {
        while (this.active < this.opts.maxConcurrency && this.waiting.length > 0) {
            const entry = this.waiting.shift();
            this.active++;
            void (async () => {
                try {
                    const result = await entry.fn();
                    entry.resolve(result);
                }
                catch (err) {
                    entry.reject(err);
                }
                finally {
                    this.active--;
                    this.pump();
                }
            })();
        }
    }
}
exports.RequestQueue = RequestQueue;
//# sourceMappingURL=queue.js.map