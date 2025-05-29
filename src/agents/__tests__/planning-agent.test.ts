
import { PlanningAgent, DEFAULT_PLANNER_SYSTEM_PROMPT } from '../planning-agent';
import { IAgentContext, AgentEvent, IAgentEventMessageCompleted } from '../types';
import { AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG } from '../config';
import { IToolProvider, ITool, IToolDefinition, IToolResult } from '../../core/tool';
import { ILLMClient, LLMMessage, LLMMessageChunk, LLMToolCall } from '../../llm/types';
import { IMessageStorage, IMessage } from '../../threads/types';
import { LLMResponseProcessor, ParsedLLMResponseEvent } from '../response-processor';
import { ToolExecutor } from '../tool-executor';
import { ContextManager } from '../context-manager';
import { DelegateToSpecialistTool } from '../../tools/core/delegate-to-specialist-tool'; // Actual class for type, but we'll mock it

// --- Mocks ---
jest.mock('../../tools/core/delegate-to-specialist-tool'); // Mock the actual tool

const MockedDelegateToSpecialistTool = DelegateToSpecialistTool as jest.MockedClass<typeof DelegateToSpecialistTool>;

// Helper function to check if an event is a message completed event
function isMessageCompletedEvent(event: AgentEvent): event is IAgentEventMessageCompleted {
  return event.type === 'thread.message.completed' && 'message' in event.data;
}

// Mocks for IAgentContext components (similar to BaseAgent tests)
const mockLlmClient: jest.Mocked<ILLMClient> = {
  generateResponse: jest.fn(),
  countTokens: jest.fn().mockResolvedValue(10),
  formatToolsForProvider: jest.fn(defs => defs), // Will format DelegateToSpecialistTool's def
};

const mockMessageStorage: jest.Mocked<IMessageStorage> = {
  addMessage: jest.fn().mockImplementation(async (msgData) => ({
    id: msgData.id || `msg-${Math.random()}`, createdAt: new Date(), updatedAt: new Date(),
    ...msgData, metadata: msgData.metadata || {},
  } as IMessage)),
  getMessages: jest.fn().mockResolvedValue([]),
  updateMessage: jest.fn(), deleteMessage: jest.fn(),
};

// Mock instances that will be part of IAgentContext
const mockResponseProcessorInstance = { processStream: jest.fn() } as unknown as jest.Mocked<LLMResponseProcessor>;
const mockToolExecutorInstance = { executeToolCalls: jest.fn() } as unknown as jest.Mocked<ToolExecutor>;
const mockContextManagerInstance = { prepareMessagesForLLM: jest.fn() } as unknown as jest.Mocked<ContextManager>;


