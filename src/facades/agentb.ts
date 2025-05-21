// src/facade/agent-b.ts

/**
 * @file AgentB - A high-level facade for simplifying the setup and usage of the AI Agent Framework.
 * It provides an opinionated, easy-to-use API for initializing the framework,
 * registering tool providers, and handling agent interactions via HTTP streaming.
 */

import {
  ApiInteractionManager,
  ApiInteractionManagerOptions,
  ApiInteractionMode,
} from '../managers/api-interaction-manager';
import { ToolProviderSourceConfig } from '../managers/toolset-orchestrator';
import { ILLMClient, LLMMessage } from '../llm/types';
import { OpenAIAdapter, OpenAIAdapterOptions } from '../llm/adapters/openai/openai-adapter';
import { IMessageStorage, IThreadStorage } from '../threads/types'; // IThreadStorage added
import { MemoryStorage } from '../threads/storage/memory-storage'; // Implements all three storage interfaces
import { AgentEvent, AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG, IAgentRun, IAgentRunStorage } from '../agents'; // IAgentRun for type hinting
import { ConfigurationError, ApplicationError, InvalidStateError } from '../core/errors';
import { v4 as uuidv4 } from 'uuid';
import { OpenAPIConnectorOptions } from '../openapi/connector';

// --- Configuration Types specific to AgentB Facade ---

/**
 * Configuration for the LLM provider used by AgentB.
 */
interface AgentBLLMProviderConfig {
  /** Identifier for the LLM provider (e.g., 'openai'). */
  provider: 'openai' | string; // Currently 'openai' is directly supported, extendable.
  /** API key for the LLM provider. Can often be set via environment variables too. */
  apiKey?: string;
  /** Default model to use with this provider. */
  model?: string;
  /**
   * Additional provider-specific options.
   * For 'openai', these would be `OpenAIAdapterOptions` like `baseURL`, `organizationId`.
   */
  options?: Record<string, any>;
}

/**
 * Options for initializing the AgentB framework.
 */
interface AgentBInitializationOptions {
  /**
   * Optional: A global API key for AgentB itself, if it were to offer managed services
   * (not currently used, but a placeholder for future extensibility).
   */
  apiKey?: string;
  /** Configuration for the primary LLM provider. Defaults to OpenAI if not specified. */
  llmProvider?: AgentBLLMProviderConfig;
  /**
   * A global default model name for agent runs.
   * This can be overridden by `llmProvider.model` or specific agent run configurations.
   */
  defaultAgentModel?: string;
  /** Optional: Custom implementation for message storage. Defaults to `MemoryStorage`. */
  messageStorage?: IMessageStorage;
  /** Optional: Custom implementation for agent run storage. Defaults to `MemoryStorage`. */
  agentRunStorage?: IAgentRunStorage;
  /** Optional: Custom implementation for thread storage. Defaults to `MemoryStorage`. */
  threadStorage?: IThreadStorage;
  /**
   * Optional: Default run configuration to be applied to all agents started via this facade,
   * unless overridden at the time of the run.
   */
  defaultAgentRunConfig?: Partial<AgentRunConfig>;
}

// --- AgentB Singleton Class ---

/**
 * Internal class implementing the AgentB singleton logic.
 * Not intended for direct instantiation by library users.
 */
export class AgentBInternal {
  private static instance: AgentBInternal;

  // Core services, initialized by `initialize()`
  private llmClient!: ILLMClient;
  private messageStorage!: IMessageStorage;
  private agentRunStorage!: IAgentRunStorage;
  private threadStorage!: IThreadStorage; // Added for creating threads
  private globalDefaultAgentRunConfig!: AgentRunConfig; // Fully resolved default config

  // State for ApiInteractionManager
  private aim: ApiInteractionManager | null = null;
  private toolProviderSources: ToolProviderSourceConfig[] = [];
  private isFrameworkInitialized = false;

  private constructor() {
    /* Private constructor for singleton */
  }

  public static getInstance(): AgentBInternal {
    if (!AgentBInternal.instance) {
      AgentBInternal.instance = new AgentBInternal();
    }
    return AgentBInternal.instance;
  }

