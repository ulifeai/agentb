import React from 'react';
import ReactDOM from 'react-dom';
// Adjust import path based on how the package will be structured or consumed locally
// This path assumes the example is being run from within a context where 'agentb-chat-ui/src' is resolvable
// or after 'agentb-chat-ui' is built and linked. For simplicity, point to src for now.
import { AgentBChat, ChatMessage } from '../../src'; // Points to the local src for the example
// When consumed as a package, it would be:
// import { AgentBChat, ChatMessage } from '@your-org/agentb-chat-ui';
// import '@your-org/agentb-chat-ui/dist/styles.css';


// --- Mock Backend Setup (for example purposes only) ---
// In a real scenario, this Express server would be a separate process.
// This is just to illustrate what the backend might do.
// We can't run a real server here, so we'll just note it in comments.
/*
Backend server (e.g., server.js using Express):
const express = require('express');
const cors = require('cors');
const { AgentB } = require('agentb-framework'); // Assuming AgentB framework is available

const app = express();
app.use(cors());
app.use(express.json());

// Initialize AgentB (replace with your actual initialization)
AgentB.initialize({ llmProvider: { provider: 'openai', apiKey: 'YOUR_OPENAI_API_KEY' }});

const agentBExpressHandler = AgentB.getExpressStreamingHttpHandler({
    // Optional: customize thread ID retrieval, user message extraction, authorization
});

app.post('/api/agentb_chat', agentBExpressHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Mock AgentB backend server running on port ${PORT}`));
*/
// --- End Mock Backend Setup ---


const App: React.FC = () => {
  // Example: Pre-populating messages (e.g., from a loaded history)
  const demoInitialMessages: ChatMessage[] = [
    { id: '1', text: 'Hello AI!', sender: 'user', status: 'sent', timestamp: new Date(Date.now() - 200000).toISOString() },
    { id: '2', text: 'Hello User! How can I help you today?', sender: 'ai', status: 'sent', timestamp: new Date(Date.now() - 180000).toISOString() },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>AgentB Chat UI Example</h1>
      <p>This example demonstrates the <code>&lt;AgentBChat /&gt;</code> component.</p>
      <p>
        <strong>Important:</strong> You need a running AgentB backend service that this component can connect to.
        The <code>backendUrl</code> prop should point to your AgentB SSE endpoint.
        See comments in <code>App.tsx</code> for a conceptual backend setup.
      </p>
      <hr style={{ margin: '20px 0' }} />

      <AgentBChat
        backendUrl="http://localhost:3001/api/agentb_chat" // REPLACE with your actual backend URL
        chatWindowTitle="My AI Chatbot"
        initialMessages={demoInitialMessages} // Optional: start with some messages
        // initialThreadId="some-existing-thread-id" // Optional: resume a thread
      />
    </div>
  );
};

ReactDOM.render(<React.StrictMode><App /></React.StrictMode>, document.getElementById('root'));
