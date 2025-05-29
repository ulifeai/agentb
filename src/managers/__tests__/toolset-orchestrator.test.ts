
import { ToolsetOrchestrator, ToolProviderSourceConfig } from '../toolset-orchestrator';
import { OpenAPIConnector, OpenAPIConnectorOptions } from '../../openapi/connector';
import { ITool, IToolDefinition, IToolSet } from '../../core/tool';
import { OpenAPISpec } from '../../openapi/types';
import { ConfigurationError } from '../../core/errors';
import { samplePetStoreSpec, minimalValidSpec } from '../../openapi/__tests__/mock-openapi.data'; // Test data
import { sanitizeIdForLLM } from '../../core/utils';

// Mock OpenAPIConnector
jest.mock('../../openapi/connector');

const MockedOpenAPIConnector = OpenAPIConnector as jest.MockedClass<typeof OpenAPIConnector>;

// Mock tool for getTools()
const mockTool1Def: IToolDefinition = { name: 'tool1', description: 'Tool 1', parameters: [] };
const mockTool1: ITool = { getDefinition: async () => mockTool1Def, execute: async () => ({ success: true, data: 'tool1 exec' })};
const mockTool2Def: IToolDefinition = { name: 'tool2', description: 'Tool 2', parameters: [] };
const mockTool2: ITool = { getDefinition: async () => mockTool2Def, execute: async () => ({ success: true, data: 'tool2 exec' })};