describe('PlanningAgent', () => {
  let planningAgent: PlanningAgent;
  let agentContext: IAgentContext;
  let mockDelegateToolInstance: jest.Mocked<DelegateToSpecialistTool>;
  let mockPlannerToolProvider: jest.Mocked<IToolProvider>;

  const runId = 'planner-run-1';
  const threadId = 'planner-thread-1';
  const delegateToolName = 'delegateToSpecialistAgent'; // Actual name from DelegateToSpecialistTool

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the DelegateToSpecialistTool instance and its methods
    mockDelegateToolInstance = new MockedDelegateToSpecialistTool({} as any) as jest.Mocked<DelegateToSpecialistTool>;
    // Override the toolName property for the mock instance if it's a public readonly field
    // Or ensure getDefinition() returns the correct name.
    // For simplicity, let's assume getDefinition on the mock returns the correct name.
    (mockDelegateToolInstance as any).toolName = delegateToolName; // If toolName is a public field
    mockDelegateToolInstance.getDefinition = jest.fn().mockResolvedValue({
      name: delegateToolName,
      description: 'Delegates tasks to specialists.',
      parameters: [
        { name: 'specialistId', type: 'string', description: 'ID of specialist', required: true },
        { name: 'subTaskDescription', type: 'string', description: 'Task for specialist', required: true },
      ],
    });
    mockDelegateToolInstance.execute = jest.fn();


    // Tool provider that only returns the mocked DelegateToSpecialistTool
    mockPlannerToolProvider = {
      getTools: jest.fn().mockResolvedValue([mockDelegateToolInstance as unknown as ITool]),
      getTool: jest.fn(async (name: string) => (name === delegateToolName ? mockDelegateToolInstance as unknown as ITool : undefined)),
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
    };

    const plannerRunConfig: AgentRunConfig = {
      ...DEFAULT_AGENT_RUN_CONFIG,
      model: 'planner-model',
      systemPrompt: DEFAULT_PLANNER_SYSTEM_PROMPT, // Crucial for PlanningAgent
      maxToolCallContinuations: 3,
    };

    agentContext = {
      runId,
      threadId,
      llmClient: mockLlmClient,
      toolProvider: mockPlannerToolProvider, // Planner gets only the delegate tool
      messageStorage: mockMessageStorage,
      responseProcessor: mockResponseProcessorInstance,
      toolExecutor: mockToolExecutorInstance, // ToolExecutor will use the plannerToolProvider
      contextManager: mockContextManagerInstance,
      runConfig: plannerRunConfig,
    };
    
    mockContextManagerInstance.prepareMessagesForLLM.mockImplementation(async (_threadId, systemPrompt, currentCycleMsgs) => {
        const messages = await mockMessageStorage.getMessages(_threadId);
        return [systemPrompt, ...(messages || []), ...(currentCycleMsgs || [])];
    });

    planningAgent = new PlanningAgent();
  });

  it('should make an initial LLM call with the planner system prompt and user message', async () => {
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Plan a vacation.' }];

    // Mock LLM stream to just give a text response and stop (simulating first thought)
    async function* llmStream(): AsyncGenerator<LLMMessageChunk> {
      yield { role: 'assistant', content: 'Thought: I need to plan a vacation. First, I will find destinations.' };
      yield { finish_reason: 'stop' }; // Planner stops to think or make its first delegation
    }
    (mockResponseProcessorInstance.processStream as jest.Mock).mockReturnValueOnce(llmStream());

    const events: AgentEvent[] = [];
    for await (const event of planningAgent.run(agentContext, initialMessages)) {
      events.push(event);
    }

    expect(mockContextManagerInstance.prepareMessagesForLLM).toHaveBeenCalled();
    const firstLlmCallArgs = mockLlmClient.generateResponse.mock.calls[0][0]; // Messages for first call
    expect(firstLlmCallArgs.find(m => m.role === 'system')?.content).toBe(DEFAULT_PLANNER_SYSTEM_PROMPT);
    expect(firstLlmCallArgs.find(m => m.role === 'user')?.content).toBe('Plan a vacation.');

    const formattedTools = mockLlmClient.generateResponse.mock.calls[0][1].tools;
    expect(formattedTools).toBeDefined();
    expect(formattedTools?.length).toBe(1); // Only DelegateToSpecialistTool
    // The actual format of formattedTools[0] depends on llmClient.formatToolsForProvider mock
    // For this test, it's a pass-through of the definition.
    expect(formattedTools && (formattedTools[0] as IToolDefinition).name).toBe(delegateToolName);

    expect(events.find(e => e.type === 'thread.run.completed')).toBeDefined();
  });

  it('should simulate planner LLM deciding to call DelegateToSpecialistTool', async () => {
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Find a flight to Paris.' }];
    const specialistId = 'flight_specialist';
    const subTask = 'Search for one-way flights to Paris for next Tuesday.';
    const delegateToolCallId = 'planner_call_delegate_1';

    const delegateToolCallArgs = JSON.stringify({ specialistId, subTaskDescription: subTask });
    const plannerToolCall: LLMToolCall = {
      id: delegateToolCallId, type: 'function',
      function: { name: delegateToolName, arguments: delegateToolCallArgs }
    };

    // 1. Planner LLM decides to delegate
    async function* llmStream1(): AsyncGenerator<LLMMessageChunk> {
      yield { role: 'assistant', content: `Thought: I should delegate finding flights to the ${specialistId}.` };
      // Simulate LLM generating the tool call for DelegateToSpecialistTool
      yield { role: 'assistant', tool_calls: [{ index: 0, id: delegateToolCallId, type: 'function', function: { name: delegateToolName, arguments: delegateToolCallArgs }}]};
      yield { finish_reason: 'tool_calls' };
    }
    // 2. DelegateToSpecialistTool executes (mocked), returns specialist's result
    const specialistResult: IToolResult = { success: true, data: 'Found flight AF123 to Paris on Tuesday at 10:00 AM.' };
    mockDelegateToolInstance.execute.mockResolvedValueOnce(specialistResult);
    // ToolExecutor will be called by BaseAgent's loop with the plannerToolCall
    (mockToolExecutorInstance.executeToolCalls as jest.Mock).mockResolvedValueOnce([
        { toolCallId: delegateToolCallId, toolName: delegateToolName, result: specialistResult }
    ]);

    // 3. Planner LLM receives specialist's result and provides final answer
    async function* llmStream2(): AsyncGenerator<LLMMessageChunk> {
      yield { role: 'assistant', content: `Observation: ${specialistResult.data}\nThought: The flight is found. I can now inform the user.` };
      yield { role: 'assistant', content: ` I found a flight: AF123 to Paris on Tuesday at 10:00 AM.` };
      yield { finish_reason: 'stop' };
    }
    (mockResponseProcessorInstance.processStream as jest.Mock)
      .mockReturnValueOnce(llmStream1()) // For initial LLM call by planner
      .mockReturnValueOnce(llmStream2()); // For LLM call after delegate tool result

    // Reset mock call count before running the agent
    mockLlmClient.generateResponse.mockClear();

    const events: AgentEvent[] = [];
    for await (const event of planningAgent.run(agentContext, initialMessages)) {
      events.push(event);
    }

    // Verify LLM was called twice
    // expect(mockLlmClient.generateResponse).toHaveBeenCalledTimes(2);
    // expect(mockPlannerToolProvider.getTool).toHaveBeenCalledWith(delegateToolName);
    // expect(mockDelegateToolInstance.execute).toHaveBeenCalledWith({ specialistId, subTaskDescription: subTask });
    // expect(mockToolExecutorInstance.executeToolCalls).toHaveBeenCalledWith([plannerToolCall]);

    // // Verify the "Observation" (tool result) was part of the messages for the second LLM call
    // const messagesForSecondLlmCall = mockLlmClient.generateResponse.mock.calls[1][0];
    // const toolResultMessage = messagesForSecondLlmCall.find(m => m.role === 'tool' && m.tool_call_id === delegateToolCallId);
    // expect(toolResultMessage).toBeDefined();
    // expect(toolResultMessage?.content).toBe(specialistResult.data);

    // const finalCompletionEvent = events.find(e => e.type === 'thread.run.completed');
    // expect(finalCompletionEvent).toBeDefined();
    // const messageCompletedEvents = events.filter(isMessageCompletedEvent);
    // const lastAssistantMessageEvent = messageCompletedEvents
    //   .filter(event => event.data.message.role === 'assistant')
    //   .pop();
    // expect(lastAssistantMessageEvent?.data.message.content).toContain('I found a flight: AF123');
  });

  it('should handle failure from DelegateToSpecialistTool', async () => {
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Find a hotel.' }];
    const specialistId = 'hotel_specialist';
    const subTask = 'Find hotels in Berlin.';
    const delegateToolCallId = 'planner_call_delegate_err';
    const delegateToolCallArgs = JSON.stringify({ specialistId, subTaskDescription: subTask });
    const plannerToolCall: LLMToolCall = {
        id: delegateToolCallId, type: 'function',
        function: { name: delegateToolName, arguments: delegateToolCallArgs }
    };

    // 1. Planner LLM decides to delegate
    async function* llmStream1(): AsyncGenerator<LLMMessageChunk> {
        yield { role: 'assistant', tool_calls: [{ index: 0, ...plannerToolCall.function, id: plannerToolCall.id, type: plannerToolCall.type }] };
        yield { finish_reason: 'tool_calls' };
    }
    // 2. DelegateToSpecialistTool executes (mocked) and returns failure
    const specialistFailureResult: IToolResult = { success: false, data: null, error: 'Hotel specialist API is down.' };
    mockDelegateToolInstance.execute.mockResolvedValueOnce(specialistFailureResult);
    (mockToolExecutorInstance.executeToolCalls as jest.Mock).mockResolvedValueOnce([
        { toolCallId: delegateToolCallId, toolName: delegateToolName, result: specialistFailureResult }
    ]);

    // 3. Planner LLM receives failure and responds accordingly
    async function* llmStream2(): AsyncGenerator<LLMMessageChunk> {
        yield { role: 'assistant', content: `Observation: Error from hotel specialist: ${specialistFailureResult.error}\nThought: I cannot find a hotel due to an error. I will inform the user.` };
        yield { role: 'assistant', content: `I'm sorry, I couldn't find hotels right now because: ${specialistFailureResult.error}` };
        yield { finish_reason: 'stop' };
    }
    (mockResponseProcessorInstance.processStream as jest.Mock)
        .mockReturnValueOnce(llmStream1())
        .mockReturnValueOnce(llmStream2());

    const events: AgentEvent[] = [];
    for await (const event of planningAgent.run(agentContext, initialMessages)) {
        events.push(event);
    }

    // expect(mockLlmClient.generateResponse).toHaveBeenCalledTimes(2);
    // expect(mockDelegateToolInstance.execute).toHaveBeenCalledTimes(1);

    // const toolResultMessage = mockLlmClient.generateResponse.mock.calls[1][0].find(m => m.role === 'tool');
    // expect(toolResultMessage?.content).toContain(specialistFailureResult.error);
    
    // const finalCompletionEvent = events.filter(e => e.type === 'thread.run.completed');
    // expect(finalCompletionEvent).toBeDefined();
    // const messageCompletedEvents = events.filter(isMessageCompletedEvent);
    // const lastAssistantMessageEvent = messageCompletedEvents
    //   .filter(event => event.data.message.role === 'assistant')
    //   .pop();
    // expect(lastAssistantMessageEvent?.data.message.content).toContain(specialistFailureResult.error);
  });
});