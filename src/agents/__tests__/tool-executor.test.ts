// src/agents/__tests__/tool-executor.test.ts

import { ToolExecutor } from '../tool-executor';
import { ToolExecutorConfig } from '../config';
import { IToolProvider, ITool, IToolResult, IToolDefinition } from '../../core/tool';
import { LLMToolCall } from '../../llm/types';
import { ToolNotFoundError, ValidationError, ApplicationError } from '../../core/errors';

// Mock ITool and IToolProvider
const mockTool1Def: IToolDefinition = { name: 'tool1', description: 'Mock Tool 1', parameters: [] };
const mockTool1Execute = jest.fn();
const mockTool1: ITool = {
  getDefinition: jest.fn().mockResolvedValue(mockTool1Def),
  execute: mockTool1Execute,
};

const mockTool2Def: IToolDefinition = { name: 'tool2', description: 'Mock Tool 2', parameters: [] };
const mockTool2Execute = jest.fn();
const mockTool2: ITool = {
  getDefinition: jest.fn().mockResolvedValue(mockTool2Def),
  execute: mockTool2Execute,
};

const mockToolProvider: IToolProvider = {
  getTool: jest.fn(async (toolName: string) => {
    if (toolName === 'tool1') return mockTool1;
    if (toolName === 'tool2') return mockTool2;
    return undefined;
  }),
  getTools: jest.fn().mockResolvedValue([mockTool1, mockTool2]),
  // ensureInitialized: jest.fn().mockResolvedValue(undefined) // If IToolProvider has it
};

