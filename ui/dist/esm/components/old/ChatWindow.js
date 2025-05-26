import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
export const ChatWindow = ({ messages, onSendMessage, isSending, aiIsThinking, messageInputPlaceholder, }) => {
    return (_jsxs("div", { className: "chat-window", children: [_jsx(MessageList, { messages: messages }), aiIsThinking && (_jsx("div", { className: "ai-thinking-indicator", children: "AI is thinking..." })), _jsx(MessageInput, { onSendMessage: onSendMessage, isLoading: isSending ?? false, placeholder: messageInputPlaceholder })] }));
};
//# sourceMappingURL=ChatWindow.js.map