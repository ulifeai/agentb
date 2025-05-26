import type { ChatMessage } from "./types";
export interface MessageItemProps {
    message: ChatMessage;
    isLast?: boolean;
    isStreaming?: boolean;
    className?: string;
}
export declare function MessageItem({ message, isLast, isStreaming, className }: MessageItemProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=MessageItem.d.ts.map