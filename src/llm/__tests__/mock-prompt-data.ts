
import { IToolDefinition, IToolParameter, IToolSet, ITool } from '../../core/tool';
import { OpenAPISpec, ConnectorOperation } from '../../openapi/types'; // For generateGenericHttpToolSystemPrompt

export const mockApiInfo: OpenAPISpec['info'] = {
  title: 'Test API',
  version: 'v1.0',
  description: 'An API for testing purposes.',
};

export const mockBaseUrl = 'https://api.test.com/v1';

export const mockBusinessContext = 'Use this API responsibly during testing.';

export const mockToolParam1: IToolParameter = { name: 'location', type: 'string', description: 'The city name.', required: true };
export const mockToolParam2: IToolParameter = { name: 'days', type: 'number', description: 'Number of days for forecast.', required: false, schema: { default: 1 } };

export const mockToolDef1: IToolDefinition = {
  name: 'get_weather',
  description: 'Fetches the current weather for a given location.',
  parameters: [mockToolParam1, mockToolParam2],
};

export const mockToolDef2: IToolDefinition = {
  name: 'send_email',
  description: 'Sends an email.',
  parameters: [
    { name: 'recipient', type: 'string', description: 'Email recipient.', required: true },
    { name: 'subject', type: 'string', description: 'Email subject.', required: true },
    { name: 'body', type: 'string', description: 'Email body.', required: true },
  ],
};

export const mockToolDefNoParams: IToolDefinition = {
  name: 'get_current_time',
  description: 'Gets the current server time.',
  parameters: [],
};

// Mock ITool instances for IToolSet
class MockToolImpl implements ITool {
  constructor(private definition: IToolDefinition) {}
  getDefinition(): IToolDefinition { return this.definition; }
  async execute(input: any): Promise<any> { return { success: true, data: 'mock execution' }; }
}

export const mockToolSet1: IToolSet = {
  id: 'weather_tools_v1',
  name: 'Weather Services',
  description: 'Tools for getting weather forecasts and conditions.',
  tools: [new MockToolImpl(mockToolDef1)],
  metadata: { apiTitle: 'Weather API', apiVersion: '1.1', baseUrl: 'https://weather.api/v1' },
};

export const mockToolSet2: IToolSet = {
  id: 'communication_tools_alpha',
  name: 'Communication Utilities',
  description: 'Utilities for sending messages and notifications.',
  tools: [new MockToolImpl(mockToolDef2), new MockToolImpl(mockToolDefNoParams)],
};

// For generateGenericHttpToolSystemPrompt
export const mockConnectorOp1: ConnectorOperation = {
  operationId: 'getUser',
  summary: 'Get user by ID.',
  description: 'Retrieves a user profile based on their unique identifier.',
  method: 'GET',
  path: '/users/{userId}',
  parameters: [{ name: 'userId', in: 'path', required: true, description: 'ID of the user', schema: { type: 'string' } }],
  tags: ['users'],
};
export const mockConnectorOp2: ConnectorOperation = {
  operationId: 'createUser',
  summary: 'Create a new user.',
  method: 'POST',
  path: '/users',
  parameters: [],
  requestBodySchema: { type: 'object', properties: { username: { type: 'string' }, email: { type: 'string' } }, required: ['username', 'email'] },
  tags: ['users'],
};