
/**
 * @file Defines the IThread interface and related utilities or constants for threads.
 * The primary interface IThread is already defined in src/threads/types.ts.
 * This file can be used for helper functions or a concrete Thread class if needed.
 */

import { IThread } from './types'; // Re-export for local module use if preferred
import { v4 as uuidv4 } from 'uuid';

// Re-exporting the interface for clarity.
export { IThread };

/**
 * Utility function to create a new thread object with defaults.
 *
 * @param title Optional title for the thread.
 * @param userId Optional ID of the user associated with the thread.
 * @param metadata Optional metadata for the thread.
 * @param id Optional: Pre-defined ID for the thread.
 * @returns A new IThread object.
 */
export function createThreadObject(
  title?: string,
  userId?: string,
  metadata?: IThread['metadata'],
  id?: string
): IThread {
  const now = new Date();
  return {
    id: id || uuidv4(),
    createdAt: now,
    updatedAt: now,
    title: title,
    userId: userId,
    metadata: metadata || {},
  };
}

// Add any other thread-specific constants, enums, or utility functions here.
// For example, default thread titles, validation functions for thread metadata, etc.
