"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayMetrics = void 0;
/**
 * Prometheus metrics via prom-client (dedicated registry per instance).
 */
const prom_client_1 = require("prom-client");
class GatewayMetrics {
    registry = new prom_client_1.Registry();
    requests;
    failovers;
    latency;
    tokens;
    providerHealthy;
    queueLength;
    activeRequests;
    constructor() {
        this.requests = new prom_client_1.Counter({
            name: "gateway_requests_total",
            help: "Total chat requests by provider/model/status",
            labelNames: ["provider", "model", "status"],
            registers: [this.registry],
        });
        this.failovers = new prom_client_1.Counter({
            name: "gateway_failovers_total",
            help: "Failovers between providers",
            labelNames: ["from_provider", "to_provider", "reason"],
            registers: [this.registry],
        });
        this.latency = new prom_client_1.Histogram({
            name: "gateway_request_latency_seconds",
            help: "Request latency in seconds",
            labelNames: ["provider"],
            buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
            registers: [this.registry],
        });
        this.tokens = new prom_client_1.Counter({
            name: "gateway_tokens_total",
            help: "Tokens processed",
            labelNames: ["provider", "type"],
            registers: [this.registry],
        });
        this.providerHealthy = new prom_client_1.Gauge({
            name: "gateway_provider_healthy",
            help: "1 if provider is routable, 0 otherwise",
            labelNames: ["provider"],
            registers: [this.registry],
        });
        this.queueLength = new prom_client_1.Gauge({
            name: "gateway_queue_length",
            help: "Current queue length",
            registers: [this.registry],
        });
        this.activeRequests = new prom_client_1.Gauge({
            name: "gateway_active_requests",
            help: "Currently executing requests",
            registers: [this.registry],
        });
    }
    observeRequest(provider, model, status, latencyMs) {
        this.requests.inc({ provider, model, status });
        this.latency.observe({ provider }, latencyMs / 1000);
    }
    observeFailover(fromProvider, toProvider, reason) {
        this.failovers.inc({
            from_provider: fromProvider || "none",
            to_provider: toProvider,
            reason,
        });
    }
    setProviderHealth(provider, healthy) {
        this.providerHealthy.set({ provider }, healthy);
    }
    setQueueLength(n) {
        this.queueLength.set(n);
    }
    setActiveRequests(n) {
        this.activeRequests.set(n);
    }
    observeTokens(provider, prompt, completion) {
        if (prompt > 0)
            this.tokens.inc({ provider, type: "prompt" }, prompt);
        if (completion > 0)
            this.tokens.inc({ provider, type: "completion" }, completion);
    }
    async getPrometheusText() {
        return this.registry.metrics();
    }
}
exports.GatewayMetrics = GatewayMetrics;
//# sourceMappingURL=metrics.js.map