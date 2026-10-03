/**
 * Environment-based configuration for the DEJOIY AI Gateway.
 * Every setting comes from env vars — no secrets are ever hard-coded.
 */
import type { LogicalModelMapping } from "./types.js";

export interface ProviderConfig {
  enabled: boolean;
  url: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  weight: number;
}

export type ProviderKey =
  | "vllm"
  | "llamacpp"
  | "localai"
  | "sglang"
  | "tgi"
  | "koboldcpp"
  | "spacebunny"
  | "gemini"
  | "groq"
  | "openrouter"
  | "cerebras"
  | "pollinations";

export const PROVIDER_KEYS: ProviderKey[] = [
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
  "pollinations",
];

export interface GatewayConfig {
  port: number;
  host: string;
  requireAuth: boolean;
  gatewayApiKeys: string[];
  rateLimitPerMinute: number;
  requestTimeoutMs: number;
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  circuitBreakerFailureThreshold: number;
  circuitBreakerCooldownMs: number;
  circuitBreakerSuccessThreshold: number;
  maxQueueSize: number;
  queueTimeoutMs: number;
  maxConcurrency: number;
  dbPath: string;
  logicalModels: LogicalModelMapping[];
  providers: Record<ProviderKey, ProviderConfig>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

interface ProviderDefaults {
  url: string;
  model: string;
}

const PROVIDER_DEFAULTS: Record<ProviderKey, ProviderDefaults> = {
  vllm: { url: "http://localhost:8001/v1", model: "Qwen3-8B" },
  llamacpp: { url: "http://localhost:8080/v1", model: "default" },
  localai: { url: "http://localhost:8080/v1", model: "ggml-model" },
  sglang: { url: "http://localhost:30000/v1", model: "Qwen3-8B" },
  tgi: { url: "http://localhost:8080/v1", model: "Qwen3-8B" },
  koboldcpp: { url: "http://localhost:5001/v1", model: "koboldcpp" },
  spacebunny: { url: "", model: "space-bunny-default" },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
  },
  groq: { url: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
  openrouter: { url: "https://openrouter.ai/api/v1", model: "qwen/qwen3-32b:free" },
  cerebras: { url: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
  pollinations: { url: "https://text.pollinations.ai/openai", model: "openai" },
};

const PROVIDER_ENV_PREFIX: Record<ProviderKey, string> = {
  vllm: "VLLM",
  llamacpp: "LLAMACPP",
  localai: "LOCALAI",
  sglang: "SGLANG",
  tgi: "TGI",
  koboldcpp: "KOBOLDCPP",
  spacebunny: "SPACE_BUNNY",
  gemini: "GEMINI",
  groq: "GROQ",
  openrouter: "OPENROUTER",
  cerebras: "CEREBRAS",
  pollinations: "POLLINATIONS",
};

function defaultLogicalModels(): LogicalModelMapping[] {
  return [
    {
      logicalModel: "kaali-fast",
      providers: [
        { provider: "groq", model: "llama-3.1-8b-instant", weight: 1 },
        { provider: "gemini", model: "gemini-2.0-flash", weight: 1 },
        { provider: "cerebras", model: "llama3.1-8b", weight: 1 },
        { provider: "openrouter", model: "qwen/qwen3-32b:free", weight: 1 },
        { provider: "vllm", model: "Qwen3-8B", weight: 1 },
        { provider: "sglang", model: "Qwen3-8B", weight: 1 },
        { provider: "localai", model: "ggml-model", weight: 1 },
        { provider: "llamacpp", model: "default", weight: 1 },
        { provider: "tgi", model: "Qwen3-8B", weight: 1 },
        { provider: "koboldcpp", model: "koboldcpp", weight: 1 },
        // Keyless last-resort failover — always available, no API key needed.
        { provider: "pollinations", model: "openai", weight: 1 },
      ],
    },
    {
      logicalModel: "kaali-smart",
      providers: [
        { provider: "gemini", model: "gemini-2.5-flash", weight: 1 },
        { provider: "groq", model: "llama-3.3-70b-versatile", weight: 1 },
        {
          provider: "openrouter",
          model: "meta-llama/llama-3.3-70b-instruct:free",
          weight: 1,
        },
        { provider: "cerebras", model: "llama-3.3-70b", weight: 1 },
        { provider: "vllm", model: "Qwen3-32B", weight: 1 },
      ],
      fallbackChain: ["kaali-fast"],
    },
    {
      logicalModel: "kaali-premium",
      providers: [
        { provider: "gemini", model: "gemini-2.5-pro", weight: 1 },
        { provider: "groq", model: "llama-3.3-70b-versatile", weight: 1 },
        {
          provider: "openrouter",
          model: "qwen/qwen3-235b-a22b:free",
          weight: 1,
        },
      ],
      fallbackChain: ["kaali-smart", "kaali-fast"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function num(env: NodeJS.ProcessEnv, key: string, def: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

function bool(env: NodeJS.ProcessEnv, key: string, def: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === "") return def;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function str(env: NodeJS.ProcessEnv, key: string, def: string): string {
  const raw = env[key];
  return raw === undefined || raw === "" ? def : raw;
}

function csvList(env: NodeJS.ProcessEnv, key: string): string[] {
  const raw = env[key];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseLogicalModels(env: NodeJS.ProcessEnv): LogicalModelMapping[] {
  const raw = env["LOGICAL_MODELS_JSON"];
  if (!raw) return defaultLogicalModels();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not an array");
    return parsed as LogicalModelMapping[];
  } catch (err) {
    console.warn(
      "[config] LOGICAL_MODELS_JSON invalid, using defaults:",
      (err as Error).message,
    );
    return defaultLogicalModels();
  }
}

function parseProviderConfig(
  env: NodeJS.ProcessEnv,
  key: ProviderKey,
): ProviderConfig {
  const prefix = PROVIDER_ENV_PREFIX[key];
  const defaults = PROVIDER_DEFAULTS[key];
  const apiKey = str(env, `${prefix}_API_KEY`, "");
  // Pollinations is keyless by design — enable it by default as the
  // always-available last-resort failover. Every other provider stays
  // opt-in so a missing key can never take the gateway down.
  const enabledDefault = key === "pollinations";
  return {
    enabled: bool(env, `${prefix}_ENABLED`, enabledDefault),
    url: str(env, `${prefix}_URL`, defaults.url),
    apiKey: apiKey === "" ? undefined : apiKey,
    model: str(env, `${prefix}_MODEL`, defaults.model),
    timeoutMs: num(env, `${prefix}_TIMEOUT_MS`, 30000),
    weight: num(env, `${prefix}_WEIGHT`, 1),
  };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const providers = {} as Record<ProviderKey, ProviderConfig>;
  for (const key of PROVIDER_KEYS) {
    providers[key] = parseProviderConfig(env, key);
  }
  return {
    port: num(env, "PORT", 8000),
    host: str(env, "HOST", "0.0.0.0"),
    requireAuth: bool(env, "REQUIRE_AUTH", false),
    gatewayApiKeys: csvList(env, "GATEWAY_API_KEYS"),
    rateLimitPerMinute: num(env, "RATE_LIMIT_PER_MINUTE", 600),
    requestTimeoutMs: num(env, "REQUEST_TIMEOUT_MS", 60000),
    healthCheckIntervalMs: num(env, "HEALTH_CHECK_INTERVAL_MS", 30000),
    healthCheckTimeoutMs: num(env, "HEALTH_CHECK_TIMEOUT_MS", 8000),
    circuitBreakerFailureThreshold: num(env, "CB_FAILURE_THRESHOLD", 5),
    circuitBreakerCooldownMs: num(env, "CB_COOLDOWN_MS", 60000),
    circuitBreakerSuccessThreshold: num(env, "CB_SUCCESS_THRESHOLD", 2),
    maxQueueSize: num(env, "MAX_QUEUE_SIZE", 500),
    queueTimeoutMs: num(env, "QUEUE_TIMEOUT_MS", 120000),
    maxConcurrency: num(env, "MAX_CONCURRENCY", 64),
    dbPath: str(env, "DB_PATH", "./data/gateway.db"),
    logicalModels: parseLogicalModels(env),
    providers,
  };
}

/** Safe summary for startup logging — never includes secrets. */
export function configSummary(config: GatewayConfig): Record<string, unknown> {
  const enabledProviders = PROVIDER_KEYS.filter((k) => config.providers[k].enabled);
  return {
    port: config.port,
    host: config.host,
    requireAuth: config.requireAuth,
    enabledProviders,
    logicalModels: config.logicalModels.map((m) => m.logicalModel),
    maxConcurrency: config.maxConcurrency,
    maxQueueSize: config.maxQueueSize,
  };
}
