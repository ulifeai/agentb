
# AgentB 🚀

**AgentB** is a flexible and extensible TypeScript framework designed for building sophisticated AI agents capable of interacting with Large LanguageModels (LLMs) and utilizing external tools. It provides a robust, modular architecture to create, manage, and orchestrate autonomous agents for complex task automation.

[![npm version](https://badge.fury.io/js/@ulifeai%2Fagentb.svg)](https://badge.fury.io/js/@ulifeai%2Fagentb)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ulifeai/agentb.svg?style=social&label=Star)](https://github.com/ulifeai/agentb)

## ✨ Features

*   **Modular Design**: Core abstractions for LLMs, tools, threads, messages, and agents, promoting separation of concerns.
*   **Extensible Tool System**:
    *   Easily define custom tools (`ITool`).
    *   Built-in `OpenAPIConnector` to automatically generate tools from OpenAPI specifications.
    *   Support for generic HTTP tools for direct API calls.
*   **LLM Agnostic**: Designed with an `ILLMClient` interface to allow integration with various LLM providers. Comes with a ready-to-use `OpenAIAdapter`.
*   **Hierarchical Agent Architecture**: Supports advanced agent patterns like a `PlanningAgent` delegating tasks to specialized "worker" agents using the `DelegateToSpecialistTool`.
*   **Stateful Conversations**: Manage conversation threads and messages with persistent storage options (default in-memory, extendable to databases).
*   **Context Management**: Built-in `ContextManager` to handle LLM context window limits through summarization and truncation.
*   **Streaming Support**: Agents can stream responses and events, enabling real-time UI updates.
*   **Simplified Facade (`AgentB`)**: An easy-to-use entry point (`AgentB.initialize()`, `AgentB.registerToolProvider()`, `AgentB.getStreamingHttpHandler()`) for quick integration into your applications.
*   **Configuration Driven**: Flexible configuration for agents, LLM parameters, tool execution, and response processing.
*   **TypeScript First**: Written entirely in TypeScript for strong typing and better developer experience.

## 📦 Installation

```bash
npm install agentb
# or
yarn add agentb
```

## 🚀 Quick Start

This example demonstrates setting up a simple agent that can use tools from an OpenAPI specification (e.g., the PetStore API) and stream responses via an Express.js server.

```typescript
// server.ts
import express from 'express';
import { AgentB, ToolProviderSourceConfig } from 'agentb'; // Assuming 'agentb' is your published package name
import * as dotenv from 'dotenv';
// import { OpenAPISpec } from 'agentb/dist/openapi/types'; // For type if loading spec manually
// import * as fs from 'fs/promises';
// import * as path from 'path';

dotenv.config();

const app = express();
app.use(express.json());

async function startApp() {
    if (!process.env.OPENAI_API_KEY) {
        console.error("CRITICAL: OPENAI_API_KEY is not set!");
        process.exit(1);
    }

    // 1. Initialize AgentB
    AgentB.initialize({
        llmProvider: {
            provider: 'openai',
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4o-mini', // Your preferred default model
        },
        // Optionally provide custom storage adapters here
        // messageStorage: new MyCustomMessageStorage(),
        // agentRunStorage: new MyCustomAgentRunStorage(),
        // threadStorage: new MyCustomThreadStorage(),
    });
    console.log("AgentB Initialized.");

    // 2. Register Tool Providers (e.g., OpenAPI specs)
    // Example using a public PetStore spec URL
    const petStoreApiConfig: ToolProviderSourceConfig = {
        id: 'petStoreAPI', // Unique ID for this tool source
        type: 'openapi',
        openapiConnectorOptions: {
            specUrl: 'https://petstore3.swagger.io/api/v3/openapi.json',
            // For local specs:
            // spec: await loadLocalSpec('./specs/petstore.openapi.json'), // Implement loadLocalSpec
            authentication: { type: 'none' }, // PetStore example needs no auth
        },
        toolsetCreationStrategy: 'byTag', // Create a toolset for each API tag
    };
    AgentB.registerToolProvider(petStoreApiConfig);
    console.log(`Tool Provider "${petStoreApiConfig.id}" Registered.`);

    // 3. Create the HTTP streaming endpoint
    app.post('/agent/stream', AgentB.getStreamingHttpHandler({
        // Customize how threadId and user messages are extracted from the request
        getThreadId: async (req, threadStorage) => {
            const requestedThreadId = req.body.threadId || req.query.threadId;
            if (requestedThreadId && typeof requestedThreadId === 'string') {
                if (await threadStorage.getThread(requestedThreadId)) return requestedThreadId;
            }
            const newThread = await threadStorage.createThread({ title: "New Chat" });
            return newThread.id;
        },
        getUserMessage: async (req) => {
            if (!req.body.prompt || typeof req.body.prompt !== 'string') {
                throw new Error("Request body must contain a 'prompt' string.");
            }
            return { role: 'user', content: req.body.prompt };
        },
        // Optional: Add your authorization logic
        // authorizeRequest: async (req, threadId) => { return true; },
    }));

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`AgentB server listening on port ${PORT}`);
        console.log(`Try: POST http://localhost:${PORT}/agent/stream with JSON body: {"prompt": "Your question", "threadId": "optional_thread_id"}`);
        console.log(`Example: curl -X POST -H "Content-Type: application/json" -d '{"prompt":"Find pet with ID 1"}' http://localhost:${PORT}/agent/stream --no-buffer`);
    });
}