  /**
   * Asserts that the AgentB framework has been initialized.
   * @throws {InvalidStateError} if `AgentB.initialize()` has not been called.
   */
  private assertFrameworkInitialized(): void {
    if (!this.isFrameworkInitialized) {
      throw new InvalidStateError('AgentB framework not initialized. Call AgentB.initialize() first.');
    }
  }

  /**
   * Initializes the AgentB framework with global configurations.
   * This method MUST be called once before using other AgentB features like
   * registering tool providers or getting HTTP handlers.
   *
   * @param options Optional configuration for LLM providers, storage, and default agent settings.
   * @throws {ConfigurationError} if essential configurations like API keys are missing for the chosen LLM provider.
   */
  public initialize(options: AgentBInitializationOptions = {}): void {
    if (this.isFrameworkInitialized) {
      console.warn(
        '[AgentB] Already initialized. Re-initializing may lead to unexpected behavior if not resetting dependent states (e.g., ApiInteractionManager).'
      );
      // Consider adding a full reset mechanism if re-initialization needs to be robust.
      // For now, it will overwrite settings.
    }

    // 1. Setup LLM Client
    const llmConfig = options.llmProvider || { provider: 'openai' }; // Default to OpenAI
    let defaultModelForProvider: string;

    if (llmConfig.provider.toLowerCase() === 'openai') {
      const openaiApiKey = llmConfig.apiKey || process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new ConfigurationError(
          "OpenAI API key is required for 'openai' LLM provider. Set OPENAI_API_KEY or provide in llmProvider.apiKey."
        );
      }
      defaultModelForProvider = llmConfig.model || options.defaultAgentModel || 'gpt-4o-mini';
      this.llmClient = new OpenAIAdapter({
        apiKey: openaiApiKey,
        defaultModel: defaultModelForProvider, // OpenAIAdapter uses this as its internal default
        ...(llmConfig.options as OpenAIAdapterOptions),
      });
    } else {
      // TODO: Implement a factory pattern or registry for other LLM providers.
      throw new ConfigurationError(`LLM provider "${llmConfig.provider}" is not yet supported by AgentB facade.`);
    }

    // 2. Setup Storage Solutions
    // If a single MemoryStorage instance is used for all, it's fine.
    // If custom storages are provided, ensure they are distinct if necessary.
    const defaultMemoryStorage = new MemoryStorage();
    this.messageStorage = options.messageStorage || defaultMemoryStorage;
    this.agentRunStorage =
      options.agentRunStorage ||
      (this.messageStorage instanceof MemoryStorage
        ? (this.messageStorage as unknown as IAgentRunStorage)
        : defaultMemoryStorage);
    this.threadStorage =
      options.threadStorage ||
      (this.messageStorage instanceof MemoryStorage
        ? (this.messageStorage as unknown as IThreadStorage)
        : defaultMemoryStorage);

    // 3. Resolve Global Default Agent Run Configuration
    // This config is passed to ApiInteractionManager, which then merges it with call-specific overrides.
    this.globalDefaultAgentRunConfig = {
      ...DEFAULT_AGENT_RUN_CONFIG, // Library's absolute defaults
      model: options.defaultAgentModel || defaultModelForProvider, // Prioritize explicit defaultAgentModel, then provider's model
      ...(options.defaultAgentRunConfig || {}), // User's global defaults for AgentB
    };
    if (!this.globalDefaultAgentRunConfig.model) {
      // Should be covered by provider default, but final check
      throw new ConfigurationError(
        'A default agent model could not be determined. Please specify in llmProvider.model or defaultAgentModel.'
      );
    }

