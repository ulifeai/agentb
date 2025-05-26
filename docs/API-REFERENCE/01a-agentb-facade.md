# API Reference: `AgentB` Facade

The `AgentB` object is a static class providing a high-level facade for initializing and interacting with the AgentB framework. It simplifies common setup tasks and provides convenient HTTP handlers.

**Import:**
```typescript
import { AgentB } from '@ulifeai/agentb';
```

## Static Methods

### `AgentB.initialize(options: AgentBInitializationOptions): void`

Initializes the AgentB framework with global configurations. This method should be called once at the start of your application.

*   **`options: AgentBInitializationOptions`**:
    *   `llmProvider?: AgentBLLMProviderConfig`: Configures the LLM provider.
        *   `provider: 'openai' | string`: Currently 'openai'.
        *   `apiKey?: string`: OpenAI API key (overrides `process.env.OPENAI_API_KEY`).
        *   `model?: string`: Default LLM model (e.g., 'gpt-4o-mini').
        *   `options?: Record<string, any>`: Additional options for the LLM adapter (e.g., `baseURL` for OpenAI).
    *   `messageStorage?: IMessageStorage`: Custom message storage implementation. Defaults to `MemoryStorage`.
    *   `agentRunStorage?: IAgentRunStorage`: Custom agent run storage. Defaults to `MemoryStorage`.
    *   `threadStorage?: IThreadStorage`: Custom thread storage. Defaults to `MemoryStorage`.
    *   `defaultAgentRunConfig?: Partial<AgentRunConfig>`: Global default settings for agent runs (e.g., temperature, default system prompt). Merged with library defaults.
    *   `toolProviders?: ToolProviderSourceConfig[]`: An initial list of configurations for tool providers to be registered.

**Example:**
```typescript
AgentB.initialize({
  llmProvider: { provider: 'openai', model: 'gpt-4o-mini' },
  defaultAgentRunConfig: { temperature: 0.7 }
});
```

---

### `AgentB.registerToolProvider(sourceConfig: ToolProviderSourceConfig): void`

Registers a tool provider source with the framework. This configuration will be used by the internal `ApiInteractionManager` and `ToolsetOrchestrator` to create and make tools available to agents. Calling this after initial interactions might cause the internal `ApiInteractionManager` to re-initialize.

*   **`sourceConfig: ToolProviderSourceConfig`**:
    *   `id: string`: Unique identifier for this tool source (e.g., 'myApiV1').
    *   `type?: 'openapi'`: Type of provider (currently 'openapi').
    *   `openapiConnectorOptions: Omit<OpenAPIConnectorOptions, 'sourceId'>`: Configuration for the `OpenAPIConnector` if type is 'openapi'. The `sourceId` for the connector will be taken from the top-level `id`.
    *   `toolsetCreationStrategy?: 'byTag' | 'allInOne'`: How to group tools from this source into `IToolSet`s.
    *   `allInOneToolsetName?: string`: Custom name if `allInOne` strategy is used.
    *   `allInOneToolsetDescription?: string`: Custom description if `allInOne` strategy is used.
    *   `maxToolsPerLogicalGroup?: number`: Threshold for attempting LLM-based splitting of large toolsets.
    *   `llmSplittingConfig?: { model: string; ... }`: Configuration for the LLM used in toolset splitting.

**Example:**
```typescript
const myApiConfig: ToolProviderSourceConfig = {
  id: 'myExternalApi',
  type: 'openapi',
  openapiConnectorOptions: {
    specUrl: 'https://api.example.com/openapi.json',
    authentication: { type: 'apiKey', name: 'X-API-KEY', in: 'header', key: process.env.MY_API_KEY! }
  },
  toolsetCreationStrategy: 'byTag'
};
AgentB.registerToolProvider(myApiConfig);
```

---

### `AgentB.runHttpInteractionStream(threadId: string, userMessage: LLMMessage, agentRunConfigOverride?: Partial<AgentRunConfig>, existingRunId?: string): AsyncGenerator<AgentEvent, void, undefined>`

The core method for executing an agent interaction and receiving a stream of `AgentEvent`s. This method is framework-agnostic and can be used directly or as the basis for custom HTTP handlers.

