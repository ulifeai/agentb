// src/llm/prompt-builder.ts

/**
 * @file Generates system prompts for LLMs based on available tools and API information.
 * This module uses the core IToolDefinition and IToolSet interfaces.
 */

import { IToolDefinition, IToolParameter, IToolSet } from '../core/tool';
// Using specific types from openapi module for now, as generic prompt needs detailed op info
import { OpenAPISpec, ConnectorOperation, OpenAPIParameter as OpenAPISpecParameter } from '../openapi/types';

// Constants for well-known tool names that prompts might refer to.
// These names should match the `name` property of the actual IToolDefinition for these tools.
export const GENERIC_HTTP_TOOL_NAME = 'genericHttpRequest';
export const ROUTER_TOOL_NAME = 'routeToToolset'; // Changed from 'delegateToSpecialist' to avoid confusion

/**
 * Formats an IToolParameter for inclusion in a system prompt, making it human-readable.
 * @param param The IToolParameter object.
 * @returns A string describing the parameter for the prompt.
 */
function formatIToolParameterForPrompt(param: IToolParameter): string {
  let details = `- "${param.name}" (type: ${param.type || 'any'}${param.required ? ', required' : ''})`;
  if (param.description) {
    details += `: ${param.description.trim()}`;
  }
  // Enhance with schema details if available and simple enough for a prompt
  if (param.schema) {
    if (param.schema.enum) {
      details += ` (Enum: ${param.schema.enum.join(', ')})`;
    }
    if (param.schema.default !== undefined) {
      details += ` (Default: ${JSON.stringify(param.schema.default)})`;
    }
    // Could add more schema details like min/max, pattern if useful for LLM guidance
  }
  return details;
}

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
export function generateToolsSystemPrompt(
  toolSetName: string,
  toolSetDescription: string,
  toolDefinitions: IToolDefinition[],
  apiInfo?: Pick<OpenAPISpec['info'], 'title' | 'version'>, // Generic API info
  baseUrl?: string, // Could be part of a more generic API descriptor
  businessContextText?: string
): string {
  let prompt = `You are an AI assistant equipped with the "${toolSetName}".
Your Role: ${toolSetDescription.trim()}
`;
  if (apiInfo) {
    prompt += `This toolset primarily interacts with an API titled "${apiInfo.title}" (version ${apiInfo.version}).\n`;
  }
  if (baseUrl) {
    prompt += `Operations are generally directed towards a base URL like: ${baseUrl}\n`;
  }
  prompt += `
You have the following tools (functions) to perform tasks. Choose the most appropriate tool and provide its parameters accurately based on the user's request.
`;

  if (toolDefinitions.length === 0) {
    prompt += 'No specific tools are currently assigned to you for this role.\n';
  } else {
    toolDefinitions.forEach((toolDef) => {
      prompt += `\nTool Name: "${toolDef.name}"\n`;
      prompt += `  Description: ${toolDef.description.trim()}\n`;
      if (toolDef.parameters.length > 0) {
        prompt += `  Parameters (provide as a single JSON object argument to the tool):\n`;
        toolDef.parameters.forEach((param) => {
          prompt += `    ${formatIToolParameterForPrompt(param)}\n`;
        });
        const requiredParams = toolDef.parameters.filter((p) => p.required).map((p) => p.name);
        if (requiredParams.length > 0) {
          prompt += `    Required parameters for this tool: ${requiredParams.join(', ')}\n`;
        }
      } else {
        prompt += `  Parameters: This tool does not require any parameters.\n`;
      }
    });
  }

  if (businessContextText) {
    prompt += `\nIMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT:\n${businessContextText.trim()}\n`;
  }
  prompt += `\nAlways focus on using your available tools to fulfill the user's request. If a tool is not available for a specific action, state that clearly.`;
  return prompt;
}

/**
 * Formats an OpenAPIParameter for inclusion in the generic HTTP tool system prompt.
 * @param param The OpenAPIParameter object.
 * @returns A string describing the parameter.
 */
