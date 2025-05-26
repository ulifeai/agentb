# Agents Deep Dive: `BaseAgent`

The `BaseAgent` is the default, general-purpose agent implementation provided by AgentB. It orchestrates the core interaction loop: receiving input, communicating with an LLM, processing the LLM's response, handling tool calls, and managing conversation state.

Most simple to moderately complex agent use cases can be handled by `BaseAgent` when configured with the appropriate `IAgentContext` (which includes the LLM, tools, and run configuration).

## Key Features of `BaseAgent`

*   **Standard Execution Loop**: Implements the lifecycle described in [Core Concepts: Agent Lifecycle & Events](../CORE-CONCEPTS/02-agent-lifecycle-events.md).
*   **LLM Interaction**: Prepares messages for the LLM, including system prompts and conversation history managed by the `ContextManager`.
*   **Tool Handling**:
    *   Formats available tool definitions for the LLM.
    *   Parses tool call requests from the LLM's response using `LLMResponseProcessor`.
    *   Executes tools using `ToolExecutor`.
    *   Feeds tool results back to the LLM for further processing.
*   **Streaming Support**: Natively handles streaming LLM responses, emitting `thread.message.delta` events.
*   **Event Emission**: Generates a comprehensive stream of `AgentEvent`s throughout its execution.
*   **Context Management Integration**: Relies on the `ContextManager` (provided in `IAgentContext`) to prepare messages and manage the LLM's context window.
*   **Configurable**: Its behavior is heavily influenced by the `AgentRunConfig` and the components (like `IToolProvider`) injected via `IAgentContext`.
*   **Continuations**: Can automatically continue interacting with the LLM after tool executions, up to a configurable `maxToolCallContinuations` limit.
*   **Cancellation**: Supports cooperative cancellation of its current run via the `cancelRun()` method.

## How `BaseAgent` Works

When `baseAgent.run(agentContext, initialTurnMessages)` is called:

1.  **Initialization**:
    *   Sets an internal cancellation flag to `false`.
    *   Retrieves dependencies (`llmClient`, `toolProvider`, `messageStorage`, etc.) from `agentContext`.
    *   Emits `agent.run.created` or `agent.run.status.changed` (if continuing a run).

2.  **Main Loop**: Enters a loop that represents turns of interaction.
    *   **Safety Check**: Increments an iteration guard to prevent infinite loops (max iterations = `maxToolCallContinuations` + safety buffer).
    *   **Cancellation Check**: Checks the `isCancelledThisRun` flag. If `true`, emits cancellation events and exits.
    *   **Step Creation**: Emits `agent.run.step.created` for the current turn.
    *   **Persist Inputs**: Saves `initialTurnMessages` (user prompt or tool results) to `messageStorage`, emitting `thread.message.created`.
    *   **Prepare LLM Input**:
        *   Uses `contextManager.prepareMessagesForLLM()` to get the full list of messages for the LLM, including system prompt and history.
        *   Fetches available tools from `toolProvider` and formats them using `llmClient.formatToolsForProvider()`.
    *   **Call LLM**:
        *   Emits `agent.run.status.changed` (e.g., "LLM call for turn...").
        *   Calls `llmClient.generateResponse()` with messages, tools, and run configuration (model, temperature, stream=true, etc.).
    *   **Process LLM Stream**:
        *   Creates an assistant message shell (`thread.message.created`).
        *   Iterates through the LLM response stream using `responseProcessor.processStream()`:
            *   For `text_chunk`: Emits `thread.message.delta`.
            *   For `tool_call_detected`: Emits `thread.run.step.tool_call.created`, `thread.run.step.tool_call.completed_by_llm`, and `thread.message.delta` (with `toolCallsChunk`). Stores detected tool calls.
            *   For `stream_end`: Notes the `finishReason`.
            *   For `error`: Emits `thread.run.failed` and throws an error to stop the run.
        *   Checks for cancellation during stream processing.
    *   **Finalize Assistant Message**: Saves the complete assistant message (text + tool calls) to `messageStorage`, emitting `thread.message.completed`.
    *   **Decision Based on `finishReason`**:
        *   If `tool_calls`:
            *   Checks `maxToolCallContinuations`. If exceeded, emits `thread.run.requires_action` (with tool calls for external handling) or `thread.run.failed`, then exits.
            *   Emits `thread.run.requires_action` (for observability).
            *   Calls `toolExecutor.executeToolCalls()` with the detected tool calls and `agentContext`.
                *   For each tool execution, emits `agent.tool.execution.started` and `agent.tool.execution.completed`.
                *   If a tool was `DelegateToSpecialistTool`, appropriate `agent.sub_agent.invocation.completed` event is also emitted based on the tool's result metadata.
            *   Formats tool results as `LLMMessage`s and sets them as `initialTurnMessages` for the next loop iteration.
            *   If all tool executions failed, emits `thread.run.failed` and exits.
        *   If `stop` (or null/undefined):
            *   Emits `thread.run.completed` with the final assistant message.
            *   Exits the loop and the `run()` method.
        *   If other reasons (e.g., `length`, `content_filter`):
            *   Emits `thread.run.failed`.
            *   Exits the loop and the `run()` method.

