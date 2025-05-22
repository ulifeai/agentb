// src/agents/base-agent.ts

/**
* @file BaseAgent - Provides a foundational class for creating agents.
* It outlines the main execution loop and uses an IAgentContext for dependencies,
* including LLM interaction, tool execution, message storage, and context management.
*/

import { IAgent, IAgentContext, AgentEvent } from './types';
import { IToolResult } from '../core/tool';
import { ILLMClient, LLMMessage, LLMMessageChunk, LLMToolCall } from '../llm/types';
// adaptToolDefinitionsToOpenAI is specific. We'll use llmClient.formatToolsForProvider.
// import { adaptToolDefinitionsToOpenAI, LLMProviderToolFormat } from '../llm/adapters/openai/openai-tool-adapter';
import { ApplicationError, ToolNotFoundError, LLMError, ConfigurationError } from '../core/errors';
import { v4 as uuidv4 } from 'uuid';
import { mapLLMMessageToIMessagePartial } from '../threads/message';

/**
* BaseAgent provides a standard implementation of the IAgent interface.
* It orchestrates the interaction between the LLM, tools, and conversation history.
* Concrete agent types can extend this class or implement IAgent directly.
*/
export class BaseAgent implements IAgent {
  /**
  * Flag to indicate if a cancellation request has been received for the current run.
  * This is managed per `run` invocation.
  */
  private isCancelledThisRun: boolean = false;
  
  constructor() {
    // Constructor is minimal; dependencies are provided via IAgentContext during `run`.
  }
  
