// src/core/errors.ts

/**
 * @file Defines custom error classes for the application.
 * Using custom errors allows for more specific error handling and identification.
 */

/**
 * Base class for custom application errors.
 * This allows catching all application-specific errors with `instanceof ApplicationError`.
 */
export class ApplicationError extends Error {
  /**
   * Optional additional data associated with the error.
   * Can be used to store context, error codes, etc.
   */
  public readonly metadata?: Record<string, any>;

  constructor(message: string, metadata?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name; // Set the error name to the class name
    this.metadata = metadata;

    // This line is needed to restore the prototype chain in ES5 environments.
    // It might not be strictly necessary in modern TypeScript/ES6+ but is good practice.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a specified tool cannot be found.
 */
export class ToolNotFoundError extends ApplicationError {
  constructor(toolName: string, message?: string) {
    super(message || `Tool "${toolName}" not found.`, { toolName });
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Error thrown when an LLM interaction fails or returns an unexpected response.
 */
export class LLMError extends ApplicationError {
  /**
   * The type of LLM error (e.g., 'api_error', 'rate_limit', 'authentication', 'invalid_request').
   */
  public readonly errorType?: string;

  constructor(message: string, errorType?: string, metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'LLMError';
    this.errorType = errorType;
  }
}

/**
 * Error thrown during configuration validation or when configuration is missing.
 */
export class ConfigurationError extends ApplicationError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when an operation cannot be performed due to an invalid state.
 */
export class InvalidStateError extends ApplicationError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'InvalidStateError';
  }
}

/**
 * Error related to storage operations (e.g., database connection, query failure).
 */
export class StorageError extends ApplicationError {
  constructor(message: string, metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'StorageError';
  }
}

/**
 * Error thrown when an input validation fails.
 */
export class ValidationError extends ApplicationError {
  public readonly validationDetails?: Record<string, string | string[]>; // e.g., { fieldName: "Error message" }

  constructor(message: string, validationDetails?: Record<string, string | string[]>, metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'ValidationError';
    this.validationDetails = validationDetails;
  }
}
