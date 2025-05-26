import React from 'react';
import './MessageInput.css';
interface MessageInputProps {
    onSendMessage: (text: string) => void;
    isLoading: boolean;
    placeholder?: string | undefined;
}
export declare const MessageInput: React.FC<MessageInputProps>;
export {};
//# sourceMappingURL=MessageInput.d.ts.map