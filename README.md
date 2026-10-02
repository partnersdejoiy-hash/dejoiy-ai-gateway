# DEJOIY AI Gateway

A production-ready, self-hosted **AI inference gateway** — one OpenAI-compatible API in front of many inference engines, with automatic failover, health checks, circuit breakers, smart routing, request queueing, and observability.

```
                    ┌────────────────────────────────────────┐
                    │           DEJOIY AI GATEWAY              │
                    │                                        │
  AI BOT ──POST /v1/chat/completions──▶│  ┌──────────────┐  │
  (Kaali, WhatsApp, Support, …)       │  │ Model Router │  │
                                      │  │  score → try │  │
                                      │  └──────┬───────┘  │
                                      │         ▼          │
                                      │  ┌──────────────┐  │
                                      │  │Health/Circuit│  │
                                      │  │Breaker/Queue │  │
                                      │  └──────┬───────┘  │
                                      └─────────┼──────────┘
                                                ▼
              ┌──────────┬──────────┬──────────┬──────────┐
              │   vLLM   │  SGLang  │  Groq    │ Gemini   │  …
              │ llama.cpp│ LocalAI  │ OpenRouter│ Cerebras │
              │   TGI    │KoboldCpp │SpaceBunny │          │
              └──────────┴──────────┴──────────┴──────────┘
```

Bots never talk to providers directly. They ask for a **logical model** (`kaali-fast`, `kaali-smart`, `kaali-premium`) and the gateway picks the healthiest compatible engine. If one engine fails, the request automatically fails over to the next — the bot never sees the failure unless *every* provider is down.

## Features

- **11 providers** behind one `AIProvider` interface: vLLM, llama.cpp, LocalAI, SGLang, HuggingFace TGI, KoboldCpp, Space Bunny, Gemini, Groq, OpenRouter, Cerebras — all via OpenAI-compatible APIs
- **Smart routing**: `score = health × latency × capacity × weight − errorRate` (not a fixed priority list)
- **Automatic failover** across providers, then across fallback models (`kaali-premium → kaali-smart → kaali-fast`)
- **Circuit breakers** per provider (CLOSED → OPEN → HALF_OPEN)
- **Continuous health checks** with states: HEALTHY / DEGRADED / BUSY / RATE_LIMITED / UNAVAILABLE / RECOVERING / DRAINING
- **Priority request queue** (CRITICAL/HIGH/NORMAL/LOW) with concurrency limits — absorbs bursty load
- **Capability matching**: vision, tool calling, JSON mode, streaming, context length checked before routing
- **Streaming** (SSE) with safe pre-stream failover
- **Auth**: per-bot API keys + rate limiting
- **Observability**: Prometheus `/metrics`, structured request logs, SQLite persistence
- **Admin dashboard** at `/dashboard`
- **Zero-downtime provider ops** via DRAINING state

## Quickstart

```bash
cd ~/workspace/dejoiy-ai-gateway
npm install
cp .env.example .env
# edit .env — enable at least one provider, e.g.:
#   GROQ_ENABLED=true
#   GROQ_API_KEY=your-key
npm run build
npm start
# → listening on http://0.0.0.0:8000
# → dashboard: http://localhost:8000/dashboard
```

Test it:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"kaali-fast","messages":[{"role":"user","content":"Hello!"}]}'
```

Docker:

```bash
docker compose up -d --build
```

## Configuration

All via environment variables — see [`.env.example`](./.env.example) for the full list.

| Area | Key vars |
|---|---|
| Server | `PORT`, `HOST`, `REQUIRE_AUTH`, `GATEWAY_API_KEYS`, `RATE_LIMIT_PER_MINUTE` |
| Resilience | `HEALTH_CHECK_INTERVAL_MS`, `CB_FAILURE_THRESHOLD`, `CB_COOLDOWN_MS`, `MAX_QUEUE_SIZE`, `QUEUE_TIMEOUT_MS`, `MAX_CONCURRENCY` |
| Models | `LOGICAL_MODELS_JSON` (override default kaali-* mappings) |
| Providers | `<PREFIX>_ENABLED`, `<PREFIX>_URL`, `<PREFIX>_API_KEY`, `<PREFIX>_MODEL`, `<PREFIX>_TIMEOUT_MS`, `<PREFIX>_WEIGHT` |

Provider prefixes: `VLLM`, `LLAMACPP`, `LOCALAI`, `SGLANG`, `TGI`, `KOBOLDCPP`, `SPACE_BUNNY`, `GEMINI`, `GROQ`, `OPENROUTER`, `CEREBRAS`.

## API

| Endpoint | Description |
|---|---|
| `POST /v1/chat/completions` | Chat (OpenAI-compatible, incl. streaming) |
| `GET /v1/models` | Logical models |
| `GET /health` | Overall status |
| `GET /health/providers` | Per-provider detail |
| `GET /metrics` | Prometheus metrics |
| `GET /dashboard` | Admin dashboard |
| `POST /admin/providers/:name/drain` | Drain/undrain a provider |

Full reference: [docs/api.md](./docs/api.md).

## Adding a new provider

1. Create `src/providers/<name>/index.ts` exporting `create<Name>Provider(cfg: ProviderConfig): AIProvider` (extend `OpenAICompatibleProvider` from `src/providers/base.ts`).
2. Register it in `src/providers/index.ts` (`ALL_PROVIDER_KEYS` + `FACTORIES`).
3. Add the `ProviderKey` to `src/config.ts` (`ProviderKey`, `PROVIDER_KEYS`, `PROVIDER_DEFAULTS`, `PROVIDER_ENV_PREFIX`).
4. Document env vars in `.env.example`. No gateway/router changes needed.

## Project structure

```
src/
  config.ts          env-based configuration
  index.ts           entrypoint / wiring / graceful shutdown
  types.ts           shared types + AIProvider interface
  gateway/app.ts     Express app, routes, auth, rate limit, SSE
  router/router.ts   scoring, failover, capability matching
  providers/         base OpenAI-compatible client + 11 adapters
  health/monitor.ts  continuous health checks
  fallback/          circuitBreaker.ts, retry.ts
  models/registry.ts logical model → provider candidates
  queue/queue.ts     priority queue + concurrency
  metrics/metrics.ts Prometheus metrics
  db/                SQLite schema + request store
  dashboard/         admin UI (single HTML file)
tests/unit|integration/
docker/  (see docker-compose.yml)
docs/    api.md, migration-guide.md
```

## Deployment

- Behind a reverse proxy (nginx/Caddy) terminating HTTPS; set `REQUIRE_AUTH=true` and `GATEWAY_API_KEYS`.
- `DB_PATH` should point at a persistent volume (`./data` in Docker).
- Tune `MAX_CONCURRENCY` to your provider capacity; the queue absorbs bursts beyond it.
- To restart a provider with zero downtime: `POST /admin/providers/<name>/drain {"draining":true}`, wait for active requests to drain, restart, then `{"draining":false}` — it rejoins automatically after health checks pass.

## Migrating OrbitDesk

See [docs/migration-guide.md](./docs/migration-guide.md) — drop-in replacement for the current OpenRouter-based `completeAi()`: set `AI_GATEWAY_URL`, keep the same call shape.

## License

MIT
