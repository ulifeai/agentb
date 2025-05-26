# Tools & Tool Providers: The `ITool` & `IToolProvider` Interfaces

At the heart of AgentB's ability to perform actions and interact with external systems are **Tools**. This guide explains the fundamental interfaces: `ITool` for defining individual tools and `IToolProvider` for supplying them to agents.

## The `ITool` Interface: Defining a Capability

An `ITool` represents a single, distinct capability that an agent can use. To create a custom tool, you implement this interface.

**Core Methods of `ITool`:**

1.  **`getDefinition(): Promise<IToolDefinition> | IToolDefinition`**
    *   **Purpose**: This method is crucial. It returns an `IToolDefinition` object that describes your tool to the Large Language Model (LLM). The LLM uses this information to understand *what the tool does* and *how to call it*.
    *   **`IToolDefinition` Structure**:
        *   `name: string`: The unique, programmatic name of the tool (e.g., `searchFlights`, `getWeatherForecast`). Must be LLM-friendly (e.g., alphanumeric, underscores, hyphens, typically max 64 chars).
        *   `description: string`: A clear, natural language description of what the tool does, its purpose, and when it should be used. *This is very important for the LLM's decision-making process.*
        *   `parameters: IToolParameter[]`: An array describing the input parameters the tool expects.
            *   **`IToolParameter` Structure**:
                *   `name: string`: Name of the parameter (e.g., `destinationCity`, `date`).
                *   `type: string`: The basic data type (e.g., `string`, `number`, `boolean`, `object`, `array`).
                *   `description: string`: Natural language description of this parameter for the LLM.
                *   `required: boolean`: Whether this parameter is mandatory.
                *   `schema?: any`: (Highly Recommended) A JSON Schema object defining the structure, constraints (enums, min/max, pattern), and detailed type for this parameter. This gives the LLM precise instructions for formatting arguments.

2.  **`execute(input: Input, agentContext?: IAgentContext): Promise<IToolResult>`**
    *   **Purpose**: This method contains the actual logic that your tool performs.
    *   **`input: Input`**: An object containing the arguments for the tool. The LLM constructs this object based on your `IToolDefinition`'s `parameters`. The shape of `Input` should match the properties defined in your parameters. For example, if you define parameters `city` and `date`, `input` would be `{ city: "Paris", date: "2024-12-25" }`.
    *   **`agentContext?: IAgentContext`** (Optional): If your tool needs access to broader runtime information (like `runConfig`, `threadId`, or other services available during the agent's run), the `IAgentContext` can be passed here.
    *   **`Promise<IToolResult>`**: The method must return a Promise that resolves to an `IToolResult` object.
        *   **`IToolResult` Structure**:
            *   `success: boolean`: `true` if the tool's operation was successful, `false` otherwise.
            *   `data: any`: The data payload resulting from the tool's successful execution. This is what gets passed back to the LLM.
            *   `error?: string`: A descriptive error message if `success` is `false`.
            *   `metadata?: Record<string, any>`: Optional additional information about the tool's execution (e.g., API call duration, units of data processed).

**Example (Conceptual `ITool`):**
```typescript
import { ITool, IToolDefinition, IToolParameter, IToolResult, IAgentContext } from '@ulifeai/agentb';

class MySimpleTool implements ITool<{ query: string }, string> { // Input type, Output data type
  async getDefinition(): Promise<IToolDefinition> {
    return {
      name: "myCustomSearch",
      description: "Performs a custom search using an internal engine.",
      parameters: [
        {
          name: "query",
          type: "string",
          description: "The search term or question.",
          required: true,
          schema: { type: "string", minLength: 3 }
        }
      ]
    };
  }

  async execute(input: { query: string }, agentContext?: IAgentContext): Promise<IToolResult<string>> {
    console.log(`[MySimpleTool] Executing with query: ${input.query}`);
    // ... actual search logic here ...
    if (input.query === "magic") {
      return { success: true, data: "Found the magic keyword!" };
    }
    if (input.query === "fail") {
      return { success: false, data: null, error: "Simulated search failure." };
    }
    return { success: true, data: `Search results for "${input.query}".` };
  }
}
```
*(See the [Custom Tool Tutorial](../../TUTORIALS/05-custom-tool.md) for a runnable example).*

## The `IToolProvider` Interface: Supplying Tools

An agent doesn't directly manage a list of `ITool` instances. Instead, it receives an `IToolProvider` via its `IAgentContext`. The `IToolProvider` is responsible for making tools available.

**Core Methods of `IToolProvider`:**

1.  **`getTools(): Promise<ITool[]>`**:
    *   Returns a Promise that resolves to an array of all `ITool` instances this provider can supply.

2.  **`getTool(toolName: string): Promise<ITool | undefined>`**:
    *   Returns a Promise that resolves to a specific `ITool` instance by its name, or `undefined` if not found.

3.  **`ensureInitialized?(): Promise<void>`** (Optional):
    *   Some providers might need an asynchronous initialization step (e.g., an `OpenAPIConnector` needs to fetch and parse its spec). This method allows the system (like `ApiInteractionManager`) to ensure the provider is ready before attempting to get tools from it.

**Why `IToolProvider`?**

*   **Dynamic Tool Loading**: Providers can dynamically load or generate tools (e.g., `OpenAPIConnector` creates tools based on an API spec at runtime).
*   **Abstraction**: Agents interact with the `IToolProvider` interface, not concrete tool sources.
*   **Composition**: Providers like `AggregatedToolProvider` can combine tools from multiple other providers.
*   **Specialization**: You can have providers specialized for certain types of tools (e.g., database tools, file system tools).

**Common Implementations in AgentB:**

*   **`OpenAPIConnector`**: Implements `IToolProvider` to serve tools derived from an OpenAPI specification.
*   **`AggregatedToolProvider`**: Implements `IToolProvider` by taking an array of other `IToolProvider`s and presenting their tools as a single collection (handles de-duplication by name).
*   **Custom Providers**: You can implement `IToolProvider` to supply your custom tools, as shown in the [Custom Tool Tutorial](../../TUTORIALS/05-custom-tool.md).

By implementing `ITool` and making them available via an `IToolProvider`, you give your AgentB agents the capabilities they need to perform meaningful actions and interact with the world. The quality of your `IToolDefinition`s (especially the descriptions) directly impacts how well the LLM can understand and utilize your tools. 