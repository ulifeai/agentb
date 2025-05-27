# Installation

Welcome to AgentB! Setting up is quick and easy.

## Prerequisites

* **Node.js**: Version 18.x or later is recommended.
* **Package Manager**: npm (usually comes with Node.js) or yarn.

## Install AgentB Packages

You'll typically need two packages:

1. `@ulifeai/agentb`: The core framework for building and running your agents.
2. `@ulifeai/agentb-ui`: (Optional) Pre-built React components for a chat interface.

Open your project terminal and run:

```bash
# Using npm
npm install @ulifeai/agentb @ulifeai/agentb-ui

# Using yarn
yarn add @ulifeai/agentb @ulifeai/agentb-ui
```

If you don't need the UI components immediately, you can just install the core package:

```bash
# Using npm
npm install @ulifeai/agentb

# Using yarn
yarn add @ulifeai/agentb
```

## Environment Variables (Especially for OpenAI)

Most AI agents connect to a Large Language Model (LLM) provider, like OpenAI. AgentB makes this easy but requires your API key.

1.  **Install `dotenv`**: This helper loads environment variables from a `.env` file.

    ```bash
    npm install dotenv
    yarn add dotenv
    ```
2.  **Create a `.env` file**: In the root directory of your project, create a file named `.env` and add your OpenAI API key:

    ```env
    OPENAI_API_KEY="sk-your_openai_api_key_here"
    ```

    Replace `sk-your_openai_api_key_here` with your actual key.
3.  **Load `dotenv` in your app**: At the very beginning of your main application file (e.g., `index.ts` or `server.ts`), add:

    ```typescript
    import * as dotenv from 'dotenv';
    dotenv.config();

    // Your AgentB application code will go here
    ```

This ensures your `OPENAI_API_KEY` is available to AgentB when it initializes the LLM client.

## TypeScript Setup (Recommended)

AgentB is written in TypeScript and works best in a TypeScript project. If you're starting a new project or adding AgentB to an existing one, here's a typical `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs", // Or "ESNext" for ESM projects
    "lib": ["ES2020", "DOM"], // "DOM" might be needed for UI parts or if web-related code exists
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true, // Good for importing JSON-based OpenAPI specs
    "outDir": "./dist",       // Your build output directory
    "rootDir": "./src"        // Your source code directory
  },
  "include": ["src/**/*"],    // Where your .ts files are
  "exclude": ["node_modules", "dist"]
}
```

Adjust `target`, `module`, `rootDir`, and `outDir` to fit your project structure.

You're all set! Now you're ready to build your first agent in the [next tutorial](TUTORIALS/01-your-first-agent-basic-chat.md).
