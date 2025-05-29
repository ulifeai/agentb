import { OpenAPISpec } from '../types';

export const minimalValidSpec: OpenAPISpec = {
  openapi: '3.0.0',
  info: {
    title: 'Minimal API',
    version: '1.0.0',
  },
  paths: {},
};

export const samplePetStoreSpec: OpenAPISpec = {
  openapi: '3.0.3',
  info: {
    title: 'Sample Pet Store App',
    version: '1.0.0',
    description: 'A sample pet store API.',
  },
  servers: [{ url: 'http://petstore.swagger.io/v1' }],
  paths: {
    '/pets': {
      get: {
        tags: ['pets'],
        summary: 'List all pets',
        operationId: 'listPets',
        parameters: [
          { name: 'limit', in: 'query', description: 'How many items to return at one time (max 100)', required: false, schema: { type: 'integer', format: 'int32' } },
        ],
        responses: {
          '200': { description: 'A paged array of pets', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } },
        },
      },
      post: {
        tags: ['pets'],
        summary: 'Create a pet',
        operationId: 'createPet',
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PetInput' } } },
          required: true,
        },
        responses: { '201': { description: 'Null response' } },
      },
    },
    '/pets/{petId}': {
      get: {
        tags: ['pets'],
        summary: 'Info for a specific pet',
        operationId: 'getPetById',
        parameters: [
          { name: 'petId', in: 'path', required: true, description: 'The id of the pet to retrieve', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Information about the pet', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        },
      },
      delete: { // Operation without operationId to test skipping
        tags: ['pets'],
        summary: 'Deletes a pet',
        parameters: [
            { name: 'apiKey', in: 'header', required: false, schema: { type: 'string' } },
            { name: 'petId', in: 'path', required: true, description: 'Pet id to delete', schema: { type: 'string' } }
        ],
        responses: { '204': { description: 'Successfully deleted' } }
      }
    },
    '/store/inventory': { // For testing a different tag
        get: {
            tags: ["store"],
            summary: "Returns pet inventories by status",
            operationId: "getInventory",
            responses: {
                "200": { description: "successful operation", content: { "application/json": { schema: { type: "object", additionalProperties: { type: "integer", format: "int32" } } } } }
            }
        }
    },
    '/refPath': { // For testing path item $ref
      '$ref': '#/paths/SharedPathItem'
    },
    '/SharedPathItem': {
      get: {
        tags: ['pets', 'shared'],
        summary: 'A shared path item operation',
        operationId: 'getSharedData',
        parameters: [ { $ref: '#/components/parameters/CommonHeader' } ],
        responses: { '200': { description: 'Shared data' } }
      }
    }
  },
  components: {
    schemas: {
      Pet: { type: 'object', properties: { id: { type: 'integer', format: 'int64' }, name: { type: 'string' }, tag: { type: 'string' } } },
      PetInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, status: { type: 'string', enum: ['available', 'pending', 'sold']} } },
      Error: { type: 'object', properties: { code: { type: 'integer', format: 'int32' }, message: { type: 'string' } } },
    },
    parameters: {
      CommonHeader: { name: 'X-Common-Header', in: 'header', schema: { type: 'string' }, description: 'A common header parameter.'}
    }
  },
};