# API Reference: Key Interfaces

This page provides a reference for the core interfaces in the `@ulifeai/agentb` framework. Implementing or understanding these interfaces is crucial for extending AgentB or comprehending its internal workings.

## `IAgent`

Defines the contract for an executable agent.

**Import:**
```typescript
import { IAgent, IAgentContext, AgentEvent, LLMMessage } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface IAgent {
  run(
    agentContext: IAgentContext,
    initialTurnMessages: LLMMessage[]
  ): AsyncGenerator<AgentEvent, void, undefined>;

  submitToolOutputs?(
    agentContext: IAgentContext,
    toolCallOutputs: Array<{ tool_call_id: string; output: string; tool_name?: string }>
  ): AsyncGenerator<AgentEvent, void, undefined>;

  cancelRun?(agentContext: IAgentContext): Promise<void>;
}
```

*   **`run(agentContext, initialTurnMessages)`**:
    *   The main execution method for the agent.
    *   `agentContext: IAgentContext`: Provides all dependencies and configuration for the run.
    *   `initialTurnMessages: LLMMessage[]`: Messages that initiate this turn (e.g., new user input, or tool results from a previous `requires_action` state).
    *   **Returns**: `AsyncGenerator<AgentEvent, void, undefined>` - Yields `AgentEvent`s detailing the agent's progress.
*   **`submitToolOutputs?(agentContext, toolCallOutputs)`** (Optional):
    *   Handles submission of tool outputs if the agent paused in a `requires_action` state.
    *   `toolCallOutputs`: Array of objects containing `tool_call_id`, `output` (string), and optional `tool_name`.
    *   **Returns**: `AsyncGenerator<AgentEvent, void, undefined>` - Yields further `AgentEvent`s as the run continues.
*   **`cancelRun?(agentContext)`** (Optional):
    *   Initiates a cooperative cancellation of the current agent run.
    *   **Returns**: `Promise<void>` - Resolves when cancellation is acknowledged/processed.

**Implementations**: `BaseAgent`, `PlanningAgent`.

---

## `ITool`

Defines the contract for a tool that an agent can use.

**Import:**
```typescript
import { ITool, IToolDefinition, IToolResult, IAgentContext } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface ITool<Input = Record<string, any>, OutputData = any> {
  getDefinition(): Promise<IToolDefinition<Input, OutputData>> | IToolDefinition<Input, OutputData>;
  execute(input: Input, agentContext?: IAgentContext): Promise<IToolResult<OutputData>>;
}
```

*   **`getDefinition()`**:
    *   Returns (or a Promise of) an `IToolDefinition` object, which describes the tool's name, purpose, and parameters to the LLM.
*   **`execute(input, agentContext?)`**:
    *   Contains the tool's actual logic.
    *   `input: Input`: Arguments for the tool, provided by the LLM based on the tool's definition.
    *   `agentContext?: IAgentContext` (Optional): Access to the agent's runtime context.
    *   **Returns**: `Promise<IToolResult<OutputData>>` - The outcome of the tool's execution.
        *   `IToolResult`: `{ success: boolean; data: OutputData; error?: string; metadata?: Record<string, any> }`

**Related**: `IToolDefinition`, `IToolParameter`, `IToolResult`.

---

## `IToolProvider`

Defines the contract for a component that supplies tools to an agent.

**Import:**
```typescript
import { IToolProvider, ITool } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface IToolProvider {
  getTools(): Promise<ITool[]>;
  getTool(toolName: string): Promise<ITool | undefined>;
  ensureInitialized?(): Promise<void>; // Optional
}
```

*   **`getTools()`**:
    *   **Returns**: `Promise<ITool[]>` - All tools provided by this instance.
*   **`getTool(toolName)`**:
    *   **Returns**: `Promise<ITool | undefined>` - A specific tool by name.
*   **`ensureInitialized?()`** (Optional):
    *   Ensures the provider is ready (e.g., `OpenAPIConnector` loads its spec).

**Implementations**: `OpenAPIConnector`, `AggregatedToolProvider`, custom providers.

---

## `IToolSet`

