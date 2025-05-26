# Tutorial 3: Adding the Chat UI (`@ulifeai/agentb-ui`)

Now that you have an agent capable of basic chat and interacting with an API, let's give it a user-friendly web interface! The `@ulifeai/agentb-ui` package provides pre-built React components to quickly set up a chat UI.

**Goal**: Create a simple React application that uses the `useChat` hook and `<AgentBChat />` component from `@ulifeai/agentb-ui` to talk to the streaming HTTP server we set up in previous examples (or a new one).

## Prerequisites

*   Completed [Tutorial 2: Connecting AgentB to Your API](./02-agent-with-your-api.md) (you should have an agent server running, or be ready to set one up).
*   A React development environment (e.g., created with Create React App, Next.js, or Vite).
    *   If you don't have one, the quickest way is `npx create-react-app my-agentb-app --template typescript` or `npm create vite@latest my-agentb-app -- --template react-ts`.
*   `@ulifeai/agentb-ui` and its peer dependencies installed in your React project:
    ```bash
    # In your React project directory
    npm install @ulifeai/agentb-ui react-icons uuid tailwind-merge clsx
    # or
    yarn add @ulifeai/agentb-ui react-icons uuid tailwind-merge clsx
    ```
    *   `react-icons`: For icons used in the UI.
    *   `uuid`: For generating unique IDs for messages.
    *   `tailwind-merge`, `clsx`: Utilities for styling, often used with Tailwind CSS (though the UI components have default styling).

## Step 1: Set Up Your AgentB HTTP Server

You need a backend server that exposes the AgentB streaming endpoint. You can use the `server.ts` from the [Streaming HTTP Server guide](../GETTING-STARTED/03-streaming-http-server.md) or adapt the `apiAgent.ts` from Tutorial 2 to run as an Express server.

**Key things for your server (`server.ts`):**
*   It should be running (e.g., `node server.js` or `npx ts-node server.ts`).
*   It should listen on a known port (e.g., `http://localhost:3001`).
*   It must have CORS enabled if your React app runs on a different port (the example `server.ts` in the "Getting Started" section includes `app.use(cors())`).
*   The streaming endpoint should be `/agent/stream` (or whatever you configure).

## Step 2: Create the React Chat Component

In your React application (e.g., inside `src/App.tsx` if using Create React App or Vite):

```tsx title="src/App.tsx"
import React from 'react';
import { AgentBChat, UseChatOptions } from '@ulifeai/agentb-ui'; // Import the main chat component
import './App.css'; // Basic styling, or your Tailwind setup

function App() {
  const chatOptions: UseChatOptions = {
    backendUrl: 'http://localhost:3001/agent/stream', // URL of your AgentB streaming server
    // initialThreadId: 'my-persistent-thread-123', // Optional: Start with a specific thread
    // initialMessages: [ // Optional: Pre-populate messages
    //   {
    //     id: 'system-init',
    //     text: 'Welcome! How can I help you today?',
    //     sender: 'system',
    //     status: 'sent',
    //     timestamp: new Date().toISOString(),
    //   }
    // ],
  };

  return (
    <div className="app-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f0f2f5' }}>
      <div className="chat-wrapper" style={{ width: '90%', maxWidth: '700px', height: '80vh', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px', overflow: 'hidden' }}>
        <AgentBChat
          options={chatOptions}
          // Optional: Customize appearance and behavior
          // See @ulifeai/agentb-ui documentation for all props
          // E.g. title="My AgentB Assistant"
          // inputPlaceholder="Ask me anything..."
        />
      </div>
    </div>
  );
}

export default App;
```

**Minimal Styling (Optional - `src/App.css`):**
If you don't have Tailwind CSS set up, you can add some very basic CSS to make it look presentable.
```css title="src/App.css"
body, html, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: sans-serif;
}

/* The AgentBChat component has its own internal styling,
   but you might want to style its container. */
.app-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #f0f2f5; /* A light grey background */
}

.chat-wrapper {
  width: 90%;
  max-width: 700px; /* Max width for the chat window */
  height: 80vh;    /* Chat window takes 80% of viewport height */
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-radius: 8px;
  overflow: hidden; /* Ensures content stays within rounded borders */
  display: flex; /* Needed for AgentBChat to fill the wrapper */
  flex-direction: column; /* Needed for AgentBChat to fill the wrapper */
}

/* Ensure AgentBChat component itself takes full height of its wrapper */
.chat-wrapper > div[class*="agentb-chat-container"] { /* Target the root div of AgentBChat */
  height: 100% !important;
}
```
*The `@ulifeai/agentb-ui` components are designed to be stylable with Tailwind CSS, but also come with default functional styling.*

## Step 3: Run Your React App

1.  Ensure your AgentB backend server (from Step 1) is running.
2.  In your React project's terminal, start the development server:
    ```bash
    npm start
    # or
    yarn start
    # or (for Vite)
    # npm run dev
    # yarn dev
    ```
Your browser should open to your React app (usually `http://localhost:3000` or similar). You'll see the AgentBChat interface!

## Step 4: Interact!

Type messages into the input field. You should see:
*   Your messages appear.
*   The agent's responses stream in.
*   If your agent uses tools (like the FakeStoreAPI agent from Tutorial 2), you'll see messages indicating tool thoughts, execution, and results, styled appropriately by the UI components.

<img src="https://user-images.githubusercontent.com/16060517/228968195-21dfc549-0c43-4a02-a37e-210e82463990.png" alt="AgentB UI Screenshot" width="600"/>
*(Image is illustrative - actual UI might vary slightly based on `@ulifeai/agentb-ui` version)*


## Key Takeaways

*   **`@ulifeai/agentb-ui`**: Provides the chat UI components.
*   **`<AgentBChat />`**: The main component that renders the entire chat interface (message list, input, status indicators).
*   **`UseChatOptions`**: Configuration passed to `AgentBChat` (or directly to the `useChat` hook if you build a custom UI).
    *   `backendUrl`: Crucially points to your AgentB streaming server endpoint.
*   **Simplicity**: With just a few lines, you added a fully functional, streaming chat UI to your application.

The `useChat` hook (used internally by `<AgentBChat />`) handles all the communication with the backend, parsing SSE events, managing message state, and providing loading/streaming indicators.

## Customization (Beyond this Tutorial)

The `@ulifeai/agentb-ui` package offers more:

*   **`useChat` Hook**: If you want to build a completely custom UI, you can use the `useChat` hook directly to get messages, send messages, and manage state.
*   **Individual Components**: `<MessageList />`, `<MessageItem />`, `<MessageInput />` might be exported for more granular UI construction (check the package's documentation).
*   **Styling**: The components are designed to be easily styled, especially with Tailwind CSS. You can override default styles.
*   **Props**: `<AgentBChat />` and other components will have various props to customize behavior and appearance (e.g., `title`, `inputPlaceholder`, `initialMessages`, `onMessageSent`, etc.). Refer to the `@ulifeai/agentb-ui` documentation for details.

**Next Up**: [Handling Authentication with Your API](./04-api-authentication.md) to securely connect AgentB to protected API endpoints. 