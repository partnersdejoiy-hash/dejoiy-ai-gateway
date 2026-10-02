-- DEJOIY AI Gateway schema (SQLite)

CREATE TABLE IF NOT EXISTS ai_providers (
  name TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  url TEXT,
  weight REAL NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_models (
  logical_model TEXT PRIMARY KEY,
  fallback_chain_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS ai_provider_models (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  logical_model TEXT NOT NULL,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (provider, model)
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  bot_id TEXT,
  conversation_id TEXT,
  logical_model TEXT,
  provider TEXT,
  provider_model TEXT,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created ON ai_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_requests_provider ON ai_requests(provider);

CREATE TABLE IF NOT EXISTS ai_failovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  from_provider TEXT,
  to_provider TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  latency_ms INTEGER,
  message TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_health_provider ON ai_health_checks(provider, created_at);

CREATE TABLE IF NOT EXISTS ai_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  bot_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  provider TEXT NOT NULL,
  date TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, date)
);

CREATE TABLE IF NOT EXISTS ai_circuit_breakers (
  provider TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  opened_at INTEGER,
  updated_at INTEGER NOT NULL
);
