# In-Depth Guide: The `AgentB` Facade

The `AgentB` facade is your primary entry point for quickly setting up and using the AgentB framework in common scenarios. It's a static class designed to simplify initialization, tool provider registration, and the creation of HTTP streaming handlers.

While the `ApiInteractionManager` offers more granular control (covered in a separate guide), the `AgentB` facade handles many underlying complexities for you.

## Key Responsibilities of the `AgentB` Facade

1.  **Simplified Initialization (`AgentB.initialize()`)**:
    *   Sets up the default LLM client (currently `OpenAIAdapter`).
    *   Initializes default storage adapters (`MemoryStorage` for threads, messages, and agent runs).
    *   Establishes global default configurations for agent runs.
    *   Allows registration of initial `ToolProviderSourceConfig`s.

2.  **Tool Provider Registration (`AgentB.registerToolProvider()`)**:
    *   Manages a list of `ToolProviderSourceConfig` objects. These configurations tell AgentB how to create tool providers (primarily `OpenAPIConnector` instances).
    *   When an agent interaction starts, these configurations are used by an internal `ApiInteractionManager` (and its `ToolsetOrchestrator`) to make tools available to the agent.

3.  **Core Interaction Logic (`AgentB.runHttpInteractionStream()`)**:
    *   The fundamental method for processing an agent interaction and receiving a stream of events.
    *   It takes a `threadId`, the user's `LLMMessage`, and optional `AgentRunConfig` overrides.
    *   Internally, it ensures an `ApiInteractionManager` is initialized, determines the correct agent and tools based on registered providers, and then runs the agent.
    *   Returns an `AsyncGenerator<AgentEvent, void, undefined>`, making it suitable for various integrations, not just Express.js.

4.  **HTTP Handler Generation (`AgentB.getExpressStreamingHttpHandler()`)**:
    *   Provides a ready-to-use request handler for Express.js applications.
    *   This handler sets up a Server-Sent Events (SSE) stream.
    *   It uses `runHttpInteractionStream` internally.
    *   Offers callbacks to customize:
        *   `getThreadId`: How to determine or create a `threadId` from the HTTP request.
        *   `getUserMessage`: How to extract the user's prompt/message from the request.
        *   `authorizeRequest`: For request-level authorization and providing dynamic `PerProviderAuthOverrides`.
        *   `initialAgentRunConfig`: To set default run configurations specifically for requests hitting this handler.

## How It Works Internally (Simplified View)

When you use the `AgentB` facade:

1.  **`AgentB.initialize(options)`**:
    *   An `ILLMClient` is created (e.g., `OpenAIAdapter` using `options.llmProvider` or `OPENAI_API_KEY`).
    *   `IMessageStorage`, `IThreadStorage`, `IAgentRunStorage` are set up (defaulting to `MemoryStorage` if not provided in `options`).
    *   `globalDefaultAgentRunConfig` is established.
    *   Any `toolProviders` in `options` are stored as `ToolProviderSourceConfig`s.

2.  **`AgentB.registerToolProvider(sourceConfig)`**:
    *   The `sourceConfig` is added to an internal list.
    *   This signals that the internal `ApiInteractionManager` might need to be re-initialized or updated before the next interaction.

