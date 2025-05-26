/**
 * @file Defines the IThread interface and related utilities or constants for threads.
 * The primary interface IThread is already defined in src/threads/types.ts.
 * This file can be used for helper functions or a concrete Thread class if needed.
 */
import { IThread } from './types';
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
export declare function createThreadObject(title?: string, userId?: string, metadata?: IThread['metadata'], id?: string): IThread;
