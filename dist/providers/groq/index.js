"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGroqProvider = createGroqProvider;
const base_js_1 = require("../base.js");
function createGroqProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "groq",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 131072, vision: true, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map