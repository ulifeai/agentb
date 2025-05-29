
/**
 * @file LLMResponseProcessor - Responsible for parsing raw LLM output (streaming or complete)
 * into structured events, specifically identifying text content and tool call requests.
 */

import { LLMMessageChunk, LLMToolCall } from '../llm/types';
import { ResponseProcessorConfig } from './config';
import { IToolProvider } from '../core/tool'; // May not be needed directly if only parsing
import { ApplicationError, LLMError } from '../core/errors';

/**
 * Represents an event yielded by the LLMResponseProcessor during parsing.
 */
export type ParsedLLMResponseEvent =
  | { type: 'text_chunk'; text: string }
  | { type: 'tool_call_detected'; toolCall: LLMToolCall } // For natively structured tool calls
  | {
      type: 'xml_tool_call_parsed';
      toolName: string;
      attributes: Record<string, string>;
      content?: string;
      rawXml: string;
    } // If supporting XML
  | { type: 'stream_end'; finishReason?: string | null; usage?: LLMMessageChunk['usage'] }
  | { type: 'error'; error: ApplicationError };

export class LLMResponseProcessor {
  private config: ResponseProcessorConfig;
  // private toolProvider: IToolProvider; // Potentially needed if validation against available tools happens here

  // For XML parsing state if enableXmlToolCalling is true
  private xmlBuffer: string = '';
  private openXmlTags: string[] = []; // Stack for nested XML tags

  constructor(
    config: ResponseProcessorConfig = {}
    // toolProvider?: IToolProvider // Optional: if validation of tool names is done during parsing
  ) {
    this.config = {
      enableNativeToolCalling: true, // Default
      enableXmlToolCalling: false, // Default
      maxXmlToolCalls: 0, // Default
      ...config,
    };
    // this.toolProvider = toolProvider;
    if (this.config.enableXmlToolCalling) {
      console.warn('[LLMResponseProcessor] XML tool calling is enabled but parsing logic is a TODO.');
    }
  }

  /**
   * Processes a complete (non-streaming) LLM message content and extracts tool calls and text.
   *
   * @param llmMessageContent The 'content' part of an LLM assistant message, or the full assistant message.
   * @param llmToolCalls Optional: The 'tool_calls' array directly from an LLM assistant message.
   * @returns An array of ParsedLLMResponseEvent (typically tool_call_detected and one stream_end).
   */
  public processCompleteResponse(
    llmMessageContent: string | null,
    llmToolCalls?: LLMToolCall[]
  ): ParsedLLMResponseEvent[] {
    const events: ParsedLLMResponseEvent[] = [];

    if (this.config.enableNativeToolCalling && llmToolCalls && llmToolCalls.length > 0) {
      for (const toolCall of llmToolCalls) {
        events.push({ type: 'tool_call_detected', toolCall });
      }
    }
    // TODO: Implement XML parsing from llmMessageContent if enableXmlToolCalling is true
    // This would involve regex or a simple XML parser to find <tool>...</tool> tags.

    if (llmMessageContent) {
      // If XML parsing is implemented, ensure text outside XML tags is also captured as 'text_chunk'
      // For now, assume all content is text if no native tool calls are primary.
      // This needs to be more sophisticated if mixing text and XML tool calls in content.
      if (!(this.config.enableNativeToolCalling && llmToolCalls && llmToolCalls.length > 0)) {
        // Only add content as text if no native tool calls are present,
        // or if XML parsing logic determines it's plain text.
        events.push({ type: 'text_chunk', text: llmMessageContent });
      }
    }

    events.push({ type: 'stream_end', finishReason: llmToolCalls && llmToolCalls.length > 0 ? 'tool_calls' : 'stop' });
    return events;
  }

