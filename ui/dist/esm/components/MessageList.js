"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { MessageItem } from "./MessageItem";
export function MessageList({ messages, isLoading = false, isStreaming = false, className = "" }) {
    const messagesEndRef = useRef(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);
    return (_jsxs("div", { className: `flex-1 space-y-6 overflow-y-auto ${className}`, children: [messages.map((message, index) => (_jsx(MessageItem, { message: message, isLast: index === messages.length - 1, isStreaming: isStreaming && index === messages.length - 1 }, message.id))), isLoading && !isStreaming && messages.length > 0 && (_jsx("div", { className: "flex justify-start", children: _jsxs("div", { className: "flex space-x-1", children: [_jsx("div", { className: "w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" }), _jsx("div", { className: "w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "0.2s" } }), _jsx("div", { className: "w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "0.4s" } })] }) })), _jsx("div", { ref: messagesEndRef })] }));
}
//# sourceMappingURL=MessageList.js.map