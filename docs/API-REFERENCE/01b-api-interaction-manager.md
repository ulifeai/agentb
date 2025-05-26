# API Reference: `ApiInteractionManager`

The `ApiInteractionManager` (AIM) is a central class for orchestrating agent interactions, offering more granular control than the `AgentB` facade. It is responsible for managing operational modes, agent instantiation, tool environments, system prompts, and executing agent runs.

**Import:**
```typescript
import { ApiInteractionManager, ApiInteractionManagerOptions } from '@ulifeai/agentb';
```

## Constructor

### `new ApiInteractionManager(options: ApiInteractionManagerOptions)`

Creates a new instance of `ApiInteractionManager`.

*   **`options: ApiInteractionManagerOptions`**:
    *   `mode: ApiInteractionMode` (Mandatory): Specifies the operational mode ('genericOpenApi' | 'hierarchicalPlanner'). Determines how agents and tools are configured.
    *   `llmClient: ILLMClient` (Mandatory): An instance of an LLM client (e.g., `OpenAIAdapter`).
    *   `messageStorage?: IMessageStorage`: Custom message storage. Defaults to `MemoryStorage`.
    *   `agentRunStorage?: IAgentRunStorage`: Custom agent run storage. Defaults to `MemoryStorage`.
    *   `threadStorage?: IThreadStorage`: Custom thread storage. Defaults to `MemoryStorage`.
    *   `toolsetOrchestratorConfig?: ToolProviderSourceConfig[]`: Required if `mode` is `hierarchicalPlanner`. Defines sources for `ToolsetOrchestrator` to create specialist toolsets.
    *   `genericOpenApiProviderConfig?: OpenAPIConnectorOptions`: Required if `mode` is `genericOpenApi`. Configuration for the single `OpenAPIConnector`.
    *   `defaultAgentRunConfig?: Partial<AgentRunConfig>`: Default configurations for agent runs initiated by this AIM instance. Merges with library defaults.
    *   `agentImplementation?: new () => IAgent`: Allows specifying a custom agent class (e.g., `BaseAgent`, `PlanningAgent`). Behavior depends on the `mode`.
    *   `businessContextText?: string`: General business context appended to system prompts.

**Example:**
```typescript
import { ApiInteractionManager, OpenAIAdapter, MemoryStorage } from '@ulifeai/agentb';

const llmClient = new OpenAIAdapter({ defaultModel: 'gpt-4o-mini' });
const storage = new MemoryStorage();

const aim = new ApiInteractionManager({
  mode: 'genericOpenApi',
  llmClient: llmClient,
  messageStorage: storage,
  genericOpenApiProviderConfig: {
    sourceId: 'myApi',
    specUrl: 'https://api.example.com/openapi.json'
  },
  defaultAgentRunConfig: { temperature: 0.5 }
});
```

## Instance Methods

### `async ensureInitialized(): Promise<void>`

Ensures that the `ApiInteractionManager` and its internal components (like `OpenAPIConnector` or `ToolsetOrchestrator`) have completed any asynchronous initialization (e.g., fetching and parsing OpenAPI specs). This method **must be called and awaited** before other methods that rely on initialized state (like `getPrimaryLLMFormattedTools`, `runAgentInteraction`). It is idempotent.

**Throws**: `ApplicationError` if initialization fails.

**Example:**
```typescript
await aim.ensureInitialized();
// AIM is now ready to be used
```

---

### `async getPrimaryLLMFormattedTools(): Promise<any[]>`

Returns an array of tool definitions formatted specifically for the configured `llmClient`. The tools returned depend on the AIM's `mode`:
*   **`genericOpenApi` mode**: Tools from the configured `OpenAPIConnector` (either specific operation tools and/or `GenericHttpApiTool`).
*   **`hierarchicalPlanner` mode**: Primarily the definition of the `DelegateToSpecialistTool`.

**Returns**: `Promise<any[]>` - Array of provider-specific tool definitions.

**Throws**: `InvalidStateError` if AIM is not initialized.

---

### `async getPrimaryLLMSystemPrompt(customBusinessContext?: string): Promise<string>`

Generates and returns the system prompt intended for the primary agent managed by this AIM instance. The content of the prompt varies based on the `mode` and configured tools.
*   **`customBusinessContext?: string`**: Optional text to append to the generated system prompt, overriding any `businessContextText` from the constructor options for this call.

**Returns**: `Promise<string>` - The system prompt.

**Throws**: `InvalidStateError` if AIM is not initialized.

---

