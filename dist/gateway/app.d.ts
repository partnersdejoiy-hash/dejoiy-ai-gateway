/**
 * HTTP gateway: OpenAI-compatible API surface over the ModelRouter.
 */
import { Express } from "express";
import type { GatewayConfig } from "../config.js";
import type { ModelRouter } from "../router/router.js";
declare global {
    namespace Express {
        interface Request {
            requestId?: string;
            botId?: string;
        }
    }
}
export declare function createApp(router: ModelRouter, config: GatewayConfig): Express;
