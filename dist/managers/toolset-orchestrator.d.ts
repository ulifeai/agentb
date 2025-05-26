/**
 * @file ToolsetOrchestrator - Responsible for creating and managing IToolSet instances
 * from various IToolProviders (e.g., OpenAPIConnectors configured by tags).
 * This class can also leverage an LLM client to logically split large toolsets into smaller,
 * more manageable groups if a toolset exceeds a defined threshold.
 * This replaces the old AgentOrchestrator.
 */
import { IToolSet, IToolProvider } from '../core/tool';
import { OpenAPIConnectorOptions } from '../openapi/connector';
import { ILLMClient } from '../llm/types';
/**
 * Configuration for the LLM used to split large toolsets.
 * These settings fine-tune the behavior of the LLM when it's called
 * to suggest logical groupings for oversized toolsets.
 */
interface LLMSplittingConfig {
    /** The LLM model name to use for suggesting tool splits (e.g., "gpt-4-turbo-preview"). */
    model: string;
    /**
     * Sampling temperature for the LLM.
     * A lower value (e.g., 0.3) results in more deterministic and focused output,
     * which is generally preferred for consistent JSON.
     * Defaults to a low value if not specified.
     */
    temperature?: number;
    /**
     * Maximum number of tokens for the LLM's response.
     * This should be set to a reasonable value to accommodate the expected JSON output size
     * containing the suggested group names and operation IDs.
     * Defaults to a pre-defined value if not specified.
     */
    maxTokens?: number;
}
/**
 * Configuration for a single source that can provide tools,
 * currently focused on OpenAPI specifications.
 */
export interface ToolProviderSourceConfig {
    /** Unique identifier for this source (e.g., 'petstore-api', 'user-service-v1'). */
    id: string;
    /** Type of the provider, defaults to 'openapi'. */
    type?: 'openapi';
    /**
     * Options for the OpenAPIConnector if type is 'openapi'.
     * Note: sourceId is NOT part of this user-facing options object.
     * It will be derived from the ToolProviderSourceConfig.id.
     */
    openapiConnectorOptions: Omit<OpenAPIConnectorOptions, 'sourceId'>;
    /**
     * Strategy for creating toolsets from this provider.
     * - 'byTag': Create one IToolSet per discovered OpenAPI tag.
     * - 'allInOne': Group all tools from this provider into a single IToolSet.
     * @default 'byTag' if tags exist, otherwise 'allInOne'.
     */
    toolsetCreationStrategy?: 'byTag' | 'allInOne';
    /**
     * Optional: If 'allInOne', this name will be used for the single toolset created.
     * If not provided, a default name will be generated.
     */
    allInOneToolsetName?: string;
    /**
     * Optional: If 'allInOne', this description will be used for the single toolset created.
     */
    allInOneToolsetDescription?: string;
    /**
     * Maximum number of tools allowed in a single toolset before attempting a split.
     * If a toolset generated (e.g., 'allInOne' or for a specific tag) exceeds this number,
     * the orchestrator will attempt to split it.
     * If an `ILLMClient` is configured for the orchestrator, LLM-based splitting will be used.
     * If no LLM client is available, or if the LLM splitting process fails, the orchestrator
     * will fall back to creating a single, large toolset (i.e., no split will occur).
     * If not set, a default value (e.g., 10) will be used.
     */
    maxToolsPerLogicalGroup?: number;
    /**
     * Defines a non-LLM strategy for logically grouping tools if a toolset is too large.
     * Note: This strategy is currently **unused** if an `ILLMClient` is provided to the
     * `ToolsetOrchestrator`, as LLM-based splitting will take precedence.
     * It is reserved for future use or scenarios where an LLM is not available.
     * @default 'pathPrefix'
     */
    logicalGroupingStrategy?: 'pathPrefix';
    /**
     * Optional configuration for the LLM used to split large toolsets.
     * If an `ILLMClient` is provided to the orchestrator, these settings will
     * be used for the LLM-based splitting process.
     */
    llmSplittingConfig?: LLMSplittingConfig;
}
/**
 * ToolsetOrchestrator is responsible for creating and managing {@link IToolSet} instances
 * from various {@link IToolProvider} sources, primarily OpenAPI specifications.
 * It can handle different strategies for toolset creation (e.g., one toolset per API tag,
 * or a single toolset for all tools from an API).
 * If a generated toolset exceeds a configurable size threshold, and an {@link ILLMClient}
 * is provided, the orchestrator will use the LLM to attempt to split the toolset
 * into smaller, logically coherent groups.
 */
