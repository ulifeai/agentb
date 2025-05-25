// packages/agentb-chat-ui/src/components/MessageList.tsx
import React, { useEffect, useRef } from 'react';
import { ChatMessage } from './types';
import { MessageItem } from './MessageItem';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessage[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Scroll whenever messages change

  if (messages.length === 0) {
    return (
      <div className="message-list message-list__empty">
        <span className="message-list__empty-icon">👋</span>
        <p>No messages yet. Say hello!</p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};