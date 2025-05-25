// packages/agentb-chat-ui/src/components/MessageItem.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageItem } from './MessageItem';
import { ChatMessage } from './types';

describe('MessageItem component', () => {
  const baseMessage: ChatMessage = {
    id: '1',
    text: 'Test message content',
    sender: 'user', // Default sender
    timestamp: new Date().toISOString(),
  };

  it('renders message text', () => {
    render(<MessageItem message={baseMessage} />);
    expect(screen.getByText('Test message content')).toBeInTheDocument();
  });

  it('applies user message classes', () => {
    const { container } = render(<MessageItem message={{ ...baseMessage, sender: 'user' }} />);
    // Check for the wrapper class that dictates alignment
    expect(container.firstChild).toHaveClass('message-item-wrapper-user');
    // Check for the item class that dictates background/text color
    expect(container.querySelector('.message-item')).toHaveClass('message-item-user');
  });

  it('applies AI message classes', () => {
    const { container } = render(<MessageItem message={{ ...baseMessage, sender: 'ai' }} />);
    expect(container.firstChild).toHaveClass('message-item-wrapper-ai');
    expect(container.querySelector('.message-item')).toHaveClass('message-item-ai');
  });
  
  it('applies system message classes', () => {
    const systemMessage: ChatMessage = { ...baseMessage, sender: 'system', text: 'System event' };
    const { container } = render(<MessageItem message={systemMessage} />);
    expect(container.firstChild).toHaveClass('message-item-wrapper-system');
    expect(container.querySelector('.message-item')).toHaveClass('message-item-system');
    expect(screen.getByText('System event')).toBeInTheDocument();
  });

  it('displays status when message is sending', () => {
    render(<MessageItem message={{ ...baseMessage, status: 'sending' }} />);
    expect(screen.getByText('(sending)')).toBeInTheDocument();
  });

  it('displays status when message failed', () => {
    render(<MessageItem message={{ ...baseMessage, status: 'failed' }} />);
    expect(screen.getByText('(failed)')).toBeInTheDocument();
  });

  it('does not display status when message is sent', () => {
    render(<MessageItem message={{ ...baseMessage, status: 'sent' }} />);
    expect(screen.queryByText('(sent)')).not.toBeInTheDocument();
     // Also check for other statuses to ensure only 'sent' is hidden this way
    expect(screen.queryByText('(sending)')).not.toBeInTheDocument();
    expect(screen.queryByText('(failed)')).not.toBeInTheDocument();
  });
  
  it('does not display status for system messages', () => {
    render(<MessageItem message={{ ...baseMessage, sender: 'system', status: 'info' as any }} />); // Cast status for test
    expect(screen.queryByText('(info)')).not.toBeInTheDocument();
  });

});
