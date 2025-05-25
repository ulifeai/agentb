// packages/agentb-chat-ui/src/components/MessageItem.tsx
import React from 'react';
import { ChatMessage } from './types';
import './MessageItem.css'; 

// For a production app, use an icon library like react-icons
const UserIcon: React.FC = () => <>🧑</>;
const AIIcon: React.FC = () => <>🤖</>;
const SystemIcon: React.FC = () => <>⚙️</>;
const ToolIcon: React.FC = () => <>🛠️</>;
const ThinkingIcon: React.FC = () => <>🤔</>;
const BusyIcon: React.FC = () => <>⏳</>;

const getIcon = (sender: ChatMessage['sender']): JSX.Element => {
  switch (sender) {
    case 'user': return <UserIcon />;
    case 'ai': return <AIIcon />;
    case 'system': return <SystemIcon />;
    case 'tool_thought': return <ThinkingIcon />;
    case 'tool_executing': return <BusyIcon />;
    case 'tool_result': return <ToolIcon />;
    default: return <SystemIcon />;
  }
};

export const MessageItem: React.FC<{ message: ChatMessage }> = React.memo(({ message }) => {
  const { text, sender, timestamp, status, metadata } = message;

  const renderContent = () => {
    let mainText = text;
    let detailsBlock: React.ReactNode = null;

    if (sender === 'tool_thought' && metadata?.toolName) {
      mainText = `Planning to use tool: **${metadata.toolName}**`;
      if (metadata.toolInput && (typeof metadata.toolInput === 'object' ? Object.keys(metadata.toolInput).length > 0 : metadata.toolInput)) {
        detailsBlock = (
          <details className="message-item__details">
            <summary>Arguments</summary>
            <pre>{typeof metadata.toolInput === 'string' ? metadata.toolInput : JSON.stringify(metadata.toolInput, null, 2)}</pre>
          </details>
        );
      }
    } else if (sender === 'tool_executing' && metadata?.toolName) {
      mainText = `Executing tool: **${metadata.toolName}** ...`;
       if (metadata.toolInput && (typeof metadata.toolInput === 'object' ? Object.keys(metadata.toolInput).length > 0 : metadata.toolInput)) {
        detailsBlock = (
          <details className="message-item__details">
            <summary>Input</summary>
            <pre>{typeof metadata.toolInput === 'string' ? metadata.toolInput : JSON.stringify(metadata.toolInput, null, 2)}</pre>
          </details>
        );
      }
    } else if (sender === 'tool_result' && metadata?.toolName) {
      mainText = `Tool **${metadata.toolName}** ${metadata.isError ? 'failed' : 'completed'}.`;
      if (metadata.toolOutput) {
        detailsBlock = (
          <details className={`message-item__details ${metadata.isError ? 'message-item__details--error' : ''}`}>
            <summary>Result</summary>
            <pre>{typeof metadata.toolOutput === 'string' ? metadata.toolOutput : JSON.stringify(metadata.toolOutput, null, 2)}</pre>
          </details>
        );
      }
    }

    // Basic "Markdown" for bolding
    const parts = mainText.split('**');
    const renderedText = parts.map((part, index) => 
      index % 2 === 1 ? <strong key={index}>{part}</strong> : part
    );

    return (
      <>
        <div>{renderedText}</div>
        {detailsBlock}
      </>
    );
  };

  return (
    <div className={`message-item message-item--${sender} message-item--status-${status || 'unknown'}`}>
      <div className="message-item__icon">{getIcon(sender)}</div>
      <div className="message-item__content">
        <div className="message-item__bubble">
          {renderContent()}
        </div>
        <div className="message-item__meta">
          {timestamp && <span>{new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          {status && status !== 'completed' && status !== 'sent' && 
            <span className="message-item__status-badge">{status}</span>}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';