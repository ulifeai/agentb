
import OpenAI from 'openai';
import { OpenAIAdapter, OpenAIAdapterOptions } from '../openai-adapter';
import { ILLMClient, LLMMessage, LLMMessageChunk, LLMToolChoice, LLMToolCall, LLMMessageRole } from '../../../types';
import { ConfigurationError, LLMError } from '../../../../core/errors';
import { IToolDefinition } from '../../../../core/tool';
import * as OpenAIToolAdapterModule from '../openai-tool-adapter'; // For spying
import { LLMProviderToolFormat } from '../../../types';


// Mock the entire OpenAI SDK
// This mock will be used by all tests in this file
jest.mock('openai', () => {
  const mockCreate = jest.fn(); // This will be our mock for chat.completions.create
  return jest.fn().mockImplementation(() => ({ // Mocks the OpenAI class constructor
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));
});

// Typed mock for the OpenAI class constructor
const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;
// Helper to get the mock for chat.completions.create from the latest OpenAI instance
const getMockCreateCompletion = () => {
    // The instance is created when `new OpenAIAdapter()` is called.
    // We need to ensure an instance exists before trying to access its mocked methods.
    if (MockedOpenAI.mock.instances.length > 0) {
        const lastInstance = MockedOpenAI.mock.instances[MockedOpenAI.mock.instances.length - 1] as any;
        return lastInstance.chat.completions.create as jest.Mock;
    }
    // This fallback is if no instance was created, though tests should ensure an adapter is made.
    // Or, we can make mockCreate global to this module scope if that's easier.
    // For now, assuming tests will create an adapter instance.
    throw new Error("OpenAI mock instance not found. Ensure adapter is created.");
};


describe('OpenAIAdapter', () => {
  const MOCK_API_KEY = 'test-openai-api-key-from-env';
  let originalOpenAIKeyEnv: string | undefined;

  beforeAll(() => {
    originalOpenAIKeyEnv = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = MOCK_API_KEY;
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalOpenAIKeyEnv;
  });

  beforeEach(() => {
    MockedOpenAI.mockClear(); // Clears constructor mock calls and instances
    // If getMockCreateCompletion() was setup to be a module-level mock, clear it here.
    // Since it's instance-based, new instances in tests will get fresh mocks.
    // If a specific test needs to clear `create.mockClear()`, it should do so after adapter instantiation.
  });

  describe('Constructor', () => {
    it('should initialize with API key from options', () => {
      new OpenAIAdapter({ apiKey: 'explicit-key-in-options' });
      expect(MockedOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'explicit-key-in-options' }));
    });

    it('should initialize with API key from environment if not in options', () => {
      new OpenAIAdapter();
      expect(MockedOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: MOCK_API_KEY }));
    });

    it('should throw ConfigurationError if no API key is available', () => {
      const currentEnvKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      expect(() => new OpenAIAdapter()).toThrow(ConfigurationError);
      process.env.OPENAI_API_KEY = currentEnvKey; // Restore
    });

    it('should use defaultModel from options or internal default', () => {
      const adapter1 = new OpenAIAdapter(); // Uses internal default 'gpt-4o'
      expect((adapter1 as any).defaultModel).toBe('gpt-4o');

      const adapter2 = new OpenAIAdapter({ defaultModel: 'gpt-3.5-turbo-test' });
      expect((adapter2 as any).defaultModel).toBe('gpt-3.5-turbo-test');
    });

    it('should pass organizationId and baseURL to OpenAI constructor if provided', () => {
        new OpenAIAdapter({ organizationId: 'org-123', baseURL: 'https://custom.api/' });
        expect(MockedOpenAI).toHaveBeenCalledWith(expect.objectContaining({
            organization: 'org-123',
            baseURL: 'https://custom.api/'
        }));
    });
  });

  describe('generateResponse (Non-Streaming)', () => {
    let adapter: OpenAIAdapter;
    let mockCreateFn: jest.Mock;

    beforeEach(() => {
      adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      // Each test gets a fresh mock for chat.completions.create
      mockCreateFn = getMockCreateCompletion();
    });

    it('should call OpenAI create completion and map successful response', async () => {
      const mockApiResponse: Partial<OpenAI.Chat.Completions.ChatCompletion> = {
        id: 'chatcmpl-123', 
        object: 'chat.completion', 
        created: Date.now(), 
        model: 'gpt-4o-mini',
        choices: [{ 
          index: 0, 
          message: { 
            role: 'assistant', 
            content: 'Hello from OpenAI!',
            refusal: "false"
          }, 
          finish_reason: 'stop', 
          logprobs: null 
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };
      mockCreateFn.mockResolvedValueOnce(mockApiResponse);

      const messages: LLMMessage[] = [{ role: 'user', content: 'Hi' }];
      const response = await adapter.generateResponse(messages, { model: 'gpt-4o-mini' }) as LLMMessage;

      expect(mockCreateFn).toHaveBeenCalledWith(
        expect.objectContaining({
            model: 'gpt-4o-mini',
            messages: expect.arrayContaining([
                // Adapter adds default system prompt if none present
                expect.objectContaining({ role: 'system', content: "You are a helpful assistant." }),
                expect.objectContaining({ role: 'user', content: 'Hi' })
            ]),
            stream: undefined, // Explicitly undefined for non-streaming
        }),
        undefined // Second argument for options (like headers) is undefined here
      );
      expect(response.role).toBe('assistant');
      expect(response.content).toBe('Hello from OpenAI!');
    });

    it('should correctly map tool calls in non-streaming response', async () => {
        const openAIToolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall = {
            id: 'call_abc123', type: 'function', function: { name: 'get_weather_forecast', arguments: '{"location":"London","days":3}'}
        };
        const mockApiResponse: Partial<OpenAI.Chat.Completions.ChatCompletion> = {
            choices: [{ 
              index: 0, 
              message: { 
                role: 'assistant', 
                content: null, 
                tool_calls: [openAIToolCall],
                refusal: "false"
              }, 
              finish_reason: 'tool_calls', 
              logprobs: null 
            }],
        };
        mockCreateFn.mockResolvedValueOnce(mockApiResponse);

        const response = await adapter.generateResponse([], { model: 'gpt-4' }) as LLMMessage;
        expect(response.role).toBe('assistant');
        expect(response.content).toBe(""); // Content is null from OpenAI, maps to empty string
        expect(response.tool_calls).toBeDefined();
        expect(response.tool_calls!.length).toBe(1);
        expect(response.tool_calls![0]).toEqual({
            id: 'call_abc123', type: 'function',
            function: { name: 'get_weather_forecast', arguments: '{"location":"London","days":3}'}
        });
    });

    it('should throw LLMError on OpenAI APIError during non-streaming call', async () => {
      const apiError = new OpenAI.APIError(401, { error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } }, 'Auth Error', {});
      mockCreateFn.mockRejectedValueOnce(apiError);

      await expect(adapter.generateResponse([], {})).rejects.toThrow(LLMError);
      try {
        await adapter.generateResponse([], {});
      } catch (e: any) {
        expect(e).toBeInstanceOf(LLMError);
        expect(e.errorType).toBe('invalid_request_error'); // OpenAI error type
        expect(e.message).toBe('Invalid API key');
        expect(e.metadata?.statusCode).toBe(401);
      }
    });

     it('should handle systemPrompt option correctly', async () => {
        mockCreateFn.mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'OK' } }] });
        await adapter.generateResponse(
            [{role: 'user', content: 'Query'}],
            { systemPrompt: 'You are a test bot.'}
        );
        expect(mockCreateFn).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [
                    {role: 'system', content: 'You are a test bot.'},
                    {role: 'user', content: 'Query'}
                ]
            }),
            undefined
        );
    });
  });

  describe('generateResponse (Streaming)', () => {
    let adapter: OpenAIAdapter;
    let mockCreateFn: jest.Mock;

    beforeEach(() => {
      adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      mockCreateFn = getMockCreateCompletion();
    });

    async function* mockOpenAIStream(chunks: Array<Partial<OpenAI.Chat.Completions.ChatCompletionChunk>>): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk> {
      for (const chunk of chunks) {
        // Provide default values for a valid ChatCompletionChunk structure
        yield {
            id: 'chatcmpl-stream-123',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'gpt-4o-mini',
            choices: [{
                index: 0,
                delta: {}, // Default empty delta
                finish_reason: null,
                logprobs: null,
                ...chunk.choices?.[0] // Spread partial choice over defaults
            }],
            ...chunk // Spread other top-level chunk properties like usage
        } as OpenAI.Chat.Completions.ChatCompletionChunk;
      }
    }

    it('should yield mapped LLMMessageChunks for text content', async () => {
      const chunks: Partial<OpenAI.Chat.Completions.ChatCompletionChunk>[] = [
        { choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: { content: ' World' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: {completion_tokens: 2, prompt_tokens: 1, total_tokens: 3} },
      ];
      mockCreateFn.mockReturnValueOnce(mockOpenAIStream(chunks));

      const stream = await adapter.generateResponse([], { stream: true }) as AsyncGenerator<LLMMessageChunk>;
      const received: LLMMessageChunk[] = [];
      for await (const mappedChunk of stream) {
        received.push(mappedChunk);
      }

      expect(mockCreateFn).toHaveBeenCalledWith(expect.objectContaining({ stream: true }), undefined);
      expect(received.length).toBe(4);
      expect(received[0]).toEqual({ role: 'assistant' });
      expect(received[1]).toEqual({ content: 'Hello' });
      expect(received[2]).toEqual({ content: ' World' });
      expect(received[3]).toEqual({ finish_reason: 'stop', usage: {completion_tokens: 2, prompt_tokens: 1, total_tokens: 3} });
    });

    it('should yield mapped LLMMessageChunks for tool calls', async () => {
        const chunks: Partial<OpenAI.Chat.Completions.ChatCompletionChunk>[] = [
            { choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
            { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'tc_1', type: 'function', function: { name: 'toolA' } }] }, finish_reason: null }] },
            { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":' } }] }, finish_reason: null }] },
            { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] }, finish_reason: null }] },
            { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ];
        mockCreateFn.mockReturnValueOnce(mockOpenAIStream(chunks));

        const stream = await adapter.generateResponse([], { stream: true }) as AsyncGenerator<LLMMessageChunk>;
        const received: LLMMessageChunk[] = [];
        for await (const chunk of stream) { received.push(chunk); }

        expect(received.length).toBe(5);
        expect(received[0]).toEqual({ role: 'assistant' });
        expect(received[1].tool_calls![0]).toEqual(expect.objectContaining({ index: 0, id: 'tc_1', type: 'function', function: { name: 'toolA' } }));
        expect(received[2].tool_calls![0]).toEqual(expect.objectContaining({ index: 0, function: { arguments: '{"a":' } }));
        expect(received[3].tool_calls![0]).toEqual(expect.objectContaining({ index: 0, function: { arguments: '1}' } }));
        expect(received[4]).toEqual({ finish_reason: 'tool_calls' });
    });
  });

  describe('formatToolsForProvider', () => {
    let adapter: OpenAIAdapter;
    const mockToolDef: IToolDefinition = {
      name: 'get_user_info', description: 'Fetches user information.',
      parameters: [{ name: 'userId', type: 'string', description: 'The ID of the user.', required: true }]
    };

    beforeEach(() => {
      adapter = new OpenAIAdapter({ apiKey: 'test-key' });
    });

    it('should correctly format IToolDefinition array for OpenAI', () => {
      // Spy on adaptToolDefinitionsToOpenAI to ensure it's used
      const adaptSpy = jest.spyOn(OpenAIToolAdapterModule, 'adaptToolDefinitionsToOpenAI');
      // Mock its return value for this test
      const mockAdaptedFormat: LLMProviderToolFormat = {
        name: 'get_user_info',
        description: 'Fetches user information.',
        parametersSchema: {
          type: 'object',
          properties: { userId: { type: 'string', description: 'The ID of the user.' } },
          required: ['userId']
        }
      };
      adaptSpy.mockReturnValue([mockAdaptedFormat]);

      const result = adapter.formatToolsForProvider([mockToolDef]);

      expect(adaptSpy).toHaveBeenCalledWith([mockToolDef]);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({
        type: "function",
        function: {
          name: 'get_user_info',
          description: 'Fetches user information.',
          parameters: mockAdaptedFormat.parametersSchema,
        },
      });
      adaptSpy.mockRestore();
    });
  });

  describe('countTokens', () => {
    it('should return a rough estimate and log a warning', async () => {
      const adapter = new OpenAIAdapter({ apiKey: 'test-key' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const messages: LLMMessage[] = [{role: 'user', content: 'Test message about 20 characters long.'}];
      const count = await adapter.countTokens(messages, 'gpt-4o');
      
      expect(count).toBeGreaterThan(5); // Rough check
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Token counting for model \"gpt-4o\" is using a rough estimate."));
      consoleWarnSpy.mockRestore();
    });
  });

  // Test mapping functions individually for edge cases if needed
  describe('Mapping Functions', () => {
      let adapter: OpenAIAdapter;
      beforeEach(() => { adapter = new OpenAIAdapter({ apiKey: 'test-key' }); });

      it('mapToOpenAIMessageParam should handle tool message correctly', () => {
          const toolMsg: LLMMessage = { role: 'tool', content: 'result', tool_call_id: 'tc123' };
          const mapped = (adapter as any).mapToOpenAIMessageParam(toolMsg) as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
          expect(mapped.role).toBe('tool');
          expect(mapped.content).toBe('result');
          expect(mapped.tool_call_id).toBe('tc123');
      });

      it('mapToOpenAIToolChoice should handle "required" string correctly', () => {
          const choice = (adapter as any).mapToOpenAIToolChoice('required' as LLMToolChoice);
          expect(choice).toBe('required'); // OpenAI string 'required' is valid for ChatCompletionToolChoiceOption
      });
       it('mapToOpenAIToolChoice should handle specific function object', () => {
          const choice = (adapter as any).mapToOpenAIToolChoice({type: 'function', function: {name: 'my_func'}});
          expect(choice).toEqual({type: 'function', function: {name: 'my_func'}});
      });
  });
});