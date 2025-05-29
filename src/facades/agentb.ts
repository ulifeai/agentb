
/**
 * @file AgentB - A high-level facade for simplifying the setup and usage of the AI Agent Framework.
 * It provides an opinionated, easy-to-use API for initializing the framework,
 * registering tool providers, and handling agent interactions via HTTP streaming or direct async iteration.
 */

import {
  ApiInteractionManager,
  ApiInteractionManagerOptions,
  ApiInteractionMode,
} from '../managers/api-interaction-manager';
import { ToolProviderSourceConfig } from '../managers/toolset-orchestrator';
import { ILLMClient, LLMMessage } from '../llm/types';
import { OpenAIAdapter, OpenAIAdapterOptions } from '../llm/adapters/openai/openai-adapter';
import { IMessageStorage, IThreadStorage } from '../threads/types';
import { MemoryStorage } from '../threads/storage/memory-storage';
import { AgentEvent, AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG, IAgentRun, IAgentRunStorage } from '../agents';
import { ConfigurationError, ApplicationError, InvalidStateError } from '../core/errors';
import { v4 as uuidv4 } from 'uuid';
import { OpenAPIConnectorOptions } from '../openapi/connector';
import { PerProviderAuthOverrides } from '../openapi/types';

// --- Configuration Types specific to AgentB Facade ---

interface AgentBLLMProviderConfig {
  provider: 'openai' | string;
  apiKey?: string;
  model?: string;
  options?: Record<string, any>;
}

interface AgentBInitializationOptions {
  apiKey?: string;
  llmProvider?: AgentBLLMProviderConfig;
  defaultAgentModel?: string;
  messageStorage?: IMessageStorage;
  agentRunStorage?: IAgentRunStorage;
  threadStorage?: IThreadStorage;
  defaultAgentRunConfig?: Partial<AgentRunConfig>;
  toolProviders?: ToolProviderSourceConfig[];
}

// --- Streaming HTTP Handler Options (for convenience handlers) ---
interface AgentBExpressHttpHandlerOptions {
    getThreadId?: (req: any, threadStorage: IThreadStorage) => Promise<string>;
    getUserMessage?: (req: any) => Promise<string | LLMMessage>;
    /**
     * Asynchronously performs authorization checks.
     * Can return:
     * - `true`: Authorized, use static tool authentication.
     * - `false`: Forbidden.
     * - `PerProviderAuthOverrides`: Authorized, and use these auth details for specific providers.
     */
    authorizeRequest?: (req: any, threadId: string) => Promise<boolean | PerProviderAuthOverrides>;
    initialAgentRunConfig?: Partial<AgentRunConfig>;
}


export class AgentBInternal {
  private static instance: AgentBInternal;

  private llmClient!: ILLMClient;
  private messageStorage!: IMessageStorage;
  private agentRunStorage!: IAgentRunStorage;
  private threadStorage!: IThreadStorage;
  private globalDefaultAgentRunConfig!: AgentRunConfig;

  private aim: ApiInteractionManager | null = null;
  private toolProviderSources: ToolProviderSourceConfig[] = [];
  private isFrameworkInitialized = false;

  private constructor() {}

  public static getInstance(): AgentBInternal {
    if (!AgentBInternal.instance) {
      AgentBInternal.instance = new AgentBInternal();
    }
    return AgentBInternal.instance;
  }

  private assertFrameworkInitialized(): void {
    if (!this.isFrameworkInitialized) {
      throw new InvalidStateError('AgentB framework not initialized. Call AgentB.initialize() first.');
    }
  }

  public initialize(options: AgentBInitializationOptions = {}): void {
    if (this.isFrameworkInitialized) {
      console.warn(
        '[AgentB] Already initialized. Re-initializing may lead to unexpected behavior if not resetting dependent states.'
      );
      this.toolProviderSources = [];
    }

    const llmConfig = options.llmProvider || { provider: 'openai' };
    let defaultModelForProvider: string;

    if (llmConfig.provider.toLowerCase() === 'openai') {
      const openaiApiKey = llmConfig.apiKey || process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new ConfigurationError(
          "OpenAI API key is required. Set OPENAI_API_KEY or provide in llmProvider.apiKey."
        );
      }
      defaultModelForProvider = llmConfig.model || options.defaultAgentModel || 'gpt-4o-mini';
      this.llmClient = new OpenAIAdapter({
        apiKey: openaiApiKey,
        defaultModel: defaultModelForProvider,
        ...(llmConfig.options as OpenAIAdapterOptions),
      });
    } else {
      throw new ConfigurationError(`LLM provider "${llmConfig.provider}" is not yet supported.`);
    }

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

