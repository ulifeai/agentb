# Tools & Tool Providers: `OpenAPIConnector`

The `OpenAPIConnector` is a powerful `IToolProvider` in AgentB that automatically generates callable `ITool` instances from an OpenAPI (v3.x, with some Swagger 2.0 compatibility) specification. This makes it incredibly easy to connect your agents to existing REST APIs.

## Key Features

*   **Automatic Tool Generation**: Parses an OpenAPI spec and creates an `ITool` for each discoverable operation (e.g., `GET /users/{id}` becomes a `getUserById` tool).
*   **Parameter Handling**: Tool definitions automatically include parameters derived from the OpenAPI operation's path, query, header, and request body definitions. JSON Schemas for these parameters are used to guide the LLM.
*   **Authentication**: Supports common authentication schemes like Bearer tokens and API keys, configurable statically or dynamically per request (via `requestAuthOverrides` in `AgentRunConfig`).
*   **Tag Filtering**: Can be configured to expose only tools related to specific API tags, allowing for more focused toolsets.
*   **Generic HTTP Tool**: Optionally includes a `GenericHttpApiTool` (named `genericHttpRequest`) that allows the LLM to make arbitrary calls to the API if a specific operation tool isn't suitable or available.
*   **Spec Loading**: Can load OpenAPI specs from a URL or a pre-loaded JSON/YAML object.

## How it Works

1.  **Initialization**:
    *   You create an `OpenAPIConnector` instance with `OpenAPIConnectorOptions`.
    *   These options include the `spec` object or `specUrl`, `authentication` details, an `sourceId`, and an optional `tagFilter`.
    *   During `ensureInitialized()`, the connector fetches (if `specUrl`) and parses the OpenAPI spec using `OpenAPISpecParser`.

2.  **Tool Creation**:
    *   The `OpenAPISpecParser` extracts all valid operations (those with an `operationId`).
    *   If a `tagFilter` is active, only operations matching the tag are considered.
    *   For each selected operation, an `OpenAPIOperationTool` instance is created.
        *   The `OpenAPIOperationTool`'s `getDefinition()` method constructs an `IToolDefinition` using the operation's `operationId` (sanitized) as the tool name, its `summary`/`description`, and its parameters (path, query, header, requestBody).
    *   If configured (no `tagFilter` and `includeGenericToolIfNoTagFilter` is true), a `GenericHttpApiTool` is also added.

3.  **Tool Execution**:
    *   When an agent's LLM decides to call a tool provided by the `OpenAPIConnector` (e.g., `getUserById`):
        *   The `ToolExecutor` calls the `execute()` method of the corresponding `OpenAPIOperationTool`.
        *   The `OpenAPIOperationTool` then delegates to `OpenAPIConnector.executeSpecificOperationInternal()`.
        *   This internal method:
            1.  Constructs the full request URL using the connector's base URL and the operation's path template, substituting path parameters from the LLM's input.
            2.  Assembles query parameters.
            3.  Prepares request headers, including handling `Content-Type` and `Accept`.
            4.  Serializes the `requestBody` (usually as JSON).
            5.  Applies authentication (static or dynamic override from `agentContext.runConfig.requestAuthOverrides` matched by `sourceId`).
            6.  Makes the HTTP request using `fetch`.
            7.  Parses the response and returns an `IToolResult`.
    *   If `genericHttpRequest` is called, `OpenAPIConnector.executeGenericOperationInternal()` is used, which takes more explicit HTTP details (method, path, queryParams, headers, body) from the LLM.

## `OpenAPIConnectorOptions`

When creating an `OpenAPIConnector`, you use these options:

```typescript
interface OpenAPIConnectorOptions extends BaseOpenAPIConnectorOptions {
  sourceId: string; // Unique ID for this connector instance, matches ToolProviderSourceConfig.id
  tagFilter?: string; // Optional: Filter tools by this API tag
  includeGenericToolIfNoTagFilter?: boolean; // Default: true
}

interface BaseOpenAPIConnectorOptions {
  specUrl?: string; // URL to OpenAPI spec (JSON/YAML)
  spec?: OpenAPISpec; // Or, pre-loaded spec object
  authentication?: ConnectorAuthentication; // See Authentication guide
  businessContextText?: string; // For LLM prompts
}
```

