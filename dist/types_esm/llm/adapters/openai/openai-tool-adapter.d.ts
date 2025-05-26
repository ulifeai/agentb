/**
 * @file Adapts generic IToolDefinition objects to the format expected by OpenAI's
 *       function calling/tool usage feature (LLMToolFunctionDefinition).
 */
import { IToolDefinition } from '../../../core/tool';
import { LLMToolFunctionDefinition } from '../../types';
/**
 * Converts a generic IToolDefinition into an LLMToolFunctionDefinition,
 * specifically formatting parameters into OpenAI's expected single schema object.
 *
 * @param toolDefinition The generic tool definition (`IToolDefinition`).
 * @returns An `LLMToolFunctionDefinition` suitable for use with OpenAI models.
 * @throws Error if the tool definition name or parameter names are invalid for OpenAI.
 */
export declare function adaptToolDefinitionToOpenAI(toolDefinition: IToolDefinition): LLMToolFunctionDefinition;
/**
 * Adapts an array of generic `IToolDefinition` objects to an array of
 * `LLMToolFunctionDefinition` objects suitable for OpenAI.
 *
 * @param toolDefinitions Array of generic tool definitions.
 * @returns Array of `LLMToolFunctionDefinition` objects.
 */
export declare function adaptToolDefinitionsToOpenAI(toolDefinitions: IToolDefinition[]): LLMToolFunctionDefinition[];
