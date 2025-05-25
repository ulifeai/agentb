# @your-org/agentb-chat-ui (Package Name TBD)

## Description

A React component library for an easy-to-integrate AI chat interface, designed to work with an AgentB-powered backend. This library provides the necessary UI components to quickly set up a chat window in your React application.

## Installation

**Note:** This package is not yet published to any npm registry. The following are placeholder instructions.

Once published, you can install it using npm or yarn:

```bash
npm install @your-org/agentb-chat-ui
# or
yarn add @your-org/agentb-chat-ui
```

For now, to use this package, you would typically build it locally and link it, or use a tool like `yalc` for local development.

## Usage

To use the chat component, import `AgentBChat` and its stylesheet into your React application.

```javascript
import React from 'react';
import { AgentBChat, ChatMessage } from '@your-org/agentb-chat-ui'; // Adjust path if using locally from source
import '@your-org/agentb-chat-ui/dist/styles.css'; // Path after the package is built

function MyApp() {
  // Example: Pre-populating messages
  const initialMessages: ChatMessage[] = [
    { id: 'init-1', text: 'Welcome! How can I assist you?', sender: 'ai', status: 'sent', timestamp: new Date().toISOString() },
  ];

  return (
    <div>
      {/* Other application content */}
      <AgentBChat
        backendUrl="http://localhost:3001/api/agentb_chat" // **IMPORTANT:** Replace with your actual AgentB backend SSE endpoint
        chatWindowTitle="My AI Assistant"
        initialMessages={initialMessages} // Optional
        // initialThreadId="your-saved-thread-id" // Optional: To resume a previous conversation
      />
    </div>
  );
}

export default MyApp;
```

### Backend Requirement

This component requires a backend service that exposes AgentB's functionality via a Server-Sent Events (SSE) endpoint. The `backendUrl` prop must point to this endpoint. For details on setting up such a backend, please refer to the main AgentB project documentation (or the relevant setup guide for your AgentB instance).

The backend is expected to handle events like `thread.message.delta`, `thread.message.completed`, `thread.run.failed`, etc., as defined by the AgentB streaming protocol.

## Props for `<AgentBChat />`

The `AgentBChat` component accepts the following props:

*   `backendUrl: string` (Required): The URL of your AgentB Server-Sent Events (SSE) endpoint. The chat component will make POST requests to this URL to initiate chat streams.
*   `initialThreadId?: string`: An optional ID to resume an existing chat thread. If provided, the component will attempt to continue the conversation associated with this ID.
*   `initialMessages?: ChatMessage[]`: An optional array of `ChatMessage` objects to pre-populate the chat window. This can be used to load conversation history.
*   `chatWindowTitle?: string`: An optional title displayed at the top of the chat window. Defaults to "AgentB Chat".
*   `messageInputPlaceholder?: string`: Optional placeholder text for the message input field. Defaults to "Type a message...".
*   `className?: string`: Optional CSS class name to apply to the root container of the chat component for custom styling. Defaults to `agentb-chat-container`.

## `ChatMessage` Type

If you use `initialMessages` or need to interact with message objects, their structure is as follows:

```typescript
interface ChatMessage {
  id: string;                        // Unique identifier for the message
  text: string;                      // Content of the message
  sender: 'user' | 'ai' | 'system';  // Who sent the message ('system' for status/error messages)
  timestamp?: string;                 // ISO string representation of when the message was sent/received
  status?: 'sending' | 'sent' | 'failed' | 'streaming'; // UI feedback on message state
}
```

## Styling

A default stylesheet (`dist/styles.css` after build) is provided and should be imported into your application. The components use specific CSS classes (documented within `styles.css` or inspectable via browser developer tools). You can override these styles with your own CSS rules by targeting these classes or by using the `className` prop on `AgentBChat` for top-level customization.

The CSS uses custom properties (variables) for key theme elements like colors and spacing, allowing for easier theming by overriding these variables in your own stylesheets.

## Contributing / Development

(Details to be added. For now, standard practices like forking, branching, and submitting PRs apply. Ensure code is formatted and linted.)

To build the package locally (once build scripts are set up):
```bash
# (from the root of the agentb-chat-ui package)
npm run build
```

## Running the Example

An example project is available in the `examples/simple-chat` directory. To run it:

1.  **Build the `agentb-chat-ui` package:** Ensure the main package has been built so that `dist/styles.css` and the JavaScript modules are available. (This step will be formalized later. For now, the example may point to `src`.)
    ```bash
    # (from packages/agentb-chat-ui)
    # npm run build (once available)
    ```
2.  **Navigate to the example directory:**
    ```bash
    cd examples/simple-chat
    ```
3.  **Install example dependencies:**
    ```bash
    npm install
    ```
    This installs React, ReactDOM, and a bundler like Parcel.
4.  **Run the example:**
    ```bash
    npm start
    ```
    This will typically start a development server (e.g., Parcel on `http://localhost:1234`).
5.  **Ensure your AgentB backend is running** and accessible at the URL specified in `examples/simple-chat/App.tsx` (default: `http://localhost:3001/api/agentb_chat`).

**Note:** The example's `App.tsx` imports components directly from `../../src` for ease of development within the monorepo before the package is formally built and linked. When consuming the published package, the import paths will be from `@your-org/agentb-chat-ui`. The `styles.css` path in `index.html` also assumes it will be available relative to the example after a build or manual copy.Okay, the `README.md` has been created.

Now, I will create the `examples` directory.
