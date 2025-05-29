
/**
 * @file ApiInteractionManager - Provides a high-level interface for applications
 * to interact with the agent system. It manages agent instantiation, execution,
 * and different operational modes (e.g., generic tool access vs. router-based agent interaction).
 * This class is the primary entry point for applications using the agent framework.
 */

import { IToolSet, IToolProvider, IToolResult, IToolDefinition, ITool } from '../core/tool';
import { ILLMClient, LLMMessage, LLMToolFunctionDefinition } from '../llm/types'; // LLMToolChoice is also here
import { adaptToolDefinitionsToOpenAI } from '../llm/adapters/openai/openai-tool-adapter';
import {
  generateGenericHttpToolSystemPrompt,
  generateRouterSystemPrompt,
  ROUTER_TOOL_NAME as LLM_ROUTER_TOOL_NAME, // Constant for the router tool's name
} from '../llm/prompt-builder';
import { ToolsetOrchestrator, ToolProviderSourceConfig } from './toolset-orchestrator';
import { OpenAPISpec, ConnectorAuthentication } from '../openapi/types';
import { OpenAPIConnector, OpenAPIConnectorOptions } from '../openapi/connector';
import {
  IAgent,
  AgentEvent,
  AgentRunConfig,
  DEFAULT_AGENT_RUN_CONFIG,
  BaseAgent, // Using BaseAgent as the default concrete implementation
  IAgentContext,
  IAgentRunStorage,
  IAgentRun,
  AgentStatus, // For type hinting agent run records
  // AgentStatus, // Not directly used here, but part of agent system
} from '../agents'; // Correct path to agents module index
import { LLMResponseProcessor } from '../agents/response-processor';
import { ToolExecutor } from '../agents/tool-executor';
import { ContextManager } from '../agents/context-manager';
import { MemoryStorage } from '../threads/storage/memory-storage'; // Default in-memory storage
import { AggregatedToolProvider } from '../tools/core/aggregated-tool-provider';
import { ConfigurationError, InvalidStateError, ApplicationError } from '../core/errors';
import { IMessageStorage } from '../threads/types';
import { v4 as uuidv4 } from 'uuid'; // For generating unique run IDs
import { DelegateToSpecialistTool, DelegateToolDependencies } from '../tools/core/delegate-to-specialist-tool'; // New import
import { PlanningAgent, DEFAULT_PLANNER_SYSTEM_PROMPT } from '../agents/planning-agent'; // New import

/**
 * Defines the operational modes for the ApiInteractionManager.
 * - `genericOpenApi`: Exposes tools from a single OpenAPI specification directly,
 *                     or provides a generic HTTP tool if no specific operations are used.
 * - `toolsetsRouter`: Exposes a single "Router Tool" that delegates tasks to various
 *                     IToolSets, each potentially specialized (e.g., from different API tags or providers).
 */
export type ApiInteractionMode =
  | 'genericOpenApi'
  | 'toolsetsRouter' // This mode means the main LLM is a router using the RouterTool
  | 'hierarchicalPlanner'; // New mode: Main LLM is a planner using DelegateToSpecialistTool

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
export class ApiInteractionManager {
  private options: ApiInteractionManagerOptions;
  private mode: ApiInteractionMode;
  private llmClient: ILLMClient;
  private messageStorage: IMessageStorage;
  private agentRunStorage: IAgentRunStorage;
  private threadStorage: IMessageStorage;
  public defaultAgentRunConfig: AgentRunConfig;
  public agentImplementation: new () => IAgent;

  // Mode-specific components
  private toolsetOrchestrator?: ToolsetOrchestrator;
  private genericToolProvider?: IToolProvider;
  private aggregatedMasterToolProvider?: AggregatedToolProvider;

  private _isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(options: ApiInteractionManagerOptions) {
    this.options = options;
    this.mode = options.mode;
    this.llmClient = options.llmClient;

    // Initialize storage solutions, defaulting to MemoryStorage
    this.messageStorage = options.messageStorage || new MemoryStorage();
    this.agentRunStorage = options.agentRunStorage || new MemoryStorage();
    this.threadStorage = options.threadStorage || new MemoryStorage();

    // Resolve the default agent run configuration
    this.defaultAgentRunConfig = {
      ...DEFAULT_AGENT_RUN_CONFIG, // Start with library defaults
      model: options.defaultAgentRunConfig?.model || DEFAULT_AGENT_RUN_CONFIG.model || 'gpt-4o-mini', // Ensure a model
      ...(options.defaultAgentRunConfig || {}), // Apply user-defined defaults
    };
    if (!this.defaultAgentRunConfig.model) {
      // Final check after merging
      throw new ConfigurationError(
        'A default agent model must be specified either in library defaults or ApiInteractionManagerOptions.defaultAgentRunConfig.'
      );
    }

    this.agentImplementation = options.agentImplementation || BaseAgent;

    // Validate mode-specific configurations
    if (this.mode === 'toolsetsRouter' && !options.toolsetOrchestratorConfig) {
      throw new ConfigurationError("ToolsetOrchestratorConfig is required for 'toolsetsRouter' mode.");
    }
    if (this.mode === 'hierarchicalPlanner' && !options.toolsetOrchestratorConfig) {
      throw new ConfigurationError(
        "ToolsetOrchestratorConfig is required for 'hierarchicalPlanner' mode (to provide specialists)."
      );
    } // Planner also needs toolsets
    if (this.mode === 'genericOpenApi' && !options.genericOpenApiProviderConfig) {
      throw new ConfigurationError("GenericOpenApiProviderConfig is required for 'genericOpenApi' mode.");
    }
  }

