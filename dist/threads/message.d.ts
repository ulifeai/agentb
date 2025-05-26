/**
 * @file Defines the IMessage interface and related utilities or constants for messages.
 * The primary interface IMessage is already defined in src/threads/types.ts.
 * This file can be used for helper functions related to messages if needed in the future,
 * or for concrete Message class implementations if we move away from plain interfaces.
 */
import { IMessage } from './types';
import { LLMMessage, LLMMessageRole } from '../llm/types';
export { IMessage, LLMMessageRole };
/**
 * Utility function to create a new message object with defaults.
 *
 * @param threadId The ID of the thread this message belongs to.
 * @param role The role of the message sender.
 * @param content The content of the message.
 * @param metadata Optional metadata for the message.
 * @param id Optional: Pre-defined ID for the message.
 * @returns A new IMessage object.
 */
export declare function createMessageObject(threadId: string, role: LLMMessageRole, content: IMessage['content'], metadata?: IMessage['metadata'], id?: string): IMessage;
/**
 * Maps an LLMMessage (used for direct LLM interaction) to an IMessage
 * (used for storage and general application representation), typically before saving.
 *
 * @param llmMessage The LLMMessage to map.
 * @param threadId The ID of the thread this message belongs to.
 * @param runId Optional runId to include in metadata.
 * @param stepId Optional stepId to include in metadata.
 * @param existingMessageId Optional ID if this is an update to an existing message shell.
 * @returns A structure suitable for creating or updating an IMessage in storage.
 */
export declare function mapLLMMessageToIMessagePartial(llmMessage: LLMMessage, threadId: string, runId?: string, stepId?: string, existingMessageId?: string): Omit<IMessage, 'createdAt' | 'updatedAt'> & {
    id?: string;
};
/**
 * Maps a stored IMessage back to an LLMMessage, typically when preparing context for an LLM.
 *
 * @param iMessage The IMessage from storage.
 * @returns An LLMMessage.
 */
export declare function mapIMessageToLLMMessage(iMessage: IMessage): LLMMessage;
