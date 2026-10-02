/**
 * Shared types for the DEJOIY AI Gateway.
 */

// ---------------------------------------------------------------------------
// Chat API (OpenAI-compatible)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatMessagePart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatMessagePart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatRequest {
  /** Logical model name, e.g. "kaali-fast". Router resolves to a provider. */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: unknown[];
  tool_choice?: unknown;
  response_format?: { type: "text" | "json_object" };
  stop?: string | string[];
  /** Bot identity for auth / rate limiting / logging */
  botId?: string;
  /** Conversation id for logging correlation */
  conversationId?: string;
  /** Request priority for the queue */
  priority?: RequestPriority;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Internal: providers already tried (failover chain) */
  _triedProviders?: string[];
  /** Internal: fallback chain already applied */
  _fallbackApplied?: boolean;
  /** Internal: concrete provider model resolved by the router */
  _providerModel?: string;
}

export interface AIResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  finishReason: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  toolCalls?: ToolCall[];
}

export interface AIChunk {
  id: string;
  model: string;
  provider: string;
  delta: string;
  done: boolean;
  toolCalls?: ToolCall[];
}

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

export type HealthState =
  | "HEALTHY"
  | "DEGRADED"
  | "BUSY"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "RECOVERING"
  | "DRAINING";

export interface HealthStatus {
  state: HealthState;
  latencyMs: number;
  modelLoaded: boolean;
  activeRequests: number;
  queueLength: number;
  errorRate: number;
  lastCheckAt: number;
  message?: string;
}

export interface ModelCapabilities {
  contextLength: number;
  vision: boolean;
  toolCalling: boolean;
  jsonMode: boolean;
  streaming: boolean;
  maxOutputTokens: number;
}

export interface Model {
  id: string;
  provider: string;
  capabilities: ModelCapabilities;
}

export interface AIProvider {
  /** Unique provider key, e.g. "vllm" */
  name: string;
  models(): Promise<Model[]>;
  healthCheck(): Promise<HealthStatus>;
  chat(request: ChatRequest): Promise<AIResponse>;
  stream(request: ChatRequest): AsyncIterable<AIChunk>;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type RequestPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface LogicalModelMapping {
  logicalModel: string;
  providers: Array<{ provider: string; model: string; weight?: number }>;
  fallbackChain?: string[];
}

export interface RoutingDecision {
  provider: string;
  providerModel: string;
  logicalModel: string;
  score: number;
  fallbackUsed: boolean;
  fallbackFrom?: string;
  triedProviders: string[];
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerState {
  provider: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number;
  openedAt: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ProviderErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_OVERLOADED"
  | "MODEL_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "AUTH_FAILED"
  | "STREAM_FAILED"
  | "ALL_PROVIDERS_FAILED";

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public code: ProviderErrorCode,
    public retryable: boolean,
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export interface RequestLog {
  requestId: string;
  conversationId?: string;
  botId?: string;
  model: string;
  provider: string;
  timestamp: number;
  latencyMs: number;
  status: "success" | "failed";
  fallbackUsed: boolean;
  errorCode?: string;
  promptTokens?: number;
  completionTokens?: number;
}
