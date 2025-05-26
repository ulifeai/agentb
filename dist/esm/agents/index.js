// src/agents/index.ts
export { DEFAULT_AGENT_RUN_CONFIG } from './config';
// --- Core Agent Components ---
/**
 * BaseAgent provides a standard, extendable implementation of the IAgent interface.
 * It orchestrates the primary agent loop, including LLM interaction, tool usage,
 * and context management through injected services.
 */
export { BaseAgent } from './base-agent';
/**
 * LLMResponseProcessor is responsible for parsing raw LLM output (streaming or complete)
 * into structured events, such as text chunks and detected tool call requests.
 */
export { LLMResponseProcessor } from './response-processor';
/**
 * ToolExecutor handles the execution of tools based on parsed tool calls from the
 * LLMResponseProcessor. It uses an IToolProvider to find and run the tools.
 */
export { ToolExecutor } from './tool-executor';
/**
 * ContextManager is responsible for managing the conversation context window,
 * including token counting and triggering summarization when necessary to
 * stay within LLM limits.
 */
export { ContextManager } from './context-manager';
// DEFAULT_CONTEXT_MANAGER_CONFIG is already in './context-manager.ts' and might be exported from there if needed globally.
// If ContextManagerConfig is defined in config.ts, it's already covered.
// Note: Specific agent implementations (if any beyond BaseAgent) would also be exported here.
// e.g., export { MyCustomResearchAgent } from './my-custom-research-agent';
//# sourceMappingURL=index.js.map