/**
 * @file ApiInteractionManager - Provides a high-level interface for applications
 * to interact with the agent system. It manages agent instantiation, execution,
 * and different operational modes (e.g., generic tool access vs. router-based agent interaction).
 * This class is the primary entry point for applications using the agent framework.
 */
import { IToolSet, ITool } from '../core/tool';
import { ILLMClient, LLMMessage } from '../llm/types';
import { ToolProviderSourceConfig } from './toolset-orchestrator';
import { ConnectorAuthentication } from '../openapi/types';
import { OpenAPIConnectorOptions } from '../openapi/connector';
import { IAgent, AgentEvent, AgentRunConfig, IAgentRunStorage } from '../agents';
import { IMessageStorage } from '../threads/types';
/**
 * Defines the operational modes for the ApiInteractionManager.
 * - `genericOpenApi`: Exposes tools from a single OpenAPI specification directly,
 *                     or provides a generic HTTP tool if no specific operations are used.
 * - `toolsetsRouter`: Exposes a single "Router Tool" that delegates tasks to various
 *                     IToolSets, each potentially specialized (e.g., from different API tags or providers).
 */
export type ApiInteractionMode = 'genericOpenApi' | 'toolsetsRouter' | 'hierarchicalPlanner';
/**
 * Configuration options for the ApiInteractionManager.
 */
export interface ApiInteractionManagerOptions {
    /** The operational mode for this manager ('genericOpenApi' or 'toolsetsRouter'). */
    mode: ApiInteractionMode;
    /** An instance of an ILLMClient for interacting with language models. This is mandatory. */
    llmClient: ILLMClient;
    /**
     * Optional: Storage adapter for messages. Defaults to `MemoryStorage`.
     * For persistent storage, provide a database-backed implementation of `IMessageStorage`.
     */
    messageStorage?: IMessageStorage;
    /**
     * Optional: Storage adapter for agent run states. Defaults to `MemoryStorage` (or the same instance as messageStorage if it's MemoryStorage).
     * For persistent storage, provide a database-backed implementation of `IAgentRunStorage`.
     */
    agentRunStorage?: IAgentRunStorage;
    /**
     * Optional: Storage adapter for thread-specific messages. Defaults to `MemoryStorage`.
     * For persistent storage, provide a database-backed implementation of `IMessageStorage`.
     */
    threadStorage?: IMessageStorage;
    /**
     * Configuration for the `ToolsetOrchestrator`. Required if `mode` is 'toolsetsRouter'.
     * Defines how multiple `IToolSet` instances are created (e.g., from different OpenAPI specs or tags).
     */
    toolsetOrchestratorConfig?: ToolProviderSourceConfig[];
    /**
     * Configuration for a single `OpenAPIConnector`. Required if `mode` is 'genericOpenApi'.
     * The tools from this provider (including potentially a generic HTTP tool) will be directly available.
     */
    genericOpenApiProviderConfig?: OpenAPIConnectorOptions;
    /**
     * Optional: Default agent run configuration. These values will be used for agent runs
     * unless overridden by call-specific configurations.
     */
    defaultAgentRunConfig?: Partial<AgentRunConfig>;
    /**
     * Optional: A constructor for a custom agent implementation that conforms to the `IAgent` interface.
     * If not provided, `BaseAgent` will be used by default.
     * The constructor should be parameterless as dependencies are injected via `IAgentContext`.
     */
    agentImplementation?: new () => IAgent;
    /**
     * Optional: Business context text to be appended to system prompts.
     */
    businessContextText?: string;
}
/**
 * ApiInteractionManager serves as the main facade for applications to interact with agents
 * and their underlying tool systems. It abstracts the complexity of different operational modes,
 * agent instantiation, and run lifecycle management.
 */
