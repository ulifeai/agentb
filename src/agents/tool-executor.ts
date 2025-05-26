// src/agents/tool-executor.ts

/**
* @file ToolExecutor - Responsible for executing tools based on parsed tool calls.
* It uses an IToolProvider to find and run the appropriate tools.
*/

import { IToolProvider, ITool, IToolResult } from '../core/tool';
import { LLMToolCall } from '../llm/types';
import { ToolExecutorConfig } from './config';
import { ToolNotFoundError, ApplicationError, ValidationError } from '../core/errors';
import Ajv, { AnySchemaObject, Options as AjvOptions, ErrorObject } from 'ajv';
const addFormats = require('ajv-formats');
import { JSONSchema7 } from 'json-schema';
import { IAgentContext } from './types';

// Add OpenAPI types
interface OpenAPISpec {
  components?: {
    schemas?: Record<string, SchemaWithId>;
  };
  [key: string]: any;
}

interface SchemaWithId extends JSONSchema7 {
  $id?: string;
  $anchor?: string;
  properties?: Record<string, SchemaWithId>;
  items?: SchemaWithId | SchemaWithId[];
  allOf?: SchemaWithId[];
  anyOf?: SchemaWithId[];
  oneOf?: SchemaWithId[];
  $ref?: string;
  [key: string]: any;
}

interface ToolWithOpenAPI extends ITool {
  getOpenAPISpec?(): Promise<OpenAPISpec>;
}

interface SchemaRegistryEntry {
  schema: SchemaWithId;
  primaryId: string;
  name: string;
  aliases: string[];
}

interface IToolDefinitionParameter {
  name: string;
  type: string;
  required?: boolean;
  description?: string; 
  schema?: SchemaWithId | string; 
}

export class ToolExecutor {
  private toolProvider: IToolProvider;
  private config: ToolExecutorConfig;
  private agentContext?: IAgentContext;
  
  constructor(toolProvider: IToolProvider, config: ToolExecutorConfig = {}, agentContext?: IAgentContext) {
    this.toolProvider = toolProvider;
    this.config = {
      executionStrategy: 'sequential',
      ...config,
    };
    this.agentContext = agentContext;
  }
  
  public async executeToolCalls(
    parsedToolCalls: LLMToolCall[],
    agentContextOverride?: IAgentContext
  ): Promise<Array<{ toolCallId: string; toolName: string; result: IToolResult }>> {
    if (!parsedToolCalls || parsedToolCalls.length === 0) {
      return [];
    }
    
    const contextForExecution = agentContextOverride || this.agentContext;

    if (this.config.executionStrategy === 'sequential') {
      const sequentialResults: Array<{ toolCallId:string; toolName: string; result: IToolResult }> = [];
      for (const toolCall of parsedToolCalls) {
        const singleResult = await this.executeSingleToolCall(toolCall, contextForExecution);
        sequentialResults.push(singleResult);
      }
      return sequentialResults;
    } else {
      const executionPromises: Promise<{ toolCallId: string; toolName: string; result: IToolResult }>[] =
      parsedToolCalls.map(toolCall => this.executeSingleToolCall(toolCall, contextForExecution));
      return Promise.all(executionPromises);
    }
  }
  
  private async executeSingleToolCall(
    toolCall: LLMToolCall,
    agentContext?: IAgentContext
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
        throw new ValidationError(`Invalid JSON arguments for tool "${toolName}": ${(e as Error).message}`, 
          { argumentsString: toolCall.function.arguments, error: (e as Error).message },
          { toolName }
        );
      }

      const toolDefinition = await tool.getDefinition();
      const validationErrors: string[] = [];
      
      const ajv = new Ajv({
        allErrors: true,
        verbose: true,
        strict: false, 
        allowUnionTypes: true, 
        loadSchema: async (uri: string) => {
          console.warn(`[ToolExecutor:AJV] AJV loadSchema called for: ${uri}. This implies resolveSchema failed to inline a reference.`);
          throw new Error(`AJV loadSchema fallback for URI: ${uri}. This indicates a failure in custom resolver or a true external ref not handled by it.`);
        },
      } as AjvOptions);
      addFormats(ajv);

      const schemaRegistry = new Map<string, SchemaRegistryEntry>();
      
      let openApiSpec: OpenAPISpec = {};
      if (tool && 'getOpenAPISpec' in tool && typeof tool.getOpenAPISpec === 'function') {
        openApiSpec = await (tool as ToolWithOpenAPI).getOpenAPISpec!();
      }

