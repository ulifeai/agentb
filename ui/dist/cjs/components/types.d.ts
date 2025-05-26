import { AgentEvent } from '../api';
export interface ChatMessage {
    id: string;
    text: string;
    sender: 'user' | 'ai' | 'system' | 'tool_thought' | 'tool_executing' | 'tool_result';
    timestamp: string;
    status: 'sending' | 'sent' | 'failed' | 'streaming' | 'in_progress' | 'completed' | 'error';
    metadata?: {
        eventType?: AgentEvent['type'];
        toolName?: string;
        toolInput?: Record<string, any> | string;
        toolOutput?: any;
        isError?: boolean;
        stepId?: string;
        originalEvent?: AgentEvent;
    };
}
//# sourceMappingURL=types.d.ts.map