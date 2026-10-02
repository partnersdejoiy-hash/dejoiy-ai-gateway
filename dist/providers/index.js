"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_PROVIDER_KEYS = void 0;
exports.createProviders = createProviders;
const index_js_1 = require("./vllm/index.js");
const index_js_2 = require("./llamacpp/index.js");
const index_js_3 = require("./localai/index.js");
const index_js_4 = require("./sglang/index.js");
const index_js_5 = require("./tgi/index.js");
const index_js_6 = require("./koboldcpp/index.js");
const index_js_7 = require("./spacebunny/index.js");
const index_js_8 = require("./gemini/index.js");
const index_js_9 = require("./groq/index.js");
const index_js_10 = require("./openrouter/index.js");
const index_js_11 = require("./cerebras/index.js");
exports.ALL_PROVIDER_KEYS = [
    "vllm",
    "llamacpp",
    "localai",
    "sglang",
    "tgi",
    "koboldcpp",
    "spacebunny",
    "gemini",
    "groq",
    "openrouter",
    "cerebras",
];
const FACTORIES = {
    vllm: index_js_1.createVllmProvider,
    llamacpp: index_js_2.createLlamacppProvider,
    localai: index_js_3.createLocalaiProvider,
    sglang: index_js_4.createSglangProvider,
    tgi: index_js_5.createTgiProvider,
    koboldcpp: index_js_6.createKoboldcppProvider,
    spacebunny: index_js_7.createSpacebunnyProvider,
    gemini: index_js_8.createGeminiProvider,
    groq: index_js_9.createGroqProvider,
    openrouter: index_js_10.createOpenrouterProvider,
    cerebras: index_js_11.createCerebrasProvider,
};
function createProviders(config) {
    const map = new Map();
    for (const key of exports.ALL_PROVIDER_KEYS) {
        const pcfg = config.providers[key];
        if (!pcfg?.enabled)
            continue;
        try {
            const provider = FACTORIES[key](pcfg);
            map.set(key, provider);
            console.log(`[providers] enabled: ${key} (model=${pcfg.model})`);
        }
        catch (err) {
            console.warn(`[providers] skipping ${key}: ${err.message}`);
        }
    }
    return map;
}
//# sourceMappingURL=index.js.map