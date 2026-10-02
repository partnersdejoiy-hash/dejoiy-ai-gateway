"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVllmProvider = createVllmProvider;
const base_js_1 = require("../base.js");
function createVllmProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "vllm",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 131072, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map