/**
 * Unit tests: priority queue.
 */
import { RequestQueue } from "../../src/queue/queue.js";
import { ProviderError } from "../../src/types.js";

describe("RequestQueue", () => {
  test("executes immediately when under concurrency limit", async () => {
    const q = new RequestQueue({ maxSize: 10, timeoutMs: 5000, maxConcurrency: 2 });
    const result = await q.enqueue("NORMAL", undefined, async () => 42);
    expect(result).toBe(42);
  });

  test("respects priority order", async () => {
    const q = new RequestQueue({ maxSize: 10, timeoutMs: 5000, maxConcurrency: 1 });
    const order: string[] = [];
    // occupy the single slot
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = q.enqueue("NORMAL", undefined, () => gate.then(() => "first"));
    // queue these while blocked
    const low = q.enqueue("LOW", undefined, async () => { order.push("low"); return "low"; });
    const crit = q.enqueue("CRITICAL", undefined, async () => { order.push("critical"); return "critical"; });
    const high = q.enqueue("HIGH", undefined, async () => { order.push("high"); return "high"; });
    release();
    await first;
    await Promise.all([low, crit, high]);
    expect(order).toEqual(["critical", "high", "low"]);
  });

  test("rejects when queue is full", async () => {
    const q = new RequestQueue({ maxSize: 1, timeoutMs: 5000, maxConcurrency: 1 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = q.enqueue("NORMAL", undefined, () => gate);
    const second = q.enqueue("NORMAL", undefined, async () => "second");
    await expect(q.enqueue("NORMAL", undefined, async () => "third")).rejects.toMatchObject({
      code: "PROVIDER_OVERLOADED",
    });
    release();
    await first;
    await second;
  });

  test("queue wait timeout", async () => {
    const q = new RequestQueue({ maxSize: 10, timeoutMs: 80, maxConcurrency: 1 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = q.enqueue("NORMAL", undefined, () => gate);
    await expect(q.enqueue("NORMAL", undefined, async () => "x")).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
    release();
    await first;
  });

  test("propagates task errors", async () => {
    const q = new RequestQueue({ maxSize: 10, timeoutMs: 5000, maxConcurrency: 1 });
    const boom = new ProviderError("p", "PROVIDER_UNAVAILABLE", true, "boom");
    await expect(q.enqueue("NORMAL", undefined, async () => { throw boom; })).rejects.toBe(boom);
    // queue still usable afterwards
    expect(await q.enqueue("NORMAL", undefined, async () => "ok")).toBe("ok");
  });
});