Represents a named collection or logical group of tools.

**Import:**
```typescript
import { IToolSet, ITool } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface IToolSet {
  id: string;          // Unique identifier (e.g., "user_management_tools")
  name: string;        // Human-readable name
  description: string; // Description of the toolset's capabilities
  tools: ITool[];      // The actual ITool instances
  metadata?: Record<string, any>; // Additional metadata
}
```
Used by `ToolsetOrchestrator` and `DelegateToSpecialistTool`.

---

## `ILLMClient`

Abstracts interactions with a Large Language Model.

**Import:**
```typescript
import { ILLMClient, LLMMessage, LLMMessageChunk, IToolDefinition /* ... */ } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface ILLMClient {
  generateResponse(
    messages: LLMMessage[],
    options: {
      model: string;
      tools?: any[]; // Provider-specific tool format
      tool_choice?: LLMToolChoice;
      stream?: boolean;
      temperature?: number;
      max_tokens?: number;
      systemPrompt?: string;
      [otherOptions: string]: any;
    }
  ): Promise<LLMMessage | AsyncGenerator<LLMMessageChunk, void, unknown>>;

  countTokens(messages: LLMMessage[], model: string): Promise<number>;

  formatToolsForProvider?(toolDefinitions: IToolDefinition[]): any[]; // Optional but highly recommended
}
```

*   **`generateResponse(messages, options)`**: Core method to get LLM output (streaming or complete).
*   **`countTokens(messages, model)`**: Estimates token count.
*   **`formatToolsForProvider?(toolDefinitions)`**: Converts generic `IToolDefinition`s to the LLM provider's specific format.

**Implementations**: `OpenAIAdapter`.
**Related**: `LLMMessage`, `LLMMessageChunk`, `LLMToolCall`, `LLMToolChoice`.

---

## `IThread`

Represents a conversation thread.

**Import:**
```typescript
import { IThread } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface IThread {
  id: string;
  createdAt: Date;
  updatedAt?: Date;
  title?: string;
  userId?: string;
  metadata?: Record<string, any>;
  summary?: string; // Optional: for context management
}
```

---

## `IMessage`

Represents a single message within a thread.

**Import:**
```typescript
import { IMessage, LLMMessageRole } from '@ulifeai/agentb';
```

**Interface:**
```typescript
interface IMessage {
  id: string;
  threadId: string;
  role: LLMMessageRole; // 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }>;
  createdAt: Date;
  updatedAt?: Date;
  metadata?: {
    tool_calls?: LLMToolCall[];
    tool_call_id?: string;
    name?: string; // For tool role, the function name
    [key: string]: any;
  };
}
```

---

## Storage Interfaces

These define contracts for data persistence.

**Import:**
```typescript
import { IThreadStorage, IMessageStorage, IAgentRunStorage /* ... */ } from '@ulifeai/agentb';
```

*   **`IThreadStorage`**:
    *   `createThread(data?): Promise<IThread>`
    *   `getThread(threadId): Promise<IThread | null>`
    *   `updateThread(threadId, updates): Promise<IThread>`
    *   `deleteThread(threadId): Promise<void>`
    *   `listThreads(filters?, pagination?): Promise<IThread[]>`
*   **`IMessageStorage`**:
    *   `addMessage(data): Promise<IMessage>`
    *   `getMessages(threadId, options?): Promise<IMessage[]>` (`IMessageQueryOptions`)
    *   `updateMessage(messageId, updates): Promise<IMessage>`
    *   `deleteMessage(messageId): Promise<void>`
*   **`IAgentRunStorage`**:
    *   `createRun(data): Promise<IAgentRun>`
    *   `getRun(runId): Promise<IAgentRun | null>`
    *   `updateRun(runId, updates): Promise<IAgentRun>`

**Implementations**: `MemoryStorage` (default), conceptual stubs for `SqlStorage`, `MongoDbStorage`.
**Related**: `IAgentRun`, `IMessageQueryOptions`.

---

This reference provides a quick lookup for the primary interfaces used throughout the AgentB framework. For more details on their usage and related types, refer to the specific component guides or the full source code. 