  /**
   * Initializes the manager based on the configured mode.
   * This involves setting up the ToolsetOrchestrator or the generic OpenAPI provider.
   * This method is called by `ensureInitialized`.
   */
  private async _initialize(): Promise<void> {
    console.info(`[ApiInteractionManager] Initializing in "${this.mode}" mode...`);
    if (this.mode === 'toolsetsRouter' || this.mode === 'hierarchicalPlanner') {
      if (!this.options.toolsetOrchestratorConfig) {
        // Should be caught by constructor but good for robustness
        throw new InvalidStateError('ToolsetOrchestratorConfig is missing for initialization.');
      }
      // Pass this.llmClient to the ToolsetOrchestrator constructor
      this.toolsetOrchestrator = new ToolsetOrchestrator(this.options.toolsetOrchestratorConfig, this.llmClient);
      await this.toolsetOrchestrator.ensureInitialized();
      const individualProviders = await this.toolsetOrchestrator.getToolProviders();
      if (individualProviders && individualProviders.length > 0) {
        this.aggregatedMasterToolProvider = new AggregatedToolProvider(individualProviders);
        await (this.aggregatedMasterToolProvider as { ensureInitialized(): Promise<void> }).ensureInitialized();
        console.info(`[ApiInteractionManager] AggregatedMasterToolProvider created with ${individualProviders.length} base provider(s).`);
      } else {
        // Fallback for empty or undefined providers from orchestrator
        this.aggregatedMasterToolProvider = new AggregatedToolProvider([]);
        await (this.aggregatedMasterToolProvider as { ensureInitialized(): Promise<void> }).ensureInitialized();
        console.warn('[ApiInteractionManager] ToolsetOrchestrator yielded no individual providers. AggregatedMasterToolProvider is empty.');
      }
    }
    if (this.mode === 'genericOpenApi') {
      let connectorOptsToUse: OpenAPIConnectorOptions | undefined = this.options.genericOpenApiProviderConfig;

      // This fallback (using toolsetOrchestratorConfig[0]) is primarily for AgentB's convenience
      // where it might only have a list of ToolProviderSourceConfig.
      if (!connectorOptsToUse && this.options.toolsetOrchestratorConfig && this.options.toolsetOrchestratorConfig.length > 0) {
          const firstSourceConfig = this.options.toolsetOrchestratorConfig[0];
          if (firstSourceConfig.type === 'openapi' || firstSourceConfig.type === undefined) {
            connectorOptsToUse = {
                ...(firstSourceConfig.openapiConnectorOptions as Omit<OpenAPIConnectorOptions, 'sourceId'>),
                sourceId: firstSourceConfig.id // Explicitly add sourceId from the root config
            };
            console.info(`[AIM] genericOpenApi mode using first provider from list: ${firstSourceConfig.id}`);
          }
      }
      
      if (!connectorOptsToUse) {
        throw new ConfigurationError('ApiInteractionManager: genericOpenApi mode requires either genericOpenApiProviderConfig or a valid first provider in toolsetOrchestratorConfig.');
      }
      if (!connectorOptsToUse.sourceId) {
        throw new ConfigurationError('ApiInteractionManager: genericOpenApi mode requires sourceId in connector options.');
      }

      // Only initialize genericToolProvider if in this specific mode
      if (!this.options.genericOpenApiProviderConfig) {
        // Should be caught by constructor
        throw new InvalidStateError(
          "GenericOpenApiProviderConfig is missing for 'genericOpenApi' mode during initialization."
        );
      }
      const connectorOpts = { ...connectorOptsToUse };
      // Ensure the generic HTTP tool is included if no specific tags are filtered for genericOpenApi mode
      if (connectorOpts.tagFilter === undefined && connectorOpts.includeGenericToolIfNoTagFilter === undefined) {
        connectorOpts.includeGenericToolIfNoTagFilter = true;
      }
      this.genericToolProvider = new OpenAPIConnector(connectorOpts);
      if (this.genericToolProvider.ensureInitialized) {
        await this.genericToolProvider.ensureInitialized();
      }
    }
    this._isInitialized = true;
    console.info(`[ApiInteractionManager] Successfully initialized in "${this.mode}" mode.`);
  }