      if (openApiSpec.components?.schemas) {
        for (const [schemaName, schemaObj] of Object.entries(openApiSpec.components.schemas)) {
          if (!schemaObj || typeof schemaObj !== 'object') continue;
          const primaryId = schemaObj.$id || `#/components/schemas/${schemaName}`;
          const aliases: string[] = [primaryId];
          const pathBasedId = `#/components/schemas/${schemaName}`;
          if (schemaObj.$id && schemaObj.$id !== pathBasedId && !aliases.includes(schemaObj.$id)) {
            aliases.push(schemaObj.$id);
          }
          if (pathBasedId !== primaryId && !aliases.includes(pathBasedId)) {
            aliases.push(pathBasedId);
          }
          if(!aliases.includes(primaryId)) aliases.unshift(primaryId);

          const uniqueAliases = [...new Set(aliases)];
          if (schemaRegistry.has(primaryId) && schemaRegistry.get(primaryId)?.name !== schemaName) {
            console.warn(`[Schema Registry] Conflict for primary ID ${primaryId}. Original: ${schemaRegistry.get(primaryId)?.name}, New: ${schemaName}. Using first one registered.`);
            continue;
          }
          schemaRegistry.set(primaryId, { schema: schemaObj, primaryId, name: schemaName, aliases: uniqueAliases });
        }
      }
      
      let findAnchorInSchema: (
        schemaToSearch: SchemaWithId,
        targetAnchor: string,
        visitedAnchors?: Set<SchemaWithId>
      ) => SchemaWithId | null;
      findAnchorInSchema = (
        schemaToSearch: SchemaWithId,
        targetAnchor: string,
        visitedAnchors = new Set<SchemaWithId>()
      ): SchemaWithId | null => {
        if (!schemaToSearch || typeof schemaToSearch !== 'object' || visitedAnchors.has(schemaToSearch)) return null;
        visitedAnchors.add(schemaToSearch);
        if (schemaToSearch.$anchor === targetAnchor) return schemaToSearch;
        for (const key of ['properties', 'items', 'allOf', 'anyOf', 'oneOf', 'definitions', '$defs']) {
            const subSchemaOrArray = schemaToSearch[key as keyof SchemaWithId];
            if (subSchemaOrArray) {
                const schemasToCheck: SchemaWithId[] = [];
                if (Array.isArray(subSchemaOrArray)) schemasToCheck.push(...(subSchemaOrArray.filter(s => typeof s === 'object' && s !== null) as SchemaWithId[]));
                else if (typeof subSchemaOrArray === 'object' && subSchemaOrArray !== null) {
                    if (key === 'properties' || key === 'definitions' || key === '$defs') schemasToCheck.push(...(Object.values(subSchemaOrArray).filter(s => typeof s === 'object' && s !== null) as SchemaWithId[]));
                    else schemasToCheck.push(subSchemaOrArray as SchemaWithId);
                }
                for (const item of schemasToCheck) {
                    const found = findAnchorInSchema(item, targetAnchor, new Set(visitedAnchors));
                    if (found) return found;
                }
            }
        }
        return null;
      };
      
