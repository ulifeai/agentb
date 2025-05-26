# Core Concepts: Conversation Management in AgentB

AgentB provides a robust system for managing conversations between users and agents, handling message persistence, context management, and conversation history.

## Threads and Messages

### Thread (`IThread`)

A thread represents a single conversation session between a user and an agent. It contains:

*   **`id`**: A unique identifier for the thread.
*   **`metadata`**: Optional key-value pairs for storing thread-specific information.
*   **`createdAt`**: Timestamp of thread creation.
*   **`updatedAt`**: Timestamp of the last message in the thread.

### Message (`IMessage`)

Messages are the individual units of communication within a thread. Each message has:

*   **`id`**: A unique identifier for the message.
*   **`threadId`**: Reference to the thread it belongs to.
*   **`role`**: The role of the message sender:
    *   `user`: Messages from the human user.
    *   `assistant`: Messages from the AI agent.
    *   `system`: System-level messages (e.g., initial instructions).
    *   `tool`: Messages representing tool execution results.
*   **`content`**: The actual text content of the message.
*   **`createdAt`**: Timestamp of message creation.
*   **`metadata`**: Optional key-value pairs for message-specific data.

## Storage Adapters

AgentB uses storage adapters to persist and retrieve threads and messages. The framework includes:

*   **`MemoryStorageAdapter`**: In-memory storage for development and testing.
*   **`FileStorageAdapter`**: File-based storage for simple persistence.
*   **`DatabaseStorageAdapter`**: Database-backed storage for production use.

You can implement custom storage adapters by implementing the `IStorageAdapter` interface.

## Context Management

### Context Window

The context window is the amount of conversation history that's sent to the LLM in each request. AgentB's `ContextManager` handles:

1.  **Message Selection**: Choosing which messages to include in the context window.
2.  **Message Ordering**: Ensuring messages are sent in the correct chronological order.
3.  **Message Truncation**: Handling cases where the context window is full.

### Context Strategies

AgentB supports different strategies for managing the context window:

*   **`SlidingWindowContextStrategy`**: Maintains a fixed number of most recent messages.
*   **`TokenLimitContextStrategy`**: Maintains messages up to a token limit.
*   **`SummaryContextStrategy`**: Periodically summarizes older messages to save context space.

## Message Processing Flow

1.  **Message Creation**: When a new message is created (user input or agent response), it's stored using the configured storage adapter.
2.  **Context Assembly**: Before each LLM call, the `ContextManager` assembles the context window using the selected strategy.
3.  **LLM Processing**: The assembled context is sent to the LLM for processing.
4.  **Response Handling**: The LLM's response is processed and stored as a new message.

## Advanced Features

### Message Metadata

Messages can include metadata for various purposes:

*   **Tool Execution**: Tool-related metadata includes tool name, arguments, and execution results.
*   **User Information**: User-specific metadata like user ID or preferences.
*   **System Information**: System-level metadata like timestamps or execution environment.

### Thread Management

AgentB provides features for thread management:

*   **Thread Creation**: Creating new conversation threads.
*   **Thread Retrieval**: Fetching existing threads by ID.
*   **Thread Listing**: Listing available threads with optional filtering.
*   **Thread Deletion**: Removing threads and their associated messages.

### Message Streaming

AgentB supports streaming responses from the LLM:

*   **Chunk Processing**: Processing LLM response chunks as they arrive.
*   **Event Emission**: Emitting events for each chunk (`thread.message.delta`).
*   **UI Integration**: The `@ulifeai/agentb-ui` package's `useChat` hook handles streaming for React applications.

## Best Practices

1.  **Storage Selection**: Choose the appropriate storage adapter based on your needs:
    *   Use `MemoryStorageAdapter` for development.
    *   Use `FileStorageAdapter` for simple applications.
    *   Use `DatabaseStorageAdapter` for production applications.
2.  **Context Strategy**: Select a context strategy that balances history retention with token usage:
    *   Use `SlidingWindowContextStrategy` for most cases.
    *   Use `TokenLimitContextStrategy` when token usage is a concern.
    *   Use `SummaryContextStrategy` for long-running conversations.
3.  **Metadata Usage**: Use message metadata to store relevant information without cluttering the message content.
4.  **Thread Management**: Implement proper thread management to handle multiple conversations.
5.  **Error Handling**: Implement robust error handling for storage operations and message processing.

By understanding and effectively using AgentB's conversation management features, you can build robust and scalable conversational applications. 