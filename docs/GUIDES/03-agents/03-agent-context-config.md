# Agents Deep Dive: Agent Context (`IAgentContext`) & Run Configuration (`AgentRunConfig`)

Two of the most critical elements controlling an agent's behavior in AgentB are the `IAgentContext` and the `AgentRunConfig`.

## `IAgentContext`: The Agent's Environment

The `IAgentContext` is an object passed to an agent's `run()` method (and other lifecycle methods like `submitToolOutputs()`). It acts as a "service locator" or "dependency injection container" for a specific agent execution, providing the agent with everything it needs to operate.

**Key Properties of `IAgentContext`:**

*   **`runId: string`**: The unique identifier for the current agent run.
*   **`threadId: string`**: The identifier of the conversation thread this run belongs to.
*   **`llmClient: ILLMClient`**: An instance of an LLM client (e.g., `OpenAIAdapter`) used to make calls to the Large Language Model.
*   **`toolProvider: IToolProvider`**:
    *   Provides access to the tools available to the agent for *this specific run*.
    *   For a `BaseAgent` in `genericOpenApi` mode, this might be an `OpenAPIConnector`.
    *   For a `PlanningAgent` in `hierarchicalPlanner` mode, this provider would primarily offer the `DelegateToSpecialistTool`.
    *   For a "worker" agent invoked by the `DelegateToSpecialistTool`, this provider would offer only the tools from the specific `IToolSet` assigned to that worker.
*   **`messageStorage: IMessageStorage`**: Used to save new messages (user, assistant, tool) and retrieve conversation history.
*   **`responseProcessor: LLMResponseProcessor`**: Parses the raw (often streaming) output from the `llmClient` into structured events like text chunks and tool call requests.
*   **`toolExecutor: ToolExecutor`**: Responsible for taking the tool call requests (parsed by `responseProcessor`) and actually executing the corresponding tools (obtained from `toolProvider`).
*   **`contextManager: ContextManager`**: Manages the conversation history for the LLM, handling token counting, and preparing the message list to fit within the LLM's context window (potentially including summarization in future versions).
*   **`runConfig: AgentRunConfig`**: The specific configuration settings for *this particular run* (detailed below).

**Why is `IAgentContext` important?**

*   **Decoupling**: Agents (`IAgent` implementations) are not tightly coupled to concrete service implementations. They operate against interfaces.
*   **Testability**: Makes it easier to mock dependencies when testing agent logic.
*   **Flexibility**: Allows different runs of the same agent class to operate in different environments (e.g., with different tools, LLM models, or storage backends) simply by providing a different `IAgentContext`.
*   **Dynamic Behavior**: Features like dynamic authentication overrides for tools are passed via `runConfig.requestAuthOverrides` within the context.

The `ApiInteractionManager` (or the `AgentB` facade) is responsible for assembling the correct `IAgentContext` before invoking an agent.

## `AgentRunConfig`: Tailoring Agent Behavior

The `AgentRunConfig` object, found within `IAgentContext.runConfig`, provides specific settings that fine-tune how an agent behaves during a particular run.

**Key Properties of `AgentRunConfig`:**

*   **`model: string` (Mandatory)**: The identifier of the LLM model to be used (e.g., "gpt-4o-mini", "claude-3-sonnet").
*   **`systemPrompt?: string`**:
    *   The overarching instructions given to the LLM to guide its persona, role, and how it should approach tasks.
    *   `ApiInteractionManager` often generates a default system prompt based on the operational mode and available tools. This can be overridden here.
*   **`temperature?: number`**:
    *   Controls the randomness of the LLM's output. Higher values (e.g., 0.8) make it more creative/random; lower values (e.g., 0.2) make it more deterministic/focused.
    *   Default is often around 0.7.
*   **`maxTokens?: number`**:
    *   The maximum number of tokens the LLM should generate in its response part of a turn.
*   **`toolChoice?: LLMToolChoice`**:
    *   Instructs the LLM on how to use tools.
    *   `'auto'` (default): LLM decides whether to use a tool or respond directly.
    *   `'none'`: LLM must respond directly, cannot use tools.
    *   `'required'`: LLM must call at least one tool.
    *   `{ type: "function", function: { name: "my_specific_tool" } }`: Forces the LLM to call a specific named tool.
*   **`maxToolCallContinuations?: number`**:
    *   The maximum number of times an agent (like `BaseAgent`) will automatically loop back to the LLM after executing tools within a single `run()` invocation.
    *   Helps prevent infinite loops if the LLM repeatedly calls tools.
    *   Default is often around 5 or 10. If exceeded, the run might end in `requires_action` or `failed`.
*   **`responseProcessorConfig?: ResponseProcessorConfig`**:
    *   Configuration for the `LLMResponseProcessor` (e.g., `enableNativeToolCalling`). Seldom needs changing from defaults.
*   **`toolExecutorConfig?: ToolExecutorConfig`**:
    *   Configuration for the `ToolExecutor` (e.g., `executionStrategy: 'sequential' | 'parallel'` for multiple tool calls in one turn).
*   **`contextManagerConfig?: ContextManagerConfig`**:
    *   Settings for the `ContextManager` (e.g., `tokenThreshold` for summarization, `summarizationModel`).
*   **`requestAuthOverrides?: PerProviderAuthOverrides`**:
    *   Allows passing dynamic, request-specific authentication details for `OpenAPIConnector`-based tools.
    *   Keys are `ToolProviderSourceConfig.id` values, and values are `ConnectorAuthentication` objects.
    *   This is crucial for multi-tenant apps or per-user API keys.
*   **`requestContext?: Record<string, any>`**:
    *   A general-purpose object to pass request-specific contextual information that might be needed by custom tools or deeply within the agent logic.
*   **Other LLM Provider Specific Options**:
    *   `[key: string]: any;`: The `AgentRunConfig` can also hold additional key-value pairs that are specific to the `ILLMClient` implementation being used (e.g., custom parameters for an OpenAI call not covered by the standard options).

**Configuration Hierarchy:**

1.  **Library Defaults**: AgentB has built-in defaults (e.g., in `DEFAULT_AGENT_RUN_CONFIG`).
2.  **`AgentB.initialize()` Defaults**: Options passed to `AgentB.initialize({ defaultAgentRunConfig: ... })`.
3.  **`ApiInteractionManagerOptions` Defaults**: Options passed to `new ApiInteractionManager({ defaultAgentRunConfig: ... })`.
4.  **`AgentB.getExpressStreamingHttpHandler()` Defaults**: Options passed to `AgentB.getExpressStreamingHttpHandler({ initialAgentRunConfig: ... })` for a specific HTTP route.
5.  **Per-Interaction Override**: The `agentRunConfigOverride` argument passed directly to `aim.runAgentInteraction()` or `AgentB.runHttpInteractionStream()`.

Each level can override the previous ones, allowing for flexible configuration from global defaults down to specific requests.

By carefully crafting the `IAgentContext` (especially the `IToolProvider`) and the `AgentRunConfig`, you can precisely control an agent's capabilities, behavior, and interaction style without modifying the agent's core class logic itself. 