# Core Concepts: Key Terminology

Understanding the following terms is essential for working effectively with the AgentB framework. These concepts represent the main building blocks of any AgentB application.

*   **Agent (`IAgent`)**:
    The central actor in the AgentB framework. An agent is an autonomous entity capable of understanding input, making decisions (often with the help of an LLM), using tools, and generating responses or actions. The default implementation is `BaseAgent`, which provides a standard execution cycle.

*   **LLM (Large Language Model)**:
    The "brain" that often powers an agent's reasoning and language understanding/generation capabilities (e.g., OpenAI's GPT series, Anthropic's Claude). Agents use an `ILLMClient` to interact with these models.

*   **Tool (`ITool`)**:
    A specific capability or function an agent can use to interact with the outside world or perform a computation. Examples include calling an API endpoint, querying a database, or performing a calculation. Each tool has a **Tool Definition (`IToolDefinition`)** that describes its name, purpose, and parameters to the LLM.

*   **Tool Provider (`IToolProvider`)**:
    A component responsible for supplying one or more tools to an agent. For example, `OpenAPIConnector` is an `IToolProvider` that generates tools from an OpenAPI specification. `AggregatedToolProvider` can combine tools from multiple other providers.

*   **Toolset (`IToolSet`)**:
    A named, logical grouping of tools, often centered around a specific domain or capability (e.g., "User Account Management Tools," "Product Catalog API Tools"). Toolsets are primarily used by the `ToolsetOrchestrator` and the `DelegateToSpecialistTool`.

*   **Agent Context (`IAgentContext`)**:
    A crucial object passed to an agent during its execution (`run` method). It bundles all necessary dependencies and configurations for that specific run, including:
    *   `llmClient`: For LLM communication.
    *   `toolProvider`: To access available tools.
    *   `messageStorage`: For reading/writing conversation history.
    *   `responseProcessor`: To parse LLM responses.
    *   `toolExecutor`: To execute chosen tools.
    *   `contextManager`: To manage conversation context length.
    *   `runConfig`: Specific settings for the current run (model, temperature, etc.).
    *   `runId`, `threadId`: Identifiers for the current execution.

*   **Agent Event (`AgentEvent`)**:
    A data object emitted by an agent during its execution, signaling a specific occurrence or state change. Examples include:
    *   `agent.run.created`: A new agent run has started.
    *   `thread.message.created`: A new message (user, assistant, tool) is created.
    *   `thread.message.delta`: A chunk of a streaming assistant message.
    *   `thread.message.completed`: An assistant message is fully generated.
    *   `agent.tool.execution.started`: A tool is about to be executed.
    *   `agent.tool.execution.completed`: A tool has finished executing.
    *   `thread.run.requires_action`: The agent needs external input (e.g., tool results if not handled internally).
    *   `thread.run.completed`: The agent has finished its task successfully.
    *   `thread.run.failed`: The agent encountered an error and could not complete.
    These events are vital for UI updates, logging, and monitoring.

*   **Agent Run (`IAgentRun`)**:
    A record representing a single, complete execution lifecycle of an agent on a thread for a specific task. It has a status (e.g., `in_progress`, `completed`, `failed`), configuration, and timestamps. Managed by `IAgentRunStorage`.

*   **Message (`IMessage`)**:
    A single unit of communication within a conversation thread. It has a `role` (user, assistant, system, tool), `content`, a unique `id`, `threadId`, and `timestamp`.

*   **Thread (`IThread`)**:
    A container for a sequence of messages, representing a single conversation or interaction flow. Threads have unique IDs and can store metadata.

*   **Storage Adapters (`IMessageStorage`, `IThreadStorage`, `IAgentRunStorage`)**:
    Interfaces defining how threads, messages, and agent run states are persisted and retrieved. AgentB provides a default `MemoryStorage` for easy startup and development. For production, you'd implement these interfaces with a persistent database (e.g., SQL, MongoDB stubs provided conceptually).

*   **`AgentB` Facade**:
    A high-level static class (`AgentB`) designed to simplify common setup and usage patterns. It provides methods like `AgentB.initialize()`, `AgentB.registerToolProvider()`, and `AgentB.getExpressStreamingHttpHandler()` for quick integration.

*   **`ApiInteractionManager`**:
    A more granular manager class used internally by the `AgentB` facade, or can be used directly for more advanced configurations. It's responsible for setting up the appropriate agent and tool environment based on the chosen `ApiInteractionMode`.

*   **API Interaction Mode (`ApiInteractionMode`)**:
    Defines the primary strategy for how the `ApiInteractionManager` (and thus `AgentB` facade) configures agents and their access to tools:
    *   **`genericOpenApi`**: The agent interacts with tools derived from a single OpenAPI specification, potentially including a generic HTTP request tool.
    *   **`toolsetsRouter`**: The main agent acts as a "router," using a special tool to delegate tasks to different, specialized `IToolSet` instances. (This mode is evolving towards `hierarchicalPlanner`).
    *   **`hierarchicalPlanner`**: The main agent is a `PlanningAgent`. It uses a `DelegateToSpecialistTool` to break down complex tasks and assign sub-tasks to "worker" agents, each equipped with a focused `IToolSet`.

These terms form the vocabulary of AgentB. As you delve deeper into the guides and API references, these concepts will become more familiar. 