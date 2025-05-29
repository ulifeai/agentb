
import { DelegateToSpecialistTool, DelegateToolDependencies } from '../delegate-to-specialist-tool';
import { ToolsetOrchestrator } from '../../../managers/toolset-orchestrator';
import { ILLMClient, LLMMessage } from '../../../llm/types';
import { IMessageStorage, IThreadStorage } from '../../../threads/types'; // Removed IAgentRunStorage
import { MemoryStorage } from '../../../threads/storage/memory-storage';
import { ITool, IToolSet, IToolDefinition, IToolResult } from '../../../core/tool';
import { BaseAgent, IAgent, IAgentContext, AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG, AgentEvent } from '../../../agents';
import * as PromptBuilder from '../../../llm/prompt-builder'; // To spy on generateToolsSystemPrompt
import { IMessage } from '../../../threads/types'; // Added IMessage import

// --- Mocks ---
jest.mock('../../../managers/toolset-orchestrator');
jest.mock('../../../agents/base-agent'); // Mock the default worker agent

const MockedToolsetOrchestrator = ToolsetOrchestrator as jest.MockedClass<typeof ToolsetOrchestrator>;
const MockedBaseAgent = BaseAgent as jest.MockedClass<typeof BaseAgent>;

// Mock ITool instances for toolsets
const mockSubToolDef1: IToolDefinition = { name: 'specialist_op1', description: 'Specialist op 1', parameters: [] };
const mockSubTool1: ITool = { getDefinition: jest.fn().mockResolvedValue(mockSubToolDef1), execute: jest.fn().mockResolvedValue({ success: true, data: 'op1_success' }) };

