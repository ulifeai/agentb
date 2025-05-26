"use strict";
// src/llm/types.ts
Object.defineProperty(exports, "__esModule", { value: true });
// src/llm/types.ts
/**
 * @file Defines types specific to LLM interactions, particularly for tool definitions
 *       in formats expected by certain LLM providers like OpenAI.
 */
/**
 * Describes the structure of a tool function specifically for LLMs like OpenAI,
 * which typically expect a single, consolidated JSON schema object for all parameters.
 */
// export interface LLMToolFunctionDefinition {
//   /**
//    * The name of the tool. Must be a-z, A-Z, 0-9, or contain underscores and dashes,
//    * with a maximum length of 64 characters (OpenAI requirement).
//    */
//   name: string;
//   /**
//    * A description of what the function does, used by the model to choose when and
//    * how to call the function.
//    */
//   description: string;
//   /**
//    * The parameters the functions accepts, described as a JSON Schema object.
//    * The top level of this schema MUST be of type 'object'.
//    * @see https://platform.openai.com/docs/guides/function-calling
//    * @example
//    * {
//    *   type: 'object',
//    *   properties: {
//    *     location: { type: 'string', description: 'The city and state, e.g. San Francisco, CA' },
//    *     unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
//    *   },
//    *   required: ['location']
//    * }
//    */
//   parametersSchema: {
//     type: 'object';
//     properties: Record<string, any>; // Each property is a JSON schema definition for a parameter
//     required?: string[];
//   };
// }
// Additional LLM-specific types can be added here as the project evolves.
// For example:
// - Types for LLM chat message structures (user, assistant, system, tool/function call, tool/function result).
// - Types for specific LLM provider responses.
//# sourceMappingURL=types.js.map