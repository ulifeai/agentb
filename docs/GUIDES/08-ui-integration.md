# In-Depth Guide: UI Integration with `@ulifeai/agentb-ui`

The `@ulifeai/agentb-ui` package provides React components and hooks to quickly build a rich, interactive chat interface for your AgentB agents. It handles the complexities of Server-Sent Event (SSE) stream consumption, message state management, and rendering of different event types.

This guide focuses on using the primary components and the `useChat` hook.

## Key Components & Hooks

1.  **`<AgentBChat />` Component**:
    *   The main, all-in-one chat component.
    *   Renders a complete chat interface including a message list, message input field, and status indicators.
    *   Internally uses the `useChat` hook to manage state and communication.

2.  **`useChat` Hook (`import { useChat } from '@ulifeai/agentb-ui';`)**:
    *   The core React hook for managing agent interactions.
    *   **Responsibilities**:
        *   Initiating requests to your AgentB backend's streaming SSE endpoint.
        *   Consuming and parsing the SSE stream of `AgentEvent`s using `parseSSEStream`.
        *   Managing the list of `ChatMessage` objects displayed in the UI.
        *   Handling message accumulation for streaming text responses.
        *   Tracking loading states, streaming status, and errors.
        *   Providing a `sendMessage` function to send user input to the backend.
    *   **Returns**: An object containing `messages`, `sendMessage`, `isLoading`, `isStreaming`, `error`, `threadId`, `setMessages`, and `currentRunId`.

3.  **Supporting Components (Often used internally by `<AgentBChat />`)**:
    *   `<MessageList />`: Renders the list of `ChatMessage`s.
    *   `<MessageItem />`: Renders a single chat message, styled according to its sender and content type (text, tool thought, tool result, error, etc.).
    *   `<MessageInput />`: The text input field for the user.

4.  **Types (`ChatMessage`, `AgentEvent`, etc.)**:
    *   The package re-exports `AgentEvent` types (mirrored from the backend) and defines UI-specific types like `ChatMessage` which adapts `AgentEvent` data for display.

## Using `<AgentBChat />`

This is the simplest way to add a full chat UI.

**1. Installation (Reminder):**
```bash
npm install @ulifeai/agentb-ui react-icons uuid tailwind-merge clsx
# or
yarn add @ulifeai/agentb-ui react-icons uuid tailwind-merge clsx
```

**2. Import and Use:**
```tsx title="src/MyChatPage.tsx"
import React from 'react';
import { AgentBChat, UseChatOptions } from '@ulifeai/agentb-ui';
// You might need to import default styles or set up Tailwind
// import '@ulifeai/agentb-ui/dist/style.css'; // Path depends on package structure

function MyChatPage() {
  const chatOptions: UseChatOptions = {
    backendUrl: 'http://localhost:3001/agent/stream', // Your AgentB SSE endpoint
    // Optional:
    // initialThreadId: 'existing-thread-id',
    // initialMessages: [
    //   { id: '1', text: 'Hello from initial props!', sender: 'user', status: 'sent', timestamp: new Date().toISOString() }
    // ],
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Optional: Add your app's header/navbar here */}
      <header style={{ padding: '1rem', backgroundColor: '#eee' }}>My AgentB Chat App</header>

      <div style={{ flexGrow: 1, position: 'relative' /* For potential absolute positioning inside AgentBChat */ }}>
        <AgentBChat
          options={chatOptions}
          // --- Optional Customization Props ---
          // title="My Virtual Assistant"
          // inputPlaceholder="Type your message..."
          // showSuggestions={false} // Example: disable default suggestions
          // See package documentation for all available props
        />
      </div>
    </div>
  );
}

export default MyChatPage;
```

**3. Backend Server:**
Ensure your AgentB backend (e.g., using `AgentB.getExpressStreamingHttpHandler()`) is running and accessible at the `backendUrl`. Crucially, it must have CORS enabled if your React app and backend are on different origins/ports.

The `<AgentBChat />` component will then render a complete chat interface.

## Using the `useChat` Hook (For Custom UIs)

If you need to build a completely custom chat UI but want to leverage AgentB's robust state management and SSE handling, you can use the `useChat` hook directly.

**`UseChatOptions` (passed to the hook):**
```typescript
interface UseChatOptions {
  backendUrl: string;
  initialThreadId?: string;
  initialMessages?: ChatMessage[]; // UI's ChatMessage type
}
```

**`UseChatReturn` (what the hook returns):**
```typescript
interface UseChatReturn {
  messages: ChatMessage[]; // Array of messages to display
  sendMessage: (text: string) => Promise<void>; // Function to send a user message
  isLoading: boolean;    // True if waiting for the initial part of agent's response (before streaming starts)
  isStreaming: boolean;  // True if the agent is currently streaming text
  error: string | null;  // Any error message from the interaction
  threadId: string | null; // The current conversation thread ID
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; // To directly manipulate messages if needed
  currentRunId: string | null; // ID of the current agent run
}
```

