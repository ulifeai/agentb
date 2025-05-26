"use strict";
// src/index.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiInteractionManager = exports.ToolsetOrchestrator = exports.DelegateToSpecialistTool = exports.DEFAULT_CONTEXT_MANAGER_CONFIG = exports.ContextManager = exports.ToolExecutor = exports.LLMResponseProcessor = exports.DEFAULT_PLANNER_SYSTEM_PROMPT = exports.PlanningAgent = exports.BaseAgent = exports.DEFAULT_AGENT_RUN_CONFIG = exports.MemoryStorage = exports.createThreadObject = exports.mapIMessageToLLMMessage = exports.mapLLMMessageToIMessagePartial = exports.createMessageObject = exports.generateRouterSystemPrompt = exports.generateGenericHttpToolSystemPrompt = exports.generateToolsSystemPrompt = exports.LLM_ROUTER_TOOL_NAME_CONST = exports.LLM_GENERIC_HTTP_TOOL_NAME_CONST = exports.formatToolsForOpenAI = exports.adaptToolDefinitionsToOpenAI = exports.OpenAIAdapter = exports.headersToObject = exports.fetchSpec = exports.GENERIC_HTTP_TOOL_NAME = exports.GenericHttpApiTool = exports.OpenAPISpecParser = exports.OpenAPIConnector = exports.ValidationError = exports.StorageError = exports.InvalidStateError = exports.ConfigurationError = exports.LLMError = exports.ToolNotFoundError = exports.ApplicationError = exports.sanitizeIdForLLM = void 0;
var utils_1 = require("./core/utils");
Object.defineProperty(exports, "sanitizeIdForLLM", { enumerable: true, get: function () { return utils_1.sanitizeIdForLLM; } });
var errors_1 = require("./core/errors");
Object.defineProperty(exports, "ApplicationError", { enumerable: true, get: function () { return errors_1.ApplicationError; } });
Object.defineProperty(exports, "ToolNotFoundError", { enumerable: true, get: function () { return errors_1.ToolNotFoundError; } });
Object.defineProperty(exports, "LLMError", { enumerable: true, get: function () { return errors_1.LLMError; } });
Object.defineProperty(exports, "ConfigurationError", { enumerable: true, get: function () { return errors_1.ConfigurationError; } });
Object.defineProperty(exports, "InvalidStateError", { enumerable: true, get: function () { return errors_1.InvalidStateError; } });
Object.defineProperty(exports, "StorageError", { enumerable: true, get: function () { return errors_1.StorageError; } });
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return errors_1.ValidationError; } });
// --- OpenAPI Specific Components ---
var connector_1 = require("./openapi/connector");
Object.defineProperty(exports, "OpenAPIConnector", { enumerable: true, get: function () { return connector_1.OpenAPIConnector; } });
var spec_parser_1 = require("./openapi/spec-parser");
Object.defineProperty(exports, "OpenAPISpecParser", { enumerable: true, get: function () { return spec_parser_1.OpenAPISpecParser; } });
var generic_http_tool_1 = require("./openapi/tools/generic-http-tool");
Object.defineProperty(exports, "GenericHttpApiTool", { enumerable: true, get: function () { return generic_http_tool_1.GenericHttpApiTool; } });
Object.defineProperty(exports, "GENERIC_HTTP_TOOL_NAME", { enumerable: true, get: function () { return generic_http_tool_1.GENERIC_HTTP_TOOL_NAME; } });
var utils_2 = require("./openapi/utils");
Object.defineProperty(exports, "fetchSpec", { enumerable: true, get: function () { return utils_2.fetchSpec; } });
Object.defineProperty(exports, "headersToObject", { enumerable: true, get: function () { return utils_2.headersToObject; } });
var openai_adapter_1 = require("./llm/adapters/openai/openai-adapter"); // Concrete adapter
Object.defineProperty(exports, "OpenAIAdapter", { enumerable: true, get: function () { return openai_adapter_1.OpenAIAdapter; } });
var openai_tool_adapter_1 = require("./llm/adapters/openai/openai-tool-adapter"); // Tool formatter
Object.defineProperty(exports, "adaptToolDefinitionsToOpenAI", { enumerable: true, get: function () { return openai_tool_adapter_1.adaptToolDefinitionsToOpenAI; } });
Object.defineProperty(exports, "formatToolsForOpenAI", { enumerable: true, get: function () { return openai_tool_adapter_1.adaptToolDefinitionsToOpenAI; } });
var prompt_builder_1 = require("./llm/prompt-builder");
Object.defineProperty(exports, "LLM_GENERIC_HTTP_TOOL_NAME_CONST", { enumerable: true, get: function () { return prompt_builder_1.GENERIC_HTTP_TOOL_NAME; } });
Object.defineProperty(exports, "LLM_ROUTER_TOOL_NAME_CONST", { enumerable: true, get: function () { return prompt_builder_1.ROUTER_TOOL_NAME; } });
Object.defineProperty(exports, "generateToolsSystemPrompt", { enumerable: true, get: function () { return prompt_builder_1.generateToolsSystemPrompt; } });
Object.defineProperty(exports, "generateGenericHttpToolSystemPrompt", { enumerable: true, get: function () { return prompt_builder_1.generateGenericHttpToolSystemPrompt; } });
Object.defineProperty(exports, "generateRouterSystemPrompt", { enumerable: true, get: function () { return prompt_builder_1.generateRouterSystemPrompt; } });
var message_1 = require("./threads/message");
Object.defineProperty(exports, "createMessageObject", { enumerable: true, get: function () { return message_1.createMessageObject; } });
Object.defineProperty(exports, "mapLLMMessageToIMessagePartial", { enumerable: true, get: function () { return message_1.mapLLMMessageToIMessagePartial; } });
Object.defineProperty(exports, "mapIMessageToLLMMessage", { enumerable: true, get: function () { return message_1.mapIMessageToLLMMessage; } });
var thread_1 = require("./threads/thread");
Object.defineProperty(exports, "createThreadObject", { enumerable: true, get: function () { return thread_1.createThreadObject; } });
var memory_storage_1 = require("./threads/storage/memory-storage"); // Default in-memory storage
Object.defineProperty(exports, "MemoryStorage", { enumerable: true, get: function () { return memory_storage_1.MemoryStorage; } });
var config_1 = require("./agents/config");
Object.defineProperty(exports, "DEFAULT_AGENT_RUN_CONFIG", { enumerable: true, get: function () { return config_1.DEFAULT_AGENT_RUN_CONFIG; } });
var base_agent_1 = require("./agents/base-agent");
Object.defineProperty(exports, "BaseAgent", { enumerable: true, get: function () { return base_agent_1.BaseAgent; } });
var planning_agent_1 = require("./agents/planning-agent");
Object.defineProperty(exports, "PlanningAgent", { enumerable: true, get: function () { return planning_agent_1.PlanningAgent; } });
Object.defineProperty(exports, "DEFAULT_PLANNER_SYSTEM_PROMPT", { enumerable: true, get: function () { return planning_agent_1.DEFAULT_PLANNER_SYSTEM_PROMPT; } });
var response_processor_1 = require("./agents/response-processor");
Object.defineProperty(exports, "LLMResponseProcessor", { enumerable: true, get: function () { return response_processor_1.LLMResponseProcessor; } });
var tool_executor_1 = require("./agents/tool-executor");
Object.defineProperty(exports, "ToolExecutor", { enumerable: true, get: function () { return tool_executor_1.ToolExecutor; } });
var context_manager_1 = require("./agents/context-manager");
Object.defineProperty(exports, "ContextManager", { enumerable: true, get: function () { return context_manager_1.ContextManager; } });
var context_manager_2 = require("./agents/context-manager");
Object.defineProperty(exports, "DEFAULT_CONTEXT_MANAGER_CONFIG", { enumerable: true, get: function () { return context_manager_2.DEFAULT_CONTEXT_MANAGER_CONFIG; } });
// --- Specialized Tools (part of the framework core) ---
var delegate_to_specialist_tool_1 = require("./tools/core/delegate-to-specialist-tool");
Object.defineProperty(exports, "DelegateToSpecialistTool", { enumerable: true, get: function () { return delegate_to_specialist_tool_1.DelegateToSpecialistTool; } });
// --- High-Level Managers ---
var toolset_orchestrator_1 = require("./managers/toolset-orchestrator");
Object.defineProperty(exports, "ToolsetOrchestrator", { enumerable: true, get: function () { return toolset_orchestrator_1.ToolsetOrchestrator; } });
var api_interaction_manager_1 = require("./managers/api-interaction-manager");
Object.defineProperty(exports, "ApiInteractionManager", { enumerable: true, get: function () { return api_interaction_manager_1.ApiInteractionManager; } });
// --- Deprecated / To Be Removed (Original Manager files) ---
// These should be removed once dependent code is updated.
// For now, commented out to signify they are replaced.
// export { AgentOrchestrator } from './managers/orchestrator';
// export type { AgentOrchestratorOptions, SpecialistAgent } from './managers/orchestrator';
// export { APIToolManager } from './managers/tool-manager';
// export type { APIToolManagerOptions, APIToolMode as OldAPIToolMode } from './managers/tool-manager';
__exportStar(require("./facades/agentb"), exports);
console.log('AI Agent Framework Core Loaded.'); // Optional: for build verification
//# sourceMappingURL=index.js.map