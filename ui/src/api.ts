
// --- Backend AgentEvent Types (Mirrored for UI) ---
// These should ideally be in a shared types package, or kept in sync manually.

export interface AgentEventBase {
  type: string;
  timestamp: string; // ISO string from backend, will be new Date() on reception
  runId: string;
  threadId: string;
}

// Simplified IMessage for UI, backend's IMessage is more detailed
export interface UIMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool'; // Keep roles aligned
  content: string | any; // Could be string or structured content for AI
  createdAt: string; // ISO string
  metadata?: Record<string, any>;
}

// Simplified LLMToolCall for UI
export interface UILLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

// Simplified IToolResult for UI
export interface UIToolResult {
  success: boolean;
  data: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AgentEventRunCreated extends AgentEventBase {
  type: 'agent.run.created';
  data: { status: 'queued' | 'in_progress'; initialMessages?: any[] };
}
export interface AgentEventRunStepCreated extends AgentEventBase {
  type: 'agent.run.step.created';
  data: { stepId: string; details?: any };
}
export interface AgentEventMessageCreated extends AgentEventBase {
  type: 'thread.message.created';
  data: { message: UIMessage };
}
export interface AgentEventMessageDelta extends AgentEventBase {
  type: 'thread.message.delta';
  data: { messageId: string; delta: { contentChunk?: string; toolCallsChunk?: UILLMToolCall[] } };
}
export interface AgentEventMessageCompleted extends AgentEventBase {
  type: 'thread.message.completed';
  data: { message: UIMessage };
}
export interface AgentEventToolCallCreated extends AgentEventBase {
  type: 'thread.run.step.tool_call.created';
  data: { stepId: string; toolCall: UILLMToolCall };
}
export interface AgentEventToolCallCompletedByLLM extends AgentEventBase {
  type: 'thread.run.step.tool_call.completed_by_llm';
  data: { stepId: string; toolCall: UILLMToolCall };
}
export interface AgentEventToolExecutionStarted extends AgentEventBase {
  type: 'agent.tool.execution.started';
  data: { stepId: string; toolCallId: string; toolName: string; input: Record<string, any> };
}
export interface AgentEventToolExecutionCompleted extends AgentEventBase {
  type: 'agent.tool.execution.completed';
  data: { stepId: string; toolCallId: string; toolName: string; result: UIToolResult };
}
export interface AgentEventRunRequiresAction extends AgentEventBase {
  type: 'thread.run.requires_action';
  data: {
    status: 'requires_action';
    required_action: {
      type: 'submit_tool_outputs';
      submit_tool_outputs: { tool_calls: UILLMToolCall[] };
    };
  };
}
export interface AgentEventRunStatusChanged extends AgentEventBase {
  type: 'agent.run.status.changed';
  data: { previousStatus?: string; currentStatus: string; details?: string };
}
export interface AgentEventRunFailed extends AgentEventBase {
  type: 'thread.run.failed';
  data: { status: 'failed'; error: { code: string; message: string; details?: any } };
}
export interface AgentEventRunCompleted extends AgentEventBase {
  type: 'thread.run.completed';
  data: { status: 'completed'; finalMessages?: UIMessage[] };
}
export interface AgentEventSubAgentInvocationStarted extends AgentEventBase {
  type: 'agent.sub_agent.invocation.started';
  data: {
    plannerStepId: string;
    toolCallId: string;
    specialistId: string;
    subTaskDescription: string;
    subAgentRunId: string;
  };
}
export interface AgentEventSubAgentInvocationCompleted extends AgentEventBase {
  type: 'agent.sub_agent.invocation.completed';
  data: {
    plannerStepId: string;
    toolCallId: string;
    specialistId: string;
    subAgentRunId: string;
    result: UIToolResult;
  };
}

// Union of all event types
export type AgentEvent =
  | AgentEventRunCreated
  | AgentEventRunStepCreated
  | AgentEventMessageCreated
  | AgentEventMessageDelta
  | AgentEventMessageCompleted
  | AgentEventToolCallCreated
  | AgentEventToolCallCompletedByLLM
  | AgentEventToolExecutionStarted
  | AgentEventToolExecutionCompleted
  | AgentEventRunRequiresAction
  | AgentEventRunStatusChanged
  | AgentEventRunFailed
  | AgentEventRunCompleted
  | AgentEventSubAgentInvocationStarted
  | AgentEventSubAgentInvocationCompleted;


// --- API Call Functions ---

export interface StreamAgentResponsePayload {
  threadId: string;
  userMessage: { role: 'user'; content: string }; // Backend expects LLMMessage format for user prompt
  backendUrl: string; // e.g., http://localhost:3001
}

export interface StreamAgentInteractionResponse {
  streamReader: ReadableStreamDefaultReader<Uint8Array>;
}

export async function streamAgentResponse(
  payload: StreamAgentResponsePayload
): Promise<StreamAgentInteractionResponse> {
  const { backendUrl, threadId, userMessage } = payload;
  
  // The backend's AgentB.getExpressStreamingHttpHandler expects `prompt` at top level of body
  // and threadId either in body or query.
  const requestBody = {
    prompt: userMessage.content, // The actual user text
    threadId: threadId, // Current thread ID
  };

  const response = await fetch(`${backendUrl}`, { // Ensure this matches your backend route
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text().catch(() => 'Unknown error details from server.');
    console.error("Stream Agent Response Error:", response.status, errorBody);
    throw new Error(`Failed to stream agent response (${response.status}): ${errorBody}`);
  }
  
  return {
    streamReader: response.body.getReader(),
  };
}

export async function* parseSSEStream<T extends AgentEvent>(
  streamReader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<T, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await streamReader.read();
    if (done) {
      if (buffer.trim()) {
        // Process any remaining data in the buffer (less common for SSE which uses \n\n)
        // but good for robustness if the stream ends mid-event.
        const lines = buffer.split('\n'); // Split by single newline for line-by-line processing
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonData = line.substring(5);
              if (jsonData.trim()) { // Ensure non-empty JSON
                yield JSON.parse(jsonData) as T;
              }
            } catch (e) {
              console.error('Failed to parse trailing SSE event data:', e, "Line:", line);
            }
          }
        }
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    
    let eolIndex;
    // SSE messages are separated by double newlines
    while ((eolIndex = buffer.indexOf('\n\n')) >= 0) { 
      const messageBlock = buffer.substring(0, eolIndex);
      buffer = buffer.substring(eolIndex + 2); // Consume the message and the \n\n

      const lines = messageBlock.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.substring(5);
            if (jsonData.trim()) { // Ensure non-empty JSON
               yield JSON.parse(jsonData) as T;
            }
          } catch (e) {
            console.error('Failed to parse SSE event data:', e, "Line:", line);
          }
        }
        // Other SSE fields like 'event:', 'id:', 'retry:' could be handled here if needed
      }
    }
  }
   // If stream ends and there's still data in buffer not terminated by \n\n
   // (e.g., if the last event wasn't followed by \n\n specifically)
   // This part is a bit more tricky and depends on how strictly the server formats the end of the stream.
   // Often, the server ensures a final \n\n or the `done` signal is sufficient.
   if (buffer.trim()) {
    const lines = buffer.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonData = line.substring(5);
          if (jsonData.trim()) {
            yield JSON.parse(jsonData) as T;
          }
        } catch (e) {
          console.error('Failed to parse final SSE event data in buffer:', e, "Line:", line);
        }
      }
    }
  }
}