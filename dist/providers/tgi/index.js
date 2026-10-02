"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTgiProvider = createTgiProvider;
const base_js_1 = require("../base.js");
function createTgiProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "tgi",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 32768, vision: false, toolCalling: false, jsonMode: false, streaming: true, maxOutputTokens: 4096 },
    });
}
//# sourceMappingURL=index.js.map