# Tutorial 5: Creating a Custom Tool

While AgentB excels at integrating with APIs via OpenAPI, you'll often want to give your agents custom capabilities – perhaps to interact with a database, a local file system, or a proprietary internal service that doesn't have an OpenAPI spec.

**Goal**: Create a simple custom tool that an agent can use, register it with AgentB, and see it in action. We'll make a tool that "calculates" the square of a number.

## Prerequisites

*   Completed [Tutorial 1: Your First Agent](./01-your-first-agent-basic-chat.md).
*   Your `OPENAI_API_KEY` is set.

## Step 1: Define Your Custom Tool (`ITool` interface)

A custom tool in AgentB needs to implement the `ITool` interface. This involves two main methods:
*   `getDefinition()`: Returns an `IToolDefinition` object describing the tool's name, purpose, and parameters for the LLM.
*   `execute()`: Contains the actual logic of the tool.

Create a new file, e.g., `customToolAgent.ts`.

```typescript title="customToolAgent.ts"
import * as dotenv from 'dotenv';
dotenv.config();

import {
  AgentB,
  LLMMessage,
  ITool,
  IToolDefinition,
  IToolParameter,
  IToolResult,
  IToolProvider, // We'll need this to provide our custom tool
  ToolProviderSourceConfig // For registering via AgentB facade (conceptual for custom)
} from '@ulifeai/agentb';
import readline from 'readline/promises';

// 1. Define the Custom Tool
class SquareCalculatorTool implements ITool {
  async getDefinition(): Promise<IToolDefinition> {
    return {
      name: "calculateSquare", // Name the LLM will use
      description: "Calculates the square of a given number.",
      parameters: [
        {
          name: "number",
          type: "number", // The type of the input parameter
          description: "The number to be squared.",
          required: true,
          schema: { type: "number" } // JSON schema for the parameter
        }
      ]
    };
  }

  // The 'input' will be an object matching the 'parameters' in the definition.
  // For this tool, it will be: { number: 123 }
  async execute(input: { number: number }): Promise<IToolResult> {
    if (typeof input.number !== 'number') {
      return {
        success: false,
        data: null,
        error: "Invalid input: 'number' must be a number."
      };
    }

    const result = input.number * input.number;
    console.log(`[SquareCalculatorTool] Calculated ${input.number}^2 = ${result}`);

    return {
      success: true,
      data: `The square of ${input.number} is ${result}.`, // Data returned to the LLM
    };
  }
}
```

## Step 2: Create a Custom Tool Provider

To make this custom tool available to an agent, it needs to be provided by an `IToolProvider`.

```typescript title="customToolAgent.ts (continued)"
// 2. Create a Custom Tool Provider
class MyCustomToolProvider implements IToolProvider {
  private tools: ITool[];

  constructor(customTools: ITool[]) {
    this.tools = customTools;
  }

  async getTools(): Promise<ITool[]> {
    return this.tools;
  }

  async getTool(toolName: string): Promise<ITool | undefined> {
    for (const tool of this.tools) {
      const definition = await tool.getDefinition();
      if (definition.name === toolName) {
        return tool;
      }
    }
    return undefined;
  }

  // ensureInitialized is optional for simple providers
  async ensureInitialized(): Promise<void> {
    console.log("[MyCustomToolProvider] Initialized.");
  }
}
```

## Step 3: Registering the Custom Tool Provider with AgentB

The `AgentB` facade's `registerToolProvider` method is primarily designed for `ToolProviderSourceConfig` which describes how to *create* a provider (usually an `OpenAPIConnector`). It doesn't have a direct method to register an *instance* of a custom `IToolProvider`.

**Option A: Using `ApiInteractionManager` directly (More Flexible for Custom Providers)**
For full control and easier registration of custom provider *instances*, you'd typically use the `ApiInteractionManager` directly instead of the `AgentB` facade. This is covered in the "In-Depth Guides".

