// Example: in your main App.tsx
import React from 'react';
import { AgentBChat } from '@ulifeai/agentb-ui'; // Adjust import path
import '@ulifeai/agentb-ui/dist/styles.css'; // Assuming you build CSS to dist


// const initialMessages= [
//   { id: 'init-1', text: 'Hei what\'s up! How can I assist you?', sender: 'ai', status: 'sent', timestamp: new Date().toISOString() },
// ];


function App() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px' }}>
      <div style={{ width: '800px', height: '80vh' }}> {/* Wrapper to control size */}
        <AgentBChat
          backendUrl="http://localhost:3001/agent/stream" // Your backend URL
          title="My AI Assistant"
          // initialThreadId="some-existing-thread-id" // Optional
          // initialMessages={initialMessages} // Optional
        />
      </div>
    </div>
  );
}

export default App;