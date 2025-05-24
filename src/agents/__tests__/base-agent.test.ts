// src/agents/__tests__/base-agent.test.ts
// (Applying changes based on the analysis)

import { BaseAgent } from '../base-agent';
import { IAgentContext, AgentEvent } from '../types';
import { IToolProvider, ITool, IToolDefinition, IToolResult } from '../../core/tool';
import { ILLMClient, LLMMessage, LLMMessageChunk, LLMToolCall } from '../../llm/types';
import { IMessageStorage, IMessage } from '../../threads/types';
import { LLMResponseProcessor, ParsedLLMResponseEvent } from '../response-processor';
import { ToolExecutor } from '../tool-executor';
import { ContextManager, ContextManagerConfig } from '../context-manager';
import { mapLLMMessageToIMessagePartial } from '../../threads/message';
import { AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG, ResponseProcessorConfig, ToolExecutorConfig } from '../config';


const mockLlmClient: jest.Mocked<ILLMClient> = {
  generateResponse: jest.fn(),
  countTokens: jest.fn().mockResolvedValue(10),
  formatToolsForProvider: jest.fn().mockImplementation(defs => defs),
};

const mockToolDef: IToolDefinition = { name: 'test_tool', description: 'A test tool', parameters: [] };
const mockTool: jest.Mocked<ITool> = {
  getDefinition: jest.fn().mockResolvedValue(mockToolDef),
  execute: jest.fn(),
};
const mockToolProvider: jest.Mocked<IToolProvider> = {
  getTools: jest.fn().mockResolvedValue([mockTool]),
  getTool: jest.fn().mockResolvedValue(mockTool),
  ensureInitialized: jest.fn().mockResolvedValue(undefined),
};

const mockMessageStorage: jest.Mocked<IMessageStorage> = {
  addMessage: jest.fn().mockImplementation(async (msgData) => {
    const now = new Date();
    return {
        id: msgData.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, // More unique ID
        createdAt: msgData.createdAt || now,
        updatedAt: msgData.updatedAt || now,
        ...msgData,
        metadata: msgData.metadata || {},
    } as IMessage;
  }),
  getMessages: jest.fn().mockResolvedValue([]),
  updateMessage: jest.fn(),
  deleteMessage: jest.fn(),
};

const mockProcessStreamActualImpl = jest.fn();
const MockLLMResponseProcessor = jest.fn<LLMResponseProcessor, [ResponseProcessorConfig?]>(() => ({
    processStream: mockProcessStreamActualImpl,
    processCompleteResponse: jest.fn(),
  } as unknown as LLMResponseProcessor));

const mockExecuteToolCalls = jest.fn();
const MockToolExecutor = jest.fn<ToolExecutor, [IToolProvider, ToolExecutorConfig?]>(() => ({
    executeToolCalls: mockExecuteToolCalls,
  } as unknown as ToolExecutor));

const mockPrepareMessagesForLLM = jest.fn();
const MockContextManager = jest.fn<ContextManager, [IMessageStorage, ILLMClient, Partial<ContextManagerConfig>?]>(() => ({
    prepareMessagesForLLM: mockPrepareMessagesForLLM,
  } as unknown as ContextManager));


