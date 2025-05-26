# Advanced: Hierarchical Planner Agent with Custom UI (`useChat`)

This scenario demonstrates a more advanced AgentB setup:
1.  **Backend**: An AgentB server configured in `hierarchicalPlanner` mode. The primary agent is a `PlanningAgent` that uses the `DelegateToSpecialistTool` to delegate sub-tasks to "specialist" agents (toolsets).
2.  **Frontend**: A React application with a custom chat UI built using the `useChat` hook from `@ulifeai/agentb-ui`. This allows for fine-grained rendering of the complex event flow from a planning agent.

**Goal**: Illustrate how to handle the events from a planning agent in a custom UI, showing delegation steps and specialist results.

## Part 1: Backend Setup (Conceptual Overview)

For this scenario, your AgentB backend server (e.g., `server.ts`) would be initialized to support a planning agent.

**Key Backend Configuration (`server.ts` - simplified):**
```typescript
// server.ts (Simplified for this scenario)
import { AgentB, ToolProviderSourceConfig, ApiInteractionManagerOptions } from '@ulifeai/agentb';
// ... other necessary imports (Express, CORS, etc.)

async function startAdvancedServer() {
  // 1. Define ToolProviderSourceConfigs for "Specialists"
  const weatherSpecialistConfig: ToolProviderSourceConfig = {
    id: 'weatherServiceProvider',
    type: 'openapi',
    openapiConnectorOptions: {
      sourceId: 'weatherServiceProvider', // Matches id
      // Assuming a spec that provides a 'getWeather(location: string)' tool
      specUrl: 'YOUR_WEATHER_API_SPEC_URL_OR_LOCAL_PATH',
      // authentication: { ... if needed ... }
    },
    toolsetCreationStrategy: 'allInOne', // One toolset for all weather tools
    allInOneToolsetName: 'WeatherSpecialistTools',
    allInOneToolsetDescription: 'Provides tools to get weather forecasts.'
  };

  const calendarSpecialistConfig: ToolProviderSourceConfig = {
    id: 'calendarServiceProvider',
    type: 'openapi',
    openapiConnectorOptions: {
      sourceId: 'calendarServiceProvider',
      // Assuming a spec that provides 'createCalendarEvent(title: string, dateTime: string, location?: string)'
      specUrl: 'YOUR_CALENDAR_API_SPEC_URL_OR_LOCAL_PATH',
    },
    toolsetCreationStrategy: 'allInOne',
    allInOneToolsetName: 'CalendarSpecialistTools',
    allInOneToolsetDescription: 'Provides tools to manage calendar events.'
  };

  // 2. Initialize AgentB
  // The AgentB facade, when given multiple tool providers, will typically
  // default to a mode conducive to planning (like 'hierarchicalPlanner').
  AgentB.initialize({
    llmProvider: { provider: 'openai', model: 'gpt-4o-mini' }, // Or a more capable model for planning
    toolProviders: [weatherSpecialistConfig, calendarSpecialistConfig],
    defaultAgentRunConfig: {
      // The PlanningAgent will use a prompt like DEFAULT_PLANNER_SYSTEM_PROMPT
      // which lists 'WeatherSpecialistTools' and 'CalendarSpecialistTools' as available specialists.
       model: 'gpt-4o' // Planners often benefit from more capable models
    }
  });

  // 3. Setup Express App and SSE Endpoint (as in previous tutorials)
  const app = express();
  // ... app.use(express.json()), app.use(cors()) ...
  app.post('/advanced/stream', AgentB.getExpressStreamingHttpHandler({ /* ... options ... */ }));
  // ... app.listen() ...
  console.log("🚀 Advanced AgentB Server running with Planner configuration.");
}

startAdvancedServer();
```

**Explanation of Backend Setup:**
*   We register two tool providers (Weather and Calendar), each intended to become a "specialist" toolset.
*   `AgentB.initialize` with these providers will lead the internal `ApiInteractionManager` to likely operate in `hierarchicalPlanner` mode.
*   The primary agent will be a `PlanningAgent`. Its main tool will be `delegateToSpecialistAgent`.
*   The system prompt for the `PlanningAgent` will list "WeatherSpecialistTools" and "CalendarSpecialistTools" (IDs derived from `ToolProviderSourceConfig.id` or `allInOneToolsetName`) as available specialists it can delegate to.

## Part 2: Frontend Custom UI with `useChat`

Now, let's build a React component that uses `useChat` and renders the specific events from our planning agent.

