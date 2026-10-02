"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRegistry = void 0;
class ModelRegistry {
    map = new Map();
    constructor(mappings) {
        for (const m of mappings) {
            this.map.set(m.logicalModel, m);
        }
    }
    resolve(logicalModel) {
        const m = this.map.get(logicalModel);
        if (!m)
            return null;
        return {
            logicalModel: m.logicalModel,
            candidates: m.providers.map((p) => ({
                provider: p.provider,
                model: p.model,
                weight: p.weight ?? 1,
            })),
        };
    }
    fallbackChain(logicalModel) {
        return this.map.get(logicalModel)?.fallbackChain ?? [];
    }
    logicalModels() {
        return [...this.map.keys()];
    }
}
exports.ModelRegistry = ModelRegistry;
//# sourceMappingURL=registry.js.map