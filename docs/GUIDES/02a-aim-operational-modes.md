# AIM Operational Modes

The `ApiInteractionManager` (AIM) operates in different modes, dictating how it configures the primary agent, its tools, and its system prompt. Understanding these modes is key to leveraging AIM effectively, whether you use it directly or via the `AgentB` facade (which infers the mode).

Currently, the primary supported modes are:

1.  **`genericOpenApi`**
2.  **`hierarchicalPlanner`**

(An older mode, `toolsetsRouter`, is conceptually evolving into `hierarchicalPlanner` as the latter provides a more robust and explicit way to achieve delegation.)

## 1. `genericOpenApi` Mode

**Purpose**:
To allow an agent to interact with a **single API** defined by an OpenAPI specification. The agent can either use tools generated for specific API operations or a fallback "generic HTTP request" tool.

**Configuration (`ApiInteractionManagerOptions`)**:
*   `mode: 'genericOpenApi'`
*   `genericOpenApiProviderConfig: OpenAPIConnectorOptions`:
    *   You provide the `OpenAPIConnectorOptions` which include the API spec (or URL to it), authentication details, etc.
    *   Crucially, set `sourceId` in these options (e.g., `sourceId: 'myApiV1'`).

**Agent Setup**:
*   **Primary Agent**: Typically `BaseAgent` (or your custom `agentImplementation` if provided).
*   **Tool Provider**: A single `OpenAPIConnector` instance configured with `genericOpenApiProviderConfig`.
*   **Available Tools**:
    *   If `genericOpenApiProviderConfig.tagFilter` is **not** set (or `includeGenericToolIfNoTagFilter` is true, which is default):
        *   The agent gets tools for **all operations** in the OpenAPI spec.
        *   It also gets the `GenericHttpApiTool` (named `genericHttpRequest`). This allows the LLM to make arbitrary calls to the API if it can't find a specific operation tool or prefers a more direct approach.
    *   If `genericOpenApiProviderConfig.tagFilter` **is** set:
        *   The agent only gets tools for operations matching that specific tag.
        *   The `GenericHttpApiTool` is typically *not* added in this case, as the intent is to focus on a subset of operations.
*   **System Prompt**: Generated by `generateGenericHttpToolSystemPrompt`. It instructs the LLM on how to use the available operation-specific tools and/or the `genericHttpRequest` tool, listing details of the API's operations.

**Use Cases**:
*   Building an agent that acts as a natural language interface to a single, well-defined API (e.g., "Hey agent, get my user profile from the User API").
*   When you want the LLM to have broad access to an API's capabilities, including potentially calling endpoints that don't have specific, fine-grained tools generated for them.

**Example Flow**:
1.  User: "Fetch my order history for the last month."
2.  AIM (in `genericOpenApi` mode for an e-commerce API):
    *   LLM sees tools like `getOrderHistory`, `getProductDetails`, and `genericHttpRequest`.
    *   LLM decides to call `getOrderHistory` with `{"period": "last_month"}`.
3.  `OpenAPIConnector` executes the actual API call for `getOrderHistory`.
4.  Result is returned to LLM, which then formulates a user-friendly response.

## 2. `hierarchicalPlanner` Mode

**Purpose**:
To enable a primary "planning" agent to break down complex, multi-step tasks and delegate sub-tasks to specialized "worker" agents. Each worker agent is equipped with a focused set of tools (an `IToolSet`).

**Configuration (`ApiInteractionManagerOptions`)**:
*   `mode: 'hierarchicalPlanner'`
*   `toolsetOrchestratorConfig: ToolProviderSourceConfig[]`:
    *   An array defining multiple sources of tools (e.g., different OpenAPI specs, or different tag-based groupings from a single large spec).
    *   The `ToolsetOrchestrator` uses these configs to create various `IToolSet` instances. Each `IToolSet` represents the capabilities of a potential "specialist" or "worker" agent.
*   `agentImplementation?: new () => IAgent`:
    *   If not provided or set to `BaseAgent`, AIM typically defaults to using `PlanningAgent` as the primary agent.
    *   You can explicitly provide `PlanningAgent` or your own custom planning agent class here.

