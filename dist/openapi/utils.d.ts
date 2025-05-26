import { OpenAPISpec } from './types';
/**
 * Fetches an OpenAPI specification from a URL.
 * Supports both JSON and YAML formats.
 * @param url The URL of the OpenAPI specification.
 * @returns A Promise resolving to the parsed OpenAPI spec object.
 * @throws Error if fetching or parsing fails, or if the parsed content is not an object.
 */
export declare function fetchSpec(url: string): Promise<OpenAPISpec>;
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
export declare function headersToObject(headers: Headers): Record<string, string>;
