/**
 * Unit tests: circuit breaker state machine.
 */
import { CircuitBreaker } from "../../src/fallback/circuitBreaker.js";

describe("CircuitBreaker", () => {
  test("starts CLOSED and allows execution", () => {
    const cb = new CircuitBreaker("p", { failureThreshold: 3, cooldownMs: 1000, successThreshold: 1 });
    expect(cb.getState().state).toBe("CLOSED");
    expect(cb.canExecute()).toBe(true);
  });

  test("opens after threshold consecutive failures", () => {
    const cb = new CircuitBreaker("p", { failureThreshold: 3, cooldownMs: 60000, successThreshold: 1 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.getState().state).toBe("OPEN");
    expect(cb.canExecute()).toBe(false);
  });

  test("success resets failure count", () => {
    const cb = new CircuitBreaker("p", { failureThreshold: 3, cooldownMs: 60000, successThreshold: 1 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe("CLOSED");
  });

  test("half-open after cooldown, closes on success", async () => {
    const cb = new CircuitBreaker("p", { failureThreshold: 2, cooldownMs: 50, successThreshold: 1 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState().state).toBe("OPEN");
    await new Promise((r) => setTimeout(r, 70));
    expect(cb.canExecute()).toBe(true);
    expect(cb.getState().state).toBe("HALF_OPEN");
    cb.recordSuccess();
    expect(cb.getState().state).toBe("CLOSED");
  });

  test("half-open failure re-opens", async () => {
    const cb = new CircuitBreaker("p", { failureThreshold: 2, cooldownMs: 50, successThreshold: 1 });
    cb.recordFailure();
    cb.recordFailure();
    await new Promise((r) => setTimeout(r, 70));
    cb.canExecute();
    cb.recordFailure();
    expect(cb.getState().state).toBe("OPEN");
  });

  test("emits state changes", () => {
    const states: string[] = [];
    const cb = new CircuitBreaker("p", { failureThreshold: 1, cooldownMs: 60000, successThreshold: 1 });
    cb.onStateChange((s) => states.push(s.state));
    cb.recordFailure();
    expect(states).toEqual(["OPEN"]);
  });
});