3.  **`AgentB.runHttpInteractionStream(threadId, userMessage, runConfigOverride)`** or when `getExpressStreamingHttpHandler` processes a request:
    *   It retrieves or creates an internal `ApiInteractionManager` instance (`getOrCreateApiInteractionManager()`).
    *   **Mode Determination**: The `ApiInteractionManager` intelligently decides its operational mode (`genericOpenApi`, `hierarchicalPlanner`, etc.) based on the number and type of registered `ToolProviderSourceConfig`s:
        *   **0 providers**: Defaults to a mode with no tools (basic conversational agent).
        *   **1 OpenAPI provider**: Often defaults to `genericOpenApi` mode, making tools from that single API spec directly available (including potentially a `genericHttpRequest` tool).
        *   **Multiple providers (or complex single provider)**: Typically defaults to `hierarchicalPlanner` mode. The main agent will be a `PlanningAgent` equipped with a `DelegateToSpecialistTool`. The registered providers are used by a `ToolsetOrchestrator` to create `IToolSet`s (specialists) that the planner can delegate to.
    *   The `ApiInteractionManager` then ensures it's fully initialized (e.g., `OpenAPIConnector`s load their specs, `ToolsetOrchestrator` creates toolsets).
    *   An `IAgentContext` is assembled with all necessary components (LLM client, the appropriate tool provider for the determined mode, storages, etc.) and the final `AgentRunConfig`.
    *   An agent instance (e.g., `BaseAgent` or `PlanningAgent`, depending on the mode and AIM's logic) is created.
    *   The agent's `run()` method is called, yielding the stream of `AgentEvent`s.

## `AgentBInitializationOptions`

When calling `AgentB.initialize(options)`, you can provide:

*   `llmProvider?: AgentBLLMProviderConfig`:
    *   `provider: 'openai' | string`: Specifies the LLM provider (currently 'openai').
    *   `apiKey?: string`: API key (overrides `OPENAI_API_KEY` env var).
    *   `model?: string`: Default model for this provider (e.g., 'gpt-4o-mini').
    *   `options?: Record<string, any>`: Additional options for the LLM adapter (e.g., `baseURL` for OpenAI).
*   `messageStorage?: IMessageStorage`: Custom message storage implementation.
*   `agentRunStorage?: IAgentRunStorage`: Custom agent run storage.
*   `threadStorage?: IThreadStorage`: Custom thread storage.
*   `defaultAgentRunConfig?: Partial<AgentRunConfig>`: Global default settings for all agent runs (e.g., temperature, system prompt).
*   `toolProviders?: ToolProviderSourceConfig[]`: An initial list of configurations for tool providers.

## `ToolProviderSourceConfig`

This is how you tell AgentB about your APIs or other tool sources:

```typescript
interface ToolProviderSourceConfig {
  id: string; // Unique ID for this source (e.g., 'stripeApi', 'googleCalendar')
  type?: 'openapi'; // Currently, 'openapi' is the primary supported type.
  openapiConnectorOptions: Omit<OpenAPIConnectorOptions, 'sourceId'>; // Options for OpenAPIConnector
  toolsetCreationStrategy?: 'byTag' | 'allInOne'; // How to group tools from this API
  allInOneToolsetName?: string; // Name if 'allInOne'
  allInOneToolsetDescription?: string;
  maxToolsPerLogicalGroup?: number; // For LLM-based splitting of large toolsets
  llmSplittingConfig?: { model: string; /* ... */ }; // Config for LLM tool splitting
}
```
*   `id`: Crucial for identifying the provider, especially for dynamic authentication overrides.
*   `openapiConnectorOptions`:
    *   `specUrl?: string`: URL to the OpenAPI spec.
    *   `spec?: OpenAPISpec`: Pre-loaded OpenAPI spec object.
    *   `authentication?: ConnectorAuthentication`: Static auth config for this API.
    *   `businessContextText?: string`: Context for prompts.
    *   *Note: `sourceId` within `openapiConnectorOptions` is automatically set by AgentB using the top-level `id`.*

## `AgentBExpressHttpHandlerOptions`

When using `AgentB.getExpressStreamingHttpHandler(handlerOptions)`:

*   `getThreadId?: (req: any, threadStorage: IThreadStorage) => Promise<string>`:
    *   Receives the Express request (`req`) and the initialized `threadStorage`.
    *   Should return a `Promise<string>` resolving to the `threadId`.
    *   Default behavior: uses `req.body.threadId` or `req.query.threadId`; if not found or invalid, creates a new thread.
*   `getUserMessage?: (req: any) => Promise<string | LLMMessage>`:
    *   Receives `req`.
    *   Should return a `Promise` resolving to the user's prompt (string) or a full `LLMMessage` object.
    *   Default: expects `req.body.prompt` as a string.
*   `authorizeRequest?: (req: any, threadId: string) => Promise<boolean | PerProviderAuthOverrides>`:
    *   Receives `req` and the determined `threadId`.
    *   Return `true`: Authorized, use static/default tool authentication.
    *   Return `false`: Forbidden (handler sends 403).
    *   Return `PerProviderAuthOverrides`: Authorized, use these dynamic auth details for specific tool providers (matched by their `id` from `ToolProviderSourceConfig`).
        ```typescript
        interface PerProviderAuthOverrides {
          [providerId: string]: ConnectorAuthentication;
        }
        ```
*   `initialAgentRunConfig?: Partial<AgentRunConfig>`:
    *   Specific `AgentRunConfig` defaults or overrides for requests handled by *this specific Express route*. These merge with global defaults.

## When to Use the Facade vs. `ApiInteractionManager`

*   **Use `AgentB` Facade for:**
    *   Quickly setting up standard agent interaction patterns, especially HTTP streaming servers.
    *   Applications where the default mode determination (based on registered providers) is suitable.
    *   Simpler projects or prototypes.

*   **Use `ApiInteractionManager` directly for:**
    *   Fine-grained control over the operational mode (`genericOpenApi`, `hierarchicalPlanner`).
    *   Using multiple, differently configured `ApiInteractionManager` instances within the same application (e.g., different agents for different API routes).
    *   Complex scenarios where you need to directly instantiate and configure `ToolsetOrchestrator` or `OpenAPIConnector`s with specific, non-standard tool grouping strategies.
    *   Registering custom `IToolProvider` *instances* directly (as `ApiInteractionManager` options can be more flexible here than the facade's current `ToolProviderSourceConfig`-based registration).
    *   Unit testing individual components of the agent system.

The `AgentB` facade is built on top of `ApiInteractionManager` and other core components, providing a convenient layer of abstraction. Understanding both gives you the full power of the AgentB framework. 