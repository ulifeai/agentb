// src/agents/config.ts

/**
 * @file Defines configuration structures for agents and their response processing.
 */

import { LLMToolChoice } from '../llm/types';

/**
 * Configuration for the LLMResponseProcessor, determining how LLM responses
 * containing potential tool calls are parsed and handled.
 */
export interface ResponseProcessorConfig {
  /**
   * Whether to detect and parse tool calls formatted using OpenAI's native
   * function calling / tool usage structure.
   * @default true
   */
  enableNativeToolCalling?: boolean;

  /**
   * Whether to detect and parse tool calls formatted using a custom XML-like syntax.
   * (e.g., <tool_name param="value">content</tool_name>)
   * This would require specific parsing logic in the LLMResponseProcessor.
   * @default false
   */
  enableXmlToolCalling?: boolean;

  /**
   * Maximum number of XML tool calls to process in a single LLM response,
   * if XML tool calling is enabled. 0 means no limit.
   * @default 0
   */
  maxXmlToolCalls?: number;
}

/**
 * Configuration for the ToolExecutor, determining how detected tool calls
 * are executed.
 */
export interface ToolExecutorConfig {
  /**
   * Strategy for executing multiple tool calls detected in a single LLM response.
   * - 'sequential': Execute tools one after another, awaiting each one.
   * - 'parallel': Execute all tools concurrently using Promise.all.
   * @default 'sequential'
   */
  executionStrategy?: 'sequential' | 'parallel';
}

/**
 * General configuration for an agent run.
 * This typically includes LLM parameters and processing options.
 */
export interface AgentRunConfig {
  /** The identifier of the LLM model to be used for this run. */
  model: string;

  /**
   * Sampling temperature for the LLM.
   * Higher values (e.g., 0.8) make output more random, lower values (e.g., 0.2) make it more deterministic.
   * @default 0.7 (or provider's default)
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate in the LLM's response.
   * @default (provider's default)
   */
  maxTokens?: number;

  /**
   * Controls how the LLM should choose to use tools, if any are provided.
   * @default 'auto'
   */
  toolChoice?: LLMToolChoice;

  /**
   * Maximum number of consecutive LLM turns involving tool calls before the agent
   * might pause or require intervention. Helps prevent infinite loops.
   * A value of 0 might disable auto-continuation after tool calls.
   * @default 5
   */
  maxToolCallContinuations?: number;

  /**
   * Configuration for how the agent's response processor should behave.
   */
  responseProcessorConfig?: ResponseProcessorConfig;

  /**
   * Configuration for how the agent's tool executor should behave.
   */
  toolExecutorConfig?: ToolExecutorConfig;

  /**
   * Optional system prompt to guide the agent's behavior for this specific run.
   * If not provided, a default system prompt might be used by the agent.
   */
  systemPrompt?: string;

  /**
   * Whether to enable context management features like automatic summarization
   * if the conversation history exceeds a token threshold.
   * @default true
   */
  enableContextManagement?: boolean;

  /**
   * Any other model-specific or custom parameters for the agent run.
   */
  [key: string]: any;
}

/**
 * Default configuration values for an agent run.
 * Can be overridden by specific agent implementations or at runtime.
 */
export const DEFAULT_AGENT_RUN_CONFIG: Partial<AgentRunConfig> = {
  temperature: 0.7,
  toolChoice: 'auto',
  maxToolCallContinuations: 5,
  responseProcessorConfig: {
    enableNativeToolCalling: true,
    enableXmlToolCalling: false,
    maxXmlToolCalls: 0,
  },
  toolExecutorConfig: {
    executionStrategy: 'sequential',
  },
  enableContextManagement: true,
};
