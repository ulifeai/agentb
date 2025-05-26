import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/agentb-chat-ui/src/components/MessageInput.tsx
import { useState } from 'react';
import './MessageInput.css';
// Simple Send Icon (replace with a proper icon library component)
const SendIcon = () => _jsx("span", { className: "message-input-form__button-icon", children: "\u27A4" });
export const MessageInput = ({ onSendMessage, isLoading, placeholder }) => {
    const [inputValue, setInputValue] = useState('');
    const handleSubmit = (event) => {
        event.preventDefault();
        if (inputValue.trim() && !isLoading) {
            onSendMessage(inputValue.trim());
            setInputValue('');
        }
    };
    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Prevents newline in input on Enter
            handleSubmit(event); // Type assertion for event
        }
    };
    return (_jsxs("form", { onSubmit: handleSubmit, className: "message-input-form", children: [_jsx("input", { type: "text", className: "message-input-form__text", value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: handleKeyDown, placeholder: placeholder ?? "Type your message...", disabled: isLoading, "aria-label": "Chat message input" }), _jsx("button", { type: "submit", className: "message-input-form__button", disabled: isLoading || !inputValue.trim(), "aria-label": "Send message", children: _jsx(SendIcon, {}) })] }));
};
//# sourceMappingURL=MessageInput.js.map