**Example: Basic Custom UI with `useChat`**
```tsx title="src/MyCustomChat.tsx"
import React, { useState, useEffect, useRef } from 'react';
import { useChat, ChatMessage } from '@ulifeai/agentb-ui'; // Assuming ChatMessage is exported

function MyCustomChat() {
  const {
    messages,
    sendMessage,
    isLoading,
    isStreaming,
    error,
    threadId
  } = useChat({
    backendUrl: 'http://localhost:3001/agent/stream',
  });

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '400px', border: '1px solid #ccc' }}>
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
        {messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: '10px', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
            <span style={{
              backgroundColor: msg.sender === 'user' ? '#dcf8c6' : (msg.sender === 'system' || msg.metadata?.isError) ? '#fdecea' : '#fff',
              padding: '5px 10px',
              borderRadius: '7px',
              boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
              display: 'inline-block',
              maxWidth: '70%',
            }}>
              <strong>{msg.sender}: </strong>{msg.text}
              {msg.status === 'failed' && <em style={{color: 'red'}}> (failed)</em>}
              {msg.metadata?.toolName && <em style={{fontSize: '0.8em', display: 'block', color: '#555'}}>Tool: {msg.metadata.toolName}</em>}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {isLoading && <p>Agent is thinking...</p>}
      {isStreaming && <p>Agent is typing...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', padding: '10px' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type your message..."
          style={{ flexGrow: 1, padding: '10px', marginRight: '10px' }}
          disabled={isLoading || isStreaming}
        />
        <button type="submit" disabled={isLoading || isStreaming} style={{ padding: '10px' }}>
          Send
        </button>
      </form>
      {threadId && <p style={{fontSize: '0.8em', textAlign: 'center'}}>Thread ID: {threadId}</p>}
    </div>
  );
}

export default MyCustomChat;
```
This example is basic but shows how `useChat` provides the necessary state and functions to build your own interface.

## `ChatMessage` Interface (UI-Specific)

The `messages` array returned by `useChat` (and used by `<AgentBChat />`) contains objects of type `ChatMessage`. This interface is defined in `@ulifeai/agentb-ui` (in `ui/src/components/types.ts`) and adapts backend `AgentEvent` data for display.

**Key `ChatMessage` properties:**
```typescript
export interface ChatMessage {
  id: string; // Unique message ID (can be original message ID or generated for UI thoughts)
  text: string; // Main content or description of the event for display
  sender: 'user' | 'ai' | 'system' | 'tool_thought' | 'tool_executing' | 'tool_result';
  timestamp: string; // ISO string
  status: 'sending' | 'sent' | 'failed' | 'streaming' | 'in_progress' | 'completed' | 'error';
  metadata?: {
    eventType?: AgentEvent['type']; // Original backend event type
    toolName?: string;
    toolInput?: Record<string, any> | string;
    toolOutput?: any; // Success data or error string/object
    isError?: boolean;
    stepId?: string;
    originalEvent?: AgentEvent; // The full backend event for debugging/advanced rendering
  };
}
```
The `useChat` hook intelligently processes backend `AgentEvent`s and creates/updates these `ChatMessage` objects. For example:
*   `thread.message.delta` with `contentChunk` appends to an 'ai' sender message with `status: 'streaming'`.
*   `agent.tool.execution.started` might create a message with `sender: 'tool_executing'` and text like "Executing tool X...".
*   `agent.tool.execution.completed` updates that message to `sender: 'tool_result'` with success/failure details.

## Styling

The `<AgentBChat />` component and its sub-components are designed with Tailwind CSS in mind but include default functional styling. You can:
*   **Use Tailwind**: If your project uses Tailwind CSS, the components should pick up your theme and allow utility class overrides.
*   **CSS Overrides**: Target the components' CSS classes with your own stylesheets. Inspect the rendered HTML to find the class names used (they are typically prefixed, e.g., `agentb-chat-container`, `agentb-message-item`).
*   **Style Props (Limited)**: Some components might accept `style` or `className` props for direct styling. Check the specific component's documentation/props.

## Summary

`@ulifeai/agentb-ui` significantly accelerates the development of chat interfaces for your AgentB agents.
*   For a quick, full-featured UI, use **`<AgentBChat />`**.
*   For maximum control over UI presentation while still benefiting from AgentB's client-side logic, use the **`useChat` hook**.

Always ensure your AgentB backend server is running, correctly configured (especially CORS), and that the `backendUrl` in your UI points to the correct SSE endpoint. 