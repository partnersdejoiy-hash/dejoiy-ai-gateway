"use strict";
/**
 * Shared types for the DEJOIY AI Gateway.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderError = void 0;
class ProviderError extends Error {
    provider;
    code;
    retryable;
    httpStatus;
    constructor(provider, code, retryable, message, httpStatus) {
        super(message);
        this.provider = provider;
        this.code = code;
        this.retryable = retryable;
        this.httpStatus = httpStatus;
        this.name = "ProviderError";
    }
}
exports.ProviderError = ProviderError;
//# sourceMappingURL=types.js.map