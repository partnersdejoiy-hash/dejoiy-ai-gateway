/**
 * Logical model registry: maps bot-facing model names (kaali-fast, ...)
 * to ordered provider candidates, plus fallback chains.
 */
import type { LogicalModelMapping } from "../types.js";
export interface ResolvedCandidate {
    provider: string;
    model: string;
    weight: number;
}
export interface ResolvedModel {
    logicalModel: string;
    candidates: ResolvedCandidate[];
}
export declare class ModelRegistry {
    private map;
    constructor(mappings: LogicalModelMapping[]);
    resolve(logicalModel: string): ResolvedModel | null;
    fallbackChain(logicalModel: string): string[];
    logicalModels(): string[];
}
