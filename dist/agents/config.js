"use strict";
// src/agents/config.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AGENT_RUN_CONFIG = void 0;
/**
 * Default configuration values for an agent run.
 * Can be overridden by specific agent implementations or at runtime.
 */
exports.DEFAULT_AGENT_RUN_CONFIG = {
    temperature: 0.7,
    toolChoice: 'auto',
    maxToolCallContinuations: 10,
    responseProcessorConfig: {
        enableNativeToolCalling: true,
        enableXmlToolCalling: false,
        maxXmlToolCalls: 0,
    },
    toolExecutorConfig: {
        executionStrategy: 'sequential',
    },
    enableContextManagement: true,
};
//# sourceMappingURL=config.js.map