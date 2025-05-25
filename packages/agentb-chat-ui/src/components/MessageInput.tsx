import React, { useState } from 'react';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, disabled, placeholder = "Type a message..." }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="message-input-form">
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        disabled={disabled}
        className="message-input-field"
        placeholder={placeholder}
      />
      <button type="submit" disabled={disabled || !inputValue.trim()} className="message-input-button">
        Send
      </button>
    </form>
  );
};
