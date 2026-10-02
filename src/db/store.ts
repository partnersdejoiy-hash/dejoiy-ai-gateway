/**
 * SQLite persistence for the AI Gateway. Uses node:sqlite (built-in).
 * All writes are best-effort — a DB failure must never break the request path.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RequestLog } from "../types.js";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export class RequestStore {
  private db: DatabaseSync | null = null;

  constructor(dbPath: string) {
    try {
      mkdirSync(dirname(dbPath), { recursive: true });
      this.db = new DatabaseSync(dbPath);
      const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
      this.db.exec(schema);
    } catch (err) {
      console.warn("[db] failed to initialize, running without persistence:", (err as Error).message);
      this.db = null;
    }
  }

  private safe(fn: () => void): void {
    if (!this.db) return;
    try {
      fn();
    } catch (err) {
      console.warn("[db] write failed:", (err as Error).message);
    }
  }

  logRequest(l: RequestLog): void {
    this.safe(() => {
      this.db!.prepare(
        `INSERT INTO ai_requests
         (request_id, bot_id, conversation_id, logical_model, provider, provider_model,
          status, latency_ms, prompt_tokens, completion_tokens, fallback_used, error_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        l.requestId,
        l.botId ?? null,
        l.conversationId ?? null,
        l.model,
        l.provider,
        null,
        l.status,
        l.latencyMs,
        l.promptTokens ?? null,
        l.completionTokens ?? null,
        l.fallbackUsed ? 1 : 0,
        l.errorCode ?? null,
        l.timestamp,
      );
    });
  }

  logFailover(requestId: string, fromProvider: string | null, toProvider: string, reason: string): void {
    this.safe(() => {
      this.db!.prepare(
        `INSERT INTO ai_failovers (request_id, from_provider, to_provider, reason, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(requestId, fromProvider, toProvider, reason, Date.now());
    });
  }

  recordUsage(provider: string, tokens: number): void {
    this.safe(() => {
      const date = new Date().toISOString().slice(0, 10);
      this.db!.prepare(
        `INSERT INTO ai_usage (provider, date, requests, tokens)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(provider, date) DO UPDATE SET
           requests = requests + 1, tokens = tokens + excluded.tokens`,
      ).run(provider, date, tokens);
    });
  }

  logHealthCheck(provider: string, state: string, latencyMs: number, message?: string): void {
    this.safe(() => {
      this.db!.prepare(
        `INSERT INTO ai_health_checks (provider, state, latency_ms, message, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(provider, state, latencyMs, message ?? null, Date.now());
      // prune old health rows (keep ~7 days)
      this.db!.prepare(
        `DELETE FROM ai_health_checks WHERE created_at < ?`,
      ).run(Date.now() - 7 * 24 * 3600 * 1000);
    });
  }

  recordCircuitState(provider: string, state: string, consecutiveFailures: number, openedAt: number | null): void {
    this.safe(() => {
      this.db!.prepare(
        `INSERT INTO ai_circuit_breakers (provider, state, consecutive_failures, opened_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           state = excluded.state,
           consecutive_failures = excluded.consecutive_failures,
           opened_at = excluded.opened_at,
           updated_at = excluded.updated_at`,
      ).run(provider, state, consecutiveFailures, openedAt, Date.now());
    });
  }

  close(): void {
    try {
      this.db?.close();
    } catch {
      // ignore
    }
    this.db = null;
  }
}
