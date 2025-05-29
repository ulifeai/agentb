import { AgentEvent } from '../api'; // Using the comprehensive AgentEvent from api.ts

export interface ChatMessage {
  id: string;
  text: string; // Main content or description of the event
  sender: 'user' | 'ai' | 'system' | 'tool_thought' | 'tool_executing' | 'tool_result';
  timestamp: string; // ISO string for easier Date parsing
  status: 'sending' | 'sent' | 'failed' | 'streaming' | 'in_progress' | 'completed' | 'error';
  metadata?: {
    eventType?: AgentEvent['type']; // Store the exact event type
    toolName?: string;
    toolInput?: Record<string, any> | string; // Input might be stringified
    toolOutput?: any; // Could be success data or error string/object
    isError?: boolean;
    stepId?: string;
    // Store the original event for debugging or advanced rendering if needed
    originalEvent?: AgentEvent; 
  };
}