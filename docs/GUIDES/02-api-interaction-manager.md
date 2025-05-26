# In-Depth Guide: The `ApiInteractionManager`

The `ApiInteractionManager` (AIM) is a central class in the AgentB framework, responsible for orchestrating agent interactions. While the `AgentB` facade provides a simplified entry point, using AIM directly offers more granular control over agent configuration, operational modes, and tool setups.

It's the workhorse that the `AgentB` facade uses under the hood. Understanding AIM is beneficial if you need to:

*   Explicitly define the agent's operational mode.
*   Use multiple, differently configured agent setups within a single application.
*   Integrate custom `IToolProvider` instances directly.
*   Have fine-grained control over the system prompt and default agent configurations.

## Core Responsibilities

*   **Mode Management**: Explicitly configures the agent system to operate in a specific mode (`genericOpenApi`, `hierarchicalPlanner`, etc.).
*   **Agent Instantiation**: Determines which agent class to use (e.g., `BaseAgent`, `PlanningAgent`, or a custom implementation) based on the mode and configuration.
*   **Tool Environment Setup**:
    *   In `genericOpenApi` mode, it configures and uses a single `OpenAPIConnector` as the primary tool provider.
    *   In `hierarchicalPlanner` (and the evolving `toolsetsRouter`) mode, it sets up a `ToolsetOrchestrator` to manage multiple toolsets (specialists) and equips the primary planning agent with the `DelegateToSpecialistTool`.
*   **System Prompt Generation**: Generates the appropriate system prompt for the LLM based on the selected mode and available tools.
*   **Agent Execution**: Provides the `runAgentInteraction` method to execute an agent for a given thread and input, yielding a stream of `AgentEvent`s.
*   **Contextualization**: Assembles the `IAgentContext` required by the agent for each run.

## `ApiInteractionManagerOptions`

When creating an `ApiInteractionManager` instance, you provide an options object:

```typescript
interface ApiInteractionManagerOptions {
  mode: ApiInteractionMode; // 'genericOpenApi' | 'hierarchicalPlanner'
  llmClient: ILLMClient; // Mandatory
  messageStorage?: IMessageStorage; // Defaults to MemoryStorage
  agentRunStorage?: IAgentRunStorage; // Defaults to MemoryStorage
  threadStorage?: IThreadStorage;   // Defaults to MemoryStorage

  // Mode-specific configurations:
  toolsetOrchestratorConfig?: ToolProviderSourceConfig[]; // For 'hierarchicalPlanner'
  genericOpenApiProviderConfig?: OpenAPIConnectorOptions; // For 'genericOpenApi'

  defaultAgentRunConfig?: Partial<AgentRunConfig>;
  agentImplementation?: new () => IAgent; // Custom agent class (e.g., BaseAgent, PlanningAgent)
  businessContextText?: string; // Appended to system prompts
}
```

*   **`mode: ApiInteractionMode` (Mandatory)**:
    *   You explicitly choose the operational mode. This is the primary difference from the `AgentB` facade, which tries to infer the mode.
    *   See [Operational Modes](./02a-aim-operational-modes.md) for details.
*   **`llmClient: ILLMClient` (Mandatory)**: Your configured LLM client instance (e.g., `OpenAIAdapter`).
*   **Storage Options**: `messageStorage`, `agentRunStorage`, `threadStorage` allow you to plug in persistent storage. They default to `MemoryStorage`.
*   **Mode-Specific Configs**:
    *   `toolsetOrchestratorConfig`: If `mode` is `hierarchicalPlanner` (or the older `toolsetsRouter`), you provide an array of `ToolProviderSourceConfig` to define how different toolsets (specialists) are created.
    *   `genericOpenApiProviderConfig`: If `mode` is `genericOpenApi`, you provide the `OpenAPIConnectorOptions` for the single API the agent will interact with.
*   **`defaultAgentRunConfig?: Partial<AgentRunConfig>`**: Default settings (model, temperature, system prompt overrides, etc.) for agent runs initiated by this AIM instance.
*   **`agentImplementation?: new () => IAgent`**:
    *   Allows you to specify a custom agent class.
    *   If `mode` is `hierarchicalPlanner` and this is not set or is `BaseAgent`, AIM will typically default to using `PlanningAgent` as the primary agent. If you provide `PlanningAgent` here explicitly, it will also use it. If you provide a *different* custom agent class in `hierarchicalPlanner` mode, that custom agent will be used as the top-level planner, and it's expected to effectively use the `DelegateToSpecialistTool` if it wants to delegate.
*   **`businessContextText?: string`**: General context added to system prompts.

## Initialization (`ensureInitialized()`)

Before an AIM instance can be used, its internal components (like `OpenAPIConnector` or `ToolsetOrchestrator`) need to be initialized (e.g., fetching and parsing OpenAPI specs).

```typescript
const aim = new ApiInteractionManager(options);
await aim.ensureInitialized(); // This is crucial!
```
This method is idempotent; calling it multiple times is safe.

## Key Methods

### `getPrimaryLLMFormattedTools(): Promise<any[]>`

