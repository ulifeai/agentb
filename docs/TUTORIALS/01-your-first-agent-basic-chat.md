# Your First Agent - Basic Chat

Let's build the simplest possible AI agent: a conversational chatbot that can stream responses back to your console. This will introduce you to the `AgentB` facade for quick initialization.

**Goal**: Create a Node.js script that lets you chat with an AI, seeing its responses streamed in real-time.

## Prerequisites

* You've completed the [Installation Guide](../01-installation.md).
* Your `OPENAI_API_KEY` is set in your `.env` file.

## Step 1: Create Your Script

Create a new file, for example, `basicChat.ts`.

## Step 2: Write the Code

```typescript
import * as dotenv from 'dotenv';
dotenv.config(); // Load environment variables

import { AgentB, LLMMessage } from '@ulifeai/agentb';
import readline from 'readline/promises'; // For console input

async function runBasicChat() {
  // 1. Initialize AgentB
  // This sets up the LLM client (OpenAI by default if OPENAI_API_KEY is set)
  // and default in-memory storage for conversations.
  AgentB.initialize({
    llmProvider: {
      provider: 'openai',
      model: 'gpt-4o-mini', // Feel free to change the model
    },
    // No tools needed for this basic chat
  });
  console.log("🤖 AgentB Initialized for Basic Chat!");

  // 2. Set up for console interaction
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const threadId = `basic-chat-thread-${Date.now()}`; // A unique ID for this conversation
  console.log(`\nStarting chat on thread: ${threadId}`);
  console.log("Type 'exit' to end the chat.\n");

  // 3. Chat Loop
  while (true) {
    const userInput = await rl.question("You: ");
    if (userInput.toLowerCase() === 'exit') {
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    const userMessage: LLMMessage = { role: 'user', content: userInput };
    process.stdout.write("Agent: ");

    try {
      // 4. Get the agent's response stream
      const agentEventStream = AgentB.runHttpInteractionStream(
        threadId,
        userMessage
        // No specific AgentRunConfig override needed for this simple case
      );

      // 5. Process the stream of events
      for await (const event of agentEventStream) {
        if (event.type === 'thread.message.delta' && event.data.delta.contentChunk) {
          // Stream content chunks to the console
          process.stdout.write(event.data.delta.contentChunk);
        }
        if (event.type === 'thread.message.completed' && event.data.message.role === 'assistant') {
          // Newline after the assistant's full message is completed
          process.stdout.write("\n");
        }
        if (event.type === 'thread.run.failed') {
          process.stdout.write("\n");
          console.error("😔 Agent run failed:", event.data.error.message);
          break; // Exit the event loop for this turn on failure
        }
        // You can log other event types for debugging if you like:
        // else if (event.type !== 'thread.message.delta') {
        //   console.log(`\n[Event: ${event.type}]`);
        // }
      }
    } catch (error) {
      console.error("\n😞 Error during agent interaction:", error);
    }
    process.stdout.write("\n");
  }

  console.log("\n👋 Chat ended. Goodbye!");
  rl.close();
}

runBasicChat().catch(console.error);
```

## Step 3: Run Your Agent

1. **Save** the `basicChat.ts` file.
2.  **Compile** (if you're not using `ts-node`):

    ```bash
    npx tsc basicChat.ts
    ```
3.  **Run**:

    ```bash
    node basicChat.js
    # OR if you have ts-node installed:
    # npx ts-node basicChat.ts
    ```

You should see:

```
🤖 AgentB Initialized for Basic Chat!

Starting chat on thread: basic-chat-thread-xxxxxxxxxxxxx
Type 'exit' to end thechat.

You:
```

Type your message and press Enter. The agent's response will stream back!

**Example Interaction:**

```
You: Hello, who are you?
Agent: I am a large language model, trained by OpenAI.
You: What's the weather like today?
Agent: I am an AI and do not have access to real-time information like the current weather. You can check a weather website or app for that!
You: exit

👋 Chat ended. Goodbye!
```

## Key Takeaways

* **`AgentB.initialize()`**: Sets up the core framework with sensible defaults. You specified the LLM provider and model.
* **`AgentB.runHttpInteractionStream()`**: This is the core function from the facade to start an interaction. It takes a `threadId` (to maintain conversation context) and the user's `LLMMessage`. It returns an `AsyncGenerator` of `AgentEvent`s.
* **Event Streaming**: We iterated over the `agentEventStream`.
  * `thread.message.delta`: Contains chunks of the AI's response. This is what enables the streaming effect.
  * `thread.message.completed`: Signals the end of an assistant's message.
  * `thread.run.failed`: Indicates an error during the agent's processing.

Congratulations! You've built your first streaming AI chatbot with AgentB.

**Next Up**: [Connecting AgentB to Your API (OpenAPI)](02-agent-with-your-api.md) to give your agent some real capabilities!