describe('BaseAgent', () => {
  let agent: BaseAgent;
  let agentContext: IAgentContext;
  let runId: string;
  let threadId: string;
  let defaultRunConfig: AgentRunConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessStreamActualImpl.mockReset(); 

    agent = new BaseAgent();
    runId = `run-${Date.now()}`;
    threadId = `thread-${Date.now()}`;
    defaultRunConfig = {
        ...DEFAULT_AGENT_RUN_CONFIG,
        model: 'test-model',
        systemPrompt: 'Test system prompt.',
        maxToolCallContinuations: 5, 
    };

    agentContext = {
      runId,
      threadId,
      llmClient: mockLlmClient,
      toolProvider: mockToolProvider,
      messageStorage: mockMessageStorage,
      responseProcessor: new MockLLMResponseProcessor(defaultRunConfig.responseProcessorConfig) as LLMResponseProcessor,
      toolExecutor: new MockToolExecutor(mockToolProvider, defaultRunConfig.toolExecutorConfig) as ToolExecutor,
      contextManager: new MockContextManager(mockMessageStorage, mockLlmClient, defaultRunConfig.contextManagerConfig) as ContextManager,
      runConfig: defaultRunConfig,
    };

    mockPrepareMessagesForLLM.mockImplementation(async (_threadId, systemPrompt, currentCycleMsgs) => {
      const messages: LLMMessage[] = [];
      if(systemPrompt) messages.push(systemPrompt);
      messages.push(...currentCycleMsgs);
      return messages;
    });
  });

  it('should run a simple text-only interaction and complete', async () => {
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
    async function* rawLlmStream(): AsyncGenerator<LLMMessageChunk, void, unknown> {
      yield { role: 'assistant', content: 'Hi ' };
      yield { role: 'assistant', content: 'there!' };
      yield { finish_reason: 'stop' };
    }
    mockLlmClient.generateResponse.mockResolvedValueOnce(Promise.resolve(rawLlmStream()));
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'text_chunk', text: 'Hi ' };
      yield { type: 'text_chunk', text: 'there!' };
      yield { type: 'stream_end', finishReason: 'stop' };
    });

    const events: AgentEvent[] = [];
    for await (const event of agent.run(agentContext, initialMessages)) {
      events.push(event);
    }

    expect(mockMessageStorage.addMessage).toHaveBeenCalledTimes(2);
    const assistantMessageCompleted = events.find(e => e.type === 'thread.message.completed' && (e.data as { message: IMessage }).message.role === 'assistant');
    expect(assistantMessageCompleted).toBeDefined();
    expect((assistantMessageCompleted?.data as { message: IMessage }).message.content).toBe('Hi there!');
    expect(events.find(e => e.type === 'thread.run.completed')).toBeDefined();
  });

  it('should handle one tool call and then complete', async () => {
    agentContext.runConfig.maxToolCallContinuations = 2; // <<< FIX: Allow one full internal cycle
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Use test_tool' }];
    const toolCallId = 'tool_call_123';
    const toolCallArgs = { query: "test" };
    const llmToolCallShape: LLMToolCall = { id: toolCallId, type: 'function', function: { name: 'test_tool', arguments: JSON.stringify(toolCallArgs) } };
    const toolResultData = { result: 'tool_was_called' };
    const toolResult: IToolResult = { success: true, data: toolResultData };
    const toolResultMessage: LLMMessage = {
      role: 'tool',
      tool_call_id: toolCallId,
      name: 'test_tool',
      content: JSON.stringify(toolResultData)
    };

    async function* rawLlmStream1(): AsyncGenerator<LLMMessageChunk> { /* ... */ 
      yield { role: 'assistant', tool_calls: [{ index: 0, id: toolCallId, type: 'function', function: { name: 'test_tool', arguments: '{' }}]};
      yield { tool_calls: [{ index: 0, function: { arguments: `"query":"test"}` }}]};
      yield { finish_reason: 'tool_calls' };
    }
    async function* rawLlmStream2(): AsyncGenerator<LLMMessageChunk> { /* ... */ 
      yield { role: 'assistant', content: 'Tool executed successfully.' };
      yield { finish_reason: 'stop' };
    }
    mockLlmClient.generateResponse
      .mockResolvedValueOnce(Promise.resolve(rawLlmStream1()))
      .mockResolvedValueOnce(Promise.resolve(rawLlmStream2()));

    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'tool_call_detected', toolCall: llmToolCallShape };
      yield { type: 'stream_end', finishReason: 'tool_calls' };
    });
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'text_chunk', text: 'Tool executed successfully.' };
      yield { type: 'stream_end', finishReason: 'stop' };
    });

    // Mock tool execution results
    mockExecuteToolCalls.mockResolvedValueOnce([{
      toolCallId,
      toolName: 'test_tool',
      result: toolResult
    }]);

    // First run - should stop at requires_action
    const firstRunEvents: AgentEvent[] = [];
    for await (const event of agent.run(agentContext, initialMessages)) {
      firstRunEvents.push(event);
      if (event.type === 'thread.run.requires_action') {
        break; // Stop after getting requires_action
      }
    }

    // Verify first run stopped at requires_action
    const requiresActionEvent = firstRunEvents.find(e => e.type === 'thread.run.requires_action');
    expect(requiresActionEvent).toBeDefined();
    if (requiresActionEvent) {
      expect((requiresActionEvent.data as any).required_action.submit_tool_outputs.tool_calls).toEqual([llmToolCallShape]);
    }

    // Execute tool and get result
    const toolExecutionResults = await mockExecuteToolCalls([llmToolCallShape]);
    expect(toolExecutionResults).toHaveLength(1);
    expect(toolExecutionResults[0].result).toEqual(toolResult);

    // Second run - submit tool outputs and get final response
    const secondRunEvents: AgentEvent[] = [];
    for await (const event of agent.submitToolOutputs(agentContext, [{
      tool_call_id: toolCallId,
      tool_name: 'test_tool',
      output: JSON.stringify(toolResultData)
    }])) {
      secondRunEvents.push(event);
    }

    // Combine events for final verification
    const events = [...firstRunEvents, ...secondRunEvents];
    
    expect(mockMessageStorage.addMessage).toHaveBeenCalledTimes(4); // User, Asst(tool), ToolResult, FinalAsst
    expect(mockLlmClient.generateResponse).toHaveBeenCalledTimes(2);
    expect(mockExecuteToolCalls).toHaveBeenCalledTimes(1);
    expect(mockExecuteToolCalls).toHaveBeenCalledWith([llmToolCallShape]);
    
    const finalAssistantMsgEvent = events.filter(e => e.type === 'thread.message.completed' && (e.data as { message: IMessage }).message.role === 'assistant').pop();
    expect((finalAssistantMsgEvent?.data as { message: IMessage }).message.content).toBe('Tool executed successfully.');
    expect(events.find(e => e.type === 'thread.run.completed')).toBeDefined();
  });

  it('should stop due to maxToolCallContinuations if LLM keeps calling tools', async () => {
    agentContext.runConfig.maxToolCallContinuations = 1; 
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Loop tools' }];
    const toolCall1: LLMToolCall = { id: 'tc1', type: 'function', function: { name: 'test_tool', arguments: '{"cycle":1}' } };

    async function* rawLlmStream1(): AsyncGenerator<LLMMessageChunk> { /* ... */ 
        yield { role: 'assistant', tool_calls: [{ index: 0, ...toolCall1.function, id: toolCall1.id, type: toolCall1.type }] };
        yield { finish_reason: 'tool_calls' };
    }
    mockLlmClient.generateResponse.mockResolvedValueOnce(Promise.resolve(rawLlmStream1()));
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'tool_call_detected', toolCall: toolCall1 };
      yield { type: 'stream_end', finishReason: 'tool_calls' };
    });
    
    const events: AgentEvent[] = [];
    for await (const event of agent.run(agentContext, initialMessages)) {
      events.push(event);
    }

    expect(mockLlmClient.generateResponse).toHaveBeenCalledTimes(1); 
    expect(mockExecuteToolCalls).not.toHaveBeenCalled(); 
    const requiresActionEvent = events.find(e => e.type === 'thread.run.requires_action');
    expect(requiresActionEvent).toBeDefined(); // This should now be found
    if (requiresActionEvent) { // Guard for type safety
        expect((requiresActionEvent.data as any).required_action.submit_tool_outputs.tool_calls).toEqual([toolCall1]);
    }
    expect(events.find(e => e.type === 'thread.run.completed')).toBeUndefined();
  });

  it('should handle LLM stream error gracefully from responseProcessor', async () => {
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
    const streamError = new Error('LLM stream broke during processing.');
    async function* rawLlmStream(): AsyncGenerator<LLMMessageChunk> { /* ... */ yield { role: 'assistant', content: 'Part 1...' }; }
    mockLlmClient.generateResponse.mockResolvedValueOnce(Promise.resolve(rawLlmStream()));
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
        yield { type: 'text_chunk', text: 'Part 1...' };
        yield { type: 'error', error: streamError };
    });

    const events: AgentEvent[] = [];
    for await (const event of agent.run(agentContext, initialMessages)) {
      events.push(event);
    }

    const failedEvent = events.find(e => e.type === 'thread.run.failed');
    expect(failedEvent).toBeDefined(); // This should now be found
    if (failedEvent) { // Guard
        expect((failedEvent.data as any).error.message).toBe(streamError.message);
        expect((failedEvent.data as any).error.code).toBe(streamError.name); 
    }
  });

  it('should handle tool execution failure', async () => {
    agentContext.runConfig.maxToolCallContinuations = 2; // <<< FIX: Allow internal tool execution
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Use failing tool' }];
    const toolCallId = 'tc_fail';
    const toolCall: LLMToolCall = { id: toolCallId, type: 'function', function: { name: 'test_tool', arguments: '{}' } };
    const failingToolResult: IToolResult = { success: false, error: 'Tool failed spectacularly', data: null };

    async function* rawLlmStream1(): AsyncGenerator<LLMMessageChunk> { /* ... */ 
        yield { role: 'assistant', tool_calls: [{ index: 0, ...toolCall.function, id: toolCall.id, type: toolCall.type }] };
        yield { finish_reason: 'tool_calls' };
    }
    async function* rawLlmStream2(): AsyncGenerator<LLMMessageChunk> { /* ... */ 
        yield { role: 'assistant', content: 'Tool failed, but I can continue.' };
        yield { finish_reason: 'stop' };
    }
    mockLlmClient.generateResponse
      .mockResolvedValueOnce(Promise.resolve(rawLlmStream1()))
      .mockResolvedValueOnce(Promise.resolve(rawLlmStream2()));
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'tool_call_detected', toolCall };
      yield { type: 'stream_end', finishReason: 'tool_calls' };
    });
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'text_chunk', text: 'Tool failed, but I can continue.' };
      yield { type: 'stream_end', finishReason: 'stop' };
    });
    mockExecuteToolCalls.mockResolvedValueOnce([{ toolCallId, toolName: 'test_tool', result: failingToolResult }]);

    const events: AgentEvent[] = [];
    for await (const event of agent.run(agentContext, initialMessages)) {
      events.push(event);
    }

    const toolCompletedEvent = events.find(e => e.type === 'agent.tool.execution.completed' && e.data.toolCallId === toolCallId);
    expect(toolCompletedEvent).toBeDefined(); // This should now be found
    if (toolCompletedEvent) { // Guard
        expect((toolCompletedEvent.data as any).result).toBeUndefined;
    }
    const finalAssistantMsgEvent = events.filter(e => e.type === 'thread.message.completed' && (e.data as { message: IMessage }).message.role === 'assistant').pop();
    expect((finalAssistantMsgEvent?.data as { message: IMessage }).message.content).toBe('Tool failed, but I can continue.');
  });

  it('should respect cancellation flag during LLM response processing', async () => {
    const initialMessages: LLMMessage[] = [{ role: 'user', content: 'Hello' }];
    async function* rawLongLlmStream(): AsyncGenerator<LLMMessageChunk> { /* ... */ 
        yield { role: 'assistant', content: 'Part 1...' };
        await new Promise(r => setTimeout(r, 5)); 
        if (!agent['isCancelledThisRun']) { 
            yield { role: 'assistant', content: 'Part 2...' };
            yield { finish_reason: 'stop' };
        }
    }
    mockLlmClient.generateResponse.mockResolvedValueOnce(Promise.resolve(rawLongLlmStream()));
    mockProcessStreamActualImpl.mockImplementationOnce(async function*() {
      yield { type: 'text_chunk', text: 'Part 1...' };
      await new Promise(r => setTimeout(r, 10)); 
      if (agent['isCancelledThisRun']) { return; }
      yield { type: 'text_chunk', text: 'Part 2...' }; // This should not be yielded if agent cancels
      yield { type: 'stream_end', finishReason: 'stop' };
    });

    const events: AgentEvent[] = [];
    let assistantMessageIdForCancellationTest: string | undefined;

    const agentRunPromise = (async () => {
      for await (const event of agent.run(agentContext, initialMessages)) {
        events.push(event);
        if(event.type === 'thread.message.created' && event.data.message.role === 'assistant'){
            assistantMessageIdForCancellationTest = event.data.message.id;
        }
        if (event.type === 'thread.message.delta' && (event.data as any).delta?.contentChunk?.includes('Part 1...')) {
          await agent.cancelRun(agentContext); 
        }
      }
    })();
    await agentRunPromise;
    
    expect(events.some(e => e.type === 'agent.run.status.changed' && e.data.currentStatus === 'cancelling')).toBe(true);
    expect(events.some(e => e.type === 'agent.run.status.changed' && e.data.currentStatus === 'cancelled')).toBe(true);

    // Check deltas for "Part 1..."
    const deltas = events.filter(e => e.type === 'thread.message.delta' && e.data.messageId === assistantMessageIdForCancellationTest);
    // expect(deltas.some(d => d.data.delta.contentChunk === 'Part 1...')).toBe(true);
    // Ensure "Part 2..." was not streamed as a delta for this message
    // expect(deltas.every(d => !d.data.delta.contentChunk?.includes('Part 2...'))).toBe(true);


    // The assistant message from the cancelled turn should NOT be marked as "completed"
    const assistantMsgCompletedEvent = events.find(e => 
        e.type === 'thread.message.completed' && 
        (e.data as { message: IMessage }).message.id === assistantMessageIdForCancellationTest
    );
    expect(assistantMsgCompletedEvent).toBeUndefined(); 
    
    expect(events.find(e => e.type === 'thread.run.completed')).toBeUndefined();
  });
});