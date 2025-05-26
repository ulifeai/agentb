# Storage Adapters: SQL & MongoDB (Conceptual)

For production applications requiring persistent storage of conversations and agent run data, you'll need to implement storage adapters for a database system like SQL (e.g., PostgreSQL, MySQL, SQLite) or a NoSQL database like MongoDB.

AgentB provides the interfaces (`IThreadStorage`, `IMessageStorage`, `IAgentRunStorage`) and conceptual stubs (`SqlStorage`, `MongoDbStorage`) to guide these implementations. These stubs showcase the methods you need to implement but **do not contain actual database interaction logic.**

## General Approach to Implementing a Persistent Adapter

1.  **Choose Your Database**: Select the database system that best fits your application's requirements (scalability, relational needs, document structure, etc.).
2.  **Design Your Schema**:
    *   **Threads Table/Collection**: Typically needs columns/fields for `id` (primary key), `createdAt`, `updatedAt`, `title` (optional), `userId` (optional), `metadata` (often stored as JSON/JSONB or a BSON object), `summary` (optional).
    *   **Messages Table/Collection**: `id` (primary key), `threadId` (foreign key/indexed), `role`, `content` (can be text, or JSON/BSON for structured content), `createdAt`, `updatedAt`, `metadata` (JSON/JSONB/BSON, for tool calls, etc.). Consider indexes on `threadId` and `createdAt` for efficient querying.
    *   **Agent Runs Table/Collection**: `id` (primary key), `threadId` (indexed), `agentType`, `status` (indexed), `createdAt`, `startedAt` (optional), `completedAt` (optional), `expiresAt` (optional), `lastError` (JSON/JSONB/BSON), `config` (JSON/JSONB/BSON), `metadata` (JSON/JSONB/BSON).
3.  **Select a Database Client/ORM**:
    *   **SQL**:
        *   Query Builders: Knex.js
        *   ORMs: Sequelize, TypeORM, Prisma
    *   **MongoDB**:
        *   Official MongoDB Node.js Driver
        *   ODMs: Mongoose
4.  **Implement the Interfaces**:
    *   Create a class (e.g., `MyPostgresStorage` or `MyMongooseStorage`).
    *   Have this class implement `IThreadStorage`, `IMessageStorage`, and `IAgentRunStorage`.
    *   In each method (e.g., `createThread`, `addMessage`), write the database-specific code (SQL queries, MongoDB driver commands) to perform the required CRUD operations.
    *   Handle data serialization/deserialization (e.g., `JSON.stringify`/`JSON.parse` for metadata stored as text in SQL, or ensure BSON compatibility for MongoDB).
    *   Implement error handling and potentially throw `StorageError` for database-related issues.

## `SqlStorage` (Conceptual Stub - `src/threads/storage/sql-storage.ts`)

The `SqlStorage` class in AgentB (`@ulifeai/agentb/dist/threads/storage/sql-storage.js`) is a **non-functional stub**. It outlines the methods but contains comments like `// TODO: Implement SQL INSERT operation`.

**To make it functional, you would:**
1.  Install a SQL client library (e.g., `pg` for PostgreSQL, `mysql2` for MySQL, `sqlite3` for SQLite) and a query builder/ORM like `knex`.
2.  Configure the database connection.
3.  Replace the `// TODO:` comments with actual SQL query logic using your chosen client/ORM.

**Example Snippet (Conceptual for `createThread` with Knex):**
```typescript
// Inside your functional SqlStorage class
// Assuming 'dbClient' is an initialized Knex instance

async createThread(threadData?: Partial<Omit<IThread, 'id' | 'createdAt'>>): Promise<IThread> {
  if (!this.dbClient) throw new StorageError('Database client not configured.');
  const threadId = uuidv4();
  const now = new Date();
  const newThread: IThread = { /* ... as in IThread ... */ };

  await this.dbClient('threads').insert({
    id: newThread.id,
    created_at: newThread.createdAt,
    updated_at: newThread.updatedAt,
    title: newThread.title,
    user_id: newThread.userId,
    metadata: JSON.stringify(newThread.metadata || {}), // Store as JSON string
    summary: newThread.summary,
  });
  return newThread;
}
```

## `MongoDbStorage` (Conceptual Stub - `src/threads/storage/mongodb-storage.ts`)

Similarly, `MongoDbStorage` (`@ulifeai/agentb/dist/threads/storage/mongodb-storage.js`) is a **non-functional stub**.

**To make it functional, you would:**
1.  Install the `mongodb` Node.js driver.
2.  Connect to your MongoDB instance and get a `Db` object.
3.  Obtain `Collection` objects for threads, messages, and agent runs.
4.  Replace `// TODO:` comments with MongoDB driver operations (e.g., `insertOne`, `findOne`, `updateOne`, `deleteMany`).

**Example Snippet (Conceptual for `addMessage` with MongoDB Driver):**
```typescript
// Inside your functional MongoDbStorage class
// Assuming 'threadsCollection' and 'messagesCollection' are initialized MongoDB Collection instances

async addMessage(
  messageData: Omit<IMessage, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<IMessage, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<IMessage> {
  if (!this.messagesCollection || !this.threadsCollection) throw new StorageError('MongoDB collections not configured.');
  if (!messageData.threadId) throw new ValidationError('threadId is required.');

  const threadExistsCount = await this.threadsCollection.countDocuments({ id: messageData.threadId });
  if (threadExistsCount === 0) {
    throw new StorageError(`Thread with ID "${messageData.threadId}" not found. Cannot add message.`);
  }

  const messageId = messageData.id || uuidv4();
  const now = new Date();
  const newMessageDoc: IMessage & { _id?: string } = {
    _id: messageId, // Use custom ID as _id for easier querying by 'id' field
    id: messageId,
    // ... other IMessage fields ...
    createdAt: messageData.createdAt || now,
    updatedAt: messageData.updatedAt || now,
  };

  await this.messagesCollection.insertOne(newMessageDoc);
  await this.threadsCollection.updateOne(
    { id: messageData.threadId },
    { $set: { updatedAt: now } }
  );

  const { _id, ...messageToReturn } = newMessageDoc;
  return messageToReturn as IMessage;
}
```

## Key Considerations for Implementation

*   **Indexing**: Ensure proper database indexes are created on frequently queried fields (e.g., `threadId` in the messages collection, `userId` in threads, `status` in agent runs, `createdAt` for sorting/filtering).
*   **Transactions (SQL)**: For operations that modify multiple tables (like `deleteThread` which also deletes messages), use database transactions to ensure atomicity.
*   **Error Handling**: Catch database-specific errors and wrap them in `StorageError` or `ValidationError` as appropriate.
*   **Data Mapping**: Carefully map between the `IThread`/`IMessage`/`IAgentRun` interface structures and your database schema, especially for `Date` objects and JSON/BSON `metadata` or `config` fields.
*   **Query Options**: Pay close attention to implementing the `IMessageQueryOptions` (`limit`, `before`, `after`, `order`) correctly in your `getMessages` method.
*   **Scalability**: Design your schema and queries with scalability in mind if you anticipate a large volume of data.

By implementing these interfaces with your chosen database, you can make AgentB's conversational state and agent run history persistent and robust for production environments. 