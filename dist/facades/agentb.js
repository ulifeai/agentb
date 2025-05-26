"use strict";
// src/facades/agentb.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentB = exports.AgentBInternal = void 0;
/**
 * @file AgentB - A high-level facade for simplifying the setup and usage of the AI Agent Framework.
 * It provides an opinionated, easy-to-use API for initializing the framework,
 * registering tool providers, and handling agent interactions via HTTP streaming or direct async iteration.
 */
const api_interaction_manager_1 = require("../managers/api-interaction-manager");
const openai_adapter_1 = require("../llm/adapters/openai/openai-adapter");
const memory_storage_1 = require("../threads/storage/memory-storage");
const agents_1 = require("../agents");
const errors_1 = require("../core/errors");
const uuid_1 = require("uuid");
class AgentBInternal {
    constructor() {
        this.aim = null;
        this.toolProviderSources = [];
        this.isFrameworkInitialized = false;
    }
    static getInstance() {
        if (!AgentBInternal.instance) {
            AgentBInternal.instance = new AgentBInternal();
        }
        return AgentBInternal.instance;
    }
    assertFrameworkInitialized() {
        if (!this.isFrameworkInitialized) {
            throw new errors_1.InvalidStateError('AgentB framework not initialized. Call AgentB.initialize() first.');
        }
    }
    initialize(options = {}) {
        if (this.isFrameworkInitialized) {
            console.warn('[AgentB] Already initialized. Re-initializing may lead to unexpected behavior if not resetting dependent states.');
            this.toolProviderSources = [];
        }
        const llmConfig = options.llmProvider || { provider: 'openai' };
        let defaultModelForProvider;
        if (llmConfig.provider.toLowerCase() === 'openai') {
            const openaiApiKey = llmConfig.apiKey || process.env.OPENAI_API_KEY;
            if (!openaiApiKey) {
                throw new errors_1.ConfigurationError("OpenAI API key is required. Set OPENAI_API_KEY or provide in llmProvider.apiKey.");
            }
            defaultModelForProvider = llmConfig.model || options.defaultAgentModel || 'gpt-4o-mini';
            this.llmClient = new openai_adapter_1.OpenAIAdapter({
                apiKey: openaiApiKey,
                defaultModel: defaultModelForProvider,
                ...llmConfig.options,
            });
        }
        else {
            throw new errors_1.ConfigurationError(`LLM provider "${llmConfig.provider}" is not yet supported.`);
        }
        const defaultMemoryStorage = new memory_storage_1.MemoryStorage();
        this.messageStorage = options.messageStorage || defaultMemoryStorage;
        this.agentRunStorage =
            options.agentRunStorage ||
                (this.messageStorage instanceof memory_storage_1.MemoryStorage
                    ? this.messageStorage
                    : defaultMemoryStorage);
        this.threadStorage =
            options.threadStorage ||
                (this.messageStorage instanceof memory_storage_1.MemoryStorage
                    ? this.messageStorage
                    : defaultMemoryStorage);
        this.globalDefaultAgentRunConfig = {
            ...agents_1.DEFAULT_AGENT_RUN_CONFIG,
            model: options.defaultAgentModel || defaultModelForProvider,
            ...(options.defaultAgentRunConfig || {}),
        };
        if (!this.globalDefaultAgentRunConfig.model) {
            throw new errors_1.ConfigurationError('A default agent model must be specified.');
        }
        if (options.toolProviders && Array.isArray(options.toolProviders)) {
            options.toolProviders.forEach(sourceConfig => {
                try {
                    this._registerToolProviderInternal(sourceConfig);
                }
                catch (error) {
                    console.error(`[AgentB] Error registering tool provider (ID: ${sourceConfig.id || 'unknown'}) during initialization:`, error);
                }
            });
        }
        this.isFrameworkInitialized = true;
        this.aim = null;
        console.info(`[AgentB] Framework initialized. Default model: ${this.globalDefaultAgentRunConfig.model}. Tool sources: ${this.toolProviderSources.length}`);
    }
    _registerToolProviderInternal(sourceConfig) {
        if (!sourceConfig.id) {
            throw new errors_1.ConfigurationError("ToolProviderSourceConfig must have 'id'.");
        }
        const existingIndex = this.toolProviderSources.findIndex((s) => s.id === sourceConfig.id);
        if (existingIndex !== -1) {
            console.warn(`[AgentB] Tool provider ID "${sourceConfig.id}" replaced.`);
            this.toolProviderSources.splice(existingIndex, 1);
        }
        this.toolProviderSources.push(sourceConfig);
    }
    registerToolProvider(sourceConfig) {
        this.assertFrameworkInitialized();
        this._registerToolProviderInternal(sourceConfig);
        console.info(`[AgentB] Registered tool provider source: "${sourceConfig.id}". Total: ${this.toolProviderSources.length}`);
        this.aim = null;
    }
    async getOrCreateApiInteractionManager() {
        this.assertFrameworkInitialized();
        if (!this.aim) {
            let mode;
            let toolsetOrchestratorConfig;
            let genericOpenApiProviderConfig;
            if (this.toolProviderSources.length === 0) {
                mode = 'genericOpenApi';
                console.warn("[AgentB] No tool providers for AIM. Mode: 'genericOpenApi', limited capabilities.");
            }
            else if (this.toolProviderSources.length === 1 &&
                (this.toolProviderSources[0].type === 'openapi' || this.toolProviderSources[0].type === undefined)) {
                mode = 'genericOpenApi';
                genericOpenApiProviderConfig = {
                    ...this.toolProviderSources[0].openapiConnectorOptions,
                    sourceId: this.toolProviderSources[0].id
                };
                console.info(`[AgentB] AIM mode: 'genericOpenApi' with source: ${this.toolProviderSources[0].id}`);
            }
            else {
                mode = 'hierarchicalPlanner';
                toolsetOrchestratorConfig = this.toolProviderSources;
                console.info(`[AgentB] AIM mode: '${mode}' with ${this.toolProviderSources.length} sources.`);
            }
            const aimOptions = {
                mode,
                llmClient: this.llmClient,
                messageStorage: this.messageStorage,
                agentRunStorage: this.agentRunStorage,
                toolsetOrchestratorConfig,
                genericOpenApiProviderConfig,
                defaultAgentRunConfig: this.globalDefaultAgentRunConfig,
            };
            this.aim = new api_interaction_manager_1.ApiInteractionManager(aimOptions);
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
    async *runHttpInteractionStream(threadId, userMessage, agentRunConfigOverride = {}, existingRunId) {
        this.assertFrameworkInitialized();
        if (!threadId || typeof threadId !== 'string' || !threadId.trim()) {
            throw new errors_1.ConfigurationError("threadId must be a non-empty string.");
        }
        if (!userMessage || userMessage.role !== 'user' || !userMessage.content ||
            (typeof userMessage.content === 'string' && !userMessage.content.trim())) {
            throw new errors_1.ConfigurationError("userMessage must be a valid LLMMessage with role 'user' and non-empty content.");
        }
        const aim = await this.getOrCreateApiInteractionManager();
        const runId = existingRunId || (0, uuid_1.v4)();
        // Merge configurations: AIM default -> handler override (which includes auth overrides)
        const finalRunConfig = {
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
        }
        else {
            await this.agentRunStorage.updateRun(runId, {
                config: finalRunConfig,
                status: 'in_progress'
            });
        }
        console.info(`[AgentB Core Stream] Starting agent interaction. RunID: ${runId}, ThreadID: ${threadId}, AuthOverrides: ${!!finalRunConfig.requestAuthOverrides}`);
        try {
            yield* aim.runAgentInteraction(threadId, [userMessage], finalRunConfig, // Pass the config that now contains requestAuthOverrides
            runId);
        }
        catch (error) {
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
            };
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
            }
            catch (storageError) {
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
    getExpressStreamingHttpHandler(handlerOptions) {
        this.assertFrameworkInitialized();
        const defaultGetThreadId = async (req, threadStorage) => {
            const requestedThreadId = req.query?.threadId || req.body?.threadId;
            if (requestedThreadId && typeof requestedThreadId === 'string') {
                const threadExists = await threadStorage.getThread(requestedThreadId);
                if (threadExists)
                    return requestedThreadId;
            }
            return (await threadStorage.createThread({ title: `Chat (Express) ${new Date().toISOString()}` })).id;
        };
        const defaultGetUserMessage = async (req) => {
            return req.body?.prompt;
        };
        const getThreadId = handlerOptions?.getThreadId || defaultGetThreadId;
        const getUserMessageCallback = handlerOptions?.getUserMessage || defaultGetUserMessage;
        const authorizeRequestCallback = handlerOptions?.authorizeRequest;
        const initialAgentRunConfigFromHandler = handlerOptions?.initialAgentRunConfig || {};
        return async (req, res) => {
            let threadIdForRun;
            let userMessageForRun;
            let actualRunIdForErrorReporting; // To use in error handling if run starts
            let agentRunConfigForThisCall = { ...initialAgentRunConfigFromHandler };
            try {
                threadIdForRun = await getThreadId(req, this.threadStorage);
                if (authorizeRequestCallback) {
                    // Pass threadIdForRun to authorizeRequestCallback as it's now guaranteed to be a string
                    const authOutcome = await authorizeRequestCallback(req, threadIdForRun);
                    if (authOutcome === false) {
                        res.statusCode = 403;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'Forbidden' }));
                        return;
                    }
                    else if (typeof authOutcome === 'object') {
                        agentRunConfigForThisCall.requestAuthOverrides = authOutcome;
                        console.debug(`[AgentB Express Handler] Per-provider auth overrides provided.`);
                    }
                }
                const userMessageInput = await getUserMessageCallback(req);
                if (typeof userMessageInput === 'string') {
                    if (!userMessageInput || !userMessageInput.trim()) {
                        res.statusCode = 400;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'User prompt is missing or empty.' }));
                        return;
                    }
                    userMessageForRun = { role: 'user', content: userMessageInput };
                }
                else if (userMessageInput?.role === 'user' && userMessageInput.content) {
                    if (typeof userMessageInput.content === 'string' && !userMessageInput.content.trim()) {
                        res.statusCode = 400;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ error: 'User message content is missing or empty.' }));
                        return;
                    }
                    userMessageForRun = userMessageInput;
                }
                else {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    const errorDetail = (userMessageInput === null || userMessageInput === undefined || (typeof userMessageInput === 'string' && !userMessageInput.trim()))
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
                const agentEventStream = this.runHttpInteractionStream(threadIdForRun, userMessageForRun, agentRunConfigForThisCall
                // existingRunId could be passed here if the handler supports continuations
                );
                for await (const event of agentEventStream) {
                    if (event.runId && !actualRunIdForErrorReporting)
                        actualRunIdForErrorReporting = event.runId;
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                }
            }
            catch (error) {
                console.error(`[AgentB Express Handler] Critical error:`, error);
                const errorMessage = error.message || 'Unknown server error.';
                const errorCode = (error instanceof errors_1.ConfigurationError || error instanceof errors_1.InvalidStateError) ? 400 : 500;
                // Note: runHttpInteractionStream should ideally handle updating its own run to 'failed'.
                // This handler's error catch is for errors *outside* or *before* runHttpInteractionStream fully takes over
                // or if runHttpInteractionStream itself throws before yielding its own failure event.
                if (!res.headersSent) {
                    res.statusCode = errorCode;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Request processing failed.', details: errorMessage }));
                }
                else if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({ type: 'thread.run.failed', timestamp: new Date().toISOString(), runId: actualRunIdForErrorReporting || 'unknown_handler_run', threadId: threadIdForRun || 'unknown', data: { status: 'failed', error: { message: 'Stream failed due to server error.', details: errorMessage } } })}\n\n`);
                    res.end();
                }
            }
            finally {
                if (!res.writableEnded) {
                    res.end();
                }
            }
        };
    }
    async getApiInteractionManager() {
        return this.getOrCreateApiInteractionManager();
    }
}
exports.AgentBInternal = AgentBInternal;
exports.AgentB = AgentBInternal.getInstance();
//# sourceMappingURL=agentb.js.map