# API Reference: `AgentEvent` Types

AgentB agents emit a stream of `AgentEvent` objects during their execution. These events provide detailed, real-time information about the agent's progress, decisions, and state changes. Understanding these events is crucial for building responsive UIs, logging, and debugging.

**Base Interface (`AgentEventBase` / `IAgentEventBase`)**

All agent events share a common base structure. The UI package (`@ulifeai/agentb-ui`) defines `AgentEventBase`, and the core backend package (`@ulifeai/agentb`) defines a similar `IAgentEventBase`. They typically include:

*   `type: string`: The specific type of the event (e.g., 'thread.message.created').
*   `timestamp: string | Date`: ISO string timestamp (UI often converts to `Date` on reception).
*   `runId: string`: The ID of the agent run this event belongs to.
*   `threadId: string`: The ID of the conversation thread.
*   `data: Record<string, any>`: A payload specific to the event type.

**Union Type (`AgentEvent` / `IAgentEvent`)**

A union type (`AgentEvent` in UI, `IAgentEvent` in backend) encompasses all possible specific event types.

**Import (UI context):**
```typescript
import { AgentEvent, /* specific event types like AgentEventMessageCreated */ } from '@ulifeai/agentb-ui'; // Or from '@ulifeai/agentb-ui/api'
```

**Import (Backend context):**
```typescript
import { AgentEvent as IAgentEvent, /* specific event types like IAgentEventMessageCreated */ } from '@ulifeai/agentb'; // Or from '@ulifeai/agentb/agents'
```

*(Note: The exact naming convention `AgentEvent` vs. `IAgentEvent` and path might vary slightly between the UI and core packages, but the structure and purpose of the events are mirrored.)*

## Common Agent Event Types

Below are descriptions of common event types and their `data` payloads. Refer to `ui/src/api.ts` (for UI) or `src/agents/types.ts` (for backend) in the source code for the precise interface definitions.

---

### Run Lifecycle Events

*   **`agent.run.created`**
    *   **Description**: Signals that a new agent run process has been initiated and is now in progress or queued.
    *   **`data`**:
        *   `status: 'queued' | 'in_progress'`
        *   `initialMessages?: LLMMessage[] | any[]`: (Backend: `LLMMessage[]`, UI: `any[]` for simplicity) The messages that initiated this run.

*   **`agent.run.step.created`**
    *   **Description**: Indicates the start of a new logical step or turn within the agent's execution loop.
    *   **`data`**:
        *   `stepId: string`: A unique ID for this step.
        *   `details?: any`: Optional details about the step (e.g., turn number).

*   **`agent.run.status.changed`**
    *   **Description**: A generic event indicating a change in the overall run status.
    *   **`data`**:
        *   `previousStatus?: string` (UI) / `AgentStatus` (Backend)
        *   `currentStatus: string` (UI) / `AgentStatus` (Backend)
        *   `details?: string`: Optional human-readable details about the status change.

*   **`thread.run.requires_action`**
    *   **Description**: The agent run is paused and requires an external action, typically the submission of tool outputs. This can occur if `maxToolCallContinuations` is reached or if an agent is designed to wait for manual tool execution.
    *   **`data`**:
        *   `status: 'requires_action'`
        *   `required_action: { type: 'submit_tool_outputs'; submit_tool_outputs: { tool_calls: UILLMToolCall[] | LLMToolCall[] } }`

*   **`thread.run.failed`**
    *   **Description**: The agent run has failed due to an error.
    *   **`data`**:
        *   `status: 'failed'`
        *   `error: { code: string; message: string; details?: any }`: Details of the error.

*   **`thread.run.completed`**
    *   **Description**: The agent run has completed all its steps successfully.
    *   **`data`**:
        *   `status: 'completed'`
        *   `finalMessages?: UIMessage[] | IMessage[]`: (UI: `UIMessage[]`, Backend: `IMessage[]`) Optional: Final message(s) produced by the run (e.g., the last assistant message).

---

### Message Events

*   **`thread.message.created`**
    *   **Description**: A new message (user, assistant, or tool) has been created and persisted. For assistant messages, this event might signify the *start* of the assistant's turn, with content streamed subsequently.
    *   **`data`**:
        *   `message: UIMessage` (UI) / `IMessage` (Backend): The created message object. Assistant messages might have `metadata.inProgress: true` if content is forthcoming.

