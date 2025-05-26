// src/threads/thread.ts
import { v4 as uuidv4 } from 'uuid';
/**
 * Utility function to create a new thread object with defaults.
 *
 * @param title Optional title for the thread.
 * @param userId Optional ID of the user associated with the thread.
 * @param metadata Optional metadata for the thread.
 * @param id Optional: Pre-defined ID for the thread.
 * @returns A new IThread object.
 */
export function createThreadObject(title, userId, metadata, id) {
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
//# sourceMappingURL=thread.js.map