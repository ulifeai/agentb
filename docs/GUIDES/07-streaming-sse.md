# Streaming Server-Sent Events (SSE)

AgentB is designed for real-time, interactive experiences. A core part of this is its use of **Server-Sent Events (SSE)** to stream `AgentEvent`s from the backend agent to the client (e.g., a web UI).

## What are Server-Sent Events (SSE)?

SSE is a simple, efficient, and standard web technology that allows a server to push data to a client over a single, long-lived HTTP connection. Unlike WebSockets, SSE is a one-way communication channel (server to client).

**Key Characteristics:**

* **HTTP-based**: Uses standard HTTP, making it firewall-friendly.
* **Text-based**: Events are typically sent as plain text. AgentB sends JSON-formatted `AgentEvent` objects.
* **Automatic Reconnection**: Browsers automatically attempt to reconnect if the connection is lost.
* **Event Types**: SSE supports named events, although AgentB primarily uses the default "message" event type and encodes the specific `AgentEvent.type` within the JSON payload.

## How AgentB Uses SSE

1. **HTTP Endpoint**:
   * The `AgentB.getExpressStreamingHttpHandler()` (or similar custom handlers) sets up an HTTP endpoint (e.g., `/agent/stream`).
   * When a client connects to this endpoint (usually with a `POST` request containing the user's prompt), the server keeps the connection open.
   * The response headers are set to `Content-Type: text/event-stream`.
2. **`AgentB.runHttpInteractionStream()`**:
   * This core method (used by the HTTP handler) returns an `AsyncGenerator<AgentEvent, void, undefined>`.
   * As the agent executes and emits `AgentEvent`s, this generator yields them one by one.
3. **Formatting Events for SSE**:
   * The HTTP handler iterates over the `AgentEvent`s yielded by the generator.
   * Each `AgentEvent` object is typically JSON-stringified.
   *   It's then formatted according to the SSE protocol:

       ```
       data: {"type":"thread.message.delta","timestamp":"...","runId":"...","data":{"delta":{"contentChunk":"Hello"}}}

       data: {"type":"agent.tool.execution.started","timestamp":"...","runId":"...","data":{...}}

       ```

       * Each event is prefixed with `data:` .
       * Events are separated by a double newline (`\n`).
   * These formatted event strings are written to the HTTP response stream.
4. **Client-Side Processing**:
   * On the client-side (e.g., in a browser using JavaScript's `EventSource` API, or the `parseSSEStream` utility in `@ulifeai/agentb-ui`), an `EventSource` object connects to the SSE endpoint.
   * It listens for "message" events.
   * When an event arrives, the client parses the `event.data` (which is the JSON string) back into an `AgentEvent` object.
   * The client application then updates the UI or performs other actions based on the `type` and `data` of the received `AgentEvent`.

## `parseSSEStream` Utility (from `@ulifeai/agentb-ui`)

The `@ulifeai/agentb-ui` package (in `ui/src/api.ts`) includes a crucial utility function: `async function* parseSSEStream<T extends AgentEvent>(streamReader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<T, void, undefined>`.

* **Purpose**: This async generator function is designed to be used on the client-side to consume an SSE stream delivered via the Fetch API's `ReadableStream`.
* **How it Works**:
  1. Takes a `ReadableStreamDefaultReader<Uint8Array>` (obtained from `fetch(url).then(res => res.body.getReader())`).
  2. Uses a `TextDecoder` to convert `Uint8Array` chunks into text.
  3. Buffers incoming text because SSE events (JSON objects) can be split across multiple stream chunks.
  4. Looks for the `\n` delimiter to identify complete SSE message blocks.
  5. For each message block, it splits lines and processes lines starting with `data:` .
  6. It extracts the JSON string after `data:` , parses it into an `AgentEvent` object, and `yield`s it.
  7. Handles partial data at the end of the stream gracefully.

**Simplified Client-Side Usage with `parseSSEStream` (conceptual):**

```typescript
import { parseSSEStream, AgentEvent } from '@ulifeai/agentb-ui/api'; // Or adjust path if using directly

async function fetchAndProcessAgentStream(backendUrl: string, userPrompt: string, threadId?: string) {
  const response = await fetch(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ prompt: userPrompt, threadId: threadId }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to connect to agent stream: ${response.status}`);
  }

  const streamReader = response.body.getReader();

  try {
    for await (const agentEvent of parseSSEStream<AgentEvent>(streamReader)) {
      console.log("Received Agent Event:", agentEvent.type, agentEvent.data);
      // Update your UI based on the agentEvent
      if (agentEvent.type === 'thread.message.delta' && agentEvent.data.delta.contentChunk) {
        // append agentEvent.data.delta.contentChunk to display
      }
      // ... handle other event types ...
    }
    console.log("Stream finished.");
  } catch (error) {
    console.error("Error processing SSE stream:", error);
  } finally {
    streamReader.releaseLock(); // Important to release the lock on the reader
  }
}
```

The `useChat` hook in `@ulifeai/agentb-ui` uses this `parseSSEStream` utility internally to manage the event stream and update React state.

## Benefits of SSE for AgentB

* **Real-time Updates**: Clients receive immediate feedback as the agent thinks, types, or uses tools.
* **Efficiency**: Avoids the overhead of repeated polling.
* **Simplicity**: Easier to implement on both server and client compared to WebSockets for one-way server-to-client communication.
* **Standardization**: Built on web standards, ensuring broad compatibility.

## Handling Connection Issues

* **Client-Side (`EventSource`)**: Browsers implementing `EventSource` will automatically attempt to reconnect if the connection drops, typically with an increasing backoff period. They will also send the `Last-Event-ID` header (if the server sent event IDs) to allow the server to potentially resume from where it left off, though AgentB's default SSE implementation doesn't heavily rely on event IDs for resumption in the same HTTP request. A new request typically starts a new interaction or continues a specific run based on `threadId` and potentially `runId`.
* **Server-Side**: The AgentB server handler manages the lifecycle of a single agent interaction per HTTP request. If a connection drops mid-stream from the client's perspective, the server-side agent run might continue to completion or fail, and its state would be persisted by the `IAgentRunStorage`. A subsequent request from the client (perhaps with the same `threadId`) would either start a new run or could be designed to query the status of a previous `runId`.

Understanding SSE and how AgentB uses it for event streaming is key to building responsive UIs and effectively processing the rich flow of information from your AI agents. The `AgentB.getExpressStreamingHttpHandler` and the client-side `parseSSEStream` (or the `useChat` hook) provide robust mechanisms for this.