function formatOpenAPIParameterForGenericPrompt(param: OpenAPISpecParameter): string {
  let details = `- "${param.name}" (in: ${param.in}, type: ${param.schema?.type || 'any'}${param.required ? ', required' : ''})`;
  if (param.description) details += `: ${param.description.trim()}`;
  if (param.schema?.enum) details += ` (Enum: ${param.schema.enum.join(', ')})`;
  if (param.schema?.default !== undefined) details += ` (Default: ${JSON.stringify(param.schema.default)})`;
  return details;
}

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
export function generateGenericHttpToolSystemPrompt(
  operations: ConnectorOperation[], // From OpenAPISpecParser
  apiInfo: OpenAPISpec['info'],
  baseUrl: string,
  businessContextText?: string
): string {
  let prompt = `You are an AI assistant with access to the "${apiInfo.title}" API (version ${apiInfo.version}).
  ${apiInfo.description ? `API Description: ${apiInfo.description.trim()}\n` : ''}
Base URL for API calls: ${baseUrl || '(A pre-configured base URL will be used)'}
  
To interact with this API, you MUST use the "${GENERIC_HTTP_TOOL_NAME}" tool.
This tool allows you to make HTTP requests by specifying:
1.  "method": The HTTP method (e.g., "GET", "POST").
2.  "path": The relative API endpoint path (e.g., "/users/123"). Substitute path parameters directly into this string. Do NOT include the base URL.
3.  "queryParams" (optional): An object for query parameters (e.g., {"status": "available"}).
4.  "headers" (optional): An object for custom HTTP headers. Standard authentication and Content-Type are typically handled.
5.  "requestBody" (optional): The request payload, usually a JSON object for methods like POST, PUT, PATCH.
  
Below is a list of available API operations. Review these carefully to determine the correct method, path, and parameters for the "${GENERIC_HTTP_TOOL_NAME}" tool.
  
Available API Operations:
--------------------------
`;

  if (operations.length === 0) {
    prompt += 'No operations are defined in the provided API specification for you to call.\n';
  } else {
    operations.forEach((op) => {
      prompt += `\nOperation: "${op.summary || op.operationId}" (Operation ID: ${op.operationId})\n`;
      if (op.description && op.description !== op.summary) prompt += `  Description: ${op.description}\n`;
      prompt += `  HTTP Method: ${op.method}\n`;
      prompt += `  Relative Path: ${op.path}\n`;

      const pathParams = op.parameters.filter((p) => p.in === 'path');
      if (pathParams.length > 0) {
        prompt += `  Path Parameters (to be substituted into the 'path' string for ${GENERIC_HTTP_TOOL_NAME}):\n`;
        pathParams.forEach((p) => (prompt += `    ${formatOpenAPIParameterForGenericPrompt(p)}\n`));
      }
      const queryParams = op.parameters.filter((p) => p.in === 'query');
      if (queryParams.length > 0) {
        prompt += `  Query Parameters (provide in the 'queryParams' object for ${GENERIC_HTTP_TOOL_NAME}):\n`;
        queryParams.forEach((p) => (prompt += `    ${formatOpenAPIParameterForGenericPrompt(p)}\n`));
      }
      const headerParams = op.parameters.filter((p) => p.in === 'header'); // Usually for non-auth headers
      if (headerParams.length > 0) {
        prompt += `  Header Parameters (can be provided in 'headers' object for ${GENERIC_HTTP_TOOL_NAME} if not automatically handled):\n`;
        headerParams.forEach((p) => (prompt += `    ${formatOpenAPIParameterForGenericPrompt(p)}\n`));
      }

      if (op.requestBodySchema) {
        prompt += `  Request Body (provide in the 'requestBody' field for ${GENERIC_HTTP_TOOL_NAME}, typically as a JSON object):\n`;
        prompt += `    Structure: A JSON schema defines the expected structure. Refer to API docs for complex bodies.\n`;
        // Potentially stringify a summary of the schema if simple, or point to external docs.
        // For now, this generic statement suffices.
      }
    });
  }
  if (businessContextText) {
    prompt += `\nIMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT:\n${businessContextText.trim()}\n`;
  }
  prompt += `\nAlways use the "${GENERIC_HTTP_TOOL_NAME}" tool to make API calls. Ensure all parameters are correctly formatted.`;
  return prompt;
}

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
export async function generateRouterSystemPrompt(
  availableToolSets: IToolSet[],
  apiInfo: Pick<OpenAPISpec['info'], 'title' | 'version'>, // Generic API info
  businessContextText?: string
): Promise<string> {
  let prompt = `You are a master routing AI for an application that interacts with the "${apiInfo.title}" API (version ${apiInfo.version}).
Your primary task is to understand user requests and delegate them to the most appropriate specialist Toolset using the "${ROUTER_TOOL_NAME}" tool.
  
The "${ROUTER_TOOL_NAME}" tool requires these arguments:
1.  "toolSetId": The unique ID of the specialist Toolset to delegate the task to (e.g., "user_management", "pet_queries").
2.  "toolName": The name of the specific tool within the chosen Toolset to execute.
3.  "toolParameters": An object containing the parameters required by the chosen 'toolName'.
  
Available Specialist Toolsets and their capabilities:
`;
  if (availableToolSets.length === 0) {
    prompt += 'No specialist Toolsets are currently available. Inform the user if the request cannot be processed.\n';
  } else {
    for (const toolSet of availableToolSets) {
      prompt += `\n- Toolset ID: "${toolSet.id}"\n  …\n`;

      prompt += `\n- Toolset ID: "${toolSet.id}" (Use this for 'toolSetId')\n`;
      prompt += `  Toolset Name: "${toolSet.name}"\n`;
      prompt += `  Description: ${toolSet.description.trim()}\n`;
      if (toolSet.tools.length > 0) {
        prompt += `  Tools it provides (select one for 'toolName'):\n`;
        for (const tool of toolSet.tools) {
          const toolDef = await tool.getDefinition(); // Each tool in IToolSet is an ITool
          prompt += `    - Tool: "${toolDef.name}"\n`;
          prompt += `      Description: ${toolDef.description.substring(0, 150).trim()}${toolDef.description.length > 150 ? '...' : ''}\n`;
          if (toolDef.parameters.length > 0) {
            prompt += `      Parameters:\n`;
            toolDef.parameters.forEach((param) => {
              prompt += `        ${formatIToolParameterForPrompt(param)}\n`;
            });
          } else {
            prompt += `      Parameters: None required.\n`;
          }
        }
      } else {
        prompt += `  Tools: No tools specified for this toolset.\n`;
      }
    }
  }
  prompt += `
To delegate effectively using the "${ROUTER_TOOL_NAME}" tool, follow these steps:
1.  Analyze the user's request to understand their core intent.
2.  Review the list of available specialist Toolsets and their descriptions. Choose the 'toolSetId' that best matches the intent.
3.  Examine the tools listed for the chosen Toolset. Select the most appropriate 'toolName' that performs the desired action.
4.  Determine the 'toolParameters' required by that specific 'toolName', based on its listed parameters.
5.  Invoke the "${ROUTER_TOOL_NAME}" tool with 'toolSetId', 'toolName', and 'toolParameters'.
  
Example: If a user wants to 'get details for pet ID 123', and a Toolset with ID 'PetQueries' has a tool 'getPetById' that takes a 'petId' parameter, you would call:
  ${ROUTER_TOOL_NAME}({
  "toolSetId": "PetQueries",
  "toolName": "getPetById",
  "toolParameters": { "petId": 123 }
})
  
Ensure the 'toolName' you choose is explicitly listed as available for the selected 'toolSetId'.
If no suitable Toolset or tool exists, clearly inform the user.
`;
  if (businessContextText) {
    prompt += `\nIMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT:\n${businessContextText.trim()}\n`;
  }
  return prompt;
}