### `async *runAgentInteraction(threadId: string, initialTurnMessages: LLMMessage[], agentRunConfigOverride?: Partial<AgentRunConfig>, existingRunId?: string): AsyncGenerator<AgentEvent, void, undefined>`

Executes an agent interaction for a given thread and initial messages. This is the core method for running an agent.
*   **`threadId: string`**: The ID of the conversation thread.
*   **`initialTurnMessages: LLMMessage[]`**: An array of `LLMMessage` objects that initiate this turn (e.g., a new user message, or tool results if continuing a run).
*   **`agentRunConfigOverride?: Partial<AgentRunConfig>`**: Optional. Configuration overrides for this specific agent run. These merge with `defaultAgentRunConfig`. Can include `requestAuthOverrides`.
*   **`existingRunId?: string`**: Optional. If provided, attempts to continue an existing agent run.

**Returns**: An `AsyncGenerator` that yields `AgentEvent` objects as the agent processes the request.

**Throws**: `ConfigurationError`, `InvalidStateError`, `ApplicationError` for various setup or runtime issues.

---

### `async *continueAgentRunWithToolOutputs(runId: string, threadId: string, toolOutputs: Array<{ tool_call_id: string; output: string; tool_name?: string }>, agentRunConfigOverride?: Partial<AgentRunConfig>): AsyncGenerator<AgentEvent, void, undefined>`

Resumes an agent run that is in a `status: 'requires_action'` state, by providing the outputs of tools that the agent previously requested.
*   **`runId: string`**: The ID of the agent run to continue.
*   **`threadId: string`**: The ID of the thread (must match the run's thread).
*   **`toolOutputs: Array<{...}>`**: An array of objects, each specifying a `tool_call_id`, the `output` (string), and optionally the `tool_name`.
*   **`agentRunConfigOverride?: Partial<AgentRunConfig>`**: Optional configuration overrides for this continuation.

**Returns**: An `AsyncGenerator` yielding `AgentEvent` objects.

**Throws**: `ApplicationError`, `InvalidStateError` if the run cannot be continued.

---

### `async updateAuthentication(newAuth: ConnectorAuthentication | ((sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined)): Promise<void>`

Dynamically updates the authentication configuration for underlying `OpenAPIConnector` instances managed by this AIM.
*   **`newAuth`**:
    *   If `mode` is `genericOpenApi`: A `ConnectorAuthentication` object for the single connector.
    *   If `mode` is `hierarchicalPlanner`: A callback function `(sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined`. This function is called for each OpenAPI-based tool provider source managed by the internal `ToolsetOrchestrator`, allowing targeted auth updates.

**Throws**: `InvalidStateError` if AIM is not initialized or components are missing. `ConfigurationError` if `newAuth` type is incorrect for the mode.

---

### `async getToolset(toolsetId: string): Promise<IToolSet | undefined>`

If AIM is in `hierarchicalPlanner` mode (or the older `toolsetsRouter` mode), this retrieves a specific `IToolSet` (specialist capability group) by its ID from the internal `ToolsetOrchestrator`.

**Returns**: `Promise<IToolSet | undefined>`. Returns `undefined` if not in a relevant mode, orchestrator is not initialized, or toolset is not found.

---

### `async getAllToolsets(): Promise<IToolSet[]>`

If AIM is in `hierarchicalPlanner` mode (or `toolsetsRouter`), this retrieves all `IToolSet`s managed by the internal `ToolsetOrchestrator`.

**Returns**: `Promise<IToolSet[]>`. Returns an empty array if not in a relevant mode or no toolsets are available.

---

### `async getAllGenericTools(): Promise<ITool[]>`

If AIM is in `genericOpenApi` mode, this retrieves all tools (specific operation tools and potentially `GenericHttpApiTool`) from the configured `OpenAPIConnector`.

**Returns**: `Promise<ITool[]>`. Returns an empty array if not in `genericOpenApi` mode or no tools are available.

---
## Properties (Read-only after initialization)

*   **`mode: ApiInteractionMode`**: The operational mode of this AIM instance.
*   **`llmClient: ILLMClient`**: The configured LLM client.
*   **`messageStorage: IMessageStorage`**: The configured message storage adapter.
*   **`agentRunStorage: IAgentRunStorage`**: The configured agent run storage adapter.
*   **`threadStorage: IThreadStorage`**: The configured thread storage adapter.
*   **`defaultAgentRunConfig: AgentRunConfig`**: The resolved default agent run configuration for this AIM instance.
*   **`agentImplementation: new () => IAgent`**: The agent class constructor used by this AIM.

These properties are set during construction and are not intended to be modified directly after initialization. Use methods like `updateAuthentication` for controlled changes. 