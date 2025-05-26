import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useChat } from '../../hooks/useChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import './AgentBChat.css';
export const AgentBChat = ({ backendUrl, initialThreadId, initialMessages, title = "Agent Chat", containerClassName = "agentb-chat" // Default class
 }) => {
    const { messages, sendMessage, isLoading, isStreaming, error, threadId,
    // currentRunId // Available if needed for display
     } = useChat({ backendUrl, initialThreadId, initialMessages });
    return (_jsxs("div", { className: containerClassName, children: [_jsxs("header", { className: "agentb-chat__header", children: [_jsx("h2", { className: "agentb-chat__header-title", children: title }), threadId && !threadId.startsWith('temp-') && (_jsxs("small", { className: "agentb-chat__header-threadid", children: ["ID: ", threadId.substring(0, 8), "..."] }))] }), error && _jsxs("div", { className: "agentb-chat__error-bar", children: ["Error: ", error] }), _jsx(MessageList, { messages: messages }), (isLoading || isStreaming) && (_jsx("div", { className: "agentb-chat__loading-indicator", children: isStreaming ? 'AI is responding...' : (isLoading ? 'Agent is working...' : '') })), _jsx(MessageInput, { onSendMessage: sendMessage, isLoading: isLoading && !isStreaming })] }));
};
//# sourceMappingURL=AgentBChat.js.map