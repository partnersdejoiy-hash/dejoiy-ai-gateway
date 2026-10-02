/**
 * Base provider implementation for OpenAI-compatible inference servers.
 * Handles chat, SSE streaming, health checks, and error normalization.
 */
import { AIChunk, AIProvider, AIResponse, ChatRequest, HealthStatus, Model, ModelCapabilities, ProviderError } from "../types.js";
export interface OpenAIOptions {
    name: string;
    baseUrl: string;
    apiKey?: string;
    defaultModel: string;
    timeoutMs: number;
    modelsPath?: string;
    chatPath?: string;
    extraHeaders?: Record<string, string>;
    capabilities?: Partial<ModelCapabilities>;
}
/**
 * Map any thrown/fetched error into a normalized ProviderError.
 * Never includes secrets.
 */
export declare function normalizeError(provider: string, err: unknown, httpStatus?: number): ProviderError;
export declare class OpenAICompatibleProvider implements AIProvider {
    readonly name: string;
    protected baseUrl: string;
    protected apiKey?: string;
    protected defaultModel: string;
    protected timeoutMs: number;
    protected modelsPath: string;
    protected chatPath: string;
    protected extraHeaders: Record<string, string>;
    protected capabilities: ModelCapabilities;
    constructor(opts: OpenAIOptions);
    /**
     * Resolve the concrete model id for this call. The router sets
     * `request._providerModel` to the resolved candidate model; otherwise
     * fall back to the provider's configured default.
     */
    protected resolveModel(request: ChatRequest): string;
    models(): Promise<Model[]>;
    private defaultModelEntry;
    healthCheck(): Promise<HealthStatus>;
    private unhealthy;
    chat(request: ChatRequest): Promise<AIResponse>;
    stream(request: ChatRequest): AsyncIterable<AIChunk>;
    protected buildChatBody(request: ChatRequest, model: string, stream: boolean): Record<string, unknown>;
}
