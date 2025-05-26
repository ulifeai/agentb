# LLM Integration: `ILLMClient` & `OpenAIAdapter`

At the core of any AI agent's intelligence is its interaction with a Large Language Model (LLM). AgentB abstracts these interactions through the `ILLMClient` interface, allowing for flexibility in choosing and potentially switching LLM providers.

## The `ILLMClient` Interface

The `ILLMClient` interface defines the standard contract for how agents communicate with an LLM. Any class that implements `ILLMClient` can be used by AgentB.

**Key Methods:**

1.  **`generateResponse(messages: LLMMessage[], options: { ... }): Promise<LLMMessage | AsyncGenerator<LLMMessageChunk, void, unknown>>`**
    *   **Purpose**: This is the primary method for getting a response from the LLM.
    *   **`messages: LLMMessage[]`**: An array of `LLMMessage` objects representing the conversation history and current prompt. The `LLMMessage` structure includes:
        *   `role: 'system' | 'user' | 'assistant' | 'tool'`
        *   `content: string | Array<{type:'text',...} | {type:'image_url',...}>`
        *   `name?`: Optional name, used for `tool` role or some `assistant` responses.
        *   `tool_calls?`: For `assistant` messages, if the LLM requests tool usage.
        *   `tool_call_id?`: For `tool` messages, linking back to a `tool_calls` request.
    *   **`options: { ... }`**: An object containing various parameters for the LLM call:
        *   `model: string` (Mandatory in options passed to `generateResponse`): The specific model ID to use (e.g., "gpt-4o-mini").
        *   `tools?: any[]`: An array of tool definitions formatted specifically for the target LLM provider (e.g., OpenAI's function/tool format). The `ILLMClient` implementation is expected to know how to use this.
        *   `tool_choice?: LLMToolChoice`: Controls how the LLM decides to use tools (e.g., `'auto'`, `'none'`, `'required'`, or forcing a specific function).
        *   `stream?: boolean`: If `true`, the method returns an `AsyncGenerator` yielding `LLMMessageChunk` objects for real-time streaming. If `false` or undefined, it returns a `Promise<LLMMessage>` with the complete response.
        *   `temperature?: number`: Controls response randomness.
        *   `max_tokens?: number`: Maximum tokens for the LLM's generated response.
        *   `systemPrompt?: string`: Some adapters might allow a direct override or augmentation of the system message here, though typically the system message is part of the `messages` array.
        *   `[otherOptions: string]: any`: Allows passing additional provider-specific parameters.
    *   **Returns**:
        *   If `stream: true`: `AsyncGenerator<LLMMessageChunk, void, unknown>`
        *   If `stream: false` (or undefined): `Promise<LLMMessage>`

2.  **`countTokens(messages: LLMMessage[], model: string): Promise<number>`**
    *   **Purpose**: Estimates the number of tokens that a given list of messages would consume for a specific model.
    *   **Crucial for `ContextManager`**: Helps manage the LLM's context window by determining if history needs to be summarized or truncated.
    *   **Implementation Note**: Accurate token counting is provider-specific. For OpenAI, this typically involves using a library like `tiktoken`.

3.  **`formatToolsForProvider(toolDefinitions: IToolDefinition[]): any[]`** (Optional but highly recommended for adapters)
    *   **Purpose**: Converts an array of AgentB's generic `IToolDefinition` objects into the specific format required by the LLM provider's API for tool/function calling.
    *   For example, `OpenAIAdapter` uses this to transform `IToolDefinition`s into OpenAI's chat completion tool format.
    *   If an `ILLMClient` implementation doesn't provide this, the component calling `generateResponse` (like `BaseAgent`) would need to format tools itself or rely on a default formatting mechanism.

## `OpenAIAdapter`: The Default Implementation

AgentB comes with `OpenAIAdapter`, a concrete implementation of `ILLMClient` for interacting with OpenAI's Chat Completions API (including models like GPT-3.5-turbo, GPT-4, GPT-4o, GPT-4o-mini etc.).

**Initialization (`new OpenAIAdapter(options)`):**
```typescript
interface OpenAIAdapterOptions {
  apiKey?: string; // Defaults to process.env.OPENAI_API_KEY
  organizationId?: string; // Defaults to process.env.OPENAI_ORG_ID
  baseURL?: string; // To use with proxies or compatible APIs
  defaultModel?: string; // e.g., 'gpt-4o-mini', used if 'model' not in generateResponse options
}

import { OpenAIAdapter } from '@ulifeai/agentb';
const openaiClient = new OpenAIAdapter({
  // apiKey: "sk-...", // Or from .env
  defaultModel: 'gpt-4o-mini'
});
```

**Key Behaviors of `OpenAIAdapter`:**

*   **API Calls**: Uses the official `openai` Node.js SDK.
*   **Message Mapping**: Maps AgentB's `LLMMessage` to OpenAI's `ChatCompletionMessageParam` structure and vice-versa.
*   **Tool Formatting**: Implements `formatToolsForProvider` using `adaptToolDefinitionsToOpenAI` to convert `IToolDefinition` into the JSON schema format OpenAI expects for functions/tools.
*   **Streaming**: Correctly handles OpenAI's streaming API, yielding `LLMMessageChunk` objects that include `content` deltas, `tool_calls` deltas, and `finish_reason`.
*   **Error Handling**: Catches errors from the OpenAI SDK and re-throws them as standardized `LLMError` objects with more context.
*   **Token Counting (Basic)**: Currently provides a rough string-length-based estimate for `countTokens`. For production accuracy with OpenAI, integrating `tiktoken` directly or enhancing the adapter would be necessary.

## Using `ILLMClient` in `IAgentContext`

When an agent runs, its `IAgentContext` contains an `llmClient` property, which is an instance of an `ILLMClient`.

```typescript
// Inside an agent's run method
async *run(agentContext: IAgentContext, initialMessages: LLMMessage[]) {
  const { llmClient, runConfig, /* ...other context props */ } = agentContext;

  const messagesForLLM = [/* ... assembled messages ... */];
  const toolsForLLM = [/* ... formatted tools for the provider ... */];

  const responseStream = await llmClient.generateResponse(
    messagesForLLM,
    {
      model: runConfig.model, // From AgentRunConfig
      tools: toolsForLLM,
      tool_choice: runConfig.toolChoice,
      stream: true,
      temperature: runConfig.temperature,
      // ... other options from runConfig ...
    }
  ) as AsyncGenerator<LLMMessageChunk, void, unknown>; // Assert stream is true

  // Process the responseStream...
}
```

## Extending with Other LLM Providers

To use a different LLM provider (e.g., Anthropic Claude, Google Gemini):

1.  **Create a New Adapter Class**:
    ```typescript
    import { ILLMClient, LLMMessage, LLMMessageChunk, IToolDefinition /* ... */ } from '@ulifeai/agentb';

    class MyCustomLlmAdapter implements ILLMClient {
      // Constructor to take API keys, endpoint URLs, etc.

      async generateResponse(messages: LLMMessage[], options: { /* ... */ }) {
        // Logic to call your LLM provider's API
        // Map LLMMessages to their format
        // Handle streaming if supported, yielding LLMMessageChunks
        // Map their response back to LLMMessage or LLMMessageChunks
        // Handle errors and throw LLMError
      }

      async countTokens(messages: LLMMessage[], model: string): Promise<number> {
        // Implement token counting for your provider
      }

      formatToolsForProvider(toolDefinitions: IToolDefinition[]): any[] {
        // Convert IToolDefinitions to your provider's tool format
      }
    }
    ```

2.  **Use it in Configuration**:
    When initializing `AgentB` or `ApiInteractionManager`, provide an instance of your custom adapter:
    ```typescript
    // In AgentB.initialize (conceptual if direct instance passing is supported)
    // AgentB.initialize({ llmClientInstance: new MyCustomLlmAdapter(...) });

    // Or more typically with ApiInteractionManager
    const customLlm = new MyCustomLlmAdapter(...);
    const aim = new ApiInteractionManager({
      llmClient: customLlm,
      mode: 'genericOpenApi',
      // ... other options
    });
    ```

The `ILLMClient` interface ensures that the rest of the AgentB framework (agents, context manager, etc.) can operate consistently, regardless of the underlying LLM provider, as long as the adapter correctly implements the contract. 