"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKoboldcppProvider = createKoboldcppProvider;
const base_js_1 = require("../base.js");
function createKoboldcppProvider(cfg) {
    return new base_js_1.OpenAICompatibleProvider({
        name: "koboldcpp",
        baseUrl: cfg.url,
        apiKey: cfg.apiKey,
        defaultModel: cfg.model,
        timeoutMs: cfg.timeoutMs,
        capabilities: { contextLength: 32768, vision: false, toolCalling: false, jsonMode: false, streaming: true, maxOutputTokens: 4096 },
    });
}
//# sourceMappingURL=index.js.map