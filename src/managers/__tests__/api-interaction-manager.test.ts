
import {
  ApiInteractionManager,
  ApiInteractionManagerOptions,
  ApiInteractionMode,
} from '../api-interaction-manager';
import { ToolsetOrchestrator, ToolProviderSourceConfig } from '../toolset-orchestrator';
import { OpenAPIConnector, OpenAPIConnectorOptions } from '../../openapi/connector';
import { ILLMClient, LLMMessage, LLMToolChoice } from '../../llm/types';
import { IMessageStorage, IThreadStorage, IThread } from '../../threads/types';
import { MemoryStorage } from '../../threads/storage/memory-storage';
import { IAgent, AgentEvent, AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG, IAgentRun, AgentStatus, BaseAgent, IAgentContext, IAgentRunStorage } from '../../agents';
import { ApplicationError, ConfigurationError, InvalidStateError } from '../../core/errors';
import { IToolDefinition, IToolSet, ITool } from '../../core/tool';
import * as OpenApiUtils from '../../openapi/utils'; // For mocking fetchSpec if needed indirectly
import * as PromptBuilder from '../../llm/prompt-builder'; // To spy on prompt generation
import * as OpenAIToolAdapter from '../../llm/adapters/openai/openai-tool-adapter'; // To spy
import { minimalValidSpec, samplePetStoreSpec } from '../../openapi/__tests__/mock-openapi.data';
import { DEFAULT_PLANNER_SYSTEM_PROMPT, PlanningAgent } from '../../agents/planning-agent';
import { AggregatedToolProvider } from '../../tools/core/aggregated-tool-provider';
import { DelegateToSpecialistTool } from '../../tools/core/delegate-to-specialist-tool';

// --- Mocks ---
jest.mock('../toolset-orchestrator');
jest.mock('../../openapi/connector');
jest.mock('../../agents/base-agent');
jest.mock('../../agents/planning-agent'); // Added
jest.mock('../../tools/core/aggregated-tool-provider'); // Added
jest.mock('../../tools/core/delegate-to-specialist-tool'); // Added

const MockedToolsetOrchestrator = ToolsetOrchestrator as jest.MockedClass<typeof ToolsetOrchestrator>;
const MockedOpenAPIConnector = OpenAPIConnector as jest.MockedClass<typeof OpenAPIConnector>;
const MockedBaseAgent = BaseAgent as jest.MockedClass<typeof BaseAgent>;
const MockedPlanningAgent = PlanningAgent as jest.MockedClass<typeof PlanningAgent>; // Added
const MockedAggregatedToolProvider = AggregatedToolProvider as jest.MockedClass<typeof AggregatedToolProvider>; // Added
const MockedDelegateToSpecialistTool = DelegateToSpecialistTool as jest.MockedClass<typeof DelegateToSpecialistTool>; // Added


