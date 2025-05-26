import { IMessage, IThread, IMessageStorage, IThreadStorage, IMessageQueryOptions } from '../types';
import { IAgentRun } from '../../agents/types';
/**
 * In-memory implementation of IThreadStorage and IMessageStorage.
 * Stores threads and messages in memory. Data is lost when the application stops.
 */
export declare class MemoryStorage implements IThreadStorage, IMessageStorage {
    private threads;
    private messages;
    agentRuns: Map<string, IAgentRun>;
    constructor();
    createThread(threadData?: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread>;
    getThread(threadId: string): Promise<IThread | null>;
    updateThread(threadId: string, updates: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread>;
    deleteThread(threadId: string): Promise<void>;
    listThreads(filterOptions?: {
        userId?: string;
        [key: string]: any;
    }, paginationOptions?: {
        limit?: number;
        offset?: number;
    }): Promise<IThread[]>;
    addMessage(messageData: Omit<IMessage, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<IMessage, 'id' | 'createdAt' | 'updatedAt'>>): Promise<IMessage>;
    getMessages(threadId: string, options?: IMessageQueryOptions): Promise<IMessage[]>;
    updateMessage(messageId: string, updates: Partial<Omit<IMessage, 'id' | 'threadId' | 'createdAt'>>): Promise<IMessage>;
    deleteMessage(messageId: string): Promise<void>;
    createRun(runData: Omit<IAgentRun, 'id' | 'createdAt' | 'status'> & {
        id?: string;
    }): Promise<IAgentRun>;
    getRun(runId: string): Promise<IAgentRun | null>;
    updateRun(runId: string, updates: Partial<Omit<IAgentRun, 'id' | 'threadId' | 'createdAt' | 'agentType'>>): Promise<IAgentRun>;
}