      const resolveSchema = (currentSchema: SchemaWithId, resolutionPath: string[], visited = new Set<string>()): SchemaWithId => {
        const currentPathKey = resolutionPath.join('/');
        if (!currentSchema || typeof currentSchema !== 'object') return currentSchema;
        
        let cycleKey = JSON.stringify(currentSchema); 
        if (currentSchema.$id && (currentSchema.$id.includes(':') || currentSchema.$id.startsWith('#/'))) {
            cycleKey = currentSchema.$id;
        }

        if (visited.has(cycleKey)) {
          return { type: 'object', description: `Circular ref placeholder for ${cycleKey.substring(0,100)}` } as SchemaWithId;
        }
        visited.add(cycleKey);

        let schemaToProcess = currentSchema;

        if (currentSchema.$ref) {
            const refPath = currentSchema.$ref;
            let baseUri = refPath; 
            let anchorPart: string | undefined = undefined;
            const poundIndex = refPath.indexOf('#');
        
            if (poundIndex !== -1) { 
                anchorPart = refPath.substring(poundIndex + 1);
                baseUri = refPath.substring(0, poundIndex); 
                if (baseUri === '') { 
                    if (refPath.startsWith('#/')) { 
                        baseUri = refPath; 
                        anchorPart = undefined; 
                    } else { 
                        baseUri = currentSchema.$id || '#'; 
                    }
                }
            }
        
            let foundEntry: SchemaRegistryEntry | undefined;
            for (const entry of schemaRegistry.values()) {
                if (entry.primaryId === baseUri || entry.aliases.includes(baseUri)) {
                    foundEntry = entry;
                    break;
                }
            }
            
            if (foundEntry) {
                let resolvedBase = resolveSchema(foundEntry.schema, [...resolutionPath, `$ref(${foundEntry.name})`], new Set(visited));
        
                if (anchorPart) {
                    const anchoredSchema = findAnchorInSchema(resolvedBase, anchorPart, new Set());
                    if (anchoredSchema) {
                         resolvedBase = anchoredSchema; // resolvedBase is now the specific fragment pointed to by anchor
                    } else {
                        console.warn(`[Schema Resolution Ref DEBUG] Path: ${currentPathKey}, Could not find $anchor: "${anchorPart}" in schema from "${foundEntry.name}".`);
                        resolvedBase = { type: 'object', additionalProperties: true, description: `Failed to resolve anchor ${anchorPart}` } as SchemaWithId;
                    }
                }
                
                const { $ref, ...siblingKeywords } = currentSchema; 
                
                // When inlining, strip original $id and $anchor from the resolvedBase content,
                // as this new schema fragment is anonymous in its new context.
                const { $id: _resolvedBaseId, $anchor: _resolvedBaseAnchor, ...resolvedBaseWithoutIdOrAnchor } = resolvedBase;
                schemaToProcess = { ...resolvedBaseWithoutIdOrAnchor, ...siblingKeywords };
                
            } else {
                console.warn(`[Schema Resolution Ref DEBUG] Path: ${currentPathKey}, Could NOT resolve $ref with baseUri "${baseUri}" (from original ref "${refPath}") in schema registry. This ref will remain for AJV to handle.`);
                // schemaToProcess remains currentSchema (which contains the $ref for AJV's loadSchema)
            }
        }

        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(schemaToProcess)) {
          if (key === '$ref' && schemaToProcess === currentSchema && currentSchema.$ref) { 
            result[key] = value; 
          } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
              result[key] = value.map((item, index) => (typeof item === 'object' ? resolveSchema(item as SchemaWithId, [...resolutionPath, key, String(index)], new Set(visited)) : item));
            } else {
              result[key] = resolveSchema(value as SchemaWithId, [...resolutionPath, key], new Set(visited));
            }
          } else {
            result[key] = value;
          }
        }
        
        visited.delete(cycleKey);
        return result as SchemaWithId;
      };

      for (const paramDef of toolDefinition.parameters as IToolDefinitionParameter[]) {
        const argValue = args[paramDef.name];
        
        if (paramDef.required && argValue === undefined) {
          validationErrors.push(`Missing required parameter: "${paramDef.name}".`);
          continue;
        }
        
        if (argValue !== undefined && paramDef.schema) {
          try {
            const paramSchemaObject = (typeof paramDef.schema === 'string' ? JSON.parse(paramDef.schema) : paramDef.schema) as SchemaWithId;
            const fullyResolvedSchema = resolveSchema(paramSchemaObject, [paramDef.name]);

            // Check for any remaining $ref keywords (should ideally be none for local/component refs)
            const checkRemainingRefs = (schema: any, path: string[] = []): void => {
                if (!schema || typeof schema !== 'object') return;
                if (schema.$ref) {
                    console.warn(`[Validation WARNING] Unresolved "$ref: ${schema.$ref}" found at path "${path.join('/')}" in fullyResolvedSchema for param "${paramDef.name}".`);
                }
                for (const [key, value] of Object.entries(schema)) {
                    if (typeof value === 'object') {
                        checkRemainingRefs(value, [...path, key]);
                    }
                }
            };
            if(paramDef.name === "requestBody") { // Only log for the problematic one for now
                checkRemainingRefs(fullyResolvedSchema);
            }

            const validate = ajv.compile(fullyResolvedSchema as AnySchemaObject);
            
            if (!validate(argValue)) {
              const errorDetails = validate.errors?.map((err: ErrorObject) => {
                return `${err.instancePath || 'root'} ${err.message} (schema path: ${err.schemaPath})`;
              }).join('; ') || 'Unknown validation error.';
              validationErrors.push(`Parameter "${paramDef.name}" failed schema validation: ${errorDetails}`);
            }
          } catch (error: unknown) {
            console.error(`[Validation] Error during schema compilation or validation for parameter "${paramDef.name}":`, error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            validationErrors.push(`Parameter "${paramDef.name}" schema processing failed: ${errorMessage}`);
          }
        }
      }
      
      if (validationErrors.length > 0) {
        throw new ValidationError(
          `Validation failed for tool "${toolName}": ${validationErrors.join(' ')}`,
          { errors: validationErrors },
          { arguments: toolCall.function.arguments, parsedArgs: args, toolName }
        );
      }

      const result = await tool.execute(args, agentContext);
      
      return { toolCallId, toolName, result };

    } catch (error: any) {
      let toolResultError: IToolResult;
      const errorMessage = error.message || 'Unknown error during tool execution.';
      let resultMetadata: Record<string, any> | undefined = {};
      if (error.name) resultMetadata.errorName = error.name;
      if (error.metadata && typeof error.metadata === 'object') {
        resultMetadata = { ...resultMetadata, ...error.metadata };
      }
      toolResultError = { 
        success: false, 
        data: null, 
        error: errorMessage, 
        metadata: resultMetadata && Object.keys(resultMetadata).length > 0 ? resultMetadata : undefined 
      };
      return { toolCallId, toolName, result: toolResultError };
    }
  }
}