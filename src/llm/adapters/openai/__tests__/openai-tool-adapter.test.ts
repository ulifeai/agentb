
import { adaptToolDefinitionToOpenAI, adaptToolDefinitionsToOpenAI } from '../openai-tool-adapter';
import { IToolDefinition, IToolParameter } from '../../../../core/tool';
import { LLMProviderToolFormat } from '../../../types';

describe('OpenAI Tool Adapter', () => {
  describe('adaptToolDefinitionToOpenAI', () => {
    it('should convert a simple tool definition', () => {
      const toolDef: IToolDefinition = {
        name: 'get_weather',
        description: 'Get current weather for a location.',
        parameters: [
          { name: 'location', type: 'string', description: 'City and state, e.g. "San Francisco, CA"', required: true },
          { name: 'unit', type: 'string', description: 'Temperature unit', required: false, schema: { enum: ['celsius', 'fahrenheit'] } },
        ],
      };

      const adapted = adaptToolDefinitionToOpenAI(toolDef);

      expect(adapted.name).toBe('get_weather');
      expect(adapted.description).toBe('Get current weather for a location.');
      expect(adapted.parametersSchema.type).toBe('object');
      expect(adapted.parametersSchema.properties.location).toEqual({
        type: 'string',
        description: 'City and state, e.g. "San Francisco, CA"',
      });
      expect(adapted.parametersSchema.properties.unit).toEqual({
        type: 'string',
        description: 'Temperature unit',
        enum: ['celsius', 'fahrenheit'],
      });
      expect(adapted.parametersSchema.required).toEqual(['location']); // Sorted
    });

    it('should handle tool definition with no parameters', () => {
      const toolDef: IToolDefinition = {
        name: 'get_random_number',
        description: 'Generates a random number.',
        parameters: [],
      };
      const adapted = adaptToolDefinitionToOpenAI(toolDef);
      expect(adapted.name).toBe('get_random_number');
      expect(adapted.parametersSchema.properties).toEqual({});
      expect(adapted.parametersSchema.required).toBeUndefined();
    });

    it('should use parameter.schema if provided, merging description and type if not in schema', () => {
      const toolDef: IToolDefinition = {
        name: 'advanced_tool',
        description: 'An advanced tool.',
        parameters: [
          {
            name: 'config',
            type: 'object', // Fallback type
            description: 'Tool configuration object.', // Fallback description
            required: true,
            schema: {
              type: 'object',
              properties: { nested: { type: 'boolean', description: 'Nested property' } },
              required: ['nested'],
              // No top-level description here
            },
          },
           {
            name: 'simple_with_schema_desc',
            type: 'string',
            description: 'This description should be ignored.',
            required: false,
            schema: {
              type: 'string',
              description: 'Description from schema for simple_with_schema_desc.'
            }
          }
        ],
      };
      const adapted = adaptToolDefinitionToOpenAI(toolDef);
      expect(adapted.parametersSchema.properties.config).toEqual({
        type: 'object',
        description: 'Tool configuration object.', // Description from IToolParameter used as schema had no top-level one
        properties: { nested: { type: 'boolean', description: 'Nested property' } },
        required: ['nested'],
      });
      expect(adapted.parametersSchema.properties.simple_with_schema_desc).toEqual({
        type: 'string',
        description: 'Description from schema for simple_with_schema_desc.',
      });
    });

    it('should sanitize tool and parameter names and log warnings if changed', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const toolDef: IToolDefinition = {
        name: 'tool with spaces!',
        description: 'A tool.',
        parameters: [{ name: 'param with/slash', type: 'string', description: 'A param.', required: true }],
      };
      const adapted = adaptToolDefinitionToOpenAI(toolDef);
      expect(adapted.name).toBe('tool_with_spaces_');
      expect(Object.keys(adapted.parametersSchema.properties)[0]).toBe('param_with_slash');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Tool name "tool with spaces!" (sanitized: "tool_with_spaces_")'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Parameter name "param with/slash" (sanitized: "param_with_slash")'));
      consoleWarnSpy.mockRestore();
    });
    
    it('should default parameter type to string if not provided in IToolParameter or its schema', () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const toolDef: IToolDefinition = {
            name: 'type_test',
            description: 'Test type defaulting.',
            parameters: [
                // @ts-expect-error Testing missing type
                { name: 'no_type_param', description: 'No type specified', required: false }
            ]
        };
        const adapted = adaptToolDefinitionToOpenAI(toolDef);
        expect(adapted.parametersSchema.properties.no_type_param.type).toBe('string');
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Parameter \"no_type_param\" for tool \"type_test\" has no defined type. Defaulting to 'string'."));
        consoleWarnSpy.mockRestore();
    });
  });

  describe('adaptToolDefinitionsToOpenAI (plural)', () => {
    it('should correctly adapt an array of tool definitions', () => {
      const toolDef1: IToolDefinition = { name: 'tool1', description: 'First tool', parameters: [] };
      const toolDef2: IToolDefinition = { name: 'tool2', description: 'Second tool', parameters: [{ name: 'p1', type: 'number', description: 'P1', required: true }] };
      
      const adaptedArray = adaptToolDefinitionsToOpenAI([toolDef1, toolDef2]);
      
      expect(adaptedArray.length).toBe(2);
      expect(adaptedArray[0].name).toBe('tool1');
      expect(adaptedArray[1].name).toBe('tool2');
      expect(Object.keys(adaptedArray[1].parametersSchema.properties).length).toBe(1);
    });
  });
});