"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLocalaiProvider = createLocalaiProvider;
const base_js_1 = require("../base.js");
function createLocalaiProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "localai",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 32768, vision: false, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 4096 },
    });
}
//# sourceMappingURL=index.js.map