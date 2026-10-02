"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestStore = void 0;
exports.hashKey = hashKey;
/**
 * SQLite persistence for the AI Gateway. Uses node:sqlite (built-in).
 * All writes are best-effort — a DB failure must never break the request path.
 */
const node_sqlite_1 = require("node:sqlite");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function hashKey(key) {
    return (0, node_crypto_1.createHash)("sha256").update(key).digest("hex");
}
class RequestStore {
    db = null;
    constructor(dbPath) {
        try {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(dbPath), { recursive: true });
            this.db = new node_sqlite_1.DatabaseSync(dbPath);
            const schema = (0, node_fs_1.readFileSync)((0, node_path_1.join)(__dirname, "schema.sql"), "utf8");
            this.db.exec(schema);
        }
        catch (err) {
            console.warn("[db] failed to initialize, running without persistence:", err.message);
            this.db = null;
        }
    }
    safe(fn) {
        if (!this.db)
            return;
        try {
            fn();
        }
        catch (err) {
            console.warn("[db] write failed:", err.message);
        }
    }
    logRequest(l) {
        this.safe(() => {
            this.db.prepare(`INSERT INTO ai_requests
         (request_id, bot_id, conversation_id, logical_model, provider, provider_model,
          status, latency_ms, prompt_tokens, completion_tokens, fallback_used, error_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(l.requestId, l.botId ?? null, l.conversationId ?? null, l.model, l.provider, null, l.status, l.latencyMs, l.promptTokens ?? null, l.completionTokens ?? null, l.fallbackUsed ? 1 : 0, l.errorCode ?? null, l.timestamp);
        });
    }
    logFailover(requestId, fromProvider, toProvider, reason) {
        this.safe(() => {
            this.db.prepare(`INSERT INTO ai_failovers (request_id, from_provider, to_provider, reason, created_at)
         VALUES (?, ?, ?, ?, ?)`).run(requestId, fromProvider, toProvider, reason, Date.now());
        });
    }
    recordUsage(provider, tokens) {
        this.safe(() => {
            const date = new Date().toISOString().slice(0, 10);
            this.db.prepare(`INSERT INTO ai_usage (provider, date, requests, tokens)
         VALUES (?, ?, 1, ?)
         ON CONFLICT(provider, date) DO UPDATE SET
           requests = requests + 1, tokens = tokens + excluded.tokens`).run(provider, date, tokens);
        });
    }
    logHealthCheck(provider, state, latencyMs, message) {
        this.safe(() => {
            this.db.prepare(`INSERT INTO ai_health_checks (provider, state, latency_ms, message, created_at)
         VALUES (?, ?, ?, ?, ?)`).run(provider, state, latencyMs, message ?? null, Date.now());
            // prune old health rows (keep ~7 days)
            this.db.prepare(`DELETE FROM ai_health_checks WHERE created_at < ?`).run(Date.now() - 7 * 24 * 3600 * 1000);
        });
    }
    recordCircuitState(provider, state, consecutiveFailures, openedAt) {
        this.safe(() => {
            this.db.prepare(`INSERT INTO ai_circuit_breakers (provider, state, consecutive_failures, opened_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           state = excluded.state,
           consecutive_failures = excluded.consecutive_failures,
           opened_at = excluded.opened_at,
           updated_at = excluded.updated_at`).run(provider, state, consecutiveFailures, openedAt, Date.now());
        });
    }
    close() {
        try {
            this.db?.close();
        }
        catch {
            // ignore
        }
        this.db = null;
    }
}
exports.RequestStore = RequestStore;
//# sourceMappingURL=store.js.map