export declare class ToolsetOrchestrator {
    private providerConfigs;
    private initializedToolsets;
    private initializationPromise;
    private initializedProviders;
    private readonly llmClient?;
    /**
     * Creates an instance of ToolsetOrchestrator.
     * @param {ToolProviderSourceConfig[]} providerConfigs An array of configurations for each tool provider source.
     * @param {ILLMClient} [llmClient] Optional. An LLM client instance. If provided, it will be used
     *                                   to logically split toolsets that exceed the `maxToolsPerLogicalGroup`
     *                                   threshold defined in their respective `ToolProviderSourceConfig`.
     */
    constructor(providerConfigs: ToolProviderSourceConfig[], llmClient?: ILLMClient);
    private _initialize;
    /**
     * Initializes toolsets from a single OpenAPI provider configuration.
     * It determines the strategy for toolset creation (e.g., by tag or all-in-one).
     * If a resulting toolset's size exceeds `config.maxToolsPerLogicalGroup` (or a default value)
     * and an LLM client is available in the orchestrator, it attempts to split the toolset
     * into smaller logical groups using the LLM. If no LLM client is available or the
     * splitting fails, it falls back to creating a single, potentially large, toolset.
     *
     * @param {ToolProviderSourceConfig} config The configuration for the OpenAPI provider source.
     * @returns {Promise<void>} A promise that resolves when the provider is initialized.
     * @private
     */
    private initializeOpenApiProvider;
    private addToolset;
    /**
     * Helper to create a fallback toolset when LLM splitting isn't performed or fails.
     */
    private createFallbackToolset;
    private _splitToolsWithLLM;
    /**
     * Gets all initialized IToolProvider instances that the orchestrator has configured.
     * These are typically OpenAPIConnector instances.
     * @returns {Promise<IToolProvider[]>} A promise that resolves to an array of IToolProvider instances.
     */
    getToolProviders(): Promise<IToolProvider[]>;
    /**
     * Ensures that the orchestrator has completed its asynchronous initialization.
     * @throws Error if initialization failed.
     */
    ensureInitialized(): Promise<void>;
    /**
     * Gets all initialized toolsets.
     * @returns A Promise resolving to an array of IToolSet objects.
     */
    getToolsets(): Promise<IToolSet[]>;
    /**
     * Retrieves a specific toolset by its ID.
     * @param toolsetId The ID of the toolset.
     * @returns A Promise resolving to the IToolSet object if found, otherwise undefined.
     */
    getToolset(toolsetId: string): Promise<IToolSet | undefined>;
    /**
     * Dynamically updates the authentication for all underlying tool providers
     * that support it (currently OpenAPIConnectors).
     * This is useful if authentication tokens need to be refreshed.
     *
     * Note: This method currently assumes all providers are OpenAPIConnectors.
     * A more generic approach would involve checking provider type or capabilities.
     *
     * @param newAuth Function that takes a sourceConfig and returns new authentication, or new auth object.
     *                This part needs refinement on how auth is identified per provider config.
     *                For now, let's assume a simpler model where a single new auth is applied if possible.
     * This method needs significant refinement to be truly generic.
     * For now, it's a placeholder concept. The original `setAuthenticationForAllAgents`
     * in `AgentOrchestrator` was simpler because it only dealt with one primary spec.
     * With multiple `ToolProviderSourceConfig`, updating auth is more complex.
     *
     * A better approach might be for the IToolProvider interface itself to have a `setAuthentication` method.
     * Then, this orchestrator would iterate its managed providers and call it.
     * However, `OpenAPIConnector.setAuthentication` is instance-specific.
     *
     * TODO: Revisit dynamic authentication updates with multiple provider sources.
     * For now, applications should re-initialize the ToolsetOrchestrator with new
     * `openapiConnectorOptions.authentication` in the `ToolProviderSourceConfig` objects.
     */
    updateAuthenticationForAllOpenAPIProviders(newAuthCallback: (sourceId: string, currentOptions: OpenAPIConnectorOptions) => OpenAPIConnectorOptions['authentication']): Promise<void>;
}
export {};
