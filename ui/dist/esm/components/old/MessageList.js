import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/agentb-chat-ui/src/components/MessageList.tsx
import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import './MessageList.css';
export const MessageList = ({ messages }) => {
    const messagesEndRef = useRef(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    useEffect(() => {
        scrollToBottom();
    }, [messages]); // Scroll whenever messages change
    if (messages.length === 0) {
        return (_jsxs("div", { className: "message-list message-list__empty", children: [_jsx("span", { className: "message-list__empty-icon", children: "\uD83D\uDC4B" }), _jsx("p", { children: "No messages yet. Say hello!" })] }));
    }
    return (_jsxs("div", { className: "message-list", children: [messages.map((msg) => (_jsx(MessageItem, { message: msg }, msg.id))), _jsx("div", { ref: messagesEndRef })] }));
};
//# sourceMappingURL=MessageList.js.map