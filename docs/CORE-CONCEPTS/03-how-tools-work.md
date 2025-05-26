# Core Concepts: How Tools Work in AgentB

Tools are the mechanism by which AgentB agents interact with the world beyond the LLM's knowledge, perform actions, or fetch dynamic information.

## What is a Tool? (`ITool`)

At its heart, a tool in AgentB is an implementation of the `ITool` interface. This interface requires two key methods:

1.  **`getDefinition(): Promise<IToolDefinition> | IToolDefinition`**:
    *   This method returns an `IToolDefinition` object.
    *   The **`IToolDefinition`** is crucial because it tells the Large Language Model (LLM):
        *   `name`: The unique name of the tool (e.g., `getUserDetails`, `searchProducts`). This is what the LLM will specify when it wants to use the tool.
        *   `description`: A clear, concise explanation of what the tool does. The LLM uses this to decide *when* to use the tool.
        *   `parameters`: An array of `IToolParameter` objects. Each `IToolParameter` describes an input the tool needs, including:
            *   `name`: Parameter name (e.g., `userId`, `searchQuery`).
            *   `type`: Data type (e.g., `string`, `number`, `boolean`).
            *   `description`: Explanation of the parameter for the LLM.
            *   `required`: Whether the parameter is mandatory.
            *   `schema`: (Optional but powerful) A JSON Schema fragment providing more detailed validation rules, enums, object structures, etc. for this parameter.
    *   A well-crafted tool definition is key to the LLM using your tools correctly and effectively.

2.  **`execute(input: Input, agentContext?: IAgentContext): Promise<IToolResult>`**:
    *   This is where the actual logic of your tool resides.
    *   `input`: An object containing the arguments for the tool, as determined and provided by the LLM based on your tool's `parameters` definition. For example, if your tool definition has a parameter named `productId`, the `input` object might look like `{ productId: 123 }`.
    *   `agentContext` (optional): Provides access to the broader agent execution context if your tool needs it (e.g., to access `runConfig` or other shared services).
    *   It must return a Promise that resolves to an `IToolResult` object:
        *   `success: boolean`: `true` if the tool executed successfully, `false` otherwise.
        *   `data: any`: The output or result of the tool if successful. This data is sent back to the LLM.
        *   `error?: string`: An error message if `success` is `false`.
        *   `metadata?: Record<string, any>`: Optional additional information about the execution.

## How an Agent Uses Tools

1.  **Tool Availability**: When an agent runs, it's provided with a `ToolProvider` via its `IAgentContext`. This provider makes a set of tools available.
2.  **LLM Prompting**: The agent (e.g., `BaseAgent`) takes the definitions of these available tools and formats them into a special section of the prompt sent to the LLM. This tells the LLM, "Here are the functions you can call."
3.  **LLM Decision**: Based on the user's query and the descriptions of the available tools, the LLM decides if using a tool is appropriate. If so, it will:
    *   Choose which tool to call by its `name`.
    *   Generate the necessary `arguments` for that tool as a JSON string, based on the tool's parameter definitions.
4.  **Tool Call Request**: The LLM's response will indicate a "tool call" request, specifying the tool name and the JSON string of arguments. (Events: `thread.run.step.tool_call.created`, `thread.message.delta` with `toolCallsChunk`).
5.  **Tool Execution**:
    *   The `BaseAgent` receives this tool call request.
    *   It uses the `ToolExecutor` (from the `IAgentContext`) to handle the execution.
    *   The `ToolExecutor` finds the actual `ITool` instance using the `ToolProvider`.
    *   The tool's `execute()` method is called with the parsed arguments. (Events: `agent.tool.execution.started`).
6.  **Tool Result**: The `IToolResult` from the tool's execution is captured. (Event: `agent.tool.execution.completed`).
7.  **Feedback to LLM**: The `IToolResult` (specifically, the `data` if successful, or a summary of the `error`) is formatted as a special "tool" message and sent back to the LLM in the next turn. This allows the LLM to process the tool's output and continue the conversation or task.

## Types of Tool Providers (`IToolProvider`)

An `IToolProvider` is simply an interface for any component that can supply a list of `ITool` instances. AgentB includes:

*   **`OpenAPIConnector`**:
    *   Automatically generates `ITool` instances from an OpenAPI (v3) specification.
    *   Each API operation (e.g., `GET /users/{id}`) can become a distinct tool.
    *   Can also provide a `GenericHttpApiTool` to make arbitrary calls to the API if specific operation tools aren't used.
*   **`AggregatedToolProvider`**:
    *   Combines tools from multiple other `IToolProvider` instances, presenting them as a single unified set.
*   **Custom Providers**: You can easily create your own by implementing the `IToolProvider` interface, as shown in the [Custom Tool Tutorial](./TUTORIALS/05-custom-tool.md).

## Toolsets (`IToolSet`) and Orchestration

*   **`IToolSet`**: A named group of tools, often with a shared purpose or relating to a specific API resource tag.
*   **`ToolsetOrchestrator`**: Manages the creation of `IToolSet`s from various sources (like multiple OpenAPI specs or different tags within one spec). It's key for more advanced agent architectures like planners or routers, where agents might need to select from or delegate to specific sets of capabilities.
    *   The orchestrator can even use an LLM to try and logically split very large toolsets into smaller, more manageable groups.

## Specialized Tools

AgentB also includes powerful "meta-tools" that enable advanced agent behaviors:

*   **`GenericHttpApiTool`**: Allows an agent to make arbitrary HTTP requests to an API, useful when the LLM needs to interact with an endpoint not explicitly defined as a fine-grained tool. Often used with the `genericOpenApi` mode.
*   **`DelegateToSpecialistTool`**: Used by `PlanningAgent`s. This tool allows a planner agent to delegate a sub-task to another "specialist" or "worker" agent. The worker agent is temporarily instantiated with its own focused set of tools (an `IToolSet`) to complete the sub-task.

By understanding these mechanics, you can effectively design, implement, and integrate tools to give your AgentB agents a wide range of powerful capabilities. 