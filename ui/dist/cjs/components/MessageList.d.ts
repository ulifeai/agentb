import type { ChatMessage } from "./types";
export interface MessageListProps {
    messages: ChatMessage[];
    isLoading?: boolean;
    isStreaming?: boolean;
    className?: string;
}
export declare function MessageList({ messages, isLoading, isStreaming, className }: MessageListProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=MessageList.d.ts.map