export declare class ApiInteractionManager {
    private options;
    private mode;
    private llmClient;
    private messageStorage;
    private agentRunStorage;
    private threadStorage;
    defaultAgentRunConfig: AgentRunConfig;
    agentImplementation: new () => IAgent;
    private toolsetOrchestrator?;
    private genericToolProvider?;
    private aggregatedMasterToolProvider?;
    private _isInitialized;
    private initializationPromise;
    constructor(options: ApiInteractionManagerOptions);
    /**
     * Initializes the manager based on the configured mode.
     * This involves setting up the ToolsetOrchestrator or the generic OpenAPI provider.
     * This method is called by `ensureInitialized`.
     */
    private _initialize;
    /**
     * Ensures that the ApiInteractionManager has completed its asynchronous initialization.
     * Subsequent calls will return the promise from the first initialization.
     * @throws {ApplicationError} if initialization fails.
     */
    ensureInitialized(): Promise<void>;
    /**
     * Asserts that the manager is initialized, throwing an error if not.
     * @throws {InvalidStateError} if not initialized.
     */
    private assertInitialized;
    /**
     * Gets the tool definitions formatted for the primary LLM (e.g., OpenAI's specific format).
     * - In 'genericOpenApi' mode, returns tools from the configured OpenAPI provider.
     * - In 'toolsetsRouter' mode, returns a single "Router Tool" definition.
     * @returns {Promise<LLMToolFunctionDefinition[]>} A promise resolving to an array of LLM-provider-specific tool formats.
     * @throws {InvalidStateError} if the manager or necessary components are not initialized.
     */
    getPrimaryLLMFormattedTools(): Promise<any[]>;
    /**
     * Gets the system prompt for the primary LLM, tailored to the configured mode and context.
     * @param customBusinessContext Optional string to append to the system prompt.
     * @returns {Promise<string>} A promise resolving to the system prompt string.
     * @throws {InvalidStateError} if the manager or necessary components are not initialized.
     */
    getPrimaryLLMSystemPrompt(customBusinessContext?: string): Promise<string>;
    /**
     * Helper to create an instance of the DelegateToSpecialistTool, injecting necessary dependencies.
     */
    private createDelegateToSpecialistTool;
    /**
     * Helper to dynamically generate the definition for the Router Tool.
     * This is used in 'toolsetsRouter' mode.
     * @param orchestrator The ToolsetOrchestrator instance.
     * @returns {Promise<IToolDefinition>} The definition of the router tool.
     */
    private getRouterToolDefinition;
    /**
     * Creates a temporary IToolProvider that offers a single "Router Tool".
     * This tool, when executed, uses the ToolsetOrchestrator to delegate
     * to a specific tool within a specific toolset.
     * @param orchestrator The ToolsetOrchestrator instance.
     * @returns {IToolProvider} An IToolProvider for the router tool.
     */
    private createRouterToolProvider;
    /**
     * Starts or continues an agent interaction on a given thread.
     * This method orchestrates the agent's lifecycle for a single run or continuation.
     *
     * @param threadId The ID of the conversation thread.
     * @param initialTurnMessages Messages to start this turn with (e.g., new user input, or tool results).
     * @param agentRunConfigOverride Optional configuration overrides for this specific run.
     * @param existingRunId Optional: If continuing an existing run (e.g., after 'requires_action'), provide its ID.
     *                      Otherwise, a new run ID will be generated.
     * @returns An AsyncGenerator yielding `AgentEvent` objects, detailing the agent's progress.
     * @throws {ConfigurationError} if essential configuration like the agent model is missing.
     * @throws {InvalidStateError} if prerequisites for the run are not met (e.g., manager not initialized).
     * @throws {ApplicationError} if the specified `existingRunId` is not found or not in a continuable state.
     */
    runAgentInteraction(threadId: string, initialTurnMessages: LLMMessage[], agentRunConfigOverride?: Partial<AgentRunConfig>, existingRunId?: string): AsyncGenerator<AgentEvent, void, undefined>;
    /**
     * Continues an agent run that is in a 'requires_action' state by submitting tool outputs.
     *
     * @param runId The ID of the agent run to continue.
     * @param threadId The ID of the thread the run belongs to.
     * @param toolOutputs An array of tool outputs to submit.
     * @param agentRunConfigOverride Optional configuration overrides for this continuation.
     * @returns An AsyncGenerator yielding `AgentEvent` objects as the agent run progresses.
     * @throws {ApplicationError} if the run is not found.
     * @throws {InvalidStateError} if the run is not in 'requires_action' state or agent doesn't support `submitToolOutputs`.
     */
    continueAgentRunWithToolOutputs(runId: string, threadId: string, // Included for context, though runId should be sufficient to fetch run details
    toolOutputs: Array<{
        tool_call_id: string;
        output: string;
        tool_name?: string;
    }>, agentRunConfigOverride?: Partial<AgentRunConfig>): AsyncGenerator<AgentEvent, void, undefined>;
    /**
     * Updates the authentication configuration for underlying OpenAPI connectors.
     * The behavior depends on the manager's mode.
     *
     * @param newAuth If mode is 'genericOpenApi', this is the `ConnectorAuthentication` object.
     *                If mode is 'toolsetsRouter', this is a callback function:
     *                `(sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined`
     *                which receives the source ID and its current options, and should return the new auth config for it.
     * @throws {ConfigurationError} if `newAuth` is of the wrong type for the current mode.
     */
    updateAuthentication(newAuth: ConnectorAuthentication | ((sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined)): Promise<void>;
    /**
     * Retrieves a specific toolset by its ID, if the manager is in 'toolsetsRouter' mode.
     * @param toolsetId The ID of the toolset to retrieve.
     * @returns {Promise<IToolSet | undefined>} A promise resolving to the `IToolSet` or `undefined` if not found or not in correct mode.
     */
    getToolset(toolsetId: string): Promise<IToolSet | undefined>;
    /**
     * Retrieves all available toolsets, if the manager is in 'toolsetsRouter' mode.
     * @returns {Promise<IToolSet[]>} A promise resolving to an array of `IToolSet` objects.
     */
    getAllToolsets(): Promise<IToolSet[]>;
    /**
     * Retrieves all tools from the generic OpenAPI provider, if the manager is in 'genericOpenApi' mode.
     * @returns {Promise<ITool[]>} A promise resolving to an array of `ITool` objects.
     */
    getAllGenericTools(): Promise<ITool[]>;
}
