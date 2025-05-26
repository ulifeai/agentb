# Core Concepts: The Agent Lifecycle & Events

Understanding how an AgentB agent executes and the events it emits is key to building interactive applications and debugging agent behavior.

## The Agent Execution Lifecycle (`BaseAgent` Example)

When an agent (typically an instance of `BaseAgent` or a class extending it) is asked to process a user's message (or continue after a tool execution), it generally follows this lifecycle within its `run()` method:

1.  **Run Initialization**:
    *   A unique `runId` is established.
    *   An `agent.run.created` event (or `agent.run.status.changed` if continuing) is emitted.

2.  **Input Message Processing**:
    *   The current turn's input messages (e.g., new user prompt, tool results from a previous step) are persisted using `messageStorage`.
    *   `thread.message.created` events are emitted for these newly saved messages.

3.  **Context Preparation**:
    *   The `ContextManager` assembles the full conversation history relevant for the LLM, including a system prompt and the latest input messages.
    *   This may involve fetching historical messages and potentially summarizing older parts of the conversation if it's too long (context window management).

4.  **Tool Preparation**:
    *   The `ToolProvider` (configured in the `IAgentContext`) makes available tools known to the agent.
    *   These tools are formatted into a structure the LLM can understand (e.g., OpenAI's function/tool format).

5.  **LLM Call**:
    *   An `agent.run.status.changed` event (e.g., `details: "LLM call for turn X"`) might be emitted.
    *   The agent sends the prepared messages and tool definitions to the LLM via the `ILLMClient`.
    *   The request is usually made to stream the LLM's response.

6.  **LLM Response Processing (Streaming)**:
    *   An `assistant` message shell is created in `messageStorage` (`thread.message.created` event).
    *   As the LLM streams its response, the `LLMResponseProcessor` parses these chunks:
        *   **Text Chunks**: For textual parts of the AI's reply. A `thread.message.delta` event with a `contentChunk` is emitted. The UI can append this to the current assistant message.
        *   **Tool Call Detections**: If the LLM decides to use a tool, it streams the tool call details (name, arguments).
            *   `thread.run.step.tool_call.created`: LLM signals intent to call a tool.
            *   `thread.message.delta` with `toolCallsChunk`: Contains parts of the tool call structure as it's streamed.
            *   `thread.run.step.tool_call.completed_by_llm`: The LLM has finished generating all details for a specific tool call.
    *   The accumulated text and detected tool calls form the assistant's complete turn.

7.  **Assistant Message Completion**:
    *   The complete assistant message (text and any tool calls) is finalized and updated in `messageStorage`.
    *   A `thread.message.completed` event is emitted for the assistant's message.

8.  **Decision Point (Based on LLM's Finish Reason)**:

    *   **A) LLM requests Tool Calls (`finish_reason: 'tool_calls'`)**:
        *   `thread.run.requires_action` event may be emitted (even if tools are executed internally, for observability).
        *   The `ToolExecutor` takes the detected tool calls:
            *   For each tool call:
                *   `agent.tool.execution.started`: Signals the tool is about to run.
                *   The tool's `execute()` method is called.
                *   `agent.tool.execution.completed`: Signals the tool has finished, providing its `IToolResult` (success/failure, data/error).
                *   *(If the tool was `DelegateToSpecialistTool`)*:
                    *   `agent.sub_agent.invocation.started` (emitted conceptually by the tool or its setup)
                    *   `agent.sub_agent.invocation.completed` (emitted based on the sub-agent's final result within the tool's result)
        *   The results from all executed tools are formatted as `tool` role messages.
        *   The lifecycle **loops back to Step 2 (Input Message Processing)**, with these tool result messages as the new input for the next LLM interaction.
        *   A check for `maxToolCallContinuations` prevents infinite loops. If exceeded, the run might end in `requires_action` or `failed`.

    *   **B) LLM generates Text Response (`finish_reason: 'stop'`)**:
        *   The agent's turn is complete.
        *   `thread.run.completed` event is emitted.
        *   The `run()` method finishes.

    *   **C) LLM stops for other reasons (e.g., 'length', 'content_filter') or error**:
        *   `thread.run.failed` event is emitted with error details.
        *   The `run()` method finishes.

9.  **Run Finalization**:
    *   If the agent's `run()` method completes (due to 'stop', 'completed', 'failed', or unhandled error), the overall agent run is considered concluded. The final status should have been persisted.

## Agent Events (`AgentEvent`)

Events are your window into the agent's operations. They are crucial for:
*   **UI Updates**: Streaming text, showing tool usage, displaying status.
*   **Logging & Observability**: Understanding what the agent is doing.
*   **Debugging**: Tracing the agent's decisions and tool interactions.

Here's a summary of key event types (defined in `ui/src/api.ts` for UI and `src/agents/types.ts` for backend):

| Event Type                             | Description                                                                 | UI Implication / Use Case                                     |
| :------------------------------------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------ |
| `agent.run.created`                    | A new agent run process has been initiated.                                 | Show "Agent is thinking..." or initial loading state.         |
| `agent.run.step.created`               | A new logical step/turn within the run has started.                         | Internal tracking, detailed progress bars.                    |
| `thread.message.created`               | A new message (user, assistant, tool result) has been saved.                | Add message to UI (placeholder if assistant message `inProgress`). |
| `thread.message.delta`                 | A chunk of content or tool call information for an assistant message.         | Stream text to UI, update tool call display.                |
| `thread.message.completed`             | An assistant message is fully formed (text and any tool calls).             | Finalize assistant message display in UI.                     |
| `thread.run.step.tool_call.created`    | LLM has decided to call a tool and generated its details.                   | Show "Agent plans to use tool X..." (thought process).        |
| `agent.tool.execution.started`         | A specific tool execution has begun.                                        | Show "Executing tool X..."                                    |
| `agent.tool.execution.completed`       | A tool execution has finished (includes success/failure and result/error).  | Update UI with tool result (success or error message).        |
| `agent.sub_agent.invocation.started`   | A `DelegateToSpecialistTool` has started invoking a sub-agent.              | Show "Delegating to Specialist Y..."                          |
| `agent.sub_agent.invocation.completed` | The sub-agent (via `DelegateToSpecialistTool`) has completed.               | Update UI with sub-agent's overall result.                    |
| `thread.run.requires_action`           | Agent needs external input (e.g., tool results if not auto-executed).       | UI might show a pending state (rare if tools auto-run).       |
| `agent.run.status.changed`             | Generic event for run status changes (e.g., to 'cancelling', 'cancelled').  | Update overall run status display.                            |
| `thread.run.failed`                    | The entire agent run has failed.                                            | Display error message to user, stop loading states.           |
| `thread.run.completed`                 | The entire agent run has completed successfully.                            | Finalize interaction, clear loading states.                   |

By subscribing to and processing these events, applications can build rich, informative, and interactive experiences around AgentB agents. The `@ulifeai/agentb-ui` package's `useChat` hook handles much of this event processing for you. 