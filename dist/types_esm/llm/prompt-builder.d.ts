/**
 * @file Generates system prompts for LLMs based on available tools and API information.
 * This module uses the core IToolDefinition and IToolSet interfaces.
 */
import { IToolDefinition, IToolSet } from '../core/tool';
import { OpenAPISpec, ConnectorOperation } from '../openapi/types';
export declare const GENERIC_HTTP_TOOL_NAME = "genericHttpRequest";
export declare const ROUTER_TOOL_NAME = "routeToToolset";
/**
 * Generates a system prompt for an LLM that has access to a specific set of tools.
 * This is suitable for specialist agents or any LLM focused on a defined toolset.
 *
 * @param toolSetName A descriptive name for this set of tools (e.g., "User Management Tools").
 * @param toolSetDescription A brief description of what this set of tools can achieve.
 * @param toolDefinitions An array of IToolDefinition objects available to the LLM.
 * @param apiInfo Optional: General information about the API if these tools relate to one (title, version).
 * @param baseUrl Optional: The base URL if relevant for context (though tools abstract actual calls).
 * @param businessContextText Optional: Additional guidelines or business context for the LLM.
 * @returns A string containing the system prompt.
 */
export declare function generateToolsSystemPrompt(toolSetName: string, toolSetDescription: string, toolDefinitions: IToolDefinition[], apiInfo?: Pick<OpenAPISpec['info'], 'title' | 'version'>, // Generic API info
baseUrl?: string, // Could be part of a more generic API descriptor
businessContextText?: string): string;
/**
 * Generates a system prompt for an LLM that will use a "generic HTTP request" tool.
 * This prompt details available API operations from an OpenAPI spec to guide the LLM.
 *
 * @param operations An array of `ConnectorOperation` objects detailing each available API operation.
 *                   This comes from `OpenAPISpecParser.getOperations()`.
 * @param apiInfo The `info` block from the OpenAPISpec (title, version, description).
 * @param baseUrl The base URL for the API.
 * @param businessContextText Optional additional business context or usage guidelines.
 * @returns A system prompt string for the LLM.
 */
export declare function generateGenericHttpToolSystemPrompt(operations: ConnectorOperation[], // From OpenAPISpecParser
apiInfo: OpenAPISpec['info'], baseUrl: string, businessContextText?: string): string;
/**
 * Generates the system prompt for a routing LLM.
 * This LLM's role is to delegate tasks to appropriate "ToolSets" (formerly specialist agents)
 * using a designated router tool.
 *
 * @param availableToolSets Array of IToolSet objects, each representing a group of capabilities/tools.
 * @param apiInfo General information about the API these toolsets might interact with.
 * @param businessContextText Optional additional business context or routing guidelines.
 * @returns A system prompt string for the router LLM.
 */
export declare function generateRouterSystemPrompt(availableToolSets: IToolSet[], apiInfo: Pick<OpenAPISpec['info'], 'title' | 'version'>, // Generic API info
businessContextText?: string): Promise<string>;