  /**
   * Ensures that the ApiInteractionManager has completed its asynchronous initialization.
   * Subsequent calls will return the promise from the first initialization.
   * @throws {ApplicationError} if initialization fails.
   */
  public async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this._initialize();
    }
    try {
      await this.initializationPromise;
    } catch (error) {
      // Reset promise if initialization failed to allow retrying (though underlying issue might persist)
      this.initializationPromise = null;
      this._isInitialized = false; // Mark as not initialized
      throw error; // Re-throw the original error
    }
    if (!this._isInitialized) {
      // Should not be reached if _initialize throws on failure
      throw new ApplicationError('ApiInteractionManager could not be initialized. Check previous logs.');
    }
  }

  /**
   * Asserts that the manager is initialized, throwing an error if not.
   * @throws {InvalidStateError} if not initialized.
   */
  private assertInitialized(): void {
    if (!this._isInitialized) {
      throw new InvalidStateError('ApiInteractionManager is not initialized. Call ensureInitialized() first.');
    }
  }

  /**
   * Gets the tool definitions formatted for the primary LLM (e.g., OpenAI's specific format).
   * - In 'genericOpenApi' mode, returns tools from the configured OpenAPI provider.
   * - In 'toolsetsRouter' mode, returns a single "Router Tool" definition.
   * @returns {Promise<LLMToolFunctionDefinition[]>} A promise resolving to an array of LLM-provider-specific tool formats.
   * @throws {InvalidStateError} if the manager or necessary components are not initialized.
   */
  public async getPrimaryLLMFormattedTools(): Promise<any[]> {
    this.assertInitialized();
    let definitionsToFormat: IToolDefinition[];

    if (this.mode === 'genericOpenApi') {
      if (!this.genericToolProvider) throw new InvalidStateError('Generic tool provider not available.');
      const tools = await this.genericToolProvider.getTools();
      definitionsToFormat = await Promise.all(tools.map((t) => t.getDefinition()));
    } else if (this.mode === 'toolsetsRouter') {
      // 'toolsetsRouter'
      if (!this.toolsetOrchestrator) throw new InvalidStateError('Toolset orchestrator not available.');
      const routerToolDef = await this.getRouterToolDefinition(this.toolsetOrchestrator);
      definitionsToFormat = [routerToolDef];
    } else if (this.mode === 'hierarchicalPlanner') {
      if (!this.toolsetOrchestrator)
        throw new InvalidStateError('Toolset orchestrator not available for hierarchical planner mode.');
      // The PlanningAgent uses the DelegateToSpecialistTool
      const delegateTool = this.createDelegateToSpecialistTool();
      definitionsToFormat = [await delegateTool.getDefinition()];
    } else {
      throw new InvalidStateError(`Tool formatting not implemented for mode: ${this.mode}`);
    }

    if (this.llmClient.formatToolsForProvider) {
      return this.llmClient.formatToolsForProvider(definitionsToFormat);
    } else {
      console.warn('[AIM] llmClient missing formatToolsForProvider. Using OpenAI fallback.');
      const providerFormats = adaptToolDefinitionsToOpenAI(definitionsToFormat);
      return providerFormats.map((pf) => ({
        type: 'function',
        function: { name: pf.name, description: pf.description, parameters: pf.parametersSchema },
      }));
    }
  }

  /**
   * Gets the system prompt for the primary LLM, tailored to the configured mode and context.
   * @param customBusinessContext Optional string to append to the system prompt.
   * @returns {Promise<string>} A promise resolving to the system prompt string.
   * @throws {InvalidStateError} if the manager or necessary components are not initialized.
   */
  public async getPrimaryLLMSystemPrompt(customBusinessContext?: string): Promise<string> {
    this.assertInitialized();
    const businessContext = customBusinessContext || this.options.businessContextText || '';

    if (this.mode === 'genericOpenApi') {
      if (!this.genericToolProvider || !(this.genericToolProvider instanceof OpenAPIConnector)) {
        throw new InvalidStateError(
          "Generic tool provider (must be OpenAPIConnector) not available or of wrong type in 'genericOpenApi' mode for prompt generation."
        );
      }
      const connector = this.genericToolProvider as OpenAPIConnector;
      const specInfo = connector.getFullSpec().info;
      const baseUrl = connector.getBaseUrl();
      const operations = connector.getSpecParser().getOperations();
      return generateGenericHttpToolSystemPrompt(operations, specInfo, baseUrl, businessContext);
    } else if (this.mode === 'toolsetsRouter') {
      if (!this.toolsetOrchestrator) {
        throw new InvalidStateError('ToolsetOrchestrator not available for prompt generation in toolsetsRouter mode.');
      }
      const toolsets = await this.toolsetOrchestrator.getToolsets();
      let apiInfo: Pick<OpenAPISpec['info'], 'title' | 'version'> = {
        title: 'Managed API Services via Toolsets',
        version: '1.0',
      };
      if (toolsets.length > 0 && toolsets[0].metadata?.apiTitle) {
        apiInfo = {
          title: toolsets[0].metadata.apiTitle as string,
          version: (toolsets[0].metadata.apiVersion as string) || '1.0',
        };
      }
      return generateRouterSystemPrompt(toolsets, apiInfo, businessContext);
    } else if (this.mode === 'hierarchicalPlanner') {
      // The planning agent usually has a very specific, detailed prompt.
      // This prompt might also incorporate businessContext.
      let plannerPrompt = DEFAULT_PLANNER_SYSTEM_PROMPT; // Imported from '../agents/planning-agent'
      if (businessContext) {
        plannerPrompt += `\n\nIMPORTANT OVERALL CONTEXT FOR THE PLAN:\n${businessContext.trim()}`;
      }
      return plannerPrompt;
    // END OF ADDED BLOCK
    
    } else {
      throw new InvalidStateError(`Unsupported mode for prompt generation: ${this.mode}`);
    }
  }

  /**
   * Helper to create an instance of the DelegateToSpecialistTool, injecting necessary dependencies.
   */
  private createDelegateToSpecialistTool(): DelegateToSpecialistTool {
    if (!this.toolsetOrchestrator) {
      throw new InvalidStateError(
        "ToolsetOrchestrator is required to create DelegateToSpecialistTool but it's not initialized."
      );
    }
    const deps: DelegateToolDependencies = {
      toolsetOrchestrator: this.toolsetOrchestrator,
      masterToolProvider: this.aggregatedMasterToolProvider, // Add this line
      llmClient: this.llmClient,
      messageStorage: this.messageStorage, // Or a factory for scoped storage
      workerAgentImplementation: BaseAgent, // Default worker, can be made configurable
      getDefaultRunConfig: () => ({ ...this.defaultAgentRunConfig }), // Pass a function to get a copy of defaults
    };


    return new DelegateToSpecialistTool(deps);
  }

  /**
   * Helper to dynamically generate the definition for the Router Tool.
   * This is used in 'toolsetsRouter' mode.
   * @param orchestrator The ToolsetOrchestrator instance.
   * @returns {Promise<IToolDefinition>} The definition of the router tool.
   */
  private async getRouterToolDefinition(orchestrator: ToolsetOrchestrator): Promise<IToolDefinition> {
    const toolsets = await orchestrator.getToolsets();
    const toolsetIds = toolsets.map((ts) => ts.id).filter((id) => id); // Filter out undefined/empty IDs

    return {
      name: LLM_ROUTER_TOOL_NAME,
      description:
        'Delegates a task to a specialist Toolset that can handle a specific category of operations. ' +
        'Choose the correct Toolset based on its description and capabilities, then specify which of its tools ' +
        'should be called and provide the necessary parameters for that tool.',
      parameters: [
        {
          name: 'toolSetId',
          type: 'string',
          description: 'The ID of the specialist Toolset to delegate the task to. Choose from available toolsets.',
          required: true,
          schema: { type: 'string', enum: toolsetIds.length > 0 ? toolsetIds : undefined },
        },
        {
          name: 'toolName',
          type: 'string',
          description:
            'The name of the tool within the selected Toolset to execute. Ensure this tool is listed for the chosen Toolset.',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'toolParameters',
          type: 'object',
          description:
            "The parameters object required by the chosen 'toolName'. Structure must match the specialist tool's parameters.",
          required: true,
          schema: { type: 'object', additionalProperties: true }, // Allows any structure for parameters
        },
      ],
    };
  }

  /**
   * Creates a temporary IToolProvider that offers a single "Router Tool".
   * This tool, when executed, uses the ToolsetOrchestrator to delegate
   * to a specific tool within a specific toolset.
   * @param orchestrator The ToolsetOrchestrator instance.
   * @returns {IToolProvider} An IToolProvider for the router tool.
   */
  private createRouterToolProvider(orchestrator: ToolsetOrchestrator): IToolProvider {
    // `this` context for getRouterToolDefinition might be an issue if not bound or if it uses other `this` members.
    // Making getRouterToolDefinition static or passing orchestrator directly.
    const getDef = () => this.getRouterToolDefinition(orchestrator);

    const routerTool: ITool = {
      getDefinition: getDef, // This will be async due to orchestrator.getToolsets()
      execute: async (input: {
        toolSetId: string;
        toolName: string;
        toolParameters: Record<string, any>;
      }): Promise<IToolResult> => {
        const { toolSetId, toolName, toolParameters } = input;
        
        if (!toolSetId || !toolName) {
          return { success: false, data: null, error: "RouterTool execution requires 'toolSetId' and 'toolName'." };
        }
        const toolset = await orchestrator.getToolset(toolSetId);
        if (!toolset) {
          return { success: false, data: null, error: `Toolset with ID "${toolSetId}" not found.` };
        }
        const tool = toolset.tools.find(async (t) => (await t.getDefinition()).name === toolName); // Handle async getDefinition
        if (!tool) {
          return {
            success: false,
            data: null,
            error: `Tool "${toolName}" not found in toolset "${toolSetId}". Available: ${(await Promise.all(toolset.tools.map(async (t) => (await t.getDefinition()).name))).join(', ')}`,
          };
        }
        try {
          console.info(
            `[RouterTool] Executing tool "${toolName}" from toolset "${toolSetId}" with params:`,
            JSON.stringify(toolParameters).substring(0, 200) +
              (JSON.stringify(toolParameters).length > 200 ? '...' : '')
          );
          return await tool.execute(toolParameters);
        } catch (err: any) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `[RouterTool] Error executing tool "${toolName}" from toolset "${toolSetId}": ${errorMsg}`,
            err
          );
          return { success: false, data: null, error: `Error during execution of tool "${toolName}": ${errorMsg}` };
        }
      },
    };

    return {
      getTools: async () => [routerTool],
      getTool: async (name: string) => (name === LLM_ROUTER_TOOL_NAME ? routerTool : undefined),
    };
  }

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
  public async *runAgentInteraction(
    threadId: string,
    initialTurnMessages: LLMMessage[],
    agentRunConfigOverride: Partial<AgentRunConfig> = {},
    existingRunId?: string
  ): AsyncGenerator<AgentEvent, void, undefined> {
    this.assertInitialized();

    const runId = existingRunId || uuidv4();
    const effectiveRunConfig: AgentRunConfig = {
      ...this.defaultAgentRunConfig,
      ...agentRunConfigOverride,
      model: agentRunConfigOverride.model || this.defaultAgentRunConfig.model,
    };
    if (!effectiveRunConfig.model) {
      throw new ConfigurationError("Agent run configuration must include a 'model'.");
    }

    // If hierarchicalPlanner mode, ensure its specific system prompt is used if not overridden
    if (this.mode === 'hierarchicalPlanner' && !effectiveRunConfig.systemPrompt) {
      effectiveRunConfig.systemPrompt = DEFAULT_PLANNER_SYSTEM_PROMPT;
    }

    // In runAgentInteraction & continueAgentRunWithToolOutputs
    // ...
    let agentToolProvider: IToolProvider;
    // AgentToRunClass will be determined based on mode and this.agentImplementation
    let AgentToRunClass: new () => IAgent = this.agentImplementation; 

    if (this.mode === 'genericOpenApi') {
      if (!this.genericToolProvider) {
        throw new InvalidStateError('Generic tool provider not initialized for agent run.');
      }
      agentToolProvider = this.genericToolProvider;
      // AgentToRunClass remains this.agentImplementation (e.g., BaseAgent)
    } else if (this.mode === 'toolsetsRouter') {
      if (!this.toolsetOrchestrator) {
        throw new InvalidStateError('Toolset orchestrator not initialized for agent run.');
      }
      agentToolProvider = this.createRouterToolProvider(this.toolsetOrchestrator);
      // AgentToRunClass remains this.agentImplementation (e.g., BaseAgent), sees only RouterTool
    } else if (this.mode === 'hierarchicalPlanner') {
      if (!this.toolsetOrchestrator || !this.aggregatedMasterToolProvider) {
        throw new InvalidStateError('ToolsetOrchestrator or AggregatedMasterToolProvider not initialized for hierarchical planner.');
      }

      // If this.agentImplementation is PlanningAgent, or if it's the default (BaseAgent) for this mode,
      // then use PlanningAgent and give it the DelegateToSpecialistTool.
      const effectivelyPlanningAgent = 
        (this.agentImplementation.name === BaseAgent.name && !this.options.agentImplementation) || // It's the default BaseAgent
        (this.agentImplementation.name === PlanningAgent.name); // It's explicitly PlanningAgent

      if (effectivelyPlanningAgent) {
        AgentToRunClass = PlanningAgent; // Override to PlanningAgent
        // Ensure PlanningAgent gets its specific system prompt if not already overridden by user
        if (!effectiveRunConfig.systemPrompt || effectiveRunConfig.systemPrompt === this.defaultAgentRunConfig.systemPrompt) {
            effectiveRunConfig.systemPrompt = DEFAULT_PLANNER_SYSTEM_PROMPT;
        }
        const delegateTool = this.createDelegateToSpecialistTool();
        agentToolProvider = {
          getTools: async () => [delegateTool],
          getTool: async (name: string) => ((await delegateTool.getDefinition()).name === name ? delegateTool : undefined),
          ensureInitialized: async () => Promise.resolve(),
        };
      } else {
        // User has explicitly provided a non-PlanningAgent (e.g. BaseAgent) for this mode's config.
        // This agent should get all tools from the orchestrator.
        AgentToRunClass = this.agentImplementation; // Use the explicitly set agent
        agentToolProvider = this.aggregatedMasterToolProvider;
        // If the system prompt was the default planner prompt, revert to a more generic one.
        if (effectiveRunConfig.systemPrompt === DEFAULT_PLANNER_SYSTEM_PROMPT) {
          effectiveRunConfig.systemPrompt = this.defaultAgentRunConfig.systemPrompt || "You are a helpful AI assistant. Please use tools if necessary.";
        }
      }
    } else {
      throw new InvalidStateError(`Agent run not implemented for mode: ${this.mode}`);
    }
    
    // --- Agent Run State Management ---
    let agentRunRecord: IAgentRun;
    if (existingRunId) {
      const existingRecord = await this.agentRunStorage.getRun(existingRunId);
      if (!existingRecord) {
        throw new ApplicationError(`Cannot continue run: Agent run with ID "${existingRunId}" not found.`);
      }
      // Allow continuation from 'requires_action', or re-starting 'queued'/'in_progress' for resilience
      const continuableStates: AgentStatus[] = ['requires_action', 'queued', 'in_progress'];
      if (!continuableStates.includes(existingRecord.status)) {
        throw new InvalidStateError(
          `Cannot continue run: Agent run "${existingRunId}" is not in a continuable state (current status: ${existingRecord.status}).`
        );
      }
      agentRunRecord = await this.agentRunStorage.updateRun(existingRunId, {
        status: 'in_progress',
        startedAt: existingRecord.startedAt || new Date(), // Preserve original start time if continuing
        config: effectiveRunConfig, // Update config if overridden for this continuation
      });
    } else {
      agentRunRecord = await this.agentRunStorage.createRun({
        id: runId,
        threadId,
        agentType: AgentToRunClass.name, // e.g., "BaseAgent" or custom agent class name
        config: effectiveRunConfig,
        // status is typically 'queued' or 'in_progress' upon creation by storage adapter
      });
      // Ensure status is 'in_progress' if not already set by createRun
      if (agentRunRecord.status !== 'in_progress') {
        agentRunRecord = await this.agentRunStorage.updateRun(runId, {
          status: 'in_progress',
          startedAt: agentRunRecord.startedAt || new Date(),
        });
      }
    }
    // --- End Agent Run State Management ---

    // Instantiate core agent components for this specific run
    const responseProcessor = new LLMResponseProcessor(effectiveRunConfig.responseProcessorConfig);
    const toolExecutor = new ToolExecutor(agentToolProvider, effectiveRunConfig.toolExecutorConfig);
    const contextManager = new ContextManager(
      this.messageStorage,
      this.llmClient,
      effectiveRunConfig.contextManagerConfig // Pass ContextManager specific config
    );

    const agentContext: IAgentContext = {
      runId: agentRunRecord.id,
      threadId,
      llmClient: this.llmClient,
      toolProvider: agentToolProvider,
      messageStorage: this.messageStorage,
      responseProcessor,
      toolExecutor,
      contextManager,
      runConfig: effectiveRunConfig,
    };

    const agent = new AgentToRunClass(); // Use the determined AgentToRunClass

    try {
      for await (const event of agent.run(agentContext, initialTurnMessages)) {
        yield event; // Forward agent events to the caller

        // Update the persistent AgentRun status based on terminal events from the agent
        // Non-terminal events like 'message.created' or 'tool.execution.started' don't change the overall run status.
        switch (event.type) {
          case 'thread.run.completed':
            await this.agentRunStorage.updateRun(runId, { status: 'completed', completedAt: new Date() });
            break;
          case 'thread.run.failed':
            await this.agentRunStorage.updateRun(runId, {
              status: 'failed',
              completedAt: new Date(),
              lastError: event.data.error,
            });
            break;
          case 'thread.run.requires_action':
            await this.agentRunStorage.updateRun(runId, { status: 'requires_action' });
            break;
          case 'agent.run.status.changed': // For explicit status changes like 'cancelled'
            if (event.data.currentStatus === 'cancelled') {
              await this.agentRunStorage.updateRun(runId, { status: 'cancelled', completedAt: new Date() });
            }
            // Potentially handle other specific status changes if needed
            break;
        }
      }
    } catch (error: any) {
      console.error(`[ApiInteractionManager: ${runId}] Unhandled error during agent.run execution:`, error);
      const appError =
        error instanceof ApplicationError
          ? error
          : new ApplicationError(error.message || 'Unhandled agent execution error.');
      // Yield a final failure event to the caller
      yield {
        type: 'thread.run.failed',
        timestamp: new Date(),
        runId,
        threadId,
        data: {
          status: 'failed',
          error: { code: appError.name, message: appError.message, details: appError.metadata },
        },
      } as AgentEvent;
      // Persist the failure status
      await this.agentRunStorage.updateRun(runId, {
        status: 'failed',
        completedAt: new Date(),
        lastError: { code: appError.name || 'unhandled_agent_error', message: appError.message },
      });
    } finally {
      // Final check to ensure the run status is terminal if the agent's generator
      // completed without emitting a specific terminal event (e.g., due to an unhandled break).
      const finalRunState = await this.agentRunStorage.getRun(runId);
      if (finalRunState && !['completed', 'failed', 'cancelled', 'requires_action'].includes(finalRunState.status)) {
        console.warn(
          `[ApiInteractionManager: ${runId}] Agent run ended without an explicit terminal status event. Marking as failed.`
        );
        await this.agentRunStorage.updateRun(runId, {
          status: 'failed',
          completedAt: new Date(),
          lastError: {
            code: 'abnormal_termination',
            message: 'Agent run ended without explicit completion, failure, or cancellation event.',
          },
        });
      }
    }
  }

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
  public async *continueAgentRunWithToolOutputs(
    runId: string,
    threadId: string, // Included for context, though runId should be sufficient to fetch run details
    toolOutputs: Array<{ tool_call_id: string; output: string; tool_name?: string }>,
    agentRunConfigOverride: Partial<AgentRunConfig> = {}
  ): AsyncGenerator<AgentEvent, void, undefined> {
    this.assertInitialized();

    const existingRun = await this.agentRunStorage.getRun(runId);
    if (!existingRun) {
      throw new ApplicationError(`Cannot continue: Agent run "${runId}" not found.`);
    }
    if (existingRun.status !== 'requires_action') {
      throw new InvalidStateError(
        `Cannot continue: Agent run "${runId}" is not in 'requires_action' state (current status: ${existingRun.status}).`
      );
    }
    if (existingRun.threadId !== threadId) {
      throw new ConfigurationError(
        `Thread ID mismatch for run "${runId}". Expected "${existingRun.threadId}", got "${threadId}".`
      );
    }

    // Use the config from the existing run, merged with any overrides for this continuation.
    const effectiveRunConfig: AgentRunConfig = {
      ...(existingRun.config as AgentRunConfig), // Assume stored config is valid AgentRunConfig
      ...agentRunConfigOverride,
      // Ensure model is preserved or correctly overridden
      model: agentRunConfigOverride.model || (existingRun.config as AgentRunConfig).model,
    };
    if (!effectiveRunConfig.model) {
      throw new ConfigurationError("Agent run configuration (original or override) must include a 'model'.");
    }

    let agentToolProvider: IToolProvider;
    // AgentToRunClass will be determined based on mode and this.agentImplementation
    let AgentToRunClass: new () => IAgent = this.agentImplementation; 

    if (this.mode === 'genericOpenApi') {
      if (!this.genericToolProvider) {
        throw new InvalidStateError('Generic tool provider not initialized for agent continuation.');
      }
      agentToolProvider = this.genericToolProvider;
      // AgentToRunClass remains this.agentImplementation (e.g., BaseAgent)
    } else if (this.mode === 'toolsetsRouter') {
      if (!this.toolsetOrchestrator) {
        throw new InvalidStateError('Toolset orchestrator not initialized for agent continuation.');
      }
      agentToolProvider = this.createRouterToolProvider(this.toolsetOrchestrator);
      // AgentToRunClass remains this.agentImplementation (e.g., BaseAgent), sees only RouterTool
    } else if (this.mode === 'hierarchicalPlanner') {
      if (!this.toolsetOrchestrator || !this.aggregatedMasterToolProvider) {
        throw new InvalidStateError('ToolsetOrchestrator or AggregatedMasterToolProvider not initialized for hierarchical planner continuation.');
      }

      const effectivelyPlanningAgent = 
        (this.agentImplementation.name === BaseAgent.name && !this.options.agentImplementation) || 
        (this.agentImplementation.name === PlanningAgent.name);

      if (effectivelyPlanningAgent) {
        AgentToRunClass = PlanningAgent; 
        if (!effectiveRunConfig.systemPrompt || effectiveRunConfig.systemPrompt === this.defaultAgentRunConfig.systemPrompt) {
            effectiveRunConfig.systemPrompt = DEFAULT_PLANNER_SYSTEM_PROMPT;
        }
        const delegateTool = this.createDelegateToSpecialistTool();
        agentToolProvider = {
          getTools: async () => [delegateTool],
          getTool: async (name: string) => ((await delegateTool.getDefinition()).name === name ? delegateTool : undefined),
          ensureInitialized: async () => Promise.resolve(),
        };
      } else {
        AgentToRunClass = this.agentImplementation; 
        agentToolProvider = this.aggregatedMasterToolProvider;
        if (effectiveRunConfig.systemPrompt === DEFAULT_PLANNER_SYSTEM_PROMPT) {
          effectiveRunConfig.systemPrompt = this.defaultAgentRunConfig.systemPrompt || "You are a helpful AI assistant. Please use tools if necessary.";
        }
      }
    } else {
      throw new InvalidStateError(`Continuation not defined for mode ${this.mode}`);
    }
    
    // Update run status before proceeding with continuation
    await this.agentRunStorage.updateRun(runId, { status: 'in_progress' });

    // Instantiate components for this continuation context
    const responseProcessor = new LLMResponseProcessor(effectiveRunConfig.responseProcessorConfig);
    const toolExecutor = new ToolExecutor(agentToolProvider, effectiveRunConfig.toolExecutorConfig);
    const contextManager = new ContextManager(
      this.messageStorage,
      this.llmClient,
      effectiveRunConfig.contextManagerConfig
    );

    const agentContext: IAgentContext = {
      runId,
      threadId,
      llmClient: this.llmClient,
      toolProvider: agentToolProvider,
      messageStorage: this.messageStorage,
      responseProcessor,
      toolExecutor,
      contextManager,
      runConfig: effectiveRunConfig,
    };

    const agent = new AgentToRunClass(); // Use the determined AgentToRunClass for continuation

    if (!agent.submitToolOutputs) {
      throw new InvalidStateError(
        `The configured agent implementation ("${AgentToRunClass.name}") does not support 'submitToolOutputs'.`
      );
    }

    // The try/catch/finally block for handling agent execution and run state updates
    // is similar to the one in `runAgentInteraction`.
    try {
      for await (const event of agent.submitToolOutputs(agentContext, toolOutputs)) {
        yield event;
        // Update AgentRun status based on terminal events
        switch (event.type) {
          case 'thread.run.completed':
            await this.agentRunStorage.updateRun(runId, { status: 'completed', completedAt: new Date() });
            break;
          case 'thread.run.failed':
            await this.agentRunStorage.updateRun(runId, {
              status: 'failed',
              completedAt: new Date(),
              lastError: event.data.error,
            });
            break;
          case 'thread.run.requires_action':
            await this.agentRunStorage.updateRun(runId, { status: 'requires_action' });
            break;
          case 'agent.run.status.changed':
            if (event.data.currentStatus === 'cancelled') {
              await this.agentRunStorage.updateRun(runId, { status: 'cancelled', completedAt: new Date() });
            }
            break;
        }
      }
    } catch (error: any) {
      console.error(`[ApiInteractionManager: ${runId}] Unhandled error during agent.submitToolOutputs:`, error);
      const appError =
        error instanceof ApplicationError
          ? error
          : new ApplicationError(error.message || 'Unhandled agent continuation error.');
      yield {
        type: 'thread.run.failed',
        timestamp: new Date(),
        runId,
        threadId,
        data: {
          status: 'failed',
          error: { code: appError.name, message: appError.message, details: appError.metadata },
        },
      } as AgentEvent;
      await this.agentRunStorage.updateRun(runId, {
        status: 'failed',
        completedAt: new Date(),
        lastError: { code: appError.name || 'unhandled_agent_error', message: appError.message },
      });
    } finally {
      const finalRunState = await this.agentRunStorage.getRun(runId);
      if (finalRunState && !['completed', 'failed', 'cancelled', 'requires_action'].includes(finalRunState.status)) {
        await this.agentRunStorage.updateRun(runId, {
          status: 'failed',
          completedAt: new Date(),
          lastError: {
            code: 'abnormal_continuation_termination',
            message: 'Agent continuation ended without explicit completion or failure.',
          },
        });
      }
    }
  }

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
  public async updateAuthentication(
    newAuth:
      | ConnectorAuthentication
      | ((sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined)
  ): Promise<void> {
    this.assertInitialized();

    if (this.mode === 'genericOpenApi') {
      if (typeof newAuth === 'function') {
        // For generic mode, we expect a direct ConnectorAuthentication object, not a callback.
        // However, to be flexible, we can try to call it with a placeholder.
        console.warn(
          "[ApiInteractionManager] updateAuthentication for 'genericOpenApi' mode was called with a function. " +
            'Attempting to use it, but direct ConnectorAuthentication object is preferred.'
        );
        // Cast the genericToolProvider to access its original options if needed (this is a bit of a hack)
        const currentOpts =
          this.genericToolProvider instanceof OpenAPIConnector
            ? ((this.genericToolProvider as any).options as OpenAPIConnectorOptions) // Unsafe cast to access original options
            : undefined;

        const authToSet = newAuth('genericProvider', currentOpts || ({} as OpenAPIConnectorOptions));
        if (authToSet && this.genericToolProvider instanceof OpenAPIConnector) {
          this.genericToolProvider.setAuthentication(authToSet);
          console.info('[ApiInteractionManager] Authentication updated for genericOpenApi provider using callback.');
        } else if (!authToSet) {
          console.warn(
            '[ApiInteractionManager] Auth callback returned undefined for genericOpenApi provider; no update performed.'
          );
        } else {
          console.warn(
            '[ApiInteractionManager] Could not apply function-based auth update to genericOpenApi provider (not an OpenAPIConnector or callback failed).'
          );
        }
      } else if (this.genericToolProvider instanceof OpenAPIConnector) {
        this.genericToolProvider.setAuthentication(newAuth);
        console.info('[ApiInteractionManager] Authentication updated for genericOpenApi provider.');
      } else {
        console.warn(
          '[ApiInteractionManager] genericOpenApi provider is not an OpenAPIConnector instance; cannot set authentication directly.'
        );
      }
    } else if (this.mode === 'toolsetsRouter') {
      if (typeof newAuth !== 'function') {
        throw new ConfigurationError(
          "For 'toolsetsRouter' mode, updateAuthentication expects a callback function: " +
            '(sourceId: string, currentOptions: OpenAPIConnectorOptions) => ConnectorAuthentication | undefined.'
        );
      }
      if (!this.toolsetOrchestrator) {
        throw new InvalidStateError('ToolsetOrchestrator not initialized for authentication update.');
      }
      await this.toolsetOrchestrator.updateAuthenticationForAllOpenAPIProviders(newAuth);
      console.info(
        '[ApiInteractionManager] Authentication update process initiated for toolset providers via ToolsetOrchestrator.'
      );
    } else {
      console.warn(
        '[ApiInteractionManager] No compatible provider found to update authentication for the current mode.'
      );
    }
  }

  /**
   * Retrieves a specific toolset by its ID, if the manager is in 'toolsetsRouter' mode.
   * @param toolsetId The ID of the toolset to retrieve.
   * @returns {Promise<IToolSet | undefined>} A promise resolving to the `IToolSet` or `undefined` if not found or not in correct mode.
   */
  public async getToolset(toolsetId: string): Promise<IToolSet | undefined> {
    this.assertInitialized();
    if (this.mode !== 'toolsetsRouter' || !this.toolsetOrchestrator) {
      console.warn(
        "[ApiInteractionManager] getToolset is only available in 'toolsetsRouter' mode and when orchestrator is initialized."
      );
      return undefined;
    }
    return this.toolsetOrchestrator.getToolset(toolsetId);
  }

  /**
   * Retrieves all available toolsets, if the manager is in 'toolsetsRouter' mode.
   * @returns {Promise<IToolSet[]>} A promise resolving to an array of `IToolSet` objects.
   */
  public async getAllToolsets(): Promise<IToolSet[]> {
    this.assertInitialized();
    if (this.mode !== 'toolsetsRouter' || !this.toolsetOrchestrator) {
      console.warn(
        "[ApiInteractionManager] getAllToolsets is only available in 'toolsetsRouter' mode and when orchestrator is initialized."
      );
      return [];
    }
    return this.toolsetOrchestrator.getToolsets();
  }

  /**
   * Retrieves all tools from the generic OpenAPI provider, if the manager is in 'genericOpenApi' mode.
   * @returns {Promise<ITool[]>} A promise resolving to an array of `ITool` objects.
   */
  public async getAllGenericTools(): Promise<ITool[]> {
    this.assertInitialized();
    if (this.mode !== 'genericOpenApi' || !this.genericToolProvider) {
      console.warn(
        "[ApiInteractionManager] getAllGenericTools is only available in 'genericOpenApi' mode and when provider is initialized."
      );
      return [];
    }
    return this.genericToolProvider.getTools();
  }
}
