"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSpacebunnyProvider = createSpacebunnyProvider;
const base_js_1 = require("../base.js");
/**
 * Space Bunny provider. Base URL is fully configurable via SPACE_BUNNY_URL —
 * no endpoint is assumed. If the URL is not configured, the provider reports
 * UNAVAILABLE on health checks instead of failing at construction.
 */
function createSpacebunnyProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "spacebunny",
        baseUrl: cfg.url || "http://127.0.0.1:9/unconfigured",
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 65536, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map