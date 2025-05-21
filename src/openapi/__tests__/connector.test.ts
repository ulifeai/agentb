// src/openapi/__tests__/connector.test.ts

import { OpenAPIConnector, OpenAPIConnectorOptions } from '../connector';
import { OpenAPISpecParser } from '../spec-parser';
import * as OpenApiUtils from '../utils'; // To mock fetchSpec
import { ITool, IToolResult } from '../../core/tool';
import { OpenAPISpec, ConnectorOperation, OpenAPIParameter } from '../types';
import { samplePetStoreSpec, minimalValidSpec } from './mock-openapi.data';
import { GenericHttpApiTool, GENERIC_HTTP_TOOL_NAME } from '../tools/generic-http-tool';

// Mock OpenAPISpecParser
jest.mock('../spec-parser');

// Mock fetchSpec from openapi/utils
jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'), // Import and retain original utils except for fetchSpec
  fetchSpec: jest.fn(),
}));

describe('OpenAPIConnector', () => {
  let MockOpenAPISpecParser: jest.MockedClass<typeof OpenAPISpecParser>;
  let mockFetchSpec: jest.MockedFunction<typeof OpenApiUtils.fetchSpec>;
  let mockGetOperations: jest.Mock;
  let mockGetBaseUrl: jest.Mock;
  let mockGetOperationParametersSchema: jest.Mock;

  const commonOpParams: OpenAPIParameter[] = [{name: 'common', in: 'query', schema: {type: 'string'}, description: 'common param', required: false}];
  const sampleOperation1: ConnectorOperation = { operationId: 'op1', method: 'GET', path: '/test1', summary: 'Test Op 1', parameters: [], tags: ['test'] };
  const sampleOperation2: ConnectorOperation = { operationId: 'op2', method: 'POST', path: '/test2', summary: 'Test Op 2', parameters: commonOpParams, requestBodySchema: {type: 'object'}, tags: ['test', 'another'] };


  beforeEach(() => {
    // Reset mocks for each test
    MockOpenAPISpecParser = OpenAPISpecParser as jest.MockedClass<typeof OpenAPISpecParser>;
    mockFetchSpec = OpenApiUtils.fetchSpec as jest.MockedFunction<typeof OpenApiUtils.fetchSpec>;

    mockGetOperations = jest.fn().mockReturnValue([sampleOperation1, sampleOperation2]);
    mockGetBaseUrl = jest.fn().mockReturnValue('https://mockapi.com/v1');
    mockGetOperationParametersSchema = jest.fn(opId => {
        if (opId === 'op1') return { type: 'object', properties: {} };
        if (opId === 'op2') return { type: 'object', properties: { common: {type: 'string'}, requestBody: {type: 'object'} }, required: ['requestBody']};
        return { type: 'object', properties: {} };
    });
    
    MockOpenAPISpecParser.mockImplementation(() => ({
      getOperations: mockGetOperations,
      getBaseUrl: mockGetBaseUrl,
      getFullSpec: jest.fn().mockReturnValue(samplePetStoreSpec), // or minimalValidSpec
      getSpecParser: jest.fn().mockReturnThis(), // Not directly used by connector methods but by tools
      getAllTags: jest.fn().mockReturnValue(['test', 'another']),
      getOperationById: jest.fn(id => [sampleOperation1, sampleOperation2].find(op => op.operationId === id)),
      getOperationParametersSchema: mockGetOperationParametersSchema,
      // Add other methods if OpenAPIConnector directly calls them (it mostly uses getOperations/getBaseUrl)
    } as unknown as OpenAPISpecParser));

    mockFetchSpec.mockResolvedValue(samplePetStoreSpec);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with a spec object', async () => {
      const options: OpenAPIConnectorOptions = { spec: samplePetStoreSpec };
      const connector = new OpenAPIConnector(options);
      await connector.ensureInitialized();
      expect(MockOpenAPISpecParser).toHaveBeenCalledWith(samplePetStoreSpec, undefined);
      expect(mockFetchSpec).not.toHaveBeenCalled();
      expect(connector.isInitialized()).toBe(true);
    });

    it('should initialize with a specUrl', async () => {
      const specUrl = 'https://example.com/spec.json';
      const options: OpenAPIConnectorOptions = { specUrl };
      const connector = new OpenAPIConnector(options);
      await connector.ensureInitialized();
      expect(mockFetchSpec).toHaveBeenCalledWith(specUrl);
      expect(MockOpenAPISpecParser).toHaveBeenCalledWith(samplePetStoreSpec, undefined); // Assuming fetchSpec returns samplePetStoreSpec
      expect(connector.isInitialized()).toBe(true);
    });

    it('should throw if neither spec nor specUrl is provided', () => {
      expect(() => new OpenAPIConnector({} as OpenAPIConnectorOptions)).toThrow('specUrl" or "spec" must be provided');
    });

    it('should apply tagFilter to OpenAPISpecParser', async () => {
        const options: OpenAPIConnectorOptions = { spec: samplePetStoreSpec, tagFilter: 'test' };
        const connector = new OpenAPIConnector(options);
        await connector.ensureInitialized();
        expect(MockOpenAPISpecParser).toHaveBeenCalledWith(samplePetStoreSpec, 'test');
    });
  });

  describe('Tool Provisioning (getTools, getTool)', () => {
    it('should provide ITool instances for each operation from parser', async () => {
      const connector = new OpenAPIConnector({ spec: samplePetStoreSpec });
      await connector.ensureInitialized();
      const tools = await connector.getTools();
      // sampleOperation1, sampleOperation2 + GenericHttpApiTool (if no tagFilter and includeGenericToolIfNoTagFilter is true)
      expect(tools.length).toBe(3); 
      expect(tools.some(async t => (await t.getDefinition()).name === 'op1')).toBe(true);
      expect(tools.some(async t => (await t.getDefinition()).name === 'op2')).toBe(true);
    });

    it('should include GenericHttpApiTool if no tagFilter and includeGenericTool is true (default)', async () => {
        const connector = new OpenAPIConnector({ spec: samplePetStoreSpec });
        await connector.ensureInitialized();
        const tools = await connector.getTools();
        expect(tools.some(t => t instanceof GenericHttpApiTool)).toBe(true);
        const genericTool = tools.find(t => t instanceof GenericHttpApiTool);
        expect((await genericTool!.getDefinition()).name).toBe(GENERIC_HTTP_TOOL_NAME);
    });
    
    it('should NOT include GenericHttpApiTool if tagFilter is applied', async () => {
        const connector = new OpenAPIConnector({ spec: samplePetStoreSpec, tagFilter: 'test' });
        await connector.ensureInitialized();
        const tools = await connector.getTools();
        expect(tools.some(t => t instanceof GenericHttpApiTool)).toBe(false);
    });

    it('should NOT include GenericHttpApiTool if includeGenericToolIfNoTagFilter is false', async () => {
        const connector = new OpenAPIConnector({ spec: samplePetStoreSpec, includeGenericToolIfNoTagFilter: false });
        await connector.ensureInitialized();
        const tools = await connector.getTools();
        expect(tools.some(t => t instanceof GenericHttpApiTool)).toBe(false);
    });


    it('should retrieve a specific tool by its sanitized operationId', async () => {
      const connector = new OpenAPIConnector({ spec: samplePetStoreSpec });
      await connector.ensureInitialized();
      const tool = await connector.getTool('op1'); // 'op1' is already sanitized-friendly
      expect(tool).toBeDefined();
      expect((await tool!.getDefinition()).name).toBe('op1');
    });

    it('should return undefined if tool name is not found', async () => {
      const connector = new OpenAPIConnector({ spec: samplePetStoreSpec });
      await connector.ensureInitialized();
      const tool = await connector.getTool('nonExistentTool');
      expect(tool).toBeUndefined();
    });
  });

  describe('OpenAPIOperationTool (internal class behavior via Connector)', () => {
    it('OpenAPIOperationTool.getDefinition should return correct structure', async () => {
        const connector = new OpenAPIConnector({ spec: samplePetStoreSpec });
        await connector.ensureInitialized();
        const op2Tool = await connector.getTool('op2');
        expect(op2Tool).toBeDefined();
        const definition = await op2Tool!.getDefinition();

        expect(definition.name).toBe('op2');
        expect(definition.description).toBe('Test Op 2'); // summary is used as description
        expect(definition.parameters.length).toBe(2); // common + requestBody
        expect(definition.parameters.find(p => p.name === 'common')).toMatchObject({
            type: 'string', description: 'common param', required: false
        });
        expect(definition.parameters.find(p => p.name === 'requestBody')).toMatchObject({
            type: 'object', description: 'The request body for the operation.', required: true // From mockGetOperationParametersSchema
        });
    });
  });
  
  describe('Execution (requires mocking fetch)', () => {
    let connector: OpenAPIConnector;
    let globalFetchMock: jest.Mock;

    beforeEach(async () => {
        globalFetchMock = jest.fn();
        global.fetch = globalFetchMock;

        connector = new OpenAPIConnector({ spec: samplePetStoreSpec, authentication: {type: 'none'} });
        await connector.ensureInitialized();
    });

    afterEach(() => {
        jest.restoreAllMocks(); // Restore global.fetch
    });

    it('executeSpecificOperationInternal should make a GET call and return success IToolResult', async () => {
        const mockApiResponse = { successData: 'op1 called' };
        globalFetchMock.mockResolvedValueOnce({
            ok: true, status: 200, json: async () => mockApiResponse, text: async () => JSON.stringify(mockApiResponse),
            headers: new Headers({ 'content-type': 'application/json' })
        });

        const result = await connector.executeSpecificOperationInternal('op1', { param: 'value' });
        expect(globalFetchMock).toHaveBeenCalledWith('https://mockapi.com/v1/test1', expect.any(Object));
        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockApiResponse);
    });

    it('executeSpecificOperationInternal should correctly build URL with path and query params', async () => {
        // Modify sampleOperation1 to have path and query params for this test
        mockGetOperations.mockReturnValueOnce([
            { ...sampleOperation1, path: '/test1/{id}', parameters: [{name: 'id', in: 'path', required: true, schema:{type:'string'}}, {name: 'q', in: 'query', required:false, schema:{type:'string'}}] },
            sampleOperation2
        ]);
        // Re-initialize connector with modified mock
        connector = new OpenAPIConnector({ spec: samplePetStoreSpec });
        await connector.ensureInitialized();


        globalFetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}), text: async () => "" });

        await connector.executeSpecificOperationInternal('op1', { id: '123', q: 'search' });
        expect(globalFetchMock).toHaveBeenCalledWith(
            'https://mockapi.com/v1/test1/123?q=search',
            expect.objectContaining({ method: 'GET' })
        );
    });


    it('executeSpecificOperationInternal should handle POST with requestBody', async () => {
        const requestBody = { key: 'value' };
        globalFetchMock.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ created: true }), text: async () => ""});

        await connector.executeSpecificOperationInternal('op2', { requestBody, common: 'testCommon' });
        
        expect(globalFetchMock).toHaveBeenCalledWith(
            'https://mockapi.com/v1/test2?common=testCommon', // Query param also included
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(requestBody),
                headers: expect.any(Headers) // Headers will include Content-Type: application/json
            })
        );
        const calledHeaders = new Headers(globalFetchMock.mock.calls[0][1].headers);
        expect(calledHeaders.get('content-type')).toContain('application/json');
    });


    it('executeSpecificOperationInternal should return error IToolResult on API failure', async () => {
        globalFetchMock.mockResolvedValueOnce({
            ok: false, status: 404, statusText: "Not Found", json: async () => ({ error: 'Not found' }), text: async () => '{"error":"Not found"}',
            headers: new Headers({'content-type': 'application/json'})
        });
        const result = await connector.executeSpecificOperationInternal('op1', {});
        expect(result.success).toBe(false);
        expect(result.error).toContain('failed with status 404: Not Found');
        expect(result.data).toEqual({ error: 'Not found' });
    });

    it('executeGenericOperationInternal should make correct call and return success', async () => {
        const mockApiResponse = { generic: 'success' };
        globalFetchMock.mockResolvedValueOnce({
            ok: true, status: 200, json: async () => mockApiResponse, text: async () => JSON.stringify(mockApiResponse),
            headers: new Headers({ 'content-type': 'application/json' })
        });

        const result = await connector.executeGenericOperationInternal({
            method: 'PUT', path: '/generic/path', queryParams: {id: 1}, requestBody: {data: 'payload'}
        });
        expect(globalFetchMock).toHaveBeenCalledWith(
            'https://mockapi.com/v1/generic/path?id=1',
            expect.objectContaining({
                method: 'PUT',
                body: JSON.stringify({data: 'payload'})
            })
        );
        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockApiResponse);
    });
  });

});