/**
 * @file Core utility functions shared across the project.
 */
/**
 * Sanitizes an identifier (e.g., operationId, tag name) to be suitable for use as
 * an LLM tool name, agent name, or other programmatic identifiers.
 *
 * Rules often include:
 * - Allowed characters: a-z, A-Z, 0-9, underscores (_), and hyphens (-).
 * - Maximum length (e.g., 64 characters for OpenAI tools).
 *
 * @param id The original identifier string.
 * @returns A sanitized string.
 */
export declare function sanitizeIdForLLM(id: string): string;
