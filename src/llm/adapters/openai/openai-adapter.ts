// src/llm/adapters/openai/openai-adapter.ts

/**
 * @file Concrete implementation of ILLMClient using the OpenAI API.
 * This adapter handles making requests to OpenAI models (chat completions).
 */

import OpenAI from 'openai'; // Official OpenAI SDK
import {
  ILLMClient,
  LLMMessage,
  LLMMessageChunk,
  LLMToolChoice,
  LLMMessageRole, // Ensure LLMMessageRole is correctly imported/used
} from '../../types'; // Correct path to local types.ts
import { IToolDefinition } from '../../../core/tool'; // Correct path to core/tool.ts
import { adaptToolDefinitionsToOpenAI } from './openai-tool-adapter';
import { ConfigurationError, LLMError } from '../../../core/errors'; // Correct path to core/errors

/**
 * Configuration options for the OpenAIAdapter.
 */
export interface OpenAIAdapterOptions {
  apiKey?: string;
  organizationId?: string;
  baseURL?: string;
  defaultModel?: string;
}

export class OpenAIAdapter implements ILLMClient {
  private openai: OpenAI;
  private defaultModel: string;

  constructor(options?: OpenAIAdapterOptions) {
    const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError(
        'OpenAI API key is required. Provide it in options or set OPENAI_API_KEY environment variable.'
      );
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
      organization: options?.organizationId || process.env.OPENAI_ORG_ID,
      baseURL: options?.baseURL,
    });

    this.defaultModel = options?.defaultModel || 'gpt-4o';
    console.info(
      `[OpenAIAdapter] Initialized with default model: ${this.defaultModel}. BaseURL: ${options?.baseURL || 'OpenAI Default'}`
    );
  }

  /**
   * Implements ILLMClient.generateResponse using OpenAI's Chat Completions API.
   * The `tools` option expects tools already formatted for OpenAI.
   */
  async generateResponse(
    messages: LLMMessage[],
    options: {
      model?: string;
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      tool_choice?: LLMToolChoice;
      stream?: boolean;
      temperature?: number;
      max_tokens?: number;
      systemPrompt?: string;
      [key: string]: any;
    }
  ): Promise<LLMMessage | AsyncGenerator<LLMMessageChunk, void, unknown>> {

    const {
      model: _m,
      tools,
      tool_choice,
      stream,
      temperature,
      max_tokens,
      systemPrompt,
      ...otherOptions
    } = options;

    const modelToUse = options.model || this.defaultModel;

    console.info(`[OpenAIAdapter] Sending request to OpenAI with model: ${modelToUse}`);
    console.debug('[OpenAIAdapter] Request details:', JSON.stringify({
      messages,
      options: {
        ...options,
        tools: options.tools ? `${options.tools.length} tools configured` : 'no tools',
        tool_choice: options.tool_choice || 'none'
      }
    }));

    let preparedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(
      (msg) => this.mapToOpenAIMessageParam(msg) // Use the corrected mapping function
    );

    if (options.systemPrompt) {
      const systemMessageIndex = preparedMessages.findIndex((m) => m.role === 'system');
      // Ensure mapToOpenAIMessageParam handles system role correctly.
      const newSystemMessage = this.mapToOpenAIMessageParam({ role: 'system', content: options.systemPrompt });
      if (systemMessageIndex !== -1) {
        preparedMessages[systemMessageIndex] = newSystemMessage;
      } else {
        preparedMessages.unshift(newSystemMessage);
      }
    } else if (!preparedMessages.some((m) => m.role === 'system')) {
      preparedMessages.unshift(
        this.mapToOpenAIMessageParam({ role: 'system', content: 'You are a helpful assistant.' })
      );
    }

    const requestPayload: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: modelToUse,
      messages: preparedMessages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      tools: options.tools,
      stream: options.stream,
      tool_choice: options.tool_choice ? this.mapToOpenAIToolChoice(options.tool_choice) : undefined,
      ...otherOptions,
    };

    if (options.tools) {
      console.info(`[OpenAIAdapter] Tools configured:`, options.tools.map(tool => ({
        type: tool.type,
        function: {
          name: tool.function.name,
          description: tool.function.description?.slice(0, 100) + '...' // Truncate long descriptions
        }
      })));
    }

    if (options.stream) {
      requestPayload.stream = true;
      return this.streamOpenAIResponse(requestPayload as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);
    } else {
      try {
        const completion = await this.openai.chat.completions.create(
          requestPayload as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
        );
        if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message) {
          throw new LLMError('OpenAI response missing choices or message.', 'api_error', { response: completion });
        }
        return this.mapFromOpenAIChatCompletionMessage(completion.choices[0].message, completion.usage);
      } catch (error: any) {
        this.handleOpenAIError(error);
        // This line should logically not be reached if handleOpenAIError always throws.
        // Adding a more specific error to satisfy TypeScript's control flow analysis if needed.
        throw new LLMError('Unhandled error after OpenAI non-streaming call: ' + (error.message || 'Unknown error'));
      }
    }
  }

  /**
   * Maps our generic LLMMessage to OpenAI's specific ChatCompletionMessageParam union type.
   */
  private mapToOpenAIMessageParam(message: LLMMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
    switch (message.role) {
      case 'system':
        if (typeof message.content !== 'string')
          throw new ConfigurationError('System message content must be a string.');
        return { role: 'system', content: message.content };
      case 'user':
        // User message can have string content or array for multipart (text/image)
        if (typeof message.content === 'string') {
          return { role: 'user', content: message.content, name: message.name };
        } else if (Array.isArray(message.content)) {
          const mappedContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = message.content.map((part) => {
            if (part.type === 'text') return { type: 'text', text: part.text };
            if (part.type === 'image_url') return { type: 'image_url', image_url: part.image_url }; // Assuming structure matches
            throw new ConfigurationError(`Unsupported user message content part type: ${(part as any).type}`);
          });
          return { role: 'user', content: mappedContent, name: message.name };
        }
        throw new ConfigurationError('User message content must be a string or valid array of parts.');
      case 'assistant':
        const assistantParam: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: typeof message.content === 'string' ? message.content : null, // Can be null if only tool_calls
          name: message.name,
        };
        if (message.tool_calls) {
          assistantParam.tool_calls = message.tool_calls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        return assistantParam;
      case 'tool':
        if (!message.tool_call_id) throw new ConfigurationError("Message with role 'tool' must have a 'tool_call_id'.");
        if (typeof message.content !== 'string')
          throw new ConfigurationError('Tool message content must be a string for OpenAI.');
        return {
          role: 'tool',
          content: message.content,
          // name: message.name,
          tool_call_id: message.tool_call_id,
        };
      default:
        // Should not happen if LLMMessageRole is used correctly
        throw new ConfigurationError(`Unsupported message role: ${(message as any).role}`);
    }
  }

  /**
   * Maps OpenAI's ChatCompletionMessage back to our generic LLMMessage.
   */
  private mapFromOpenAIChatCompletionMessage(
    openAIMessage: OpenAI.Chat.Completions.ChatCompletionMessage,
    usage?: OpenAI.Completions.CompletionUsage // TODO: Propagate usage if needed
  ): LLMMessage {
    const message: LLMMessage = {
      role: openAIMessage.role as LLMMessageRole, // 'assistant' typically from response
      content: openAIMessage.content || '', // Ensure content is string. Multipart responses not typical for assistant.
      name: undefined, // OpenAI assistant message can have 'name' . removed openAIMessage.name ||
    };
    if (openAIMessage.tool_calls) {
      message.tool_calls = openAIMessage.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type as 'function',
        function: {
          name: tc.function.name || '',
          arguments: tc.function.arguments || '',
        },
      }));
    }
    return message;
  }

  /**
   * Maps our generic LLMToolChoice to OpenAI's specific format.
   */
  private mapToOpenAIToolChoice(toolChoice: LLMToolChoice): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption {
    if (typeof toolChoice === 'string') {
      // Valid string options for OpenAI are "none", "auto", "required"
      if (toolChoice === 'none' || toolChoice === 'auto' || toolChoice === 'required') {
        return toolChoice;
      }
      // If our generic 'required' was meant as "any tool must be called", OpenAI's "required" string matches.
      // If it's an invalid string, default to 'auto' or throw.
      console.warn(
        `[OpenAIAdapter] Invalid string for LLMToolChoice "${toolChoice}". Defaulting to 'auto'. Valid strings: 'auto', 'none', 'required'.`
      );
      return 'auto';
    }
    // Object form for specific function: { type: "function", function: { name: "my_tool_name" } }
    if (toolChoice.type === 'function' && toolChoice.function?.name) {
      return { type: 'function', function: { name: toolChoice.function.name } };
    }
    throw new ConfigurationError(`Invalid object structure for LLMToolChoice: ${JSON.stringify(toolChoice)}`);
  }

  /**
   * Handles streaming responses from OpenAI.
   */
  private async *streamOpenAIResponse(
    requestPayload: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
  ): AsyncGenerator<LLMMessageChunk, void, unknown> {
    try {
      const stream = await this.openai.chat.completions.create(requestPayload);
      for await (const chunk of stream) {
        // console.log('[OpenAIAdapter] Stream chunk:', JSON.stringify(chunk, null, 2));
        // Check for chunks that signal termination but might have empty delta
        if (this.isStreamTerminationChunk(chunk) && chunk.choices[0].finish_reason) {
          yield { finish_reason: chunk.choices[0].finish_reason, usage: chunk.usage ?? undefined };
          continue;
        }
        // Standard check for valid delta
        if (!chunk.choices || chunk.choices.length === 0 || !chunk.choices[0].delta) {
          if (chunk.usage) yield { usage: chunk.usage }; // Handle usage-only chunks
          continue;
        }

        const delta = chunk.choices[0].delta;
        const finish_reason = chunk.choices[0].finish_reason;
        const mappedChunk: LLMMessageChunk = {};

        if (delta.role) mappedChunk.role = delta.role as LLMMessageRole;
        // Only assign content if it's not undefined. Null is a valid value from delta.
        if (delta.content !== undefined) mappedChunk.content = delta.content;
        

        if (delta.tool_calls) {
          mappedChunk.tool_calls = delta.tool_calls
            .map((tc) => {
              if (tc.index === undefined) return null; // Index is required for streamed tool calls
              return {
                index: tc.index,
                id: tc.id,
                type: tc.type as 'function' | undefined,
                function: {
                  name: tc.function?.name,
                  arguments: tc.function?.arguments,
                },
              };
            })
            .filter(
              (tc) => tc !== null && (tc.id || tc.function?.name || tc.function?.arguments)
            ) as LLMMessageChunk['tool_calls']; // Ensure type and filter out empty
          if (mappedChunk.tool_calls && mappedChunk.tool_calls.length === 0) {
            delete mappedChunk.tool_calls;
          }
        }

        if (finish_reason) mappedChunk.finish_reason = finish_reason;
        if (chunk.usage) mappedChunk.usage = chunk.usage;

        if (Object.keys(mappedChunk).length > 0) {
          yield mappedChunk;
        }
      }
    } catch (error: any) {
      this.handleOpenAIError(error);
    }
  }

  /**
   * Helper to identify stream termination chunks that might lack meaningful delta
   * but still carry a finish_reason, common in some OpenAI stream patterns.
   */
  private isStreamTerminationChunk(chunk: OpenAI.Chat.Completions.ChatCompletionChunk): boolean {
    return (
      chunk.choices &&
      chunk.choices.length > 0 &&
      chunk.choices[0].finish_reason !== null && // Has a finish reason
      chunk.choices[0].delta !== undefined && // Delta object exists
      Object.keys(chunk.choices[0].delta).length === 0
    ); // But delta object is empty (e.g. {} )
  }

  /**
   * Implements ILLMClient.countTokens.
   * Placeholder: Accurate token counting requires the 'tiktoken' library.
   */
  async countTokens(messages: LLMMessage[], model: string): Promise<number> {
    // ... (Rough estimate logic remains the same as previously provided) ...
    console.warn(
      `[OpenAIAdapter] Token counting for model "${model}" is using a rough estimate. ` +
        `For accurate counts, integrate 'tiktoken' or use an LLM provider's counting API if available.`
    );
    let roughTokenCount = 0;
    for (const message of messages) {
      roughTokenCount += (message.role?.length || 0) / 4 + 5;
      if (typeof message.content === 'string') {
        roughTokenCount += Math.ceil(message.content.length / 4);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            roughTokenCount += Math.ceil(part.text.length / 4);
          } else if (part.type === 'image_url') {
            roughTokenCount += message.content.length > 1 ? 250 : 85;
          }
        }
      }
      if (message.tool_calls) {
        roughTokenCount += Math.ceil(JSON.stringify(message.tool_calls).length / 4) + 10;
      }
      if (message.tool_call_id) {
        roughTokenCount += Math.ceil(message.tool_call_id.length / 4) + 5;
      }
      if (message.name) {
        roughTokenCount += Math.ceil(message.name.length / 4) + 5;
      }
    }
    return Math.ceil(roughTokenCount);
  }

  /**
   * Implements ILLMClient.formatToolsForProvider.
   * Converts IToolDefinition[] to OpenAI's specific tool format.
   */
  public formatToolsForProvider(toolDefinitions: IToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    const adaptedProviderFormats = adaptToolDefinitionsToOpenAI(toolDefinitions);
    return adaptedProviderFormats.map((adaptedTool) => ({
      type: 'function',
      function: {
        name: adaptedTool.name,
        description: adaptedTool.description,
        // parametersSchema is already the { type: "object", properties: ... } object
        parameters: adaptedTool.parametersSchema,
      },
    }));
  }

  /**
   * Standardized error handling for OpenAI API calls.
   */
  private handleOpenAIError(error: any): void {
    // ... (Error handling logic remains the same as previously provided) ...
    if (error instanceof OpenAI.APIError) {
      const statusCode = error.status;
      const errorType = error.type || (error as any).code || 'openai_api_error';
      let message = error.message;
      if (
        error.error &&
        typeof error.error === 'object' &&
        'message' in error.error &&
        typeof error.error.message === 'string'
      ) {
        message = error.error.message;
      }
      console.error(`[OpenAIAdapter] OpenAI API Error (Status: ${statusCode}, Type: ${errorType}): ${message}`, {
        headers: error.headers,
        errorDetails: error.error,
      });
      throw new LLMError(message, errorType, {
        statusCode,
        provider: 'openai',
        headers: error.headers,
        errorBody: error.error,
      });
    } else if (error instanceof Error) {
      console.error('[OpenAIAdapter] Unexpected SDK or network error:', error);
      throw new LLMError(error.message || 'An unexpected error occurred while interacting with OpenAI.', 'sdk_error', {
        provider: 'openai',
        originalErrorName: error.name,
      });
    } else {
      console.error('[OpenAIAdapter] Unknown error type during OpenAI interaction:', error);
      throw new LLMError('An unknown error occurred with OpenAI.', 'unknown_sdk_error', {
        provider: 'openai',
        originalError: String(error),
      });
    }
  }
}
