// src/openapi/connector.ts

/**
 * @file OpenAPIConnector class for interacting with an API defined by an OpenAPI specification.
 * It implements IToolProvider to expose API operations as ITools.
 * It can be configured to handle all operations or be filtered by a specific tag.
 */
import {
  OpenAPISpec,
  BaseOpenAPIConnectorOptions,
  ConnectorAuthentication,
  ConnectorOperation,
  // OpenAPIParameter, // No longer directly used here for type, embedded in ConnectorOperation
} from './types';
import { OpenAPISpecParser } from './spec-parser';
import { fetchSpec, headersToObject } from './utils';
import { ITool, IToolDefinition, IToolParameter, IToolProvider, IToolResult } from '../core/tool';
import { sanitizeIdForLLM } from '../core/utils';
import {
  GenericHttpApiTool,
  GENERIC_HTTP_TOOL_NAME as GENERIC_TOOL_ACTUAL_NAME,
  IGenericHttpToolInput,
} from './tools/generic-http-tool';

/**
 * Options for configuring an `OpenAPIConnector` instance.
 */
export interface OpenAPIConnectorOptions extends BaseOpenAPIConnectorOptions {
  /**
   * If set, this connector instance specializes in operations associated with this tag.
   * Operations will be filtered accordingly, and the GenericHttpApiTool might not be added.
   */
  tagFilter?: string;
  /**
   * If true and no tagFilter is provided, the GenericHttpApiTool will be added to the list of tools.
   * @default true
   */
  includeGenericToolIfNoTagFilter?: boolean;
}

/**
 * Represents a single API operation exposed as an ITool.
 */
class OpenAPIOperationTool implements ITool<Record<string, any>, any> {
  public operation: ConnectorOperation; // Make public
  private specParser: OpenAPISpecParser;
  private connector: OpenAPIConnector;
  private definition: IToolDefinition<Record<string, any>, any>;

  constructor(operation: ConnectorOperation, specParser: OpenAPISpecParser, connector: OpenAPIConnector) {
    if (!operation.operationId) {
      // This should ideally be caught earlier, but defensive check here.
      throw new Error(
        `Operation for ${operation.method} ${operation.path} is missing an operationId and cannot be created as a tool.`
      );
    }
    this.operation = operation;
    this.specParser = specParser;
    this.connector = connector;
    this.definition = this.createDefinition();
  }

  private createDefinition(): IToolDefinition<Record<string, any>, any> {
    const parameters: IToolParameter[] = [];
    let operationSchema: any;
    try {
      operationSchema = this.specParser.getOperationParametersSchema(this.operation.operationId);
    } catch (e) {
      console.warn(
        `[OpenAPIOperationTool] Could not generate parameters schema for ${this.operation.operationId}: ${(e as Error).message}. Tool will have minimal parameters.`
      );
      operationSchema = { type: 'object', properties: {} };
    }

    // Map OpenAPI parameters from ConnectorOperation to IToolParameter
    this.operation.parameters.forEach((param) => {
      parameters.push({
        name: param.name,
        type: param.schema?.type || 'any',
        description: param.description || `Parameter ${param.name}`,
        required: param.required || false,
        schema: param.schema, // Full schema for more detail
      });
    });

    // Add requestBody as a parameter if it exists
    if (this.operation.requestBodySchema) {
      const rbParamInfo = operationSchema.properties?.requestBody;
      const isRequestBodyRequired = operationSchema.required?.includes('requestBody') || false;

      parameters.push({
        name: 'requestBody', // Standardized name
        type: this.operation.requestBodySchema.type || 'object',
        description: rbParamInfo?.description || 'The request body for the operation.',
        required: isRequestBodyRequired,
        schema: this.operation.requestBodySchema,
      });
    }

    // Fallback if specParser.getOperationParametersSchema failed or gave minimal structure
    // and direct operation parameters were also empty. This ensures some parameter definition
    // based on the consolidated schema if individual parsing failed.
    if (parameters.length === 0 && operationSchema.properties) {
      for (const paramName in operationSchema.properties) {
        if (Object.prototype.hasOwnProperty.call(operationSchema.properties, paramName)) {
          const schemaProp = operationSchema.properties[paramName];
          parameters.push({
            name: paramName,
            type: schemaProp.type || 'any',
            description: schemaProp.description || `Parameter ${paramName}`,
            required: operationSchema.required?.includes(paramName) || false,
            schema: schemaProp,
          });
        }
      }
    }

    return {
      name: sanitizeIdForLLM(this.operation.operationId),
      description:
        this.operation.description ||
        this.operation.summary ||
        `Performs ${this.operation.method} on ${this.operation.path}`,
      parameters: parameters,
    };
  }