describe('ToolsetOrchestrator', () => {
  let mockConnectorInstance: jest.Mocked<OpenAPIConnector>;

  beforeEach(() => {
    MockedOpenAPIConnector.mockClear();

    // Setup a default mock instance for OpenAPIConnector
    mockConnectorInstance = {
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      getTools: jest.fn().mockResolvedValue([mockTool1, mockTool2]),
      getFullSpec: jest.fn().mockReturnValue(samplePetStoreSpec), // Default spec
      getSpecParser: jest.fn().mockReturnValue({ // Mock for specParser
        getAllTags: jest.fn().mockReturnValue(['pets', 'store']),
      }),
      getBaseUrl: jest.fn().mockReturnValue('https://api.example.com'),
      // Add other methods if needed by ToolsetOrchestrator's internal logic
    } as any; // Cast as any to satisfy complex type, we only mock used methods

    MockedOpenAPIConnector.mockImplementation(() => mockConnectorInstance);
  });

  const createSourceConfig = (id: string, overrides: Partial<OpenAPIConnectorOptions> = {}, strategy?: 'byTag' | 'allInOne', allInOneToolsetName?: string): ToolProviderSourceConfig => ({
    id,
    type: 'openapi',
    openapiConnectorOptions: { spec: minimalValidSpec, ...overrides },
    toolsetCreationStrategy: strategy,
    allInOneToolsetName
  });

  describe('Constructor and Initialization', () => {
    it('should throw ConfigurationError if no provider configs are given', () => {
      expect(() => new ToolsetOrchestrator([])).toThrow(ConfigurationError);
    });

    it('should initialize successfully with valid config', async () => {
      const config = [createSourceConfig('api1', {}, 'allInOne')];
      const orchestrator = new ToolsetOrchestrator(config);
      await orchestrator.ensureInitialized();
      expect(MockedOpenAPIConnector).toHaveBeenCalledTimes(2); // 1 for spec + 1 for allInOne
      expect(mockConnectorInstance.ensureInitialized).toHaveBeenCalled();
    });
  });

  describe('Toolset Creation Strategies', () => {
    it('should use "byTag" strategy if tags exist and strategy is undefined', async () => {
      // Mock spec parser to return tags
      mockConnectorInstance.getSpecParser.mockReturnValueOnce({
        getAllTags: jest.fn().mockReturnValue(['pets', 'store'])
      } as any);

      // Mock getTools to return different tools for each tag
      mockConnectorInstance.getTools
        .mockResolvedValueOnce([mockTool1, mockTool2]) // For the tempFullSpecConnector
        .mockResolvedValueOnce([mockTool1]) // For 'pets' tag
        .mockResolvedValueOnce([mockTool2]); // For 'store' tag

      const config = [createSourceConfig('petstoreApi', { spec: samplePetStoreSpec })];
      const orchestrator = new ToolsetOrchestrator(config);
      await orchestrator.ensureInitialized();

      // Verify connector was called for each tag
      expect(MockedOpenAPIConnector).toHaveBeenCalledTimes(3); // 1 for spec + 2 for tags
      expect(MockedOpenAPIConnector).toHaveBeenCalledWith(expect.objectContaining({ tagFilter: 'pets' }));
      expect(MockedOpenAPIConnector).toHaveBeenCalledWith(expect.objectContaining({ tagFilter: 'store' }));

      // Verify toolsets were created correctly
      const toolsets = await orchestrator.getToolsets();
      expect(toolsets.length).toBe(2);
      expect(toolsets.find(ts => ts.id.includes('_tag_pets'))).toBeDefined();
      expect(toolsets.find(ts => ts.id.includes('_tag_store'))).toBeDefined();
    });

    it('should use "allInOne" strategy if no tags exist and strategy is undefined', async () => {
      // Mock spec parser to return no tags
      mockConnectorInstance.getSpecParser.mockReturnValueOnce({
        getAllTags: jest.fn().mockReturnValue([])
      } as any);

      // Mock getTools to return all tools for the allInOne connector
      mockConnectorInstance.getTools
        .mockResolvedValueOnce([mockTool1, mockTool2]) // For tempFullSpecConnector
        .mockResolvedValueOnce([mockTool1, mockTool2]); // For allInOne connector

      const config = [createSourceConfig('simpleApi', { spec: minimalValidSpec })];
      const orchestrator = new ToolsetOrchestrator(config);
      await orchestrator.ensureInitialized();

      // Verify connector was called without tag filter
      expect(MockedOpenAPIConnector).toHaveBeenCalledTimes(2); // 1 for spec + 1 for allInOne
      expect(MockedOpenAPIConnector).toHaveBeenLastCalledWith(expect.objectContaining({ tagFilter: undefined }));

      // Verify single toolset was created with all tools
      const toolsets = await orchestrator.getToolsets();
      expect(toolsets.length).toBe(1);
      expect(toolsets[0].id).toContain('_all_tools');
      expect(toolsets[0].tools.length).toBe(2);
    });

    it('should respect explicit "allInOne" strategy even if tags exist', async () => {
      // Mock spec parser to return tags
      mockConnectorInstance.getSpecParser.mockReturnValueOnce({
        getAllTags: jest.fn().mockReturnValue(['pets', 'store'])
      } as any);

      // Mock getTools to return all tools for the allInOne connector
      mockConnectorInstance.getTools
        .mockResolvedValueOnce([mockTool1, mockTool2]) // For tempFullSpecConnector
        .mockResolvedValueOnce([mockTool1, mockTool2]); // For allInOne connector

      const config = [createSourceConfig('forcedAllInOne', { spec: samplePetStoreSpec }, 'allInOne')];
      const orchestrator = new ToolsetOrchestrator(config);
      await orchestrator.ensureInitialized();

      // Verify connector was called without tag filter
      expect(MockedOpenAPIConnector).toHaveBeenCalledTimes(2); // 1 for spec + 1 for allInOne
      expect(MockedOpenAPIConnector).toHaveBeenLastCalledWith(expect.objectContaining({ tagFilter: undefined }));

      // Verify single toolset was created with all tools
      const toolsets = await orchestrator.getToolsets();
      expect(toolsets.length).toBe(1);
      expect(toolsets[0].tools.length).toBe(2);
    });

    it('should skip toolset creation if a tag yields no tools', async () => {
      // Mock spec parser to return tags
      mockConnectorInstance.getSpecParser.mockReturnValueOnce({
        getAllTags: jest.fn().mockReturnValue(['emptyTag', 'nonEmptyTag'])
      } as any);

      // Mock getTools to return no tools for emptyTag and some tools for nonEmptyTag
      mockConnectorInstance.getTools
        .mockResolvedValueOnce([mockTool1, mockTool2]) // For tempFullSpecConnector
        .mockResolvedValueOnce([]) // For 'emptyTag'
        .mockResolvedValueOnce([mockTool1]); // For 'nonEmptyTag'

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const config = [createSourceConfig('taggedApi', { spec: samplePetStoreSpec }, 'byTag')];
      const orchestrator = new ToolsetOrchestrator(config);
      await orchestrator.ensureInitialized();
      
      // Verify warning was logged with the correct message format
      expect(
        consoleWarnSpy.mock.calls.some(
          ([msg]) =>
            typeof msg === 'string' &&
            (msg.includes('No tools found for tag "emptyTag"') || msg.includes('No tools found for tag "nonEmptyTag"'))
        )
      ).toBe(true);
      
      // Verify only one toolset was created
      const toolsets = await orchestrator.getToolsets();
      expect(toolsets.length).toBe(1);
      expect(toolsets[0].id).toMatch(/_tag_(emptyTag|nonEmptyTag)$/);
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getToolset(s)', () => {
    it('should return all created toolsets', async () => {
        // Simplified setup for this test: allInOne with 2 tools
        mockConnectorInstance.getSpecParser.mockReturnValueOnce({ getAllTags: jest.fn().mockReturnValue([]) } as any);
        mockConnectorInstance.getTools
          .mockResolvedValueOnce([mockTool1, mockTool2]) // For tempFullSpecConnector
          .mockResolvedValueOnce([mockTool1, mockTool2]); // For allInOne connector
        
        const config = [createSourceConfig('api1', {}, 'allInOne')];
        const orchestrator = new ToolsetOrchestrator(config);
        await orchestrator.ensureInitialized();

        const toolsets = await orchestrator.getToolsets();
        expect(toolsets.length).toBe(1);
        expect(toolsets[0].tools.length).toBe(2);
    });

    it('should return a specific toolset by ID', async () => {
        mockConnectorInstance.getSpecParser.mockReturnValueOnce({ getAllTags: jest.fn().mockReturnValue([]) } as any);
        mockConnectorInstance.getTools
          .mockResolvedValueOnce([mockTool1, mockTool2]) // For tempFullSpecConnector
          .mockResolvedValueOnce([mockTool1, mockTool2]); // For allInOne connector

        const config = [createSourceConfig('myApi', {}, 'allInOne', 'My API Tools')];
        const orchestrator = new ToolsetOrchestrator(config);
        await orchestrator.ensureInitialized();

        const toolsetId = sanitizeIdForLLM('My API Tools');
        const toolset = await orchestrator.getToolset(toolsetId);
        expect(toolset).toBeDefined();
        expect(toolset?.name).toBe('My API Tools');
    });

    it('should return undefined for non-existent toolset ID', async () => {
        const orchestrator = new ToolsetOrchestrator([createSourceConfig('api1')]);
        await orchestrator.ensureInitialized();
        const toolset = await orchestrator.getToolset('non-existent-id');
        expect(toolset).toBeUndefined();
    });
  });

  // TODO: Test `updateAuthenticationForAllOpenAPIProviders` - this is more complex
  // as it involves re-initialization and checking if new auth configs are applied.
  // It would require deeper mocking of OpenAPIConnector instances created during initialization.
});