"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageList = MessageList;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const MessageItem_1 = require("./MessageItem");
function MessageList({ messages, isLoading = false, isStreaming = false, className = "" }) {
    const messagesEndRef = (0, react_1.useRef)(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    (0, react_1.useEffect)(() => {
        scrollToBottom();
    }, [messages, isLoading]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: `flex-1 space-y-6 overflow-y-auto ${className}`, children: [messages.map((message, index) => ((0, jsx_runtime_1.jsx)(MessageItem_1.MessageItem, { message: message, isLast: index === messages.length - 1, isStreaming: isStreaming && index === messages.length - 1 }, message.id))), isLoading && !isStreaming && messages.length > 0 && ((0, jsx_runtime_1.jsx)("div", { className: "flex justify-start", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex space-x-1", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" }), (0, jsx_runtime_1.jsx)("div", { className: "w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "0.2s" } }), (0, jsx_runtime_1.jsx)("div", { className: "w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce", style: { animationDelay: "0.4s" } })] }) })), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] }));
}
//# sourceMappingURL=MessageList.js.map