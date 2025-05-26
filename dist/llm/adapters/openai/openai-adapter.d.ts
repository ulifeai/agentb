/**
 * @file Concrete implementation of ILLMClient using the OpenAI API.
 * This adapter handles making requests to OpenAI models (chat completions).
 */
import OpenAI from 'openai';
import { ILLMClient, LLMMessage, LLMMessageChunk, LLMToolChoice } from '../../types';
import { IToolDefinition } from '../../../core/tool';
/**
 * Configuration options for the OpenAIAdapter.
 */
export interface OpenAIAdapterOptions {
    apiKey?: string;
    organizationId?: string;
    baseURL?: string;
    defaultModel?: string;
}
export declare class OpenAIAdapter implements ILLMClient {
    private openai;
    private defaultModel;
    constructor(options?: OpenAIAdapterOptions);
    /**
     * Implements ILLMClient.generateResponse using OpenAI's Chat Completions API.
     * The `tools` option expects tools already formatted for OpenAI.
     */
    generateResponse(messages: LLMMessage[], options: {
        model?: string;
        tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
        tool_choice?: LLMToolChoice;
        stream?: boolean;
        temperature?: number;
        max_tokens?: number;
        systemPrompt?: string;
        [key: string]: any;
    }): Promise<LLMMessage | AsyncGenerator<LLMMessageChunk, void, unknown>>;
    /**
     * Maps our generic LLMMessage to OpenAI's specific ChatCompletionMessageParam union type.
     */
    private mapToOpenAIMessageParam;
    /**
     * Maps OpenAI's ChatCompletionMessage back to our generic LLMMessage.
     */
    private mapFromOpenAIChatCompletionMessage;
    /**
     * Maps our generic LLMToolChoice to OpenAI's specific format.
     */
    private mapToOpenAIToolChoice;
    /**
     * Handles streaming responses from OpenAI.
     */
    private streamOpenAIResponse;
    /**
     * Helper to identify stream termination chunks that might lack meaningful delta
     * but still carry a finish_reason, common in some OpenAI stream patterns.
     */
    private isStreamTerminationChunk;
    /**
     * Implements ILLMClient.countTokens.
     * Placeholder: Accurate token counting requires the 'tiktoken' library.
     */
    countTokens(messages: LLMMessage[], model: string): Promise<number>;
    /**
     * Implements ILLMClient.formatToolsForProvider.
     * Converts IToolDefinition[] to OpenAI's specific tool format.
     */
    formatToolsForProvider(toolDefinitions: IToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[];
    /**
     * Standardized error handling for OpenAI API calls.
     */
    private handleOpenAIError;
}