describe('DelegateToSpecialistTool', () => {
  let mockToolsetOrchestrator: jest.Mocked<ToolsetOrchestrator>;
  let mockLlmClient: jest.Mocked<ILLMClient>;
  let mockMessageStorage: jest.Mocked<IMessageStorage>; // For the sub-agent's isolated storage
  let mockWorkerAgentInstance: jest.Mocked<IAgent>;
  let dependencies: DelegateToolDependencies;
  let delegateTool: DelegateToSpecialistTool;

  const specialistId1 = 'weather_specialist';
  const mockToolSet1: IToolSet = {
    id: specialistId1,
    name: 'Weather Specialist',
    description: 'Handles all weather-related queries.',
    tools: [mockSubTool1],
    metadata: { apiTitle: 'WeatherAPI', apiVersion: 'v2', baseUrl: 'https://weather.co' }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockToolsetOrchestrator = new MockedToolsetOrchestrator([]) as jest.Mocked<ToolsetOrchestrator>;
    // Setup default mock implementations for orchestrator methods
    mockToolsetOrchestrator.getToolsets = jest.fn().mockResolvedValue([mockToolSet1]);
    mockToolsetOrchestrator.getToolset = jest.fn(async (id) => (id === specialistId1 ? mockToolSet1 : undefined));

    mockLlmClient = {
      generateResponse: jest.fn(), // Not directly called by DelegateTool, but by sub-agent
      countTokens: jest.fn().mockResolvedValue(10),
      formatToolsForProvider: jest.fn(defs => defs), // Simple pass-through
    };
    
    // messageStorage for the sub-agent will be a new MemoryStorage,
    // but the main one passed to DelegateToolDependencies is for other potential uses (not currently used by the tool itself).
    mockMessageStorage = new MemoryStorage() as unknown as jest.Mocked<IMessageStorage>;
    jest.spyOn(mockMessageStorage, 'addMessage'); // Spy on its methods


    // Mock the worker agent's run method
    mockWorkerAgentInstance = {
        run: jest.fn().mockImplementation(async function* (ctx: IAgentContext, initialMessages: LLMMessage[]) {
            // Simulate sub-agent completing successfully with a message
            const assistantMsgContent = `Sub-agent successfully processed: ${initialMessages[0]?.content}`;
            const finalMessage: IMessage = {
                id: 'sub-msg-final', threadId: ctx.threadId, role: 'assistant', content: assistantMsgContent,
                createdAt: new Date(), metadata: {}
            };
            yield { type: 'thread.message.completed', runId: ctx.runId, threadId: ctx.threadId, timestamp: new Date(), data: { message: finalMessage } } as AgentEvent;
            yield { type: 'thread.run.completed', runId: ctx.runId, threadId: ctx.threadId, timestamp: new Date(), data: { status: 'completed', finalMessages: [finalMessage] } } as AgentEvent;
        }),
        submitToolOutputs: jest.fn(),
        cancelRun: jest.fn(),
    };
    MockedBaseAgent.mockImplementation(() => mockWorkerAgentInstance as unknown as BaseAgent);

    dependencies = {
      toolsetOrchestrator: mockToolsetOrchestrator,
      llmClient: mockLlmClient,
      messageStorage: mockMessageStorage, // This is the main storage, sub-agent uses its own MemoryStorage
      workerAgentImplementation: MockedBaseAgent, // Pass the mocked constructor
      getDefaultRunConfig: jest.fn().mockReturnValue({ ...DEFAULT_AGENT_RUN_CONFIG, model: 'sub-agent-model' }),
    };

    delegateTool = new DelegateToSpecialistTool(dependencies);
  });

  describe('getDefinition', () => {
    it('should return correct tool definition listing available specialists', async () => {
      const definition = await delegateTool.getDefinition();
      expect(definition.name).toBe('delegateToSpecialistAgent');
      expect(definition.description).toContain('Delegates a specific sub-task to a specialist agent.');
      expect(definition.description).toContain(`- ID: "${specialistId1}", Name: "${mockToolSet1.name}", Capabilities: "${mockToolSet1.description}"`);
      expect(definition.parameters.length).toBe(3);
      const specialistIdParam = definition.parameters.find(p => p.name === 'specialistId');
      expect(specialistIdParam).toBeDefined();
      expect(specialistIdParam?.schema?.enum).toEqual([specialistId1]);
    });

    it('should handle no available specialists in definition', async () => {
      mockToolsetOrchestrator.getToolsets.mockResolvedValueOnce([]);
      const definition = await delegateTool.getDefinition();
      expect(definition.description).toContain('No specialist agents (toolsets) are currently available.');
      const specialistIdParam = definition.parameters.find(p => p.name === 'specialistId');
      expect(specialistIdParam?.schema?.enum).toBeUndefined();
    });
  });

  describe('execute', () => {
    const subTaskInput = {
      specialistId: specialistId1,
      subTaskDescription: 'Get today\'s weather for London.',
      requiredOutputFormat: 'A short summary string.',
    };

    it('should execute a sub-agent successfully and return its output', async () => {
      const generateToolsSystemPromptSpy = jest.spyOn(PromptBuilder, 'generateToolsSystemPrompt');

      const result = await delegateTool.execute(subTaskInput);

      expect(mockToolsetOrchestrator.getToolset).toHaveBeenCalledWith(specialistId1);
      expect(MockedBaseAgent).toHaveBeenCalledTimes(1); // Worker agent instantiated
      expect(mockWorkerAgentInstance.run).toHaveBeenCalledTimes(1);

      const subAgentContext = mockWorkerAgentInstance.run.mock.calls[0][0] as IAgentContext;
      const subAgentInitialMessages = mockWorkerAgentInstance.run.mock.calls[0][1] as LLMMessage[];

      // Verify sub-agent context
      expect(subAgentContext.runConfig.model).toBe('sub-agent-model');
      expect(subAgentContext.toolProvider).toBeDefined();
      const specialistTools = await subAgentContext.toolProvider.getTools();
      expect(specialistTools.length).toBe(1); // From mockToolSet1
      expect((await specialistTools[0].getDefinition()).name).toBe('specialist_op1');
      expect(subAgentContext.messageStorage).toBeInstanceOf(MemoryStorage); // Isolated storage

      // Verify system prompt generation for sub-agent
      expect(generateToolsSystemPromptSpy).toHaveBeenCalledWith(
        mockToolSet1.name,
        mockToolSet1.description,
        [mockSubToolDef1], // Definitions of tools in the toolset
        expect.objectContaining({ title: mockToolSet1.metadata?.apiTitle }),
        mockToolSet1.metadata?.baseUrl,
        expect.stringContaining(subTaskInput.requiredOutputFormat) // Check if output format is in prompt
      );
      expect(subAgentContext.runConfig.systemPrompt).toEqual(generateToolsSystemPromptSpy.mock.results[0].value);
      
      // Verify initial message for sub-agent
      expect(subAgentInitialMessages.length).toBe(1);
      expect(subAgentInitialMessages[0].role).toBe('user');
      expect(subAgentInitialMessages[0].content).toBe(subTaskInput.subTaskDescription);

      // Verify result from DelegateToSpecialistTool
      expect(result.success).toBe(true);
      expect(result.data).toContain(`Sub-agent successfully processed: ${subTaskInput.subTaskDescription}`);
      expect(result.metadata?.subAgentRunId).toBeDefined();
      expect(result.metadata?.specialistId).toBe(specialistId1);
    });

    it('should return error if specialistId is not found', async () => {
      const result = await delegateTool.execute({ ...subTaskInput, specialistId: 'non_existent_specialist' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Specialist (Toolset) with ID "non_existent_specialist" not found.');
      expect(mockWorkerAgentInstance.run).not.toHaveBeenCalled();
    });

    it('should return error if sub-agent run fails', async () => {
      const subAgentErrorMessage = 'Sub-agent encountered a critical error.';
      // Mock sub-agent's run to yield a failure event
      (mockWorkerAgentInstance.run as jest.Mock).mockImplementationOnce(async function* (ctx: IAgentContext) {
        yield { type: 'thread.run.failed', runId: ctx.runId, threadId: ctx.threadId, timestamp: new Date(), data: { status: 'failed', error: { code: 'sub_agent_failure', message: subAgentErrorMessage } } } as AgentEvent;
      });

      const result = await delegateTool.execute(subTaskInput);

      expect(result.success).toBe(false);
      expect(result.error).toContain(`Specialist agent "${specialistId1}" failed: ${subAgentErrorMessage}`);
      expect(result.metadata?.subAgentRunId).toBeDefined();
    });

    it('should handle sub-agent completing without explicit output but successfully', async () => {
        (mockWorkerAgentInstance.run as jest.Mock).mockImplementationOnce(async function* (ctx: IAgentContext) {
            // Simulate a run that completes but the last assistant message had null/empty content
             const finalMessage: IMessage = {
                id: 'sub-msg-final-empty', threadId: ctx.threadId, role: 'assistant', content: null as any, // Null content
                createdAt: new Date(), metadata: {}
            };
            yield { type: 'thread.message.completed', runId: ctx.runId, threadId: ctx.threadId, timestamp: new Date(), data: { message: finalMessage } } as AgentEvent;
            yield { type: 'thread.run.completed', runId: ctx.runId, threadId: ctx.threadId, timestamp: new Date(), data: { status: 'completed', finalMessages: [finalMessage] } } as AgentEvent;
        });

        const result = await delegateTool.execute(subTaskInput);
        expect(result.success).toBe(true);
        expect(result.data).toBe("Specialist completed its task."); // Default message
    });

    // TODO: For the future
    
    // it('should pass originalUserInput to sub-agent if passFullInput is true', async () => {
    //     const plannerContext: IAgentContext = { /* ... mock planner context ... */ runId: 'planner-run-123' } as any;
    //     const inputWithFull = {
    //         ...subTaskInput,
    //         passFullInput: true,
    //         originalUserInput: "This was the original user request that the planner is working on."
    //     };
    //     await delegateTool.execute(inputWithFull, plannerContext);

    //     expect(mockWorkerAgentInstance.run).toHaveBeenCalledTimes(1);
    //     const subAgentInitialMessages = mockWorkerAgentInstance.run.mock.calls[0][1] as LLMMessage[];
    //     expect(subAgentInitialMessages[0].content).toContain(inputWithFull.originalUserInput);
    //     expect(subAgentInitialMessages[0].content).toContain(inputWithFull.subTaskDescription);
    // });
  });
});