  /**
   * Processes a stream of LLM message chunks and yields parsed events.
   *
   * @param llmStream An AsyncGenerator yielding LLMMessageChunk objects.
   * @returns An AsyncGenerator yielding ParsedLLMResponseEvent objects.
   */
  public async *processStream(
    llmStream: AsyncGenerator<LLMMessageChunk, void, unknown>
  ): AsyncGenerator<ParsedLLMResponseEvent, void, unknown> {
    // Buffers for assembling tool calls from chunks
    const toolCallBuffers: { [key: number]: Partial<LLMToolCall> & { function: { name: string; arguments: string } } } = {};

    try {
      for await (const chunk of llmStream) {
        if (chunk.content) {
          // TODO: If enableXmlToolCalling, buffer content and parse for XML tool calls.
          // For now, yield all content as text chunks if not part of native tool call assembly.
          // This logic needs to be more robust if XML tool calls are embedded within text.
          yield { type: 'text_chunk', text: chunk.content };
        }

      
        // Check if we have any tool calls in this chunk
        // if (chunk.tool_calls && chunk.tool_calls.length > 0) {
        //   console.debug(`[LLMResponseProcessor] Found ${chunk.tool_calls.length} with name ${chunk.tool_calls[0].function?.name} tool calls in chunk`);
        // }

        if (this.config.enableNativeToolCalling && chunk.tool_calls) {
          for (const tcChunk of chunk.tool_calls) {
            const index = tcChunk.index;
            if (!toolCallBuffers[index]) {
              toolCallBuffers[index] = { 
                id: tcChunk.id, 
                type: 'function', 
                function: { name: '', arguments: '' } 
              };
            }
            const buffer = toolCallBuffers[index];
            if (tcChunk.id) buffer.id = tcChunk.id;
            if (tcChunk.type) buffer.type = tcChunk.type;
            if (tcChunk.function?.name) buffer.function.name = (buffer.function.name || '') + tcChunk.function.name;
            if (tcChunk.function?.arguments) buffer.function.arguments = (buffer.function.arguments || '') + tcChunk.function.arguments;
          }
        }

        if (chunk.finish_reason) {
          // If stream ends, finalize any buffered tool calls
          for (const index in toolCallBuffers) {
            const bufferedCall = toolCallBuffers[index];
            if (bufferedCall.id && bufferedCall.function?.name && bufferedCall.function?.arguments) {
              try {
                // Validate JSON arguments before yielding
                JSON.parse(bufferedCall.function.arguments);
                yield {
                  type: 'tool_call_detected',
                  toolCall: {
                    id: bufferedCall.id,
                    type: 'function',
                    function: {
                      name: bufferedCall.function.name,
                      arguments: bufferedCall.function.arguments,
                    },
                  },
                };
              } catch (e) {
                const parseError = new LLMError(
                  `Failed to parse JSON arguments for tool call ${bufferedCall.function.name || 'unknown'}: ${(e as Error).message}`
                );
                yield { type: 'error', error: parseError };
                console.error(
                  `[LLMResponseProcessor] Error parsing tool arguments:`,
                  bufferedCall.function.arguments,
                  parseError
                );
              }
            } else {
              // Incomplete tool call when stream ended
              const incompleteError = new LLMError(`Incomplete tool call data at end of stream for index ${index}.`);
              yield { type: 'error', error: incompleteError };
              console.warn(`[LLMResponseProcessor] Incomplete tool call at stream end:`, bufferedCall);
            }
          }
          yield { type: 'stream_end', finishReason: chunk.finish_reason, usage: chunk.usage };
          return; // End of stream
        }
      }
    } catch (error: any) {
      const processingError = new LLMError(`Error processing LLM stream: ${error.message}`, undefined, {
        originalError: error,
      });
      yield { type: 'error', error: processingError };
      console.error(`[LLMResponseProcessor] Stream processing error:`, processingError);
    }
    // If the loop finishes without a finish_reason (should not happen with well-behaved streams)
    yield { type: 'stream_end', finishReason: 'unknown' };
  }

  // TODO: Implement XML parsing logic if enableXmlToolCalling is true
  // private parseXmlChunk(chunkContent: string): ParsedLLMResponseEvent[] {
  //   // This would involve regex or a simple XML parser
  //   // and maintain state for incomplete XML tags across chunks.
  //   // It would yield 'xml_tool_call_parsed' or 'text_chunk' events.
  //   return [];
  // }
}
