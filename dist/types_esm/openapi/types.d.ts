/**
 * @file Defines TypeScript interfaces for OpenAPI specifications and connector-specific types.
 * Based on user-provided openapi.txt
 */
import { IAgentContext } from '../agents/types';
/**
 * Represents an OpenAPI Server Object.
 * @see https://swagger.io/specification/#server-object
 */
export interface OpenAPIServer {
    url: string;
    description?: string;
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
    schema: any;
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
            schema: any;
        };
    };
}
/**
 * Represents an OpenAPI Response Object.
 * @see https://swagger.io/specification/#response-object
 */
export interface OpenAPIResponse {
    description: string;
    headers?: Record<string, any>;
    content?: {
        [mediaType: string]: {
            schema: any;
        };
    };
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
    parameters?: (OpenAPIParameter | {
        $ref: string;
    })[];
    requestBody?: OpenAPIRequestBody | {
        $ref: string;
    };
    responses: {
        [statusCode: string]: OpenAPIResponse | {
            $ref: string;
        };
    };
}
/**
 * Represents an OpenAPI Path Item Object.
 * @see https://swagger.io/specification/#path-item-object
 */
export interface OpenAPIPathItem {
    $ref?: string;
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
    parameters?: (OpenAPIParameter | {
        $ref: string;
    })[];
}
/**
 * Represents an OpenAPI Paths Object.
 * @see https://swagger.io/specification/#paths-object
 */
export interface OpenAPIPaths {
    [path: string]: OpenAPIPathItem | undefined;
}
/**
 * Represents an OpenAPI Components Object.
 * @see https://swagger.io/specification/#components-object
 */
export interface OpenAPIComponents {
    schemas?: Record<string, any>;
    responses?: Record<string, OpenAPIResponse | {
        $ref: string;
    }>;
    parameters?: Record<string, OpenAPIParameter | {
        $ref: string;
    }>;
    requestBodies?: Record<string, OpenAPIRequestBody | {
        $ref: string;
    }>;
}
/**
 * Represents the root OpenAPI Specification Object.
 * @see https://swagger.io/specification/#openapi-object
 */
export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: OpenAPIServer[];
    paths: OpenAPIPaths;
    components?: OpenAPIComponents;
}
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
    method: string;
    path: string;
    /** Combined and resolved parameters (path, query, header). Schema inside parameters should also be resolved. */
    parameters: OpenAPIParameter[];
    /** Resolved JSON schema for the request body (if any). */
    requestBodySchema?: any;
    tags?: string[];
}
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
    key: string;
    name: string;
    in: 'header' | 'query';
}
/** No authentication is used. */
export interface NoAuth {
    type: 'none';
}
/**
 * Union type for all supported connector authentication methods.
 */
export type ConnectorAuthentication = BearerTokenAuth | ApiKeyAuth | NoAuth;
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
