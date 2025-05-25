// Example: in your main App.tsx
import React from 'react';
import { AgentBChat } from '../../../src'; // Adjust import path
// import '../../dist/main.css'; // Assuming you build CSS to dist

function App() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '20px' }}>
      <div style={{ width: '800px', height: '80vh' }}> {/* Wrapper to control size */}
        <AgentBChat
          backendUrl="http://localhost:3001/agent/stream" // Your backend URL
          title="My AI Assistant"
          // initialThreadId="some-existing-thread-id" // Optional
          // initialMessages={[
          //   { id: '1', text: 'Hello from initial props!', sender: 'system', status: 'completed', timestamp: new Date().toISOString() }
          // ]} // Optional
        />
      </div>
    </div>
  );
}

export default App;