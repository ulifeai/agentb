import { OpenAPISpec } from './types';
/**
* Parses an OpenAPI specification to provide structured access to its components,
* particularly operations. It can filter operations based on a tag.
*/
export declare class OpenAPISpecParser {
    private spec;
    private currentTagFilter?;
    private operations;
    /**
    * Creates an instance of OpenAPISpecParser.
    * @param spec The OpenAPI specification object.
    * @param tagFilter Optional tag to filter operations by. If provided, only operations
    *                  containing this tag will be processed and made available.
    * @throws Error if the provided spec is invalid.
    */
    constructor(spec: OpenAPISpec, tagFilter?: string);
    /**
    * Initializes all operations from the spec and then applies the tag filter.
    */
    private _initializeAndFilterOperations;
    /**
    * Gets all unique tags found across all operations in the specification.
    * This method ignores any active tagFilter applied during construction.
    * @returns An array of unique tag strings.
    */
    getAllTags(): string[];
    /**
    * Gets all parsed connector operations based on the current filter.
    * If a `tagFilter` was provided during construction, only operations matching that tag are returned.
    * Otherwise, all operations from the spec are returned.
    * @returns An array of `ConnectorOperation` objects.
    */
    getOperations(): Array<{
        method: string;
        path: string;
        operationId: string;
        summary?: string;
        tags: string[];
        parameters: any[];
        requestBodySchema?: any;
    }>;
    /**
    * Gets a specific operation by its ID from the currently filtered set of operations.
    * @param operationId The ID of the operation to retrieve.
    * @returns The `ConnectorOperation` object if found, otherwise `undefined`.
    */
    getOperationById(operationId: string): {
        method: string;
        path: string;
        operationId: string;
        summary?: string;
        tags: string[];
        parameters: any[];
        requestBodySchema?: any;
    } | undefined;
    /**
    * Gets the base URL for the API from the `servers` array in the spec.
    * It returns the URL of the first server listed, with any trailing slash removed.
    * Support for server variables templating is not included.
    * @returns The base URL string, or an empty string if no servers are defined or the first server URL is invalid.
    */
    getBaseUrl(): string;
    /**
    * Generates a JSON schema for the parameters of a given operation (including requestBody).
    * This schema is suitable for use in LLM tool definitions that expect a single schema object.
    * @param operationId The ID of the operation (must be within the current filter scope).
    * @returns A JSON schema object describing the operation's parameters.
    * @throws Error if the operation is not found.
    */
    getOperationParametersSchema(operationId: string): any;
    /**
    * Helper to find the original raw operation definition from the full spec.
    * @param operationId The ID of the operation to find.
    * @returns The raw `RawOpenAPIOperation` object if found, otherwise `undefined`.
    */
    private _findRawOperationInSpec;
    /**
    * Resolves a `$ref` pointer within the OpenAPI specification.
    * Supports internal references (e.g., `#/components/schemas/User`).
    * @param obj The item that might be a reference object or any other value.
    * @returns The resolved item, the original item if not a supported $ref, or `null` on resolution failure.
    */
    private resolveRef;
    getSpec(): OpenAPISpec;
}