**Agent Setup**:
*   **Primary Agent**:
    *   Usually `PlanningAgent`. This agent is designed to reason about a task, break it into steps, and delegate.
    *   Its system prompt is typically `DEFAULT_PLANNER_SYSTEM_PROMPT`, guiding it on this planning and delegation process.
*   **Tool Provider for Planner**: The `PlanningAgent` is primarily given **one main tool**: the `DelegateToSpecialistTool` (internally named something like `delegateToSpecialistAgent`).
*   **`DelegateToSpecialistTool`**:
    *   When the `PlanningAgent` calls this tool, it specifies:
        *   `specialistId`: The ID of the `IToolSet` (i.e., the specialist) to delegate to.
        *   `subTaskDescription`: A clear instruction for the specialist.
        *   `requiredOutputFormat` (optional): How the planner wants the result.
    *   The `DelegateToSpecialistTool` then:
        1.  Retrieves the specified `IToolSet` from the `ToolsetOrchestrator`.
        2.  Instantiates a temporary "worker" agent (e.g., `BaseAgent`).
        3.  Equips this worker agent *only* with the tools from the chosen `IToolSet`.
        4.  Runs the worker agent with the `subTaskDescription`.
        5.  Returns the worker agent's final result back to the `PlanningAgent`.
*   **Worker Agents**: These are not long-lived. They are instantiated on-demand by the `DelegateToSpecialistTool` for a single sub-task. They operate with a focused set of tools and their own isolated context.

**Use Cases**:
*   Handling complex user requests that require multiple steps or capabilities from different APIs/domains (e.g., "Book a flight to Paris for next Monday, find a hotel near the Eiffel Tower, and add both to my calendar.").
*   Organizing a large number of available tools into manageable, logical groups (specialists) so the primary planning LLM isn't overwhelmed.
*   Improving reliability and reasoning by focusing worker agents on narrower tasks.

**Example Flow**:
1.  User: "Find the latest news about AI, summarize the top 3 articles, and then draft a tweet about the most interesting one."
2.  AIM (in `hierarchicalPlanner` mode):
    *   `PlanningAgent` (Primary Agent) receives the request.
    *   **Thought**: "I need to first find news. The 'NewsSearchSpecialist' can do this."
    *   **Action**: Calls `delegateToSpecialistAgent` with `specialistId: 'NewsSearchSpecialist_ID'`, `subTaskDescription: "Find recent top news articles about AI"`.
3.  `DelegateToSpecialistTool` executes:
    *   Instantiates a worker agent with tools from `NewsSearchSpecialist_ID` (e.g., a `webSearchTool`).
    *   Worker agent runs, uses `webSearchTool`, gets news articles.
    *   Worker agent returns a list of articles.
4.  `PlanningAgent` receives the list of articles.
    *   **Thought**: "Now I need to summarize. The 'TextSummarizationSpecialist' is good for this."
    *   **Action**: Calls `delegateToSpecialistAgent` with `specialistId: 'TextSummarizationSpecialist_ID'`, `subTaskDescription: "Summarize these articles: [article data...]"`.
5.  `DelegateToSpecialistTool` executes again with the summarization specialist.
6.  `PlanningAgent` receives summaries.
    *   **Thought**: "Now draft a tweet. The 'SocialMediaDraftingSpecialist' can help."
    *   **Action**: Calls `delegateToSpecialistAgent`...
7.  Finally, the `PlanningAgent` assembles the final response for the user.

## Choosing the Right Mode

*   **Simple, single-API interaction?** `genericOpenApi` is often a good starting point.
*   **Complex tasks needing multiple steps, different types of tools, or managing many API capabilities?** `hierarchicalPlanner` is more powerful and scalable. It promotes better task decomposition and reasoning.

The `AgentB` facade attempts to choose an appropriate default mode (usually `hierarchicalPlanner` if multiple `ToolProviderSourceConfig`s are registered, or `genericOpenApi` if only one). However, for explicit control and clarity in more complex applications, instantiating `ApiInteractionManager` directly with your chosen `mode` is recommended. 