  getDefinition(): IToolDefinition<Record<string, any>, any> {
    return this.definition;
  }

  async execute(input: Record<string, any>): Promise<IToolResult<any>> {
    // The connector's method now expects the sanitized tool name (which is definition.name)
    return this.connector.executeSpecificOperationInternal(this.definition.name, input);
  }

  async getOpenAPISpec(): Promise<OpenAPISpec | undefined> {
    return this.specParser.getSpec();
  }
}

/**
 * The OpenAPIConnector class loads an OpenAPI spec, parses it, and provides methods
 * to execute API operations. It implements IToolProvider to expose these operations
 * (and potentially a generic HTTP tool) as ITool instances.
 */
export class OpenAPIConnector implements IToolProvider {
  private spec?: OpenAPISpec;
  private specParser?: OpenAPISpecParser;
  private authentication: ConnectorAuthentication;
  private businessContextText?: string; // Keep for prompt generation context
  private tagFilter?: string;
  private includeGenericTool: boolean;

  private _isInitialized: boolean = false;
  private initializationPromise: Promise<void>;
  private providedTools: ITool[] = [];

  constructor(options: OpenAPIConnectorOptions) {
    if (!options.specUrl && !options.spec) {
      throw new Error('OpenAPIConnector: "specUrl" or "spec" must be provided in options.');
    }
    this.authentication = options.authentication || { type: 'none' };
    this.businessContextText = options.businessContextText;
    this.tagFilter = options.tagFilter;
    // Default to true if undefined or explicitly true
    this.includeGenericTool = options.includeGenericToolIfNoTagFilter !== false;

    this.initializationPromise = this._initialize(options);
  }