**`src/PlannerChatInterface.tsx`:**
```tsx
import React, { useState, useEffect, useRef } from 'react';
import { useChat, ChatMessage, AgentEvent, UILLMToolCall } from '@ulifeai/agentb-ui'; // Ensure types are imported

// Helper to render tool call details nicely
const renderToolCall = (toolCall: UILLMToolCall) => (
  <div style={{ marginLeft: '10px', borderLeft: '2px solid #eee', paddingLeft: '10px', fontSize: '0.9em' }}>
    <strong>Tool:</strong> {toolCall.function.name} <br />
    <strong>Args:</strong> <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f9f9f9', padding: '5px', borderRadius: '4px' }}>{toolCall.function.arguments}</pre>
  </div>
);

function PlannerChatInterface() {
  const {
    messages,
    sendMessage,
    isLoading,
    isStreaming,
    error,
    threadId,
  } = useChat({
    backendUrl: 'http://localhost:3001/advanced/stream', // Ensure this matches your advanced server endpoint
  });

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText('');
  };

  const renderChatMessage = (msg: ChatMessage) => {
    let specialContent = null;
    const originalEvent = msg.metadata?.originalEvent as AgentEvent | undefined; // Cast for type safety

    // More detailed rendering based on event type or sender
    if (msg.sender === 'tool_thought' && originalEvent?.type === 'thread.run.step.tool_call.created') {
      const toolCall = (originalEvent.data as any).toolCall as UILLMToolCall;
      specialContent = (
        <>
          {msg.text}
          {renderToolCall(toolCall)}
        </>
      );
    } else if (msg.sender === 'tool_result' && originalEvent?.type === 'agent.tool.execution.completed') {
      const resultData = (originalEvent.data as any).result;
      specialContent = (
        <>
          {msg.text} (Success: {resultData.success.toString()})
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f9f9f9', padding: '5px', borderRadius: '4px', fontSize: '0.9em', maxHeight: '150px', overflowY: 'auto' }}>
            {resultData.success ? JSON.stringify(resultData.data, null, 2) : resultData.error}
          </pre>
        </>
      );
    } else if (msg.sender === 'tool_result' && originalEvent?.type === 'agent.sub_agent.invocation.completed') {
      // Handle display for sub_agent.invocation.completed specifically
      const subAgentEventData = originalEvent.data as any;
      const toolDisplayName = subAgentEventData.result.metadata?.delegatedToolName || `Specialist: ${subAgentEventData.specialistId}`;
      specialContent = (
        <>
          <strong>{toolDisplayName} (via delegate) {subAgentEventData.result.success ? 'completed' : 'failed'}.</strong> <br/>
          Run ID: {subAgentEventData.subAgentRunId} <br/>
          Result:
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f9f9f9', padding: '5px', borderRadius: '4px', fontSize: '0.9em', maxHeight: '150px', overflowY: 'auto' }}>
            {subAgentEventData.result.success ? JSON.stringify(subAgentEventData.result.data, null, 2) : subAgentEventData.result.error}
          </pre>
        </>
      );
    }


    return (
      <div key={msg.id} style={{ marginBottom: '15px', padding: '8px', borderRadius: '5px', backgroundColor: msg.sender === 'user' ? '#e1f5fe' : '#f1f1f1' }}>
        <strong style={{ textTransform: 'capitalize' }}>{msg.sender.replace('_', ' ')}</strong>
        {msg.metadata?.toolName && msg.sender !== 'tool_result' && ` (${msg.metadata.toolName})`}:
        <div style={{ marginTop: '5px' }}>
          {specialContent || msg.text}
        </div>
        <small style={{ display: 'block', textAlign: 'right', color: '#777', fontSize: '0.75em' }}>
          {new Date(msg.timestamp).toLocaleTimeString()}
          {msg.status === 'streaming' && ' (streaming...)'}
          {msg.status === 'failed' && <span style={{color: 'red'}}> (failed to send)</span>}
        </small>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 40px)', maxWidth: '800px', margin: '20px auto', border: '1px solid #ccc', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
      <h2 style={{ textAlign: 'center', padding: '10px 0', borderBottom: '1px solid #eee', margin: 0 }}>Planner Agent Chat</h2>
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '15px' }}>
        {messages.map(renderChatMessage)}
        <div ref={messagesEndRef} />
      </div>

      {(isLoading || isStreaming) && <div style={{padding: '0 15px 5px', fontStyle: 'italic', color: '#555'}}>{isLoading ? "Planner is thinking..." : "Planner is responding..."}</div>}
      {error && <div style={{ padding: '10px 15px', color: 'red', backgroundColor: '#ffebee' }}>Error: {error}</div>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', padding: '15px', borderTop: '1px solid #eee' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask the planner (e.g., 'What's the weather in London and add it to my calendar for tomorrow?')"
          style={{ flexGrow: 1, padding: '12px', marginRight: '10px', borderRadius: '5px', border: '1px solid #ddd' }}
          disabled={isLoading || isStreaming}
        />
        <button type="submit" disabled={isLoading || isStreaming} style={{ padding: '12px 20px', borderRadius: '5px', border: 'none', backgroundColor: '#007bff', color: 'white', cursor: 'pointer' }}>
          Send
        </button>
      </form>
      {threadId && <p style={{fontSize: '0.8em', textAlign: 'center', color: '#999', paddingBottom: '5px'}}>Thread: {threadId}</p>}
    </div>
  );
}

export default PlannerChatInterface;
```

