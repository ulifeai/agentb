import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// packages/agentb-chat-ui/src/components/MessageItem.tsx
import React from 'react';
import './MessageItem.css';
// For a production app, use an icon library like react-icons
const UserIcon = () => _jsx(_Fragment, { children: "\uD83E\uDDD1" });
const AIIcon = () => _jsx(_Fragment, { children: "\uD83E\uDD16" });
const SystemIcon = () => _jsx(_Fragment, { children: "\u2699\uFE0F" });
const ToolIcon = () => _jsx(_Fragment, { children: "\uD83D\uDEE0\uFE0F" });
const ThinkingIcon = () => _jsx(_Fragment, { children: "\uD83E\uDD14" });
const BusyIcon = () => _jsx(_Fragment, { children: "\u23F3" });
const getIcon = (sender) => {
    switch (sender) {
        case 'user': return _jsx(UserIcon, {});
        case 'ai': return _jsx(AIIcon, {});
        case 'system': return _jsx(SystemIcon, {});
        case 'tool_thought': return _jsx(ThinkingIcon, {});
        case 'tool_executing': return _jsx(BusyIcon, {});
        case 'tool_result': return _jsx(ToolIcon, {});
        default: return _jsx(SystemIcon, {});
    }
};
export const MessageItem = React.memo(({ message }) => {
    const { text, sender, timestamp, status, metadata } = message;
    const renderContent = () => {
        let mainText = text;
        let detailsBlock = null;
        if (sender === 'tool_thought' && metadata?.toolName) {
            mainText = `Planning to use tool: **${metadata.toolName}**`;
            if (metadata.toolInput && (typeof metadata.toolInput === 'object' ? Object.keys(metadata.toolInput).length > 0 : metadata.toolInput)) {
                detailsBlock = (_jsxs("details", { className: "message-item__details", children: [_jsx("summary", { children: "Arguments" }), _jsx("pre", { children: typeof metadata.toolInput === 'string' ? metadata.toolInput : JSON.stringify(metadata.toolInput, null, 2) })] }));
            }
        }
        else if (sender === 'tool_executing' && metadata?.toolName) {
            mainText = `Executing tool: **${metadata.toolName}** ...`;
            if (metadata.toolInput && (typeof metadata.toolInput === 'object' ? Object.keys(metadata.toolInput).length > 0 : metadata.toolInput)) {
                detailsBlock = (_jsxs("details", { className: "message-item__details", children: [_jsx("summary", { children: "Input" }), _jsx("pre", { children: typeof metadata.toolInput === 'string' ? metadata.toolInput : JSON.stringify(metadata.toolInput, null, 2) })] }));
            }
        }
        else if (sender === 'tool_result' && metadata?.toolName) {
            mainText = `Tool **${metadata.toolName}** ${metadata.isError ? 'failed' : 'completed'}.`;
            if (metadata.toolOutput) {
                detailsBlock = (_jsxs("details", { className: `message-item__details ${metadata.isError ? 'message-item__details--error' : ''}`, children: [_jsx("summary", { children: "Result" }), _jsx("pre", { children: typeof metadata.toolOutput === 'string' ? metadata.toolOutput : JSON.stringify(metadata.toolOutput, null, 2) })] }));
            }
        }
        // Basic "Markdown" for bolding
        const parts = mainText.split('**');
        const renderedText = parts.map((part, index) => index % 2 === 1 ? _jsx("strong", { children: part }, index) : part);
        return (_jsxs(_Fragment, { children: [_jsx("div", { children: renderedText }), detailsBlock] }));
    };
    return (_jsxs("div", { className: `message-item message-item--${sender} message-item--status-${status || 'unknown'}`, children: [_jsx("div", { className: "message-item__icon", children: getIcon(sender) }), _jsxs("div", { className: "message-item__content", children: [_jsx("div", { className: "message-item__bubble", children: renderContent() }), _jsxs("div", { className: "message-item__meta", children: [timestamp && _jsx("span", { children: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }), status && status !== 'completed' && status !== 'sent' &&
                                _jsx("span", { className: "message-item__status-badge", children: status })] })] })] }));
});
MessageItem.displayName = 'MessageItem';
//# sourceMappingURL=MessageItem.js.map