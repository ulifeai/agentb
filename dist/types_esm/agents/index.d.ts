/**
 * @file Entry point for the "agents" module.
 * This module provides core agent functionalities, including base agent implementations,
 * response processing, tool execution, context management, and related types and configurations.
 */
export type { IAgent, IAgentContext, IAgentRun, AgentStatus, AgentEvent, IAgentRunStorage, } from './types';
export type { AgentRunConfig, ResponseProcessorConfig, ToolExecutorConfig } from './config';
export { DEFAULT_AGENT_RUN_CONFIG } from './config';
/**
 * BaseAgent provides a standard, extendable implementation of the IAgent interface.
 * It orchestrates the primary agent loop, including LLM interaction, tool usage,
 * and context management through injected services.
 */
export { BaseAgent } from './base-agent';
/**
 * LLMResponseProcessor is responsible for parsing raw LLM output (streaming or complete)
 * into structured events, such as text chunks and detected tool call requests.
 */
export { LLMResponseProcessor } from './response-processor';
export type { ParsedLLMResponseEvent } from './response-processor';
/**
 * ToolExecutor handles the execution of tools based on parsed tool calls from the
 * LLMResponseProcessor. It uses an IToolProvider to find and run the tools.
 */
export { ToolExecutor } from './tool-executor';
/**
 * ContextManager is responsible for managing the conversation context window,
 * including token counting and triggering summarization when necessary to
 * stay within LLM limits.
 */
export { ContextManager } from './context-manager';