startApp().catch(console.error);
```

**For the UI component suggestion (`<AgentBridgeChatUI />`):**
That's a great idea for a complementary package! AgentB provides the backend framework. A separate UI component library could consume the SSE stream from the `/agent/stream` endpoint to render a chat interface.

## 📚 Core Concepts

*   **`AgentB` Facade**: Simplifies initialization and HTTP handler creation.
*   **`ApiInteractionManager`**: Manages different agent interaction modes (`genericOpenApi`, `toolsetsRouter`, `hierarchicalPlanner`).
*   **`IAgent` & `BaseAgent`**: Define and implement the core agent execution loop, handling LLM calls, tool execution, and event streaming.
*   **`ITool`, `IToolProvider`, `IToolSet`**: Abstractions for defining, providing, and organizing tools.
*   **`OpenAPIConnector`**: Automatically creates tools from OpenAPI specifications.
*   **`ILLMClient` & `OpenAIAdapter`**: Abstract LLM interactions, with a default OpenAI implementation.
*   **`I[Message/Thread/AgentRun]Storage` & `MemoryStorage`**: Abstract and provide default in-memory storage for conversation state.
*   **`ToolsetOrchestrator`**: Manages creating logical groups of tools (`IToolSet`) from providers.
*   **`DelegateToSpecialistTool` & `PlanningAgent`**: Enable hierarchical agent architectures where a planner delegates to specialized agents.

## 📖 Documentation (Coming Soon)

Detailed API documentation and further examples will be available soon. In the meantime, the source code is heavily commented with JSDoc.

Key modules to explore:
*   `src/facade/agent-b.ts`: For the simplest entry point.
*   `src/managers/api-interaction-manager.ts`: For understanding interaction modes.
*   `src/agents/base-agent.ts`: For the core agent loop.
*   `src/core/tool.ts`: For tool interfaces.
*   `src/openapi/connector.ts`: For OpenAPI integration.

## 🛠️ Development

**Prerequisites:**
*   Node.js (>=18.0.0 recommended)
*   npm or yarn

**Setup:**
```bash
git clone https://github.com/ulifeai/agentb.git
cd agentb
npm install
```

**Build:**
```bash
npm run build
```

**Lint & Format:**
```bash
npm run lint
npm run format
```

**Run Examples:**
(Ensure you have a `.env` file with `OPENAI_API_KEY` if running examples that use OpenAI)
```bash
# Example for running the PetStore API test script (after building)
# You might need to adjust the path in package.json or run directly
npm run start:example:petstore 
# Or during development with ts-node
npm run dev:example:petstore
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, fork the repository, and create pull requests.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

*   Inspired by the evolving landscape of AI agent frameworks.
*   Utilizes powerful open-source libraries.

---

*This README provides a starting point. You'll want to expand on usage examples, API details, and specific features as AgentB matures.*
```

**Key points about this `README.md`:**

*   **Project Name and Badges**: Uses "AgentB" and includes placeholder badges. You can generate actual badges from services like shields.io after publishing.
*   **Features**: Highlights the key architectural benefits and capabilities.
*   **Installation**: Standard npm/yarn command.
*   **Quick Start**: Provides a concise Express.js example showing how to use the `AgentB` facade. This is crucial for new users.
    *   It now uses a public PetStore spec URL for easier out-of-the-box testing by users (they don't need a local file immediately).
    *   Includes a `curl` example for testing the endpoint.
*   **Core Concepts**: Briefly explains the main components for users who want to understand the architecture.
*   **Development Section**: Basic instructions for setting up, building, and linting.
*   **Contributing and License**: Standard sections.
*   **GitHub URL**: https://github.com/ulifeai/agentb

