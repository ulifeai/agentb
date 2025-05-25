import React from 'react';
import { ChatMessage } from './types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isSending?: boolean; // User's message is being sent OR AI is replying
  aiIsThinking?: boolean; // Specifically for AI generating response
  messageInputPlaceholder?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  messages,
  onSendMessage,
  isSending,
  aiIsThinking,
  messageInputPlaceholder,
}) => {
  return (
    <div className="chat-window">
      {/* Header can be added here */}
      <MessageList messages={messages} />
      {aiIsThinking && (
        <div className="ai-thinking-indicator">
          AI is thinking...
        </div>
      )}
      <MessageInput
        onSendMessage={onSendMessage}
        isLoading={isSending??false}
        placeholder={messageInputPlaceholder}
      />
    </div>
  );
};
