// src/facade/__tests__/agent-b.test.ts

import { AgentBInternal } from '../agentb'; // Test the internal class
import {
  ApiInteractionManager,
  ApiInteractionManagerOptions,
  ApiInteractionMode,
} from '../../managers/api-interaction-manager';
import { ToolProviderSourceConfig } from '../../managers/toolset-orchestrator';
import { ILLMClient, LLMMessage } from '../../llm/types';
import { OpenAIAdapter, OpenAIAdapterOptions } from '../../llm/adapters/openai/openai-adapter';
import { IMessageStorage, IThreadStorage, IThread } from '../../threads/types';
import { IAgentRunStorage } from '../../agents'; // Import from agents instead of threads
import { MemoryStorage } from '../../threads/storage/memory-storage';
import { AgentRunConfig, DEFAULT_AGENT_RUN_CONFIG, IAgentRun, AgentEvent } from '../../agents';
import { ConfigurationError, InvalidStateError, ApplicationError } from '../../core/errors';
import { OpenAPIConnectorOptions } from '../../openapi/connector';
import { v4 as uuidv4 } from 'uuid';

// --- Mocks ---
jest.mock('../../managers/api-interaction-manager');
jest.mock('../../llm/adapters/openai/openai-adapter');
jest.mock('../../threads/storage/memory-storage');

const MockedApiInteractionManager = ApiInteractionManager as jest.MockedClass<typeof ApiInteractionManager>;
const MockedOpenAIAdapter = OpenAIAdapter as jest.MockedClass<typeof OpenAIAdapter>;
const MockedMemoryStorage = MemoryStorage as jest.MockedClass<typeof MemoryStorage>;

// --- Helper for Mock HTTP Response ---
interface MockHttpResponse {
  statusCode: number;
  _headers: Record<string, string>;
  _dataChunks: string[];
  _isEnded: boolean;
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  headersSent: boolean;
  writableEnded: boolean;
}

function createMockResponse(): MockHttpResponse {
  return {
    statusCode: 200,
    _headers: {},
    _dataChunks: [],
    _isEnded: false,
    headersSent: false,
    writableEnded: false,
    setHeader: jest.fn(function(this: MockHttpResponse, name: string, value: string) { this._headers[name.toLowerCase()] = value; }),
    flushHeaders: jest.fn(function(this: MockHttpResponse) { this.headersSent = true; }),
    write: jest.fn(function(this: MockHttpResponse, chunk: string) { this._dataChunks.push(chunk); }),
    end: jest.fn(function(this: MockHttpResponse, chunk?: string) {
      if (chunk) this._dataChunks.push(chunk);
      this._isEnded = true; this.writableEnded = true;
    }),
  };
}


