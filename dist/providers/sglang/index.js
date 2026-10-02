"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSglangProvider = createSglangProvider;
const base_js_1 = require("../base.js");
function createSglangProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "sglang",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 131072, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map