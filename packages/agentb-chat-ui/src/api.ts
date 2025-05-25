// Placeholder AgentEvent types - refine as needed
export interface AgentEventBase {
  type: string;
  timestamp: string; // Assuming ISO string for simplicity in frontend
  runId: string;
  threadId: string;
}

export interface AgentEventMessageDelta extends AgentEventBase {
  type: 'thread.message.delta';
  data: { messageId: string; delta: { contentChunk?: string } };
}

export interface AgentEventMessageCompleted extends AgentEventBase {
  type: 'thread.message.completed';
  data: { message: { id: string; content: string; role: 'user' | 'assistant' } }; // Simplified message
}

export interface AgentEventRunFailed extends AgentEventBase {
  type: 'thread.run.failed';
  data: { error: { code: string; message: string } };
}

// Add other critical event types as needed for UI updates
export interface AgentEventRunCompleted extends AgentEventBase {
    type: 'thread.run.completed';
    data: { status: 'completed' };
}

export type AgentEvent = AgentEventMessageDelta | AgentEventMessageCompleted | AgentEventRunFailed | AgentEventRunCompleted; // Add more as needed

// Renamed and refined function
export interface StreamAgentResponsePayload {
  threadId: string; // The threadId for the interaction
  userMessage: { role: 'user'; content: string };
  backendUrl: string;
}

export interface StreamAgentInteractionResponse {
    streamReader: ReadableStreamDefaultReader<Uint8Array>;
    // The threadId is part of every AgentEvent, so the client can pick it up from there.
}

export async function streamAgentResponse(
  payload: StreamAgentResponsePayload
): Promise<StreamAgentInteractionResponse> {
  const { backendUrl, threadId, userMessage } = payload;
  const response = await fetch(`${backendUrl}/chat_stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: userMessage.content, threadId }),
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text().catch(() => "Unknown error details");
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
      if (buffer.trim()) { // Process any remaining data in the buffer
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.substring(5)) as T;
            } catch (e) {
              console.error('Failed to parse SSE event:', e, "Line:", line);
            }
          }
        }
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    
    let eolIndex;
    while ((eolIndex = buffer.indexOf('\n\n')) >= 0) { // SSE messages end with 


      const message = buffer.substring(0, eolIndex);
      buffer = buffer.substring(eolIndex + 2); // +2 for 



      const lines = message.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.substring(5)) as T;
          } catch (e) {
            console.error('Failed to parse SSE event:', e, "Line:", line);
          }
        }
      }
    }
  }
  // Append any final part of a stream if it didn't end with 

 (though SSE spec implies it should)
  if (buffer.trim()) {
      const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              yield JSON.parse(line.substring(5)) as T;
            } catch (e) {
              console.error('Failed to parse SSE event:', e, "Line:", line);
            }
          }
        }
  }
}
