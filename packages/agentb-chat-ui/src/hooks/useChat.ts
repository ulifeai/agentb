import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../components/types';
import { streamAgentResponse, parseSSEStream, AgentEvent } from '../api'; // Assuming AgentEvent is beefed up or we cast

export interface UseChatOptions {
  backendUrl: string;
  initialThreadId?: string;
  initialMessages?: ChatMessage[];
}

export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  threadId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>; // Allow external message updates if needed
}

export const useChat = ({ backendUrl, initialThreadId, initialMessages = [] }: UseChatOptions): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialThreadId || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialThreadId) {
      setCurrentThreadId(initialThreadId);
    }
  }, [initialThreadId]);
  
  useEffect(() => {
    if (initialMessages.length > 0) {
        setMessages(initialMessages);
    }
  }, [initialMessages]);


  const sendMessage = useCallback(async (text: string) => {
    setIsLoading(true);
    setError(null);

    const userMessageId = uuidv4();
    const userMessage: ChatMessage = {
      id: userMessageId,
      text,
      sender: 'user',
      timestamp: new Date().toISOString(),
      status: 'sending',
    };
    setMessages((prevMessages) => [...prevMessages, userMessage]);

    let tempThreadId = currentThreadId || uuidv4(); // Use existing or generate a temp one if new chat
                                                   // The backend will create one if not provided or invalid.
                                                   // The actual threadId will be confirmed from the first event.

    const assistantMessageId = uuidv4();
    let assistantMessage: ChatMessage = {
      id: assistantMessageId,
      text: '',
      sender: 'ai',
      timestamp: new Date().toISOString(),
      status: 'streaming',
    };
    setMessages((prevMessages) => [...prevMessages, assistantMessage]);

    try {
      const { streamReader } = await streamAgentResponse({
        backendUrl,
        threadId: tempThreadId, // Send current or temp threadId
        userMessage: { role: 'user', content: text },
      });

      let firstEventProcessed = false;
      let accumulatedText = '';

      for await (const event of parseSSEStream<AgentEvent>(streamReader)) {
        if (!firstEventProcessed) {
          if (event.threadId && (!currentThreadId || currentThreadId !== event.threadId)) {
            // Update threadId from the first event if it's new or different
            setCurrentThreadId(event.threadId); 
          }
          firstEventProcessed = true;
        }
        
        if (event.type === 'thread.message.delta' && event.data.delta.contentChunk) {
          accumulatedText += event.data.delta.contentChunk;
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, text: accumulatedText, status: 'streaming' } : msg
            )
          );
        } else if (event.type === 'thread.message.completed') {
          // Final message content might be in event.data.message.content
          // For simplicity, we assume delta has provided all content.
          setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId ? { ...msg, text: accumulatedText, status: 'sent' } : msg
            )
          );
        } else if (event.type === 'thread.run.failed') {
          setError(event.data.error.message || 'An unknown error occurred.');
          setMessages((prevMessages) =>
            prevMessages.map((msg) => (msg.id === assistantMessageId ? { ...msg, status: 'failed', text: accumulatedText || event.data.error.message } : msg))
          );
          break; 
        } else if (event.type === 'thread.run.completed') {
           setMessages((prevMessages) =>
            prevMessages.map((msg) =>
              msg.id === assistantMessageId && msg.status !== 'failed' ? { ...msg, text: accumulatedText, status: 'sent' } : msg
            )
          );
        }
      }
      
      // Update user message status to 'sent' after successful stream processing (if no major error)
      setMessages((prevMessages) => 
        prevMessages.map(msg => msg.id === userMessageId ? {...msg, status: 'sent'} : msg)
      );

    } catch (e: any) {
      setError(e.message || 'Failed to send message or process stream.');
      setMessages((prevMessages) =>
        prevMessages.map((msg) => {
          if (msg.id === userMessageId) return { ...msg, status: 'failed' };
          if (msg.id === assistantMessageId) return { ...msg, status: 'failed', text: 'Error processing response.' };
          return msg;
        })
      );
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl, currentThreadId]);

  return { messages, sendMessage, isLoading, error, threadId: currentThreadId, setMessages };
};
