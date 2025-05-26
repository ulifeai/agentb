/**
* @file ToolExecutor - Responsible for executing tools based on parsed tool calls.
* It uses an IToolProvider to find and run the appropriate tools.
*/
import { IToolProvider, IToolResult } from '../core/tool';
import { LLMToolCall } from '../llm/types';
import { ToolExecutorConfig } from './config';
import { IAgentContext } from './types';
export declare class ToolExecutor {
    private toolProvider;
    private config;
    private agentContext?;
    constructor(toolProvider: IToolProvider, config?: ToolExecutorConfig, agentContext?: IAgentContext);
    executeToolCalls(parsedToolCalls: LLMToolCall[], agentContextOverride?: IAgentContext): Promise<Array<{
        toolCallId: string;
        toolName: string;
        result: IToolResult;
    }>>;
    private executeSingleToolCall;
}
