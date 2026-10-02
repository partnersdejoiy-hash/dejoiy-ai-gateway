"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLlamacppProvider = createLlamacppProvider;
const base_js_1 = require("../base.js");
function createLlamacppProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "llamacpp",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 32768, vision: false, toolCalling: false, jsonMode: true, streaming: true, maxOutputTokens: 4096 },
    });
}
//# sourceMappingURL=index.js.map