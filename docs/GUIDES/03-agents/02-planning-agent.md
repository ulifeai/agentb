# Agents Deep Dive: `PlanningAgent`

The `PlanningAgent` is a specialized agent implementation within AgentB, designed for orchestrating complex tasks that require multiple steps and potentially the use of different specialized capabilities. It typically works in conjunction with the `DelegateToSpecialistTool`.

This agent embodies a ReAct-style (Reason-Act-Observe) pattern, where it:
1.  **Reasons** about the overall goal and the current state.
2.  **Acts** by either delegating a sub-task to a specialist or formulating a direct response.
3.  **Observes** the result of its action and iterates.

## Key Features of `PlanningAgent`

*   **Extends `BaseAgent`**: It inherits the core execution loop, LLM interaction, event emission, and basic tool handling capabilities from `BaseAgent`.
*   **Specialized System Prompt**: Its primary differentiation comes from a specific system prompt (e.g., `DEFAULT_PLANNER_SYSTEM_PROMPT`) that instructs the LLM to:
    *   Break down user requests into logical sub-tasks.
    *   Identify suitable "specialist agents" (represented as `IToolSet`s) for each sub-task.
    *   Use the `DelegateToSpecialistTool` to assign these sub-tasks.
    *   Synthesize results from specialists to achieve the overall objective.
*   **Focus on Delegation**: While it *can* use other simple tools if provided, its main "action" tool is `DelegateToSpecialistTool`.
*   **Task Decomposition**: Designed to manage a higher-level plan and coordinate multiple capabilities.

## How `PlanningAgent` Works

The `PlanningAgent` follows the same fundamental lifecycle as `BaseAgent`. The key difference lies in the LLM's behavior due to the specialized system prompt and the primary tool it's expected to use.

1.  **Initialization**: Same as `BaseAgent`. When used by `ApiInteractionManager` in `hierarchicalPlanner` mode:
    *   The `IAgentContext.toolProvider` given to `PlanningAgent` will primarily offer the `DelegateToSpecialistTool`.
    *   The `IAgentContext.runConfig.systemPrompt` will be set to something like `DEFAULT_PLANNER_SYSTEM_PROMPT`.

2.  **Interaction Loop (Simplified for Planner Focus)**:
    *   **User Request**: The `PlanningAgent` receives the user's overall goal (e.g., "Plan a vacation to Paris including flights and a hotel near the Eiffel Tower, then summarize the itinerary.").
    *   **LLM (Planner) Reasons**: Guided by its system prompt, the LLM thinks:
        *   "First, I need to find flights. The 'FlightBookingSpecialist' seems appropriate."
    *   **LLM (Planner) Acts (Tool Call)**: The LLM's response will be a tool call to `delegateToSpecialistAgent` with arguments like:
        ```json
        {
          "specialistId": "FlightBookingSpecialist_ID", // ID of the IToolSet for flight booking
          "subTaskDescription": "Find round-trip flights from New York to Paris for next Monday, returning in one week, for 1 adult.",
          "requiredOutputFormat": "JSON object with flight details including airline, times, and price."
        }
        ```
    *   **`DelegateToSpecialistTool` Executes**:
        *   This tool (covered in its own guide) finds the `FlightBookingSpecialist_ID` toolset.
        *   It instantiates a temporary "worker" `BaseAgent`.
        *   This worker agent is equipped *only* with tools from the `FlightBookingSpecialist_ID` toolset (e.g., `searchFlightsTool`, `bookFlightTool`).
        *   The worker agent is run with the `subTaskDescription`. It might make its own LLM calls and use its specific tools.
        *   The worker agent completes its sub-task and returns a result (e.g., flight details).
        *   The `DelegateToSpecialistTool` returns this result to the `PlanningAgent`. (Events: `agent.tool.execution.completed` for the delegate tool, containing sub-agent result).
    *   **LLM (Planner) Observes & Reasons Again**: The `PlanningAgent`'s LLM receives the flight details.
        *   "Okay, flights found. Now I need a hotel. The 'HotelSearchSpecialist' is suitable."
    *   **LLM (Planner) Acts Again**: Calls `delegateToSpecialistAgent` for hotel search.
    *   This process repeats for finding a hotel, then potentially for summarizing.
    *   **Final Synthesis**: Once all sub-tasks are complete, the `PlanningAgent`'s LLM synthesizes all the collected information (flight details, hotel details, itinerary summary) into a final response for the user.
    *   The `PlanningAgent`'s run then completes (`thread.run.completed`).

## `DEFAULT_PLANNER_SYSTEM_PROMPT`

This constant (from `src/agents/planning-agent.ts`) provides a template for the system prompt used by `PlanningAgent`. It typically includes:
*   A description of the agent's role as a master planner.
*   Detailed instructions on how to use the `delegateToSpecialistAgent` tool (its name, required parameters like `specialistId`, `subTaskDescription`).
*   Guidance on the ReAct (Reason-Act-Observe) thought process.
*   Instructions on how to handle results from specialists and synthesize a final answer.
*   A list of available specialists (Toolsets) and their capabilities, which is dynamically injected by `ApiInteractionManager` or the `DelegateToSpecialistTool` itself when it generates its definition.

## When to Use `PlanningAgent`

*   **Complex, Multi-Step Tasks**: When a user request cannot be fulfilled by a single tool call or a simple chain of calls, and requires decomposition and delegation.
*   **Orchestrating Multiple Capabilities**: If you have various specialized sets of tools (e.g., from different APIs, or for different functional domains like travel, finance, content creation) that need to be coordinated.
*   **`hierarchicalPlanner` Mode**: This is the agent typically instantiated by `ApiInteractionManager` when operating in `hierarchicalPlanner` mode.
*   **Improving Scalability of Tool Access**: Instead of overwhelming a single LLM instance with dozens or hundreds of tools, a planner delegates to specialists that only see a small, relevant set of tools, potentially improving the LLM's accuracy in choosing and using them.

## Customization

*   **System Prompt**: The most significant customization for a `PlanningAgent` is its system prompt. You can create your own to fine-tune its planning strategy, how it selects specialists, or how it synthesizes information.
*   **Underlying `agentImplementation` for Workers**: The `DelegateToSpecialistTool` can be configured (via its dependencies) to use a specific `IAgent` implementation (defaulting to `BaseAgent`) for the worker agents it spawns.
*   **`DelegateToSpecialistTool` Behavior**: While the tool itself is fairly standard, the `IToolSet`s it delegates to (defined by your `ToolProviderSourceConfig`s) determine the actual capabilities of the specialists.

The `PlanningAgent`, in conjunction with `DelegateToSpecialistTool` and well-defined `IToolSet`s, enables a powerful hierarchical approach to building sophisticated, multi-faceted AI agents. 