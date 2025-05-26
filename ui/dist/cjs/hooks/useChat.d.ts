import { ChatMessage } from '../components/types';
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
export declare const useChat: ({ backendUrl, initialThreadId, initialMessages }: UseChatOptions) => UseChatReturn;
//# sourceMappingURL=useChat.d.ts.map