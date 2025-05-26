/**
 * @file ContextManager - Manages the conversation context window,
 * including token counting and triggering summarization when thresholds are met.
 */
import { IMessageStorage } from '../threads/types';
import { ILLMClient, LLMMessage } from '../llm/types';
export interface ContextManagerConfig {
    /** Token threshold at which to consider summarization. */
    tokenThreshold: number;
    /** Target number of tokens for a generated summary. */
    summaryTargetTokens: number;
    /** Number of tokens to reserve for system prompt, new user input, and LLM response generation. */
    reservedTokens: number;
    /** Model to use for summarization tasks. */
    summarizationModel: string;
}
export declare const DEFAULT_CONTEXT_MANAGER_CONFIG: ContextManagerConfig;
export declare class ContextManager {
    private messageStorage;
    private llmClient;
    private config;
    constructor(messageStorage: IMessageStorage, llmClient: ILLMClient, config?: Partial<ContextManagerConfig>);
    /**
     * Prepares the list of messages to be sent to the LLM, managing context window.
     * This includes fetching messages, checking token counts, and potentially summarizing.
     *
     * @param threadId The ID of the thread.
     * @param systemPrompt The system prompt for the current interaction.
     * @param currentTurnUserInput Optional: The current user input for this turn, if not yet saved.
     * @returns A Promise resolving to an array of LLMMessage objects ready for the LLM.
     * @throws StorageError or LLMError if issues arise.
     */
    prepareMessagesForLLM(threadId: string, systemPrompt: LLMMessage, // Expects a fully formed LLMMessage for the system prompt
    currentTurnMessages?: LLMMessage[]): Promise<LLMMessage[]>;
    private generateSummary;
    private mapIMessageToLLMMessage;
}
