/**
 * Priority request queue with concurrency limiting.
 * Absorbs bursty load (e.g. 24 workers firing at once) and sheds excess.
 */
import { ProviderError, RequestPriority } from "../types.js";

const PRIORITY_ORDER: Record<RequestPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

interface QueueEntry<T> {
  priority: RequestPriority;
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  enqueuedAt: number;
  signal?: AbortSignal;
}

export interface QueueOptions {
  maxSize: number;
  timeoutMs: number;
  maxConcurrency: number;
}

export class RequestQueue {
  private waiting: QueueEntry<unknown>[] = [];
  private active = 0;

  constructor(private opts: QueueOptions) {}

  getLength(): number {
    return this.waiting.length;
  }

  getActiveCount(): number {
    return this.active;
  }

  enqueue<T>(
    priority: RequestPriority,
    signal: AbortSignal | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(
        new ProviderError("", "INVALID_REQUEST", false, "request aborted before queue"),
      );
    }
    if (this.waiting.length >= this.opts.maxSize) {
      return Promise.reject(
        new ProviderError("", "PROVIDER_OVERLOADED", true, "gateway queue full"),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry<T> = {
        priority,
        fn,
        resolve: resolve as (v: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
        signal,
      };
      // insert sorted by priority (stable FIFO within a level)
      let idx = this.waiting.length;
      for (let i = 0; i < this.waiting.length; i++) {
        if (
          PRIORITY_ORDER[this.waiting[i].priority] > PRIORITY_ORDER[priority]
        ) {
          idx = i;
          break;
        }
      }
      this.waiting.splice(idx, 0, entry as QueueEntry<unknown>);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            const at = this.waiting.indexOf(entry as QueueEntry<unknown>);
            if (at >= 0) {
              this.waiting.splice(at, 1);
              reject(
                new ProviderError("", "INVALID_REQUEST", false, "request aborted in queue"),
              );
            }
          },
          { once: true },
        );
      }
      // queue-wait timeout
      setTimeout(() => {
        const at = this.waiting.indexOf(entry as QueueEntry<unknown>);
        if (at >= 0) {
          this.waiting.splice(at, 1);
          reject(
            new ProviderError("", "PROVIDER_TIMEOUT", true, "queue wait timeout"),
          );
        }
      }, this.opts.timeoutMs).unref?.();
      this.pump();
    });
  }

  private pump(): void {
    while (this.active < this.opts.maxConcurrency && this.waiting.length > 0) {
      const entry = this.waiting.shift()!;
      this.active++;
      void (async () => {
        try {
          const result = await entry.fn();
          entry.resolve(result);
        } catch (err) {
          entry.reject(err);
        } finally {
          this.active--;
          this.pump();
        }
      })();
    }
  }
}
