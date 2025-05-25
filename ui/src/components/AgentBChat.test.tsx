// packages/agentb-chat-ui/src/components/AgentBChat.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AgentBChat, AgentBChatProps } from './AgentBChat';
import { useChat, UseChatReturn } from '../hooks/useChat';

jest.mock('../hooks/useChat');

const mockUseChat = useChat as jest.MockedFunction<typeof useChat>;

describe('AgentBChat component', () => {
  const defaultProps: AgentBChatProps = {
    backendUrl: 'http://test.com',
    chatWindowTitle: 'Test Chat',
  };

  beforeEach(() => {
    // Reset mock implementation before each test
    mockUseChat.mockImplementation(() => ({
      messages: [],
      sendMessage: jest.fn(),
      isLoading: false,
      error: null,
      threadId: null,
      setMessages: jest.fn(),
    }));
  });

  it('renders title and chat window', () => {
    render(<AgentBChat {...defaultProps} />);
    expect(screen.getByText('Test Chat')).toBeInTheDocument();
    expect(screen.getByRole('form')).toBeInTheDocument(); // MessageInput form
  });

  it('displays messages from useChat', () => {
    mockUseChat.mockImplementation(() => ({
      messages: [{ id: '1', text: 'Hello', sender: 'user', status: 'sent' }],
      sendMessage: jest.fn(),
      isLoading: false,
      error: null,
      threadId: 'thread-1',
      setMessages: jest.fn(),
    }));
    render(<AgentBChat {...defaultProps} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('displays error message from useChat', () => {
    mockUseChat.mockImplementation(() => ({
      messages: [],
      sendMessage: jest.fn(),
      isLoading: false,
      error: 'Something went wrong',
      threadId: null,
      setMessages: jest.fn(),
    }));
    render(<AgentBChat {...defaultProps} />);
    expect(screen.getByText('Error:')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows AI thinking indicator when isLoading is true', () => {
    mockUseChat.mockImplementation(() => ({
      messages: [],
      sendMessage: jest.fn(),
      isLoading: true,
      error: null,
      threadId: null,
      setMessages: jest.fn(),
    }));
    render(<AgentBChat {...defaultProps} />);
    expect(screen.getByText('AI is thinking...')).toBeInTheDocument();
  });
});
