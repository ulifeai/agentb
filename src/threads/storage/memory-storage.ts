
/**
 * @file In-memory implementation of IMessageStorage and IThreadStorage.
 * Useful for testing, development, or simple applications without a persistent database.
 * NOT SUITABLE FOR PRODUCTION USE due to data loss on application restart.
 */

import { v4 as uuidv4 } from 'uuid';
import { IMessage, IThread, IMessageStorage, IThreadStorage, IMessageQueryOptions } from '../types';
import { ApplicationError, StorageError, ValidationError } from '../../core/errors';
import { IAgentRun, IAgentRunStorage, AgentStatus } from '../../agents/types'; // Import new types

/**
 * In-memory implementation of IThreadStorage and IMessageStorage.
 * Stores threads and messages in memory. Data is lost when the application stops.
 */
export class MemoryStorage implements IThreadStorage, IMessageStorage {
  private threads: Map<string, IThread> = new Map();
  private messages: Map<string, IMessage[]> = new Map(); // threadId -> messages
  public agentRuns: Map<string, IAgentRun> = new Map(); // Add storage for agent runs

  constructor() {
    console.warn('[MemoryStorage] Initialized. Data will be lost on application restart. Not for production.');
  }

  // --- IThreadStorage Implementation ---

  async createThread(threadData?: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread> {
    const threadId = uuidv4();
    const now = new Date();
    const newThread: IThread = {
      id: threadId,
      createdAt: now,
      updatedAt: now,
      title: threadData?.title,
      userId: threadData?.userId,
      metadata: threadData?.metadata || {},
      summary: threadData?.summary,
    };
    this.threads.set(threadId, newThread);
    this.messages.set(threadId, []); // Initialize an empty array for messages
    return { ...newThread }; // Return a copy
  }

  async getThread(threadId: string): Promise<IThread | null> {
    if (!this.threads.has(threadId)) {
      return null;
    }
    const thread = this.threads.get(threadId)!;
    return { ...thread }; // Return a copy
  }

  async updateThread(threadId: string, updates: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread> {
    if (!this.threads.has(threadId)) {
      throw new StorageError(`Thread with ID "${threadId}" not found for update.`);
    }
    const existingThread = this.threads.get(threadId)!;
    const updatedThread: IThread = {
      ...existingThread,
      ...updates,
      updatedAt: new Date(), // Always update the updatedAt timestamp
    };
    this.threads.set(threadId, updatedThread);
    return { ...updatedThread }; // Return a copy
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!this.threads.has(threadId)) {
      // Optional: throw error or be idempotent
      // throw new StorageError(`Thread with ID "${threadId}" not found for deletion.`);
      console.warn(`[MemoryStorage] Attempted to delete non-existent thread: ${threadId}`);
      return;
    }
    this.threads.delete(threadId);
    this.messages.delete(threadId); // Also delete associated messages
  }

  async listThreads(
    filterOptions?: { userId?: string; [key: string]: any },
    paginationOptions?: { limit?: number; offset?: number }
  ): Promise<IThread[]> {
    let allThreads = Array.from(this.threads.values());

    if (filterOptions?.userId) {
      allThreads = allThreads.filter((t) => t.userId === filterOptions.userId);
    }
    // Add other filters as needed from filterOptions

    // Sort by createdAt descending by default for listing
    allThreads.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = paginationOptions?.offset || 0;
    const limit = paginationOptions?.limit || allThreads.length; // Default to all if no limit

    return allThreads.slice(offset, offset + limit).map((t) => ({ ...t })); // Return copies
  }

  // --- IMessageStorage Implementation ---

  async addMessage(
    messageData: Omit<IMessage, 'id' | 'createdAt' | 'updatedAt'> &
      Partial<Pick<IMessage, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<IMessage> {
    if (!messageData.threadId) {
      throw new ValidationError('threadId is required to add a message.');
    }
    if (!this.threads.has(messageData.threadId)) {
      throw new StorageError(`Thread with ID "${messageData.threadId}" not found. Cannot add message.`);
    }

    const messageId = messageData.id || uuidv4();
    const now = new Date();
    const newMessage: IMessage = {
      id: messageId,
      threadId: messageData.threadId,
      role: messageData.role,
      content: messageData.content, // Assuming content is already in the correct format
      createdAt: messageData.createdAt || now,
      updatedAt: messageData.updatedAt || now,
      metadata: messageData.metadata || {},
    };

    const threadMessages = this.messages.get(messageData.threadId) || [];
    threadMessages.push(newMessage);
    this.messages.set(messageData.threadId, threadMessages);

    // Update thread's updatedAt timestamp
    const thread = this.threads.get(messageData.threadId);
    if (thread) {
      thread.updatedAt = now;
    }

    return { ...newMessage }; // Return a copy
  }

  async getMessages(threadId: string, options?: IMessageQueryOptions): Promise<IMessage[]> {
    if (!this.messages.has(threadId)) {
      // If the thread itself doesn't exist, it's a stronger error than just no messages.
      if (!this.threads.has(threadId)) {
        throw new StorageError(`Thread with ID "${threadId}" not found when trying to get messages.`);
      }
      return []; // Thread exists but has no messages
    }

    let threadMessages = [...(this.messages.get(threadId) || [])]; // Work with a copy

    // Apply filtering based on options
    if (options?.after) {
      const afterDate = typeof options.after === 'string' ? new Date(options.after) : options.after;
      threadMessages = threadMessages.filter((m) => m.createdAt > afterDate);
    }
    if (options?.before) {
      const beforeDate = typeof options.before === 'string' ? new Date(options.before) : options.before;
      threadMessages = threadMessages.filter((m) => m.createdAt < beforeDate);
    }

    // Apply sorting
    const order = options?.order || 'asc'; // Default to ascending
    threadMessages.sort((a, b) => {
      if (order === 'asc') {
        return a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
    });

    // Apply limit (after sorting and filtering by date)
    if (options?.limit !== undefined) {
      if (order === 'asc') {
        // If ascending, we want the last 'limit' items if applying limit from the end of the array
        // Or the first 'limit' items if applying from the beginning.
        // Standard interpretation of limit is usually the first N items after sorting.
        threadMessages = threadMessages.slice(0, options.limit);
      } else {
        // 'desc'
        // If descending, also take the first N items after sorting.
        threadMessages = threadMessages.slice(0, options.limit);
      }
    }
    return threadMessages.map((m) => ({ ...m })); // Return copies
  }

  async updateMessage(
    messageId: string,
    updates: Partial<Omit<IMessage, 'id' | 'threadId' | 'createdAt'>>
  ): Promise<IMessage> {
    let foundMessage: IMessage | undefined;
    let threadIdWithMessage: string | undefined;

    for (const [threadId, messagesInThread] of this.messages.entries()) {
      const messageIndex = messagesInThread.findIndex((m) => m.id === messageId);
      if (messageIndex !== -1) {
        foundMessage = messagesInThread[messageIndex];
        threadIdWithMessage = threadId;
        const updatedMessage = {
          ...foundMessage,
          ...updates,
          updatedAt: new Date(),
        };
        messagesInThread[messageIndex] = updatedMessage;
        this.messages.set(threadId, messagesInThread); // Update the map

        // Update thread's updatedAt timestamp
        const thread = this.threads.get(threadId);
        if (thread) {
          thread.updatedAt = new Date();
        }
        return { ...updatedMessage }; // Return a copy
      }
    }
    throw new StorageError(`Message with ID "${messageId}" not found for update.`);
  }

  async deleteMessage(messageId: string): Promise<void> {
    for (const [threadId, messagesInThread] of this.messages.entries()) {
      const initialLength = messagesInThread.length;
      const filteredMessages = messagesInThread.filter((m) => m.id !== messageId);
      if (filteredMessages.length < initialLength) {
        this.messages.set(threadId, filteredMessages);
        // Optionally update thread's updatedAt timestamp
        const thread = this.threads.get(threadId);
        if (thread) {
          thread.updatedAt = new Date();
        }
        return;
      }
    }
    // Optional: throw error or be idempotent
    console.warn(`[MemoryStorage] Attempted to delete non-existent message: ${messageId}`);
  }

  // --- IAgentRunStorage Implementation ---
  async createRun(runData: Omit<IAgentRun, 'id' | 'createdAt' | 'status'> & { id?: string }): Promise<IAgentRun> {
    const runId = runData.id || uuidv4();
    const now = new Date();
    const newRun: IAgentRun = {
      id: runId,
      threadId: runData.threadId,
      agentType: runData.agentType,
      status: 'queued', // Default initial status
      createdAt: now,
      config: runData.config,
      metadata: runData.metadata || {},
      // startedAt, completedAt, expiresAt, lastError will be set by updates
    };
    this.agentRuns.set(runId, newRun);
    console.info(`[MemoryStorage] Created agent run: ${runId} for thread ${newRun.threadId}`);
    return { ...newRun };
  }

  async getRun(runId: string): Promise<IAgentRun | null> {
    const run = this.agentRuns.get(runId);
    return run ? { ...run } : null;
  }

  async updateRun(
    runId: string,
    updates: Partial<Omit<IAgentRun, 'id' | 'threadId' | 'createdAt' | 'agentType'>>
  ): Promise<IAgentRun> {
    const existingRun = this.agentRuns.get(runId);
    if (!existingRun) {
      throw new StorageError(`Agent run with ID "${runId}" not found for update.`);
    }
    // Ensure status updates are valid transitions if implementing a state machine
    const updatedRun: IAgentRun = {
      ...existingRun,
      ...updates,
    };
    if (updates.status && updates.status !== existingRun.status) {
      if (updates.status === 'in_progress' && !updatedRun.startedAt) updatedRun.startedAt = new Date();
      if (['completed', 'failed', 'cancelled', 'expired'].includes(updates.status) && !updatedRun.completedAt) {
        updatedRun.completedAt = new Date();
      }
    }
    this.agentRuns.set(runId, updatedRun);
    return { ...updatedRun };
  }
}
