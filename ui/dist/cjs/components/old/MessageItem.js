"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageItem = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
// packages/agentb-chat-ui/src/components/MessageItem.tsx
const react_1 = __importDefault(require("react"));
require("./MessageItem.css");
// For a production app, use an icon library like react-icons
const UserIcon = () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\uD83E\uDDD1" });
const AIIcon = () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\uD83E\uDD16" });
const SystemIcon = () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\u2699\uFE0F" });
const ToolIcon = () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\uD83D\uDEE0\uFE0F" });
const ThinkingIcon = () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\uD83E\uDD14" });
const BusyIcon = () => (0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: "\u23F3" });
const getIcon = (sender) => {
    switch (sender) {
        case 'user': return (0, jsx_runtime_1.jsx)(UserIcon, {});
        case 'ai': return (0, jsx_runtime_1.jsx)(AIIcon, {});
        case 'system': return (0, jsx_runtime_1.jsx)(SystemIcon, {});
        case 'tool_thought': return (0, jsx_runtime_1.jsx)(ThinkingIcon, {});
        case 'tool_executing': return (0, jsx_runtime_1.jsx)(BusyIcon, {});
        case 'tool_result': return (0, jsx_runtime_1.jsx)(ToolIcon, {});
        default: return (0, jsx_runtime_1.jsx)(SystemIcon, {});
    }
};
exports.MessageItem = react_1.default.memo(({ message }) => {
    const { text, sender, timestamp, status, metadata } = message;
    const renderContent = () => {
        let mainText = text;
        let detailsBlock = null;
        if (sender === 'tool_thought' && metadata?.toolName) {
            mainText = `Planning to use tool: **${metadata.toolName}**`;
            if (metadata.toolInput && (typeof metadata.toolInput === 'object' ? Object.keys(metadata.toolInput).length > 0 : metadata.toolInput)) {
                detailsBlock = ((0, jsx_runtime_1.jsxs)("details", { className: "message-item__details", children: [(0, jsx_runtime_1.jsx)("summary", { children: "Arguments" }), (0, jsx_runtime_1.jsx)("pre", { children: typeof metadata.toolInput === 'string' ? metadata.toolInput : JSON.stringify(metadata.toolInput, null, 2) })] }));
            }
        }
        else if (sender === 'tool_executing' && metadata?.toolName) {
            mainText = `Executing tool: **${metadata.toolName}** ...`;
            if (metadata.toolInput && (typeof metadata.toolInput === 'object' ? Object.keys(metadata.toolInput).length > 0 : metadata.toolInput)) {
                detailsBlock = ((0, jsx_runtime_1.jsxs)("details", { className: "message-item__details", children: [(0, jsx_runtime_1.jsx)("summary", { children: "Input" }), (0, jsx_runtime_1.jsx)("pre", { children: typeof metadata.toolInput === 'string' ? metadata.toolInput : JSON.stringify(metadata.toolInput, null, 2) })] }));
            }
        }
        else if (sender === 'tool_result' && metadata?.toolName) {
            mainText = `Tool **${metadata.toolName}** ${metadata.isError ? 'failed' : 'completed'}.`;
            if (metadata.toolOutput) {
                detailsBlock = ((0, jsx_runtime_1.jsxs)("details", { className: `message-item__details ${metadata.isError ? 'message-item__details--error' : ''}`, children: [(0, jsx_runtime_1.jsx)("summary", { children: "Result" }), (0, jsx_runtime_1.jsx)("pre", { children: typeof metadata.toolOutput === 'string' ? metadata.toolOutput : JSON.stringify(metadata.toolOutput, null, 2) })] }));
            }
        }
        // Basic "Markdown" for bolding
        const parts = mainText.split('**');
        const renderedText = parts.map((part, index) => index % 2 === 1 ? (0, jsx_runtime_1.jsx)("strong", { children: part }, index) : part);
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { children: renderedText }), detailsBlock] }));
    };
    return ((0, jsx_runtime_1.jsxs)("div", { className: `message-item message-item--${sender} message-item--status-${status || 'unknown'}`, children: [(0, jsx_runtime_1.jsx)("div", { className: "message-item__icon", children: getIcon(sender) }), (0, jsx_runtime_1.jsxs)("div", { className: "message-item__content", children: [(0, jsx_runtime_1.jsx)("div", { className: "message-item__bubble", children: renderContent() }), (0, jsx_runtime_1.jsxs)("div", { className: "message-item__meta", children: [timestamp && (0, jsx_runtime_1.jsx)("span", { children: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }), status && status !== 'completed' && status !== 'sent' &&
                                (0, jsx_runtime_1.jsx)("span", { className: "message-item__status-badge", children: status })] })] })] }));
});
exports.MessageItem.displayName = 'MessageItem';
//# sourceMappingURL=MessageItem.js.map