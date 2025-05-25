import React from 'react';
import { useChat, UseChatOptions } from '../hooks/useChat';
import { ChatWindow } from './ChatWindow';
// Ensure CSS is imported by the consuming application, e.g., import 'agentb-chat-ui/dist/styles.css';

export interface AgentBChatProps extends UseChatOptions {
  chatWindowTitle?: string;
  messageInputPlaceholder?: string;
  // className for custom styling of the root container
  className?: string; 
}

export const AgentBChat: React.FC<AgentBChatProps> = ({
  backendUrl,
  initialThreadId,
  initialMessages,
  chatWindowTitle = 'AgentB Chat',
  messageInputPlaceholder = "Type a message...",
  className = 'agentb-chat-container', // Default class
}) => {
  const { messages, sendMessage, isLoading, error, threadId } = useChat({
    backendUrl,
    initialThreadId,
    initialMessages,
  });

  return (
    <div className={className}>
      {chatWindowTitle && (
        <h2 className="chat-title">{chatWindowTitle}</h2>
      )}
      {error && (
        <div className="chat-error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
      <ChatWindow
        messages={messages}
        onSendMessage={sendMessage}
        isSending={isLoading} // Disables input while loading/sending
        aiIsThinking={isLoading} // Shows "AI is thinking..." when loading
        messageInputPlaceholder={messageInputPlaceholder}
      />
      {/* 
      // Optionally display threadId for debugging or other purposes 
      // This would need its own styling if uncommented
      {threadId && <p style={{fontSize: '0.8em', color: '#777', textAlign: 'center', marginTop: '10px'}}>Thread ID: {threadId}</p>} 
      */}
    </div>
  );
};
