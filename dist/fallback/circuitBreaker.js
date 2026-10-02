"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = void 0;
class CircuitBreaker {
    provider;
    opts;
    state = "CLOSED";
    consecutiveFailures = 0;
    consecutiveSuccesses = 0;
    openedAt = null;
    onChange;
    constructor(provider, opts) {
        this.provider = provider;
        this.opts = opts;
    }
    onStateChange(cb) {
        this.onChange = cb;
    }
    emit() {
        this.onChange?.(this.getState());
    }
    canExecute() {
        if (this.state === "CLOSED")
            return true;
        if (this.state === "HALF_OPEN")
            return true; // single trial in flight is managed by caller
        // OPEN: allow trial after cooldown
        if (this.openedAt !== null &&
            Date.now() - this.openedAt >= this.opts.cooldownMs) {
            this.state = "HALF_OPEN";
            this.consecutiveSuccesses = 0;
            this.emit();
            return true;
        }
        return false;
    }
    recordSuccess() {
        if (this.state === "HALF_OPEN") {
            this.consecutiveSuccesses++;
            if (this.consecutiveSuccesses >= this.opts.successThreshold) {
                this.close();
            }
            return;
        }
        this.consecutiveFailures = 0;
        if (this.state !== "CLOSED") {
            this.close();
        }
    }
    recordFailure() {
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        if (this.state === "HALF_OPEN") {
            this.open();
            return;
        }
        if (this.consecutiveFailures >= this.opts.failureThreshold) {
            this.open();
        }
    }
    forceOpen() {
        this.open();
    }
    forceClosed() {
        this.close();
    }
    open() {
        if (this.state !== "OPEN") {
            this.state = "OPEN";
            this.openedAt = Date.now();
            this.emit();
        }
    }
    close() {
        this.state = "CLOSED";
        this.consecutiveFailures = 0;
        this.consecutiveSuccesses = 0;
        this.openedAt = null;
        this.emit();
    }
    getState() {
        return {
            provider: this.provider,
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            lastFailureAt: this.openedAt ?? 0,
            openedAt: this.openedAt ?? 0,
        };
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=circuitBreaker.js.map