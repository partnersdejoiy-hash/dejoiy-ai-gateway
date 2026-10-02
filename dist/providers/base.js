"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAICompatibleProvider = void 0;
exports.normalizeError = normalizeError;
/**
 * Base provider implementation for OpenAI-compatible inference servers.
 * Handles chat, SSE streaming, health checks, and error normalization.
 */
const types_js_1 = require("../types.js");
const DEFAULT_CAPABILITIES = {
    contextLength: 32768,
    vision: false,
    toolCalling: true,
    jsonMode: true,
    streaming: true,
    maxOutputTokens: 4096,
};
/**
 * Map any thrown/fetched error into a normalized ProviderError.
 * Never includes secrets.
 */
function normalizeError(provider, err, httpStatus) {
    const msg = err instanceof Error ? err.message : String(err);
    const clean = msg.replace(/sk-[a-zA-Z0-9-_]+/g, "[redacted]");
    if (httpStatus === 401 || httpStatus === 403) {
        return new types_js_1.ProviderError(provider, "AUTH_FAILED", false, `Authentication failed (${httpStatus})`, httpStatus);
    }
    if (httpStatus === 400) {
        return new types_js_1.ProviderError(provider, "INVALID_REQUEST", false, `Invalid request: ${clean.slice(0, 200)}`, httpStatus);
    }
    if (httpStatus === 404) {
        return new types_js_1.ProviderError(provider, "MODEL_UNAVAILABLE", false, `Model not found: ${clean.slice(0, 200)}`, httpStatus);
    }
    if (httpStatus === 408 || httpStatus === 429) {
        return new types_js_1.ProviderError(provider, "PROVIDER_RATE_LIMITED", true, `Rate limited (${httpStatus ?? "timeout"})`, httpStatus);
    }
    if (httpStatus === 500 || httpStatus === 502 || httpStatus === 503) {
        const code = httpStatus === 503 ? "PROVIDER_OVERLOADED" : "PROVIDER_UNAVAILABLE";
        return new types_js_1.ProviderError(provider, code, true, `Provider error ${httpStatus}`, httpStatus);
    }
    if (httpStatus === 504) {
        return new types_js_1.ProviderError(provider, "PROVIDER_TIMEOUT", true, "Gateway timeout", 504);
    }
    // Network-level failures (fetch TypeError etc.)
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|socket hang up/i.test(clean)) {
        return new types_js_1.ProviderError(provider, "PROVIDER_UNAVAILABLE", true, `Connection failed: ${clean.slice(0, 160)}`);
    }
    if (/abort|aborted|timeout/i.test(clean)) {
        return new types_js_1.ProviderError(provider, "PROVIDER_TIMEOUT", true, "Request timed out");
    }
    return new types_js_1.ProviderError(provider, "PROVIDER_UNAVAILABLE", true, clean.slice(0, 200), httpStatus);
}
function buildHeaders(apiKey, extra) {
    const h = { "Content-Type": "application/json" };
    if (apiKey)
        h["Authorization"] = `Bearer ${apiKey}`;
    if (extra)
        Object.assign(h, extra);
    return h;
}
/** Race a fetch against a timeout; aborts on timeout or external signal. */
async function fetchWithTimeout(url, init, timeoutMs, externalSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
    const onAbort = () => ctrl.abort(externalSignal?.reason ?? new Error("aborted"));
    if (externalSignal) {
        if (externalSignal.aborted)
            onAbort();
        else
            externalSignal.addEventListener("abort", onAbort, { once: true });
    }
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    }
    finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", onAbort);
    }
}
class OpenAICompatibleProvider {
    name;
    baseUrl;
    apiKey;
    defaultModel;
    timeoutMs;
    modelsPath;
    chatPath;
    extraHeaders;
    capabilities;
    constructor(opts) {
        this.name = opts.name;
        this.baseUrl = opts.baseUrl.replace(/\/$/, "");
        this.apiKey = opts.apiKey;
        this.defaultModel = opts.defaultModel;
        this.timeoutMs = opts.timeoutMs;
        this.modelsPath = opts.modelsPath ?? "/models";
        this.chatPath = opts.chatPath ?? "/chat/completions";
        this.extraHeaders = opts.extraHeaders ?? {};
        this.capabilities = { ...DEFAULT_CAPABILITIES, ...(opts.capabilities ?? {}) };
    }
    /**
     * Resolve the concrete model id for this call. The router sets
     * `request._providerModel` to the resolved candidate model; otherwise
     * fall back to the provider's configured default.
     */
    resolveModel(request) {
        return request._providerModel || this.defaultModel;
    }
    async models() {
        const started = Date.now();
        try {
            const res = await fetchWithTimeout(`${this.baseUrl}${this.modelsPath}`, { headers: buildHeaders(this.apiKey, this.extraHeaders) }, Math.min(this.timeoutMs, 8000));
            if (!res.ok)
                return [this.defaultModelEntry()];
            const body = (await res.json());
            const ids = Array.isArray(body.data)
                ? body.data.map((m) => m.id).filter(Boolean)
                : [];
            if (ids.length === 0)
                return [this.defaultModelEntry()];
            return ids.map((id) => ({
                id,
                provider: this.name,
                capabilities: { ...this.capabilities },
            }));
        }
        catch {
            return [this.defaultModelEntry()];
        }
        finally {
            void started;
        }
    }
    defaultModelEntry() {
        return {
            id: this.defaultModel,
            provider: this.name,
            capabilities: { ...this.capabilities },
        };
    }
    async healthCheck() {
        const started = Date.now();
        try {
            const res = await fetchWithTimeout(`${this.baseUrl}${this.modelsPath}`, { headers: buildHeaders(this.apiKey, this.extraHeaders) }, Math.min(this.timeoutMs, 8000));
            const latencyMs = Date.now() - started;
            if (res.status === 401 || res.status === 403) {
                return this.unhealthy("UNAVAILABLE", latencyMs, "authentication failed");
            }
            if (res.status === 429) {
                return this.unhealthy("RATE_LIMITED", latencyMs, "rate limited");
            }
            if (!res.ok) {
                return this.unhealthy("UNAVAILABLE", latencyMs, `HTTP ${res.status}`);
            }
            return {
                state: "HEALTHY",
                latencyMs,
                modelLoaded: true,
                activeRequests: 0,
                queueLength: 0,
                errorRate: 0,
                lastCheckAt: Date.now(),
            };
        }
        catch (err) {
            const latencyMs = Date.now() - started;
            const pe = normalizeError(this.name, err);
            const state = pe.code === "PROVIDER_RATE_LIMITED" ? "RATE_LIMITED" : "UNAVAILABLE";
            return this.unhealthy(state, latencyMs, pe.message);
        }
    }
    unhealthy(state, latencyMs, message) {
        return {
            state,
            latencyMs,
            modelLoaded: false,
            activeRequests: 0,
            queueLength: 0,
            errorRate: 1,
            lastCheckAt: Date.now(),
            message,
        };
    }
    async chat(request) {
        const started = Date.now();
        const model = this.resolveModel(request);
        const body = this.buildChatBody(request, model, false);
        try {
            const res = await fetchWithTimeout(`${this.baseUrl}${this.chatPath}`, {
                method: "POST",
                headers: buildHeaders(this.apiKey, this.extraHeaders),
                body: JSON.stringify(body),
            }, request.stream ? this.timeoutMs * 2 : this.timeoutMs, request.signal);
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw normalizeError(this.name, new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`), res.status);
            }
            const data = (await res.json());
            const choice = data.choices?.[0];
            if (!choice) {
                throw new types_js_1.ProviderError(this.name, "PROVIDER_UNAVAILABLE", true, "Empty choices in response");
            }
            return {
                id: data.id ?? `chatcmpl-${Date.now()}`,
                model,
                provider: this.name,
                content: choice.message?.content ?? "",
                finishReason: choice.finish_reason ?? "stop",
                promptTokens: data.usage?.prompt_tokens,
                completionTokens: data.usage?.completion_tokens,
                totalTokens: data.usage?.total_tokens,
                latencyMs: Date.now() - started,
                toolCalls: choice.message?.tool_calls,
            };
        }
        catch (err) {
            if (err instanceof types_js_1.ProviderError)
                throw err;
            throw normalizeError(this.name, err);
        }
    }
    async *stream(request) {
        const model = this.resolveModel(request);
        const body = this.buildChatBody(request, model, true);
        const id = `chatcmpl-${Date.now()}`;
        let res;
        try {
            res = await fetchWithTimeout(`${this.baseUrl}${this.chatPath}`, {
                method: "POST",
                headers: buildHeaders(this.apiKey, this.extraHeaders),
                body: JSON.stringify(body),
            }, this.timeoutMs, request.signal);
        }
        catch (err) {
            throw normalizeError(this.name, err);
        }
        if (!res.ok || !res.body) {
            const text = await res.text().catch(() => "");
            throw normalizeError(this.name, new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`), res.status);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        try {
            while (!done) {
                const { value, done: readerDone } = await reader.read();
                if (readerDone)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:"))
                        continue;
                    const payload = trimmed.slice(5).trim();
                    if (payload === "[DONE]") {
                        done = true;
                        break;
                    }
                    try {
                        const evt = JSON.parse(payload);
                        const delta = evt.choices?.[0]?.delta?.content ?? "";
                        const toolCalls = evt.choices?.[0]?.delta?.tool_calls;
                        if (delta || toolCalls) {
                            yield { id, model, provider: this.name, delta, done: false, toolCalls };
                        }
                        if (evt.choices?.[0]?.finish_reason) {
                            done = true;
                            break;
                        }
                    }
                    catch {
                        // partial JSON — ignore, more data coming
                    }
                }
            }
            yield { id, model, provider: this.name, delta: "", done: true };
        }
        finally {
            reader.releaseLock();
        }
    }
    buildChatBody(request, model, stream) {
        const body = {
            model,
            messages: request.messages,
            stream,
        };
        if (request.temperature !== undefined)
            body.temperature = request.temperature;
        if (request.max_tokens !== undefined)
            body.max_tokens = request.max_tokens;
        if (request.top_p !== undefined)
            body.top_p = request.top_p;
        if (request.tools)
            body.tools = request.tools;
        if (request.tool_choice)
            body.tool_choice = request.tool_choice;
        if (request.response_format)
            body.response_format = request.response_format;
        if (request.stop)
            body.stop = request.stop;
        return body;
    }
}
exports.OpenAICompatibleProvider = OpenAICompatibleProvider;
//# sourceMappingURL=base.js.map