3.  **Error Handling**: A top-level try/catch within `run()` handles unexpected errors, emits `thread.run.failed`, and ensures the generator concludes.
4.  **`finally` Block**: Logs that the run processing loop has concluded.

## `submitToolOutputs()` Method

If a `BaseAgent` run ends in a `requires_action` state (e.g., because `maxToolCallContinuations` was reached, or if an agent was designed to pause for external tool execution), the `submitToolOutputs(agentContext, toolCallOutputs)` method can be used to resume the run.

*   It takes the `agentContext` and an array of tool outputs.
*   Formats these outputs into `LLMMessage`s with `role: 'tool'`.
*   Calls `this.run(agentContext, toolResultLLMMessages)`, effectively re-entering the main loop with the tool results as the initial input for that turn.

## `cancelRun()` Method

*   Sets an internal flag `this.isCancelledThisRun = true`.
*   The main `run()` loop checks this flag at various points and, if set, will:
    *   Emit `agent.run.status.changed` (to 'cancelling', then 'cancelled').
    *   Cleanly exit the generator.

## When to Use `BaseAgent`

*   **Default Agent**: It's the standard agent used by `AgentB` facade and `ApiInteractionManager` if no other `agentImplementation` is specified and the mode doesn't inherently require a specialized agent like `PlanningAgent`.
*   **General Conversational AI**: For chatbots that might need to use tools.
*   **API Interaction Agents**: When connecting to APIs via `OpenAPIConnector` in `genericOpenApi` mode.
*   **Worker Agents**: `BaseAgent` is often the default implementation for "worker" or "specialist" agents that are invoked by a `PlanningAgent` via the `DelegateToSpecialistTool`. These worker agents are given a focused set of tools for a specific sub-task.

## Customization

While you can extend `BaseAgent` by creating a subclass, much of its behavior is customized by:

1.  **`AgentRunConfig`**: Provided in `IAgentContext`, this controls:
    *   `model`: The LLM model to use.
    *   `systemPrompt`: The primary instructions for the LLM.
    *   `temperature`, `maxTokens`: LLM generation parameters.
    *   `toolChoice`: How the LLM should select tools.
    *   `maxToolCallContinuations`: How many times the agent can loop after tool calls.
    *   And more (see `AgentRunConfig` details).
2.  **`IToolProvider`**: The tools made available to `BaseAgent` via `IAgentContext.toolProvider` define its capabilities.
3.  **Other `IAgentContext` Components**: The specific implementations of `ILLMClient`, `IMessageStorage`, etc., also affect its operation.

If you need to fundamentally alter the execution loop or decision-making logic beyond what configuration allows, you would then create your own class implementing the `IAgent` interface (potentially still drawing inspiration from `BaseAgent`'s structure). 