"use strict";
/**
 * @file Adapts generic IToolDefinition objects to the format expected by OpenAI's
 *       function calling/tool usage feature (LLMToolFunctionDefinition).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adaptToolDefinitionToOpenAI = adaptToolDefinitionToOpenAI;
exports.adaptToolDefinitionsToOpenAI = adaptToolDefinitionsToOpenAI;
/**
 * Converts a generic IToolDefinition into an LLMToolFunctionDefinition,
 * specifically formatting parameters into OpenAI's expected single schema object.
 *
 * @param toolDefinition The generic tool definition (`IToolDefinition`).
 * @returns An `LLMToolFunctionDefinition` suitable for use with OpenAI models.
 * @throws Error if the tool definition name or parameter names are invalid for OpenAI.
 */
function adaptToolDefinitionToOpenAI(toolDefinition) {
    const properties = {};
    const requiredParams = [];
    // Validate tool name (OpenAI specific constraints)
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(toolDefinition.name)) {
        console.warn(`[OpenAIAdapter] Tool name "${toolDefinition.name}" may not be valid for OpenAI. Sanitizing or ensuring validity beforehand is recommended. Current OpenAI constraints: 1-64 chars, a-z, A-Z, 0-9, _, -.`);
        // Optionally, throw error or attempt sanitization here, though `sanitizeIdForLLM` should handle it upstream.
    }
    toolDefinition.parameters.forEach((param) => {
        // Validate parameter name (OpenAI specific constraints)
        if (!/^[a-zA-Z0-9_-]{1,64}$/.test(param.name)) {
            console.warn(`[OpenAIAdapter] Parameter name "${param.name}" for tool "${toolDefinition.name}" may not be valid for OpenAI. Ensure it meets constraints.`);
        }
        // Use param.schema if provided and valid, otherwise construct from type/description.
        // The IToolParameter's `schema` field should be a valid JSON schema for that parameter.
        let paramSchemaFragment = param.schema || { type: param.type || 'string' }; // Default to string if type missing
        // Ensure description from IToolParameter is included if not already in schema
        if (param.description && !paramSchemaFragment.description) {
            paramSchemaFragment.description = param.description;
        }
        // Ensure type is present if schema was provided without it but IToolParameter has it
        if (!paramSchemaFragment.type && param.type) {
            paramSchemaFragment.type = param.type;
        }
        // If no type could be determined, default to string for safety, though this indicates an issue in IToolParameter creation.
        if (!paramSchemaFragment.type) {
            console.warn(`[OpenAIAdapter] Parameter "${param.name}" for tool "${toolDefinition.name}" has no defined type. Defaulting to 'string'.`);
            paramSchemaFragment.type = 'string';
        }
        properties[param.name] = paramSchemaFragment;
        if (param.required) {
            requiredParams.push(param.name);
        }
    });
    const openAIParametersSchema = {
        type: 'object',
        properties: properties,
    };
    if (requiredParams.length > 0) {
        openAIParametersSchema.required = requiredParams.sort(); // Sort for deterministic output
    }
    return {
        name: toolDefinition.name, // Assumes name is already sanitized by ITool provider
        description: toolDefinition.description,
        parametersSchema: openAIParametersSchema,
    };
}
/**
 * Adapts an array of generic `IToolDefinition` objects to an array of
 * `LLMToolFunctionDefinition` objects suitable for OpenAI.
 *
 * @param toolDefinitions Array of generic tool definitions.
 * @returns Array of `LLMToolFunctionDefinition` objects.
 */
function adaptToolDefinitionsToOpenAI(toolDefinitions) {
    return toolDefinitions.map(adaptToolDefinitionToOpenAI);
}
//# sourceMappingURL=openai-tool-adapter.js.map