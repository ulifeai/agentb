"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageList = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
// packages/agentb-chat-ui/src/components/MessageList.tsx
const react_1 = require("react");
const MessageItem_1 = require("./MessageItem");
require("./MessageList.css");
const MessageList = ({ messages }) => {
    const messagesEndRef = (0, react_1.useRef)(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    (0, react_1.useEffect)(() => {
        scrollToBottom();
    }, [messages]); // Scroll whenever messages change
    if (messages.length === 0) {
        return ((0, jsx_runtime_1.jsxs)("div", { className: "message-list message-list__empty", children: [(0, jsx_runtime_1.jsx)("span", { className: "message-list__empty-icon", children: "\uD83D\uDC4B" }), (0, jsx_runtime_1.jsx)("p", { children: "No messages yet. Say hello!" })] }));
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "message-list", children: [messages.map((msg) => ((0, jsx_runtime_1.jsx)(MessageItem_1.MessageItem, { message: msg }, msg.id))), (0, jsx_runtime_1.jsx)("div", { ref: messagesEndRef })] }));
};
exports.MessageList = MessageList;
//# sourceMappingURL=MessageList.js.map