Returns the tool definitions that the primary agent (controlled by this AIM instance) will be aware of, formatted for the `llmClient`.
*   **`genericOpenApi` mode**: Tools from the configured `OpenAPIConnector`.
*   **`hierarchicalPlanner` mode**: Primarily the `DelegateToSpecialistTool` definition.

### `getPrimaryLLMSystemPrompt(customBusinessContext?: string): Promise<string>`

Generates the system prompt for the primary agent.
*   **`genericOpenApi` mode**: A prompt describing how to use the tools from the API spec (often including the `genericHttpRequest` tool).
*   **`hierarchicalPlanner` mode**: The detailed system prompt for the `PlanningAgent` (e.g., `DEFAULT_PLANNER_SYSTEM_PROMPT`), guiding it on how to break down tasks and use the `DelegateToSpecialistTool`.

### `runAgentInteraction(threadId, initialTurnMessages, agentRunConfigOverride?, existingRunId?): AsyncGenerator<AgentEvent>`

This is the core method to execute an agent interaction.
*   `threadId: string`: The ID of the conversation.
*   `initialTurnMessages: LLMMessage[]`: The messages initiating this turn (e.g., new user input, or tool results if continuing a run).
*   `agentRunConfigOverride?: Partial<AgentRunConfig>`: Overrides for the default run configuration for this specific execution. Can include `requestAuthOverrides`.
*   `existingRunId?: string`: If continuing a run that was paused (e.g., `requires_action`).

It assembles the `IAgentContext` with the appropriate tool provider (based on the mode) and runs the configured agent implementation. It returns an async generator yielding `AgentEvent`s.

**Example Usage:**
```typescript
// Assuming 'aim' is an initialized ApiInteractionManager instance
const threadId = "my-conversation-123";
const userMessage: LLMMessage = { role: 'user', content: "Plan a trip to Paris." };

async function processEvents() {
  try {
    const eventStream = aim.runAgentInteraction(threadId, [userMessage], {
      // Example override:
      // requestAuthOverrides: { 'myTravelAPI': { type: 'bearer', token: 'user_specific_token'} }
    });

    for await (const event of eventStream) {
      console.log(`Event: ${event.type}`, event.data);
      // Process events for UI or logging
    }
  } catch (error) {
    console.error("Agent interaction failed:", error);
  }
}
processEvents();
```

### `continueAgentRunWithToolOutputs(runId, threadId, toolOutputs, agentRunConfigOverride?): AsyncGenerator<AgentEvent>`

Used to resume an agent run that paused with a `status: 'requires_action'` (typically when `BaseAgent` itself doesn't auto-execute tools, or hits `maxToolCallContinuations`). You provide the outputs of the tools the agent requested.

### `updateAuthentication(...)`

Allows dynamic updates to the authentication configuration of underlying `OpenAPIConnector`s. Its behavior depends on the AIM's mode.
*   **`genericOpenApi` mode**: Takes a `ConnectorAuthentication` object directly.
*   **`hierarchicalPlanner` mode (via `ToolsetOrchestrator`)**: Takes a callback function `(sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined` to update auth for multiple providers.

### `getToolset(toolsetId): Promise<IToolSet | undefined>` and `getAllToolsets(): Promise<IToolSet[]>`

If in `hierarchicalPlanner` mode (or the older `toolsetsRouter`), these methods allow you to inspect the `IToolSet`s (specialists) managed by the internal `ToolsetOrchestrator`.

## Operational Modes in Detail

For a deeper dive into how each mode configures the agent and its tools, see the [Operational Modes Guide](./02a-aim-operational-modes.md).

## Why Use `ApiInteractionManager` Directly?

*   **Explicit Mode Control**: You directly specify `genericOpenApi` or `hierarchicalPlanner`, removing any ambiguity that might arise from the `AgentB` facade's inference.
*   **Multiple AIM Instances**: Your application might need different agent configurations for different purposes or API endpoints. You can create multiple AIM instances, each with its own mode, tool setup, and default configurations.
    ```typescript
    const generalChatAim = new ApiInteractionManager({ mode: 'genericOpenApi', ...commonConfig, genericOpenApiProviderConfig: faqApiConfig });
    const complexTaskAim = new ApiInteractionManager({ mode: 'hierarchicalPlanner', ...commonConfig, toolsetOrchestratorConfig: allMyApisConfig });
    ```
*   **Direct Custom Provider Integration**: While `ToolsetOrchestrator` is evolving to better support custom `IToolProvider` instances via `ToolProviderSourceConfig`, AIM can offer more direct pathways if you need to construct and inject a custom `IToolProvider` instance (e.g., by customizing how the `IAgentContext.toolProvider` is assembled before calling `agent.run()`, though this level of customization often means you are building your own agent loop rather than just using `aim.runAgentInteraction`).
*   **Testing**: When unit testing or integration testing parts of your agent system, using AIM directly can make it easier to mock dependencies and control the environment.

The `ApiInteractionManager` is a powerful class that gives you significant control over how your agents are configured and executed. It builds upon the core AgentB components to provide a cohesive orchestration layer. 