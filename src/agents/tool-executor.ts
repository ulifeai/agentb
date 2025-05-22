// src/agents/tool-executor.ts

/**
* @file ToolExecutor - Responsible for executing tools based on parsed tool calls.
* It uses an IToolProvider to find and run the appropriate tools.
*/

import { IToolProvider, ITool, IToolResult } from '../core/tool';
import { LLMToolCall } from '../llm/types'; // Assuming LLMToolCall includes id, function.name, function.arguments (string)
import { ToolExecutorConfig } from './config';
import { ToolNotFoundError, ApplicationError, ValidationError } from '../core/errors';
import Ajv from 'ajv';
import { JSONSchema7 } from 'json-schema';

export class ToolExecutor {
  private toolProvider: IToolProvider;
  private config: ToolExecutorConfig;
  
  constructor(toolProvider: IToolProvider, config: ToolExecutorConfig = {}) {
    this.toolProvider = toolProvider;
    this.config = {
      executionStrategy: 'sequential', // Default
      ...config,
    };
  }
  
  /**
  * Executes a list of detected tool calls.
  *
  * @param parsedToolCalls An array of LLMToolCall objects from the LLMResponseProcessor.
  * @returns A Promise resolving to an array of IToolResult, maintaining the order of input calls.
  *          Each result will correspond to the input tool call, even if execution failed.
  */
  public async executeToolCalls(
    parsedToolCalls: LLMToolCall[]
  ): Promise<Array<{ toolCallId: string; toolName: string; result: IToolResult }>> {
    if (!parsedToolCalls || parsedToolCalls.length === 0) {
      return [];
    }
    
    if (this.config.executionStrategy === 'sequential') {
      const sequentialResults: Array<{ toolCallId: string; toolName: string; result: IToolResult }> = [];
      for (const toolCall of parsedToolCalls) {
        // Await each call directly for sequential execution
        const singleResult = await this.executeSingleToolCall(toolCall);
        sequentialResults.push(singleResult);
      }
      return sequentialResults;
    } else {
      // Parallel execution
      const executionPromises: Promise<{ toolCallId: string; toolName: string; result: IToolResult }>[] =
      parsedToolCalls.map(toolCall => this.executeSingleToolCall(toolCall));
      return Promise.all(executionPromises);
    }
  }

  // Helper function to resolve schema references
  private resolveSchema(schema: any, rootSchema: any): any {
    if (!schema || typeof schema !== 'object') return schema;
    
    // Handle direct $ref
    if (schema.$ref) {
      const refPath = schema.$ref;
      if (!refPath.startsWith('#')) {
        console.warn(`[ToolExecutor] External $ref not supported: ${refPath}`);
        return schema;
      }
      
      // Remove the leading # and split the path
      const path = refPath.slice(1);
      if (!path) {
        console.warn(`[ToolExecutor] Invalid $ref path: ${refPath}`);
        return schema;
      }
      
      const parts = path.split('/').filter(Boolean); // Filter out empty strings
      let resolvedItem: any = rootSchema;
      
      
      
      for (const part of parts) {
        const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
        if (resolvedItem && typeof resolvedItem === 'object' && decodedPart in resolvedItem) {
          resolvedItem = resolvedItem[decodedPart];
          console.log(`[ToolExecutor] Found part "${decodedPart}":`, JSON.stringify(resolvedItem, null, 2));
        } else {
          console.warn(`[ToolExecutor] Failed to resolve $ref "${refPath}": part "${decodedPart}" not found in path "${path}"`);
          console.log(`[ToolExecutor] Available keys in current level:`, Object.keys(resolvedItem || {}));
          return schema;
        }
      }
      
      return resolvedItem;
    }
    
    // Recursively resolve references in nested objects and arrays
    const resolved: any = Array.isArray(schema) ? [] : {};
    for (const key in schema) {
      resolved[key] = this.resolveSchema(schema[key], rootSchema);
    }
    return resolved;
  };
  