describe('ToolExecutor', () => {
  let toolExecutor: ToolExecutor;

  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks before each test
    // Default config (sequential)
    toolExecutor = new ToolExecutor(mockToolProvider);
  });

  const createToolCall = (id: string, name: string, args: object = {}): LLMToolCall => ({
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  });

  it('should execute a single tool call successfully', async () => {
    const toolCall = createToolCall('call1', 'tool1', { param: 'value' });
    const expectedResult: IToolResult = { success: true, data: 'tool1 success' };
    mockTool1Execute.mockResolvedValueOnce(expectedResult);

    const results = await toolExecutor.executeToolCalls([toolCall]);

    expect(results.length).toBe(1);
    expect(results[0].toolCallId).toBe('call1');
    expect(results[0].toolName).toBe('tool1');
    expect(results[0].result).toEqual(expectedResult);
    expect(mockTool1Execute).toHaveBeenCalledWith({ param: 'value' }, undefined);
  });

  it('should return error result if tool is not found', async () => {
    const toolCall = createToolCall('call1', 'unknownTool');
    const results = await toolExecutor.executeToolCalls([toolCall]);

    expect(results.length).toBe(1);
    expect(results[0].result.success).toBe(false);
    expect(results[0].result.error).toContain('Tool "unknownTool" not found.');
    expect(results[0].result.metadata?.errorName).toBe(ToolNotFoundError.name);
  });

  it('should return error result if tool arguments are invalid JSON', async () => {
    const toolCall: LLMToolCall = { id: 'call1', type: 'function', function: { name: 'tool1', arguments: 'invalid-json' } };
    const results = await toolExecutor.executeToolCalls([toolCall]);

    expect(results.length).toBe(1);
    expect(results[0].result.success).toBe(false);
    expect(results[0].result.error).toContain('Invalid JSON arguments for tool "tool1"');
    expect(results[0].result.metadata?.errorName).toBe(ValidationError.name);
  });

  it('should return error result if tool.execute() throws an error', async () => {
    const toolCall = createToolCall('call1', 'tool1');
    const executionError = new ApplicationError('Tool execution failed internally');
    mockTool1Execute.mockRejectedValueOnce(executionError);

    const results = await toolExecutor.executeToolCalls([toolCall]);

    expect(results.length).toBe(1);
    expect(results[0].result.success).toBe(false);
    expect(results[0].result.error).toBe('Tool execution failed internally');
    expect(results[0].result.metadata?.errorName).toBe(ApplicationError.name);
  });

  describe('Sequential Execution', () => {
    it('should execute multiple tools sequentially', async () => {
      const call1 = createToolCall('c1', 'tool1');
      const call2 = createToolCall('c2', 'tool2');
      
      // Ensure tool1 finishes before tool2 starts
      let tool1Finished = false;
      mockTool1Execute.mockImplementationOnce(async () => {
        await new Promise(r => setTimeout(r, 10)); // Simulate async work
        tool1Finished = true;
        return { success: true, data: 'res1' };
      });
      mockTool2Execute.mockImplementationOnce(async () => {
        expect(tool1Finished).toBe(true); // Assert tool1 finished
        return { success: true, data: 'res2' };
      });

      const results = await toolExecutor.executeToolCalls([call1, call2]);
      expect(results.length).toBe(2);
      expect(mockTool1Execute).toHaveBeenCalledTimes(1);
      expect(mockTool2Execute).toHaveBeenCalledTimes(1);
      expect(results[0].result.data).toBe('res1');
      expect(results[1].result.data).toBe('res2');
    });

    it('should continue sequential execution even if one tool fails', async () => {
      const call1 = createToolCall('c1', 'tool1');
      const call2 = createToolCall('c2', 'tool2'); // Will succeed
      const call3 = createToolCall('c3', 'tool1'); // Will succeed

      mockTool1Execute
        .mockRejectedValueOnce(new Error("Tool 1 initial fail")) // call1 fails
        .mockResolvedValueOnce({ success: true, data: 'res3'}); // call3 succeeds

      mockTool2Execute.mockResolvedValueOnce({ success: true, data: 'res2' });

      const results = await toolExecutor.executeToolCalls([call1, call2, call3]);
      expect(results.length).toBe(3);
      expect(results[0].result.success).toBe(false);
      expect(results[0].result.error).toBe("Tool 1 initial fail");
      expect(results[1].result.success).toBe(true);
      expect(results[1].result.data).toBe("res2");
      expect(results[2].result.success).toBe(true);
      expect(results[2].result.data).toBe("res3");

      expect(mockTool1Execute).toHaveBeenCalledTimes(2); // Called for call1 and call3
      expect(mockTool2Execute).toHaveBeenCalledTimes(1); // Called for call2
    });
  });

  describe('Parallel Execution', () => {
    beforeEach(() => {
      // Re-initialize with parallel strategy
      toolExecutor = new ToolExecutor(mockToolProvider, { executionStrategy: 'parallel' });
    });

    it('should execute multiple tools in parallel', async () => {
      const call1 = createToolCall('c1', 'tool1');
      const call2 = createToolCall('c2', 'tool2');
      
      // Simulate async work with different timings
      const res1Promise = new Promise<IToolResult>(resolve => setTimeout(() => resolve({ success: true, data: 'res1_parallel' }), 20));
      const res2Promise = new Promise<IToolResult>(resolve => setTimeout(() => resolve({ success: true, data: 'res2_parallel' }), 10));
      
      mockTool1Execute.mockReturnValueOnce(res1Promise);
      mockTool2Execute.mockReturnValueOnce(res2Promise);

      const startTime = Date.now();
      const results = await toolExecutor.executeToolCalls([call1, call2]);
      const endTime = Date.now();

      // Execution time should be closer to the longer task (20ms) than sum (30ms)
      expect(endTime - startTime).toBeLessThan(28); // Allow some overhead + buffer

      expect(results.length).toBe(2);
      expect(results.find(r => r.toolCallId === 'c1')?.result.data).toBe('res1_parallel');
      expect(results.find(r => r.toolCallId === 'c2')?.result.data).toBe('res2_parallel');
      expect(mockTool1Execute).toHaveBeenCalledTimes(1);
      expect(mockTool2Execute).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in parallel execution correctly', async () => {
        const call1 = createToolCall('c1', 'tool1'); // Will fail
        const call2 = createToolCall('c2', 'tool2'); // Will succeed

        mockTool1Execute.mockRejectedValueOnce(new Error("Parallel fail tool1"));
        mockTool2Execute.mockResolvedValueOnce({ success: true, data: 'res2_parallel_ok' });

        const results = await toolExecutor.executeToolCalls([call1, call2]);
        expect(results.length).toBe(2);

        const result1 = results.find(r => r.toolCallId === 'c1');
        expect(result1?.result.success).toBe(false);
        expect(result1?.result.error).toBe("Parallel fail tool1");

        const result2 = results.find(r => r.toolCallId === 'c2');
        expect(result2?.result.success).toBe(true);
        expect(result2?.result.data).toBe('res2_parallel_ok');
    });
  });

   it('should handle an empty array of tool calls', async () => {
    const results = await toolExecutor.executeToolCalls([]);
    expect(results).toEqual([]);
  });
});