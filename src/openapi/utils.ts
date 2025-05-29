
/**
 * @file Utility functions specific to OpenAPI spec fetching and header manipulation.
 * Based on user-provided utils.txt
 */
import yaml from 'js-yaml';
import { OpenAPISpec } from './types';

/**
 * Fetches an OpenAPI specification from a URL.
 * Supports both JSON and YAML formats.
 * @param url The URL of the OpenAPI specification.
 * @returns A Promise resolving to the parsed OpenAPI spec object.
 * @throws Error if fetching or parsing fails, or if the parsed content is not an object.
 */
export async function fetchSpec(url: string): Promise<OpenAPISpec> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (networkError: any) {
    // Ensure networkError is an Error object or provide a default message
    const message = networkError instanceof Error ? networkError.message : String(networkError);
    throw new Error(`Network error fetching spec from ${url}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch spec from ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  try {
    // Try parsing as JSON first (more common)
    const spec = JSON.parse(text);
    if (typeof spec !== 'object' || spec === null) {
      throw new Error('Parsed JSON from spec URL is not an object.');
    }
    return spec as OpenAPISpec;
  } catch (jsonError: any) {
    // If JSON parsing fails, try parsing as YAML
    try {
      const spec = yaml.load(text);
      if (typeof spec !== 'object' || spec === null) {
        throw new Error('Parsed YAML from spec URL is not an object.');
      }
      return spec as OpenAPISpec;
    } catch (yamlError: any) {
      const jsonMessage = jsonError instanceof Error ? jsonError.message : String(jsonError);
      const yamlMessage = yamlError instanceof Error ? yamlError.message : String(yamlError);
      throw new Error(
        `Failed to parse spec from ${url}. Not valid JSON or YAML. \n` +
          `JSON Error: ${jsonMessage}\n` +
          `YAML Error: ${yamlMessage}`
      );
    }
  }
}

/**
 * Converts a Headers object to a plain JavaScript object.
 * HTTP header names are case-insensitive, but standard practice is often lowercase.
 * This implementation preserves the case as returned by `headers.forEach`.
 * @param headers The Headers object to convert
 * @returns A Record mapping header names to their values as strings.
 * @example
 * const headers = new Headers({
 *   'Content-Type': 'application/json',
 *   'Authorization': 'Bearer token'
 * });
 * const obj = headersToObject(headers);
 * // obj is typically { 'content-type': 'application/json', 'authorization': 'Bearer token' }
 * // (exact case depends on Fetch API implementation in the environment)
 */
export function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}
