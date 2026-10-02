# API Reference

Base URL: `http://gateway:8000` (or your `AI_GATEWAY_URL`).

All request/response bodies follow the OpenAI chat-completions format so existing
OpenAI clients work unchanged — just point `baseURL` at the gateway and use a
logical model name.

## `POST /v1/chat/completions`

```bash
curl http://localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <bot-api-key>' \
  -d '{
    "model": "kaali-fast",
    "messages": [{"role": "user", "content": "Summarize this ticket"}],
    "temperature": 0.3,
    "max_tokens": 500
  }'
```

Extra gateway fields (optional, ignored by plain OpenAI clients):
- `botId` — or send `x-bot-id` header — used for logging/rate limiting
- `conversationId` — correlation id for logs
- `priority` — `CRITICAL` | `HIGH` | `NORMAL` | `LOW` (queue priority)

Response (non-streaming):

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1727721600,
  "model": "kaali-fast",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 12, "completion_tokens": 40, "total_tokens": 52}
}
```

Streaming: send `"stream": true` → Server-Sent Events (`text/event-stream`),
OpenAI chunk shape, terminated by `data: [DONE]`.

Error shape:

```json
{ "error": { "message": "...", "type": "gateway_error", "code": "ALL_PROVIDERS_FAILED" } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_FAILED` | 401 | Bad gateway API key |
| `INVALID_REQUEST` | 400 | Bad body (also 400 for missing model/messages) |
| `MODEL_UNAVAILABLE` | 400 | Unknown logical model |
| `PROVIDER_RATE_LIMITED` | 429 | Gateway rate limit (or all providers rate-limited) |
| `ALL_PROVIDERS_FAILED` | 503 | Every compatible provider failed |
| `PROVIDER_UNAVAILABLE` | 502 | Provider error (single attempt) |

## `GET /v1/models`

```json
{ "object": "list", "data": [
  {"id": "kaali-fast", "object": "model", "owned_by": "dejoiy"},
  {"id": "kaali-smart", "object": "model", "owned_by": "dejoiy"},
  {"id": "kaali-premium", "object": "model", "owned_by": "dejoiy"}
]}
```

## `GET /health`

```json
{
  "status": "ok",
  "uptime_seconds": 1234,
  "version": "1.0.0",
  "providers": {"groq": "HEALTHY", "vllm": "UNAVAILABLE"}
}
```

## `GET /health/providers`

Array of per-provider status: name, health (state, latencyMs, …), circuit
state, routing score, active/total requests, errors, draining flag.

## `GET /metrics`

Prometheus text exposition. Key metrics:

- `gateway_requests_total{provider,model,status}`
- `gateway_request_latency_seconds{provider}` (histogram)
- `gateway_failovers_total{from_provider,to_provider,reason}`
- `gateway_tokens_total{provider,type}`
- `gateway_provider_healthy{provider}`
- `gateway_queue_length`, `gateway_active_requests`

## `POST /admin/providers/:name/drain`

Requires auth (when `REQUIRE_AUTH=true`). Body: `{"draining": true|false}`.
Drained providers finish in-flight requests but receive no new ones — use for
zero-downtime restarts/upgrades.

## `GET /dashboard`

Admin HTML dashboard (auto-refreshing provider table).
