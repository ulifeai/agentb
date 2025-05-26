# Tutorial 2: Connecting AgentB to Your API (OpenAPI)

Now that you have a basic chat agent, let's give it the ability to interact with an external API. AgentB makes this incredibly easy if you have an OpenAPI (formerly Swagger) specification for your API.

**Goal**: Create an agent that can fetch data from a public API (the FakeStoreAPI in this case) using tools automatically generated from its OpenAPI spec.

## Prerequisites

*   Completed [Tutorial 1: Your First Agent](./01-your-first-agent-basic-chat.md).
*   Your `OPENAI_API_KEY` is set.

## Step 1: The OpenAPI Specification

For this tutorial, we'll use the public [FakeStoreAPI](https://fakestoreapi.com/). It has a simple OpenAPI specification available.

1.  **Get the Spec**: You can view it here: [https://fakestoreapi.com/fakestoreapi.json](https://fakestoreapi.com/fakestoreapi.json)
2.  **Save it Locally (Optional but Recommended)**: For reliability and to avoid network issues during development, save this JSON content into your project.
    *   Create a directory, e.g., `specs` in your project root.
    *   Save the JSON content as `specs/fakestoreapi.json`.

    ```json title="specs/fakestoreapi.json (Excerpt)"
    {
      "swagger": "2.0", // Note: AgentB works best with OpenAPI 3.x, but can often handle Swagger 2.0
      "info": {
        "version": "1.0.0",
        "title": "FakeStore API"
      },
      "host": "fakestoreapi.com",
      "basePath": "/",
      "schemes": ["https"],
      "paths": {
        "/products": {
          "get": {
            "summary": "Get all products",
            "operationId": "getAllProducts",
            // ... more details ...
          }
        },
        "/products/{id}": {
          "get": {
            "summary": "Get a single product",
            "operationId": "getSingleProduct",
            "parameters": [
              {
                "name": "id",
                "in": "path",
                "required": true,
                "description": "ID of the product to retrieve",
                "type": "integer"
              }
            ],
            // ... more details ...
          }
        }
        // ... other paths ...
      }
    }
    ```
    *Note: While AgentB's `OpenAPIConnector` primarily targets OpenAPI 3.x, it can often parse and utilize Swagger 2.0 specs like this one. For your own APIs, using OpenAPI 3.x is recommended for best compatibility.*

## Step 2: Update Your Script

Let's modify our `basicChat.ts` (or create a new file like `apiAgent.ts`).

```typescript title="apiAgent.ts"
import * as dotenv from 'dotenv';
dotenv.config();

import { AgentB, LLMMessage, ToolProviderSourceConfig } from '@ulifeai/agentb';
import readline from 'readline/promises';
import fs from 'fs'; // To read the spec file
import path from 'path'; // To construct file paths

async function runApiAgent() {
  // 1. Load the OpenAPI Specification
  let fakeStoreSpec;
  try {
    const specPath = path.join(__dirname, '../specs/fakestoreapi.json'); // Adjust path if your file is elsewhere
    const specFileContent = fs.readFileSync(specPath, 'utf-8');
    fakeStoreSpec = JSON.parse(specFileContent);
    console.log("🛍️ FakeStoreAPI OpenAPI spec loaded successfully.");
  } catch (error) {
    console.error("❌ Failed to load FakeStoreAPI spec:", error);
    console.log("Ensure 'specs/fakestoreapi.json' exists and is valid.");
    return;
  }

  // 2. Define the ToolProviderSourceConfig for FakeStoreAPI
  const fakeStoreApiProviderConfig: ToolProviderSourceConfig = {
    id: 'fakeStoreApi', // A unique ID for this tool provider source
    type: 'openapi',     // Indicates it's an OpenAPI-based provider
    openapiConnectorOptions: {
      spec: fakeStoreSpec, // Provide the loaded spec object
      sourceId: 'fakeStoreApi', // Crucial for matching auth overrides if any
      // No authentication needed for FakeStoreAPI
      // authentication: { type: 'none' }, // Default is 'none' if not specified
    },
    // Strategy for creating toolsets (groups of tools) from this API:
    // 'byTag': Creates a toolset for each API tag (e.g., "products", "users").
    // 'allInOne': Groups all tools from this API into a single toolset.
    toolsetCreationStrategy: 'byTag', // FakeStoreAPI doesn't have explicit tags, so it might group by path patterns or create one large set.
                                       // Let's try 'allInOne' for simplicity if 'byTag' results in many small sets or unexpected grouping.
    // toolsetCreationStrategy: 'allInOne',
    // allInOneToolsetName: 'FakeStoreTools', // Optional name if 'allInOne'
  };

  // 3. Initialize AgentB and Register the Tool Provider
  AgentB.initialize({
    llmProvider: {
      provider: 'openai',
      model: 'gpt-4o-mini',
    },
    // Register our FakeStoreAPI provider
    toolProviders: [fakeStoreApiProviderConfig],
  });
  console.log("🤖 AgentB Initialized with FakeStoreAPI tools!");

  // 4. Set up console interaction (same as Tutorial 1)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const threadId = `api-agent-thread-${Date.now()}`;
  console.log(`\nStarting API agent chat on thread: ${threadId}`);
  console.log("Ask about products (e.g., 'list all products', 'get product with id 1'). Type 'exit' to end.\n");

  // 5. Chat Loop (similar to Tutorial 1, but now with tool events)
  while (true) {
    const userInput = await rl.question("You: ");
    if (userInput.toLowerCase() === 'exit') break;
    if (!userInput.trim()) continue;

    const userMessage: LLMMessage = { role: 'user', content: userInput };
    process.stdout.write("Agent: ");

    try {
      const agentEventStream = AgentB.runHttpInteractionStream(threadId, userMessage);

      for await (const event of agentEventStream) {
        if (event.type === 'thread.message.delta') {
          if (event.data.delta.contentChunk) {
            process.stdout.write(event.data.delta.contentChunk);
          }
          // Optional: Log when the LLM decides to use a tool
          if (event.data.delta.toolCallsChunk) {
            // This provides partial tool call information as it's being decided by the LLM
            // For cleaner logging of full tool calls, 'thread.message.completed' is better.
          }
        } else if (event.type === 'thread.message.completed') {
          if (event.data.message.role === 'assistant') {
            if(!event.data.message.tool_calls) { // only add newline if it's a text response part
                 process.stdout.write("\n");
            }
            // Log the full tool call details if any were made
            if (event.data.message.metadata?.tool_calls) {
              const toolCalls = event.data.message.metadata.tool_calls;
              toolCalls.forEach(tc => {
                console.log(`\n[LLM Intends to Call Tool: ${tc.function.name} with args: ${tc.function.arguments}]`);
              });
            }
          }
        } else if (event.type === 'agent.tool.execution.started') {
          console.log(`\n[Tool Executing: ${event.data.toolName} with input ${JSON.stringify(event.data.input).substring(0,100)}...]`);
        } else if (event.type === 'agent.tool.execution.completed') {
          console.log(`[Tool Result (${event.data.toolName}) -> Success: ${event.data.result.success}]`);
          // Avoid printing massive tool outputs to console, just a snippet or success/failure
          if (event.data.result.success) {
            // console.log(`  Data (snippet): ${JSON.stringify(event.data.result.data).substring(0, 150)}...`);
          } else {
            console.error(`  Error: ${event.data.result.error}`);
          }
           process.stdout.write("Agent (processing tool result): "); // Indicate agent is thinking again
        } else if (event.type === 'thread.run.failed') {
          process.stdout.write("\n");
          console.error("😔 Agent run failed:", event.data.error.message, event.data.error.details || '');
          break;
        } else if (event.type === 'thread.run.completed') {
           // The final text response would have already been streamed via message.delta
           // So just ensure a newline if the last thing wasn't text.
        }
        // Optional: log all other events for debugging
        // else {
        //   console.log(`\n[Event: ${event.type}, Data: ${JSON.stringify(event.data).substring(0,100)}...]`);
        // }
      }
    } catch (error) {
      console.error("\n😞 Error during agent interaction:", error);
    }
    process.stdout.write("\n");
  }

  console.log("\n👋 API Agent chat ended. Goodbye!");
  rl.close();
}

runApiAgent().catch(console.error);
```

## Step 3: Run Your API-Connected Agent

1.  **Save** `apiAgent.ts` (and `specs/fakestoreapi.json` if you saved it).
2.  **Compile**: `npx tsc apiAgent.ts` (or your build command).
3.  **Run**: `node apiAgent.js` (or `npx ts-node apiAgent.ts`).

**Example Interaction:**

```text
🛍️ FakeStoreAPI OpenAPI spec loaded successfully.
🤖 AgentB Initialized with FakeStoreAPI tools!

Starting API agent chat on thread: api-agent-thread-xxxxxxxxxxxxx
Ask about products (e.g., 'list all products', 'get product with id 1'). Type 'exit' to end.

You: Can you list all products? Limit to 2.
Agent:
[LLM Intends to Call Tool: fakeStoreApi_getAllProducts with args: {"limit":"2"}]
[Tool Executing: fakeStoreApi_getAllProducts with input {"limit":"2"}...]
[Tool Result (fakeStoreApi_getAllProducts) -> Success: true]
Agent (processing tool result): Okay, I found 2 products for you:
1. Foldsack No. 1 Backpack, Fits 15 Laptops - $109.95
2. Mens Casual Premium Slim Fit T-Shirts - $22.3

You: Tell me about product ID 1
Agent:
[LLM Intends to Call Tool: fakeStoreApi_getSingleProduct with args: {"id":1}]
[Tool Executing: fakeStoreApi_getSingleProduct with input {"id":1}...]
[Tool Result (fakeStoreApi_getSingleProduct) -> Success: true]
Agent (processing tool result): Product ID 1 is the "Foldsack No. 1 Backpack, Fits 15 Laptops". Its price is $109.95, and it's in the "men's clothing" category. It has a rating of 3.9 out of 5 from 120 reviews.

You: exit

👋 API Agent chat ended. Goodbye!
```

## Key Takeaways

*   **`ToolProviderSourceConfig`**: This configuration object tells AgentB how to create a tool provider.
    *   `id`: A unique name for this source.
    *   `type: 'openapi'`: Specifies that the tools come from an OpenAPI spec.
    *   `openapiConnectorOptions.spec`: You provided the loaded JSON spec object directly. You could also use `specUrl`.
    *   `openapiConnectorOptions.sourceId`: This ID is used internally by `OpenAPIConnector` and is important for features like dynamic authentication overrides. It should typically match the top-level `id` of the `ToolProviderSourceConfig`.
    *   `toolsetCreationStrategy`: Determines how tools from the API are grouped. `'byTag'` is common. Since FakeStoreAPI doesn't have rich tags, AgentB might create a single toolset or group by common path prefixes.
*   **`AgentB.initialize({ toolProviders: [...] })`**: You registered your API tool provider during initialization.
*   **Tool-Related Events**: You saw new event types:
    *   `thread.message.completed` (with `metadata.tool_calls`): Shows the LLM's plan to call specific tools with arguments.
    *   `agent.tool.execution.started`: Indicates a tool is now actually running.
    *   `agent.tool.execution.completed`: Shows the outcome (success/failure and data/error) of the tool execution.
*   **Multi-Turn Tool Use**: The agent can use tools, get results, and then reason about those results to answer follow-up questions or decide on next steps.

This tutorial demonstrates how AgentB can automatically generate and use tools from an OpenAPI specification, significantly simplifying the process of connecting AI agents to your existing services.

**Next Up**: [Adding the Chat UI (`@ulifeai/agentb-ui`)](./03-adding-the-chat-ui.md) to create a web-based interface for your agent. 