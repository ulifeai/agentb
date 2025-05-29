
import { createThreadObject } from '../thread';
import { IThread } from '../types';

describe('Thread Utilities', () => {
  describe('createThreadObject', () => {
    it('should create a thread with defaults', () => {
      const thread = createThreadObject();
      expect(thread.id).toBeDefined();
      expect(thread.createdAt).toBeInstanceOf(Date);
      expect(thread.updatedAt).toBeInstanceOf(Date);
      expect(thread.title).toBeUndefined();
      expect(thread.userId).toBeUndefined();
      expect(thread.metadata).toEqual({});
    });

    it('should create a thread with provided values', () => {
      const id = 'thread-xyz';
      const title = 'Test Thread';
      const userId = 'user-123';
      const metadata = { project: 'alpha' };
      const thread = createThreadObject(title, userId, metadata, id);

      expect(thread.id).toBe(id);
      expect(thread.title).toBe(title);
      expect(thread.userId).toBe(userId);
      expect(thread.metadata).toEqual(metadata);
    });
  });
});