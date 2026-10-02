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

export class ModelRegistry {
  private map = new Map<string, LogicalModelMapping>();

  constructor(mappings: LogicalModelMapping[]) {
    for (const m of mappings) {
      this.map.set(m.logicalModel, m);
    }
  }

  resolve(logicalModel: string): ResolvedModel | null {
    const m = this.map.get(logicalModel);
    if (!m) return null;
    return {
      logicalModel: m.logicalModel,
      candidates: m.providers.map((p) => ({
        provider: p.provider,
        model: p.model,
        weight: p.weight ?? 1,
      })),
    };
  }

  fallbackChain(logicalModel: string): string[] {
    return this.map.get(logicalModel)?.fallbackChain ?? [];
  }

  logicalModels(): string[] {
    return [...this.map.keys()];
  }
}