*   **`sourceId: string` (Crucial)**: A unique identifier for this specific connector instance. This ID is used by `ApiInteractionManager` and `AgentB` facade to match dynamic `requestAuthOverrides` from the `AgentRunConfig` to this provider. It should match the `id` field of the `ToolProviderSourceConfig` if you're using the facade or `ToolsetOrchestrator`.
*   `specUrl` / `spec`: How to load the OpenAPI definition.
*   `authentication`: Static authentication configuration (Bearer, API Key, None). See the [Authentication Guide](../06-authentication/01-tool-authentication.md).
*   `tagFilter`: If you only want to expose a subset of your API based on a tag (e.g., "User Management" tools only).
*   `includeGenericToolIfNoTagFilter`: If `true` (default) and no `tagFilter` is set, the powerful `genericHttpRequest` tool is added. Set to `false` to only include tools generated from specific operations.
*   `businessContextText`: Added to system prompts when tools from this connector are presented to the LLM.

## Example Usage (Directly)

While often used via `AgentB` facade or `ApiInteractionManager`, here's how you might use it directly:

```typescript
import { OpenAPIConnector, OpenAPIConnectorOptions } from '@ulifeai/agentb';
// Assume 'myApiSpec' is a loaded OpenAPI spec object
// Assume 'myApiSpec' operations have 'operationId's

const connectorOptions: OpenAPIConnectorOptions = {
  sourceId: 'myApiServiceV1',
  spec: myApiSpec,
  authentication: { type: 'bearer', token: 'static_fallback_token' }
};

const apiToolsProvider = new OpenAPIConnector(connectorOptions);

async function main() {
  await apiToolsProvider.ensureInitialized();

  const tools = await apiToolsProvider.getTools();
  console.log(`Available tools from ${connectorOptions.sourceId}:`);
  for (const tool of tools) {
    const def = await tool.getDefinition();
    console.log(`- ${def.name}: ${def.description}`);
  }

  // Example: Get a specific tool
  const userTool = await apiToolsProvider.getTool('getUserById'); // Assuming operationId 'getUserById' exists
  if (userTool) {
    // In a real agent, the LLM would provide 'input'.
    // The 'agentContext' would come from the agent's run.
    // For dynamic auth, agentContext.runConfig.requestAuthOverrides would be checked.
    const result = await userTool.execute(
      { id: 123 }, // Example input if getUserById takes an 'id'
      // Mock agentContext for dynamic auth example:
      // { runConfig: { requestAuthOverrides: { 'myApiServiceV1': { type: 'bearer', token: 'dynamic_user_token'} } } } as any
    );
    console.log("Tool execution result:", result);
  }
}

main();
```

## System Prompts

When tools from an `OpenAPIConnector` are made available to an LLM (usually via `ApiInteractionManager` in `genericOpenApi` mode), a system prompt is generated using `generateGenericHttpToolSystemPrompt`. This prompt lists the available operations (tool names, descriptions, parameters) and instructs the LLM on how to use them, or how to use the `genericHttpRequest` tool if it's included.

## Best Practices

*   **Ensure `operationId`s**: Your OpenAPI operations *must* have unique `operationId`s for `OpenAPIConnector` to generate specific tools for them.
*   **Clear `summary` and `description`**: The `summary` and `description` fields for operations and parameters in your OpenAPI spec are directly used to generate tool descriptions for the LLM. Make them clear and informative.
*   **Define Parameter Schemas**: Use JSON Schema within your OpenAPI parameter and request body definitions to specify types, formats, enums, and requirements. This greatly helps the LLM construct valid arguments for your tools.
*   **Use `sourceId` for Auth**: When using dynamic authentication (`requestAuthOverrides`), ensure the `sourceId` in `OpenAPIConnectorOptions` matches the key you use in the overrides object.
*   **Consider `tagFilter`**: For large APIs, using `tagFilter` can create smaller, more manageable sets of tools, which can improve LLM performance and reduce token usage.
*   **`GenericHttpApiTool`**: Use with caution. While powerful, it gives the LLM broad ability to call any path. It's often best used when you trust the LLM's ability to interpret API documentation (provided in the prompt) or when specific operation tools are too numerous.

The `OpenAPIConnector` is a cornerstone of AgentB's tool integration capabilities, bridging the gap between natural language instructions and structured API interactions. 