# API Reference: `@ulifeai/agentb` (Core Framework)

This section provides detailed API documentation for the core `@ulifeai/agentb` package.

## Main Exports

The `@ulifeai/agentb` package exports a range of classes, interfaces, types, and utility functions. Key categories include:

*   **Facades**:
    *   [`AgentB`](./01a-agentb-facade.md): High-level facade for easy setup and common interactions.
*   **Managers**:
    *   [`ApiInteractionManager`](./01b-api-interaction-manager.md): Core orchestrator for agent interactions and modes.
    *   `ToolsetOrchestrator`: Manages creation and access to `IToolSet`s.
*   **Agent Core**:
    *   [`IAgent`, `BaseAgent`, `PlanningAgent`](./01c-key-interfaces.md#iagent-baseagent-planningagent): Agent interfaces and implementations.
    *   `IAgentContext`, `AgentRunConfig`: Context and configuration for agent runs.
    *   [`AgentEvent` types](./01d-agent-events.md): Detailed event structures.
*   **Tools**:
    *   [`ITool`, `IToolDefinition`, `IToolParameter`, `IToolResult`, `IToolProvider`, `IToolSet`](./01c-key-interfaces.md#itool-itooldefinition-itoolparameter-itoolresult-itoolprovider-itoolset): Core tool interfaces.
    *   `OpenAPIConnector`: Tool provider for OpenAPI specs.
    *   `GenericHttpApiTool`, `DelegateToSpecialistTool`: Specialized tools.
*   **LLM Integration**:
    *   [`ILLMClient`, `OpenAIAdapter`](./01c-key-interfaces.md#illmclient-openaiadapter): LLM client interface and OpenAI implementation.
    *   `LLMMessage`, `LLMMessageChunk`, `LLMToolCall`: Types for LLM communication.
*   **Threads & Messages**:
    *   [`IThread`, `IMessage`](./01c-key-interfaces.md#ithread-imessage): Core conversation structures.
    *   `IThreadStorage`, `IMessageStorage`, `IAgentRunStorage`: Storage interfaces.
    *   `MemoryStorage`: Default in-memory storage.
*   **Errors**:
    *   Custom error classes like `ApplicationError`, `LLMError`, `ToolNotFoundError`, etc.
*   **Utilities**:
    *   Prompt builders, `sanitizeIdForLLM`, etc.

Navigate to the specific sub-pages for detailed API information on each component. 