# Storage Adapters: `MemoryStorage`

AgentB provides a built-in `MemoryStorage` class that implements all three storage interfaces: `IThreadStorage`, `IMessageStorage`, and `IAgentRunStorage`.

## Overview

*   **Purpose**: `MemoryStorage` stores all threads, messages, and agent run data directly in the application's memory (using JavaScript Maps).
*   **Ease of Use**: It's the default storage adapter if you don't configure a custom one. This makes getting started with AgentB extremely quick, as no external database setup is required.
*   **Volatile**: **Crucially, all data stored in `MemoryStorage` is lost when your Node.js application stops or restarts.**
*   **Single Instance**: Typically, if `MemoryStorage` is used, a single instance is shared for threads, messages, and agent runs.

## When to Use `MemoryStorage`

*   **Development & Prototyping**: Perfect for quickly building and testing agent functionalities without the overhead of database setup.
*   **Testing**: Useful for unit and integration tests where you need a clean, predictable storage state for each test run.
*   **Simple Demos or CLI Tools**: For applications where conversation persistence across restarts is not a requirement.
*   **Short-Lived Interactions**: If agent interactions are transient and don't need to be stored long-term.

## How It Works

Internally, `MemoryStorage` uses JavaScript `Map` objects:
*   `private threads: Map<string, IThread>`: Stores thread objects, keyed by `threadId`.
*   `private messages: Map<string, IMessage[]>`: Stores arrays of message objects, keyed by `threadId`.
*   `public agentRuns: Map<string, IAgentRun>`: Stores agent run objects, keyed by `runId`. (Note: The original file content has `agentRuns` as public; ideally, it would be private with public accessor methods like `threads` and `messages` if direct access were intended, but interaction is through the interface methods).

When methods like `createThread`, `addMessage`, or `getRun` are called, `MemoryStorage` performs operations directly on these in-memory Maps.

## Usage

You typically don't interact with `MemoryStorage` directly. It's configured during initialization:

**Default Behavior (Implicit):**
If you initialize `AgentB` without specifying any storage options, `MemoryStorage` is used by default.
```typescript
import { AgentB } from '@ulifeai/agentb';

AgentB.initialize({
  llmProvider: { provider: 'openai', model: 'gpt-4o-mini' }
  // MemoryStorage will be used for threads, messages, and agent runs
});
```

**Explicit Configuration (Identical to Default if no other storage is set):**
```typescript
import { AgentB, MemoryStorage } from '@ulifeai/agentb';

const sharedMemoryStorage = new MemoryStorage();

AgentB.initialize({
  llmProvider: { provider: 'openai', model: 'gpt-4o-mini' },
  messageStorage: sharedMemoryStorage,
  threadStorage: sharedMemoryStorage,
  agentRunStorage: sharedMemoryStorage,
});
```
This is useful if you want to create and potentially pass around a specific instance of `MemoryStorage`.

## Limitations

*   **No Persistence**: As mentioned, data is lost on application restart. This is the primary reason it's not suitable for most production applications that require conversation history or audit trails.
*   **Single Process Scalability**: Being in-memory, it doesn't scale across multiple Node.js processes or servers. If you deploy your AgentB application in a clustered environment, each instance would have its own separate `MemoryStorage`, meaning conversations wouldn't be shared.
*   **Memory Consumption**: For very long-running applications with a vast number of threads and messages, memory usage could become a concern, though for typical development and testing, this is rarely an issue.

## Transitioning to Persistent Storage

When you're ready for production or need persistent data:
1.  Choose a database (e.g., PostgreSQL, MySQL, MongoDB).
2.  Implement classes that conform to `IThreadStorage`, `IMessageStorage`, and `IAgentRunStorage`, containing the logic to interact with your chosen database.
3.  Update your AgentB initialization to use your new persistent storage adapter(s) instead of `MemoryStorage`.

The [SQL & MongoDB Storage (Conceptual)](./03-sql-mongodb-storage.md) guide provides stubs to get you started on what these implementations might look like. 