
/**
 * @file Entry point for the "agents" module.
 * This module provides core agent functionalities, including base agent implementations,
 * response processing, tool execution, context management, and related types and configurations.
 */

// --- Core Agent Interfaces and Types ---
export type {
  IAgent,
  IAgentContext,
  IAgentRun,
  AgentStatus,
  AgentEvent,
  // Specific Agent Event types can be exported if they are directly consumed
  // or if creating custom event handlers for specific event types is a common use case.
  // For example:
  // IAgentEventRunCreated,
  // IAgentEventMessageCreated,
  // IAgentEventToolExecutionCompleted,
  // IAgentEventRunRequiresAction,
  // IAgentEventRunCompleted,
  // IAgentEventRunFailed,
  IAgentRunStorage, // Exporting storage interface if managed externally or for testing
} from './types';

// --- Agent Configuration ---
export type { AgentRunConfig, ResponseProcessorConfig, ToolExecutorConfig } from './config';
export { DEFAULT_AGENT_RUN_CONFIG } from './config';

// --- Core Agent Components ---
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
export type { ParsedLLMResponseEvent } from './response-processor'; // Exporting the event type

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
// DEFAULT_CONTEXT_MANAGER_CONFIG is already in './context-manager.ts' and might be exported from there if needed globally.
// If ContextManagerConfig is defined in config.ts, it's already covered.

// Note: Specific agent implementations (if any beyond BaseAgent) would also be exported here.
// e.g., export { MyCustomResearchAgent } from './my-custom-research-agent';
