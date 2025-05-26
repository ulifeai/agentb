"use strict";
// src/tools/aggregated-tool-provider.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.AggregatedToolProvider = void 0;
/**
 * An IToolProvider that aggregates tools from multiple underlying IToolProvider instances.
 */
class AggregatedToolProvider {
    /**
     * Creates an instance of AggregatedToolProvider.
     * @param {IToolProvider[]} providers - An array of IToolProvider instances to aggregate.
     */
    constructor(providers) {
        if (!providers || providers.length === 0) {
            // It's reasonable to allow an empty aggregated provider,
            // which would then simply return no tools.
            this.providers = [];
        }
        else {
            this.providers = [...providers];
        }
    }
    /**
     * Gets all tools from all registered providers.
     * If multiple providers offer tools with the same name, tools from providers earlier
     * in the constructor's list will take precedence for that name.
     * @returns {Promise<ITool[]>} A promise that resolves with an array of all unique ITool instances.
     */
    async getTools() {
        const allTools = [];
        const toolNames = new Set();
        for (const provider of this.providers) {
            try {
                const toolsFromProvider = await provider.getTools();
                for (const tool of toolsFromProvider) {
                    const toolDefinition = await tool.getDefinition();
                    if (!toolNames.has(toolDefinition.name)) {
                        allTools.push(tool);
                        toolNames.add(toolDefinition.name);
                    }
                    else {
                        // Log a warning or handle as per a defined strategy for duplicate names.
                        // For now, we prioritize the first one added.
                        console.warn(`[AggregatedToolProvider] Duplicate tool name "${toolDefinition.name}" encountered. ` +
                            `Tool from an earlier provider in the list is being used.`);
                    }
                }
            }
            catch (error) {
                console.error(`[AggregatedToolProvider] Error fetching tools from a provider: ${error.message}`, error);
                // Optionally, rethrow or collect errors if one provider failing should stop all.
                // For now, continue with other providers.
            }
        }
        return allTools;
    }
    /**
     * Gets a specific tool by its name from the registered providers.
     * It searches providers in the order they were provided in the constructor.
     * The first tool found with the given name is returned.
     * @param {string} toolName - The name of the tool to retrieve.
     * @returns {Promise<ITool | undefined>} A promise that resolves with the ITool instance if found, or undefined.
     */
    async getTool(toolName) {
        for (const provider of this.providers) {
            try {
                const tool = await provider.getTool(toolName);
                if (tool) {
                    return tool;
                }
            }
            catch (error) {
                console.error(`[AggregatedToolProvider] Error fetching tool "${toolName}" from a provider: ${error.message}`, error);
                // Optionally, rethrow or handle. For now, continue search.
            }
        }
        return undefined;
    }
    /**
     * Ensures all underlying providers are initialized.
     * This can be useful if the aggregated provider itself has an initialization phase,
     * though typically initialization is managed by the individual providers.
     * @returns {Promise<void>}
     */
    async ensureInitialized() {
        // Attempt to call ensureInitialized on all sub-providers if they have it.
        for (const provider of this.providers) {
            if (provider.ensureInitialized) {
                try {
                    await provider.ensureInitialized();
                }
                catch (error) {
                    console.error(`[AggregatedToolProvider] Error during ensureInitialized for a sub-provider: ${error.message}`, error);
                    // Depending on desired behavior, might want to collect errors or rethrow.
                    // For now, log and continue.
                }
            }
        }
    }
}
exports.AggregatedToolProvider = AggregatedToolProvider;
//# sourceMappingURL=aggregated-tool-provider.js.map