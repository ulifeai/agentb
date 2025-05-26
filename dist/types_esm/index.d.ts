/**
 * @file Entry point for the AI Agent and Tooling Framework.
 * This file exports the primary classes, interfaces, types, and utility functions
 * that applications will consume to build and interact with agents.
 */
export type { ITool, IToolDefinition, IToolParameter, IToolProvider, IToolSet, IToolResult } from './core/tool';
export { sanitizeIdForLLM } from './core/utils';
export { ApplicationError, ToolNotFoundError, LLMError, ConfigurationError, InvalidStateError, StorageError, ValidationError, } from './core/errors';
export { OpenAPIConnector } from './openapi/connector';
export type { OpenAPIConnectorOptions } from './openapi/connector';
export { OpenAPISpecParser } from './openapi/spec-parser';
export { GenericHttpApiTool, GENERIC_HTTP_TOOL_NAME, IGenericHttpToolInput } from './openapi/tools/generic-http-tool';
export type { OpenAPISpec, OpenAPIServer, OpenAPIParameter as OpenAPISpecParameter, OpenAPIRequestBody, OpenAPIResponse, RawOpenAPIOperation, OpenAPIPathItem, OpenAPIPaths, OpenAPIComponents, ConnectorOperation, BearerTokenAuth, ApiKeyAuth, NoAuth, ConnectorAuthentication, BaseOpenAPIConnectorOptions, } from './openapi/types';
export { fetchSpec, headersToObject } from './openapi/utils';
export type { ILLMClient, LLMMessage, LLMMessageRole, LLMToolCall, LLMMessageChunk, LLMToolChoice, LLMToolFunctionDefinition, } from './llm/types';
export { OpenAIAdapter } from './llm/adapters/openai/openai-adapter';
export type { OpenAIAdapterOptions } from './llm/adapters/openai/openai-adapter';
export { adaptToolDefinitionsToOpenAI, adaptToolDefinitionsToOpenAI as formatToolsForOpenAI, } from './llm/adapters/openai/openai-tool-adapter';
export { GENERIC_HTTP_TOOL_NAME as LLM_GENERIC_HTTP_TOOL_NAME_CONST, ROUTER_TOOL_NAME as LLM_ROUTER_TOOL_NAME_CONST, generateToolsSystemPrompt, generateGenericHttpToolSystemPrompt, generateRouterSystemPrompt, } from './llm/prompt-builder';
export type { IMessage, IThread, IMessageStorage, IThreadStorage, IMessageQueryOptions } from './threads/types';
export { createMessageObject, mapLLMMessageToIMessagePartial, mapIMessageToLLMMessage } from './threads/message';
export { createThreadObject } from './threads/thread';
export { MemoryStorage } from './threads/storage/memory-storage';
export type { IAgent, IAgentContext, IAgentRun, AgentStatus, AgentEvent, IAgentEventRunCreated, IAgentEventMessageCreated, IAgentEventMessageDelta, IAgentEventMessageCompleted, IAgentEventToolCallCreated, IAgentEventToolCallCompletedByLLM, IAgentEventToolExecutionStarted, IAgentEventToolExecutionCompleted, IAgentEventRunRequiresAction, IAgentEventRunStatusChanged, IAgentEventRunFailed, IAgentEventRunCompleted, IAgentEventSubAgentInvocationStarted, // Event for sub-agent delegation
IAgentEventSubAgentInvocationCompleted, // Event for sub-agent delegation
IAgentRunStorage, } from './agents/types';
export type { AgentRunConfig, ResponseProcessorConfig, ToolExecutorConfig, } from './agents/config';
export { DEFAULT_AGENT_RUN_CONFIG } from './agents/config';
export { BaseAgent } from './agents/base-agent';
export { PlanningAgent, DEFAULT_PLANNER_SYSTEM_PROMPT } from './agents/planning-agent';
export { LLMResponseProcessor } from './agents/response-processor';
export type { ParsedLLMResponseEvent } from './agents/response-processor';
export { ToolExecutor } from './agents/tool-executor';
export { ContextManager } from './agents/context-manager';
export type { ContextManagerConfig } from './agents/context-manager';
export { DEFAULT_CONTEXT_MANAGER_CONFIG } from './agents/context-manager';
export { DelegateToSpecialistTool } from './tools/core/delegate-to-specialist-tool';
export type { DelegateToolDependencies } from './tools/core/delegate-to-specialist-tool';
export { ToolsetOrchestrator } from './managers/toolset-orchestrator';
export type { ToolProviderSourceConfig } from './managers/toolset-orchestrator';
export { ApiInteractionManager } from './managers/api-interaction-manager';
export type { ApiInteractionManagerOptions, ApiInteractionMode } from './managers/api-interaction-manager';
