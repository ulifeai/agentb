"use strict";
"use client";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageItem = MessageItem;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_markdown_1 = __importDefault(require("react-markdown"));
function MessageItem({ message, isLast = false, isStreaming = false, className = "" }) {
    const isUser = message.sender === "user";
    const isSystem = message.sender === "system";
    const isTool = message.sender.startsWith("tool_");
    if (isUser) {
        return ((0, jsx_runtime_1.jsx)("div", { className: `flex justify-end ${className}`, children: (0, jsx_runtime_1.jsx)("div", { className: "bg-gray-100 rounded-full py-3 px-5 max-w-[80%]", children: (0, jsx_runtime_1.jsx)("p", { className: "text-gray-900", children: message.text }) }) }));
    }
    if (isSystem) {
        return ((0, jsx_runtime_1.jsx)("div", { className: `flex justify-center ${className}`, children: (0, jsx_runtime_1.jsx)("div", { className: "bg-gray-50 border border-gray-200 rounded-full py-2 px-4 text-sm text-gray-600", children: message.text }) }));
    }
    if (isTool) {
        return ((0, jsx_runtime_1.jsx)("div", { className: `flex justify-start ${className}`, children: (0, jsx_runtime_1.jsxs)("div", { className: "max-w-[80%] space-y-2", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2 text-sm text-gray-600", children: [(0, jsx_runtime_1.jsx)("div", { className: "w-2 h-2 bg-purple-500 rounded-full" }), (0, jsx_runtime_1.jsxs)("span", { children: ["Tool: ", message.metadata?.toolName || "Unknown"] }), (0, jsx_runtime_1.jsx)("span", { className: `px-2 py-1 rounded-full text-xs ${message.status === "completed"
                                    ? "bg-green-100 text-green-700"
                                    : message.status === "error"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-yellow-100 text-yellow-700"}`, children: message.status })] }), (0, jsx_runtime_1.jsx)("div", { className: "text-gray-900", children: (0, jsx_runtime_1.jsx)(FormattedContent, { content: message.text }) })] }) }));
    }
    // Assistant message
    return ((0, jsx_runtime_1.jsx)("div", { className: `flex justify-start ${className}`, children: (0, jsx_runtime_1.jsxs)("div", { className: "max-w-[80%]", children: [(0, jsx_runtime_1.jsxs)("div", { className: "text-gray-900", children: [(0, jsx_runtime_1.jsx)(FormattedContent, { content: message.text }), isLast && isStreaming && (0, jsx_runtime_1.jsx)("span", { className: "inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1" })] }), (0, jsx_runtime_1.jsx)("div", { className: "text-xs text-gray-500 mt-1", children: new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })] }) }));
}
function FormattedContent({ content }) {
    // Handle structured product data
    if (content.includes("Category:") && content.includes("Price:")) {
        const items = content.split(/\d+\.\s+/).filter((item) => item.trim());
        return ((0, jsx_runtime_1.jsxs)("div", { className: "space-y-3", children: [items.slice(0, 5).map((item, index) => {
                    const parts = item.split(" - ");
                    const title = parts[0]?.trim();
                    const details = parts.slice(1);
                    if (!title)
                        return null;
                    return ((0, jsx_runtime_1.jsxs)("div", { className: "border border-gray-200 rounded-lg p-3 bg-gray-50", children: [(0, jsx_runtime_1.jsxs)("div", { className: "font-medium text-gray-900 mb-1", children: [" ", (0, jsx_runtime_1.jsx)(react_markdown_1.default, { children: title })] }), (0, jsx_runtime_1.jsx)("div", { className: "text-sm text-gray-600 space-y-1", children: details.map((detail, i) => ((0, jsx_runtime_1.jsx)("div", { children: (0, jsx_runtime_1.jsx)(react_markdown_1.default, { components: {
                                            img: ({ node, ...props }) => (
                                            // Tailwind: w-32 (8rem), h-auto to keep aspect
                                            (0, jsx_runtime_1.jsx)("img", { className: "w-32 h-auto rounded", ...props })),
                                        }, children: detail.trim() }) }, i))) })] }, index));
                }), items.length > 5 && (0, jsx_runtime_1.jsxs)("div", { className: "text-sm text-gray-500 italic", children: ["... and ", items.length - 5, " more items"] })] }));
    }
    // Regular text with basic formatting
    return ((0, jsx_runtime_1.jsx)("div", { className: "prose prose-sm max-w-none", children: content.split("\n").map((line, index) => ((0, jsx_runtime_1.jsx)("p", { className: "mb-2 last:mb-0", children: line
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .split("<strong>")
                .map((part, i) => {
                if (part.includes("</strong>")) {
                    const [bold, rest] = part.split("</strong>");
                    return ((0, jsx_runtime_1.jsxs)("span", { children: [(0, jsx_runtime_1.jsx)("strong", { children: bold }), rest] }, i));
                }
                return part;
            }) }, index))) }));
}
//# sourceMappingURL=MessageItem.js.map