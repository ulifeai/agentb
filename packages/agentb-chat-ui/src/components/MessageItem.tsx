import React from 'react';
import { ChatMessage } from './types';

interface MessageItemProps {
  message: ChatMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  let wrapperClass = 'message-item-wrapper';
  let itemClass = 'message-item';

  switch (message.sender) {
    case 'user':
      wrapperClass += ' message-item-wrapper-user';
      itemClass += ' message-item-user';
      break;
    case 'ai':
      wrapperClass += ' message-item-wrapper-ai';
      itemClass += ' message-item-ai';
      break;
    case 'system':
      wrapperClass += ' message-item-wrapper-system';
      itemClass += ' message-item-system';
      break;
    default:
      // Default to AI styling or a generic one if sender is unexpected
      wrapperClass += ' message-item-wrapper-ai';
      itemClass += ' message-item-ai';
  }
  
  // System messages might not have status, or we might want to display it differently
  if (message.sender === 'system') {
    return (
      <div className={wrapperClass}>
        <div className={itemClass}>
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className={itemClass}>
        <div>{message.text}</div>
        {/* Show status only if it's not 'sent' or if it's explicitly defined and not empty */}
        {message.status && message.status !== 'sent' && message.status.length > 0 && (
          <small className="message-status">({message.status})</small>
        )}
      </div>
    </div>
  );
};
