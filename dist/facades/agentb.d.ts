/**
 * @file AgentB - A high-level facade for simplifying the setup and usage of the AI Agent Framework.
 * It provides an opinionated, easy-to-use API for initializing the framework,
 * registering tool providers, and handling agent interactions via HTTP streaming or direct async iteration.
 */
import { ApiInteractionManager } from '../managers/api-interaction-manager';
import { ToolProviderSourceConfig } from '../managers/toolset-orchestrator';
import { LLMMessage } from '../llm/types';
import { IMessageStorage, IThreadStorage } from '../threads/types';
import { AgentEvent, AgentRunConfig, IAgentRunStorage } from '../agents';
import { PerProviderAuthOverrides } from '../openapi/types';
interface AgentBLLMProviderConfig {
    provider: 'openai' | string;
    apiKey?: string;
    model?: string;
    options?: Record<string, any>;
}
interface AgentBInitializationOptions {
    apiKey?: string;
    llmProvider?: AgentBLLMProviderConfig;
    defaultAgentModel?: string;
    messageStorage?: IMessageStorage;
    agentRunStorage?: IAgentRunStorage;
    threadStorage?: IThreadStorage;
    defaultAgentRunConfig?: Partial<AgentRunConfig>;
    toolProviders?: ToolProviderSourceConfig[];
}
interface AgentBExpressHttpHandlerOptions {
    getThreadId?: (req: any, threadStorage: IThreadStorage) => Promise<string>;
    getUserMessage?: (req: any) => Promise<string | LLMMessage>;
    /**
     * Asynchronously performs authorization checks.
     * Can return:
     * - `true`: Authorized, use static tool authentication.
     * - `false`: Forbidden.
     * - `PerProviderAuthOverrides`: Authorized, and use these auth details for specific providers.
     */
    authorizeRequest?: (req: any, threadId: string) => Promise<boolean | PerProviderAuthOverrides>;
    initialAgentRunConfig?: Partial<AgentRunConfig>;
}
export declare class AgentBInternal {
    private static instance;
    private llmClient;
    private messageStorage;
    private agentRunStorage;
    private threadStorage;
    private globalDefaultAgentRunConfig;
    private aim;
    private toolProviderSources;
    private isFrameworkInitialized;
    private constructor();
    static getInstance(): AgentBInternal;
    private assertFrameworkInitialized;
    initialize(options?: AgentBInitializationOptions): void;
    private _registerToolProviderInternal;
    registerToolProvider(sourceConfig: ToolProviderSourceConfig): void;
    private getOrCreateApiInteractionManager;
    /**
     * Core method to run an agent interaction and get a stream of events.
     * This method is framework-agnostic and can be used to integrate with any HTTP framework
     * or for non-HTTP use cases.
     *
     * @param threadId The ID of the conversation thread.
     * @param userMessage The user's message that initiates or continues the interaction.
     * @param agentRunConfigOverride Optional configuration overrides for this specific run (can include `requestAuthOverrides`).
     * @param existingRunId Optional: If continuing an existing run (e.g., after 'requires_action').
     * @returns An AsyncGenerator yielding `AgentEvent` objects.
     */
    runHttpInteractionStream(threadId: string, userMessage: LLMMessage, agentRunConfigOverride?: Partial<AgentRunConfig>, existingRunId?: string): AsyncGenerator<AgentEvent, void, undefined>;
    /**
     * Convenience method to get an Express-compatible HTTP request handler for streaming agent interactions.
     * Uses `runHttpInteractionStream` internally.
     *
     * @param handlerOptions Optional callbacks to customize request processing (e.g., auth, thread/message extraction).
     * @returns An async function `(req: any, res: any) => Promise<void>` for Express.
     */
    getExpressStreamingHttpHandler(handlerOptions?: AgentBExpressHttpHandlerOptions): (req: any, res: any) => Promise<void>;
    getApiInteractionManager(): Promise<ApiInteractionManager>;
}
export declare const AgentB: AgentBInternal;
export {};
