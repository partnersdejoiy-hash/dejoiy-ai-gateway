/**
 * HTTP gateway: OpenAI-compatible API surface over the ModelRouter.
 */
import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { GatewayConfig } from "../config.js";
import type { ModelRouter } from "../router/router.js";
import type { ChatRequest, ProviderError } from "../types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      botId?: string;
    }
  }
}

function errorStatus(err: unknown): number {
  const code = (err as ProviderError)?.code;
  switch (code) {
    case "AUTH_FAILED":
      return 401;
    case "INVALID_REQUEST":
    case "MODEL_UNAVAILABLE":
      return 400;
    case "PROVIDER_RATE_LIMITED":
      return 429;
    case "ALL_PROVIDERS_FAILED":
      return 503;
    default:
      return 502;
  }
}

export function createApp(router: ModelRouter, config: GatewayConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // request id + bot id
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers["x-request-id"] as string) || uuidv4();
    req.botId =
      (req.headers["x-bot-id"] as string) ||
      (req.body?.botId as string) ||
      undefined;
    next();
  });

  // auth
  const requireAuth = config.requireAuth && config.gatewayApiKeys.length > 0;
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/health") || req.path.startsWith("/metrics") || req.path === "/dashboard") {
      return next();
    }
    if (!requireAuth) return next();
    const header = req.headers.authorization;
    const key =
      (typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice(7)
        : undefined) ?? (req.headers["x-api-key"] as string);
    if (!key || !config.gatewayApiKeys.includes(key)) {
      return res.status(401).json({ error: { message: "Invalid API key", type: "auth_error", code: "AUTH_FAILED" } });
    }
    next();
  });

  // rate limiting
  const limiter = rateLimit({
    windowMs: 60_000,
    max: config.rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      (req.headers["x-api-key"] as string) ||
      (req.headers.authorization as string) ||
      req.ip ||
      "anon",
    handler: (_req, res) =>
      res.status(429).json({
        error: { message: "Rate limit exceeded", type: "rate_limit", code: "PROVIDER_RATE_LIMITED" },
      }),
  });
  app.use("/v1/", limiter);

  // ------------------------------------------------------------------
  app.post("/v1/chat/completions", async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.model !== "string" || !Array.isArray(body.messages)) {
      return res.status(400).json({
        error: { message: "model (string) and messages (array) are required", type: "invalid_request", code: "INVALID_REQUEST" },
      });
    }
    const chatReq: ChatRequest = {
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      top_p: body.top_p,
      stream: body.stream === true,
      tools: body.tools,
      tool_choice: body.tool_choice,
      response_format: body.response_format,
      stop: body.stop,
      botId: req.botId,
      conversationId: body.conversationId,
      priority: body.priority,
    };

    if (chatReq.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Request-Id": req.requestId!,
      });
      const created = Math.floor(Date.now() / 1000);
      try {
        for await (const chunk of router.stream(chatReq)) {
          const payload = {
            id: chunk.id,
            object: "chat.completion.chunk",
            created,
            model: chatReq.model,
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: chunk.delta || undefined,
                  tool_calls: chunk.toolCalls,
                },
                finish_reason: chunk.done ? "stop" : null,
              },
            ],
          };
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
          if (chunk.done) break;
        }
      } catch (err) {
        const pe = err as ProviderError;
        res.write(
          `data: ${JSON.stringify({ error: { message: pe.message ?? "stream failed", code: pe.code ?? "STREAM_FAILED" } })}\n\n`,
        );
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    try {
      const result = await router.chat(chatReq);
      const created = Math.floor(Date.now() / 1000);
      return res.json({
        id: result.id,
        object: "chat.completion",
        created,
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.content,
              tool_calls: result.toolCalls,
            },
            finish_reason: result.finishReason,
          },
        ],
        usage: {
          prompt_tokens: result.promptTokens ?? 0,
          completion_tokens: result.completionTokens ?? 0,
          total_tokens: result.totalTokens ?? 0,
        },
      });
    } catch (err) {
      const status = errorStatus(err);
      const pe = err as ProviderError;
      return res.status(status).json({
        error: {
          message: pe.message ?? "request failed",
          type: "gateway_error",
          code: pe.code ?? "PROVIDER_UNAVAILABLE",
        },
      });
    }
  });

  // ------------------------------------------------------------------
  app.get("/v1/models", (_req: Request, res: Response) => {
    res.json({
      object: "list",
      data: config.logicalModels.map((m) => ({
        id: m.logicalModel,
        object: "model",
        owned_by: "dejoiy",
      })),
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    const statuses = router.getProviderStatuses();
    const states = statuses.map((s) => s.health.state);
    const anyHealthy = states.includes("HEALTHY");
    res.json({
      status: anyHealthy ? "ok" : "degraded",
      uptime_seconds: Math.floor(process.uptime()),
      version: "1.0.0",
      providers: Object.fromEntries(statuses.map((s) => [s.name, s.health.state])),
    });
  });

  app.get("/health/providers", (_req: Request, res: Response) => {
    res.json(router.getProviderStatuses());
  });

  app.get("/metrics", async (_req: Request, res: Response) => {
    res.type("text/plain").send(await router.getMetricsText());
  });

  // admin: drain a provider (auth required when requireAuth)
  app.post("/admin/providers/:name/drain", (req: Request, res: Response) => {
    if (requireAuth) {
      const header = req.headers.authorization;
      const key =
        (typeof header === "string" && header.startsWith("Bearer ")
          ? header.slice(7)
          : undefined) ?? (req.headers["x-api-key"] as string);
      if (!key || !config.gatewayApiKeys.includes(key)) {
        return res.status(401).json({ error: { message: "Invalid API key" } });
      }
    }
    const draining = req.body?.draining === true;
    router.setProviderDraining(req.params.name, draining);
    res.json({ provider: req.params.name, draining });
  });

  app.get("/dashboard", (_req: Request, res: Response) => {
    try {
      const html = readFileSync(join(__dirname, "dashboard", "index.html"), "utf8");
      res.type("text/html").send(html);
    } catch {
      res.status(404).send("dashboard not built");
    }
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { message: "not found", type: "not_found" } });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[gateway] unhandled error:", err.message);
    res.status(500).json({ error: { message: "internal error", type: "server_error" } });
  });

  return app;
}
