/**
 * @file Defines custom error classes for the application.
 * Using custom errors allows for more specific error handling and identification.
 */
/**
 * Base class for custom application errors.
 * This allows catching all application-specific errors with `instanceof ApplicationError`.
 */
export declare class ApplicationError extends Error {
    /**
     * Optional additional data associated with the error.
     * Can be used to store context, error codes, etc.
     */
    readonly metadata?: Record<string, any>;
    constructor(message: string, metadata?: Record<string, any>);
}
/**
 * Error thrown when a specified tool cannot be found.
 */
export declare class ToolNotFoundError extends ApplicationError {
    constructor(toolName: string, message?: string);
}
/**
 * Error thrown when an LLM interaction fails or returns an unexpected response.
 */
export declare class LLMError extends ApplicationError {
    /**
     * The type of LLM error (e.g., 'api_error', 'rate_limit', 'authentication', 'invalid_request').
     */
    readonly errorType?: string;
    constructor(message: string, errorType?: string, metadata?: Record<string, any>);
}
/**
 * Error thrown during configuration validation or when configuration is missing.
 */
export declare class ConfigurationError extends ApplicationError {
    constructor(message: string, metadata?: Record<string, any>);
}
/**
 * Error thrown when an operation cannot be performed due to an invalid state.
 */
export declare class InvalidStateError extends ApplicationError {
    constructor(message: string, metadata?: Record<string, any>);
}
/**
 * Error related to storage operations (e.g., database connection, query failure).
 */
export declare class StorageError extends ApplicationError {
    constructor(message: string, metadata?: Record<string, any>);
}
/**
 * Error thrown when an input validation fails.
 */
export declare class ValidationError extends ApplicationError {
    readonly validationDetails?: Record<string, string | string[]>;
    constructor(message: string, validationDetails?: Record<string, string | string[]>, metadata?: Record<string, any>);
}
