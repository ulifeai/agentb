// src/openapi/tools/generic-http-tool.ts

import { ITool, IToolDefinition, IToolParameter, IToolResult } from '../../core/tool';
import { OpenAPIConnector } from '../connector'; // To call the execution logic

// Consistent name, can also be imported from llm/prompt-builder if preferred and prompt-builder doesn't import this.
export const GENERIC_HTTP_TOOL_NAME = 'genericHttpRequest';

/**
 * Input type for the GenericHttpApiTool.
 */
export interface IGenericHttpToolInput {
  method: string;
  path: string;
  queryParams?: Record<string, string | number | boolean | (string | number | boolean)[]>;
  headers?: Record<string, string>;
  requestBody?: any;
}

/**
 * Implements the ITool interface for making generic HTTP requests via an OpenAPIConnector.
 * This tool is typically added to an OpenAPIConnector instance when no specific tagFilter is applied,
 * allowing an LLM to make arbitrary calls to the API based on its documentation.
 */
export class GenericHttpApiTool implements ITool<IGenericHttpToolInput, any> {
  private connector: OpenAPIConnector;
  private toolDefinition: IToolDefinition<IGenericHttpToolInput, any>;

  constructor(connector: OpenAPIConnector) {
    this.connector = connector;
    this.toolDefinition = this.createDefinition();
  }

  private createDefinition(): IToolDefinition<IGenericHttpToolInput, any> {
    const parameters: IToolParameter[] = [
      {
        name: 'method',
        type: 'string',
        description: "The HTTP method (e.g., 'GET', 'POST').",
        required: true,
        schema: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'TRACE'],
        },
      },
      {
        name: 'path',
        type: 'string',
        description:
          "The relative API endpoint path (e.g., '/users/123' or '/pets'). Do NOT include the base URL. Path parameters (e.g. {userId}) should be substituted into this string directly.",
        required: true,
        schema: { type: 'string', description: 'Example: /users/{userId} would become /users/123' },
      },
      {
        name: 'queryParams',
        type: 'object',
        description:
          'An object representing query parameters. Keys are parameter names, values are their string, number, boolean, or array of string/number/boolean values (e.g., {"status": "available", "limit": 10, "tags": ["tag1", "tag2"]}).',
        required: false,
        schema: {
          type: 'object',
          additionalProperties: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'array', items: { type: ['string', 'number', 'boolean'] } },
            ],
          },
          description: 'Example: {"status": "available", "tags": ["canine", "friendly"]}',
        },
      },
      {
        name: 'headers',
        type: 'object',
        description:
          'An object representing additional HTTP headers. Authentication and default Content-Type for JSON bodies are handled automatically by the connector but can be overridden if necessary.',
        required: false,
        schema: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Example: {"X-Custom-Header": "value"}',
        },
      },
      {
        name: 'requestBody',
        type: 'object', // Can be object, array, string, number, boolean depending on Content-Type
        description:
          'The request body, typically a JSON object for POST, PUT, PATCH methods. Structure this according to the API documentation for the specific operation. For GET or DELETE, this is usually omitted.',
        required: false,
        schema: {
          description:
            "Can be any valid JSON type (object, array, string, etc.) or other body type if an appropriate Content-Type header is also provided in 'headers'.",
        },
      },
    ];

    return {
      name: GENERIC_HTTP_TOOL_NAME,
      description:
        'Makes a generic HTTP request to the configured API. This tool is powerful but requires careful construction of the request parameters based on API documentation. Use specific tools if available for the task.',
      parameters: parameters,
    };
  }

  getDefinition(): IToolDefinition<IGenericHttpToolInput, any> {
    return this.toolDefinition;
  }

  /**
   * Executes the generic HTTP request.
   * @param input Parameters for the generic HTTP call.
   * @returns A promise resolving to the API response as an IToolResult.
   */
  async execute(input: IGenericHttpToolInput): Promise<IToolResult<any>> {
    if (!this.connector.isInitialized()) {
      await this.connector.ensureInitialized();
    }
    // Delegate to the connector's internal method for generic operations.
    // The connector's method will now return IToolResult.
    return this.connector.executeGenericOperationInternal(input);
  }
}
