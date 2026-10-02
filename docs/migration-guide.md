# Migrating OrbitDesk to the DEJOIY AI Gateway

This guide makes the gateway a **drop-in replacement** for OrbitDesk's current
direct OpenRouter calls. Same request/response shape — only the endpoint and
the model name change.

## Why

Today OrbitDesk calls OpenRouter directly (`completeAi()`). When OpenRouter's
free tier hits its limit (40 requests/day) or errors, every bot fails. The
gateway keeps the exact same call shape but adds automatic failover across
Groq, Gemini, Cerebras, OpenRouter, and any self-hosted engines you enable —
bots never see provider errors.

## Step 1 — Deploy the gateway

```bash
cd ~/workspace/dejoiy-ai-gateway
cp .env.example .env
# In .env, enable providers (reuse your existing keys):
#   GROQ_ENABLED=true
#   GROQ_API_KEY=<existing groq key>
#   GEMINI_ENABLED=true
#   GEMINI_API_KEY=<existing gemini key>
#   OPENROUTER_ENABLED=true
#   OPENROUTER_API_KEY=<existing openrouter key>
#   REQUIRE_AUTH=true
#   GATEWAY_API_KEYS=<long-random-string-for-orbitdesk>
docker compose up -d --build
curl http://localhost:8000/health
```

Verify at least one provider is `HEALTHY`: `curl http://localhost:8000/health/providers`.

## Step 2 — Point OrbitDesk at the gateway

In the OrbitDesk server environment (Vercel env vars):

```
AI_GATEWAY_URL=http://<gateway-host>:8000      # e.g. http://10.0.0.5:8000
AI_GATEWAY_KEY=<same value as GATEWAY_API_KEYS>
```

## Step 3 — Change `completeAi()`

Before (direct OpenRouter):

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function completeAi(prompt: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: "qwen/qwen3-32b:free",          // concrete provider model
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });
  return res.choices[0]?.message?.content ?? "";
}
```

After (via gateway):

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: `${process.env.AI_GATEWAY_URL}/v1`,   // ← gateway
  apiKey: process.env.AI_GATEWAY_KEY,             // ← gateway key
});

export async function completeAi(prompt: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: "kaali-fast",                          // ← logical model
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  }, {
    headers: { "x-bot-id": "orbitdesk-worker" },  // optional: per-bot tracking
  });
  return res.choices[0]?.message?.content ?? "";
}
```

That's it — no other call-site changes. For heavier reasoning tasks use
`"kaali-smart"`; for premium quality `"kaali-premium"` (falls back
automatically to smart → fast).

Team Chat streaming works unchanged: pass `stream: true` as before.

## Step 4 — Bursty load behavior

OrbitDesk fires up to 24 workers simultaneously. The gateway's queue
(`MAX_CONCURRENCY`, `MAX_QUEUE_SIZE`) absorbs the burst:

- Requests beyond concurrency wait in a priority queue (no thundering herd).
- If OpenRouter returns 429 (40/day exhausted), the gateway fails over to
  Groq/Gemini/Cerebras automatically — workers never see the 429.
- WhatsApp-critical paths can send `"priority": "HIGH"`; background
  summarization `"priority": "LOW"`.

## Step 5 — Verification checklist

1. `curl $AI_GATEWAY_URL/health` → `status: ok`, ≥1 provider HEALTHY.
2. From OrbitDesk server: one `completeAi("ping")` → 200, non-empty content.
3. Disable the primary provider's key temporarily → repeat call still succeeds
   (failover working; check `/metrics` → `gateway_failovers_total` incremented).
4. Dashboard: `http://<gateway-host>:8000/dashboard` shows green providers.
5. Load test: fire 24 parallel `completeAi` calls → all return, queue absorbs.

## Rollback

Unset `AI_GATEWAY_URL` / revert `completeAi()` to the direct OpenRouter client.
No data migration involved — the gateway is stateless apart from logs/metrics.

## Notes

- Keep your existing OpenRouter API key **in the gateway's `.env`**
  (`OPENROUTER_ENABLED=true`) — it becomes one provider among many instead of
  a single point of failure.
- Never expose the gateway without `REQUIRE_AUTH=true` on a public network.
- The gateway never logs API keys or full user message content at info level.
