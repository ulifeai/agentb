import { ITool, IToolProvider } from '../../core/tool';
/**
 * An IToolProvider that aggregates tools from multiple underlying IToolProvider instances.
 */
export declare class AggregatedToolProvider implements IToolProvider {
    private providers;
    /**
     * Creates an instance of AggregatedToolProvider.
     * @param {IToolProvider[]} providers - An array of IToolProvider instances to aggregate.
     */
    constructor(providers: IToolProvider[]);
    /**
     * Gets all tools from all registered providers.
     * If multiple providers offer tools with the same name, tools from providers earlier
     * in the constructor's list will take precedence for that name.
     * @returns {Promise<ITool[]>} A promise that resolves with an array of all unique ITool instances.
     */
    getTools(): Promise<ITool[]>;
    /**
     * Gets a specific tool by its name from the registered providers.
     * It searches providers in the order they were provided in the constructor.
     * The first tool found with the given name is returned.
     * @param {string} toolName - The name of the tool to retrieve.
     * @returns {Promise<ITool | undefined>} A promise that resolves with the ITool instance if found, or undefined.
     */
    getTool(toolName: string): Promise<ITool | undefined>;
    /**
     * Ensures all underlying providers are initialized.
     * This can be useful if the aggregated provider itself has an initialization phase,
     * though typically initialization is managed by the individual providers.
     * @returns {Promise<void>}
     */
    ensureInitialized?(): Promise<void>;
}