describe('AgentBInternal Facade', () => {
  let agentBInstance: AgentBInternal;
  let mockLlmClientInstance: jest.Mocked<ILLMClient>;
  let mockMessageStorageInstance: jest.Mocked<IMessageStorage>;
  let mockAgentRunStorageInstance: jest.Mocked<IAgentRunStorage>;
  let mockThreadStorageInstance: jest.Mocked<IThreadStorage>;
  let mockApiInteractionManagerInstance: jest.Mocked<ApiInteractionManager>;

  const OPENAI_API_KEY_ENV = 'test-env-openai-key';

  beforeAll(() => {
    // Mock process.env if OpenAIAdapter relies on it for default key
    process.env.OPENAI_API_KEY = OPENAI_API_KEY_ENV;
  });

  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
  });

  beforeEach(() => {
    // Reset singleton instance for each test for isolation
    (AgentBInternal as any).instance = undefined;
    agentBInstance = (AgentBInternal as any).getInstance(); // Get a fresh instance

    // Clear mocks
    MockedOpenAIAdapter.mockClear();
    MockedMemoryStorage.mockClear();
    MockedApiInteractionManager.mockClear();

    // Setup default mock instances that AgentB.initialize will create
    mockLlmClientInstance = {
      generateResponse: jest.fn(),
      countTokens: jest.fn().mockResolvedValue(0),
      formatToolsForProvider: jest.fn().mockReturnValue([]),
      openai: {},
      defaultModel: 'gpt-4',
      mapToOpenAIMessageParam: jest.fn(),
      mapFromOpenAIChatCompletionMessage: jest.fn(),
      validateModel: jest.fn(),
      validateMessages: jest.fn(),
      validateTools: jest.fn(),
      validateToolCalls: jest.fn()
    } as jest.Mocked<ILLMClient>;
    MockedOpenAIAdapter.mockImplementation(() => mockLlmClientInstance as unknown as OpenAIAdapter);

    // Mock MemoryStorage to return distinct mocks for each storage type if needed, or a single multi-role mock
    mockMessageStorageInstance = { addMessage: jest.fn(), getMessages: jest.fn(), updateMessage: jest.fn(), deleteMessage: jest.fn() } as jest.Mocked<IMessageStorage>;
    mockAgentRunStorageInstance = { createRun: jest.fn(), getRun: jest.fn(), updateRun: jest.fn() } as jest.Mocked<IAgentRunStorage>;
    mockThreadStorageInstance = { createThread: jest.fn().mockImplementation(async (data) => ({id: data?.id || uuidv4(), createdAt: new Date(), ...data } as IThread)), getThread: jest.fn(), updateThread: jest.fn(), deleteThread: jest.fn(), listThreads: jest.fn() } as jest.Mocked<IThreadStorage>;

    MockedMemoryStorage
        .mockImplementationOnce(() => mockMessageStorageInstance as any) // For messageStorage
        .mockImplementationOnce(() => mockAgentRunStorageInstance as any) // For agentRunStorage (if distinct)
        .mockImplementationOnce(() => mockThreadStorageInstance as any);  // For threadStorage (if distinct)
        // If MemoryStorage is a single class implementing all, one mockImplementation is enough.
        // For clarity of testing distinct roles, we can mock it to return different mocks or the same.
        // Let's assume MemoryStorage implements all and we want to test interactions with specific roles:
        const sharedMockMemoryStorage = new MemoryStorage() as jest.Mocked<MemoryStorage>;
        Object.assign(sharedMockMemoryStorage, mockMessageStorageInstance, mockAgentRunStorageInstance, mockThreadStorageInstance); // Combine mocks onto one instance
        MockedMemoryStorage.mockReset().mockImplementation(() => sharedMockMemoryStorage);


    // Setup ApiInteractionManager mock
    mockApiInteractionManagerInstance = {
        ensureInitialized: jest.fn().mockResolvedValue(undefined),
        runAgentInteraction: jest.fn().mockImplementation(async function*() { yield {type: 'thread.run.completed', data: {status: 'completed'}} as AgentEvent; }),
        // Add other AIM methods if directly called by AgentB or its handlers (mostly indirect via getOrCreate)
        defaultAgentRunConfig: DEFAULT_AGENT_RUN_CONFIG, // Provide a default
    } as unknown as jest.Mocked<ApiInteractionManager>;
    MockedApiInteractionManager.mockImplementation(() => mockApiInteractionManagerInstance);
  });

  describe('initialize()', () => {
    it('should initialize LLM client, storages, and default config', () => {
      agentBInstance.initialize({ llmProvider: { provider: 'openai', apiKey: 'test-key' } });
      expect(MockedOpenAIAdapter).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-key' }));
      expect((agentBInstance as any).llmClient).toBe(mockLlmClientInstance);
      expect((agentBInstance as any).messageStorage).toBeDefined();
      expect((agentBInstance as any).agentRunStorage).toBeDefined();
      expect((agentBInstance as any).threadStorage).toBeDefined();
      expect((agentBInstance as any).globalDefaultAgentRunConfig.model).toBeDefined();
      expect((agentBInstance as any).isFrameworkInitialized).toBe(true);
    });

    it('should use environment API key for OpenAI if not provided in options', () => {
        agentBInstance.initialize({ llmProvider: { provider: 'openai' } }); // No apiKey in llmProvider
        expect(MockedOpenAIAdapter).toHaveBeenCalledWith(expect.objectContaining({ apiKey: OPENAI_API_KEY_ENV }));
    });

    it('should throw ConfigurationError if OpenAI API key is missing', () => {
      const currentEnvKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      expect(() => agentBInstance.initialize({ llmProvider: { provider: 'openai' } })).toThrow(ConfigurationError);
      process.env.OPENAI_API_KEY = currentEnvKey;
    });

    it('should use provided storage instances', () => {
        const customMessageStorage = { } as IMessageStorage; // simple mock
        const customAgentRunStorage = { } as IAgentRunStorage;
        const customThreadStorage = { } as IThreadStorage;
        agentBInstance.initialize({
            llmProvider: { provider: 'openai' },
            messageStorage: customMessageStorage,
            agentRunStorage: customAgentRunStorage,
            threadStorage: customThreadStorage
        });
        expect((agentBInstance as any).messageStorage).toBe(customMessageStorage);
        expect((agentBInstance as any).agentRunStorage).toBe(customAgentRunStorage);
        expect((agentBInstance as any).threadStorage).toBe(customThreadStorage);
    });

    it('should reset AIM instance upon re-initialization', () => {
        agentBInstance.initialize();
        (agentBInstance as any).aim = {} as ApiInteractionManager; // Simulate AIM was created
        agentBInstance.initialize(); // Re-initialize
        expect((agentBInstance as any).aim).toBeNull();
    });
  });

  describe('registerToolProvider()', () => {
    beforeEach(() => {
      agentBInstance.initialize({ llmProvider: { provider: 'openai' } });
    });

    it('should add a tool provider source', () => {
      const sourceConfig: ToolProviderSourceConfig = { id: 'test-provider', type: 'openapi', openapiConnectorOptions: { specUrl: 'http://test.com' }};
      agentBInstance.registerToolProvider(sourceConfig);
      expect((agentBInstance as any).toolProviderSources).toContain(sourceConfig);
    });

    it('should overwrite an existing provider with the same ID', () => {
      const sourceConfig1: ToolProviderSourceConfig = { id: 'prov1', type: 'openapi', openapiConnectorOptions: { specUrl: 'http://url1.com' }};
      const sourceConfig2: ToolProviderSourceConfig = { id: 'prov1', type: 'openapi', openapiConnectorOptions: { specUrl: 'http://url2.com' }};
      agentBInstance.registerToolProvider(sourceConfig1);
      agentBInstance.registerToolProvider(sourceConfig2); // Overwrite
      expect((agentBInstance as any).toolProviderSources.length).toBe(1);
      expect((agentBInstance as any).toolProviderSources[0].openapiConnectorOptions.specUrl).toBe('http://url2.com');
    });

    it('should reset AIM instance when a new provider is registered', () => {
      (agentBInstance as any).aim = {} as ApiInteractionManager; // Simulate AIM was created
      agentBInstance.registerToolProvider({ id: 'p1', type: 'openapi', openapiConnectorOptions: {specUrl: 'url'} });
      expect((agentBInstance as any).aim).toBeNull();
    });

    it('should throw if called before initialize', () => {
        const freshInstance = (AgentBInternal as any).getInstance(); // Get a truly fresh one
        (AgentBInternal as any).instance = undefined; // Reset singleton for this test
        const uninitializedAgentB = (AgentBInternal as any).getInstance();
        expect(() => uninitializedAgentB.registerToolProvider({} as any)).toThrow(InvalidStateError);
    });
  });


  describe('getOrCreateApiInteractionManager()', () => {
    beforeEach(() => {
      agentBInstance.initialize({ llmProvider: { provider: 'openai' } });
    });

    it('should create AIM with genericOpenApi mode if one OpenAPI provider is registered', async () => {
      const specOpts: OpenAPIConnectorOptions = { specUrl: 'http://single.com', sourceId: 'single' };
      agentBInstance.registerToolProvider({ id: 'single', type: 'openapi', openapiConnectorOptions: specOpts });
      await (agentBInstance as any).getOrCreateApiInteractionManager();
      
      expect(MockedApiInteractionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'genericOpenApi',
          genericOpenApiProviderConfig: specOpts,
          toolsetOrchestratorConfig: undefined,
        })
      );
    });

    it('should create AIM with toolsetsRouter mode if multiple providers are registered', async () => {
      const source1: ToolProviderSourceConfig = { id: 's1', type: 'openapi', openapiConnectorOptions: {specUrl: 'u1'} };
      const source2: ToolProviderSourceConfig = { id: 's2', type: 'openapi', openapiConnectorOptions: {specUrl: 'u2'} };
      agentBInstance.registerToolProvider(source1);
      agentBInstance.registerToolProvider(source2);
      await (agentBInstance as any).getOrCreateApiInteractionManager();

      expect(MockedApiInteractionManager).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'hierarchicalPlanner',
          toolsetOrchestratorConfig: [source1, source2],
          genericOpenApiProviderConfig: undefined,
        })
      );
    });
    
    it('should create AIM in genericOpenApi mode with no specific providers if none registered', async () => {
        // Note: toolProviderSources is empty by default after initialize if none registered
        await (agentBInstance as any).getOrCreateApiInteractionManager();
        expect(MockedApiInteractionManager).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'genericOpenApi', // The default fallback in getOrCreateAIM
                genericOpenApiProviderConfig: undefined,
                toolsetOrchestratorConfig: undefined,
            })
        );
    });

    it('should call ensureInitialized on the created AIM instance', async () => {
      await (agentBInstance as any).getOrCreateApiInteractionManager();
      expect(mockApiInteractionManagerInstance.ensureInitialized).toHaveBeenCalledTimes(1);
    });

    it('should return the same AIM instance on subsequent calls if providers havent changed', async () => {
        const aim1 = await (agentBInstance as any).getOrCreateApiInteractionManager();
        const aim2 = await (agentBInstance as any).getOrCreateApiInteractionManager();
        expect(aim1).toBe(aim2);
        expect(MockedApiInteractionManager).toHaveBeenCalledTimes(1); // Constructor called once
    });
  });

  describe('getExpressStreamingHttpHandler()', () => {
    let handler: (req: any, res: any) => Promise<void>;
    let mockReq: any;
    let mockRes: MockHttpResponse;

    beforeEach(async () => { // Make beforeEach async if handler creation is async
      agentBInstance.initialize({ llmProvider: { provider: 'openai' } });
      // Pre-register a provider so AIM gets created with some config
      agentBInstance.registerToolProvider({ id: 'p1', type: 'openapi', openapiConnectorOptions: { specUrl: 'http://test.api' }});
      // Ensure AIM is created and initialized for the handler to use
      await (agentBInstance as any).getOrCreateApiInteractionManager();

      mockReq = { query: {}, body: {}, headers: {} };
      mockRes = createMockResponse();
    });

 

    it('should call getThreadId and getUserMessage callbacks', async () => {
      const getThreadIdSpy = jest.fn().mockResolvedValue('thread-from-cb');
      const getUserMessageSpy = jest.fn().mockResolvedValue({ role: 'user', content: 'User CB prompt' } as LLMMessage);
      
      handler = agentBInstance.getExpressStreamingHttpHandler({
        getThreadId: getThreadIdSpy,
        getUserMessage: getUserMessageSpy,
      });
      await handler(mockReq, mockRes);

      expect(getThreadIdSpy).toHaveBeenCalledWith(mockReq, (agentBInstance as any).threadStorage);
      expect(getUserMessageSpy).toHaveBeenCalledWith(mockReq);
    });

    it('should create a new thread if getThreadId returns null or is not provided', async () => {
        const newThreadId = 'newly-created-thread-id';
        mockThreadStorageInstance.createThread.mockResolvedValueOnce({ id: newThreadId, createdAt: new Date() } as IThread);

        handler = agentBInstance.getExpressStreamingHttpHandler({
            // No getThreadId provided, should use default which creates a thread
            getUserMessage: async () => ({ role: 'user', content: 'Prompt' }),
        });
        await handler(mockReq, mockRes);

        expect(mockThreadStorageInstance.createThread).toHaveBeenCalled();
        // Verify ApiInteractionManager.runAgentInteraction was called with the new threadId
        expect(mockApiInteractionManagerInstance.runAgentInteraction).toHaveBeenCalledWith(
            newThreadId, // Expect the new threadId
            expect.any(Array),
            expect.any(Object),
            expect.any(String) // runId
        );
    });

    it('should return 400 if user message is not provided by callback', async () => {
      handler = agentBInstance.getExpressStreamingHttpHandler({
        getUserMessage: async () => (null as unknown as LLMMessage), // Simulate missing message
      });
      await handler(mockReq, mockRes);
      expect(mockRes.statusCode).toBe(400);
      expect(mockRes._dataChunks.join('')).toContain('Invalid message.');
    });

    it('should call aim.runAgentInteraction and stream events', async () => {
      const userMessage: LLMMessage = { role: 'user', content: 'Test agent' };
      const runId = 'test-run-id';
      const threadId = 'test-thread-id';

      async function* mockAgentEvents(): AsyncGenerator<AgentEvent> {
        yield { type: 'agent.run.created', runId, threadId, timestamp: new Date(), data: { status: 'in_progress' } } as AgentEvent;
        yield { type: 'thread.message.delta', runId, threadId, timestamp: new Date(), data: { messageId: 'm1', delta: { contentChunk: 'Hello' } } } as AgentEvent;
        yield { type: 'thread.run.completed', runId, threadId, timestamp: new Date(), data: { status: 'completed' } } as AgentEvent;
      }
      mockApiInteractionManagerInstance.runAgentInteraction.mockReturnValueOnce(mockAgentEvents());

      handler = agentBInstance.getExpressStreamingHttpHandler({
        getThreadId: async () => 'fixed-thread-id',
        getUserMessage: async () => userMessage,
      });
      await handler(mockReq, mockRes);

      expect(mockApiInteractionManagerInstance.runAgentInteraction).toHaveBeenCalledWith(
        'fixed-thread-id', [userMessage], expect.any(Object), expect.any(String)
      );
      expect(mockRes._dataChunks.length).toBe(3); // One for each yielded event
      expect(mockRes._dataChunks[0]).toContain('"type":"agent.run.created"');
      expect(mockRes._dataChunks[1]).toContain('"contentChunk":"Hello"');
      expect(mockRes._dataChunks[2]).toContain('"type":"thread.run.completed"');
      expect(mockRes._isEnded).toBe(true);
    });

    it('should handle errors from agent interaction and update run status', async () => {
        // Don't specify a fixed runId since it's generated by the handler
        mockApiInteractionManagerInstance.runAgentInteraction.mockImplementationOnce(async function*() {
            // Simulate agent creating a run record, then erroring
            const runId = 'dynamic-run-id'; // This will be replaced by the actual runId from the handler
            yield { type: 'agent.run.created', runId, threadId: 't1', timestamp: new Date(), data: { status: 'in_progress' } } as AgentEvent;
            throw new ApplicationError("Agent failed mid-run");
        });

        // Mock createRun to capture the actual runId
        let actualRunId: string | undefined;
        mockAgentRunStorageInstance.createRun.mockImplementation((runData: Omit<IAgentRun, "id" | "createdAt" | "status"> & { id?: string }) => {
            actualRunId = runData.id || uuidv4();
            return Promise.resolve({
                id: actualRunId,
                status: 'queued',
                createdAt: new Date(),
                ...runData
            } as IAgentRun);
        });

        handler = agentBInstance.getExpressStreamingHttpHandler({
            getThreadId: async () => 't1',
            getUserMessage: async () => ({role: 'user', content: 'trigger error'}),
        });
        await handler(mockReq, mockRes);

        expect(mockRes._dataChunks.some(c => c.includes("Stream failed due to server error") && c.includes("Agent failed mid-run"))).toBe(true);
        expect(mockAgentRunStorageInstance.updateRun).toHaveBeenCalledWith(
            actualRunId!, // We know it will be defined since createRun was called
            expect.objectContaining({
                status: 'failed',
                lastError: expect.objectContaining({ message: "Agent failed mid-run" })
            })
        );
        expect(mockRes._isEnded).toBe(true);
    });
  });

  describe('getApiInteractionManager()', () => {
    it('should return the AIM instance after initialization', async () => {
        agentBInstance.initialize({ llmProvider: { provider: 'openai' } });
        const aim = await agentBInstance.getApiInteractionManager();
        expect(aim).toBe(mockApiInteractionManagerInstance); // Should be the mocked instance
        expect(mockApiInteractionManagerInstance.ensureInitialized).toHaveBeenCalled();
    });

    it('should throw if called before initialize', async () => {
        const freshInstance = (AgentBInternal as any).getInstance();
        (AgentBInternal as any).instance = undefined; // Reset singleton for this test
        const uninitializedAgentB = (AgentBInternal as any).getInstance();
        await expect(uninitializedAgentB.getApiInteractionManager()).rejects.toThrow(InvalidStateError);
    });
  });
});