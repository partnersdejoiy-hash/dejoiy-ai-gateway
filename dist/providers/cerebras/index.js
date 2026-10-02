"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCerebrasProvider = createCerebrasProvider;
const base_js_1 = require("../base.js");
function createCerebrasProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "cerebras",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 65536, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map