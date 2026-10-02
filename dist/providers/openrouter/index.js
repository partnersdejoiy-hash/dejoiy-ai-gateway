"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOpenrouterProvider = createOpenrouterProvider;
const base_js_1 = require("../base.js");
function createOpenrouterProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "openrouter",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        extraHeaders: {
            "HTTP-Referer": "https://dejoiy.ai",
            "X-Title": "DEJOIY AI Gateway",
        },
        capabilities: { contextLength: 131072, vision: true, toolCalling: true, jsonMode: true, streaming: true, maxOutputTokens: 8192 },
    });
}
//# sourceMappingURL=index.js.map