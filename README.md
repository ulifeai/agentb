# AgentB 🚀 

Effortless AI for Your API-Driven Projects

**AgentB is the simplest way to integrate intelligent AI agents into your API-based Node.js applications.** Get your AI connected to your data and services in minutes, not weeks.

[![npm version](https://badge.fury.io/js/@ulifeai%2Fagentb.svg)](https://www.npmjs.com/package/@ulifeai/agentb)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/ulifeai/agentb.svg?style=social&label=Star)](https://github.com/ulifeai/agentb)
[![Documentation](https://img.shields.io/badge/docs-gitbook-brightgreen.svg)](https://ulifeai.gitbook.io/agentb)

Tired of complex setups just to let an AI talk to your API? AgentB cuts through the noise. If you have an OpenAPI spec, you're moments away from an AI agent that can understand user requests, interact with your API, handle authentication, and engage in multi-turn conversations.

**Core Philosophy: Simplicity First, Power Underneath.**
*   **Connect Your API Instantly**: Got an OpenAPI spec? Your agent is practically ready.
*   **Minutes to "Hello, API!"**: Our `AgentB` facade gets you a streaming HTTP endpoint for your agent with minimal code.
*   **Auth Handled**: Securely connect to your authenticated APIs. AgentB supports dynamic, per-request authentication.
*   **Conversational Context**: Multi-turn conversations are managed out-of-the-box.
*   **UI Ready**: Stream events directly to your frontend. Use with `@ulifeai/agentb-ui` for a ready-made React chat experience.
*   **Scale & Customize**: When you need more, AgentB's modular design offers deep customization for advanced agent behaviors and architectures.

## ✨ Key Benefits for API-Driven Projects

*   **Rapid API Integration**: Leverage your existing OpenAPI specifications to automatically give agents "tools" to interact with your API endpoints.
*   **Natural Language Interface for Your API**: Allow users (or other systems) to interact with your services using natural language.
*   **Automate Complex Workflows**: Build agents that can chain multiple API calls, process data, and make decisions based on API responses.
*   **Secure Authentication Handling**: Integrate with your API's existing auth (Bearer tokens, API keys) securely, with support for dynamic, per-request credentials.
*   **Focus on Your Business Logic**: AgentB handles the complexities of LLM interaction, tool definition, conversation state, and streaming, so you can focus on what makes your application unique.
*   **Extensible**: While designed for ease with OpenAPI, you can always add custom tools for databases, internal services, or any other capability.

## 📦 Installation

```bash
npm install @ulifeai/agentb
# or
yarn add @ulifeai/agentb

# For the optional React UI components:
npm install @ulifeai/agentb-ui
# or
yarn add @ulifeai/agentb-ui
```

## 🚀 Quick Start: AI-Enable Your API in 5 Minutes

Let's create an AI agent that can interact with a public API (e.g., PetStore) via an Express.js server.

**Prerequisites:**
*   Node.js (v18+)
*   An OpenAI API Key set in your `.env` file (`OPENAI_API_KEY="sk-..."`). Install `dotenv` (`npm install dotenv`).

```typescript
// server.ts
import express from 'express';
import { AgentB, ToolProviderSourceConfig } from '@ulifeai/agentb';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json()); // To parse JSON request bodies

async function startApp() {
    if (!process.env.OPENAI_API_KEY) {
        console.error("🔴 CRITICAL: OPENAI_API_KEY is not set in your .env file!");
        process.exit(1);
    }

    // 1. Initialize AgentB (super simple!)
    AgentB.initialize({
        llmProvider: {
            provider: 'openai', // Default, uses OPENAI_API_KEY from env
            model: 'gpt-4o-mini',  // Or your preferred model
        },
    });
    console.log("🟢 AgentB Initialized.");

    // 2. Tell AgentB about your API using its OpenAPI spec
    const myApiConfig: ToolProviderSourceConfig = {
        id: 'petStore', // A unique name for this API connection
        type: 'openapi',
        openapiConnectorOptions: {
            // Use a public URL or a local spec file
            specUrl: 'https://petstore3.swagger.io/api/v3/openapi.json',
            // If your API needs authentication, configure it here:
            // authentication: { type: 'bearer', token: process.env.MY_API_BEARER_TOKEN },
            // authentication: { type: 'apiKey', name: 'X-API-KEY', in: 'header', key: process.env.MY_API_KEY },
        },
        // How tools are grouped (optional, 'byTag' is often good)
        toolsetCreationStrategy: 'byTag',
    };
    AgentB.registerToolProvider(myApiConfig);
    console.log(`🔵 Tool provider "${myApiConfig.id}" registered. Agent can now use this API.`);

    // 3. Expose your agent via a streaming HTTP endpoint
    app.post('/chat-with-my-api', AgentB.getExpressStreamingHttpHandler({
        // Optional: Customize how threadId and user messages are extracted
        getThreadId: async (req, threadStorage) => {
            const requestedThreadId = req.body.threadId || req.query.threadId;
            if (requestedThreadId && typeof requestedThreadId === 'string' && (await threadStorage.getThread(requestedThreadId))) {
                return requestedThreadId;
            }
            const newThread = await threadStorage.createThread({ title: "API Chat" });
            return newThread.id;
        },
        getUserMessage: async (req) => req.body.prompt, // Expects: {"prompt": "user's question"}
        // Optional: Add your API authentication logic if tokens come from client request
        // authorizeRequest: async (req, threadId) => {
        //   const userToken = req.headers.authorization?.substring(7); // Example: Bearer token
        //   if (!userToken) return false; // Deny if no token
        //   return {
        //     'petStore': { type: 'bearer', token: userToken } // Pass token for 'petStore' API calls
        //   };
        // },
    }));

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`✅ AgentB Server live at http://localhost:${PORT}`);
        console.log(`👉 Test your API-connected agent:`);
        console.log(`   curl -X POST -H "Content-Type: application/json" -d '{"prompt":"Find available pets"}' http://localhost:${PORT}/chat-with-my-api --no-buffer`);
    });
}

startApp().catch(error => {
    console.error("🔴 Failed to start AgentB application:", error);
});
```

**That's it!** You now have an AI agent connected to the PetStore API, ready to stream responses.
Your frontend (or any client) can now talk to `http://localhost:3001/chat-with-my-api`.

## 📚 Dive Deeper - Full Documentation

Explore how to customize further, build advanced agents, and understand the core components:
**[Full Documentation: ulifeai.gitbook.io/agentb](https://ulifeai.gitbook.io/agentb)**

**Key topics in the docs:**
*   **Tutorials**: From basic chat to custom tools and UI integration.
*   **Core Concepts**: Understand Agents, Tools, LLM Clients, Threads, and more.
*   **In-Depth Guides**: Detailed explanations of `AgentB` Facade, `ApiInteractionManager`, `OpenAPIConnector`, `PlanningAgent`, Authentication, Storage, etc.
*   **API Reference**: Full details on classes, interfaces, and types.
*   **Advanced Scenarios**: Building complex agent systems.

## 🛠️ Core Architecture Highlights

While AgentB is easy to start with, it's built on a powerful and modular foundation:

*   **`AgentB` Facade**: Your simplest entry point for common use-cases.
*   **`ApiInteractionManager`**: Manages different agent interaction modes (e.g., `genericOpenApi` for direct API tool use, `hierarchicalPlanner` for complex task delegation).
*   **`IAgent` & `BaseAgent`**: Define and implement the core agent execution loop.
*   **`ITool`, `IToolProvider`, `IToolSet`**: Flexible abstractions for tools and their organization.
*   **`OpenAPIConnector`**: The magic that turns your OpenAPI specs into usable agent tools.
*   **`ILLMClient` & `OpenAIAdapter`**: Abstract LLM interactions.
*   **Storage System (`I[Message/Thread/AgentRun]Storage`)**: Pluggable persistence (defaults to in-memory).
*   **`ToolsetOrchestrator` & `PlanningAgent`**: For advanced hierarchical agents that can plan and delegate tasks to specialized sub-agents.

## 🤝 Contributing

We believe in the power of community! Contributions, bug reports, and feature requests are highly welcome. Please see our (upcoming) `CONTRIBUTING.md` and feel free to open issues or PRs on our [GitHub repository](https://github.com/ulifeai/agentb).

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/YourAmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add YourAmazingFeature'`)
4.  Push to the Branch (`git push origin feature/YourAmazingFeature`)
5.  Open a Pull Request

## 📜 License

AgentB is licensed under the Apache 2.0 License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

*   Inspired by the incredible advancements in AI and the LLM ecosystem.
*   Built with the help of many fantastic open-source libraries.

---

*AgentB: Making AI integration as easy as calling an API.* 