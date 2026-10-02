"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthMonitor = void 0;
const RECOVERING = {
    state: "RECOVERING",
    latencyMs: 0,
    modelLoaded: false,
    activeRequests: 0,
    queueLength: 0,
    errorRate: 0,
    lastCheckAt: 0,
    message: "waiting for first check",
};
class HealthMonitor {
    providers;
    opts;
    statuses = new Map();
    draining = new Set();
    timer = null;
    stopped = false;
    constructor(providers, opts) {
        this.providers = providers;
        this.opts = opts;
        for (const name of providers.keys()) {
            this.statuses.set(name, { ...RECOVERING });
        }
    }
    start() {
        if (this.timer)
            return;
        this.stopped = false;
        // stagger initial checks so we don't hammer everything at once
        let i = 0;
        for (const name of this.providers.keys()) {
            const delay = i * 400;
            setTimeout(() => {
                if (!this.stopped)
                    void this.checkOne(name);
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
    stop() {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    setDraining(name, draining) {
        if (draining)
            this.draining.add(name);
        else
            this.draining.delete(name);
    }
    isDraining(name) {
        return this.draining.has(name);
    }
    getStatus(name) {
        const s = this.statuses.get(name);
        if (!s)
            return undefined;
        if (this.draining.has(name))
            return { ...s, state: "DRAINING" };
        return s;
    }
    getAllStatuses() {
        const out = new Map();
        for (const [name, s] of this.statuses) {
            out.set(name, this.draining.has(name) ? { ...s, state: "DRAINING" } : s);
        }
        return out;
    }
    async checkOne(name) {
        const provider = this.providers.get(name);
        if (!provider)
            return;
        try {
            const status = await provider.healthCheck();
            this.statuses.set(name, status);
            this.opts.onUpdate?.(name, status);
        }
        catch (err) {
            const status = {
                state: "UNAVAILABLE",
                latencyMs: 0,
                modelLoaded: false,
                activeRequests: 0,
                queueLength: 0,
                errorRate: 1,
                lastCheckAt: Date.now(),
                message: err.message?.slice(0, 200),
            };
            this.statuses.set(name, status);
            this.opts.onUpdate?.(name, status);
        }
    }
}
exports.HealthMonitor = HealthMonitor;
//# sourceMappingURL=monitor.js.map