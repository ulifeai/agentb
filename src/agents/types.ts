// src/agents/types.ts

/**
 * @file Defines core types and interfaces for agent functionality,
 *       including agent runs, status, events, and context.
 */

import { IMessage, IMessageStorage } from '../threads/types';
import { IToolProvider, IToolResult } from '../core/tool';
import { ILLMClient, LLMMessage, LLMToolCall } from '../llm/types';
import { AgentRunConfig } from './config';
import { LLMResponseProcessor } from './response-processor';
import { ToolExecutor } from './tool-executor';
import { ContextManager } from './context-manager';

// AgentStatus, IAgentEventBase, Specific AgentEvent types, AgentEvent union type, IAgentRun remain the same as previously defined.
// ... (Keep existing AgentStatus, IAgentEventBase, all specific IAgentEvent... interfaces, and AgentEvent union type) ...

/**
 * Represents the status of an agent run.
 */
export type AgentStatus =
  | 'queued' // Run is waiting to be processed.
  | 'in_progress' // Run is actively being processed by the agent.
  | 'requires_action' // Run is paused, awaiting action (e.g., tool submission, user input).
  | 'cancelling' // Run is in the process of being cancelled.
  | 'cancelled' // Run was successfully cancelled.
  | 'failed' // Run encountered an error and could not complete.
  | 'completed' // Run finished all its steps successfully.
  | 'expired'; // Run timed out or was otherwise administratively expired.

/**
 * Base interface for events emitted by an agent during its run.
 */
export interface IAgentEventBase {
  type: string;
  timestamp: Date;
  runId: string;
  threadId: string;
}

export interface IAgentEventRunCreated extends IAgentEventBase {
  type: 'agent.run.created';
  data: { status: 'queued' | 'in_progress'; initialMessages?: LLMMessage[] }; // Changed to LLMMessage
}
export interface IAgentEventRunStepCreated extends IAgentEventBase {
  type: 'agent.run.step.created';
  data: { stepId: string; details?: any };
}
export interface IAgentEventMessageCreated extends IAgentEventBase {
  type: 'thread.message.created';
  data: { message: IMessage }; // IMessage from storage
}
export interface IAgentEventMessageDelta extends IAgentEventBase {
  type: 'thread.message.delta';
  data: { messageId: string; delta: { contentChunk?: string; toolCallsChunk?: LLMToolCall[] } }; // More structured delta
}
export interface IAgentEventMessageCompleted extends IAgentEventBase {
  type: 'thread.message.completed';
  data: { message: IMessage }; // IMessage from storage
}
export interface IAgentEventToolCallCreated extends IAgentEventBase {
  type: 'thread.run.step.tool_call.created'; // LLM decided to make a call
  data: { stepId: string; toolCall: LLMToolCall };
}
// IAgentEventToolCallDelta removed for now, assuming tool calls are processed once fully formed by LLMResponseProcessor
export interface IAgentEventToolCallCompletedByLLM extends IAgentEventBase {
  type: 'thread.run.step.tool_call.completed_by_llm'; // LLM finished generating the tool call details
  data: { stepId: string; toolCall: LLMToolCall };
}
export interface IAgentEventToolExecutionStarted extends IAgentEventBase {
  type: 'agent.tool.execution.started';
  data: { stepId: string; toolCallId: string; toolName: string; input: Record<string, any> };
}
export interface IAgentEventToolExecutionCompleted extends IAgentEventBase {
  type: 'agent.tool.execution.completed';
  data: { stepId: string; toolCallId: string; toolName: string; result: IToolResult };
}
export interface IAgentEventRunRequiresAction extends IAgentEventBase {
  type: 'thread.run.requires_action';
  data: {
    status: 'requires_action';
    required_action: {
      type: 'submit_tool_outputs';
      submit_tool_outputs: { tool_calls: LLMToolCall[] };
    };
  };
}
export interface IAgentEventRunStatusChanged extends IAgentEventBase {
  type: 'agent.run.status.changed';
  data: { previousStatus?: AgentStatus; currentStatus: AgentStatus; details?: string };
}
export interface IAgentEventRunFailed extends IAgentEventBase {
  type: 'thread.run.failed';
  data: { status: 'failed'; error: { code: string; message: string; details?: any } };
}
export interface IAgentEventRunCompleted extends IAgentEventBase {
  type: 'thread.run.completed';
  data: { status: 'completed'; finalMessages?: IMessage[] }; // IMessage from storage
}

export interface IAgentEventSubAgentInvocationStarted extends IAgentEventBase {
  type: 'agent.sub_agent.invocation.started';
  data: {
    plannerStepId: string; // Step ID of the planning agent that decided to delegate
    toolCallId: string; // ID of the DelegateToSpecialistTool call
    specialistId: string;
    subTaskDescription: string;
    subAgentRunId: string; // The runId of the specialist sub-agent
  };
}

