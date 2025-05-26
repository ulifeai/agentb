import React from 'react';
import { UseChatOptions } from '../../hooks/useChat';
import './AgentBChat.css';
export interface AgentBChatProps extends UseChatOptions {
    backendUrl: string;
    initialThreadId?: string;
    title?: string;
    containerClassName?: string;
}
export declare const AgentBChat: React.FC<AgentBChatProps>;
//# sourceMappingURL=AgentBChat.d.ts.map