*   **`thread.message.delta`**
    *   **Description**: A chunk of data for an assistant's message has been received (typically from a streaming LLM response).
    *   **`data`**:
        *   `messageId: string`: The ID of the assistant message being updated.
        *   `delta: { contentChunk?: string; toolCallsChunk?: UILLMToolCall[] | LLMToolCall[] }`:
            *   `contentChunk`: A piece of the textual response.
            *   `toolCallsChunk`: Partial information about tool calls the LLM is deciding to make.

*   **`thread.message.completed`**
    *   **Description**: An assistant's message is now fully formed (all text and tool call information has been received from the LLM and processed).
    *   **`data`**:
        *   `message: UIMessage` (UI) / `IMessage` (Backend): The complete assistant message object.

---

### Tool-Related Events

*   **`thread.run.step.tool_call.created`** (Backend: `thread.run.step.tool_call.created`)
    *   **Description**: The LLM has decided to make a tool call and has generated the necessary details (name, arguments). This event occurs *before* the tool is actually executed.
    *   **`data`**:
        *   `stepId: string`: The ID of the run step during which this tool call was decided.
        *   `toolCall: UILLMToolCall` (UI) / `LLMToolCall` (Backend): The details of the tool call.

*   **`thread.run.step.tool_call.completed_by_llm`** (Backend Only, UI might not see this exact one but infers from `toolCallsChunk` in `message.delta` or full `tool_calls` in `message.completed`)
    *   **Description**: Signals that the LLM has finished generating all parts of a specific tool call request (e.g., if arguments were streamed).
    *   **`data`**:
        *   `stepId: string`
        *   `toolCall: LLMToolCall`

*   **`agent.tool.execution.started`**
    *   **Description**: The agent framework has begun executing a specific tool call.
    *   **`data`**:
        *   `stepId: string`: The run step ID associated with this tool's lifecycle (can be a sub-step of the LLM's decision step).
        *   `toolCallId: string`: The ID of the `LLMToolCall` being executed.
        *   `toolName: string`: The name of the tool being executed.
        *   `input: Record<string, any>`: The parsed arguments passed to the tool.

*   **`agent.tool.execution.completed`**
    *   **Description**: A tool execution has finished.
    *   **`data`**:
        *   `stepId: string`
        *   `toolCallId: string`
        *   `toolName: string`
        *   `result: UIToolResult` (UI) / `IToolResult` (Backend): The outcome of the tool execution, including:
            *   `success: boolean`
            *   `data: any` (if successful)
            *   `error?: string` (if failed)
            *   `metadata?: Record<string, any>`

---

### Sub-Agent Events (for Hierarchical Planning)

*   **`agent.sub_agent.invocation.started`**
    *   **Description**: The `DelegateToSpecialistTool` (or a similar mechanism) has started the process of invoking a sub-agent (specialist/worker).
    *   **`data`**:
        *   `plannerStepId: string`: The step ID of the planning agent that decided to delegate.
        *   `toolCallId: string`: The ID of the `DelegateToSpecialistTool` call made by the planner.
        *   `specialistId: string`: The ID of the specialist/toolset being invoked.
        *   `subTaskDescription: string`: The task description given to the sub-agent.
        *   `subAgentRunId: string`: The unique `runId` generated for this sub-agent's execution.

*   **`agent.sub_agent.invocation.completed`**
    *   **Description**: The invoked sub-agent has completed its task, and the `DelegateToSpecialistTool` has its result.
    *   **`data`**:
        *   `plannerStepId: string`
        *   `toolCallId: string`
        *   `specialistId: string`
        *   `subAgentRunId: string`
        *   `result: UIToolResult` (UI) / `IToolResult` (Backend): The final result from the `DelegateToSpecialistTool`, which encapsulates the sub-agent's success/failure and output. The `result.data` often contains the sub-agent's textual response or structured output, and `result.error` if the sub-agent failed.

---

**Consuming Events:**

When consuming these events (e.g., in a UI or logging system):
*   Use a `switch` statement on `event.type` to handle different events appropriately.
*   Update application state based on the event `data`.
*   For UI, the `@ulifeai/agentb-ui` package's `useChat` hook abstracts much of this processing, transforming these backend events into a displayable `ChatMessage[]` array.

Refer to the source files (`ui/src/api.ts` for UI types and `src/agents/types.ts` for backend types) for the most up-to-date and precise interface definitions. 