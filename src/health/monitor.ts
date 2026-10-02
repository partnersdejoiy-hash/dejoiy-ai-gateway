/**
 * Continuous per-provider health monitoring.
 */
import type { AIProvider, HealthStatus } from "../types.js";

export interface HealthMonitorOptions {
  intervalMs: number;
  timeoutMs: number;
  onUpdate?: (name: string, status: HealthStatus) => void;
}

const RECOVERING: HealthStatus = {
  state: "RECOVERING",
  latencyMs: 0,
  modelLoaded: false,
  activeRequests: 0,
  queueLength: 0,
  errorRate: 0,
  lastCheckAt: 0,
  message: "waiting for first check",
};

export class HealthMonitor {
  private statuses = new Map<string, HealthStatus>();
  private draining = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private providers: Map<string, AIProvider>,
    private opts: HealthMonitorOptions,
  ) {
    for (const name of providers.keys()) {
      this.statuses.set(name, { ...RECOVERING });
    }
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    // stagger initial checks so we don't hammer everything at once
    let i = 0;
    for (const name of this.providers.keys()) {
      const delay = i * 400;
      setTimeout(() => {
        if (!this.stopped) void this.checkOne(name);
      }, delay);
      i++;
    }
    this.timer = setInterval(() => {
      for (const name of this.providers.keys()) {
        void this.checkOne(name);
      }
    }, this.opts.intervalMs);
    // don't keep the process alive just for health checks
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setDraining(name: string, draining: boolean): void {
    if (draining) this.draining.add(name);
    else this.draining.delete(name);
  }

  isDraining(name: string): boolean {
    return this.draining.has(name);
  }

  getStatus(name: string): HealthStatus | undefined {
    const s = this.statuses.get(name);
    if (!s) return undefined;
    if (this.draining.has(name)) return { ...s, state: "DRAINING" };
    return s;
  }

  getAllStatuses(): Map<string, HealthStatus> {
    const out = new Map<string, HealthStatus>();
    for (const [name, s] of this.statuses) {
      out.set(name, this.draining.has(name) ? { ...s, state: "DRAINING" } : s);
    }
    return out;
  }

  private async checkOne(name: string): Promise<void> {
    const provider = this.providers.get(name);
    if (!provider) return;
    try {
      const status = await provider.healthCheck();
      this.statuses.set(name, status);
      this.opts.onUpdate?.(name, status);
    } catch (err) {
      const status: HealthStatus = {
        state: "UNAVAILABLE",
        latencyMs: 0,
        modelLoaded: false,
        activeRequests: 0,
        queueLength: 0,
        errorRate: 1,
        lastCheckAt: Date.now(),
        message: (err as Error).message?.slice(0, 200),
      };
      this.statuses.set(name, status);
      this.opts.onUpdate?.(name, status);
    }
  }
}
