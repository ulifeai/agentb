/**
* @file DelegateToSpecialistTool - An ITool implementation that allows a planning agent
* to delegate a sub-task to a specialized "worker" agent (which itself runs an LLM
* with a limited set of tools from a specific IToolSet).
*/
import { ITool, IToolDefinition, IToolResult, IToolProvider } from '../../core/tool';
import { IAgent, IAgentContext, AgentRunConfig } from '../../agents';
import { ToolsetOrchestrator } from '../../managers/toolset-orchestrator';
import { ILLMClient } from '../../llm/types';
import { IMessageStorage } from '../../threads/types';
/**
* Dependencies required by the DelegateToSpecialistTool to instantiate and run sub-agents.
* These are typically provided by the system that instantiates this tool (e.g., ApiInteractionManager).
*/
export interface DelegateToolDependencies {
    toolsetOrchestrator: ToolsetOrchestrator;
    masterToolProvider?: IToolProvider;
    llmClient: ILLMClient;
    messageStorage: IMessageStorage;
    workerAgentImplementation?: new () => IAgent;
    getDefaultRunConfig: () => AgentRunConfig;
}
export declare class DelegateToSpecialistTool implements ITool {
    private dependencies;
    readonly toolName = "delegateToSpecialistAgent";
    constructor(dependencies: DelegateToolDependencies);
    getDefinition(): Promise<IToolDefinition>;
    execute(input: {
        specialistId: string;
        subTaskDescription: string;
        requiredOutputFormat?: string;
    }, plannerAgentContext?: IAgentContext): Promise<IToolResult>;
}