**Option B: Conceptual Registration with Facade (for this tutorial's simplicity)**
To keep this tutorial focused on the facade, we'll illustrate conceptually. In a real scenario with the current facade, you might:
a. Extend `AgentB.initialize` or `AgentB` itself to accept custom provider instances.
b. Use a "dummy" `ToolProviderSourceConfig` if the facade strictly requires it, and then have a mechanism to replace/augment the provider created by the internal `ToolsetOrchestrator`. This is complex.

**For this tutorial, let's assume `AgentB.initialize` or a similar mechanism could take pre-instantiated providers or a more flexible configuration.** We will proceed as if our custom tool provider is part of the `toolProviders` array, understanding this might require a slight adaptation of the real `AgentB.initialize` or direct use of `ApiInteractionManager`.

*The key takeaway is how to define and use the `ITool` and `IToolProvider` interfaces.*

Let's refine the `AgentB.initialize` part to reflect how you *might* integrate this if `AgentB` were extended or if you used `ApiInteractionManager`.

```typescript title="customToolAgent.ts (continued)"
async function runCustomToolAgent() {
  const squareTool = new SquareCalculatorTool();
  const customProviderInstance = new MyCustomToolProvider([squareTool]);

  // This is the conceptual part. AgentB.initialize might need enhancement
  // to directly accept IToolProvider instances, or you'd use ApiInteractionManager.
  // For now, we'll pass a config that describes our custom setup,
  // assuming AgentB or its underlying AIM can be configured this way.

  // We cannot directly pass `customProviderInstance` to `toolProviders` in the current `AgentB.initialize`
  // as it expects `ToolProviderSourceConfig`.
  // So, we'll demonstrate initialization WITHOUT this custom tool registered via the facade's
  // current `toolProviders` mechanism, and then discuss how it WOULD integrate if the facade was more flexible
  // or if using ApiInteractionManager.

  // Initialize AgentB (without our custom tool registered via current facade options)
  AgentB.initialize({
    llmProvider: {
      provider: 'openai',
      model: 'gpt-4o-mini',
    },
    // toolProviders: [ /* How to add customProviderInstance here via facade is the challenge */ ]
  });
  console.log("🤖 AgentB Initialized.");

  // To actually use the custom tool, the agent's IAgentContext needs to receive
  // an IToolProvider that includes our SquareCalculatorTool.
  // The AgentB facade automatically sets up an ApiInteractionManager. We'd need to
  // configure *that* ApiInteractionManager to use our customProviderInstance.

  // --- This part shows direct use of ApiInteractionManager for clarity ---
  // This is what would happen "under the hood" or if you bypassed the facade for this part.
  const { ApiInteractionManager, MemoryStorage, OpenAIAdapter, BaseAgent } = require('@ulifeai/agentb'); // Full imports for direct use

  const llmClient = new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY, defaultModel: 'gpt-4o-mini' });
  const sharedStorage = new MemoryStorage();

  // Create an AIM instance configured to use *only* our custom tool provider.
  // Note: `mode` here is tricky. If we want an agent to *only* see this tool,
  // it's simpler. If mixing with OpenAPI tools, 'toolsetsRouter' or 'hierarchicalPlanner'
  // would be used, and our custom provider would be one of the `ToolProviderSourceConfig`s
  // (requiring ToolsetOrchestrator to handle custom provider types).
  // For a single custom provider, 'genericOpenApi' mode could be adapted if
  // `genericOpenApiProviderConfig` could accept an IToolProvider instance.

  // Simplest conceptual way: Assume an AIM mode that directly takes a provider.
  // For now, let's mock the setup so the agent receives our provider.
  // This means we are *not* purely using the AgentB facade's `runHttpInteractionStream`
  // for this part of the demo, but rather a more direct agent invocation.

  console.log("\n✨ Simulating direct agent setup with custom tool provider for clarity...");
  const agentToRun = new BaseAgent(); // Or your custom agent
  const tempRunConfig = { ...AgentB.globalDefaultAgentRunConfig }; // Accessing default config from AgentB
  const { ToolExecutor: AgentToolExecutor, LLMResponseProcessor: AgentResponseProcessor, ContextManager: AgentContextManager } = require('@ulifeai/agentb');

  const toolExecutor = new AgentToolExecutor(customProviderInstance, tempRunConfig.toolExecutorConfig);
  const responseProcessor = new AgentResponseProcessor(tempRunConfig.responseProcessorConfig);
  const contextManager = new AgentContextManager(sharedStorage, llmClient, tempRunConfig.contextManagerConfig);


  // --- End direct AIM setup simulation ---


  // Chat loop (similar to Tutorial 1)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const threadId = `custom-tool-thread-${Date.now()}`;
  console.log(`\nStarting custom tool agent chat on thread: ${threadId}`);
  console.log("Ask to 'calculate the square of 5'. Type 'exit' to end.\n");

  while (true) {
    const userInput = await rl.question("You: ");
    if (userInput.toLowerCase() === 'exit') break;
    if (!userInput.trim()) continue;

    const userMessage: LLMMessage = { role: 'user', content: userInput };
    process.stdout.write("Agent: ");

    try {
      // To use the custom tool, the AgentContext given to the agent's .run() method
      // *must* have our `customProviderInstance`.
      // `AgentB.runHttpInteractionStream` internally creates an AgentContext.
      // If our custom tool isn't registered via `AgentB.registerToolProvider` in a way
      // that the internal AIM picks it up, the LLM won't know about it.

      // Let's use the direct agent setup for this interaction to ensure the tool is available.
      const agentContext: any = { // Using `any` for IAgentContext for brevity in this example
        runId: `run-${Date.now()}`,
        threadId: threadId,
        llmClient: llmClient,
        toolProvider: customProviderInstance, // ⭐ Key: Agent sees our custom tools
        messageStorage: sharedStorage,
        responseProcessor: responseProcessor,
        toolExecutor: toolExecutor,
        contextManager: contextManager,
        runConfig: tempRunConfig,
      };

      const agentEventStream = agentToRun.run(agentContext, [userMessage]);

      for await (const event of agentEventStream) {
        if (event.type === 'thread.message.delta' && event.data.delta.contentChunk) {
          process.stdout.write(event.data.delta.contentChunk);
        } else if (event.type === 'thread.message.completed') {
          if (event.data.message.role === 'assistant') {
            if(!event.data.message.tool_calls) process.stdout.write("\n");
            if (event.data.message.metadata?.tool_calls) {
              const toolCalls = event.data.message.metadata.tool_calls;
              toolCalls.forEach(tc => {
                console.log(`\n[LLM Intends to Call Tool: ${tc.function.name} with args: ${tc.function.arguments}]`);
              });
            }
          }
        } else if (event.type === 'agent.tool.execution.started') {
          console.log(`\n[Tool Executing: ${event.data.toolName} with input ${JSON.stringify(event.data.input)}]`);
        } else if (event.type === 'agent.tool.execution.completed') {
          console.log(`[Tool Result (${event.data.toolName}) -> Success: ${event.data.result.success}, Data: ${JSON.stringify(event.data.result.data || event.data.result.error)}]`);
          process.stdout.write("Agent (processing tool result): ");
        } else if (event.type === 'thread.run.failed') {
          process.stdout.write("\n");
          console.error("😔 Agent run failed:", event.data.error.message);
          break;
        }
      }
    } catch (error) {
      console.error("\n😞 Error during agent interaction:", error);
    }
    process.stdout.write("\n");
  }

  console.log("\n👋 Custom Tool Agent chat ended. Goodbye!");
  rl.close();
}

runCustomToolAgent().catch(console.error);
```

## Step 4: Run and Interact

1.  **Save** `customToolAgent.ts`.
2.  **Compile**: `npx tsc customToolAgent.ts`
3.  **Run**: `node customToolAgent.js` (or `npx ts-node customToolAgent.ts`)

**Example Interaction:**

```text
🤖 AgentB Initialized.
✨ Simulating direct agent setup with custom tool provider for clarity...
[MyCustomToolProvider] Initialized.

Starting custom tool agent chat on thread: custom-tool-thread-xxxxxxxxxxx
Ask to 'calculate the square of 5'. Type 'exit' to end.

You: calculate the square of 7
Agent:
[LLM Intends to Call Tool: calculateSquare with args: {"number":7}]
[Tool Executing: calculateSquare with input {"number":7}]
[SquareCalculatorTool] Calculated 7^2 = 49
[Tool Result (calculateSquare) -> Success: true, Data: "The square of 7 is 49."]
Agent (processing tool result): The square of 7 is 49.

You: What about the square of 12?
Agent:
[LLM Intends to Call Tool: calculateSquare with args: {"number":12}]
[Tool Executing: calculateSquare with input {"number":12}]
[SquareCalculatorTool] Calculated 12^2 = 144
[Tool Result (calculateSquare) -> Success: true, Data: "The square of 12 is 144."]
Agent (processing tool result): The square of 12 is 144.

You: exit

👋 Custom Tool Agent chat ended. Goodbye!
```

## Key Takeaways

*   **`ITool` Interface**:
    *   `getDefinition()`: You described your tool (name, description, parameters, parameter schema) so the LLM knows how and when to use it. The `name` here (`calculateSquare`) is what the LLM will try to call.
    *   `execute()`: You implemented the tool's logic. The `input` object's structure is determined by the LLM based on your `parameters` definition. The `IToolResult` tells the agent system if the tool succeeded and what data to pass back to the LLM.
*   **`IToolProvider` Interface**:
    *   You created `MyCustomToolProvider` to make your `SquareCalculatorTool` (and potentially others) available.
*   **Agent Context is Key**: For an agent to use a tool, its `IAgentContext` must contain an `IToolProvider` that can supply that tool. In this tutorial, we simulated a more direct agent setup to ensure our `customProviderInstance` was used.
*   **LLM Invokes the Tool**: The LLM, guided by the tool definition, decided to call `calculateSquare` and correctly formulated the arguments (`{"number":7}`).

**Integrating Custom Tool Providers with the `AgentB` Facade More Seamlessly:**

The `AgentB` facade currently focuses on `ToolProviderSourceConfig` which is geared towards OpenAPI. To make custom `IToolProvider` instances first-class citizens with the facade:
1.  `AgentB.initialize` or a new method like `AgentB.registerCustomProvider(id: string, provider: IToolProvider)` could be added.
2.  The internal `ApiInteractionManager` and `ToolsetOrchestrator` would need to be aware of these "custom instance" providers and integrate them into the available toolsets or directly into the agent's context.

For now, if you have many custom tools, using `ApiInteractionManager` directly gives you more immediate flexibility in constructing the `IAgentContext` with your custom tool providers.

This tutorial shows the fundamental pattern for custom tool creation, which is a powerful way to extend your agent's abilities beyond pre-defined API interactions. 