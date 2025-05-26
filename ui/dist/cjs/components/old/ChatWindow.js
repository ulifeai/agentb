"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatWindow = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const MessageList_1 = require("./MessageList");
const MessageInput_1 = require("./MessageInput");
const ChatWindow = ({ messages, onSendMessage, isSending, aiIsThinking, messageInputPlaceholder, }) => {
    return ((0, jsx_runtime_1.jsxs)("div", { className: "chat-window", children: [(0, jsx_runtime_1.jsx)(MessageList_1.MessageList, { messages: messages }), aiIsThinking && ((0, jsx_runtime_1.jsx)("div", { className: "ai-thinking-indicator", children: "AI is thinking..." })), (0, jsx_runtime_1.jsx)(MessageInput_1.MessageInput, { onSendMessage: onSendMessage, isLoading: isSending ?? false, placeholder: messageInputPlaceholder })] }));
};
exports.ChatWindow = ChatWindow;
//# sourceMappingURL=ChatWindow.js.map