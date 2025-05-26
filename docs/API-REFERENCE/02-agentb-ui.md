# API Reference: `@ulifeai/agentb-ui`

The `@ulifeai/agentb-ui` package provides React hooks and components to rapidly build interactive chat interfaces for your AgentB agents. It handles SSE stream consumption, message state management, and rendering of various agent events.

**Installation:**
```bash
npm install @ulifeai/agentb-ui react-icons uuid tailwind-merge clsx
# or
yarn add @ulifeai/agentb-ui react-icons uuid tailwind-merge clsx
```
Peer dependencies like `react`, `react-dom` are assumed to be present in your React project.

## Main Exports

*   **Hooks**:
    *   [`useChat`](./02a-usechat-hook.md): The core hook for managing chat state and backend communication.
*   **Components**:
    *   [`AgentBChat`](./02b-ui-components.md#agentbchat): An all-in-one chat UI component.
    *   [`MessageList`](./02b-ui-components.md#messagelist): Component for rendering a list of messages.
    *   [`MessageItem`](./02b-ui-components.md#messageitem): Component for rendering a single message.
    *   [`MessageInput`](./02b-ui-components.md#messageinput): Component for user message input.
*   **Types**:
    *   `AgentEvent` (and specific event types like `AgentEventMessageDelta`): Mirrored types from the backend for SSE payloads.
    *   `ChatMessage`: UI-specific representation of a message for display.
    *   `UseChatOptions`, `UseChatReturn`: Option and return types for the `useChat` hook.
*   **Utilities**:
    *   `parseSSEStream`: Async generator for parsing SSE streams (used internally by `useChat`).

Navigate to the specific sub-pages for detailed API information on each component and hook. 