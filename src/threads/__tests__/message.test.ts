// src/threads/__tests__/message.test.ts

import { createMessageObject, mapLLMMessageToIMessagePartial, mapIMessageToLLMMessage } from '../message';
import { IMessage } from '../types';
import { LLMMessage, LLMToolCall, LLMMessageRole } from '../../llm/types';

describe('Thread Message Utilities', () => {
  describe('createMessageObject', () => {
    it('should create a message with defaults and provided values', () => {
      const threadId = 'thread-123';
      const role: LLMMessageRole = 'user';
      const content = 'Hello there!';
      const message = createMessageObject(threadId, role, content);

      expect(message.id).toBeDefined();
      expect(message.threadId).toBe(threadId);
      expect(message.role).toBe(role);
      expect(message.content).toBe(content);
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.updatedAt).toBeInstanceOf(Date);
      expect(message.metadata).toEqual({});
    });

    it('should use provided id and metadata', () => {
      const id = 'msg-abc';
      const metadata = { source: 'test' };
      const message = createMessageObject('t1', 'assistant', 'AI response', metadata, id);
      expect(message.id).toBe(id);
      expect(message.metadata).toEqual(metadata);
    });
  });

  describe('mapLLMMessageToIMessagePartial', () => {
    it('should map a simple LLMMessage to IMessage partial correctly', () => {
      const llmMsg: LLMMessage = { role: 'user', content: 'User input' };
      const partial = mapLLMMessageToIMessagePartial(llmMsg, 'thread-1');
      
      expect(partial.threadId).toBe('thread-1');
      expect(partial.role).toBe('user');
      expect(partial.content).toBe('User input');
      expect(partial.metadata).toEqual({});
    });

    it('should map LLMMessage with tool_calls to metadata', () => {
      const toolCalls: LLMToolCall[] = [{ id: 'tc1', type: 'function', function: { name: 'f1', arguments: '{}' } }];
      const llmMsg: LLMMessage = { 
        role: 'assistant', 
        content: "",
        tool_calls: toolCalls 
      };
      const partial = mapLLMMessageToIMessagePartial(llmMsg, 'thread-1', 'run-1', 'step-1');

      expect(partial.role).toBe('assistant');
      expect(partial.content).toBe("");
      expect(partial.metadata?.tool_calls).toEqual(toolCalls);
      expect(partial.metadata?.runId).toBe('run-1');
      expect(partial.metadata?.stepId).toBe('step-1');
    });

    it('should map LLMMessage for tool role with tool_call_id and name', () => {
      const llmMsg: LLMMessage = { role: 'tool', content: 'Tool result', tool_call_id: 'tc1', name: 'f1' };
      const partial = mapLLMMessageToIMessagePartial(llmMsg, 'thread-1');
      
      expect(partial.role).toBe('tool');
      expect(partial.content).toBe('Tool result');
      expect(partial.metadata?.tool_call_id).toBe('tc1');
      expect(partial.metadata?.name).toBe('f1');
    });
  });

  describe('mapIMessageToLLMMessage', () => {
    it('should map a simple IMessage to LLMMessage', () => {
      const iMsg: IMessage = createMessageObject('t1', 'user', 'Hello');
      const llmMsg = mapIMessageToLLMMessage(iMsg);

      expect(llmMsg.role).toBe('user');
      expect(llmMsg.content).toBe('Hello');
      expect(llmMsg.tool_calls).toBeUndefined();
      expect(llmMsg.tool_call_id).toBeUndefined();
      expect(llmMsg.name).toBeUndefined();
    });

    it('should map IMessage with tool_calls metadata to LLMMessage', () => {
      const toolCalls: LLMToolCall[] = [{ id: 'tc1', type: 'function', function: { name: 'f1', arguments: '{}' } }];
      const iMsg: IMessage = createMessageObject('t1', 'assistant', "", { tool_calls: toolCalls });
      const llmMsg = mapIMessageToLLMMessage(iMsg);

      expect(llmMsg.role).toBe('assistant');
      expect(llmMsg.content).toBe("");
      expect(llmMsg.tool_calls).toEqual(toolCalls);
    });

    it('should map IMessage for tool role with tool_call_id and name metadata', () => {
      const iMsg: IMessage = createMessageObject('t1', 'tool', 'Tool Output', { tool_call_id: 'tc1', name: 'f1' });
      const llmMsg = mapIMessageToLLMMessage(iMsg);

      expect(llmMsg.role).toBe('tool');
      expect(llmMsg.content).toBe('Tool Output');
      expect(llmMsg.tool_call_id).toBe('tc1');
      expect(llmMsg.name).toBe('f1');
    });
  });
});