*   **`threadId: string`**: The ID of the conversation thread. A new thread is not automatically created by this method; ensure it exists or handle creation externally if needed (though `getExpressStreamingHttpHandler`'s default `getThreadId` callback does handle creation).
*   **`userMessage: LLMMessage`**: The user's message object (must have `role: 'user'` and valid `content`).
*   **`agentRunConfigOverride?: Partial<AgentRunConfig>`**: Optional configuration overrides for this specific agent run. These merge with defaults. Can include `requestAuthOverrides` for dynamic tool authentication.
*   **`existingRunId?: string`**: Optional. If provided, attempts to continue an existing agent run (e.g., one that paused with `status: 'requires_action'`).

**Returns**: An `AsyncGenerator` that yields `AgentEvent` objects as the agent processes the request.

**Throws**: `ConfigurationError` or `InvalidStateError` if prerequisites are not met.

**Example:**
```typescript
async function processStream(threadId: string, prompt: string) {
  const userMessage: LLMMessage = { role: 'user', content: prompt };
  try {
    const eventStream = AgentB.runHttpInteractionStream(threadId, userMessage);
    for await (const event of eventStream) {
      console.log(event.type, event.data);
      // Update UI or handle event
    }
  } catch (e) {
    console.error("Interaction stream error:", e);
  }
}
```

---

### `AgentB.getExpressStreamingHttpHandler(handlerOptions?: AgentBExpressHttpHandlerOptions): (req: any, res: any) => Promise<void>`

Returns an Express.js compatible request handler function for creating a Server-Sent Events (SSE) streaming endpoint.

*   **`handlerOptions?: AgentBExpressHttpHandlerOptions`**:
    *   `getThreadId?: (req: any, threadStorage: IThreadStorage) => Promise<string>`: Callback to extract or create a `threadId` from the Express request (`req`). `threadStorage` is the initialized storage instance.
        *   *Default*: Uses `req.body.threadId` or `req.query.threadId`; creates a new thread if not found/provided.
    *   `getUserMessage?: (req: any) => Promise<string | LLMMessage>`: Callback to extract the user's input from `req`.
        *   *Default*: Expects `req.body.prompt` (string).
    *   `authorizeRequest?: (req: any, threadId: string) => Promise<boolean | PerProviderAuthOverrides>`: Callback for request authorization and dynamic tool authentication overrides.
        *   Return `true`: Authorized.
        *   Return `false`: Forbidden (handler sends 403).
        *   Return `PerProviderAuthOverrides`: Authorized with dynamic auth details.
    *   `initialAgentRunConfig?: Partial<AgentRunConfig>`: Default `AgentRunConfig` settings specifically for requests handled by this route.

**Returns**: An async function `(req: express.Request, res: express.Response) => Promise<void>`.

**Example (in an Express app):**
```typescript
import express from 'express';
import { AgentB } from '@ulifeai/agentb';

// ... AgentB.initialize() and AgentB.registerToolProvider() calls ...

const app = express();
app.use(express.json());

app.post('/chat/stream', AgentB.getExpressStreamingHttpHandler({
  authorizeRequest: async (req, threadId) => {
    // Example: Check for an API key in headers
    // if (req.headers['x-app-auth'] === 'secret-key') return true;
    // return false;
    return true; // Allow all for this example
  }
}));

app.listen(3001, () => console.log('Server listening on port 3001'));
```

---

### `AgentB.getApiInteractionManager(): Promise<ApiInteractionManager>` (Advanced)

Provides direct access to the underlying `ApiInteractionManager` instance that the `AgentB` facade is using. This is for advanced use cases where you need more granular control than the facade methods offer.

**Returns**: A `Promise` resolving to the initialized `ApiInteractionManager` instance.

**Note**: Modifying the `ApiInteractionManager` returned by this method can affect all subsequent interactions handled by the `AgentB` facade. Use with caution if you are also using facade methods like `runHttpInteractionStream` or `getExpressStreamingHttpHandler`.

---
## Internal Properties (for understanding, not direct manipulation)

While not part of the public API for modification, understanding these can be helpful:

*   `AgentB.llmClient: ILLMClient`: The initialized LLM client.
*   `AgentB.messageStorage: IMessageStorage`: The initialized message storage.
*   `AgentB.agentRunStorage: IAgentRunStorage`: The initialized agent run storage.
*   `AgentB.threadStorage: IThreadStorage`: The initialized thread storage.
*   `AgentB.globalDefaultAgentRunConfig: AgentRunConfig`: The resolved global default agent run configuration.

These are managed internally by `AgentB.initialize()`. For custom instances, you generally pass them during initialization or use `ApiInteractionManager` directly. 