// src/agents/context-manager.ts

/**
 * @file ContextManager - Manages the conversation context window,
 * including token counting and triggering summarization when thresholds are met.
 */

import { IMessage, IMessageStorage, IMessageQueryOptions } from '../threads/types';
import { ILLMClient, LLMMessage, LLMToolCall } from '../llm/types';
import { ConfigurationError, ApplicationError } from '../core/errors';

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

export const DEFAULT_CONTEXT_MANAGER_CONFIG: ContextManagerConfig = {
  tokenThreshold: 75000, // Example: ~8k tokens, common for models like gpt-3.5-turbo
  summaryTargetTokens: 1000,
  reservedTokens: 1500,
  summarizationModel: 'gpt-4o-mini', // A capable but potentially cheaper model for summarization
};

export class ContextManager {
  private messageStorage: IMessageStorage;
  private llmClient: ILLMClient; // For token counting and summarization
  private config: ContextManagerConfig;

  constructor(messageStorage: IMessageStorage, llmClient: ILLMClient, config: Partial<ContextManagerConfig> = {}) {
    this.messageStorage = messageStorage;
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, ...config };

    if (this.config.tokenThreshold <= this.config.summaryTargetTokens + this.config.reservedTokens) {
      throw new ConfigurationError(
        'ContextManager: tokenThreshold must be greater than summaryTargetTokens + reservedTokens.'
      );
    }
  }

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
  public async prepareMessagesForLLM(
    threadId: string,
    systemPrompt: LLMMessage, // Expects a fully formed LLMMessage for the system prompt
    currentTurnMessages: LLMMessage[] = [] // User input, previous assistant partial responses etc. for current turn
  ): Promise<LLMMessage[]> {
    // 1. Fetch recent messages, including any existing summary.
    // We need a strategy here: fetch all, or fetch up to a high limit and then trim.
    // Let's assume we fetch a reasonable number of recent messages.
    // The definition of "recent" or how many to fetch depends on typical context window sizes.
    const queryLimit = 100; // Fetch last 100 messages as a starting point
    const historyMessagesModels = await this.messageStorage.getMessages(threadId, { limit: queryLimit, order: 'desc' });
    const historyLLMMessages = historyMessagesModels.reverse().map(this.mapIMessageToLLMMessage); // Reverse to chronological
    
    // 2. Check for existing summary message and place it correctly
    let messagesToConsider: LLMMessage[] = [];
    const summaryIndex = historyLLMMessages.findIndex(
      (m) =>
        m.role === 'system' &&
        m.content &&
        typeof m.content === 'string' &&
        m.content.includes('======== CONVERSATION HISTORY SUMMARY ========')
    ); // A bit fragile

    if (summaryIndex !== -1) {
      messagesToConsider.push(historyLLMMessages[summaryIndex]); // Add summary first
      messagesToConsider.push(...historyLLMMessages.slice(summaryIndex + 1)); // Add messages after summary
    } else {
      messagesToConsider = historyLLMMessages;
    }

    // Filter out any messages from allHistoricalLLMMessages that are effectively duplicated by currentTurnMessages.
    // This is important if currentTurnMessages are tool results that were just persisted.

    if (currentTurnMessages.length > 0 && messagesToConsider.length >= currentTurnMessages.length) {
      const n = currentTurnMessages.length;
      // Check if the tail of messagesToConsider matches currentTurnMessages
      let suffixMatches = true;
      for (let i = 0; i < n; i++) {
        // Compare the last n messages of messagesToConsider with currentTurnMessages
        const histMsg = messagesToConsider[messagesToConsider.length - n + i];
        const currMsg = currentTurnMessages[i];

        // More robust check: compare role, content, and tool_call_id if present
        let contentMatch = false;
        if (typeof histMsg.content === 'string' && typeof currMsg.content === 'string') {
            contentMatch = histMsg.content === currMsg.content;
        } else {
            contentMatch = JSON.stringify(histMsg.content) === JSON.stringify(currMsg.content);
        }

        const toolCallIdMatch = (histMsg.tool_call_id || null) === (currMsg.tool_call_id || null);
        // Check tool_calls content as well if they exist
        let toolCallsMatch = true;
        if (histMsg.tool_calls || currMsg.tool_calls) {
            toolCallsMatch = JSON.stringify(histMsg.tool_calls || []) === JSON.stringify(currMsg.tool_calls || []);
        }


        if (histMsg.role !== currMsg.role || !contentMatch || !toolCallIdMatch || !toolCallsMatch) {
          suffixMatches = false;
          break;
        }
      }

      if (suffixMatches) {
        // If the suffix matches, remove it from messagesToConsider before adding currentTurnMessages
        messagesToConsider.splice(messagesToConsider.length - n, n);
        console.debug('[ContextManager] Removed duplicated suffix from historical messages matching currentTurnMessages.');
      }
    }
    

    // 3. Combine with system prompt and current turn messages
    let currentMessagesForLLM: LLMMessage[] = [systemPrompt, ...messagesToConsider, ...currentTurnMessages];

    // console.log('[ContextManager] Current messages for LLM:', JSON.stringify(currentMessagesForLLM, null, 2));

    // 4. Count tokens
    let currentTokenCount = await this.llmClient.countTokens(currentMessagesForLLM, this.config.summarizationModel); // Use summarization model for count consistency before potential summary

    // 5. If over threshold, attempt summarization
    if (currentTokenCount > this.config.tokenThreshold) {
      console.info(
        `[ContextManager] Thread ${threadId} token count ${currentTokenCount} exceeds threshold ${this.config.tokenThreshold}. Attempting summarization.`
      );

      // Identify messages to summarize (all messages *before* the current turn's input)
      // Exclude the system prompt and any existing summary from being re-summarized.
      const messagesToSummarize = messagesToConsider.filter((m) => m.role !== 'system'); // Don't re-summarize the system prompt or old summary.

      if (messagesToSummarize.length > 1) {
        // Need at least a few messages to make summarization worthwhile
        const summaryText = await this.generateSummary(messagesToSummarize);
        if (summaryText) {
          const summaryLLMMessage: LLMMessage = {
            role: 'system',
            content: `======== CONVERSATION HISTORY SUMMARY ========\n${summaryText}\n======== END OF SUMMARY ========`,
          };

          // Reconstruct messages: system prompt, new summary, and current turn messages
          currentMessagesForLLM = [
            systemPrompt,
            summaryLLMMessage, // The new summary
            ...currentTurnMessages  // The newest messages for this turn
          ];
          currentTokenCount = await this.llmClient.countTokens(currentMessagesForLLM, this.config.summarizationModel);
          console.info(`[ContextManager] Thread ${threadId} summarized. New token count: ${currentTokenCount}`);
        } else {
          console.warn(
            `[ContextManager] Summarization failed for thread ${threadId}. Proceeding with potentially truncated context.`
          );
        }
      } else {
        console.info(`[ContextManager] Not enough messages to summarize for thread ${threadId}.`);
      }
    }

    // 6. Final truncation if still over limit (simple strategy: drop oldest non-system/summary messages)
    // This is a fallback if summarization didn't bring it down enough or wasn't performed.
    while (
      currentTokenCount > this.config.tokenThreshold - this.config.reservedTokens &&
      currentMessagesForLLM.length > 1 + currentTurnMessages.length
    ) {
      // Find first non-system, non-summary message to remove
      let removed = false;
      for (let i = 0; i < currentMessagesForLLM.length - currentTurnMessages.length; i++) {
        const msg = currentMessagesForLLM[i];
        if (
          msg.role !== 'system' &&
          !(typeof msg.content === 'string' && msg.content.includes('======== CONVERSATION HISTORY SUMMARY ========'))
        ) {
          currentMessagesForLLM.splice(i, 1);
          removed = true;
          break;
        }
      }
      if (!removed && currentMessagesForLLM.length > 1 + currentTurnMessages.length) {
        // If only system/summary and current turn messages are left, and still too long, something is wrong.
        // Or, if only system messages are left besides current turn.
        // This case implies the system prompt or current turn messages alone are too long.
        console.warn(
          '[ContextManager] Context still too long after attempting to remove oldest messages. System prompt or current input might be too large.'
        );
        break;
      }
      if (!removed && currentMessagesForLLM.length <= 1 + currentTurnMessages.length) break; // Nothing left to remove except system/current turn

      currentTokenCount = await this.llmClient.countTokens(currentMessagesForLLM, this.config.summarizationModel);
      console.debug(`[ContextManager] Truncated oldest message. New token count: ${currentTokenCount}`);
    }

    return currentMessagesForLLM;
  }

  private async generateSummary(messages: LLMMessage[]): Promise<string | null> {
    if (messages.length === 0) return null;

    const summarizationPrompt: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a highly skilled summarization assistant. Condense the following conversation history into a concise summary.
        The summary should retain all key facts, decisions, questions, and the latest state of the conversation.
        Aim for a summary around ${this.config.summaryTargetTokens / 400} to ${this.config.summaryTargetTokens / 200} sentences (estimate).
        Output ONLY the summary text.`,
      },
      {
        role: 'user',
        content: messages
          .map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
          .join('\n\n'),
      },
    ];

    try {
      const response = (await this.llmClient.generateResponse(summarizationPrompt, {
        model: this.config.summarizationModel,
        max_tokens: this.config.summaryTargetTokens, // Guide the length
        temperature: 0.2, // More factual summary
        stream: false,
      })) as LLMMessage; // Assert non-streaming response type

      if (typeof response.content === 'string') {
        return response.content.trim();
      }
      return JSON.stringify(response.content); // Fallback if content is not string
    } catch (error) {
      console.error('[ContextManager] Error during summarization LLM call:', error);
      return null;
    }
  }

  private mapIMessageToLLMMessage(message: IMessage): LLMMessage {
    // Basic mapping, assumes IMessage.content can be directly used or is simple string.
    // More complex mapping might be needed if IMessage.content structure differs significantly
    // from what LLMMessage expects for non-string content (e.g. multimodal).
    const llmMessage: LLMMessage = {
      role: message.role,
      content: message.content as string | Array<any>, // Cast needed if IMessage.content is broader
    };
    if (message.metadata?.tool_calls) {
      llmMessage.tool_calls = message.metadata.tool_calls as LLMToolCall[];
    }
    if (message.metadata?.tool_call_id) {
      llmMessage.tool_call_id = message.metadata.tool_call_id as string;
    }
    if (message.role === 'tool' && message.metadata?.name) {
      // OpenAI expects 'name' for tool role in some contexts
      llmMessage.name = message.metadata.name as string;
    }
    return llmMessage;
  }
}
