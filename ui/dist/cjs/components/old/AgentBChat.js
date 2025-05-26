"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBChat = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const useChat_1 = require("../../hooks/useChat");
const MessageList_1 = require("./MessageList");
const MessageInput_1 = require("./MessageInput");
require("./AgentBChat.css");
const AgentBChat = ({ backendUrl, initialThreadId, initialMessages, title = "Agent Chat", containerClassName = "agentb-chat" // Default class
 }) => {
    const { messages, sendMessage, isLoading, isStreaming, error, threadId,
    // currentRunId // Available if needed for display
     } = (0, useChat_1.useChat)({ backendUrl, initialThreadId, initialMessages });
    return ((0, jsx_runtime_1.jsxs)("div", { className: containerClassName, children: [(0, jsx_runtime_1.jsxs)("header", { className: "agentb-chat__header", children: [(0, jsx_runtime_1.jsx)("h2", { className: "agentb-chat__header-title", children: title }), threadId && !threadId.startsWith('temp-') && ((0, jsx_runtime_1.jsxs)("small", { className: "agentb-chat__header-threadid", children: ["ID: ", threadId.substring(0, 8), "..."] }))] }), error && (0, jsx_runtime_1.jsxs)("div", { className: "agentb-chat__error-bar", children: ["Error: ", error] }), (0, jsx_runtime_1.jsx)(MessageList_1.MessageList, { messages: messages }), (isLoading || isStreaming) && ((0, jsx_runtime_1.jsx)("div", { className: "agentb-chat__loading-indicator", children: isStreaming ? 'AI is responding...' : (isLoading ? 'Agent is working...' : '') })), (0, jsx_runtime_1.jsx)(MessageInput_1.MessageInput, { onSendMessage: sendMessage, isLoading: isLoading && !isStreaming })] }));
};
exports.AgentBChat = AgentBChat;
//# sourceMappingURL=AgentBChat.js.map