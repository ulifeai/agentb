// src/agents/__tests__/response-processor.test.ts

import { LLMResponseProcessor, ParsedLLMResponseEvent } from '../response-processor';
import { ResponseProcessorConfig } from '../config';
import { LLMMessageChunk, LLMToolCall } from '../../llm/types';
import { LLMError } from '../../core/errors';

describe('LLMResponseProcessor', () => {
  describe('Native Tool Calling Enabled', () => {
    let processor: LLMResponseProcessor;

    beforeEach(() => {
      const config: ResponseProcessorConfig = { enableNativeToolCalling: true, enableXmlToolCalling: false };
      processor = new LLMResponseProcessor(config);
    });

    it('should process a simple text stream correctly', async () => {
      async function* mockStream(): AsyncGenerator<LLMMessageChunk> {
        yield { content: "Part 1, " };
        yield { content: "Part 2." };
        yield { finish_reason: "stop" };
      }

      const events: ParsedLLMResponseEvent[] = [];
      for await (const event of processor.processStream(mockStream())) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'text_chunk', text: 'Part 1, ' },
        { type: 'text_chunk', text: 'Part 2.' },
        { type: 'stream_end', finishReason: 'stop', usage: undefined },
      ]);
    });

    it('should detect and assemble a single native tool call from stream', async () => {
      async function* mockStream(): AsyncGenerator<LLMMessageChunk> {
        yield { role: 'assistant', tool_calls: [{ index: 0, id: 'call_123', type: 'function', function: { name: 'get_weather', arguments: '{"location":' } }] };
        yield { tool_calls: [{ index: 0, function: { arguments: '"Paris"}' } }] };
        yield { finish_reason: 'tool_calls' };
      }
      const events: ParsedLLMResponseEvent[] = [];
      for await (const event of processor.processStream(mockStream())) {
        events.push(event);
      }

      const toolCallEvent = events.find(e => e.type === 'tool_call_detected') as Extract<ParsedLLMResponseEvent, {type: 'tool_call_detected'}> | undefined;
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent?.toolCall).toEqual({
        id: 'call_123',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"location":"Paris"}' },
      });
      expect(events.find(e => e.type === 'stream_end' && e.finishReason === 'tool_calls')).toBeDefined();
    });

    it('should detect and assemble multiple native tool calls from stream', async () => {
        async function* mockStream(): AsyncGenerator<LLMMessageChunk> {
            yield { role: 'assistant', tool_calls: [
                { index: 0, id: 'call_A', type: 'function', function: { name: 'toolA', arguments: '{"argA":"valA"}' } },
                { index: 1, id: 'call_B', type: 'function', function: { name: 'toolB', arguments: '{"argB":"valB"}' } }
            ]};
            yield { finish_reason: 'tool_calls' };
        }
        const events: ParsedLLMResponseEvent[] = [];
        for await (const event of processor.processStream(mockStream())) {
            events.push(event);
        }

        const toolCallEvents = events.filter(e => e.type === 'tool_call_detected') as Extract<ParsedLLMResponseEvent, {type: 'tool_call_detected'}>[];
        expect(toolCallEvents.length).toBe(2);
        expect(toolCallEvents).toContainEqual({
            type: 'tool_call_detected',
            toolCall: { id: 'call_A', type: 'function', function: { name: 'toolA', arguments: '{"argA":"valA"}' } },
        });
        expect(toolCallEvents).toContainEqual({
            type: 'tool_call_detected',
            toolCall: { id: 'call_B', type: 'function', function: { name: 'toolB', arguments: '{"argB":"valB"}' } },
        });
    });

    it('should yield error event for malformed JSON in tool call arguments', async () => {
        async function* mockStream(): AsyncGenerator<LLMMessageChunk> {
            yield { role: 'assistant', tool_calls: [{ index: 0, id: 'call_err', type: 'function', function: { name: 'bad_args_tool', arguments: '{"location": "Paris",' } }] }; // Malformed JSON
            yield { finish_reason: 'tool_calls' };
        }
        const events: ParsedLLMResponseEvent[] = [];
        for await (const event of processor.processStream(mockStream())) {
            events.push(event);
        }
        const errorEvent = events.find(e => e.type === 'error') as Extract<ParsedLLMResponseEvent, {type: 'error'}> | undefined;
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.error).toBeInstanceOf(LLMError);
        expect(errorEvent?.error.message).toContain('Failed to parse JSON arguments');
    });
    
    it('should yield error event for incomplete tool call data at stream end', async () => {
        async function* mockStream(): AsyncGenerator<LLMMessageChunk> {
            yield { role: 'assistant', tool_calls: [{ index: 0, id: 'call_incomplete', type: 'function', function: { name: 'incomplete_tool', arguments: '' } }] }; // Empty arguments
            yield { finish_reason: 'tool_calls' }; // Stream ends before arguments arrive
        }
        const events: ParsedLLMResponseEvent[] = [];
        for await (const event of processor.processStream(mockStream())) {
            events.push(event);
        }
        const errorEvent = events.find(e => e.type === 'error') as Extract<ParsedLLMResponseEvent, {type: 'error'}> | undefined;
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.error).toBeInstanceOf(LLMError);
        expect(errorEvent?.error.message).toContain('Incomplete tool call data at end of stream');
    });

    it('should process complete response with native tool calls', () => {
      const toolCalls: LLMToolCall[] = [
        { id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }
      ];
      const events = processor.processCompleteResponse(null, toolCalls);
      expect(events).toEqual([
        { type: 'tool_call_detected', toolCall: toolCalls[0] },
        { type: 'stream_end', finishReason: 'tool_calls' },
      ]);
    });

    it('should process complete response with text content', () => {
        const events = processor.processCompleteResponse("Final answer.", undefined);
        expect(events).toEqual([
            { type: 'text_chunk', text: 'Final answer.' },
            { type: 'stream_end', finishReason: 'stop' },
        ]);
    });

    it('should process complete response with both text and native tool calls (tool_calls take precedence for finish_reason)', () => {
        // In OpenAI's current API, if tool_calls are present, the `content` field of the message is often null.
        // The processor's current `processCompleteResponse` logic prioritizes yielding tool_calls.
        // If content were present alongside tool_calls, how it's handled depends on interpretation.
        // Let's test the case where `content` might be present but `tool_calls` exist.
        const toolCalls: LLMToolCall[] = [
            { id: 'call_1', type: 'function', function: { name: 'get_info', arguments: '{}' } }
        ];
        const events = processor.processCompleteResponse("Some preceding text.", toolCalls);
        
        // Current logic: if native tool_calls are provided, they are yielded. Text content might be ignored or handled differently.
        // The current `processCompleteResponse` will yield `tool_call_detected` events.
        // It will only yield `text_chunk` if `toolCalls` array is NOT present or empty.
        expect(events.some(e => e.type === 'text_chunk')).toBe(false); // Because tool_calls are present
        expect(events.find(e => e.type === 'tool_call_detected')).toEqual({ type: 'tool_call_detected', toolCall: toolCalls[0] });
        expect(events.find(e => e.type === 'stream_end')?.finishReason).toBe('tool_calls');
    });
  });

  describe('XML Tool Calling (Conceptual - Current logic is TODO)', () => {
    let processor: LLMResponseProcessor;

    beforeEach(() => {
      const config: ResponseProcessorConfig = { enableNativeToolCalling: false, enableXmlToolCalling: true };
      processor = new LLMResponseProcessor(config);
    });

    it('should log a warning if XML tool calling is enabled but not implemented', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      new LLMResponseProcessor({ enableXmlToolCalling: true });
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("XML tool calling is enabled but parsing logic is a TODO."));
      consoleWarnSpy.mockRestore();
    });

    // TODO: Add tests for XML parsing from stream and complete response once implemented.
    // Example:
    // it('should detect and parse an XML tool call from stream', async () => {
    //   async function* mockStream(): AsyncGenerator<LLMMessageChunk> {
    //     yield { content: "<search><query>cats</query>" };
    //     yield { content: "</search>" };
    //     yield { finish_reason: "stop" }; // Or a specific finish_reason if XML tools are used
    //   }
    //   const events: ParsedLLMResponseEvent[] = [];
    //   for await (const event of processor.processStream(mockStream())) {
    //     events.push(event);
    //   }
    //   // Assertions for 'xml_tool_call_parsed' event
    // });
  });

  describe('Error Handling in Stream', () => {
    it('should yield an error event if the input stream itself throws an error', async () => {
        async function* errorStream(): AsyncGenerator<LLMMessageChunk> {
            yield { content: "Hello" };
            throw new Error("Network issue in stream");
        }
        const processor = new LLMResponseProcessor();
        const events: ParsedLLMResponseEvent[] = [];
        try {
            for await (const event of processor.processStream(errorStream())) {
                events.push(event);
            }
        } catch (e) {
            // The generator itself might throw if the error is not caught and yielded by processStream
            // The current processStream catches and yields.
        }
        
        const errorEvent = events.find(e => e.type === 'error') as Extract<ParsedLLMResponseEvent, {type: 'error'}> | undefined;
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.error).toBeInstanceOf(LLMError);
        expect(errorEvent?.error.message).toContain("Error processing LLM stream: Network issue in stream");
    });
  });
});