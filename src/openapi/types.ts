
/**
 * @file Defines TypeScript interfaces for OpenAPI specifications and connector-specific types.
 * Based on user-provided openapi.txt
 */

import { IAgentContext } from '../agents/types';

// Standard OpenAPI v3 Interfaces (simplified for this context)

/**
 * Represents an OpenAPI Server Object.
 * @see https://swagger.io/specification/#server-object
 */
export interface OpenAPIServer {
  url: string;
  description?: string;
  // variables?: Record<string, ServerVariable>; // For more advanced server templating
}

/**
 * Represents an OpenAPI Parameter Object.
 * @see https://swagger.io/specification/#parameter-object
 */
export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  schema: any; // JSON Schema object for the parameter.
  // style, explode, allowReserved, example, examples, content could be added for full compliance.
}

/**
 * Represents an OpenAPI Request Body Object.
 * @see https://swagger.io/specification/#request-body-object
 */
export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: {
    [mediaType: string]: {
      schema: any; // JSON Schema object for the request body.
      // example, examples, encoding could be added.
    };
  };
}

/**
 * Represents an OpenAPI Response Object.
 * @see https://swagger.io/specification/#response-object
 */
export interface OpenAPIResponse {
  description: string;
  headers?: Record<string, any>; // Header Object or Reference Object. Using `any` for simplicity.
  content?: {
    [mediaType: string]: {
      schema: any; // JSON Schema object for the response body.
    };
  };
  // links?: Record<string, LinkObject | ReferenceObject>;
}

/**
 * Represents an OpenAPI Operation Object (as typically found in the spec paths).
 * @see https://swagger.io/specification/#operation-object
 */
export interface RawOpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: (OpenAPIParameter | { $ref: string })[]; // Can be Parameter Objects or Reference Objects.
  requestBody?: OpenAPIRequestBody | { $ref: string }; // Can be RequestBody Object or Reference Object.
  responses: {
    [statusCode: string]: OpenAPIResponse | { $ref: string }; // Can be Response Object or Reference Object.
  };
  // callbacks, deprecated, security, servers, externalDocs could be added.
}

/**
 * Represents an OpenAPI Path Item Object.
 * @see https://swagger.io/specification/#path-item-object
 */
export interface OpenAPIPathItem {
  $ref?: string; // Allows referencing another Path Item Object.
  summary?: string;
  description?: string;
  get?: RawOpenAPIOperation;
  put?: RawOpenAPIOperation;
  post?: RawOpenAPIOperation;
  delete?: RawOpenAPIOperation;
  options?: RawOpenAPIOperation;
  head?: RawOpenAPIOperation;
  patch?: RawOpenAPIOperation;
  trace?: RawOpenAPIOperation;
  servers?: OpenAPIServer[];
  parameters?: (OpenAPIParameter | { $ref: string })[]; // Common parameters for all operations in this path.
}

/**
 * Represents an OpenAPI Paths Object.
 * @see https://swagger.io/specification/#paths-object
 */
export interface OpenAPIPaths {
  [path: string]: OpenAPIPathItem | undefined; // pathItem can be undefined if path is empty
}

/**
 * Represents an OpenAPI Components Object.
 * @see https://swagger.io/specification/#components-object
 */
export interface OpenAPIComponents {
  schemas?: Record<string, any>; // JSON Schema objects.
  responses?: Record<string, OpenAPIResponse | { $ref: string }>;
  parameters?: Record<string, OpenAPIParameter | { $ref: string }>;
  requestBodies?: Record<string, OpenAPIRequestBody | { $ref: string }>;
  // examples, headers, securitySchemes, links, callbacks could be added.
}

/**
 * Represents the root OpenAPI Specification Object.
 * @see https://swagger.io/specification/#openapi-object
 */
export interface OpenAPISpec {
  openapi: string; // e.g., "3.0.0" or "3.1.0"
  info: {
    title: string;
    version: string;
    description?: string;
    // termsOfService, contact, license could be added.
  };
  servers?: OpenAPIServer[];
  paths: OpenAPIPaths;
  components?: OpenAPIComponents;
  // security, tags, externalDocs could be added.
}

// Connector-Specific Types

/**
 * Represents a parsed and processed operation ready for use by the connector.
 * This flattens some OpenAPI structures for easier internal use by `OpenAPISpecParser`
 * and `OpenAPIOperationTool`.
 */
export interface ConnectorOperation {
  /** The original, non-sanitized operationId from the OpenAPI spec. */
  operationId: string;
  summary?: string;
  description?: string;
  method: string; // Uppercase HTTP method: GET, POST, PUT, DELETE, etc.
  path: string; // The path template, e.g., /users/{id}
  /** Combined and resolved parameters (path, query, header). Schema inside parameters should also be resolved. */
  parameters: OpenAPIParameter[];
  /** Resolved JSON schema for the request body (if any). */
  requestBodySchema?: any;
  tags?: string[]; // Tags associated with the operation.
}

// Authentication Types

/**
 * Configuration for Bearer Token authentication.
 */
export interface BearerTokenAuth {
  type: 'bearer';
  /** 
   * Static token string or a function (async or sync) to retrieve it.
   * The function can optionally receive the agent context to access request-specific details.
   */
  token: string | ((agentContext?: IAgentContext) => string | Promise<string>);
}

/**
 * Configuration for API Key authentication.
 */
export interface ApiKeyAuth {
  type: 'apiKey';
  key: string; // The API key value.
  name: string; // The name of the header or query parameter.
  in: 'header' | 'query'; // Location of the API key.
}

// Future authentication types can be added here:
// export interface OAuth2Auth { type: 'oauth2'; /* ...details... */ }
// export interface BasicAuth { type: 'basic'; /* ...details... */ }

/** No authentication is used. */
export interface NoAuth {
  type: 'none';
}

/**
 * Union type for all supported connector authentication methods.
 */
export type ConnectorAuthentication = BearerTokenAuth | ApiKeyAuth | NoAuth;
/* | OAuth2Auth | BasicAuth ... */ // Future expansion

/**
 * Object returned by `authorizeRequest` to provide dynamic, per-request
 * authentication details that can override static configurations.
 * Keys are provider IDs (from ToolProviderSourceConfig.id).
 */
export interface PerProviderAuthOverrides {
  [providerId: string]: ConnectorAuthentication;
}

/**
 * Base options shared by various components like OpenAPIConnector, APIToolManager, and AgentOrchestrator.
 */
export interface BaseOpenAPIConnectorOptions {
  /** URL to fetch the OpenAPI spec (JSON or YAML). Mutually exclusive with `spec`. */
  specUrl?: string;
  /** Pre-loaded OpenAPI spec object. Mutually exclusive with `specUrl`. */
  spec?: OpenAPISpec;
  /** Authentication configuration for the API. Defaults to { type: 'none' }. */
  authentication?: ConnectorAuthentication;
  /** Additional text to include in LLM prompts for business context or usage guidelines. */
  businessContextText?: string;
}
