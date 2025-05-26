"use strict";
// src/agents/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = exports.ToolExecutor = exports.LLMResponseProcessor = exports.BaseAgent = exports.DEFAULT_AGENT_RUN_CONFIG = void 0;
var config_1 = require("./config");
Object.defineProperty(exports, "DEFAULT_AGENT_RUN_CONFIG", { enumerable: true, get: function () { return config_1.DEFAULT_AGENT_RUN_CONFIG; } });
// --- Core Agent Components ---
/**
 * BaseAgent provides a standard, extendable implementation of the IAgent interface.
 * It orchestrates the primary agent loop, including LLM interaction, tool usage,
 * and context management through injected services.
 */
var base_agent_1 = require("./base-agent");
Object.defineProperty(exports, "BaseAgent", { enumerable: true, get: function () { return base_agent_1.BaseAgent; } });
/**
 * LLMResponseProcessor is responsible for parsing raw LLM output (streaming or complete)
 * into structured events, such as text chunks and detected tool call requests.
 */
var response_processor_1 = require("./response-processor");
Object.defineProperty(exports, "LLMResponseProcessor", { enumerable: true, get: function () { return response_processor_1.LLMResponseProcessor; } });
/**
 * ToolExecutor handles the execution of tools based on parsed tool calls from the
 * LLMResponseProcessor. It uses an IToolProvider to find and run the tools.
 */
var tool_executor_1 = require("./tool-executor");
Object.defineProperty(exports, "ToolExecutor", { enumerable: true, get: function () { return tool_executor_1.ToolExecutor; } });
/**
 * ContextManager is responsible for managing the conversation context window,
 * including token counting and triggering summarization when necessary to
 * stay within LLM limits.
 */
var context_manager_1 = require("./context-manager");
Object.defineProperty(exports, "ContextManager", { enumerable: true, get: function () { return context_manager_1.ContextManager; } });
// DEFAULT_CONTEXT_MANAGER_CONFIG is already in './context-manager.ts' and might be exported from there if needed globally.
// If ContextManagerConfig is defined in config.ts, it's already covered.
// Note: Specific agent implementations (if any beyond BaseAgent) would also be exported here.
// e.g., export { MyCustomResearchAgent } from './my-custom-research-agent';
//# sourceMappingURL=index.js.map