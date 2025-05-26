/**
 * @file Defines core types and interfaces for managing conversation threads and messages.
 */
import { LLMMessage, LLMMessageRole } from '../llm/types';
/**
 * Represents a single message within a conversation thread.
 */
export interface IMessage {
    /** Unique identifier for the message. */
    id: string;
    /** Identifier of the thread this message belongs to. */
    threadId: string;
    /** The role of the entity that created this message (system, user, assistant, tool). */
    role: LLMMessageRole;
    /**
     * The content of the message.
     * For 'tool' role, this contains the result of the tool execution.
     * Can be a simple string or a more complex structure (e.g., for multimodal content).
     */
    content: string | Array<{
        type: 'text';
        text: string;
    } | {
        type: 'image_url';
        image_url: {
            url: string;
            detail?: 'low' | 'high' | 'auto';
        };
    }>;
    /** Timestamp of when the message was created. */
    createdAt: Date;
    /** Optional: Timestamp of when the message was last updated. */
    updatedAt?: Date;
    /**
     * Optional: Additional metadata associated with the message.
     * For 'assistant' role, this might include `tool_calls`.
     * For 'tool' role, this might include `tool_call_id`.
     */
    metadata?: {
        tool_calls?: LLMMessage['tool_calls'];
        tool_call_id?: string;
        [key: string]: any;
    };
}
/**
 * Represents a conversation thread.
 */
export interface IThread {
    /** Unique identifier for the thread. */
    id: string;
    /** Timestamp of when the thread was created. */
    createdAt: Date;
    /** Optional: Timestamp of when the thread was last updated (e.g., new message added). */
    updatedAt?: Date;
    /** Optional: User-defined title or name for the thread. */
    title?: string;
    /** Optional: Identifier of the user who owns or created the thread. */
    userId?: string;
    /** Optional: Additional metadata associated with the thread. */
    metadata?: Record<string, any>;
    /** Optional: A summary of the conversation, if context management is active. */
    summary?: string;
}
/**
 * Options for querying messages from storage.
 */
export interface IMessageQueryOptions {
    /** Maximum number of messages to retrieve. */
    limit?: number;
    /** Retrieve messages created before this timestamp. */
    before?: Date | string;
    /** Retrieve messages created after this timestamp. */
    after?: Date | string;
    /** Order of messages ('asc' or 'desc' by creation time). Defaults to 'asc'. */
    order?: 'asc' | 'desc';
}
/**
 * Interface for a message storage adapter.
 * Defines how messages are persisted and retrieved.
 */
export interface IMessageStorage {
    /**
     * Adds a message to a thread.
     * @param message The message object to add.
     * @returns A Promise resolving to the added message (potentially with DB-generated ID/timestamps).
     */
    addMessage(message: Omit<IMessage, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<IMessage, 'id' | 'createdAt' | 'updatedAt'>>): Promise<IMessage>;
    /**
     * Retrieves messages from a thread.
     * @param threadId The ID of the thread.
     * @param options Optional query parameters (limit, before, after, order).
     * @returns A Promise resolving to an array of messages.
     */
    getMessages(threadId: string, options?: IMessageQueryOptions): Promise<IMessage[]>;
    /**
     * Updates an existing message.
     * @param messageId The ID of the message to update.
     * @param updates Partial message data with fields to update.
     * @returns A Promise resolving to the updated message.
     * @throws Error if the message is not found.
     */
    updateMessage(messageId: string, updates: Partial<Omit<IMessage, 'id' | 'threadId' | 'createdAt'>>): Promise<IMessage>;
    /**
     * Deletes a message.
     * @param messageId The ID of the message to delete.
     * @returns A Promise resolving when the operation is complete.
     */
    deleteMessage(messageId: string): Promise<void>;
}
/**
 * Interface for a thread storage adapter.
 * Defines how conversation threads are persisted and retrieved.
 */
export interface IThreadStorage {
    /**
     * Creates a new thread.
     * @param threadData Optional initial data for the thread (e.g., userId, title).
     * @returns A Promise resolving to the created thread.
     */
    createThread(threadData?: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread>;
    /**
     * Retrieves a thread by its ID.
     * @param threadId The ID of the thread.
     * @returns A Promise resolving to the thread, or null if not found.
     */
    getThread(threadId: string): Promise<IThread | null>;
    /**
     * Updates an existing thread.
     * @param threadId The ID of the thread to update.
     * @param updates Partial thread data with fields to update (e.g., title, metadata, summary).
     * @returns A Promise resolving to the updated thread.
     * @throws Error if the thread is not found.
     */
    updateThread(threadId: string, updates: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread>;
    /**
     * Deletes a thread and all its associated messages.
     * @param threadId The ID of the thread to delete.
     * @returns A Promise resolving when the operation is complete.
     */
    deleteThread(threadId: string): Promise<void>;
    /**
     * Lists threads, optionally filtered by userId or other criteria.
     * @param filterOptions Optional criteria to filter threads (e.g., { userId: string }).
     * @param paginationOptions Optional pagination parameters (e.g., { limit: number, offset: number }).
     * @returns A Promise resolving to an array of threads.
     */
    listThreads(filterOptions?: {
        userId?: string;
        [key: string]: any;
    }, paginationOptions?: {
        limit?: number;
        offset?: number;
    }): Promise<IThread[]>;
}
