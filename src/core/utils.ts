
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
export function sanitizeIdForLLM(id: string): string {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return 'unnamed_id'; // Handle empty, null, or whitespace-only IDs
  }

  // Replace any character that is not a letter, number, underscore, or hyphen with an underscore.
  let sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Optional: Prevent starting or ending with problematic characters like underscore or hyphen,
  // depending on specific LLM or system constraints. Example:
  // sanitized = sanitized.replace(/^_+|_+$/g, '');
  // If the above aggressive replacement results in an empty string, handle it.
  // if (sanitized.length === 0 && id.length > 0) {
  //    return `sanitized_from_${id.length}_chars`; // Provide some context
  // }

  // Enforce maximum length (e.g., 64 characters for OpenAI)
  if (sanitized.length > 64) {
    sanitized = sanitized.substring(0, 64);
    // Best effort to not end with an underscore if it was due to truncation,
    // unless the 64th char itself was meant to be an underscore.
    if (sanitized.endsWith('_') && id.charAt(63) !== '_') {
      sanitized = sanitized.substring(0, 63);
    }
  }

  // Final check for emptiness after all sanitization steps
  if (sanitized.length === 0) {
    // This case implies the original ID might have been very short and problematic,
    // or became empty after truncation and cleanup.
    return 'sanitized_id_empty';
  }

  return sanitized;
}
