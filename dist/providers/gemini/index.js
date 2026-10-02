"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGeminiProvider = createGeminiProvider;
const base_js_1 = require("../base.js");
/** Google Gemini via its OpenAI-compatible endpoint. */
function createGeminiProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "gemini",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 1048576, vision: true, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map