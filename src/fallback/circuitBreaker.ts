/**
 * Per-provider circuit breaker: CLOSED → OPEN → HALF_OPEN → CLOSED/OPEN.
 */
import type { CircuitBreakerState, CircuitState } from "../types.js";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  successThreshold: number;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private openedAt: number | null = null;
  private onChange?: (s: CircuitBreakerState) => void;

  constructor(
    private provider: string,
    private opts: CircuitBreakerOptions,
  ) {}

  onStateChange(cb: (s: CircuitBreakerState) => void): void {
    this.onChange = cb;
  }

  private emit(): void {
    this.onChange?.(this.getState());
  }

  canExecute(): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "HALF_OPEN") return true; // single trial in flight is managed by caller
    // OPEN: allow trial after cooldown
    if (
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.opts.cooldownMs
    ) {
      this.state = "HALF_OPEN";
      this.consecutiveSuccesses = 0;
      this.emit();
      return true;
    }
    return false;
  }

  recordSuccess(): void {
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

  recordFailure(): void {
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

  forceOpen(): void {
    this.open();
  }

  forceClosed(): void {
    this.close();
  }

  private open(): void {
    if (this.state !== "OPEN") {
      this.state = "OPEN";
      this.openedAt = Date.now();
      this.emit();
    }
  }

  private close(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.openedAt = null;
    this.emit();
  }

  getState(): CircuitBreakerState {
    return {
      provider: this.provider,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureAt: this.openedAt ?? 0,
      openedAt: this.openedAt ?? 0,
    };
  }
}