  /**
  * Executes the main agent loop.
  * This involves preparing messages, calling the LLM, processing the response,
  * executing tools if requested, and managing the conversation state.
  *
  * @param agentContext The context providing all necessary services and configurations for this run.
  * @param initialTurnMessages Messages that initiate this turn of the agent's execution
  *                            (e.g., new user input, or tool results from a previous `requires_action` state).
  * @yields {AgentEvent} Events that describe the agent's progress and state changes.
  */
  public async *run(
    agentContext: IAgentContext,
    initialTurnMessages: LLMMessage[]
  ): AsyncGenerator<AgentEvent, void, undefined> {
    this.isCancelledThisRun = false; // Reset cancellation flag for this specific run execution.
    
    const {
      runId,
      threadId,
      llmClient,
      toolProvider,
      messageStorage,
      responseProcessor,
      toolExecutor,
      contextManager,
      runConfig,
    } = agentContext;
    
    let currentTurnNumber = 0; // Tracks the number of LLM interaction cycles within this `run` invocation.
    // `currentCycleInputMessages` holds messages that are "new" for the current LLM call:
    // - On the first cycle, it's `initialTurnMessages` (e.g., user input).
    // - On subsequent cycles (after tool calls), it's the `LLMMessage[]` of tool results.
    let currentCycleInputMessages: LLMMessage[] = [...initialTurnMessages];
    let loopIterationGuard = 0; // Safety counter to prevent runaway loops.
    const MAX_CONTINUATIONS = runConfig.maxToolCallContinuations !== undefined ? runConfig.maxToolCallContinuations : 10;
    const MAX_ITERATIONS_SAFETY_BUFFER = 5; // Additional buffer beyond configured continuations.
    const MAX_TOTAL_ITERATIONS = MAX_CONTINUATIONS + MAX_ITERATIONS_SAFETY_BUFFER;
    
    try {
      // Emit `agent.run.created` only if this `run` call starts with user input,
      // indicating the beginning of a fresh interaction sequence.
      if (initialTurnMessages.some((m) => m.role === 'user')) {
        yield this.createEventHelper('agent.run.created', runId, threadId, {
          status: 'in_progress',
          initialMessages: initialTurnMessages,
        });
      } else if (initialTurnMessages.some((m) => m.role === 'tool')) {
        // This `run` call is likely a continuation with tool results.
        yield this.createEventHelper('agent.run.status.changed', runId, threadId, {
          currentStatus: 'in_progress',
          details: `Continuing run with tool results.`,
        });
      } else {
        yield this.createEventHelper('agent.run.status.changed', runId, threadId, {
          currentStatus: 'in_progress',
          details: `Continuing run.`,
        });
      }
      
      // Main agent operational loop. Each iteration is one "turn" involving an LLM call.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.isCancelledThisRun) {
          console.info(`[BaseAgent: ${runId}] Run cancelled during loop.`);
          yield this.createEventHelper('agent.run.status.changed', runId, threadId, { currentStatus: 'cancelling' });
          yield this.createEventHelper('agent.run.status.changed', runId, threadId, {
            currentStatus: 'cancelled',
            details: 'Run cancelled by request.',
          });
          return; // Exit the generator.
        }
        
        loopIterationGuard++;
        if (loopIterationGuard > MAX_TOTAL_ITERATIONS) {
          console.warn(`[BaseAgent: ${runId}] Exceeded safety iteration guard (${loopIterationGuard}). Forcing end.`);
          yield this.createEventHelper('thread.run.failed', runId, threadId, {
            status: 'failed',
            error: { code: 'iteration_limit_exceeded', message: 'Agent safety iteration limit exceeded.' },
          });
          return;
        }
        
        currentTurnNumber++;
        const currentStepId = `${runId}-turn-${currentTurnNumber}`; // Use 'turn' for clarity
        yield this.createEventHelper('agent.run.step.created', runId, threadId, {
          stepId: currentStepId,
          details: { turn: currentTurnNumber, iterationInLoop: loopIterationGuard },
        });
        
        // --- 1. Persist "New" Input Messages for this Cycle ---
        // These are messages (user input or tool results) that the LLM hasn't processed in *this context* yet.
        for (const msg of currentCycleInputMessages) {
          const messageToStore = mapLLMMessageToIMessagePartial(msg, threadId, runId, currentStepId);
          const savedMsg = await messageStorage.addMessage(messageToStore);
          yield this.createEventHelper('thread.message.created', runId, threadId, { message: savedMsg });
        }
        
        // --- 2. Prepare Full Message History for LLM (with Context Management) ---
        const systemPromptLLMMessage: LLMMessage = {
          role: 'system',
          content:
          runConfig.systemPrompt ||
          "You are a helpful AI assistant. Please use tools if necessary to answer the user's request.",
        };
        // `contextManager.prepareMessagesForLLM` fetches historical messages, combines with system prompt
        // and `currentCycleInputMessages`, and handles truncation/summarization.
        const messagesForLLM = await contextManager.prepareMessagesForLLM(
          threadId,
          systemPromptLLMMessage,
          currentCycleInputMessages // Pass the "new" messages for this cycle to ensure they are included.
        );
        // `currentCycleInputMessages` are now part of `messagesForLLM` (or summarized).
        // Clear it for the *next* iteration, where it will hold results of tools called in *this* iteration.
        currentCycleInputMessages = [];
        
        // --- 3. Prepare Tools for LLM ---
        const availableTools = await toolProvider.getTools();
        
        const allTools = await Promise.all(availableTools.map(async (t) => await t.getDefinition()));
        // Use the llmClient to format tools, making this part provider-agnostic.
        const toolsForLLMProvider =
        availableTools.length > 0 && llmClient.formatToolsForProvider
        ? llmClient.formatToolsForProvider(allTools)
        : []; // If client doesn't support formatting, or no tools, send empty.
        
        // --- 4. Call LLM ---
        yield this.createEventHelper('agent.run.status.changed', runId, threadId, {
          currentStatus: 'in_progress',
          details: `LLM call for turn ${currentTurnNumber}`,
        });
        const llmResponseStream = (await llmClient.generateResponse(messagesForLLM, {
          model: runConfig.model,
          tools: toolsForLLMProvider.length > 0 ? toolsForLLMProvider : undefined,
          tool_choice: toolsForLLMProvider.length > 0 ? runConfig.toolChoice : 'none', // Force 'none' if no tools available
          stream: true, // BaseAgent processes streams internally.
          temperature: runConfig.temperature,
          max_tokens: runConfig.maxTokens,
          ...(runConfig.llmProviderSpecificOptions || {}),
        })) as AsyncGenerator<LLMMessageChunk, void, unknown>; // Asserting stream=true returns AsyncGenerator
        
        // --- 5. Process LLM Response Stream ---
        let assistantResponseTextAccumulator = '';
        const detectedToolCallsThisCycle: LLMToolCall[] = [];
        const assistantMessageId = uuidv4(); // Unique ID for the assistant's message this turn.
        
        // Emit event for the creation of the assistant message (shell).
        yield this.createEventHelper('thread.message.created', runId, threadId, {
          message: {
            id: assistantMessageId,
            threadId,
            role: 'assistant',
            content: '', // Start with empty content
            createdAt: new Date(),
            metadata: { runId, stepId: currentStepId, inProgress: true },
          },
        });
        
        let llmStreamFinishReason: string | null | undefined = null;
        
        for await (const parsedEvent of responseProcessor.processStream(llmResponseStream)) {
          if (this.isCancelledThisRun) break; // Check for cancellation during stream processing.
          
          switch (parsedEvent.type) {
            case 'text_chunk':
            assistantResponseTextAccumulator += parsedEvent.text;
            yield this.createEventHelper('thread.message.delta', runId, threadId, {
              messageId: assistantMessageId,
              delta: { contentChunk: parsedEvent.text },
            });
            break;
            case 'tool_call_detected':
            const toolCall = parsedEvent.toolCall;
            yield this.createEventHelper('thread.run.step.tool_call.created', runId, threadId, {
              stepId: currentStepId,
              toolCall,
            });
            detectedToolCallsThisCycle.push(toolCall);
            yield this.createEventHelper('thread.run.step.tool_call.completed_by_llm', runId, threadId, {
              stepId: currentStepId,
              toolCall,
            });
            yield this.createEventHelper('thread.message.delta', runId, threadId, {
              messageId: assistantMessageId,
              delta: { toolCallsChunk: [toolCall] },
            });
            break;
            case 'stream_end':
            llmStreamFinishReason = parsedEvent.finishReason;
            // TODO: Handle parsedEvent.usage if provided.
            break;
            case 'error':
            yield this.createEventHelper('thread.run.failed', runId, threadId, {
              status: 'failed',
              error: {
                code: parsedEvent.error.name || 'llm_response_parsing_error',
                message: parsedEvent.error.message,
                details: parsedEvent.error.metadata,
              },
            });
            throw parsedEvent.error; // Propagate error to stop the run.
          }
        }
        if (this.isCancelledThisRun) continue; // If cancelled during stream, restart loop to handle cancellation.
        
        // Persist the complete assistant message (text and any tool calls).
        const finalAssistantLLMMessage: LLMMessage = {
          role: 'assistant',
          content: assistantResponseTextAccumulator,
          tool_calls: detectedToolCallsThisCycle.length > 0 ? detectedToolCallsThisCycle : undefined,
        };
        const finalSavedAssistantMsg = await messageStorage.addMessage(
          mapLLMMessageToIMessagePartial(finalAssistantLLMMessage, threadId, runId, currentStepId, assistantMessageId)
        );
        yield this.createEventHelper('thread.message.completed', runId, threadId, { message: finalSavedAssistantMsg });
        
        console.debug(
          `[BaseAgent: ${runId}] LLM stream finished with reason: ${llmStreamFinishReason}`,
          {
            assistantResponseText: assistantResponseTextAccumulator,
            toolCalls: JSON.stringify(detectedToolCallsThisCycle),
          }
        );

        // --- 6. Decide Next Step Based on LLM's Finish Reason ---
        if (llmStreamFinishReason === 'tool_calls' && detectedToolCallsThisCycle.length > 0) {
          // Check if max tool call continuations limit is reached.
          if (currentTurnNumber >= MAX_CONTINUATIONS) {
            console.warn(
              `[BaseAgent: ${runId}] Reached max tool call continuations (${MAX_CONTINUATIONS}). Ending run as 'requires_action'.`
            );
            yield this.createEventHelper('thread.run.requires_action', runId, threadId, {
              status: 'requires_action',
              required_action: {
                type: 'submit_tool_outputs',
                submit_tool_outputs: { tool_calls: detectedToolCallsThisCycle },
              },
            });
            yield this.createEventHelper('agent.run.status.changed', runId, threadId, {
              currentStatus: 'requires_action',
              details: 'Max tool call continuations reached.',
            });
            return; // End run, requiring external submission of tool outputs.
          }
          
          // Emit requires_action to signal that tools need to be called and outputs submitted.
          // Even if tools are executed internally, this event can be useful for observability.
          yield this.createEventHelper('thread.run.requires_action', runId, threadId, {
            status: 'requires_action',
            required_action: {
              type: 'submit_tool_outputs',
              submit_tool_outputs: { tool_calls: detectedToolCallsThisCycle },
            },
          });
          
          // Execute Tools.
          const toolExecutionResults = await toolExecutor.executeToolCalls(detectedToolCallsThisCycle);
          
          const toolResultLLMMessagesForNextCycle: LLMMessage[] = [];
          
          for (const execResult of toolExecutionResults) {
            if (this.isCancelledThisRun) break;
            
            const toolExecStepId = `${currentStepId}-tool_exec-${execResult.toolCallId}`; // Unique step ID for tool execution.
            const originalToolCall = detectedToolCallsThisCycle.find((tc) => tc.id === execResult.toolCallId);
            let parsedInputArgs = {};
            if (originalToolCall?.function.arguments) {
              try {
                parsedInputArgs = JSON.parse(originalToolCall.function.arguments);
              } catch {
                /* ignore parse error for event logging of input */
              }
            }
            
            yield this.createEventHelper('agent.tool.execution.started', runId, threadId, {
              stepId: toolExecStepId,
              toolCallId: execResult.toolCallId,
              toolName: execResult.toolName,
              input: parsedInputArgs,
            });
            
            yield this.createEventHelper('agent.tool.execution.completed', runId, threadId, {
              stepId: toolExecStepId,
              toolCallId: execResult.toolCallId,
              toolName: execResult.toolName,
              result: execResult.result,
            });
            if (originalToolCall?.function.name === 'delegateToSpecialistAgent' && execResult.result.metadata) {
              const subAgentMeta = execResult.result.metadata;
              // Assume subAgentMeta contains: subAgentRunId, specialistId, subTaskDescription
              // We need the original planner's stepId and toolCallId for the event.
              // currentStepId is the planner's step. execResult.toolCallId is the planner's tool call.
              
              // It's tricky to emit 'started' here as it's *after* execution.
              // 'started' should ideally be emitted *by the tool itself* if it could yield.
              // Since tools don't yield events, we can only emit a combined event or rely on metadata.
              
              // Let's emit 'completed' here based on the result.
              // The 'started' event is harder to place without tool yielding.
              // For now, focus on 'completed'. The alternative is that DelegateToSpecialistTool
              // itself has access to yield events via the planner's context, which is a bigger change.
              
              if (subAgentMeta.subAgentRunId && subAgentMeta.specialistId) {
                yield this.createEventHelper('agent.sub_agent.invocation.completed', runId, threadId, {
                  plannerStepId: currentStepId, // Step ID of the planning agent
                  toolCallId: execResult.toolCallId, // ID of the DelegateToSpecialistTool call
                  specialistId: subAgentMeta.specialistId,
                  subAgentRunId: subAgentMeta.subAgentRunId,
                  result: execResult.result, // The IToolResult from DelegateToSpecialistTool
                });
              }
            }
            
            
            
            const toolMessageContent =
            typeof execResult.result.data === 'string'
            ? execResult.result.data
            : JSON.stringify(execResult.result.data ?? null);
            
            const toolResponseMessage: LLMMessage = {
              role: 'tool',
              tool_call_id: execResult.toolCallId,
              name: execResult.toolName, // Used by some LLMs like OpenAI for the 'tool' role message.
              content: execResult.result.success
              ? toolMessageContent
              : `Error: ${execResult.result.error || 'Tool execution failed.'}`,
            };
            toolResultLLMMessagesForNextCycle.push(toolResponseMessage);
            // Tool result messages will be persisted at the start of the *next* loop iteration.
          }
          if (this.isCancelledThisRun) continue; // Check cancellation after processing all tool results.
          
          // Prepare for the next LLM call cycle with these tool results.
          currentCycleInputMessages = toolResultLLMMessagesForNextCycle;
          if (currentCycleInputMessages.length === 0 && detectedToolCallsThisCycle.length > 0) {
            console.error(`[BaseAgent: ${runId}] All tool executions failed or produced no messages. Stopping.`);
            yield this.createEventHelper('thread.run.failed', runId, threadId, {
              status: 'failed',
              error: {
                code: 'all_tools_failed',
                message: 'All tool executions failed or yielded no results for the LLM to process.',
              },
            });
            return;
          }
          // Continue to the next iteration of the while loop.
        } else if (
          llmStreamFinishReason === 'stop' ||
          llmStreamFinishReason === null ||
          llmStreamFinishReason === undefined
        ) {
          // LLM finished generating text without calling tools, or it was a text-only response.
          yield this.createEventHelper('thread.run.completed', runId, threadId, {
            status: 'completed',
            finalMessages: [finalSavedAssistantMsg],
          });
          return; // End of agent run.
        } else {
          // Other finish reasons (e.g., 'length', 'content_filter').
          yield this.createEventHelper('thread.run.failed', runId, threadId, {
            status: 'failed',
            error: {
              code: 'llm_finish_reason_error',
              message: `LLM stopped with an unexpected reason: ${llmStreamFinishReason || 'unknown'}`,
            },
          });
          return; // End of agent run due to unexpected finish reason.
        }
      } // End of while(true) loop.
    } catch (error: any) {
      console.error(`[BaseAgent: ${runId}] Critical error during agent run (Thread: ${threadId}):`, error);
      const appError =
      error instanceof ApplicationError
      ? error
      : new ApplicationError(error.message || 'Unknown critical agent error.');
      yield this.createEventHelper('thread.run.failed', runId, threadId, {
        status: 'failed',
        error: { code: appError.name, message: appError.message, details: appError.metadata },
      });
      // No re-throw from here; the generator simply ends.
    } finally {
      // This finally block executes when the generator is exited (return, throw, or break from loop if not caught).
      // The specific terminal status event (completed, failed, cancelled) should have been emitted already.
      console.info(`[BaseAgent: ${runId}] Agent run processing loop for thread ${threadId} has concluded.`);
    }
  }
  
  /**
  * Handles the submission of tool outputs when an agent run is paused in a 'requires_action' state.
  * This method prepares the tool results as LLMMessages and re-enters the main `run` loop.
  *
  * @param agentContext The context for the current agent run.
  * @param toolCallOutputs An array of tool outputs to be submitted.
  * @yields {AgentEvent} Events as the agent run continues.
  */
  public async *submitToolOutputs(
    agentContext: IAgentContext,
    toolCallOutputs: Array<{ tool_call_id: string; output: string; tool_name?: string }>
  ): AsyncGenerator<AgentEvent, void, undefined> {
    const { runId, threadId } = agentContext;
    this.isCancelledThisRun = false; // Reset cancellation if continuing a run.
    
    yield this.createEventHelper('agent.run.status.changed', runId, threadId, {
      currentStatus: 'in_progress',
      details: 'Processing submitted tool outputs to continue run.',
    });
    
    const toolResultLLMMessages: LLMMessage[] = toolCallOutputs.map((out) => ({
      role: 'tool',
      tool_call_id: out.tool_call_id,
      name: out.tool_name || out.tool_call_id, // 'name' is often the function name for 'tool' role messages.
      content: out.output, // Content must be a string representation of the tool's output.
    }));
    
    // Re-enter the main `run` loop, passing these tool results as the `initialTurnMessages`
    // for this continuation cycle. The `run` method's loop will persist them.
    yield* this.run(agentContext, toolResultLLMMessages);
  }
  
  /**
  * Requests cancellation of the currently executing or next iteration of the agent run.
  * The cancellation is cooperative and takes effect at designated check points in the `run` loop.
  *
  * @param agentContext The context for the agent run to be cancelled.
  */
  public async cancelRun(agentContext: IAgentContext): Promise<void> {
    const { runId, threadId } = agentContext; // For logging/eventing if needed immediately
    console.info(`[BaseAgent: ${runId}] Cancellation requested for run on thread ${threadId}. Flag set.`);
    this.isCancelledThisRun = true;
    // Note: The actual 'cancelling' and 'cancelled' events are emitted by the `run` loop
    // when it detects the `isCancelledThisRun` flag.
  }
  
  /**
  * Helper to create standardized AgentEvent objects.
  * Ensures `runId` and `threadId` from the call arguments are used,
  * not potentially from the `data` payload if it also contains them.
  */
  private createEventHelper<T extends AgentEvent['type']>(
    type: T,
    runId: string,
    threadId: string,
    data: Omit<Extract<AgentEvent, { type: T }>['data'], 'runId' | 'threadId'> // Data should not duplicate these
  ): Extract<AgentEvent, { type: T }> {
    return {
      type,
      timestamp: new Date(),
      runId,
      threadId,
      data,
    } as unknown as Extract<AgentEvent, { type: T }>;
  }
}
