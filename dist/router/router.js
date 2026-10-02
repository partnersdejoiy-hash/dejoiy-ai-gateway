"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRouter = void 0;
/**
 * ModelRouter — the heart of the DEJOIY AI Gateway.
 *
 * Pipeline per request:
 *   1. resolve logical model → ordered provider candidates
 *   2. filter by capability compatibility
 *   3. score candidates (health × latency × capacity × weight − errorRate)
 *   4. execute in score order with queue + retry + circuit breaker
 *   5. on total failure, walk the model's fallbackChain
 *
 * Bots never see raw provider errors — only normalized ProviderError.
 */
const types_js_1 = require("../types.js");
const circuitBreaker_js_1 = require("../fallback/circuitBreaker.js");
const retry_js_1 = require("../fallback/retry.js");
const monitor_js_1 = require("../health/monitor.js");
const registry_js_1 = require("../models/registry.js");
const queue_js_1 = require("../queue/queue.js");
const metrics_js_1 = require("../metrics/metrics.js");
const store_js_1 = require("../db/store.js");
const CONSERVATIVE_CAPS = {
    contextLength: 8192,
    vision: false,
    toolCalling: false,
    jsonMode: false,
    streaming: true,
    maxOutputTokens: 2048,
};
const HEALTH_FACTOR = {
    HEALTHY: 1,
    DEGRADED: 0.6,
    BUSY: 0.4,
    RECOVERING: 0.3,
    RATE_LIMITED: 0.1,
    UNAVAILABLE: 0,
    DRAINING: 0,
};
class ModelRouter {
    providers;
    config;
    registry;
    monitor;
    breakers = new Map();
    queue;
    metrics = new metrics_js_1.GatewayMetrics();
    store;
    activeRequests = new Map();
    totalRequests = new Map();
    totalErrors = new Map();
    recentOutcomes = new Map(); // rolling last 100
    capsCache = new Map();
    scores = new Map();
    constructor(providers, config) {
        this.providers = providers;
        this.config = config;
        this.registry = new registry_js_1.ModelRegistry(config.logicalModels);
        this.store = new store_js_1.RequestStore(config.dbPath);
        this.queue = new queue_js_1.RequestQueue({
            maxSize: config.maxQueueSize,
            timeoutMs: config.queueTimeoutMs,
            maxConcurrency: config.maxConcurrency,
        });
        this.monitor = new monitor_js_1.HealthMonitor(providers, {
            intervalMs: config.healthCheckIntervalMs,
            timeoutMs: config.healthCheckTimeoutMs,
            onUpdate: (name, status) => {
                this.store.logHealthCheck(name, status.state, status.latencyMs, status.message);
                this.metrics.setProviderHealth(name, status.state === "HEALTHY" ? 1 : 0);
            },
        });
        for (const name of providers.keys()) {
            const cb = new circuitBreaker_js_1.CircuitBreaker(name, {
                failureThreshold: config.circuitBreakerFailureThreshold,
                cooldownMs: config.circuitBreakerCooldownMs,
                successThreshold: config.circuitBreakerSuccessThreshold,
            });
            cb.onStateChange((s) => {
                this.store.recordCircuitState(s.provider, s.state, s.consecutiveFailures, s.openedAt || null);
            });
            this.breakers.set(name, cb);
            this.activeRequests.set(name, 0);
            this.totalRequests.set(name, 0);
            this.totalErrors.set(name, 0);
            this.recentOutcomes.set(name, []);
        }
    }
    start() {
        this.monitor.start();
        // keep queue gauges fresh
        const t = setInterval(() => {
            this.metrics.setQueueLength(this.queue.getLength());
            this.metrics.setActiveRequests(this.queue.getActiveCount());
        }, 5000);
        t.unref?.();
    }
    async stop() {
        this.monitor.stop();
        this.store.close();
    }
    setProviderDraining(name, draining) {
        this.monitor.setDraining(name, draining);
        if (draining)
            this.breakers.get(name)?.forceOpen();
        else
            this.breakers.get(name)?.forceClosed();
    }
    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------
    async chat(request) {
        const requestId = newRequestId();
        const tried = [];
        const started = Date.now();
        let logicalModel = request.model;
        let fallbackUsed = false;
        let fallbackFrom;
        for (;;) {
            const resolved = this.registry.resolve(logicalModel);
            if (!resolved) {
                throw new types_js_1.ProviderError("", "MODEL_UNAVAILABLE", false, `Unknown model: ${logicalModel}`);
            }
            const candidates = await this.scoreCandidates(request, resolved.candidates, tried);
            const result = await this.tryCandidates(request, requestId, logicalModel, candidates, tried, false);
            if (result) {
                return this.finalize(request, requestId, logicalModel, result, {
                    fallbackUsed,
                    fallbackFrom,
                    latencyMs: Date.now() - started,
                });
            }
            // all candidates failed — walk fallback chain
            const chain = this.registry.fallbackChain(logicalModel);
            const next = chain.find((m) => m !== logicalModel && m !== request.model);
            if (!next || request._fallbackApplied)
                break;
            fallbackUsed = true;
            fallbackFrom = fallbackFrom ?? request.model;
            request._fallbackApplied = true;
            logicalModel = next;
            this.log("info", `[router] ${requestId} fallback ${fallbackFrom} → ${next}`);
        }
        this.metrics.observeRequest("none", logicalModel, "failed", Date.now() - started);
        throw new types_js_1.ProviderError("", "ALL_PROVIDERS_FAILED", false, "All providers failed for this request");
    }
    async *stream(request) {
        const requestId = newRequestId();
        const tried = [];
        const resolved = this.registry.resolve(request.model);
        if (!resolved) {
            throw new types_js_1.ProviderError("", "MODEL_UNAVAILABLE", false, `Unknown model: ${request.model}`);
        }
        const candidates = await this.scoreCandidates({ ...request, stream: true }, resolved.candidates, tried);
        if (candidates.length === 0) {
            throw new types_js_1.ProviderError("", "ALL_PROVIDERS_FAILED", false, "No compatible provider available");
        }
        let lastError = null;
        for (const c of candidates) {
            const provider = this.providers.get(c.provider);
            const req = {
                ...request,
                stream: true,
                _providerModel: c.model,
                _triedProviders: [...tried, c.provider],
            };
            let gotFirstChunk = false;
            try {
                const chunks = await this.executeStream(provider, c, req, requestId);
                for await (const chunk of chunks) {
                    gotFirstChunk = true;
                    yield chunk;
                }
                return; // stream completed
            }
            catch (err) {
                lastError = err;
                this.recordOutcome(c.provider, false);
                this.breakers.get(c.provider)?.recordFailure();
                tried.push(c.provider);
                if (gotFirstChunk) {
                    // mid-stream failure: do NOT duplicate — terminate gracefully
                    this.log("warn", `[router] ${requestId} mid-stream failure on ${c.provider}, ending stream`);
                    throw new types_js_1.ProviderError(c.provider, "STREAM_FAILED", false, "Stream interrupted mid-response");
                }
                // fail over to next candidate before any content was sent
                this.store.logFailover(requestId, tried.length > 1 ? tried[tried.length - 2] : null, c.provider, "stream pre-start failure");
                continue;
            }
        }
        throw lastError instanceof types_js_1.ProviderError
            ? lastError
            : new types_js_1.ProviderError("", "ALL_PROVIDERS_FAILED", false, "All providers failed for stream");
    }
    getProviderStatuses() {
        const out = [];
        for (const [name] of this.providers) {
            const health = this.monitor.getStatus(name) ?? {
                state: "UNAVAILABLE",
                latencyMs: 0,
                modelLoaded: false,
                activeRequests: 0,
                queueLength: 0,
                errorRate: 0,
                lastCheckAt: 0,
            };
            out.push({
                name,
                enabled: true,
                health,
                circuit: this.breakers.get(name)?.getState().state ?? "CLOSED",
                score: this.scores.get(name) ?? 0,
                activeRequests: this.activeRequests.get(name) ?? 0,
                totalRequests: this.totalRequests.get(name) ?? 0,
                totalErrors: this.totalErrors.get(name) ?? 0,
                draining: this.monitor.isDraining(name),
            });
        }
        return out.sort((a, b) => b.score - a.score);
    }
    async getMetricsText() {
        return this.metrics.getPrometheusText();
    }
    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------
    async tryCandidates(request, requestId, logicalModel, candidates, tried, _stream) {
        let lastError = null;
        let prevProvider = null;
        for (const c of candidates) {
            const provider = this.providers.get(c.provider);
            if (!provider)
                continue;
            const req = {
                ...request,
                _providerModel: c.model,
                _triedProviders: [...tried, c.provider],
            };
            try {
                const response = await this.executeChat(provider, c, req, requestId);
                return { response, candidate: c };
            }
            catch (err) {
                lastError = err;
                tried.push(c.provider);
                const pe = err instanceof types_js_1.ProviderError ? err : null;
                // request-scoped errors fail fast — other providers won't fix them
                if (pe && (pe.code === "AUTH_FAILED" || pe.code === "INVALID_REQUEST")) {
                    throw err;
                }
                this.store.logFailover(requestId, prevProvider, c.provider, pe ? `${pe.code}: ${pe.message}` : "unknown");
                this.metrics.observeFailover(prevProvider ?? "none", c.provider, pe?.code ?? "unknown");
                prevProvider = c.provider;
                continue;
            }
        }
        if (lastError)
            this.log("warn", `[router] ${requestId} all candidates failed`);
        return null;
    }
    async executeChat(provider, candidate, request, requestId) {
        const name = candidate.provider;
        const breaker = this.breakers.get(name);
        if (!breaker.canExecute()) {
            throw new types_js_1.ProviderError(name, "PROVIDER_UNAVAILABLE", true, "circuit breaker open");
        }
        const priority = request.priority ?? "NORMAL";
        return this.queue.enqueue(priority, request.signal, async () => {
            this.bumpActive(name, 1);
            const started = Date.now();
            try {
                const res = await (0, retry_js_1.withRetry)(() => provider.chat(request), {
                    maxAttempts: 2,
                    baseDelayMs: 300,
                });
                breaker.recordSuccess();
                this.recordOutcome(name, true);
                return res;
            }
            catch (err) {
                breaker.recordFailure();
                this.recordOutcome(name, false);
                if (err instanceof types_js_1.ProviderError)
                    throw err;
                throw new types_js_1.ProviderError(name, "PROVIDER_UNAVAILABLE", (0, retry_js_1.isRetryable)(err), err.message);
            }
            finally {
                this.bumpActive(name, -1);
                void started;
                void requestId;
            }
        });
    }
    async executeStream(provider, candidate, request, _requestId) {
        const name = candidate.provider;
        const breaker = this.breakers.get(name);
        if (!breaker.canExecute()) {
            throw new types_js_1.ProviderError(name, "PROVIDER_UNAVAILABLE", true, "circuit breaker open");
        }
        // streaming bypasses the queue's concurrency wait? No — still respect it via direct call
        this.bumpActive(name, 1);
        try {
            const iterable = provider.stream(request);
            // wrap so failures are recorded
            const self = this;
            async function* wrapped() {
                try {
                    for await (const chunk of iterable) {
                        yield chunk;
                    }
                    breaker.recordSuccess();
                    self.recordOutcome(name, true);
                }
                catch (err) {
                    breaker.recordFailure();
                    self.recordOutcome(name, false);
                    throw err instanceof types_js_1.ProviderError
                        ? err
                        : new types_js_1.ProviderError(name, "STREAM_FAILED", false, err.message);
                }
                finally {
                    self.bumpActive(name, -1);
                }
            }
            return wrapped();
        }
        catch (err) {
            this.bumpActive(name, -1);
            throw err;
        }
    }
    finalize(request, requestId, logicalModel, result, info) {
        const { response, candidate } = result;
        const final = {
            ...response,
            model: logicalModel, // bot-facing logical name
            provider: candidate.provider,
        };
        this.metrics.observeRequest(candidate.provider, candidate.model, "success", info.latencyMs);
        this.metrics.observeTokens(candidate.provider, final.promptTokens ?? 0, final.completionTokens ?? 0);
        this.store.recordUsage(candidate.provider, final.totalTokens ?? 0);
        const log = {
            requestId,
            conversationId: request.conversationId,
            botId: request.botId,
            model: logicalModel,
            provider: candidate.provider,
            timestamp: Date.now(),
            latencyMs: info.latencyMs,
            status: "success",
            fallbackUsed: info.fallbackUsed,
            promptTokens: final.promptTokens,
            completionTokens: final.completionTokens,
        };
        this.store.logRequest(log);
        if (info.fallbackUsed) {
            this.log("info", `[router] ${requestId} served via fallback model ${logicalModel} (from ${info.fallbackFrom})`);
        }
        return final;
    }
    async scoreCandidates(request, candidates, tried) {
        const reqCaps = this.requiredCapabilities(request);
        const scored = [];
        for (const c of candidates) {
            if (tried.includes(c.provider))
                continue;
            const provider = this.providers.get(c.provider);
            if (!provider)
                continue;
            const breaker = this.breakers.get(c.provider);
            if (breaker && !breaker.canExecute())
                continue;
            const health = this.monitor.getStatus(c.provider);
            if (!health)
                continue;
            if (health.state === "UNAVAILABLE" || health.state === "DRAINING")
                continue;
            const caps = await this.getCapabilities(c.provider, provider);
            if (!this.satisfies(caps, reqCaps))
                continue;
            const active = this.activeRequests.get(c.provider) ?? 0;
            const errorRate = this.errorRate(c.provider);
            const providerWeight = this.config.providers[c.provider]?.weight ?? 1;
            const score = (HEALTH_FACTOR[health.state] ?? 0) *
                (1 / (1 + health.latencyMs / 1000)) *
                (1 / (1 + active / 8)) *
                (c.weight || 1) *
                providerWeight -
                errorRate * 2;
            if (score <= 0)
                continue;
            this.scores.set(c.provider, score);
            scored.push({ ...c, score, health });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored;
    }
    requiredCapabilities(request) {
        const need = {};
        let chars = 0;
        const scan = (msgs) => {
            for (const m of msgs) {
                if (typeof m.content === "string") {
                    chars += m.content.length;
                }
                else if (Array.isArray(m.content)) {
                    for (const part of m.content) {
                        if (part.type === "text")
                            chars += part.text?.length ?? 0;
                        if (part.type === "image_url")
                            need.vision = true;
                    }
                }
            }
        };
        scan(request.messages);
        if (request.tools && request.tools.length > 0)
            need.toolCalling = true;
        if (request.response_format?.type === "json_object")
            need.jsonMode = true;
        if (request.stream)
            need.streaming = true;
        need.minContext = Math.ceil(chars / 4) + (request.max_tokens ?? 1024) + 512;
        return need;
    }
    satisfies(caps, need) {
        if (need.vision && !caps.vision)
            return false;
        if (need.toolCalling && !caps.toolCalling)
            return false;
        if (need.jsonMode && !caps.jsonMode)
            return false;
        if (need.streaming && !caps.streaming)
            return false;
        if (need.minContext && caps.contextLength < need.minContext)
            return false;
        return true;
    }
    async getCapabilities(name, provider) {
        const cached = this.capsCache.get(name);
        if (cached && Date.now() - cached.at < 5 * 60 * 1000)
            return cached.caps;
        try {
            const models = await provider.models();
            const caps = models[0]?.capabilities ?? CONSERVATIVE_CAPS;
            this.capsCache.set(name, { at: Date.now(), caps });
            return caps;
        }
        catch {
            return CONSERVATIVE_CAPS;
        }
    }
    recordOutcome(name, success) {
        const arr = this.recentOutcomes.get(name) ?? [];
        arr.push(success);
        if (arr.length > 100)
            arr.shift();
        this.recentOutcomes.set(name, arr);
        this.totalRequests.set(name, (this.totalRequests.get(name) ?? 0) + 1);
        if (!success)
            this.totalErrors.set(name, (this.totalErrors.get(name) ?? 0) + 1);
    }
    errorRate(name) {
        const arr = this.recentOutcomes.get(name) ?? [];
        if (arr.length === 0)
            return 0;
        return arr.filter((s) => !s).length / arr.length;
    }
    bumpActive(name, delta) {
        this.activeRequests.set(name, Math.max(0, (this.activeRequests.get(name) ?? 0) + delta));
    }
    log(level, msg) {
        if (level === "warn")
            console.warn(msg);
        else
            console.log(msg);
    }
}
exports.ModelRouter = ModelRouter;
function newRequestId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
//# sourceMappingURL=router.js.map