**To use this in your React app (e.g. `App.tsx`):**
```tsx
import React from 'react';
import PlannerChatInterface from './PlannerChatInterface'; // Adjust path

function App() {
  return (
    <PlannerChatInterface />
  );
}
export default App;
```

## Running the Advanced Scenario

1.  **Start your Backend**: Ensure your `server.ts` (configured for hierarchical planning with Weather and Calendar specialists as outlined in Part 1) is running.
2.  **Start your Frontend**: Run your React development server (`npm start` or `yarn start`).
3.  **Interact**: Open your browser to the React app. Try a prompt like:
    *   "What's the weather like in London today, and can you create a calendar event for me tomorrow at 10 AM titled 'Follow up on weather report'?"

## Expected UI Behavior and Event Handling

When you send the complex prompt, your custom UI (thanks to the `renderChatMessage` function and `useChat`'s event processing) should display something like this sequence:

1.  **You**: "What's the weather..."
2.  **Planner is thinking...**
3.  **Agent (tool_thought)**: Planner intends to use `delegateToSpecialistAgent`.
    *   **Tool**: `delegateToSpecialistAgent`
    *   **Args**: `{"specialistId": "WeatherSpecialistTools", "subTaskDescription": "Get current weather for London"}`
4.  **Agent (tool_executing)**: Executing `delegateToSpecialistAgent` (Weather).
    *   *(Internally, the `DelegateToSpecialistTool` is now running a worker agent. The `useChat` hook in the UI doesn't see the worker's *internal* events by default, but it gets the final result of the `delegateToSpecialistAgent` tool call.)*
5.  **Agent (tool_result)**: `DelegateToSpecialistAgent` (Weather) completed.
    *   Success: true
    *   Data: `"The weather in London is 15°C and cloudy."` (This is the output from the Weather specialist worker)
6.  **Planner is responding...** (The planner LLM is now processing the weather result)
7.  **Agent (tool_thought)**: Planner intends to use `delegateToSpecialistAgent`.
    *   **Tool**: `delegateToSpecialistAgent`
    *   **Args**: `{"specialistId": "CalendarSpecialistTools", "subTaskDescription": "Create event: 'Follow up on weather report' tomorrow 10 AM"}`
8.  **Agent (tool_executing)**: Executing `delegateToSpecialistAgent` (Calendar).
9.  **Agent (tool_result)**: `DelegateToSpecialistAgent` (Calendar) completed.
    *   Success: true
    *   Data: `"Event 'Follow up on weather report' created successfully for tomorrow at 10 AM."`
10. **Planner is responding...**
11. **Agent (ai)**: "The weather in London is currently 15°C and cloudy. I've also added an event 'Follow up on weather report' to your calendar for tomorrow at 10 AM."

**Key aspects demonstrated in `PlannerChatInterface.tsx`:**

*   **`useChat`**: Manages the overall flow.
*   **`renderChatMessage`**: Custom function to inspect `msg.sender` and `msg.metadata.originalEvent` to provide richer display for different event types.
*   **Displaying Tool Calls**: When the planner decides to use `delegateToSpecialistAgent`, the UI shows the intended specialist and sub-task.
*   **Displaying Tool Results**: The UI shows the outcome from the `delegateToSpecialistAgent` tool, which includes the information retrieved or action performed by the specialist worker agent. The `agent.sub_agent.invocation.completed` event is key here and `useChat` maps this to a `tool_result` sender type.

## Customization and Further Steps

*   **Detailed Sub-Agent View**: For even more insight, you could modify `DelegateToSpecialistTool` to stream the *internal events* of its worker agent back to the planner agent (perhaps as part of its own streaming output or via a side channel). The planner could then emit custom events that the UI could pick up to show a nested view of the specialist's activity. This is significantly more complex.
*   **Error Handling**: Enhance `renderChatMessage` to display errors from tool executions or sub-agent invocations more prominently.
*   **Styling**: Apply more sophisticated CSS or a UI library for a polished look.
*   **Loading/Streaming Indicators**: The example has basic indicators; you can make these more elaborate.

This advanced scenario showcases the power of combining AgentB's hierarchical planning backend with a custom UI built using `useChat`, allowing you to visualize and interact with complex, multi-step agent behaviors. 