// packages/agentb-chat-ui/src/hooks/useChat.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '../components/types';
import { 
  streamAgentResponse, 
  parseSSEStream, 
  AgentEvent,
  AgentEventMessageCreated, // Specific type for clarity
  // Import other specific event types if needed for detailed type guards
} from '../api';

export interface UseChatOptions {
  backendUrl: string;
  initialThreadId?: string;
  initialMessages?: ChatMessage[];
}

export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
  isLoading: boolean; 
  isStreaming: boolean; 
  error: string | null;
  threadId: string | null;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentRunId: string | null;
}

export const useChat = ({ backendUrl, initialThreadId, initialMessages = [] }: UseChatOptions): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialThreadId || null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to manage state that changes within the async event loop
  // without causing re-renders until setMessages is called.
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const assistantMessageAccumulatorRef = useRef<string>('');
  const toolInteractionMessageMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (initialThreadId) setCurrentThreadId(initialThreadId);
  }, [initialThreadId]);
  
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
        setMessages(initialMessages);
    }
  }, [initialMessages, messages.length]); // Added messages.length to dependency

  const upsertMessage = useCallback((message: Partial<ChatMessage> & { id: string }) => {
    setMessages(prevMessages => {
      const index = prevMessages.findIndex(m => m.id === message.id);
      if (index > -1) {
        const updatedMessages = [...prevMessages];
        updatedMessages[index] = { ...updatedMessages[index], ...message } as ChatMessage; // Ensure full ChatMessage type
        return updatedMessages;
      }
      // Only add if it's a complete message structure, otherwise ignore partial updates for non-existent IDs
      if (message.sender && message.text !== undefined && message.status && message.timestamp) {
         return [...prevMessages, message as ChatMessage];
      }
      console.warn(`upsertMessage called for non-existent ID without full message data: ${message.id}`);
      return prevMessages; 
    });
  }, []);
  
  const addChatMessage = useCallback((chatMessageData: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string, timestamp?: string }) => {
    const fullMessage: ChatMessage = {
      id: chatMessageData.id || uuidv4(),
      timestamp: chatMessageData.timestamp || new Date().toISOString(),
      text: chatMessageData.text,
      sender: chatMessageData.sender,
      status: chatMessageData.status,
      metadata: chatMessageData.metadata,
    };
    setMessages(prev => [...prev, fullMessage]);
    return fullMessage.id;
  }, []);


  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    setIsLoading(true);
    setIsStreaming(false);
    setError(null);
    
    // Reset refs for new interaction sequence
    activeAssistantMessageIdRef.current = null;
    assistantMessageAccumulatorRef.current = '';
    toolInteractionMessageMapRef.current.clear();

    const userMessageId = addChatMessage({
      text, sender: 'user', status: 'sending',
    });

    let tempThreadId = currentThreadId || `temp-${uuidv4()}`; // UI generated, will be confirmed by backend
    let activeRunId: string | null = null;

    try {
      const { streamReader } = await streamAgentResponse({
        backendUrl,
        threadId: tempThreadId, // Send temp/current threadId
        userMessage: { role: 'user', content: text }, // Backend expects this structure
      });
      
      upsertMessage({ id: userMessageId, status: 'sent' }); // User message successfully sent to backend

      for await (const event of parseSSEStream<AgentEvent>(streamReader)) {
        if (!activeRunId && event.runId) {
          activeRunId = event.runId;
          setCurrentRunId(activeRunId);
        }
        if (event.threadId && (!currentThreadId || currentThreadId !== event.threadId || tempThreadId.startsWith('temp-'))) {
          setCurrentThreadId(event.threadId);
          tempThreadId = event.threadId; // Important: update tempThreadId if backend assigns/confirms one
        }

        switch (event.type) {
          // ... (other event handlers can remain similar, ensure they use refs where appropriate)

          case 'thread.message.created': {
            const createdMessage = (event as AgentEventMessageCreated).data.message;
            if (createdMessage.role === 'assistant' && createdMessage.metadata?.inProgress) {
              // This is a new assistant message turn (either the first one, or one after tool calls)
              activeAssistantMessageIdRef.current = createdMessage.id;
              assistantMessageAccumulatorRef.current = ''; // Reset accumulator

              // Check if we already have a UI message with this ID (e.g., from a previous placeholder logic)
              // This is less likely with the new ref-based active ID logic but good for safety.
              const existingMsgIndex = messages.findIndex(m => m.id === createdMessage.id);
              if (existingMsgIndex === -1) {
                addChatMessage({
                  id: createdMessage.id,
                  text: typeof createdMessage.content === 'string' ? createdMessage.content : '',
                  sender: 'ai',
                  status: 'streaming',
                  timestamp: new Date(createdMessage.createdAt).toISOString(),
                  metadata: { originalEvent: event, eventType: event.type }
                });
              } else {
                // If it somehow existed, just ensure it's streaming
                upsertMessage({
                  id: createdMessage.id,
                  status: 'streaming',
                  text: typeof createdMessage.content === 'string' ? createdMessage.content : assistantMessageAccumulatorRef.current,
                  timestamp: new Date(createdMessage.createdAt).toISOString(),
                   metadata: { originalEvent: event, eventType: event.type }
                });
              }
            }
            // You could also handle `role: 'tool'` message creations here if you want to display them directly,
            // but usually `agent.tool.execution.completed` provides richer data for the UI.
            break;
          }

          case 'thread.message.delta':
            if (event.data.messageId === activeAssistantMessageIdRef.current && event.data.delta.contentChunk) {
              setIsStreaming(true);
              assistantMessageAccumulatorRef.current += event.data.delta.contentChunk;
              upsertMessage({
                id: activeAssistantMessageIdRef.current, // Explicitly use the current ref value
                text: assistantMessageAccumulatorRef.current,
                status: 'streaming',
              });
            }
            break;

          case 'thread.message.completed':
            if (event.data.message.id === activeAssistantMessageIdRef.current && event.data.message.role === 'assistant') {
              setIsStreaming(false);
              const finalContent = assistantMessageAccumulatorRef.current || 
                                   (typeof event.data.message.content === 'string' ? event.data.message.content : JSON.stringify(event.data.message.content));
              upsertMessage({
                id: activeAssistantMessageIdRef.current, // Explicitly use the current ref value
                text: finalContent,
                status: 'sent',
                timestamp: new Date(event.timestamp).toISOString(),
                metadata: { originalEvent: event, eventType: event.type }
              });
              // Assistant message part is done, but the run might continue with more tools or another assistant message.
              // Do not reset activeAssistantMessageIdRef or accumulator here.
            }
            break;

          case 'thread.run.step.tool_call.created': {
            const tc = event.data.toolCall;
            let args: Record<string, any> | string = {};
            try { args = JSON.parse(tc.function.arguments); } catch { args = tc.function.arguments; }
            const placeholderId = addChatMessage({
              text: `Agent plans to use tool: **${tc.function.name}**`,
              sender: 'tool_thought', status: 'in_progress',
              metadata: { 
                eventType: event.type, toolName: tc.function.name, toolInput: args,
                originalEvent: event, stepId: event.data.stepId
              }
            });
            toolInteractionMessageMapRef.current.set(tc.id, placeholderId);
            break;
          }
          
          case 'agent.tool.execution.started': {
            const msgId = toolInteractionMessageMapRef.current.get(event.data.toolCallId);
            const updateData = {
              text: `Executing tool: **${event.data.toolName}** ...`,
              sender: 'tool_executing' as ChatMessage['sender'], status: 'in_progress' as ChatMessage['status'],
              timestamp: new Date(event.timestamp).toISOString(),
              metadata: { 
                eventType: event.type, toolName: event.data.toolName, toolInput: event.data.input,
                originalEvent: event, stepId: event.data.stepId
              }
            };
            if (msgId) { upsertMessage({ id: msgId, ...updateData }); }
            else { addChatMessage(updateData); } // Fallback
            break;
          }
          
          case 'agent.tool.execution.completed': {
            const msgId = toolInteractionMessageMapRef.current.get(event.data.toolCallId);
            const resultSuccess = event.data.result.success;
            const resultData = resultSuccess ? event.data.result.data : event.data.result.error;
            const updateData = {
              text: `Tool **${event.data.toolName}** ${resultSuccess ? 'completed' : 'failed'}.`,
              sender: 'tool_result' as ChatMessage['sender'], status: (resultSuccess ? 'completed' : 'error') as ChatMessage['status'],
              timestamp: new Date(event.timestamp).toISOString(),
              metadata: {
                eventType: event.type, toolName: event.data.toolName, toolOutput: resultData,
                isError: !resultSuccess, originalEvent: event, stepId: event.data.stepId
              }
            };
            if (msgId) { upsertMessage({ id: msgId, ...updateData });}
            else { addChatMessage(updateData); } // Fallback
            // Do not delete from map yet if sub_agent.invocation.completed is also expected for this toolCallId
            // if (!(event.data.toolName === 'delegateToSpecialistAgent')) {
            //    toolInteractionMessageMapRef.current.delete(event.data.toolCallId);
            // }
            break;
          }
          
          case 'agent.sub_agent.invocation.completed': {
            const msgId = toolInteractionMessageMapRef.current.get(event.data.toolCallId); // The planner's toolCallId
            const subAgentSuccess = event.data.result.success;
            const subAgentResult = subAgentSuccess ? event.data.result.data : event.data.result.error;
            const toolDisplayName = event.data.result.metadata?.delegatedToolName || `Specialist: ${event.data.specialistId}`;
            const updateData = {
              text: `Tool **${toolDisplayName}** (via delegate) ${subAgentSuccess ? 'completed' : 'failed'}.`,
              sender: 'tool_result' as ChatMessage['sender'], status: (subAgentSuccess ? 'completed' : 'error') as ChatMessage['status'],
              timestamp: new Date(event.timestamp).toISOString(),
              metadata: { 
                eventType: event.type, toolName: toolDisplayName, 
                toolOutput: subAgentResult, isError: !subAgentSuccess,
                originalEvent: event, stepId: event.data.plannerStepId
              }
            };
             if (msgId) { upsertMessage({id: msgId, ...updateData}); }
             else { addChatMessage(updateData); } // Fallback if initial thought wasn't mapped
            toolInteractionMessageMapRef.current.delete(event.data.toolCallId); // Clean up after sub_agent completion
            break;
          }
            
          case 'thread.run.requires_action':
            addChatMessage({
              text: `Agent is waiting for external action.`,
              sender: 'system', status: 'in_progress',
              metadata: { eventType: event.type, originalEvent: event }
            });
            // The agent will loop internally after this if tools were executed by BaseAgent.
            // No need to set isLoading to false unless this is a manual step.
            break;

          case 'agent.run.status.changed':
            const isMeaningfulStatusChange = event.data.currentStatus !== 'in_progress' || 
                                            (event.data.details && 
                                             !event.data.details.toLowerCase().includes("llm call for turn") &&
                                             !event.data.details.toLowerCase().includes("continuing run"));

            if (isMeaningfulStatusChange) {
                 addChatMessage({ 
                    text: `Run status: ${event.data.currentStatus}. ${event.data.details || ''}`, 
                    sender: 'system', 
                    status: (event.data.currentStatus === 'failed' || event.data.currentStatus === 'cancelled') ? 'error' : 'completed', 
                    metadata: { eventType: event.type, originalEvent: event }
                });
            }
            if(event.data.currentStatus === 'cancelled' || event.data.currentStatus === 'failed') {
                 setIsLoading(false);
                 setIsStreaming(false);
            }
            break;

          case 'thread.run.failed':
            setError(event.data.error.message || 'An unknown agent error occurred.');
            addChatMessage({
              text: `Agent run failed: ${event.data.error.code} - ${event.data.error.message}`,
              sender: 'system', status: 'error',
              metadata: { isError: true, eventType: event.type, originalEvent: event }
            });
            if (activeAssistantMessageIdRef.current) {
                upsertMessage({ id: activeAssistantMessageIdRef.current, status: 'failed', text: assistantMessageAccumulatorRef.current || "Response generation failed." });
            }
            setIsLoading(false);
            setIsStreaming(false);
            activeAssistantMessageIdRef.current = null;
            assistantMessageAccumulatorRef.current = '';
            break;

          case 'thread.run.completed':
            if (activeAssistantMessageIdRef.current) {
                upsertMessage({
                    id: activeAssistantMessageIdRef.current,
                    text: assistantMessageAccumulatorRef.current, 
                    status: 'sent',
                    timestamp: new Date(event.timestamp).toISOString(),
                });
            }
            setIsLoading(false);
            setIsStreaming(false);
            activeAssistantMessageIdRef.current = null;
            assistantMessageAccumulatorRef.current = '';
            break;

          default:
            // console.debug('Unhandled agent event type in useChat:', (event as any).type, event);
            break;
        }
      }
    } catch (e: any) {
      console.error("Error in sendMessage (useChat):", e);
      setError(e.message || 'Failed to send message or process stream.');
      addChatMessage({ text: `Error: ${e.message || 'Failed to process stream.'}`, sender: 'system', status: 'error', metadata: {isError: true}});
      upsertMessage({ id: userMessageId, status: 'failed' });
      if (activeAssistantMessageIdRef.current) {
          upsertMessage({ id: activeAssistantMessageIdRef.current, status: 'failed', text: 'Error processing response.' });
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setCurrentRunId(null); 
      // Final cleanup of refs
      activeAssistantMessageIdRef.current = null;
      assistantMessageAccumulatorRef.current = '';
      toolInteractionMessageMapRef.current.clear();
    }
  }, [backendUrl, currentThreadId, upsertMessage, addChatMessage, messages]); // Added messages to dep array of sendMessage

  return { messages, sendMessage, isLoading, isStreaming, error, threadId: currentThreadId, setMessages, currentRunId };
};