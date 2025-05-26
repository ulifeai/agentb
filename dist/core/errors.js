"use strict";
// src/core/errors.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.StorageError = exports.InvalidStateError = exports.ConfigurationError = exports.LLMError = exports.ToolNotFoundError = exports.ApplicationError = void 0;
/**
 * @file Defines custom error classes for the application.
 * Using custom errors allows for more specific error handling and identification.
 */
/**
 * Base class for custom application errors.
 * This allows catching all application-specific errors with `instanceof ApplicationError`.
 */
class ApplicationError extends Error {
    constructor(message, metadata) {
        super(message);
        this.name = this.constructor.name; // Set the error name to the class name
        this.metadata = metadata;
        // This line is needed to restore the prototype chain in ES5 environments.
        // It might not be strictly necessary in modern TypeScript/ES6+ but is good practice.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.ApplicationError = ApplicationError;
/**
 * Error thrown when a specified tool cannot be found.
 */
class ToolNotFoundError extends ApplicationError {
    constructor(toolName, message) {
        super(message || `Tool "${toolName}" not found.`, { toolName });
        this.name = 'ToolNotFoundError';
    }
}
exports.ToolNotFoundError = ToolNotFoundError;
/**
 * Error thrown when an LLM interaction fails or returns an unexpected response.
 */
class LLMError extends ApplicationError {
    constructor(message, errorType, metadata) {
        super(message, metadata);
        this.name = 'LLMError';
        this.errorType = errorType;
    }
}
exports.LLMError = LLMError;
/**
 * Error thrown during configuration validation or when configuration is missing.
 */
class ConfigurationError extends ApplicationError {
    constructor(message, metadata) {
        super(message, metadata);
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
/**
 * Error thrown when an operation cannot be performed due to an invalid state.
 */
class InvalidStateError extends ApplicationError {
    constructor(message, metadata) {
        super(message, metadata);
        this.name = 'InvalidStateError';
    }
}
exports.InvalidStateError = InvalidStateError;
/**
 * Error related to storage operations (e.g., database connection, query failure).
 */
class StorageError extends ApplicationError {
    constructor(message, metadata) {
        super(message, metadata);
        this.name = 'StorageError';
    }
}
exports.StorageError = StorageError;
/**
 * Error thrown when an input validation fails.
 */
class ValidationError extends ApplicationError {
    constructor(message, validationDetails, metadata) {
        super(message, metadata);
        this.name = 'ValidationError';
        this.validationDetails = validationDetails;
    }
}
exports.ValidationError = ValidationError;
//# sourceMappingURL=errors.js.map