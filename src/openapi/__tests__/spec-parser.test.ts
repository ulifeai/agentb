// src/openapi/__tests__/spec-parser.test.ts

import { OpenAPISpecParser } from '../spec-parser';
import { OpenAPISpec, ConnectorOperation } from '../types';
import { minimalValidSpec, samplePetStoreSpec } from './mock-openapi.data';
import { ConfigurationError } from '../../core/errors'; // Assuming ConfigurationError for invalid spec

describe('OpenAPISpecParser', () => {
  describe('Constructor', () => {
    it('should throw error for invalid spec (missing openapi field)', () => {
      const invalidSpec: any = { info: {}, paths: {} };
      expect(() => new OpenAPISpecParser(invalidSpec)).toThrow(ConfigurationError);
      expect(() => new OpenAPISpecParser(invalidSpec)).toThrow('Invalid OpenAPI spec provided to parser: "openapi" or "paths" field is missing.');
    });

    it('should throw error for invalid spec (missing paths field)', () => {
      const invalidSpec: any = { openapi: '3.0.0', info: {} };
      expect(() => new OpenAPISpecParser(invalidSpec)).toThrow(ConfigurationError);
    });

    it('should successfully initialize with a minimal valid spec', () => {
      expect(() => new OpenAPISpecParser(minimalValidSpec)).not.toThrow();
    });

    it('should successfully initialize with the sample PetStore spec', () => {
      expect(() => new OpenAPISpecParser(samplePetStoreSpec)).not.toThrow();
    });
  });

  describe('Basic Getters with PetStore Spec', () => {
    let parser: OpenAPISpecParser;

    beforeEach(() => {
      parser = new OpenAPISpecParser(samplePetStoreSpec);
    });

    it('should get all unique tags', () => {
      const tags = parser.getAllTags();
      expect(tags).toEqual(expect.arrayContaining(['pets', 'store', 'shared']));
      expect(tags.length).toBe(3); // 'pets', 'store', 'shared' from resolved ref
    });

    it('should get the base URL', () => {
      expect(parser.getBaseUrl()).toBe('http://petstore.swagger.io/v1'); // Trailing slash removed
    });

    it('should return empty string if no servers defined for base URL', () => {
        const specWithoutServers: OpenAPISpec = { ...minimalValidSpec, servers: [] };
        const p = new OpenAPISpecParser(specWithoutServers);
        expect(p.getBaseUrl()).toBe('');
    });
    
    it('should warn and return empty string if server URL is invalid', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const specWithInvalidServer: OpenAPISpec = {
            ...minimalValidSpec,
            servers: [{url: "invalid-url-not-absolute"}]
        };
        const p = new OpenAPISpecParser(specWithInvalidServer);
        expect(p.getBaseUrl()).toBe('');
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("[SpecParser] Invalid base URL defined in spec servers: invalid-url-not-absolute"));
        consoleWarnSpy.mockRestore();
    });

  });

  describe('Operations Parsing with PetStore Spec (No Tag Filter)', () => {
    let parser: OpenAPISpecParser;
    let operations: ConnectorOperation[];

    beforeAll(() => {
      // Suppress console.warn for missing operationId during this test suite block
      jest.spyOn(console, 'warn').mockImplementation((message) => {
          if (!message.includes("Operation missing operationId")) {
              // Call original console.warn for other warnings
              jest.requireActual('console').warn(message);
          }
      });
      parser = new OpenAPISpecParser(samplePetStoreSpec);
      operations = parser.getOperations();
    });
    
    afterAll(() => {
        jest.restoreAllMocks(); // Restore console.warn
    });


    it('should parse all operations correctly', () => {
      // Expected: listPets, createPet, getPetById, getInventory, getSharedData (delete /pets/{petId} is skipped due to no operationId)
      expect(operations.length).toBe(5);
    });

    it('should correctly parse operationId, method, path, summary, and tags', () => {
      const listPetsOp = operations.find(op => op.operationId === 'listPets');
      expect(listPetsOp).toBeDefined();
      expect(listPetsOp?.method).toBe('GET');
      expect(listPetsOp?.path).toBe('/pets');
      expect(listPetsOp?.summary).toBe('List all pets');
      expect(listPetsOp?.tags).toEqual(['pets']);
    });
    
    it('should correctly parse operation from resolved $ref pathItem', () => {
      const getSharedDataOp = operations.find(op => op.operationId === 'getSharedData');
      expect(getSharedDataOp).toBeDefined();
      expect(getSharedDataOp?.method).toBe('GET');
      expect(getSharedDataOp?.path).toBe('/refPath');
      expect(getSharedDataOp?.summary).toBe('A shared path item operation');
      expect(getSharedDataOp?.tags).toEqual(['pets', 'shared']);
      // Check for resolved parameter from $ref
      expect(getSharedDataOp?.parameters.some(p => p.name === 'X-Common-Header')).toBe(true);
    });

    it('should parse parameters for an operation', () => {
      const listPetsOp = operations.find(op => op.operationId === 'listPets');
      expect(listPetsOp?.parameters.length).toBe(1);
      expect(listPetsOp?.parameters[0].name).toBe('limit');
      expect(listPetsOp?.parameters[0].in).toBe('query');
      expect(listPetsOp?.parameters[0].schema.type).toBe('integer');
    });

    it('should parse requestBody schema for an operation', () => {
      const createPetOp = operations.find(op => op.operationId === 'createPet');
      expect(createPetOp?.requestBodySchema).toBeDefined();
      expect(createPetOp?.requestBodySchema.type).toBe('object');
      expect(createPetOp?.requestBodySchema.properties.name.type).toBe('string');
      expect(createPetOp?.requestBodySchema.required).toContain('name');
    });

    it('should retrieve a specific operation by ID', () => {
      const op = parser.getOperationById('getPetById');
      expect(op).toBeDefined();
      expect(op?.summary).toBe('Info for a specific pet');
    });

    it('should return undefined for non-existent operation ID', () => {
      expect(parser.getOperationById('nonExistentOp')).toBeUndefined();
    });
    
    it('should skip operations without an operationId', () => {
        const deletePetOp = operations.find(op => op.summary === 'Deletes a pet'); // Summary of the op without ID
        expect(deletePetOp).toBeUndefined(); // It should not be in the parsed operations
    });
  });

  describe('Operations Parsing with Tag Filter ("pets")', () => {
    let parser: OpenAPISpecParser;
    let operations: ConnectorOperation[];

    beforeAll(() => {
      parser = new OpenAPISpecParser(samplePetStoreSpec, 'pets');
      operations = parser.getOperations();
    });

    it('should filter operations by the "pets" tag', () => {
      // Expected: listPets, createPet, getPetById, getSharedData (resolved from /refPath and also has 'pets' tag)
      expect(operations.length).toBe(4);
      expect(operations.every(op => op.tags?.includes('pets'))).toBe(true);
    });

    it('should not include operations from other tags (e.g., "store")', () => {
      const storeOp = operations.find(op => op.operationId === 'getInventory');
      expect(storeOp).toBeUndefined();
    });

    it('getOperationById should respect tag filter', () => {
        expect(parser.getOperationById('listPets')).toBeDefined(); // Has 'pets' tag
        expect(parser.getOperationById('getInventory')).toBeUndefined(); // Does not have 'pets' tag
    });
  });
  
  describe('getOperationParametersSchema', () => {
    const parser = new OpenAPISpecParser(samplePetStoreSpec);

    it('should generate schema for operation with query parameters', () => {
        const schema = parser.getOperationParametersSchema('listPets');
        expect(schema.type).toBe('object');
        expect(schema.properties.limit).toBeDefined();
        expect(schema.properties.limit.type).toBe('integer');
        expect(schema.properties.limit.description).toBe('How many items to return at one time (max 100)');
        expect(schema.required).toBeUndefined(); // limit is not required
    });

    it('should generate schema for operation with path parameters', () => {
        const schema = parser.getOperationParametersSchema('getPetById');
        expect(schema.properties.petId).toBeDefined();
        expect(schema.properties.petId.type).toBe('string');
        expect(schema.required).toEqual(['petId']);
    });

    it('should generate schema for operation with requestBody', () => {
        const schema = parser.getOperationParametersSchema('createPet');
        expect(schema.properties.requestBody).toBeDefined();
        expect(schema.properties.requestBody.type).toBe('object');
        expect(schema.properties.requestBody.properties.name.type).toBe('string');
        // Check if 'required' from requestBody itself is propagated
        const rawOp = (parser as any)._findRawOperationInSpec('createPet'); // Access private for test detail
        const rawRequestBody = (parser as any).resolveRef(rawOp.requestBody);
        if(rawRequestBody.required) {
            expect(schema.required).toContain('requestBody');
        } else {
            expect(schema.required).not.toContain('requestBody');
        }
    });
    
    it('should generate schema for operation with resolved $ref parameters', () => {
        const schema = parser.getOperationParametersSchema('getSharedData');
        expect(schema.type).toBe('object');
        expect(schema.properties['X-Common-Header']).toBeDefined();
        expect(schema.properties['X-Common-Header'].type).toBe('string');
        expect(schema.properties['X-Common-Header'].description).toBe('A common header parameter.');
    });

    it('should throw if operationId is not found', () => {
        expect(() => parser.getOperationParametersSchema('nonExistentOperation'))
            .toThrowError("Operation 'nonExistentOperation' not found or not within current filter scope (tag: none).");
    });
  });
});