// src/threads/message.ts

/**
 * @file Defines the IMessage interface and related utilities or constants for messages.
 * The primary interface IMessage is already defined in src/threads/types.ts.
 * This file can be used for helper functions related to messages if needed in the future,
 * or for concrete Message class implementations if we move away from plain interfaces.
 */

import { IMessage } from './types'; // Re-export for local module use if preferred
import { v4 as uuidv4 } from 'uuid';
import { LLMMessage, LLMMessageRole } from '../llm/types';

// Re-exporting the interface for clarity within this module context, though not strictly necessary
// if directly importing from './types'.
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
export function createMessageObject(
  threadId: string,
  role: LLMMessageRole,
  content: IMessage['content'],
  metadata?: IMessage['metadata'],
  id?: string
): IMessage {
  const now = new Date();
  return {
    id: id || uuidv4(),
    threadId,
    role,
    content,
    createdAt: now,
    updatedAt: now,
    metadata: metadata || {},
  };
}

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
export function mapLLMMessageToIMessagePartial(
  llmMessage: LLMMessage,
  threadId: string,
  runId?: string,
  stepId?: string,
  existingMessageId?: string
): Omit<IMessage, 'createdAt' | 'updatedAt'> & { id?: string } {
  const messageForStorage: Omit<IMessage, 'createdAt' | 'updatedAt'> & { id?: string } = {
    id: existingMessageId ?? uuidv4(),
    threadId: threadId,
    role: llmMessage.role,
    content: llmMessage.content,
    metadata: {
      ...(runId && { runId }),
      ...(stepId && { stepId }),
      ...(llmMessage.tool_calls && { tool_calls: llmMessage.tool_calls }),
      ...(llmMessage.tool_call_id && { tool_call_id: llmMessage.tool_call_id }),
      ...(llmMessage.name && { name: llmMessage.name }), // For tool role, 'name' can be the function name
    },
  };
  // Clean up undefined/null metadata fields
  if (messageForStorage.metadata) {
    for (const key in messageForStorage.metadata) {
      if (messageForStorage.metadata[key] === undefined || messageForStorage.metadata[key] === null) {
        delete messageForStorage.metadata[key];
      }
    }
  }
  return messageForStorage;
}

/**
 * Maps a stored IMessage back to an LLMMessage, typically when preparing context for an LLM.
 *
 * @param iMessage The IMessage from storage.
 * @returns An LLMMessage.
 */
export function mapIMessageToLLMMessage(iMessage: IMessage): LLMMessage {
  const llmMessage: LLMMessage = {
    role: iMessage.role,
    content: iMessage.content, // Assumes content structure is compatible
  };
  if (iMessage.metadata?.tool_calls) {
    llmMessage.tool_calls = iMessage.metadata.tool_calls;
  }
  if (iMessage.metadata?.tool_call_id) {
    llmMessage.tool_call_id = iMessage.metadata.tool_call_id;
  }
  if (iMessage.role === 'tool' && iMessage.metadata?.name) {
    llmMessage.name = iMessage.metadata.name;
  }
  return llmMessage;
}

// Add any other message-specific constants, enums, or utility functions here.
// For example, maximum content length, validation functions, etc.