    this.globalDefaultAgentRunConfig = {
      ...DEFAULT_AGENT_RUN_CONFIG,
      model: options.defaultAgentModel || defaultModelForProvider,
      ...(options.defaultAgentRunConfig || {}),
    };
    if (!this.globalDefaultAgentRunConfig.model) {
      throw new ConfigurationError(
        'A default agent model must be specified.'
      );
    }

    if (options.toolProviders && Array.isArray(options.toolProviders)) {
      options.toolProviders.forEach(sourceConfig => {
        try {
          this._registerToolProviderInternal(sourceConfig);
        } catch (error) {
          console.error(`[AgentB] Error registering tool provider (ID: ${sourceConfig.id || 'unknown'}) during initialization:`, error);
        }
      });
    }

    this.isFrameworkInitialized = true;
    this.aim = null; 
    console.info(
      `[AgentB] Framework initialized. Default model: ${this.globalDefaultAgentRunConfig.model}. Tool sources: ${this.toolProviderSources.length}`
    );
  }

  private _registerToolProviderInternal(sourceConfig: ToolProviderSourceConfig): void {
    if (!sourceConfig.id) {
      throw new ConfigurationError("ToolProviderSourceConfig must have 'id'.");
    }
    const existingIndex = this.toolProviderSources.findIndex((s) => s.id === sourceConfig.id);
    if (existingIndex !== -1) {
      console.warn(`[AgentB] Tool provider ID "${sourceConfig.id}" replaced.`);
      this.toolProviderSources.splice(existingIndex, 1);
    }
    this.toolProviderSources.push(sourceConfig);
  }

  public registerToolProvider(sourceConfig: ToolProviderSourceConfig): void {
    this.assertFrameworkInitialized();
    this._registerToolProviderInternal(sourceConfig);
    console.info(
      `[AgentB] Registered tool provider source: "${sourceConfig.id}". Total: ${this.toolProviderSources.length}`
    );
    this.aim = null;
  }

  private async getOrCreateApiInteractionManager(): Promise<ApiInteractionManager> {
    this.assertFrameworkInitialized();
    if (!this.aim) {
      let mode: ApiInteractionMode;
      let toolsetOrchestratorConfig: ToolProviderSourceConfig[] | undefined;
      let genericOpenApiProviderConfig: OpenAPIConnectorOptions | undefined;

      if (this.toolProviderSources.length === 0) {
        mode = 'genericOpenApi';
        console.warn("[AgentB] No tool providers for AIM. Mode: 'genericOpenApi', limited capabilities.");
      } else if (this.toolProviderSources.length === 1 &&
                 (this.toolProviderSources[0].type === 'openapi' || this.toolProviderSources[0].type === undefined)) {
        mode = 'genericOpenApi';
        genericOpenApiProviderConfig = { 
            ...this.toolProviderSources[0].openapiConnectorOptions, 
            sourceId: this.toolProviderSources[0].id 
        };
        console.info(`[AgentB] AIM mode: 'genericOpenApi' with source: ${this.toolProviderSources[0].id}`);
      } else {
        mode = 'hierarchicalPlanner'; 
        toolsetOrchestratorConfig = this.toolProviderSources;
        console.info(`[AgentB] AIM mode: '${mode}' with ${this.toolProviderSources.length} sources.`);
      }
      
      const aimOptions: ApiInteractionManagerOptions = {
        mode,
        llmClient: this.llmClient,
        messageStorage: this.messageStorage,
        agentRunStorage: this.agentRunStorage,
        toolsetOrchestratorConfig,
        genericOpenApiProviderConfig,
        defaultAgentRunConfig: this.globalDefaultAgentRunConfig,
      };
      this.aim = new ApiInteractionManager(aimOptions);
    }
    await this.aim.ensureInitialized();
    return this.aim;
  }

  /**
   * Core method to run an agent interaction and get a stream of events.
   * This method is framework-agnostic and can be used to integrate with any HTTP framework
   * or for non-HTTP use cases.
   *
   * @param threadId The ID of the conversation thread.
   * @param userMessage The user's message that initiates or continues the interaction.
   * @param agentRunConfigOverride Optional configuration overrides for this specific run (can include `requestAuthOverrides`).
   * @param existingRunId Optional: If continuing an existing run (e.g., after 'requires_action').
   * @returns An AsyncGenerator yielding `AgentEvent` objects.
   */
  public async *runHttpInteractionStream(
    threadId: string,
    userMessage: LLMMessage,
    agentRunConfigOverride: Partial<AgentRunConfig> = {},
    existingRunId?: string
  ): AsyncGenerator<AgentEvent, void, undefined> {
    this.assertFrameworkInitialized();

    if (!threadId || typeof threadId !== 'string' || !threadId.trim()) {
        throw new ConfigurationError("threadId must be a non-empty string.");
    }
    if (!userMessage || userMessage.role !== 'user' || !userMessage.content || 
        (typeof userMessage.content === 'string' && !userMessage.content.trim())) {
        throw new ConfigurationError("userMessage must be a valid LLMMessage with role 'user' and non-empty content.");
    }

    const aim = await this.getOrCreateApiInteractionManager();
    const runId = existingRunId || uuidv4();
    
    // Merge configurations: AIM default -> handler override (which includes auth overrides)
    const finalRunConfig: AgentRunConfig = {
        ...aim.defaultAgentRunConfig,
        ...agentRunConfigOverride, 
    };
    
    let agentTypeName = 'DefaultAgent';
    if (aim.agentImplementation) {
        agentTypeName = aim.agentImplementation.name || (aim.agentImplementation.constructor ? aim.agentImplementation.constructor.name : 'CustomAgent');
    }

    if (!existingRunId) {
        await this.agentRunStorage.createRun({
            id: runId,
            threadId: threadId,
            agentType: agentTypeName,
            config: finalRunConfig, // Use the merged config
        });
    } else {
        await this.agentRunStorage.updateRun(runId, {
            config: finalRunConfig,
            status: 'in_progress' 
        });
    }
    
    console.info(`[AgentB Core Stream] Starting agent interaction. RunID: ${runId}, ThreadID: ${threadId}, AuthOverrides: ${!!finalRunConfig.requestAuthOverrides}`);

    try {
        yield* aim.runAgentInteraction(
            threadId,
            [userMessage],
            finalRunConfig, // Pass the config that now contains requestAuthOverrides
            runId 
        );
    } catch (error: any) {
        console.error(`[AgentB Core Stream: ${runId}] Critical error during interaction:`, error);
        const errorForStorage = { 
            code: error.name || 'core_stream_error', 
            message: error.message || 'Unknown error in core stream.',
        };
        // Yield a final failure event
        yield {
            type: 'thread.run.failed',
            timestamp: new Date(),
            runId,
            threadId,
            data: {
                status: 'failed',
                error: { ...errorForStorage, details: error.metadata }
            },
        } as AgentEvent;
        // Update run status in storage
        try {
            const currentRun = await this.agentRunStorage.getRun(runId);
            if (currentRun && currentRun.status !== 'failed') { // Avoid redundant updates
                 await this.agentRunStorage.updateRun(runId, {
                    status: 'failed',
                    completedAt: new Date(),
                    lastError: errorForStorage,
                });
            }
        } catch (storageError) {
            console.error(`[AgentB Core Stream: ${runId}] Failed to update run status to 'failed' after error:`, storageError);
        }
    }
  }


  /**
   * Convenience method to get an Express-compatible HTTP request handler for streaming agent interactions.
   * Uses `runHttpInteractionStream` internally.
   *
   * @param handlerOptions Optional callbacks to customize request processing (e.g., auth, thread/message extraction).
   * @returns An async function `(req: any, res: any) => Promise<void>` for Express.
   */
  public getExpressStreamingHttpHandler(
    handlerOptions?: AgentBExpressHttpHandlerOptions
  ): (req: any, res: any) => Promise<void> {
    this.assertFrameworkInitialized();

    const defaultGetThreadId = async (req: any, threadStorage: IThreadStorage): Promise<string> => {
      const requestedThreadId = req.query?.threadId || req.body?.threadId;
      if (requestedThreadId && typeof requestedThreadId === 'string') {
        const threadExists = await threadStorage.getThread(requestedThreadId);
        if (threadExists) return requestedThreadId;
      }
      return (await threadStorage.createThread({ title: `Chat (Express) ${new Date().toISOString()}` })).id;
    };
    
    const defaultGetUserMessage = async (req: any): Promise<string | LLMMessage> => {
        return req.body?.prompt;
    };

    const getThreadId = handlerOptions?.getThreadId || defaultGetThreadId;
    const getUserMessageCallback = handlerOptions?.getUserMessage || defaultGetUserMessage;
    const authorizeRequestCallback = handlerOptions?.authorizeRequest;
    const initialAgentRunConfigFromHandler = handlerOptions?.initialAgentRunConfig || {};

    return async (req: any, res: any): Promise<void> => {
      let threadIdForRun: string | undefined;
      let userMessageForRun: LLMMessage | undefined;
      let actualRunIdForErrorReporting: string | undefined; // To use in error handling if run starts

      let agentRunConfigForThisCall: Partial<AgentRunConfig> = { ...initialAgentRunConfigFromHandler };

      try {
        threadIdForRun = await getThreadId(req, this.threadStorage);

        if (authorizeRequestCallback) {
          // Pass threadIdForRun to authorizeRequestCallback as it's now guaranteed to be a string
          const authOutcome = await authorizeRequestCallback(req, threadIdForRun);
          if (authOutcome === false) {
            res.statusCode = 403; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Forbidden' }));
            return;
          } else if (typeof authOutcome === 'object') {
            agentRunConfigForThisCall.requestAuthOverrides = authOutcome;
            console.debug(`[AgentB Express Handler] Per-provider auth overrides provided.`);
          }
        }

        const userMessageInput = await getUserMessageCallback(req);
        if (typeof userMessageInput === 'string') {
          if (!userMessageInput || !userMessageInput.trim()) { 
            res.statusCode = 400; res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'User prompt is missing or empty.' })); return; 
          }
          userMessageForRun = { role: 'user', content: userMessageInput };
        } else if (userMessageInput?.role === 'user' && userMessageInput.content) {
           if (typeof userMessageInput.content === 'string' && !userMessageInput.content.trim()) { 
             res.statusCode = 400; res.setHeader('Content-Type', 'application/json');
             res.end(JSON.stringify({ error: 'User message content is missing or empty.' })); return; 
            }
          userMessageForRun = userMessageInput;
        } else {
            res.statusCode = 400; res.setHeader('Content-Type', 'application/json');
            const errorDetail = (userMessageInput === null || userMessageInput === undefined || (typeof userMessageInput === 'string' && !(userMessageInput as string).trim()))
                ? "User prompt/message is missing or empty."
                : "Invalid user message format from getUserMessage callback.";
            res.end(JSON.stringify({ error: errorDetail }));
            return;
        }
        
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // The runHttpInteractionStream will generate its own runId if not continuing.
        // We need to capture it if we want to use it for error reporting within this handler.
        // However, runHttpInteractionStream already handles its own run storage updates.
        const agentEventStream = this.runHttpInteractionStream(
            threadIdForRun,
            userMessageForRun,
            agentRunConfigForThisCall
            // existingRunId could be passed here if the handler supports continuations
        );

        for await (const event of agentEventStream) {
          if(event.runId && !actualRunIdForErrorReporting) actualRunIdForErrorReporting = event.runId;
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

      } catch (error: any) {
        console.error(`[AgentB Express Handler] Critical error:`, error);
        const errorMessage = error.message || 'Unknown server error.';
        const errorCode = (error instanceof ConfigurationError || error instanceof InvalidStateError) ? 400 : 500;

        // Note: runHttpInteractionStream should ideally handle updating its own run to 'failed'.
        // This handler's error catch is for errors *outside* or *before* runHttpInteractionStream fully takes over
        // or if runHttpInteractionStream itself throws before yielding its own failure event.
        if (!res.headersSent) {
          res.statusCode = errorCode;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Request processing failed.', details: errorMessage }));
        } else if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ type: 'thread.run.failed', timestamp: new Date().toISOString(), runId: actualRunIdForErrorReporting || 'unknown_handler_run', threadId: threadIdForRun || 'unknown', data: { status: 'failed', error: { message: 'Stream failed due to server error.', details: errorMessage } } })}\n\n`
          );
          res.end();
        }
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
    };
  }

  public async getApiInteractionManager(): Promise<ApiInteractionManager> {
    return this.getOrCreateApiInteractionManager();
  }
}

export const AgentB = AgentBInternal.getInstance();