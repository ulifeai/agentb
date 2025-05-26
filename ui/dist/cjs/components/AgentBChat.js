"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBChat = AgentBChat;
const jsx_runtime_1 = require("react/jsx-runtime");
const MessageList_1 = require("./MessageList");
const MessageInput_1 = require("./MessageInput");
const useChat_1 = require("../hooks/useChat");
const react_1 = require("react");
function AgentBChat({ backendUrl, initialThreadId, initialMessages = [], className = "" }) {
    const { messages, sendMessage, isLoading, isStreaming, error } = (0, useChat_1.useChat)({
        backendUrl,
        initialThreadId,
        initialMessages,
    });
    const [inputValue, setInputValue] = (0, react_1.useState)("");
    const hasInteracted = messages.length > 0;
    const handleSendMessage = () => {
        if (inputValue.trim()) {
            sendMessage(inputValue.trim());
            setInputValue("");
        }
    };
    const quickActions = [
        { icon: "📰", label: "Latest News", color: "text-blue-600" },
        { icon: "🤖", label: "Research", color: "text-purple-600" },
        { icon: "🔍", label: "Analysis", color: "text-green-600" },
        { icon: "💡", label: "Creative Help", color: "text-yellow-600" },
        { icon: "📊", label: "Data Processing", color: "text-red-600" },
        { icon: "🛠️", label: "Tool Assistant", color: "text-indigo-600" },
    ];
    return ((0, jsx_runtime_1.jsxs)("div", { className: `flex flex-col items-center justify-between min-h-screen bg-white ${className}`, children: [!hasInteracted ? (
            // Initial welcome screen - Grok style
            (0, jsx_runtime_1.jsxs)("div", { className: "w-full max-w-3xl px-4 py-8 space-y-8 flex-1 flex flex-col justify-center", children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-center space-y-6", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex justify-center", children: (0, jsx_runtime_1.jsx)("div", { className: "w-16 h-16 bg-black rounded-full flex items-center justify-center", children: (0, jsx_runtime_1.jsx)("svg", { className: "w-8 h-8 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: (0, jsx_runtime_1.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 10V3L4 14h7v7l9-11h-7z" }) }) }) }), (0, jsx_runtime_1.jsx)("h1", { className: "text-3xl font-semibold text-gray-900", children: "Agent Assistant" }), (0, jsx_runtime_1.jsx)("p", { className: "text-xl text-gray-600", children: "How can I help you today?" })] }), (0, jsx_runtime_1.jsx)("div", { className: "relative mt-8", children: (0, jsx_runtime_1.jsxs)("div", { className: "relative rounded-full border border-gray-300 bg-white shadow-sm", children: [(0, jsx_runtime_1.jsx)("input", { type: "text", placeholder: "What do you want to know?", className: "w-full pl-6 pr-24 py-4 rounded-full border-none focus:ring-0 focus:outline-none text-base", value: inputValue, onChange: (e) => setInputValue(e.target.value), onKeyDown: (e) => e.key === "Enter" && handleSendMessage() }), (0, jsx_runtime_1.jsxs)("div", { className: "absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)("button", { className: "h-8 w-8 text-gray-500 hover:text-gray-700", children: (0, jsx_runtime_1.jsx)("svg", { className: "h-5 w-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: (0, jsx_runtime_1.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" }) }) }), (0, jsx_runtime_1.jsx)("button", { className: "h-8 w-8 rounded-md bg-green-600 hover:bg-green-700 text-white flex items-center justify-center", onClick: handleSendMessage, disabled: !inputValue.trim(), children: (0, jsx_runtime_1.jsx)("svg", { className: "h-4 w-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: (0, jsx_runtime_1.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8" }) }) })] })] }) })] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { className: "w-full max-w-5xl px-4 py-8 flex-1 flex flex-col", children: (0, jsx_runtime_1.jsx)(MessageList_1.MessageList, { messages: messages, isLoading: isLoading, isStreaming: isStreaming }) }), (0, jsx_runtime_1.jsx)("div", { className: "w-full max-w-5xl px-4 py-4 border-t border-gray-100", children: (0, jsx_runtime_1.jsx)(MessageInput_1.MessageInput, { value: inputValue, onChange: setInputValue, onSend: handleSendMessage, disabled: isLoading, placeholder: "How can I help?" }) })] })), error && ((0, jsx_runtime_1.jsx)("div", { className: "fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700", children: error }))] }));
}
//# sourceMappingURL=AgentBChat.js.map