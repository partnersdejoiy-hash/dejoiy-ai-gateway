/**
 * Prometheus metrics via prom-client (dedicated registry per instance).
 */
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

export class GatewayMetrics {
  private registry = new Registry();
  private requests: Counter<string>;
  private failovers: Counter<string>;
  private latency: Histogram<string>;
  private tokens: Counter<string>;
  private providerHealthy: Gauge<string>;
  private queueLength: Gauge<string>;
  private activeRequests: Gauge<string>;

  constructor() {
    this.requests = new Counter({
      name: "gateway_requests_total",
      help: "Total chat requests by provider/model/status",
      labelNames: ["provider", "model", "status"],
      registers: [this.registry],
    });
    this.failovers = new Counter({
      name: "gateway_failovers_total",
      help: "Failovers between providers",
      labelNames: ["from_provider", "to_provider", "reason"],
      registers: [this.registry],
    });
    this.latency = new Histogram({
      name: "gateway_request_latency_seconds",
      help: "Request latency in seconds",
      labelNames: ["provider"],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });
    this.tokens = new Counter({
      name: "gateway_tokens_total",
      help: "Tokens processed",
      labelNames: ["provider", "type"],
      registers: [this.registry],
    });
    this.providerHealthy = new Gauge({
      name: "gateway_provider_healthy",
      help: "1 if provider is routable, 0 otherwise",
      labelNames: ["provider"],
      registers: [this.registry],
    });
    this.queueLength = new Gauge({
      name: "gateway_queue_length",
      help: "Current queue length",
      registers: [this.registry],
    });
    this.activeRequests = new Gauge({
      name: "gateway_active_requests",
      help: "Currently executing requests",
      registers: [this.registry],
    });
  }

  observeRequest(
    provider: string,
    model: string,
    status: "success" | "failed",
    latencyMs: number,
  ): void {
    this.requests.inc({ provider, model, status });
    this.latency.observe({ provider }, latencyMs / 1000);
  }

  observeFailover(fromProvider: string, toProvider: string, reason: string): void {
    this.failovers.inc({
      from_provider: fromProvider || "none",
      to_provider: toProvider,
      reason,
    });
  }

  setProviderHealth(provider: string, healthy: number): void {
    this.providerHealthy.set({ provider }, healthy);
  }

  setQueueLength(n: number): void {
    this.queueLength.set(n);
  }

  setActiveRequests(n: number): void {
    this.activeRequests.set(n);
  }

  observeTokens(provider: string, prompt: number, completion: number): void {
    if (prompt > 0) this.tokens.inc({ provider, type: "prompt" }, prompt);
    if (completion > 0) this.tokens.inc({ provider, type: "completion" }, completion);
  }

  async getPrometheusText(): Promise<string> {
    return this.registry.metrics();
  }
}
