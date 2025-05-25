// packages/agentb-chat-ui/src/hooks/useChat.test.tsx
import { renderHook, act } from '@testing-library/react-hooks';
import { useChat } from './useChat';
import { streamAgentResponse, parseSSEStream } from '../api'; // Will use the mock
import { ChatMessage } from '../components/types';

jest.mock('../api'); // Mock the entire api module

const mockBackendUrl = 'http://mock-backend.com';

// Helper to simulate async generator
async function* createMockEventStream(events: any[]) {
  for (const event of events) {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async
    yield event;
  }
}

describe('useChat hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (streamAgentResponse as jest.Mock).mockResolvedValue({ streamReader: {} }); // Default mock
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useChat({ backendUrl: mockBackendUrl }));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.threadId).toBeNull();
  });

  it('should send a message and process successful AI response', async () => {
    const mockStreamReader = { read: jest.fn() }; // Dummy reader
    (streamAgentResponse as jest.Mock).mockResolvedValue({ streamReader: mockStreamReader });
    (parseSSEStream as jest.Mock).mockImplementation(() => createMockEventStream([
      { type: 'thread.message.delta', threadId: 'thread-123', runId: 'run-1', data: { delta: { contentChunk: 'Hello ' } } },
      { type: 'thread.message.delta', threadId: 'thread-123', runId: 'run-1', data: { delta: { contentChunk: 'World' } } },
      { type: 'thread.message.completed', threadId: 'thread-123', runId: 'run-1', data: { message: { id: 'ai-msg-id', content: 'Hello World', role: 'assistant' } } },
      { type: 'thread.run.completed', threadId: 'thread-123', runId: 'run-1', data: { status: 'completed' } },
    ]));

    const { result, waitForNextUpdate } = renderHook(() => useChat({ backendUrl: mockBackendUrl }));

    await act(async () => {
      result.current.sendMessage('User says hi');
      // Wait for isLoading to be true
      await waitForNextUpdate(); // For isLoading true and initial message updates
      // Wait for all stream processing
      await waitForNextUpdate(); // For delta 1
      await waitForNextUpdate(); // For delta 2
      await waitForNextUpdate(); // For message completed
      await waitForNextUpdate(); // For run completed & isLoading false
    });
    
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.threadId).toBe('thread-123');
    expect(result.current.messages.length).toBe(2);
    expect(result.current.messages[0].sender).toBe('user');
    expect(result.current.messages[0].text).toBe('User says hi');
    expect(result.current.messages[0].status).toBe('sent');
    expect(result.current.messages[1].sender).toBe('ai');
    expect(result.current.messages[1].text).toBe('Hello World');
    expect(result.current.messages[1].status).toBe('sent');
  });

  it('should handle API error when sending message', async () => {
    (streamAgentResponse as jest.Mock).mockRejectedValue(new Error('Network Error'));
    const { result, waitForNextUpdate } = renderHook(() => useChat({ backendUrl: mockBackendUrl }));

    await act(async () => {
      result.current.sendMessage('Test message');
      await waitForNextUpdate(); // For isLoading true
      // No more updates expected as streamAgentResponse fails early
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Network Error');
    expect(result.current.messages.length).toBe(2); // User message and failed AI placeholder
    expect(result.current.messages[0].status).toBe('failed');
    expect(result.current.messages[1].status).toBe('failed');
  });
  
  it('should handle thread.run.failed event', async () => {
     const mockStreamReader = { read: jest.fn() };
     (streamAgentResponse as jest.Mock).mockResolvedValue({ streamReader: mockStreamReader });
     (parseSSEStream as jest.Mock).mockImplementation(() => createMockEventStream([
         { type: 'thread.message.delta', threadId: 'thread-error', runId: 'run-err', data: { delta: { contentChunk: 'Oh no...' } } },
         { type: 'thread.run.failed', threadId: 'thread-error', runId: 'run-err', data: { error: { code: 'AI_ERROR', message: 'AI processing failed' } } },
     ]));

     const { result, waitForNextUpdate } = renderHook(() => useChat({ backendUrl: mockBackendUrl }));

     await act(async () => {
         result.current.sendMessage('Trigger error');
         await waitForNextUpdate(); // isLoading true
         await waitForNextUpdate(); // delta
         await waitForNextUpdate(); // run.failed & isLoading false
     });

     expect(result.current.isLoading).toBe(false);
     expect(result.current.error).toBe('AI processing failed');
     expect(result.current.messages.length).toBe(2);
     expect(result.current.messages[1].text).toBe('Oh no...'); // Or 'AI processing failed' depending on logic
     expect(result.current.messages[1].status).toBe('failed');
 });

});
