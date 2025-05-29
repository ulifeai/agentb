
import { MemoryStorage } from '../memory-storage';
import { IMessage, IThread } from '../../types';
import { IAgentRun, AgentStatus } from '../../../agents/types'; // Correct path
import { createMessageObject, LLMMessageRole } from '../../message'; // Helper
import { createThreadObject } from '../../thread'; // Helper
import { AgentRunConfig } from '../../../agents';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  // --- IThreadStorage Tests ---
  describe('IThreadStorage implementation', () => {
    it('should create and retrieve a thread', async () => {
      const createdThread = await storage.createThread({ title: 'Test Thread 1' });
      expect(createdThread.id).toBeDefined();
      expect(createdThread.title).toBe('Test Thread 1');

      const retrievedThread = await storage.getThread(createdThread.id);
      expect(retrievedThread).toEqual(createdThread);
    });

    it('should return null for non-existent thread', async () => {
      const retrievedThread = await storage.getThread('non-existent-id');
      expect(retrievedThread).toBeNull();
    });

    it('should update a thread', async () => {
      const thread = await storage.createThread({ title: 'Initial Title' });
      const updates = { title: 'Updated Title', summary: 'A summary' };
      const updatedThread = await storage.updateThread(thread.id, updates);

      expect(updatedThread.title).toBe('Updated Title');
      expect(updatedThread.summary).toBe('A summary');
      expect(updatedThread.updatedAt! > thread.updatedAt!).toBe(true); // updatedAt should change
    });

    it('should delete a thread and its messages', async () => {
      const thread = await storage.createThread();
      await storage.addMessage(createMessageObject(thread.id, 'user', 'Hello'));
      
      await storage.deleteThread(thread.id);
      
      expect(await storage.getThread(thread.id)).toBeNull();
      expect(await storage.getMessages(thread.id)).toEqual([]); // Messages should be gone
    });

    it('should list threads, optionally filtered and paginated', async () => {
      await storage.createThread({ title: 'T1', userId: 'user1' });
      await storage.createThread({ title: 'T2', userId: 'user2' });
      await storage.createThread({ title: 'T3', userId: 'user1' });

      const allThreads = await storage.listThreads();
      expect(allThreads.length).toBe(3);

      const user1Threads = await storage.listThreads({ userId: 'user1' });
      expect(user1Threads.length).toBe(2);
      expect(user1Threads.every(t => t.userId === 'user1')).toBe(true);

      const paginated = await storage.listThreads({}, { limit: 1, offset: 1 });
      // Default sort is createdAt desc, so offset 1 is the second created.
      // This depends on creation timing if not controlled.
      // For more deterministic test, control createdAt or sort explicitly in test.
      expect(paginated.length).toBe(1);
    });
  });

  // --- IMessageStorage Tests ---
  describe('IMessageStorage implementation', () => {
    let threadId: string;

    beforeEach(async () => {
      const thread = await storage.createThread();
      threadId = thread.id;
    });

    it('should add and retrieve a message', async () => {
      const messageData = { threadId, role: 'user' as LLMMessageRole, content: 'Hi' };
      const addedMessage = await storage.addMessage(messageData);
      expect(addedMessage.id).toBeDefined();
      expect(addedMessage.content).toBe('Hi');

      const messages = await storage.getMessages(threadId);
      expect(messages.length).toBe(1);
      expect(messages[0]).toEqual(addedMessage);
    });
    
    it('should update thread updatedAt when adding a message', async () => {
        const initialThread = await storage.getThread(threadId);
        await new Promise(resolve => setTimeout(resolve, 10)); // Ensure time passes
        await storage.addMessage({ threadId, role: 'user' as LLMMessageRole, content: 'Msg1' });
        const updatedThread = await storage.getThread(threadId);
        expect(updatedThread!.updatedAt!.getTime()).toBeGreaterThan(initialThread!.updatedAt!.getTime());
    });

    it('should retrieve messages with query options (limit, order, before/after)', async () => {
        const t0 = new Date(); await new Promise(r => setTimeout(r, 5));
        const m1 = await storage.addMessage({ threadId, role: 'user', content: 'M1' });
        await new Promise(r => setTimeout(r, 5)); const t1 = new Date(); await new Promise(r => setTimeout(r, 5));
        const m2 = await storage.addMessage({ threadId, role: 'assistant', content: 'M2' });
        await new Promise(r => setTimeout(r, 5)); const t2 = new Date(); await new Promise(r => setTimeout(r, 5));
        const m3 = await storage.addMessage({ threadId, role: 'user', content: 'M3' });
        await new Promise(r => setTimeout(r, 5)); const t3 = new Date();

        // Limit
        let messages = await storage.getMessages(threadId, { limit: 2, order: 'asc' });
        expect(messages.map(m => m.content)).toEqual(['M1', 'M2']);

        // Order
        messages = await storage.getMessages(threadId, { order: 'desc' });
        expect(messages.map(m => m.content)).toEqual(['M3', 'M2', 'M1']);

        // After
        messages = await storage.getMessages(threadId, { after: t1, order: 'asc' }); // Messages after m1 was created
        expect(messages.map(m => m.content)).toEqual(['M2', 'M3']);
        
        // Before
        messages = await storage.getMessages(threadId, { before: t2, order: 'asc' }); // Messages before m2 was created (so only m1)
        expect(messages.map(m => m.content)).toEqual(['M1']); // This might be tricky if t2 is exactly m2.createdAt
                                                            // Let's adjust: before m3 was created
        messages = await storage.getMessages(threadId, { before: m3.createdAt, order: 'asc' });
        expect(messages.map(m => m.content)).toEqual(['M1', 'M2']);


        // Combined
        messages = await storage.getMessages(threadId, { after: m1.createdAt, before: m3.createdAt, order: 'asc' });
        expect(messages.map(m => m.content)).toEqual(['M2']);
    });

    it('should update an existing message', async () => {
        const addedMessage = await storage.addMessage({ threadId, role: 'user', content: 'Original' });
        const updates = { content: 'Updated Content', metadata: { edited: true }};
        const updatedMessage = await storage.updateMessage(addedMessage.id, updates);

        expect(updatedMessage.content).toBe('Updated Content');
        expect(updatedMessage.metadata?.edited).toBe(true);
        expect(updatedMessage.updatedAt! > addedMessage.updatedAt!).toBe(true);
    });

    it('should delete a message', async () => {
        const m1 = await storage.addMessage({ threadId, role: 'user', content: 'Msg1' });
        await storage.addMessage({ threadId, role: 'user', content: 'Msg2' });
        
        await storage.deleteMessage(m1.id);
        const messages = await storage.getMessages(threadId);
        expect(messages.length).toBe(1);
        expect(messages[0].content).toBe('Msg2');
    });
  });

  // --- IAgentRunStorage Tests ---
  describe('IAgentRunStorage implementation', () => {
    let threadId: string;

    beforeEach(async () => {
      const thread = await storage.createThread();
      threadId = thread.id;
    });

    it('should create and retrieve an agent run', async () => {
      const runData = { 
        threadId, 
        agentType: 'TestAgent', 
        config: { model: 'test-model' } as AgentRunConfig 
      };
      const createdRun = await storage.createRun(runData);

      expect(createdRun.id).toBeDefined();
      expect(createdRun.threadId).toBe(threadId);
      expect(createdRun.agentType).toBe('TestAgent');
      expect(createdRun.status).toBe('queued'); // Default initial status

      const retrievedRun = await storage.getRun(createdRun.id);
      expect(retrievedRun).toEqual(createdRun);
    });

    it('should update an agent run status and timestamps', async () => {
      const run = await storage.createRun({ 
        threadId, 
        agentType: 'TestAgent', 
        config: { model: 'test-model' } as AgentRunConfig 
      });
      
      let updatedRun = await storage.updateRun(run.id, { status: 'in_progress' });
      expect(updatedRun.status).toBe('in_progress');
      expect(updatedRun.startedAt).toBeInstanceOf(Date);
      expect(updatedRun.completedAt).toBeUndefined();

      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure time passes

      updatedRun = await storage.updateRun(run.id, { status: 'completed', lastError: undefined });
      expect(updatedRun.status).toBe('completed');
      expect(updatedRun.completedAt).toBeInstanceOf(Date);
      expect(updatedRun.completedAt! > updatedRun.startedAt!).toBe(true);
      expect(updatedRun.lastError).toBeUndefined();
    });

     it('should update agent run with error', async () => {
      const run = await storage.createRun({ 
        threadId, 
        agentType: 'TestAgent', 
        config: { model: 'test-model' } as AgentRunConfig 
      });
      const errorDetails = { code: 'tool_error', message: 'Tool failed' };
      const updatedRun = await storage.updateRun(run.id, { status: 'failed', lastError: errorDetails });
      
      expect(updatedRun.status).toBe('failed');
      expect(updatedRun.lastError).toEqual(errorDetails);
      expect(updatedRun.completedAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent agent run', async () => {
        expect(await storage.getRun('non-existent-run-id')).toBeNull();
    });
  });
});