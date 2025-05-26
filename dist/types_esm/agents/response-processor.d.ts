/**
 * @file LLMResponseProcessor - Responsible for parsing raw LLM output (streaming or complete)
 * into structured events, specifically identifying text content and tool call requests.
 */
import { LLMMessageChunk, LLMToolCall } from '../llm/types';
import { ResponseProcessorConfig } from './config';
import { ApplicationError } from '../core/errors';
/**
 * Represents an event yielded by the LLMResponseProcessor during parsing.
 */
export type ParsedLLMResponseEvent = {
    type: 'text_chunk';
    text: string;
} | {
    type: 'tool_call_detected';
    toolCall: LLMToolCall;
} | {
    type: 'xml_tool_call_parsed';
    toolName: string;
    attributes: Record<string, string>;
    content?: string;
    rawXml: string;
} | {
    type: 'stream_end';
    finishReason?: string | null;
    usage?: LLMMessageChunk['usage'];
} | {
    type: 'error';
    error: ApplicationError;
};
export declare class LLMResponseProcessor {
    private config;
    private xmlBuffer;
    private openXmlTags;
    constructor(config?: ResponseProcessorConfig);
    /**
     * Processes a complete (non-streaming) LLM message content and extracts tool calls and text.
     *
     * @param llmMessageContent The 'content' part of an LLM assistant message, or the full assistant message.
     * @param llmToolCalls Optional: The 'tool_calls' array directly from an LLM assistant message.
     * @returns An array of ParsedLLMResponseEvent (typically tool_call_detected and one stream_end).
     */
    processCompleteResponse(llmMessageContent: string | null, llmToolCalls?: LLMToolCall[]): ParsedLLMResponseEvent[];
    /**
     * Processes a stream of LLM message chunks and yields parsed events.
     *
     * @param llmStream An AsyncGenerator yielding LLMMessageChunk objects.
     * @returns An AsyncGenerator yielding ParsedLLMResponseEvent objects.
     */
    processStream(llmStream: AsyncGenerator<LLMMessageChunk, void, unknown>): AsyncGenerator<ParsedLLMResponseEvent, void, unknown>;
}
