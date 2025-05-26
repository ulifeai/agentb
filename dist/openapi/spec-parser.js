"use strict";
// src/openapi/spec-parser.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAPISpecParser = void 0;
/**
* @file Parses an OpenAPI specification to extract structured operation details.
* Can be filtered by a specific tag.
* Based on user-provided spec-parser.txt
*/
const errors_1 = require("../core/errors");
/**
* Parses an OpenAPI specification to provide structured access to its components,
* particularly operations. It can filter operations based on a tag.
*/
class OpenAPISpecParser {
    /**
    * Creates an instance of OpenAPISpecParser.
    * @param spec The OpenAPI specification object.
    * @param tagFilter Optional tag to filter operations by. If provided, only operations
    *                  containing this tag will be processed and made available.
    * @throws Error if the provided spec is invalid.
    */
    constructor(spec, tagFilter) {
        this.operations = [];
        if (!spec || !spec.openapi || !spec.paths) {
            throw new errors_1.ConfigurationError('Invalid OpenAPI spec provided to parser: "openapi" or "paths" field is missing.');
        }
        this.spec = spec;
        this.currentTagFilter = tagFilter;
        this._initializeAndFilterOperations();
    }
    /**
    * Initializes all operations from the spec and then applies the tag filter.
    */
    _initializeAndFilterOperations() {
        for (const [path, pathItemObject] of Object.entries(this.spec.paths)) {
            if (!pathItemObject)
                continue;
            const resolvedPathItem = this.resolveRef(pathItemObject);
            if (!resolvedPathItem) {
                console.warn(`[SpecParser] Could not resolve path item for path: ${path}, or it was not a valid PathItem object.`);
                continue;
            }
            for (const method of ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace']) {
                const operation = resolvedPathItem[method];
                if (!operation)
                    continue;
                const resolvedOperation = this.resolveRef(operation);
                if (!resolvedOperation)
                    continue;
                if (!resolvedOperation.operationId) {
                    console.warn(`[SpecParser] Operation missing operationId for ${method.toUpperCase()} ${path}. Skipping.`);
                    continue;
                }
                const operationTags = resolvedOperation.tags || [];
                if (this.currentTagFilter && !operationTags.includes(this.currentTagFilter)) {
                    continue; // Skip this operation as it doesn't match the tag filter
                }
                // For $ref paths, use the original path instead of the resolved path
                const operationPath = pathItemObject.$ref ? path : path;
                // Resolve request body schema if present
                let requestBodySchema;
                if (resolvedOperation.requestBody) {
                    const resolvedRequestBody = this.resolveRef(resolvedOperation.requestBody);
                    if (resolvedRequestBody?.content?.['application/json']?.schema) {
                        requestBodySchema = resolvedRequestBody.content['application/json'].schema;
                    }
                }
                this.operations.push({
                    method,
                    path: operationPath,
                    operationId: resolvedOperation.operationId,
                    summary: resolvedOperation.summary,
                    tags: resolvedOperation.tags || [],
                    parameters: resolvedOperation.parameters || [],
                    requestBodySchema
                });
            }
        }
    }
    /**
    * Gets all unique tags found across all operations in the specification.
    * This method ignores any active tagFilter applied during construction.
    * @returns An array of unique tag strings.
    */
    getAllTags() {
        const tags = new Set();
        this.operations.forEach(op => {
            op.tags.forEach(tag => tags.add(tag));
        });
        return Array.from(tags);
    }
    /**
    * Gets all parsed connector operations based on the current filter.
    * If a `tagFilter` was provided during construction, only operations matching that tag are returned.
    * Otherwise, all operations from the spec are returned.
    * @returns An array of `ConnectorOperation` objects.
    */
    getOperations() {
        return this.operations;
    }
    /**
    * Gets a specific operation by its ID from the currently filtered set of operations.
    * @param operationId The ID of the operation to retrieve.
    * @returns The `ConnectorOperation` object if found, otherwise `undefined`.
    */
    getOperationById(operationId) {
        return this.operations.find(op => op.operationId === operationId);
    }
    /**
    * Gets the base URL for the API from the `servers` array in the spec.
    * It returns the URL of the first server listed, with any trailing slash removed.
    * Support for server variables templating is not included.
    * @returns The base URL string, or an empty string if no servers are defined or the first server URL is invalid.
    */
    getBaseUrl() {
        return this.spec.servers?.[0]?.url || '';
    }
    /**
    * Generates a JSON schema for the parameters of a given operation (including requestBody).
    * This schema is suitable for use in LLM tool definitions that expect a single schema object.
    * @param operationId The ID of the operation (must be within the current filter scope).
    * @returns A JSON schema object describing the operation's parameters.
    * @throws Error if the operation is not found.
    */
    getOperationParametersSchema(operationId) {
        const operation = this.getOperationById(operationId);
        if (!operation) {
            throw new Error(`Operation '${operationId}' not found or not within current filter scope (tag: ${this.currentTagFilter || 'none'}).`);
        }
        const properties = {};
        const requiredParams = [];
        operation.parameters?.forEach((param) => {
            // param.schema is already resolved by _initializeAndFilterOperations
            properties[param.name] = { ...param.schema }; // Create a copy
            if (param.description && !properties[param.name].description) {
                // Prefer param description if schema lacks one
                properties[param.name].description = param.description;
            }
            if (param.required) {
                requiredParams.push(param.name);
            }
        });
        if (operation.requestBodySchema) {
            const requestBodyParamName = 'requestBody'; // Standardized name
            properties[requestBodyParamName] = { ...operation.requestBodySchema }; // Create a copy, already resolved
            const rawOp = this._findRawOperationInSpec(operationId);
            if (rawOp?.requestBody) {
                const resolvedRawRequestBody = this.resolveRef(rawOp.requestBody);
                if (resolvedRawRequestBody?.description && !properties[requestBodyParamName].description) {
                    properties[requestBodyParamName].description = resolvedRawRequestBody.description;
                }
                if (resolvedRawRequestBody?.required) {
                    if (!requiredParams.includes(requestBodyParamName)) {
                        requiredParams.push(requestBodyParamName);
                    }
                }
            }
        }
        const schema = {
            type: 'object',
            properties,
        };
        if (requiredParams.length > 0) {
            schema.required = requiredParams.sort();
        }
        return schema;
    }
    /**
    * Helper to find the original raw operation definition from the full spec.
    * @param operationId The ID of the operation to find.
    * @returns The raw `RawOpenAPIOperation` object if found, otherwise `undefined`.
    */
    _findRawOperationInSpec(operationId) {
        for (const pathItem of Object.values(this.spec.paths)) {
            if (!pathItem)
                continue;
            const resolvedPathItem = this.resolveRef(pathItem);
            if (!resolvedPathItem)
                continue;
            const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
            for (const method of httpMethods) {
                const opOrRef = resolvedPathItem[method];
                if (opOrRef) {
                    const resolvedOp = this.resolveRef(opOrRef);
                    if (resolvedOp?.operationId === operationId) {
                        return resolvedOp;
                    }
                }
            }
        }
        return undefined;
    }
    /**
    * Resolves a `$ref` pointer within the OpenAPI specification.
    * Supports internal references (e.g., `#/components/schemas/User`).
    * @param obj The item that might be a reference object or any other value.
    * @returns The resolved item, the original item if not a supported $ref, or `null` on resolution failure.
    */
    resolveRef(obj) {
        if (!obj || typeof obj !== 'object')
            return obj;
        if (!obj.$ref)
            return obj;
        const refPath = obj.$ref;
        if (!refPath.startsWith('#')) {
            console.warn(`[SpecParser] External $ref not supported: ${refPath}`);
            return null;
        }
        const parts = refPath.slice(1).split('/');
        let resolvedItem = this.spec;
        for (const part of parts) {
            const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
            if (resolvedItem && typeof resolvedItem === 'object' && decodedPart in resolvedItem) {
                resolvedItem = resolvedItem[decodedPart];
            }
            else {
                console.warn(`[SpecParser] Failed to resolve $ref "${refPath}": part "${decodedPart}" not found.`);
                return null;
            }
        }
        return resolvedItem;
    }
    getSpec() {
        return this.spec;
    }
}
exports.OpenAPISpecParser = OpenAPISpecParser;
//# sourceMappingURL=spec-parser.js.map