  /**
  * Executes a single tool call.
  * @param toolCall The LLMToolCall object.
  * @returns A Promise resolving to an object containing the toolCallId, toolName, and its IToolResult.
  */
  private async executeSingleToolCall(
    toolCall: LLMToolCall
  ): Promise<{ toolCallId: string; toolName: string; result: IToolResult }> {
    const toolName = toolCall.function.name;
    const toolCallId = toolCall.id;
    
    try {
      const tool = await this.toolProvider.getTool(toolName);
      if (!tool) {
        throw new ToolNotFoundError(toolName);
      }
      
      let args: Record<string, any>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        // Pass the original arguments string to the ValidationError for context
        throw new ValidationError(`Invalid JSON arguments for tool "${toolName}": ${(e as Error).message}`, {
          arguments: toolCall.function.arguments,
        });
      }

      // NEW VALIDATION BLOCK
      const toolDefinition = await tool.getDefinition();
      const validationErrors: string[] = [];
      
      for (const paramDef of toolDefinition.parameters) {
        const argValue = args[paramDef.name];
        
        if (paramDef.required && argValue === undefined) {
          validationErrors.push(`Missing required parameter: "${paramDef.name}".`);
          continue; // Skip further checks for this missing param
        }
        
        if (argValue !== undefined) {
          // Basic type check (can be expanded)
          const argType = typeof argValue;
          let expectedType = paramDef.type.toLowerCase();
          // Accommodate JSON schema types like 'integer' for 'number' typeof
          if (expectedType === 'integer') expectedType = 'number';
          if (expectedType === 'array' && !Array.isArray(argValue)) {
            validationErrors.push(`Parameter "${paramDef.name}" expected type array, got ${argType}.`);
          } else if (expectedType !== 'array' && expectedType !== 'object' && expectedType !== 'any' && argType !== expectedType) {
            validationErrors.push(`Parameter "${paramDef.name}" expected type ${paramDef.type}, got ${argType}.`);
          }
          // TODO: Implement JSON schema validation using a library like AJV if paramDef.schema is present
          if (paramDef.schema) {
            const ajv = new Ajv({
              allErrors: true,
              verbose: true,
              formats: {
                // Numeric formats
                float: true,
                double: true,
                int32: true,
                int64: true,
                byte: true,
                
                // String formats
                date: true,
                'date-time': true,
                time: true,
                duration: true,
                email: true,
                hostname: true,
                ipv4: true,
                ipv6: true,
                uri: true,
                'uri-reference': true,
                'uri-template': true,
                url: true,
                uuid: true,
                password: true,
                
                // Binary formats
                binary: true,
                base64: true,
                
                // Additional formats
                json: true,
                regex: true
              }
            });
            
            // Get the complete schema context from the tool definition
            const toolDefinition = await tool.getDefinition();
            
            // Get the OpenAPI spec from the tool if it's an OpenAPI tool
            let rootSchema = {
              components: {
                schemas: {}
              }
            };
            
            // Try to get schemas from the OpenAPI spec if available
            if ('getOpenAPISpec' in tool) {
              const spec = await (tool as any).getOpenAPISpec();
              if (spec?.components?.schemas) {
                rootSchema.components.schemas = spec.components.schemas;
              }
            }
            
            // Add all schemas to Ajv first
            if (rootSchema.components?.schemas) {
              Object.entries(rootSchema.components.schemas).forEach(([schemaId, schema]) => {
                // Register each schema with its full path as ID
                const schemaPath = `#/components/schemas/${schemaId}`;
                ajv.addSchema(schema as JSONSchema7, schemaPath);
              });
            }
            
            // Helper function to resolve schema references
            const resolveSchema = (schema: any, rootSchema: any): any => {
              if (!schema || typeof schema !== 'object') return schema;
              
              // Handle direct $ref
              if (schema.$ref) {
                const refPath = schema.$ref;
                if (!refPath.startsWith('#')) {
                  console.warn(`[ToolExecutor] External $ref not supported: ${refPath}`);
                  return schema;
                }
                
                // Remove the leading # and split the path
                const path = refPath.slice(1);
                if (!path) {
                  console.warn(`[ToolExecutor] Invalid $ref path: ${refPath}`);
                  return schema;
                }
                
                const parts = path.split('/').filter(Boolean); // Filter out empty strings
                let resolvedItem: any = rootSchema;
                
              
                
                for (const part of parts) {
                  const decodedPart = part.replace(/~1/g, '/').replace(/~0/g, '~');
                  if (resolvedItem && typeof resolvedItem === 'object' && decodedPart in resolvedItem) {
                    resolvedItem = resolvedItem[decodedPart];
                    console.log(`[ToolExecutor] Found part "${decodedPart}":`, JSON.stringify(resolvedItem, null, 2));
                  } else {
                    console.warn(`[ToolExecutor] Failed to resolve $ref "${refPath}": part "${decodedPart}" not found in path "${path}"`);
                    console.log(`[ToolExecutor] Available keys in current level:`, Object.keys(resolvedItem || {}));
                    return schema;
                  }
                }
                
                return resolvedItem;
              }
              
              // Recursively resolve references in nested objects and arrays
              const resolved: any = Array.isArray(schema) ? [] : {};
              for (const key in schema) {
                resolved[key] = resolveSchema(schema[key], rootSchema);
              }
              return resolved;
            };
            
            // Resolve any references in the schema
            const resolvedSchema = this.resolveSchema(paramDef.schema, rootSchema);
            
            // Add the resolved schema with a unique ID
            const schemaId = `requestBody_${paramDef.name}`;
            ajv.addSchema(resolvedSchema as JSONSchema7, schemaId);
            
            // Get the compiled schema by ID
            const validate = ajv.getSchema(schemaId);
            if (!validate) {
              throw new Error(`Failed to compile schema with ID: ${schemaId}`);
            }
            
            if (!validate(argValue)) {
              validationErrors.push(`Parameter "${paramDef.name}" failed schema validation: ${ajv.errorsText(validate.errors)}`);
            }
          }
        }
      }
      
      if (validationErrors.length > 0) {
        throw new ValidationError(
          `Validation failed for tool "${toolName}": ${validationErrors.join('; ')}`,
          undefined, // Or pass more structured validation details
          { arguments: toolCall.function.arguments, parsedArgs: args, errors: validationErrors }
        );
      }
      
      const result = await tool.execute(args);
      return { toolCallId, toolName, result };
    } catch (error: any) {
      console.error(`[ToolExecutor] Error executing tool "${toolName}" (ID: ${toolCallId}):`, error);
      
      let toolResultError: IToolResult;
      const errorMessage = error.message || 'Unknown error during tool execution.';
      
      // Ensure `errorName` and any specific `error.metadata` (like from ValidationError) are captured.
      // Assumes ToolNotFoundError, ValidationError, and ApplicationError all have a `name` property.
      // ApplicationError (and its potential subclasses like ValidationError if designed that way)
      // might also carry a `metadata` property.
      let resultMetadata: Record<string, any> | undefined = {};
      
      if (error.name) {
        resultMetadata.errorName = error.name;
      }
      
      // If the error instance has its own `metadata` property (e.g., ApplicationError or ValidationError), merge it.
      if (error.metadata && typeof error.metadata === 'object') {
        resultMetadata = { ...resultMetadata, ...error.metadata };
      }
      
      // Ensure metadata is undefined if it's empty, rather than an empty object.
      if (Object.keys(resultMetadata??{}).length === 0) {
        resultMetadata = undefined;
      }
      
      toolResultError = {
        success: false,
        data: null,
        error: errorMessage,
        metadata: resultMetadata,
      };
      
      return { toolCallId, toolName, result: toolResultError };
    }
  }
}