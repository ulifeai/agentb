# API Reference: UI Components

The `@ulifeai/agentb-ui` package offers pre-built React components for quickly assembling a chat interface. These components are used internally by `<AgentBChat />` but can also be used individually if you need more control over the layout than `useChat` alone provides while still wanting pre-styled pieces.

**Note**: The availability and props of these individual components may evolve. `<AgentBChat />` is the most stable and recommended way to get a full UI quickly. For custom UIs, `useChat` hook is the primary tool.

**Common Imports:**
```typescript
import { MessageList, MessageItem, MessageInput /*, AgentBChat */ } from '@ulifeai/agentb-ui';
import { ChatMessage } from '@ulifeai/agentb-ui'; // For message data structure
// Potentially: import '@ulifeai/agentb-ui/dist/style.css'; // If default styles are needed and not globally imported
```

---

## `<AgentBChat />`

The primary all-in-one component that renders a complete chat interface.

**Props:**

*   **`options: UseChatOptions` (Required)**:
    *   Configuration for the internal `useChat` hook.
    *   `backendUrl: string`: URL to your AgentB SSE endpoint.
    *   `initialThreadId?: string`: Optional initial thread ID.
    *   `initialMessages?: ChatMessage[]`: Optional array of messages to pre-fill.
*   **`title?: string | React.ReactNode`**:
    *   Optional title displayed at the top of the chat window.
    *   Default: "AgentB Chat".
*   **`inputPlaceholder?: string`**:
    *   Placeholder text for the message input field.
    *   Default: "Type a message...".
*   **`className?: string`**:
    *   Custom CSS class to apply to the root container of the chat component.
*   **`style?: React.CSSProperties`**:
    *   Custom inline styles for the root container.
*   **`headerActions?: React.ReactNode`**:
    *   Custom React nodes to render in the header, typically for action buttons (e.g., clear chat, settings).
*   **`inputActions?: React.ReactNode`**:
    *   Custom React nodes to render near the message input area (e.g., file attachment button - functionality not built-in).
*   **`renderMessage?: (message: ChatMessage, index: number, messages: ChatMessage[]) => React.ReactNode`**:
    *   Advanced: A custom render function for individual messages. If provided, overrides the default `MessageItem` rendering for all messages.
*   **`onMessageSent?: (messageText: string, threadId: string | null) => void`**:
    *   Callback fired after a user message is successfully submitted via the input.
*   **`onStreamStart?: () => void`**:
    *   Callback fired when the assistant starts streaming a response.
*   **`onStreamEnd?: (error?: string | null) => void`**:
    *   Callback fired when the assistant's stream ends (successfully or with an error). `error` argument contains the error message if the stream ended due to an error.
*   **`showSuggestions?: boolean`**:
    *   Whether to show example suggestion chips above the input (if configured or LLM provides them - future feature). Default: `true` (may show if available).
*   **`suggestions?: string[]`**:
    *   An array of strings to display as clickable suggestion chips.

**Usage Example:**
See [UI Integration Guide](../GUIDES/08-ui-integration.md#using-agentbchat-) or [Tutorial 3](../TUTORIALS/03-adding-the-chat-ui.md).

---

## `<MessageList />`

Component responsible for rendering a scrollable list of chat messages. It typically receives the `messages` array from the `useChat` hook.

**Props:**

*   **`messages: ChatMessage[]` (Required)**:
    *   The array of `ChatMessage` objects to display.
*   **`className?: string`**:
    *   Custom CSS class for the message list container.
*   **`renderMessageItem?: (message: ChatMessage, index: number, messages: ChatMessage[]) => React.ReactNode`**:
    *   Optional custom render function for each `MessageItem`. If not provided, uses a default `MessageItem` rendering. This gives more granular control than `AgentBChat.renderMessage` which replaces all message rendering.

**Internal Behavior:**
*   Automatically scrolls to the bottom when new messages are added.
*   Uses `MessageItem` internally to render each message unless `renderMessageItem` is provided.

---

## `<MessageItem />`

Component responsible for rendering a single chat message. It handles different styles and layouts based on the `message.sender`, `message.status`, and `message.metadata`.

**Props:**

*   **`message: ChatMessage` (Required)**:
    *   The `ChatMessage` object to render.
*   **`className?: string`**:
    *   Custom CSS class for the message item container.
*   **`showAvatar?: boolean`**:
    *   Whether to display an avatar next to the message (default may vary).
*   **`avatarRenderer?: (message: ChatMessage) => React.ReactNode`**:
    *   Custom function to render an avatar for the message.
*   **`contentRenderer?: (message: ChatMessage) => React.ReactNode`**:
    *   Advanced: Custom function to render the main content block of the message, overriding default text, tool thought, and tool result rendering.

**Rendering Logic based on `message.sender` and `message.metadata`:**
*   **`user`**: Typically right-aligned, distinct background.
*   **`ai`**: Typically left-aligned. Content is streamed if `status` is `'streaming'`.
*   **`system`**: Often centered or styled distinctively for system notifications or errors.
*   **`tool_thought`**: Displays text like "Agent plans to use ToolX..." with specific styling.
*   **`tool_executing`**: Displays text like "Executing ToolX..." with loading indicators.
*   **`tool_result`**: Displays success/failure of a tool, often with collapsable input/output details from `message.metadata.toolInput` and `message.metadata.toolOutput`.
*   Error states (`message.status === 'failed'` or `message.metadata.isError`) are usually highlighted.

---

## `<MessageInput />`

Component for the user to type and submit messages.

**Props:**

*   **`onSubmit: (text: string) => void` (Required)**:
    *   Callback function called when the user submits a message (e.g., by pressing Enter or clicking a send button). The `text` argument is the trimmed message content.
*   **`placeholder?: string`**:
    *   Placeholder text for the input field. Default: "Type a message...".
*   **`initialValue?: string`**:
    *   An initial value for the input field.
*   **`disabled?: boolean`**:
    *   If `true`, the input field and send button are disabled (e.g., while `isLoading` or `isStreaming` from `useChat`).
*   **`className?: string`**:
    *   Custom CSS class for the input area container.
*   **`inputClassName?: string`**:
    *   Custom CSS class for the `<textarea>` or `<input>` element itself.
*   **`sendButtonContent?: React.ReactNode`**:
    *   Custom content for the send button (e.g., an icon). Default is usually a send icon or "Send".

**Internal Behavior:**
*   Typically uses a `<textarea>` that can grow with input.
*   Handles Enter key submission (often Shift+Enter for newline).

---

These components and the `useChat` hook form the foundation of `@ulifeai/agentb-ui`. While `<AgentBChat />` is the easiest way to get started, understanding the underlying hook and individual components allows for greater customization if needed. Always refer to the package's specific version documentation for the most accurate and complete list of props and features, as APIs can evolve. 