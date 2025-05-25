// packages/agentb-chat-ui/src/components/AgentBChat.tsx
import React from 'react';
import { useChat, UseChatOptions } from '../hooks/useChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import './AgentBChat.css';

export interface AgentBChatProps extends UseChatOptions {
  title?: string;
  containerClassName?: string; // Allow custom class for the main container
}

export const AgentBChat: React.FC<AgentBChatProps> = ({ 
  backendUrl, 
  initialThreadId, 
  initialMessages, 
  title = "Agent Chat",
  containerClassName = "agentb-chat" // Default class
}) => {
  const {
    messages,
    sendMessage,
    isLoading,
    isStreaming,
    error,
    threadId,
    // currentRunId // Available if needed for display
  } = useChat({ backendUrl, initialThreadId, initialMessages });

  return (
    <div className={containerClassName}>
      <header className="agentb-chat__header">
        <h2 className="agentb-chat__header-title">{title}</h2>
        {threadId && !threadId.startsWith('temp-') && (
          <small className="agentb-chat__header-threadid">
            ID: {threadId.substring(0, 8)}...
          </small>
        )}
      </header>

      {error && <div className="agentb-chat__error-bar">Error: {error}</div>}
      
      <MessageList messages={messages} />
      
      {(isLoading || isStreaming) && (
        <div className="agentb-chat__loading-indicator">
          {isStreaming ? 'AI is responding...' : (isLoading ? 'Agent is working...' : '')}
        </div>
      )}
      
      <MessageInput onSendMessage={sendMessage} isLoading={isLoading && !isStreaming} />
    </div>
  );
};