export interface IAgentEventSubAgentInvocationCompleted extends IAgentEventBase {
  type: 'agent.sub_agent.invocation.completed';
  data: {
    plannerStepId: string;
    toolCallId: string;
    specialistId: string;
    subAgentRunId: string;
    result: IToolResult; // The final result from the DelegateToSpecialistTool
    // Optionally include a summary of key events from the sub-agent if desired
    // subAgentEventsSummary?: Pick<AgentEvent, 'type' | 'data'>[];
  };
}

export type AgentEvent =
  | IAgentEventRunCreated
  | IAgentEventRunStepCreated
  | IAgentEventMessageCreated
  | IAgentEventMessageDelta
  | IAgentEventMessageCompleted
  | IAgentEventToolCallCreated
  | IAgentEventToolCallCompletedByLLM
  | IAgentEventToolExecutionStarted
  | IAgentEventToolExecutionCompleted
  | IAgentEventRunRequiresAction
  | IAgentEventRunStatusChanged
  | IAgentEventRunFailed
  | IAgentEventRunCompleted
  | IAgentEventSubAgentInvocationStarted
  | IAgentEventSubAgentInvocationCompleted;

/**
 * Represents a single run of an agent on a thread.
 * (Keep existing IAgentRun definition)
 */
export interface IAgentRun {
  id: string;
  threadId: string;
  agentType: string;
  status: AgentStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  lastError?: { code: string; message: string };
  config: AgentRunConfig; // Changed to structured AgentRunConfig
  metadata?: Record<string, any>;
}

/**
 * Represents the context available to an agent during its execution.
 * This object bundles all necessary services and configurations that an agent
 * might need to perform its tasks. It promotes dependency injection and testability.
 */
export interface IAgentContext {
  /** The LLM client for making calls to language models. */
  readonly llmClient: ILLMClient;
  /** The provider for accessing available tools. */
  readonly toolProvider: IToolProvider;
  /** The storage adapter for persisting and retrieving messages. */
  readonly messageStorage: IMessageStorage;
  // Removed IThreadStorage for now from direct agent context, agent primarily works with messages of a given thread.
  // Thread-level operations might be handled by the service calling the agent.

  /** The processor for parsing LLM responses. */
  readonly responseProcessor: LLMResponseProcessor;
  /** The executor for running tools. */
  readonly toolExecutor: ToolExecutor;
  /** The manager for handling conversation context window and summarization. */
  readonly contextManager: ContextManager;

  /** The specific configuration for the current agent run. */
  readonly runConfig: AgentRunConfig; // The resolved config for this run
  /** The ID of the current agent run. */
  readonly runId: string;
  /** The ID of the thread the agent is operating on. */
  readonly threadId: string;
}

/**
 * Interface for an executable agent.
 */
export interface IAgent {
  /**
   * Executes the agent's logic for a given set of initial messages in a thread,
   * using the provided agent context.
   *
   * @param agentContext The context providing access to services and configurations for this run.
   * @param initialTurnMessages Messages to start this turn with (e.g., new user input, or tool results from a previous step).
   * @returns An AsyncGenerator yielding `AgentEvent`s, allowing for real-time updates on the agent's progress.
   */
  run(agentContext: IAgentContext, initialTurnMessages: LLMMessage[]): AsyncGenerator<AgentEvent, void, undefined>;

  /**
   * Handles the submission of tool outputs when an agent run is in a 'requires_action' state.
   * This method would typically format the outputs, add them to the message history,
   * and then resume the agent's execution loop by calling the LLM again.
   *
   * @param agentContext The context for the current agent run.
   * @param toolCallOutputs An array of objects, each containing the `tool_call_id` and the `output` (as a string) from a tool execution.
   * @returns An AsyncGenerator yielding `AgentEvent`s as the run continues.
   */
  submitToolOutputs?(
    agentContext: IAgentContext,
    toolCallOutputs: Array<{ tool_call_id: string; output: string }>
  ): AsyncGenerator<AgentEvent, void, undefined>;

  /**
   * Initiates the cancellation of an ongoing agent run.
   * Implementation should gracefully stop the agent's processing.
   *
   * @param agentContext The context for the agent run to be cancelled.
   * @returns A Promise resolving when the cancellation process has been acknowledged or completed.
   */
  cancelRun?(agentContext: IAgentContext): Promise<void>;
}

/**
 * Interface for storing and managing agent run state.
 */
export interface IAgentRunStorage {
  createRun(runData: Omit<IAgentRun, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<IAgentRun>;
  getRun(runId: string): Promise<IAgentRun | null>;
  updateRun(
    runId: string,
    updates: Partial<Omit<IAgentRun, 'id' | 'threadId' | 'createdAt' | 'agentType'>>
  ): Promise<IAgentRun>;
  // listRuns, deleteRun, etc. could also be added.
}
