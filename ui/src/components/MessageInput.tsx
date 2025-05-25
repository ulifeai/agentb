// packages/agentb-chat-ui/src/components/MessageInput.tsx
import React, { useState }  from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  placeholder?: string | undefined
}

// Simple Send Icon (replace with a proper icon library component)
const SendIcon = () => <span className="message-input-form__button-icon">➤</span>;


export const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, isLoading, placeholder }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Prevents newline in input on Enter
      handleSubmit(event as unknown as React.FormEvent); // Type assertion for event
    }
  };

  return (
    <form onSubmit={handleSubmit} className="message-input-form">
      <input
        type="text"
        className="message-input-form__text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? "Type your message..."}
        disabled={isLoading}
        aria-label="Chat message input"
      />
      <button 
        type="submit" 
        className="message-input-form__button"
        disabled={isLoading || !inputValue.trim()}
        aria-label="Send message"
      >
        <SendIcon />
      </button>
    </form>
  );
};