  private async _initialize(options: OpenAPIConnectorOptions): Promise<void> {
    try {
      if (options.spec) {
        this.spec = options.spec;
      } else if (options.specUrl) {
        this.spec = await fetchSpec(options.specUrl);
      } else {
        throw new Error('Spec or specUrl is required for initialization.');
      }

      this.specParser = new OpenAPISpecParser(this.spec, this.tagFilter);
      this._isInitialized = true;
      console.info(
        `[OpenAPIConnector] Initialized successfully${this.tagFilter ? ` for tag "${this.tagFilter}"` : ' (full spec)'}. Auth type: ${this.authentication.type}`
      );
      this.generateTools();
    } catch (error: any) {
      this._isInitialized = false;
      const filterInfo = this.tagFilter ? ` for tag "${this.tagFilter}"` : '';
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[OpenAPIConnector] Initialization failed${filterInfo}: ${message}`, error);
      // Re-throw as a new error to ensure proper stack trace if needed, or just throw error
      throw new Error(`OpenAPIConnector initialization failed${filterInfo}: ${message}`);
    }
  }

  private generateTools(): void {
    this.assertInitialized();
    this.providedTools = [];
    const operations = this.specParser!.getOperations();

    for (const op of operations) {
      if (!op.operationId) {
        console.warn(`[OpenAPIConnector] Skipping operation without operationId: ${op.method} ${op.path}`);
        continue;
      }

      const tool = new OpenAPIOperationTool(op, this.specParser!, this);
      this.providedTools.push(tool);
    }

    // Add generic tool if configured to do so
    if (this.includeGenericTool && !this.tagFilter) {
      console.info('[OpenAPIConnector] Added GenericHttpApiTool as no tagFilter was specified and includeGenericTool is true.');
      this.providedTools.push(new GenericHttpApiTool(this));
    }
  }

  public async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
    if (!this._isInitialized) {
      throw new Error('OpenAPIConnector could not be initialized. Check previous logs for details.');
    }
  }

  private assertInitialized(): void {
    if (!this._isInitialized || !this.specParser || !this.spec) {
      throw new Error('OpenAPIConnector is not initialized. Please call and await ensureInitialized() first.');
    }
  }

  public isInitialized(): boolean {
    return this._isInitialized;
  }

  public getFullSpec(): OpenAPISpec {
    this.assertInitialized();
    return this.spec!;
  }

  public getSpecParser(): OpenAPISpecParser {
    this.assertInitialized();
    return this.specParser!;
  }

  public getBaseUrl(): string {
    this.assertInitialized();
    return this.specParser!.getBaseUrl();
  }

  public setAuthentication(auth: ConnectorAuthentication): void {
    // No need to assertInitialized for this, can be set before/after
    this.authentication = auth || { type: 'none' };
    const initStatus = this._isInitialized ? ' (initialized)' : ' (pre-initialization)';
    console.info(
      `[OpenAPIConnector${this.tagFilter ? ` (${this.tagFilter})` : ''}${initStatus}] Authentication updated to type: ${this.authentication.type}`
    );
  }

  public async getTools(): Promise<ITool[]> {
    await this.ensureInitialized();
    return [...this.providedTools]; // Return a copy
  }

  public async getTool(toolName: string): Promise<ITool | undefined> {
    await this.ensureInitialized();
    for (const tool of this.providedTools) {
      const definition = await tool.getDefinition();
      if (definition.name === toolName) {
        return tool;
      }
    }
    return undefined;
  }

  /** @internal */
  async executeSpecificOperationInternal(
    sanitizedToolName: string, // This is the sanitized operationId
    args: Record<string, any>
  ): Promise<IToolResult<any>> {
    this.assertInitialized();
    // Find the operation definition by its *original* operationId,
    // not the sanitizedToolName if sanitization changed it.
    // We need to iterate through our parsed operations to find the one
    // whose sanitized operationId matches sanitizedToolName.
    // However, OpenAPIOperationTool directly uses sanitizedToolName as its definition.name
    // and it has the original operation object.
    // For robustness, let's retrieve the operation based on the sanitizedToolName
    // which IS the operationId because OpenAPIOperationTool uses sanitizeIdForLLM(this.operation.operationId)
    // and this.operation.operationId is the true ID.
    // So, sanitizedToolName IS effectively the original operationId IF it was valid.
    // If sanitization changed it, then we need a map from sanitized name back to original op,
    // or the OpenAPIOperationTool needs to pass the original op details.
    // Simpler: The specParser.getOperationById should accept the sanitized name if that's what tools expose.
    // Let's assume sanitizedToolName IS the operationId, or a name that can be mapped back.
    // The current OpenAPIOperationTool.createDefinition uses sanitizeIdForLLM(this.operation.operationId) for the tool name.
    // So, sanitizedToolName passed here should be the one to look up.
    // We must ensure getOperationById works with sanitized names if tools are named that way,
    // or that tools are named with original operationId and sanitization is only for LLM.
    // Given current OpenAPIOperationTool, sanitizedToolName = sanitizeIdForLLM(originalOperationId)
    // For this to work, getOperationById would need to check sanitized IDs or we change tool naming.
    // Let's assume for now that `sanitizedToolName` is the `operationId` that `getOperationById` can find.
    // If `sanitizeIdForLLM` changes names, this is a mismatch.
    // For now, we'll assume `sanitizedToolName` is the *original* `operationId` passed through.
    // This means OpenAPIOperationTool's `getDefinition().name` should be the *original* operationId
    // and `sanitizeIdForLLM` should only be used when presenting to the LLM, not as the internal tool key.
    //
    // REVISITING: OpenAPIOperationTool sets its definition.name to sanitizeIdForLLM(this.operation.operationId).
    // So, `sanitizedToolName` IS the sanitized version. The `specParser.getOperationById` expects the *original* operationId.
    // This is a fundamental mismatch.
    //
    // QUICK FIX for now: Iterate `this.providedTools` to find the `OpenAPIOperationTool` whose definition name matches
    // `sanitizedToolName`, then get its internal `operation` object.

    let operationToolInstance: OpenAPIOperationTool | undefined;
    for (const tool of this.providedTools) {
        if (tool instanceof OpenAPIOperationTool && tool.getDefinition().name === sanitizedToolName) {
            operationToolInstance = tool;
            break;
        }
    }

    if (!operationToolInstance) {
        // This means the tool name provided doesn't match any OpenAPIOperationTool.
        // Could be GenericHttpApiTool or a tool not found.
        // This method is specific to OpenAPIOperationTool's execution path.
        // If it's the generic tool, it should have been routed to executeGenericOperationInternal.
        console.error(`[OpenAPIConnector] Could not find OpenAPIOperationTool instance for sanitized name: ${sanitizedToolName}`);
        return { success: false, data: null, error: `Internal error: Operation tool instance not found for ${sanitizedToolName}.` };
    }
    // Now, get the original operation details from the tool instance itself.
    // This is a bit of a workaround; ideally, the mapping from sanitized name to operation would be cleaner.
    // The `operationToolInstance` constructor stores the original `ConnectorOperation`. We need to access it.
    // Let's assume OpenAPIOperationTool exposes its `ConnectorOperation` or at least its original `operationId`.
    // To do this cleanly, OpenAPIOperationTool needs to store and expose `this.operation.operationId`
    // Or, we pass the full ConnectorOperation to executeSpecificOperationInternal from OpenAPIOperationTool.execute.
    // For now, let's assume `operationToolInstance.operation` is accessible (make it public or add a getter).
    // Hacky way for now (modify OpenAPIOperationTool to expose this or pass it):
    const operation = (operationToolInstance as any).operation as ConnectorOperation; // Needs change in OpenAPIOperationTool

    if (!operation) {
      // This should not happen if operationToolInstance was found
      return { success: false, data: null, error: `Operation details not found for tool ${sanitizedToolName}` };
    }


    const { method } = operation;
    let operationPathString = operation.path; // e.g., /users/{id}
    const queryForUrl: Record<string, string | string[]> = {};
    const headersForRequest: Record<string, string> = { 'accept': 'application/json' };
    let bodyForRequest: any = undefined;

    // Extract parameters based on their 'in' location from the flat 'args'
    operation.parameters.forEach(paramDef => {
      const argValue = args[paramDef.name];

      // Skip if argument is not provided and not required
      if (argValue === undefined && !paramDef.required) {
        return;
      }
      // If required and not provided, this is an issue. LLM should provide required args.
      if (argValue === undefined && paramDef.required) {
        console.warn(`[OpenAPIConnector] Missing required parameter '${paramDef.name}' for operation '${operation.operationId}'. Tool call might fail or be incomplete.`);
        // Potentially return an error IToolResult here
        // For now, let execution proceed to see if API handles it
      }

      if (argValue !== undefined) {
        switch (paramDef.in) {
          case 'path':
            operationPathString = operationPathString.replace(`{${paramDef.name}}`, String(argValue));
            break;
          case 'query':
            // OpenAPI spec allows array query parameters. Their serialization depends on 'style' and 'explode'.
            // For simplicity, if argValue is an array, we'll append multiple times.
            // More complex serialization (e.g., CSV, spaceDelimited) would need OpenAPISpecParser to provide style/explode.
            if (Array.isArray(argValue)) {
              queryForUrl[paramDef.name] = argValue.map(v => String(v));
            } else {
              queryForUrl[paramDef.name] = String(argValue);
            }
            break;
          case 'header':
            headersForRequest[paramDef.name] = String(argValue);
            break;
          // 'cookie' params are less common for server-side tools and might need special handling if supported.
        }
      }
    });

    // Handle requestBody (assuming it's passed as a top-level arg named 'requestBody')
    if (operation.requestBodySchema && args.requestBody !== undefined) {
      bodyForRequest = args.requestBody;
      // Ensure content-type if not already set by a header parameter
      if (['post', 'put', 'patch'].includes(method.toLowerCase()) && !headersForRequest['content-type'] && !headersForRequest['Content-Type']) {
        // Look for content type in requestBodySchema (e.g. from operation.requestBody.content)
        // For now, default to application/json if body exists for these methods.
        headersForRequest['content-type'] = 'application/json';
      }
    } else if (operation.requestBodySchema && args.requestBody === undefined) {
        // Check if requestBody was marked as required in the tool definition.
        // The tool definition parameters come from specParser.getOperationParametersSchema
        // which should include 'required: true' for requestBody if the spec says so.
        // If it's required and missing, this is an issue.
        const toolDefParams = operationToolInstance.getDefinition().parameters;
        const rbParamDef = toolDefParams.find(p => p.name === 'requestBody');
        if (rbParamDef?.required) {
             console.warn(`[OpenAPIConnector] Missing required 'requestBody' for operation '${operation.operationId}'.`);
             // Could return error here
        }
    }


    const baseUrl = this.getBaseUrl();
    const url = new URL(operationPathString, baseUrl);

    // Append query parameters to URL
    Object.entries(queryForUrl).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(vItem => url.searchParams.append(key, vItem));
      } else {
        url.searchParams.append(key, value);
      }
    });

    // Prepare final request options
    const options: RequestInit = {
      method: method.toUpperCase(),
      headers: headersForRequest // Already includes 'accept' and potentially 'content-type'
    };

    if (bodyForRequest !== undefined) {
      if (headersForRequest['content-type']?.toLowerCase().includes('application/json')) {
        options.body = JSON.stringify(bodyForRequest);
      } else {
        // For other content types (e.g., form-data, text/plain), might need different serialization
        options.body = typeof bodyForRequest === 'string' ? bodyForRequest : JSON.stringify(bodyForRequest); // Fallback
      }
    }

    // Apply authentication
    const authResult = await this.applyAuthentication(headersForRequest, url.toString());
    options.headers = new Headers(headersForRequest); // Update headers if applyAuthentication modified them

    // Make the API call
    return this.makeApiCall(authResult.url, options, `${method.toUpperCase()} ${operation.operationId}`);
  }

  /** @internal */
  async executeGenericOperationInternal(args: IGenericHttpToolInput): Promise<IToolResult<any>> {
    this.assertInitialized();
    const { method, path: relativePath, queryParams: rawQueryParams, headers: customHeaders, requestBody } = args;

    if (!method || !relativePath) {
      const errorMsg = "Missing required arguments 'method' or 'path' for genericHttpRequest tool.";
      console.error(`[OpenAPIConnector] ${errorMsg}`);
      return { success: false, data: null, error: errorMsg };
    }

    const baseUrl = this.getBaseUrl();
    let finalUrl = `${baseUrl}${relativePath.startsWith('/') ? relativePath : '/' + relativePath}`;
    const headers: Record<string, string> = { Accept: 'application/json', ...(customHeaders || {}) };

    if (requestBody !== undefined && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json'; // Default to JSON
    }

    const searchParams = new URLSearchParams();
    if (rawQueryParams && Object.keys(rawQueryParams).length > 0) {
      for (const [key, value] of Object.entries(rawQueryParams)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          value.forEach((vItem) => searchParams.append(key, String(vItem)));
        } else {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        finalUrl += `?${queryString}`;
      }
    }

    const authResult = await this.applyAuthentication(headers, finalUrl);
    finalUrl = authResult.url;

    const requestOptions: RequestInit = { method: method.toUpperCase(), headers: new Headers(headers) };

    if (requestBody !== undefined) {
      if (headers['Content-Type']?.toLowerCase().includes('application/json')) {
        requestOptions.body = JSON.stringify(requestBody);
      } else {
        requestOptions.body = requestBody; // as BodyInit;
      }
    }

    const opLabel = `Generic Call: ${method.toUpperCase()} ${relativePath}`;
    console.debug(
      `[OpenAPIConnector] Executing Generic Request: ${opLabel}, URL: ${finalUrl}`,
      requestBody ? `with body (type ${typeof requestBody})` : 'No Body',
      `and headers: ${JSON.stringify(headersToObject(requestOptions.headers as Headers))}`
    );
    return this.makeApiCall(finalUrl, requestOptions, opLabel);
  }

  private async applyAuthentication(headers: Record<string, string>, currentUrl: string): Promise<{ url: string }> {
    let urlToUse = currentUrl;
    const auth = this.authentication; // Assuming this.authentication is always defined

    switch (auth.type) {
      case 'bearer':
        let tokenVal = auth.token;
        if (typeof tokenVal === 'function') {
          const result = tokenVal();
          tokenVal = result instanceof Promise ? await result : result;
        }
        if (tokenVal) {
          headers['Authorization'] = `Bearer ${tokenVal}`;
        } else {
          console.warn('[OpenAPIConnector] Bearer token function returned empty or null value.');
        }
        break;
      case 'apiKey':
        if (auth.in === 'header') {
          headers[auth.name] = auth.key;
        } else {
          // 'query'
          try {
            const urlObj = new URL(urlToUse); // Base URL must be correctly formed
            urlObj.searchParams.set(auth.name, auth.key);
            urlToUse = urlObj.toString();
          } catch (e: any) {
            console.error(
              `[OpenAPIConnector] Error modifying URL for query-based API key: ${e.message}. Original URL: ${urlToUse}. Ensure base URL is valid.`
            );
          }
        }
        break;
      case 'none':
        // No action needed
        break;
      default:
        // This should not happen if types are correct, but good for exhaustiveness
        console.warn(`[OpenAPIConnector] Unknown authentication type encountered: ${(auth as any)?.type}`);
    }
    return { url: urlToUse };
  }

  private async makeApiCall(url: string, options: RequestInit, operationLabel: string): Promise<IToolResult<any>> {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (networkError: any) {
      const message = networkError instanceof Error ? networkError.message : String(networkError);
      console.error(
        `[OpenAPIConnector] Network error during API call (${operationLabel}) to ${url}: ${message}`,
        options
      );
      return {
        success: false,
        data: null,
        error: `Network error for ${operationLabel}: ${message}`,
        metadata: { url, options },
      };
    }

    if (!response.ok) {
      let errorBodyText = '';
      try {
        errorBodyText = await response.text();
      } catch (e) {
        /* ignore */
      }
      let errorJson: any = null;
      if (errorBodyText) {
        try {
          errorJson = JSON.parse(errorBodyText);
        } catch (e) {
          /* not JSON */
        }
      }
      const errorMessage = `API call (${operationLabel}) to ${url} failed with status ${response.status}: ${response.statusText}.`;
      console.error(errorMessage, 'Response body:', errorBodyText || '(empty body)');
      return {
        success: false,
        data: errorJson || errorBodyText, // Provide error body as data
        error: errorMessage,
        metadata: { status: response.status, statusText: response.statusText, url },
      };
    }

    // Handle successful responses
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return { success: true, data: null, metadata: { status: response.status, url } }; // No content
    }

    const contentType = response.headers.get('content-type');
    let responseData: any;
    try {
      if (contentType?.toLowerCase().includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text(); // For non-JSON content types
      }
      return { success: true, data: responseData, metadata: { status: response.status, contentType, url } };
    } catch (e: any) {
      // Fallback if JSON parsing fails even if content-type is JSON (e.g. empty body but 200 OK)
      console.warn(
        `[OpenAPIConnector] API call (${operationLabel}) to ${url} successful (status ${response.status}) but failed to parse response as ${contentType}. Error: ${e.message}. Attempting to return raw text.`
      );
      try {
        const textData = await response.text(); // Re-fetch text if initial parsing failed
        return {
          success: true,
          data: textData,
          error: 'Response parsing failed, returned raw text.',
          metadata: { status: response.status, contentType, url },
        };
      } catch (textError: any) {
        console.error(
          `[OpenAPIConnector] Failed to even get raw text for response of (${operationLabel}): ${textError.message}`
        );
        return {
          success: false,
          data: null,
          error: `Response successful (status ${response.status}) but unparsable: ${e.message}`,
          metadata: { status: response.status, url },
        };
      }
    }
  }
}