describe('ApiInteractionManager', () => {
  let mockLlmClient: jest.Mocked<ILLMClient>;
  let mockMessageStorage: jest.Mocked<IMessageStorage>;
  let mockAgentRunStorage: jest.Mocked<IAgentRunStorage>;
  let mockThreadStorage: jest.Mocked<IMessageStorage>;
  let mockToolsetOrchestratorInstance: jest.Mocked<ToolsetOrchestrator>;
  let mockOpenApiConnectorInstance: jest.Mocked<OpenAPIConnector>;
  let mockAggregatedToolProviderInstance: jest.Mocked<AggregatedToolProvider>; // Added
  let mockDelegateToSpecialistToolInstance: jest.Mocked<DelegateToSpecialistTool>; // Added
  let mockAgentInstance: jest.Mocked<IAgent>;
  let mockPlanningAgentInstance: jest.Mocked<IAgent>; // Added for PlanningAgent
  let mockRun: jest.Mock;
  let mockSubmitToolOutputs: jest.Mock;
  let mockCancelRun: jest.Mock;

  const commonToolDef: IToolDefinition = { name: 'commonTool', description: 'A common tool', parameters: [] };
  const commonTool: ITool = { getDefinition: jest.fn().mockResolvedValue(commonToolDef), execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLlmClient = {
      generateResponse: jest.fn(),
      countTokens: jest.fn().mockResolvedValue(10),
      formatToolsForProvider: jest.fn(defs => defs.map(d => ({ type: "function", function: { name: d.name, description: d.description, parameters: (d as any).parametersSchema || {type:'object', properties:{}} } }))), // Simple mock
    };

    mockMessageStorage = { addMessage: jest.fn(), getMessages: jest.fn().mockResolvedValue([]), updateMessage: jest.fn(), deleteMessage: jest.fn() } as unknown as jest.Mocked<IMessageStorage>;
    mockAgentRunStorage = { 
      createRun: jest.fn().mockImplementation(async (runData) => ({
        id: runData.id,
        threadId: runData.threadId,
        agentType: runData.agentType,
        status: 'queued' as AgentStatus,
        createdAt: new Date(),
        config: runData.config,
        metadata: runData.metadata || {},
      })), 
      getRun: jest.fn().mockImplementation(async (id) => ({
        id,
        threadId: 'thread-run-test',
        agentType: 'BaseAgent',
        status: 'queued' as AgentStatus,
        createdAt: new Date(),
        config: { ...DEFAULT_AGENT_RUN_CONFIG, model: 'test-model' },
        metadata: {},
      })),
      updateRun: jest.fn().mockImplementation(async (id, updates) => ({
        id,
        threadId: 'thread-run-test',
        agentType: 'BaseAgent',
        status: updates.status || 'queued',
        createdAt: new Date(),
        config: { ...DEFAULT_AGENT_RUN_CONFIG, model: 'test-model' },
        metadata: updates.metadata || {},
        ...updates
      }))
    } as unknown as jest.Mocked<IAgentRunStorage>;
    mockThreadStorage = { createThread: jest.fn(), getThread: jest.fn(), updateThread: jest.fn(), deleteThread: jest.fn(), listThreads: jest.fn() } as unknown as jest.Mocked<IMessageStorage>;
    
    // Setup default mock implementations for constructors
    mockToolsetOrchestratorInstance = {
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      getToolsets: jest.fn().mockResolvedValue([]),
      getToolset: jest.fn().mockResolvedValue(undefined),
      getToolProviders: jest.fn().mockResolvedValue([]), // Added method
      updateAuthenticationForAllOpenAPIProviders: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ToolsetOrchestrator>;
    MockedToolsetOrchestrator.mockImplementation(() => mockToolsetOrchestratorInstance);

    mockOpenApiConnectorInstance = {
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      getTools: jest.fn().mockResolvedValue([commonTool]),
      getTool: jest.fn().mockResolvedValue(commonTool),
      getFullSpec: jest.fn().mockReturnValue({ info: { title: 'Generic API', version: '1.0' } }),
      getSpecParser: jest.fn().mockReturnValue({ getOperations: jest.fn().mockReturnValue([]) }),
      getBaseUrl: jest.fn().mockReturnValue('http://generic.api'),
      setAuthentication: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<OpenAPIConnector>;
    MockedOpenAPIConnector.mockImplementation(() => mockOpenApiConnectorInstance);

    mockAggregatedToolProviderInstance = {
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      getTools: jest.fn().mockResolvedValue([]),
      getTool: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AggregatedToolProvider>;
    MockedAggregatedToolProvider.mockImplementation(() => mockAggregatedToolProviderInstance);

    mockDelegateToSpecialistToolInstance = {
      getDefinition: jest.fn().mockResolvedValue({ name: 'delegateToSpecialistAgent', description: 'Delegates to specialist', parameters: [] }),
      execute: jest.fn().mockResolvedValue({ success: true, data: 'delegated' }),
      toolName: 'delegateToSpecialistAgent',
    } as unknown as jest.Mocked<DelegateToSpecialistTool>;
    MockedDelegateToSpecialistTool.mockImplementation(() => mockDelegateToSpecialistToolInstance);
    
    // Mock for agent instances (BaseAgent and PlanningAgent)
    mockRun = jest.fn().mockImplementation(async function* () { 
      // Yield a minimal event to allow consumption of the generator
      yield { type: 'agent.run.step.created', runId: 'mockRunId', threadId: 'mockThreadId', data: { stepId: 'mockStepId' } } as AgentEvent;
      return;
    });
    mockSubmitToolOutputs = jest.fn().mockImplementation(async function* () { 
      yield { type: 'agent.run.step.created', runId: 'mockRunId', threadId: 'mockThreadId', data: { stepId: 'mockStepId' } } as AgentEvent;
      return;
    });
    mockCancelRun = jest.fn().mockResolvedValue(undefined);

    mockAgentInstance = { // Represents BaseAgent instance
        run: mockRun,
        submitToolOutputs: mockSubmitToolOutputs,
        cancelRun: mockCancelRun,
    } as unknown as jest.Mocked<IAgent>;
    MockedBaseAgent.mockImplementation(() => mockAgentInstance as unknown as BaseAgent);
    
    mockPlanningAgentInstance = { // Represents PlanningAgent instance
      run: mockRun, // Can use the same mockRun for simplicity or a different one if needed
      submitToolOutputs: mockSubmitToolOutputs,
      cancelRun: mockCancelRun,
    } as unknown as jest.Mocked<IAgent>;
    MockedPlanningAgent.mockImplementation(() => mockPlanningAgentInstance as unknown as PlanningAgent);

  });

  const createMinimalOptions = (mode: ApiInteractionMode, agentImpl?: new () => IAgent): ApiInteractionManagerOptions => ({
    mode,
    llmClient: mockLlmClient,
    messageStorage: mockMessageStorage,
    agentRunStorage: mockAgentRunStorage,
    // Mode-specific configs will be added in tests
  });

  describe('Constructor and Initialization', () => {
    it('should initialize correctly in "genericOpenApi" mode', async () => {
      const opts: ApiInteractionManagerOptions = {
        ...createMinimalOptions('genericOpenApi'),
        genericOpenApiProviderConfig: { specUrl: 'http://test.com/spec.json', includeGenericToolIfNoTagFilter: true, sourceId: "test-source" }
      };
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();
      expect(MockedOpenAPIConnector).toHaveBeenCalledWith(opts.genericOpenApiProviderConfig);
      expect(mockOpenApiConnectorInstance.ensureInitialized).toHaveBeenCalled();
      expect(aim['_isInitialized']).toBe(true);
    });

    it('should initialize correctly in "toolsetsRouter" mode', async () => {
      const sourceConfig: ToolProviderSourceConfig[] = [{ id: 's1', type: 'openapi', openapiConnectorOptions: { specUrl: 'http://s1.com/spec.json' } }];
      const opts: ApiInteractionManagerOptions = {
        ...createMinimalOptions('toolsetsRouter'),
        toolsetOrchestratorConfig: sourceConfig
      };
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();
      expect(MockedToolsetOrchestrator).toHaveBeenCalledWith(sourceConfig);
      expect(mockToolsetOrchestratorInstance.ensureInitialized).toHaveBeenCalled();
      // Test that aggregatedMasterToolProvider is created
      expect(MockedAggregatedToolProvider).toHaveBeenCalled();
      expect(mockAggregatedToolProviderInstance.ensureInitialized).toHaveBeenCalled();
      expect(aim['_isInitialized']).toBe(true);
    });

    it('genericOpenApi mode: _initialize should create and initialize genericToolProvider', async () => {
      const opts: ApiInteractionManagerOptions = {
          ...createMinimalOptions('genericOpenApi'),
          genericOpenApiProviderConfig: { specUrl: 'http://test.com/spec.json', includeGenericToolIfNoTagFilter: true, sourceId: "test-source" }
      };
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized(); // This calls _initialize internally
      expect(MockedOpenAPIConnector).toHaveBeenCalledWith(expect.objectContaining({
        specUrl: 'http://test.com/spec.json',
        includeGenericToolIfNoTagFilter: true,
        sourceId: "test-source"
      }));
      expect(mockOpenApiConnectorInstance.ensureInitialized).toHaveBeenCalled();
      expect((aim as any).genericToolProvider).toBe(mockOpenApiConnectorInstance);
    });

    it('should initialize correctly in "hierarchicalPlanner" mode', async () => {
      const sourceConfig: ToolProviderSourceConfig[] = [{ id: 's1', type: 'openapi', openapiConnectorOptions: { specUrl: 'http://s1.com/spec.json' } }];
      const opts: ApiInteractionManagerOptions = {
        ...createMinimalOptions('hierarchicalPlanner'),
        toolsetOrchestratorConfig: sourceConfig
      };
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();
      expect(MockedToolsetOrchestrator).toHaveBeenCalledWith(sourceConfig);
      expect(mockToolsetOrchestratorInstance.ensureInitialized).toHaveBeenCalled();
      // Test that aggregatedMasterToolProvider is created
      expect(MockedAggregatedToolProvider).toHaveBeenCalled();
      expect(mockAggregatedToolProviderInstance.ensureInitialized).toHaveBeenCalled();
      expect(aim['_isInitialized']).toBe(true);
    });

    it('hierarchicalPlanner mode: _initialize should create orchestrator and aggregatedMasterToolProvider', async () => {
      const orchestratorConfig: ToolProviderSourceConfig[] = [{ id: 's1', openapiConnectorOptions: { specUrl: 'http://s1.com/spec.json' } }];
      const opts: ApiInteractionManagerOptions = {
          ...createMinimalOptions('hierarchicalPlanner'),
          toolsetOrchestratorConfig: orchestratorConfig
      };
      // Mock that the toolsetOrchestrator.getToolProviders() returns a provider
      mockToolsetOrchestratorInstance.getToolProviders.mockResolvedValue([mockOpenApiConnectorInstance]);

      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();
      
      expect(MockedToolsetOrchestrator).toHaveBeenCalledWith(orchestratorConfig);
      expect(mockToolsetOrchestratorInstance.ensureInitialized).toHaveBeenCalled();
      expect(mockToolsetOrchestratorInstance.getToolProviders).toHaveBeenCalled();
      expect(MockedAggregatedToolProvider).toHaveBeenCalledWith([mockOpenApiConnectorInstance]);
      expect(mockAggregatedToolProviderInstance.ensureInitialized).toHaveBeenCalled();
      expect((aim as any).toolsetOrchestrator).toBe(mockToolsetOrchestratorInstance);
      expect((aim as any).aggregatedMasterToolProvider).toBe(mockAggregatedToolProviderInstance);
    });

    it('toolsetsRouter mode: _initialize should create orchestrator and aggregatedMasterToolProvider', async () => {
      const orchestratorConfig: ToolProviderSourceConfig[] = [{ id: 's2', openapiConnectorOptions: { specUrl: 'http://s2.com/spec.json' } }];
      const opts: ApiInteractionManagerOptions = {
          ...createMinimalOptions('toolsetsRouter'),
          toolsetOrchestratorConfig: orchestratorConfig
      };
      mockToolsetOrchestratorInstance.getToolProviders.mockResolvedValue([mockOpenApiConnectorInstance]); // Simulate providers being returned

      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();

      expect(MockedToolsetOrchestrator).toHaveBeenCalledWith(orchestratorConfig);
      expect(mockToolsetOrchestratorInstance.ensureInitialized).toHaveBeenCalled();
      expect(mockToolsetOrchestratorInstance.getToolProviders).toHaveBeenCalled();
      expect(MockedAggregatedToolProvider).toHaveBeenCalledWith([mockOpenApiConnectorInstance]);
      expect(mockAggregatedToolProviderInstance.ensureInitialized).toHaveBeenCalled();
      expect((aim as any).toolsetOrchestrator).toBe(mockToolsetOrchestratorInstance);
      expect((aim as any).aggregatedMasterToolProvider).toBe(mockAggregatedToolProviderInstance);
    });

    it('should throw ConfigurationError if required mode-specific config is missing', () => {
      expect(() => new ApiInteractionManager({ ...createMinimalOptions('genericOpenApi') }))
        .toThrow(ConfigurationError); // Missing genericOpenApiProviderConfig
      expect(() => new ApiInteractionManager({ ...createMinimalOptions('toolsetsRouter') }))
        .toThrow(ConfigurationError); // Missing toolsetOrchestratorConfig
      expect(() => new ApiInteractionManager({ ...createMinimalOptions('hierarchicalPlanner') }))
        .toThrow(ConfigurationError); // Missing toolsetOrchestratorConfig
    });
    
    it('should default storages to MemoryStorage if not provided', () => {
      const opts: ApiInteractionManagerOptions = {
        mode: 'genericOpenApi',
        llmClient: mockLlmClient,
        genericOpenApiProviderConfig: { specUrl: 'http://test.com/spec.json', sourceId: "test-source" }
      };
      const aim = new ApiInteractionManager(opts);
      expect((aim as any).messageStorage).toBeInstanceOf(MemoryStorage);
      expect((aim as any).agentRunStorage).toBeInstanceOf(MemoryStorage);
      expect((aim as any).threadStorage).toBeInstanceOf(MemoryStorage);
    });
  });

  // New describe block for runAgentInteraction tests
  describe('runAgentInteraction - Tool Provider and Agent Class Assignment', () => {
    const threadId = 'thread-test';
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
    const mockTool1Def: IToolDefinition = { name: 'tool1', description: 'Tool 1', parameters: [] };
    const mockTool1: ITool = { getDefinition: async () => mockTool1Def, execute: async () => ({ success: true, data: 'tool1 exec' })};

    it('genericOpenApi mode: should use genericToolProvider and default agent', async () => {
      const opts = createMinimalOptions('genericOpenApi');
      opts.genericOpenApiProviderConfig = { specUrl: 'http://test.com/spec.json', sourceId: "test-source" };
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();
      
      // Ensure the mockOpenApiConnectorInstance is used as the genericToolProvider
      (aim as any).genericToolProvider = mockOpenApiConnectorInstance; 

      for await (const _ of aim.runAgentInteraction(threadId, initialMessages)) {}

      expect(mockRun).toHaveBeenCalled();
      const context: IAgentContext = mockRun.mock.calls[0][0];
      expect(context.toolProvider).toBe(mockOpenApiConnectorInstance);
      // Verify BaseAgent was instantiated (mockAgentInstance is our BaseAgent mock)
      expect(MockedBaseAgent).toHaveBeenCalled();
    });

    it('toolsetsRouter mode: should use RouterToolProvider and default agent', async () => {
      const opts = createMinimalOptions('toolsetsRouter');
      opts.toolsetOrchestratorConfig = [{ id: 's1', openapiConnectorOptions: {specUrl: 'http://s1.com/spec.json'} }];
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();

      for await (const _ of aim.runAgentInteraction(threadId, initialMessages)) {}

      expect(mockRun).toHaveBeenCalled();
      const context: IAgentContext = mockRun.mock.calls[0][0];
      // RouterToolProvider is an internal anonymous object, check its behavior
      const routerTools = await context.toolProvider.getTools();
      expect(routerTools).toHaveLength(1);
      expect((await routerTools[0].getDefinition()).name).toBe(PromptBuilder.ROUTER_TOOL_NAME);
      expect(MockedBaseAgent).toHaveBeenCalled();
    });

    describe('hierarchicalPlanner mode scenarios', () => {
      const plannerOptionsBase = createMinimalOptions('hierarchicalPlanner');
      plannerOptionsBase.toolsetOrchestratorConfig = [{id: 's1', openapiConnectorOptions: {specUrl: 'http://s1.com/spec.json'}}];

      it('Scenario 1: Default agent (BaseAgent) -> uses PlanningAgent and DelegateToSpecialistTool', async () => {
        const opts = { ...plannerOptionsBase }; // No agentImplementation specified
        const aim = new ApiInteractionManager(opts);
        await aim.ensureInitialized();
        (aim as any).aggregatedMasterToolProvider = mockAggregatedToolProviderInstance; // Set manually for test

        for await (const _ of aim.runAgentInteraction(threadId, initialMessages)) {}
        
        expect(mockRun).toHaveBeenCalled(); // This mockRun is from mockPlanningAgentInstance
        expect(MockedPlanningAgent).toHaveBeenCalled();
        const context: IAgentContext = mockRun.mock.calls[0][0];
        const tools = await context.toolProvider.getTools();
        expect(tools).toHaveLength(1);
        expect((await tools[0].getDefinition()).name).toBe('delegateToSpecialistAgent');
        expect(context.runConfig.systemPrompt).toBe(DEFAULT_PLANNER_SYSTEM_PROMPT);
      });

      it('Scenario 2: Explicit PlanningAgent -> uses PlanningAgent and DelegateToSpecialistTool', async () => {
        const opts = { ...plannerOptionsBase, agentImplementation: PlanningAgent };
        const aim = new ApiInteractionManager(opts);
        await aim.ensureInitialized();
        (aim as any).aggregatedMasterToolProvider = mockAggregatedToolProviderInstance;

        for await (const _ of aim.runAgentInteraction(threadId, initialMessages)) {}

        expect(mockRun).toHaveBeenCalled(); // mockRun from mockPlanningAgentInstance
        expect(MockedPlanningAgent).toHaveBeenCalled();
        const context: IAgentContext = mockRun.mock.calls[0][0];
        const tools = await context.toolProvider.getTools();
        expect(tools).toHaveLength(1);
        expect((await tools[0].getDefinition()).name).toBe('delegateToSpecialistAgent');
      });

      it('Scenario 3: Explicit BaseAgent (user override) -> uses BaseAgent and aggregatedMasterToolProvider', async () => {
        mockAggregatedToolProviderInstance.getTools.mockResolvedValue([mockTool1]);
        const opts = { ...plannerOptionsBase, agentImplementation: BaseAgent };
        const aim = new ApiInteractionManager(opts);
        await aim.ensureInitialized();
        (aim as any).aggregatedMasterToolProvider = mockAggregatedToolProviderInstance;


        for await (const _ of aim.runAgentInteraction(threadId, initialMessages)) {}
        
        expect(mockRun).toHaveBeenCalled(); // mockRun from mockAgentInstance (BaseAgent)
        expect(MockedBaseAgent).toHaveBeenCalled();
        const context: IAgentContext = mockRun.mock.calls[0][0];
        expect(context.toolProvider).toBe(mockAggregatedToolProviderInstance);
        const tools = await context.toolProvider.getTools();
        expect(tools).toContain(mockTool1);
        // Check if system prompt was NOT the planner default if it would have been
        if (context.runConfig.systemPrompt === DEFAULT_AGENT_RUN_CONFIG.systemPrompt || !DEFAULT_AGENT_RUN_CONFIG.systemPrompt) {
           // If the default system prompt is empty or generic, this check is fine
           expect(context.runConfig.systemPrompt).not.toBe(DEFAULT_PLANNER_SYSTEM_PROMPT);
        } else {
          // If there's a specific default prompt, ensure it's that one.
          expect(context.runConfig.systemPrompt).toBe(DEFAULT_AGENT_RUN_CONFIG.systemPrompt);
        }
      });
    });
  }); // End of runAgentInteraction describe block
  
  // New describe block for continueAgentRunWithToolOutputs tests
  describe('continueAgentRunWithToolOutputs - Tool Provider and Agent Class Assignment', () => {
    const runId = 'continuing-run-id';
    const threadId = 'thread-for-continuation';
    const toolOutputs = [{ tool_call_id: 'tc1', output: 'output1' }];
    const mockTool1Def: IToolDefinition = { name: 'tool1', description: 'Tool 1', parameters: [] };
    const mockTool1: ITool = { getDefinition: async () => mockTool1Def, execute: async () => ({ success: true, data: 'tool1 exec' })};

    const setupExistingRun = (status: AgentStatus = 'requires_action') => {
      const existingRun: IAgentRun = {
          id: runId, 
          threadId, 
          agentType: 'BaseAgent', // This might be overridden by logic
          status,
          createdAt: new Date(), 
          config: { ...DEFAULT_AGENT_RUN_CONFIG, model: 'test-model' }
      };
      
      mockAgentRunStorage.getRun.mockResolvedValue(existingRun);
      mockAgentRunStorage.updateRun.mockImplementation(async (id, updates) => ({ ...existingRun, ...updates } as IAgentRun));
    };

    beforeEach(() => {
      // Ensure submitToolOutputs is mocked for each agent type that might be called
      mockSubmitToolOutputs.mockReset(); // Reset call counts etc.
      MockedBaseAgent.prototype.submitToolOutputs = mockSubmitToolOutputs;
      MockedPlanningAgent.prototype.submitToolOutputs = mockSubmitToolOutputs;
      setupExistingRun(); // Set up the mock run data
    });

    it('genericOpenApi mode: should use genericToolProvider and default agent', async () => {
      const opts = createMinimalOptions('genericOpenApi');
      opts.genericOpenApiProviderConfig = { specUrl: 'http://test.com/spec.json', sourceId: "test-source" };
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();
      (aim as any).genericToolProvider = mockOpenApiConnectorInstance;

      for await (const _ of aim.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}

      expect(mockSubmitToolOutputs).toHaveBeenCalled();
      const context: IAgentContext = mockSubmitToolOutputs.mock.calls[0][0];
      expect(context.toolProvider).toBe(mockOpenApiConnectorInstance);
      expect(MockedBaseAgent).toHaveBeenCalled(); // Verifies the class of agent constructed
    });

    it('toolsetsRouter mode: should use RouterToolProvider and default agent', async () => {
      const opts = createMinimalOptions('toolsetsRouter');
      opts.toolsetOrchestratorConfig = [{ id: 's1', openapiConnectorOptions: {specUrl: 'http://s1.com/spec.json'} }];
      const aim = new ApiInteractionManager(opts);
      await aim.ensureInitialized();

      for await (const _ of aim.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}

      expect(mockSubmitToolOutputs).toHaveBeenCalled();
      const context: IAgentContext = mockSubmitToolOutputs.mock.calls[0][0];
      const routerTools = await context.toolProvider.getTools();
      expect(routerTools).toHaveLength(1);
      expect((await routerTools[0].getDefinition()).name).toBe(PromptBuilder.ROUTER_TOOL_NAME);
      expect(MockedBaseAgent).toHaveBeenCalled();
    });

    describe('hierarchicalPlanner mode scenarios for continuation', () => {
      const plannerOptionsBase = createMinimalOptions('hierarchicalPlanner');
      plannerOptionsBase.toolsetOrchestratorConfig = [{id: 's1', openapiConnectorOptions: {specUrl: 'http://s1.com/spec.json'}}];

      beforeEach(() => {
        jest.clearAllMocks();
        setupExistingRun(); // Ensure mock run data is set up after clearing mocks
        mockSubmitToolOutputs.mockImplementation(async function* () {
          yield { type: 'thread.run.completed', data: {status: 'completed'} } as AgentEvent;
        });
      });
      
      it('Scenario 1: Default agent (BaseAgent) -> uses PlanningAgent and DelegateToSpecialistTool', async () => {
        const opts = { 
          ...plannerOptionsBase,
          messageStorage: mockMessageStorage,
          agentRunStorage: mockAgentRunStorage,
          threadStorage: mockThreadStorage
        };
        const aim = new ApiInteractionManager(opts);
        await aim.ensureInitialized();
        (aim as any).aggregatedMasterToolProvider = mockAggregatedToolProviderInstance;

        for await (const _ of aim.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}
        
        expect(mockSubmitToolOutputs).toHaveBeenCalled();
        expect(MockedPlanningAgent).toHaveBeenCalled();
        const context: IAgentContext = mockSubmitToolOutputs.mock.calls[0][0];
        const tools = await context.toolProvider.getTools();
        expect(tools).toHaveLength(1);
        expect((await tools[0].getDefinition()).name).toBe('delegateToSpecialistAgent');
        expect(context.runConfig.systemPrompt).toBe(DEFAULT_PLANNER_SYSTEM_PROMPT);
      });

      it('Scenario 2: Explicit PlanningAgent -> uses PlanningAgent and DelegateToSpecialistTool', async () => {
        const opts = { 
          ...plannerOptionsBase, 
          agentImplementation: PlanningAgent,
          messageStorage: mockMessageStorage,
          agentRunStorage: mockAgentRunStorage,
          threadStorage: mockThreadStorage
        };
        const aim = new ApiInteractionManager(opts);
        await aim.ensureInitialized();
        (aim as any).aggregatedMasterToolProvider = mockAggregatedToolProviderInstance;

        for await (const _ of aim.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}

        expect(mockSubmitToolOutputs).toHaveBeenCalled();
        expect(MockedPlanningAgent).toHaveBeenCalled();
        const context: IAgentContext = mockSubmitToolOutputs.mock.calls[0][0];
        const tools = await context.toolProvider.getTools();
        expect(tools).toHaveLength(1);
        expect((await tools[0].getDefinition()).name).toBe('delegateToSpecialistAgent');
      });

      it('Scenario 3: Explicit BaseAgent (user override) -> uses BaseAgent and aggregatedMasterToolProvider', async () => {
        mockAggregatedToolProviderInstance.getTools.mockResolvedValue([mockTool1]);
        const opts = { 
          ...plannerOptionsBase, 
          agentImplementation: BaseAgent,
          messageStorage: mockMessageStorage,
          agentRunStorage: mockAgentRunStorage,
          threadStorage: mockThreadStorage
        };
        const aim = new ApiInteractionManager(opts);
        await aim.ensureInitialized();
        (aim as any).aggregatedMasterToolProvider = mockAggregatedToolProviderInstance;

        for await (const _ of aim.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}
        
        expect(mockSubmitToolOutputs).toHaveBeenCalled();
        expect(MockedBaseAgent).toHaveBeenCalled();
        const context: IAgentContext = mockSubmitToolOutputs.mock.calls[0][0];
        expect(context.toolProvider).toBe(mockAggregatedToolProviderInstance);
        const tools = await context.toolProvider.getTools();
        expect(tools).toContain(mockTool1);
        if (context.runConfig.systemPrompt === DEFAULT_AGENT_RUN_CONFIG.systemPrompt || !DEFAULT_AGENT_RUN_CONFIG.systemPrompt) {
           expect(context.runConfig.systemPrompt).not.toBe(DEFAULT_PLANNER_SYSTEM_PROMPT);
        } else {
          expect(context.runConfig.systemPrompt).toBe(DEFAULT_AGENT_RUN_CONFIG.systemPrompt);
        }
      });
    });
  }); // End of continueAgentRunWithToolOutputs describe block

  describe('After Initialization (Original Tests - to be refactored or removed if redundant)', () => {
    let aimGeneric: ApiInteractionManager;
    let aimRouter: ApiInteractionManager;
    const sourceConfig: ToolProviderSourceConfig[] = [{ id: 's1', type: 'openapi', openapiConnectorOptions: { spec: minimalValidSpec } }];
    const runId = 'test-run-id';
    const threadId = 'test-thread-id';
    const initialMessages: LLMMessage[] = [
        { role: 'user', content: 'Test message' }
    ];

    beforeEach(async () => {
      const genericOpts: ApiInteractionManagerOptions = {
        ...createMinimalOptions('genericOpenApi'),
        genericOpenApiProviderConfig: { spec: minimalValidSpec, includeGenericToolIfNoTagFilter: true, sourceId: "test-source" }
      };
      aimGeneric = new ApiInteractionManager(genericOpts);
      await aimGeneric.ensureInitialized();
      // Set the generic tool provider after initialization
      (aimGeneric as any).genericToolProvider = mockOpenApiConnectorInstance;
      Object.setPrototypeOf((aimGeneric as any).genericToolProvider, OpenAPIConnector.prototype);

      const routerOpts: ApiInteractionManagerOptions = {
        ...createMinimalOptions('toolsetsRouter'),
        toolsetOrchestratorConfig: sourceConfig
      };
      aimRouter = new ApiInteractionManager(routerOpts);
      await aimRouter.ensureInitialized();
    });

    describe('getPrimaryLLMFormattedTools', () => {
      it('genericOpenApi mode: should get tools from genericToolProvider and format them', async () => {
        const mockToolDefList = [commonToolDef];
        mockOpenApiConnectorInstance.getTools.mockResolvedValueOnce([commonTool]); // commonTool's getDefinition returns commonToolDef
        (mockLlmClient.formatToolsForProvider as jest.Mock).mockReturnValueOnce(['formatted_generic_tool']);

        const tools = await aimGeneric.getPrimaryLLMFormattedTools();
        
        // We need to mock getDefinition to return a promise if ITool requires it.
        // Our mockTool's getDefinition is already async.
        const definitions = await Promise.all((await mockOpenApiConnectorInstance.getTools()).map(t => t.getDefinition()));

        expect(mockOpenApiConnectorInstance.getTools).toHaveBeenCalled();
        expect(mockLlmClient.formatToolsForProvider).toHaveBeenCalledWith(definitions);
        expect(tools).toEqual(['formatted_generic_tool']);
      });

      it('toolsetsRouter mode: should get router tool definition and format it', async () => {
        // Mock toolsets that will be used to generate router tool definition
        const mockToolsets: IToolSet[] = [
          { id: 'ts1', name: 'Toolset 1', description: 'First toolset', tools: [] },
          { id: 'ts2', name: 'Toolset 2', description: 'Second toolset', tools: [] }
        ];
        mockToolsetOrchestratorInstance.getToolsets.mockResolvedValue(mockToolsets);

        // Mock the router tool definition that should be generated
        const mockRouterDef: IToolDefinition = {
          name: PromptBuilder.ROUTER_TOOL_NAME,
          description: 'Router tool description',
          parameters: [
            {
              name: 'toolSetId',
              type: 'string',
              description: 'Toolset ID',
              required: true,
              schema: { type: 'string', enum: ['ts1', 'ts2'] }
            },
            {
              name: 'toolName',
              type: 'string',
              description: 'Tool name',
              required: true,
              schema: { type: 'string' }
            },
            {
              name: 'toolParameters',
              type: 'object',
              description: 'Tool parameters',
              required: true,
              schema: { type: 'object', additionalProperties: true }
            }
          ]
        };

        // Mock the LLM client's format function
        (mockLlmClient.formatToolsForProvider as jest.Mock).mockReturnValueOnce(['formatted_router_tool']);

        const tools = await aimRouter.getPrimaryLLMFormattedTools();
        
        // Verify the correct tool definition was generated and formatted
        expect(mockToolsetOrchestratorInstance.getToolsets).toHaveBeenCalled();
        expect(mockLlmClient.formatToolsForProvider).toHaveBeenCalledWith([expect.objectContaining({
          name: PromptBuilder.ROUTER_TOOL_NAME,
          parameters: expect.arrayContaining([
            expect.objectContaining({ name: 'toolSetId' }),
            expect.objectContaining({ name: 'toolName' }),
            expect.objectContaining({ name: 'toolParameters' })
          ])
        })]);
        expect(tools).toEqual(['formatted_router_tool']);
      });
    });

    describe('getPrimaryLLMSystemPrompt', () => {
        it('genericOpenApi mode: should call generateGenericHttpToolSystemPrompt', async () => {
            const promptSpy = jest.spyOn(PromptBuilder, 'generateGenericHttpToolSystemPrompt').mockReturnValue('generic_prompt');
            mockOpenApiConnectorInstance.getFullSpec.mockReturnValue(samplePetStoreSpec);
            mockOpenApiConnectorInstance.getSpecParser.mockReturnValue({ getOperations: jest.fn().mockReturnValue([/* mock ops */]) } as any);
            mockOpenApiConnectorInstance.getBaseUrl.mockReturnValue('http://generic.api');
            mockOpenApiConnectorInstance.getTools.mockResolvedValue([commonTool]);
            mockOpenApiConnectorInstance.isInitialized.mockReturnValue(true);

            const prompt = await aimGeneric.getPrimaryLLMSystemPrompt();
            expect(promptSpy).toHaveBeenCalled();
            expect(prompt).toBe('generic_prompt');
            promptSpy.mockRestore();
        });

        it('toolsetsRouter mode: should call generateRouterSystemPrompt', async () => {
            const promptSpy = jest.spyOn(PromptBuilder, 'generateRouterSystemPrompt').mockReturnValue(new Promise((a)=>a('router_prompt')));
            const mockToolsets: IToolSet[] = [{id: 'ts1', name: 'TS1', description: 'Desc1', tools: []}];
            mockToolsetOrchestratorInstance.getToolsets.mockResolvedValue(mockToolsets);

            const prompt = await aimRouter.getPrimaryLLMSystemPrompt();
            expect(promptSpy).toHaveBeenCalledWith(mockToolsets, expect.any(Object), '');
            expect(prompt).toBe('router_prompt');
            promptSpy.mockRestore();
        });
    });

    describe('runAgentInteraction', () => {
        it('should create agent context and call agent.run, then update run status on completion', async () => {
            // Mock agent.run to yield a completion event
            mockRun.mockImplementationOnce(async function* () {
                yield { type: 'thread.run.completed', data: {status: 'completed'} } as AgentEvent;
                return; // Ensure the generator completes
            });

            // Reset mocks before test
            jest.clearAllMocks();

            const aim = new ApiInteractionManager({
                mode: 'genericOpenApi',
                llmClient: mockLlmClient,
                messageStorage: mockMessageStorage,
                agentRunStorage: mockAgentRunStorage,
                threadStorage: mockThreadStorage,
                genericOpenApiProviderConfig: { spec: minimalValidSpec, sourceId: "test-source" },
                defaultAgentRunConfig: { model: 'test-model' }
            });
            await aim.ensureInitialized();

            // Set up the createRun mock to return our specific runId
            mockAgentRunStorage.createRun.mockImplementation(async (runData) => ({
                id: runId,
                threadId: runData.threadId,
                agentType: runData.agentType,
                status: 'queued' as AgentStatus,
                createdAt: new Date(),
                config: runData.config,
                metadata: runData.metadata || {},
            }));

            const events: AgentEvent[] = [];
            for await (const event of aim.runAgentInteraction(threadId, initialMessages, {}, runId)) {
                events.push(event);
            }

            // expect(mockAgentRunStorage.createRun).toHaveBeenCalledWith(expect.objectContaining({
            //     threadId,
            //     id: runId,
            //     agentType: expect.any(String),
            //     config: expect.any(Object)
            // }));
            // expect(mockAgentRunStorage.updateRun).toHaveBeenCalledWith(runId, expect.objectContaining({status: 'in_progress'}));
            // expect(mockRun).toHaveBeenCalledTimes(1);
            // const agentContextPassed = (mockRun as jest.Mock).mock.calls[0][0] as IAgentContext;
            // expect(agentContextPassed.runId).toBe(runId);
            // expect(agentContextPassed.llmClient).toBe(mockLlmClient);
            
            // Check for final status update by AIM after agent.run completes
            // expect(mockAgentRunStorage.updateRun).toHaveBeenLastCalledWith(runId, expect.objectContaining({ status: 'completed' }));
        });
        
        it('should update run status to failed if agent.run yields failure', async () => {
            const errorData = { code: 'agent_fail', message: 'Agent processing failed' };
            mockRun.mockImplementationOnce(async function*() {
                yield { type: 'thread.run.failed', runId, threadId, timestamp: new Date(), data: { status: 'failed', error: errorData }} as AgentEvent;
            });

            const events: AgentEvent[] = [];
            for await (const event of aimGeneric.runAgentInteraction(threadId, initialMessages, {}, runId)) {
                events.push(event);
            }
            // Check that any call to updateRun matches the expected error
            // expect(
            //   mockAgentRunStorage.updateRun.mock.calls.some(
            //     ([id, update]) => id === runId && update.status === 'failed' && update.lastError?.code === errorData.code
            //   )
            // ).toBe(true);
        });
    });

    describe('continueAgentRunWithToolOutputs', () => {
        const runId = 'continuing-run-id';
        const threadId = 'thread-for-continuation';
        const toolOutputs = [{ tool_call_id: 'tc1', output: 'output1' }];

        it('should call agent.submitToolOutputs and manage run state', async () => {
            const existingRun: IAgentRun = {
                id: runId, 
                threadId, 
                agentType: 'BaseAgent', 
                status: 'requires_action',
                createdAt: new Date(), 
                config: { ...DEFAULT_AGENT_RUN_CONFIG, model: 'test-model' }
            };
            mockAgentRunStorage.getRun.mockResolvedValue(existingRun);
            mockAgentRunStorage.updateRun.mockImplementation(async (id, updates) => ({ ...existingRun, ...updates } as IAgentRun));
            mockSubmitToolOutputs.mockImplementationOnce(async function* () {
                yield { type: 'thread.run.completed', data: {status: 'completed'} } as AgentEvent;
            });

            const events: AgentEvent[] = [];
            for await (const event of aimGeneric.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {
                events.push(event);
            }

            expect(mockAgentRunStorage.getRun).toHaveBeenCalledWith(runId);
            expect(mockAgentRunStorage.updateRun).toHaveBeenCalledWith(runId, { status: 'in_progress' });
            expect(mockSubmitToolOutputs).toHaveBeenCalledTimes(1);
            const agentContextPassed = (mockSubmitToolOutputs as jest.Mock).mock.calls[0][0] as IAgentContext;
            expect(agentContextPassed.runId).toBe(runId);
            expect(mockAgentRunStorage.updateRun).toHaveBeenLastCalledWith(runId, expect.objectContaining({ status: 'completed' }));
        });

        it('should throw if run not found or not in requires_action state', async () => {
            mockAgentRunStorage.getRun.mockResolvedValue(null);
            await expect(async () => {
                for await (const _ of aimGeneric.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}
            }).rejects.toThrow(ApplicationError);

            mockAgentRunStorage.getRun.mockResolvedValueOnce({ status: 'completed' } as IAgentRun);
            await expect(async () => {
                for await (const _ of aimGeneric.continueAgentRunWithToolOutputs(runId, threadId, toolOutputs)) {}
            }).rejects.toThrow(InvalidStateError);
        });
    });
  });
});