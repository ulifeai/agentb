# Storage Adapters: Overview

AgentB needs to store and retrieve conversational data (threads and messages) as well as the state of agent executions (agent runs). To allow flexibility in how and where this data is stored, AgentB uses a set of storage adapter interfaces.

This guide provides an overview of these interfaces and the default `MemoryStorage` implementation.

## Storage Interfaces

There are three main storage interfaces in AgentB:

1.  **`IThreadStorage`**:
    *   **Purpose**: Manages conversation threads (`IThread` objects).
    *   **Key Methods**:
        *   `createThread(threadData?): Promise<IThread>`: Creates a new conversation thread.
        *   `getThread(threadId: string): Promise<IThread | null>`: Retrieves a specific thread.
        *   `updateThread(threadId: string, updates: Partial<IThread>): Promise<IThread>`: Updates thread properties (e.g., title, metadata, summary).
        *   `deleteThread(threadId: string): Promise<void>`: Deletes a thread (and typically its associated messages).
        *   `listThreads(filterOptions?, paginationOptions?): Promise<IThread[]>`: Lists threads, often with filtering (e.g., by `userId`) and pagination.

2.  **`IMessageStorage`**:
    *   **Purpose**: Manages individual messages (`IMessage` objects) within threads.
    *   **Key Methods**:
        *   `addMessage(messageData: Omit<IMessage, ...>): Promise<IMessage>`: Adds a message to a specified thread.
        *   `getMessages(threadId: string, options?: IMessageQueryOptions): Promise<IMessage[]>`: Retrieves messages for a thread, with options for limiting, ordering, and time-based filtering (before/after).
        *   `updateMessage(messageId: string, updates: Partial<IMessage>): Promise<IMessage>`: Updates an existing message (e.g., its content or metadata).
        *   `deleteMessage(messageId: string): Promise<void>`: Deletes a specific message.

3.  **`IAgentRunStorage`**:
    *   **Purpose**: Manages the state and lifecycle of agent executions (`IAgentRun` objects).
    *   **Key Methods**:
        *   `createRun(runData: Omit<IAgentRun, ...>): Promise<IAgentRun>`: Creates a record for a new agent run.
        *   `getRun(runId: string): Promise<IAgentRun | null>`: Retrieves the state of a specific agent run.
        *   `updateRun(runId: string, updates: Partial<IAgentRun>): Promise<IAgentRun>`: Updates an agent run's status, configuration, error information, or timestamps (e.g., `startedAt`, `completedAt`).

## Why Pluggable Storage?

*   **Flexibility**: Choose the persistence solution that best fits your application's needs (in-memory, SQL database, NoSQL database, cloud-based storage).
*   **Scalability**: Transition from simple in-memory storage during development to robust database solutions for production.
*   **Testability**: Easily mock storage implementations for unit and integration testing.
*   **Separation of Concerns**: Keeps the core agent logic separate from data persistence details.

## Configuration

When you initialize AgentB (either via the `AgentB` facade or directly using `ApiInteractionManager`), you can provide your own implementations for these storage interfaces:

**Using `AgentB` Facade:**
```typescript
import { AgentB, IMessageStorage, IThreadStorage, IAgentRunStorage } from '@ulifeai/agentb';
// import { MyCustomSqlStorage } from './my-custom-sql-storage'; // Your implementation

// const myDbStorage = new MyCustomSqlStorage(/* db connection options */);

AgentB.initialize({
  // ... llmProvider config ...
  // messageStorage: myDbStorage,
  // threadStorage: myDbStorage,  // Often, one class implements multiple storage interfaces
  // agentRunStorage: myDbStorage,
});
```

**Using `ApiInteractionManager` Directly:**
```typescript
import { ApiInteractionManager, MemoryStorage /*, ... */ } from '@ulifeai/agentb';
// import { MyCustomMongoStorage } from './my-custom-mongo-storage';

// const myMongoStorage = new MyCustomMongoStorage(/* mongo client */);
const aim = new ApiInteractionManager({
  // ... llmClient, mode config ...
  // messageStorage: myMongoStorage,
  // threadStorage: myMongoStorage,
  // agentRunStorage: myMongoStorage,
});
```

If no storage adapters are provided, AgentB defaults to using `MemoryStorage` for all three.

## Next Steps

*   **[MemoryStorage](./02-memory-storage.md)**: Learn about the default in-memory adapter.
*   **[SQL & MongoDB Storage (Conceptual)](./03-sql-mongodb-storage.md)**: See conceptual stubs for how you might implement persistent storage with SQL or MongoDB.
*   **Implementing Your Own Adapter**: If you need to connect to a different database system, you would create classes that implement `IThreadStorage`, `IMessageStorage`, and `IAgentRunStorage`, containing the logic to interact with your chosen database. 