    this.isFrameworkInitialized = true;
    // Reset AIM instance if it existed, as its dependencies might have changed
    this.aim = null;
    console.info(
      `[AgentB] Framework initialized successfully. Default agent model: ${this.globalDefaultAgentRunConfig.model}`
    );
  }

  /**
   * Registers a tool provider source with AgentB.
   * Tool providers (e.g., OpenAPIConnectors) define sets of tools that agents can use.
   * Calling this after an `ApiInteractionManager` has been used will reset the internal AIM instance,
   * causing it to be re-created with the updated set of tool providers on its next use.
   *
   * @param sourceConfig Configuration for the tool provider source, including a unique `id`.
   * @throws {ConfigurationError} if `sourceConfig.id` is missing.
   * @throws {InvalidStateError} if AgentB is not initialized.
   */
  public registerToolProvider(sourceConfig: ToolProviderSourceConfig): void {
    this.assertFrameworkInitialized();
    if (!sourceConfig.id) {
      throw new ConfigurationError("ToolProviderSourceConfig must have a unique 'id'.");
    }
    // Remove existing provider with the same ID to allow updates
    const existingIndex = this.toolProviderSources.findIndex((s) => s.id === sourceConfig.id);
    if (existingIndex !== -1) {
      console.warn(`[AgentB] Tool provider with ID "${sourceConfig.id}" already registered. It will be replaced.`);
      this.toolProviderSources.splice(existingIndex, 1);
    }
    this.toolProviderSources.push(sourceConfig);
    console.info(
      `[AgentB] Registered tool provider source: "${sourceConfig.id}". Total sources: ${this.toolProviderSources.length}`
    );
    // Invalidate existing AIM instance to force re-creation with new tool providers.
    this.aim = null;
  }

  /**
   * Lazily gets or creates the `ApiInteractionManager` instance.
   * It configures the AIM based on registered tool providers and chosen mode.
   * This internal method ensures AIM is set up correctly before use.
   * @returns {Promise<ApiInteractionManager>} The initialized ApiInteractionManager instance.
   */
  private async getOrCreateApiInteractionManager(): Promise<ApiInteractionManager> {
    this.assertFrameworkInitialized();

    if (!this.aim) {
      // If AIM is null (e.g., first use, or after registerToolProvider)
      let mode: ApiInteractionMode;
      let toolsetOrchestratorConfig: ToolProviderSourceConfig[] | undefined = undefined;
      let genericOpenApiProviderConfig: OpenAPIConnectorOptions | undefined = undefined;

      // Determine AIM mode based on registered tool providers
      if (this.toolProviderSources.length === 0) {
        // No external tool providers. Agent will be text-only or use framework-internal tools (if any).
        // Default to 'genericOpenApi' with no specific spec. BaseAgent will have no tools from OpenAPI.
        mode = 'genericOpenApi'; // This implies the agent won't have OpenAPI tools unless genericOpenApiProviderConfig is set.
        // If no provider is set even for genericOpenApi, the agent will have no OpenAPI tools.
        console.warn(
          "[AgentB] No tool providers registered. ApiInteractionManager will be configured for 'genericOpenApi' mode without specific OpenAPI tools. Agent capabilities might be limited."
        );
      } else if (
        this.toolProviderSources.length === 1 &&
        (this.toolProviderSources[0].type === 'openapi' || this.toolProviderSources[0].type === undefined)
      ) {
        // Single OpenAPI provider: suitable for 'genericOpenApi' mode.
        mode = 'genericOpenApi';
        genericOpenApiProviderConfig = this.toolProviderSources[0].openapiConnectorOptions;
        console.info(
          `[AgentB] Configuring ApiInteractionManager for 'genericOpenApi' mode with source: ${this.toolProviderSources[0].id}`
        );
      } else {
        // Multiple providers, or non-OpenAPI providers (if supported in future): use 'toolsetsRouter' or 'hierarchicalPlanner'.
        // For now, 'toolsetsRouter' is the default for multiple sources. 'hierarchicalPlanner' can be set via defaultAgentRunConfig.
        mode = 'hierarchicalPlanner'; // Default for multiple or mixed sources
        toolsetOrchestratorConfig = this.toolProviderSources;
        console.info(
          `[AgentB] Configuring ApiInteractionManager for '${mode}' mode with ${this.toolProviderSources.length} provider source(s).`
        );
      }

      // Allow overriding mode via defaultAgentRunConfig if a more specific one is desired, e.g. hierarchicalPlanner
      // This needs to be done carefully as toolsetOrchestratorConfig vs genericOpenApiProviderConfig depends on the mode.
      // Let's assume mode is determined as above for now, and agent type (PlanningAgent vs BaseAgent) is selected in AIM.runAgentInteraction.

      const aimOptions: ApiInteractionManagerOptions = {
        mode, // Determined mode
        llmClient: this.llmClient,
        messageStorage: this.messageStorage,
        agentRunStorage: this.agentRunStorage,
        toolsetOrchestratorConfig:
          mode === 'hierarchicalPlanner' ? toolsetOrchestratorConfig || this.toolProviderSources : undefined, //  || mode === 'hierarchicalPlanner'
        genericOpenApiProviderConfig: mode === 'genericOpenApi' ? genericOpenApiProviderConfig : undefined,
        defaultAgentRunConfig: this.globalDefaultAgentRunConfig,
        // agentImplementation could also be passed here if AgentB had a default agent type for AIM
      };

      this.aim = new ApiInteractionManager(aimOptions);
    }
    // Ensure the (potentially newly created) AIM instance is initialized.
    await this.aim.ensureInitialized();
    return this.aim;
  }

  /**
   * Creates an HTTP request handler for streaming agent interactions using Server-Sent Events (SSE).
   * This handler can be integrated into various Node.js web frameworks (Express, Next.js, etc.).
   *
   * @param handlerOptions Optional callbacks to customize request processing:
   *   - `getThreadId`: Asynchronously extracts or creates a thread ID from the request.
   *   - `getUserMessage`: Asynchronously extracts the user's message (`LLMMessage`) from the request.
   *   - `authorizeRequest`: Asynchronously performs authorization checks.
   *   - `initialAgentRunConfig`: Optional `AgentRunConfig` to override defaults for this specific handler invocation.
   * @returns An async function `(req: any, res: any) => Promise<void>` that processes the HTTP request and streams agent events.
   * @throws {InvalidStateError} if AgentB is not initialized.
   */
  public getStreamingHttpHandler(handlerOptions?: {
    getThreadId?: (req: any, threadStorage: IThreadStorage) => Promise<string>; // Now must return string
    getUserMessage: (req: any) => Promise<LLMMessage>; // Now mandatory and must return LLMMessage
    authorizeRequest?: (req: any, threadId?: string) => Promise<boolean>;
    initialAgentRunConfig?: Partial<AgentRunConfig>;
  }): (req: any, res: any) => Promise<void> {
    this.assertFrameworkInitialized();

    // Ensure mandatory options are provided or have defaults
    const defaultGetThreadId = async (req: any, threadStorage: IThreadStorage): Promise<string> => {
      // Example: Check query, body, or create new if allowed by application logic
      const requestedThreadId = req.query?.threadId || req.body?.threadId;
      if (requestedThreadId && typeof requestedThreadId === 'string') {
        // Optional: Verify thread existence or user access here if needed
        const threadExists = await threadStorage.getThread(requestedThreadId);
        if (threadExists) return requestedThreadId;
        console.warn(`[AgentB Handler] Requested threadId "${requestedThreadId}" not found. Creating new thread.`);
      }
      const newThread = await threadStorage.createThread(/* pass user context if available from req */);
      console.info(`[AgentB Handler] Created new thread for request: ${newThread.id}`);
      return newThread.id;
    };

    const getThreadId = handlerOptions?.getThreadId || defaultGetThreadId;
    const getUserMessage = handlerOptions?.getUserMessage;

    if (!getUserMessage) {
      throw new ConfigurationError("getStreamingHttpHandler requires a 'getUserMessage' callback in options.");
    }

    return async (req: any, res: any): Promise<void> => {
      let runId: string | undefined; // To ensure run status is updated in finally block
      let threadIdForRun: string | undefined;

      try {
        // 1. Determine Thread ID (must resolve to a string)
        threadIdForRun = await getThreadId(req, this.threadStorage);

        // 2. Authorization (optional)
        if (handlerOptions?.authorizeRequest) {
          if (!(await handlerOptions.authorizeRequest(req, threadIdForRun))) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
          }
        }

        // 3. Get User Message (mandatory)
        const userMessage = await getUserMessage(req);
        if (!userMessage || !userMessage.content) {
          // Check content specifically
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'User message content is required.' }));
          return;
        }

        // 4. Get or Create ApiInteractionManager instance
        const aim = await this.getOrCreateApiInteractionManager();

        // 5. Prepare for streaming Server-Sent Events (SSE)
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Important for Nginx proxies
        res.flushHeaders(); // Send headers immediately to establish the SSE connection

        // 6. Setup Agent Run
        runId = uuidv4(); // Unique ID for this specific agent interaction run
        const agentRunConfigForThisCall = {
          ...(handlerOptions?.initialAgentRunConfig || {}), // Handler-level overrides
          // Model could be passed from request if desired: req.body.model
        };

        // Create agent run record (status will be updated by AIM as events flow)
        await this.agentRunStorage.createRun({
          id: runId,
          threadId: threadIdForRun,
          agentType: aim.agentImplementation?.name || 'DefaultAgentBHandlerAgent', // Use configured agent name
          config: { ...aim.defaultAgentRunConfig, ...agentRunConfigForThisCall }, // Merge defaults and call-specific
        });
        // ApiInteractionManager will update it to 'in_progress' and other statuses.

        // 7. Start Agent Interaction and Stream Events
        console.info(`[AgentB Handler] Starting agent interaction for run ${runId} on thread ${threadIdForRun}`);
        const agentStream = aim.runAgentInteraction(
          threadIdForRun,
          [userMessage], // Initial messages for this turn
          agentRunConfigForThisCall,
          runId // Pass the pre-generated runId
        );

        for await (const event of agentStream) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        // The agent's own events (`thread.run.completed`, `thread.run.failed`) will signal end.
        // No need for an extra `stream.end` event from here if agent events are comprehensive.
      } catch (error: any) {
        console.error(`[AgentB Handler: ${runId || 'N/A'}] Critical error during request processing:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown server error during agent interaction.';
        const errorCode = error instanceof ConfigurationError || error instanceof InvalidStateError ? 400 : 500;

        if (runId && threadIdForRun) {
          // If run started, try to mark it as failed
          try {
            await this.agentRunStorage.updateRun(runId, {
              status: 'failed',
              completedAt: new Date(),
              lastError: { code: error.name || 'handler_error', message: errorMessage },
            });
          } catch (dbError) {
            console.error(
              `[AgentB Handler: ${runId}] Failed to update run status to failed after handler error:`,
              dbError
            );
          }
        }

        if (!res.headersSent) {
          res.statusCode = errorCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Agent request processing failed.', details: errorMessage }));
        } else {
          // Headers sent, try to send error event in stream
          res.write(
            `data: ${JSON.stringify({ type: 'thread.run.failed', timestamp: new Date().toISOString(), runId: runId || 'unknown', threadId: threadIdForRun || 'unknown', data: { status: 'failed', error: { message: 'Stream failed due to server error.', details: errorMessage } } })}\n\n`
          );
          if (!res.writableEnded) res.end();
        }
      } finally {
        if (!res.writableEnded) {
          console.debug(`[AgentB Handler: ${runId || 'N/A'}] Explicitly ending HTTP response stream.`);
          res.end();
        }
      }
    };
  }

  /**
   * Provides direct access to the configured `ApiInteractionManager` instance.
   * This is useful for advanced scenarios or testing where direct control over
   * agent runs, tool configurations, or prompt generation is needed, bypassing
   * the simplified HTTP handler. Ensures the AIM is initialized before returning.
   *
   * @returns {Promise<ApiInteractionManager>} The initialized ApiInteractionManager instance.
   */
  public async getApiInteractionManager(): Promise<ApiInteractionManager> {
    // This will create AIM if it doesn't exist, using current toolProviderSources
    return this.getOrCreateApiInteractionManager();
  }
}

// Export a singleton instance for easy global access
export const AgentB = AgentBInternal.getInstance();
