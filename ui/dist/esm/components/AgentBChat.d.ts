import type { ChatMessage } from "./types";
export interface AgentBChatProps {
    backendUrl: string;
    initialThreadId?: string;
    initialMessages?: ChatMessage[];
    className?: string;
}
export declare function AgentBChat({ backendUrl, initialThreadId, initialMessages, className }: AgentBChatProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AgentBChat.d.ts.map