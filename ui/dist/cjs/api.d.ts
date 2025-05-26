export interface AgentEventBase {
    type: string;
    timestamp: string;
    runId: string;
    threadId: string;
}
export interface UIMessage {
    id: string;
    threadId: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | any;
    createdAt: string;
    metadata?: Record<string, any>;
}
export interface UILLMToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export interface UIToolResult {
    success: boolean;
    data: any;
    error?: string;
    metadata?: Record<string, any>;
}
export interface AgentEventRunCreated extends AgentEventBase {
    type: 'agent.run.created';
    data: {
        status: 'queued' | 'in_progress';
        initialMessages?: any[];
    };
}
export interface AgentEventRunStepCreated extends AgentEventBase {
    type: 'agent.run.step.created';
    data: {
        stepId: string;
        details?: any;
    };
}
export interface AgentEventMessageCreated extends AgentEventBase {
    type: 'thread.message.created';
    data: {
        message: UIMessage;
    };
}
export interface AgentEventMessageDelta extends AgentEventBase {
    type: 'thread.message.delta';
    data: {
        messageId: string;
        delta: {
            contentChunk?: string;
            toolCallsChunk?: UILLMToolCall[];
        };
    };
}
export interface AgentEventMessageCompleted extends AgentEventBase {
    type: 'thread.message.completed';
    data: {
        message: UIMessage;
    };
}
export interface AgentEventToolCallCreated extends AgentEventBase {
    type: 'thread.run.step.tool_call.created';
    data: {
        stepId: string;
        toolCall: UILLMToolCall;
    };
}
export interface AgentEventToolCallCompletedByLLM extends AgentEventBase {
    type: 'thread.run.step.tool_call.completed_by_llm';
    data: {
        stepId: string;
        toolCall: UILLMToolCall;
    };
}
export interface AgentEventToolExecutionStarted extends AgentEventBase {
    type: 'agent.tool.execution.started';
    data: {
        stepId: string;
        toolCallId: string;
        toolName: string;
        input: Record<string, any>;
    };
}
export interface AgentEventToolExecutionCompleted extends AgentEventBase {
    type: 'agent.tool.execution.completed';
    data: {
        stepId: string;
        toolCallId: string;
        toolName: string;
        result: UIToolResult;
    };
}
export interface AgentEventRunRequiresAction extends AgentEventBase {
    type: 'thread.run.requires_action';
    data: {
        status: 'requires_action';
        required_action: {
            type: 'submit_tool_outputs';
            submit_tool_outputs: {
                tool_calls: UILLMToolCall[];
            };
        };
    };
}
export interface AgentEventRunStatusChanged extends AgentEventBase {
    type: 'agent.run.status.changed';
    data: {
        previousStatus?: string;
        currentStatus: string;
        details?: string;
    };
}
export interface AgentEventRunFailed extends AgentEventBase {
    type: 'thread.run.failed';
    data: {
        status: 'failed';
        error: {
            code: string;
            message: string;
            details?: any;
        };
    };
}
export interface AgentEventRunCompleted extends AgentEventBase {
    type: 'thread.run.completed';
    data: {
        status: 'completed';
        finalMessages?: UIMessage[];
    };
}
export interface AgentEventSubAgentInvocationStarted extends AgentEventBase {
    type: 'agent.sub_agent.invocation.started';
    data: {
        plannerStepId: string;
        toolCallId: string;
        specialistId: string;
        subTaskDescription: string;
        subAgentRunId: string;
    };
}
export interface AgentEventSubAgentInvocationCompleted extends AgentEventBase {
    type: 'agent.sub_agent.invocation.completed';
    data: {
        plannerStepId: string;
        toolCallId: string;
        specialistId: string;
        subAgentRunId: string;
        result: UIToolResult;
    };
}
export type AgentEvent = AgentEventRunCreated | AgentEventRunStepCreated | AgentEventMessageCreated | AgentEventMessageDelta | AgentEventMessageCompleted | AgentEventToolCallCreated | AgentEventToolCallCompletedByLLM | AgentEventToolExecutionStarted | AgentEventToolExecutionCompleted | AgentEventRunRequiresAction | AgentEventRunStatusChanged | AgentEventRunFailed | AgentEventRunCompleted | AgentEventSubAgentInvocationStarted | AgentEventSubAgentInvocationCompleted;
export interface StreamAgentResponsePayload {
    threadId: string;
    userMessage: {
        role: 'user';
        content: string;
    };
    backendUrl: string;
}
export interface StreamAgentInteractionResponse {
    streamReader: ReadableStreamDefaultReader<Uint8Array>;
}
export declare function streamAgentResponse(payload: StreamAgentResponsePayload): Promise<StreamAgentInteractionResponse>;
export declare function parseSSEStream<T extends AgentEvent>(streamReader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<T, void, undefined>;
//# sourceMappingURL=api.d.ts.map