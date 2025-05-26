"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageInput = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
// packages/agentb-chat-ui/src/components/MessageInput.tsx
const react_1 = require("react");
require("./MessageInput.css");
// Simple Send Icon (replace with a proper icon library component)
const SendIcon = () => (0, jsx_runtime_1.jsx)("span", { className: "message-input-form__button-icon", children: "\u27A4" });
const MessageInput = ({ onSendMessage, isLoading, placeholder }) => {
    const [inputValue, setInputValue] = (0, react_1.useState)('');
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
    return ((0, jsx_runtime_1.jsxs)("form", { onSubmit: handleSubmit, className: "message-input-form", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", className: "message-input-form__text", value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: handleKeyDown, placeholder: placeholder ?? "Type your message...", disabled: isLoading, "aria-label": "Chat message input" }), (0, jsx_runtime_1.jsx)("button", { type: "submit", className: "message-input-form__button", disabled: isLoading || !inputValue.trim(), "aria-label": "Send message", children: (0, jsx_runtime_1.jsx)(SendIcon, {}) })] }));
};
exports.MessageInput = MessageInput;
//# sourceMappingURL=MessageInput.js.map