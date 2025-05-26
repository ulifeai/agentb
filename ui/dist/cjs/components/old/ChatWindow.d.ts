import React from 'react';
import { ChatMessage } from './types';
interface ChatWindowProps {
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    isSending?: boolean;
    aiIsThinking?: boolean;
    messageInputPlaceholder?: string;
}
export declare const ChatWindow: React.FC<ChatWindowProps>;
export {};
//# sourceMappingURL=ChatWindow.d.ts.map