// src/managers/toolset-orchestrator.ts

/**
 * @file ToolsetOrchestrator - Responsible for creating and managing IToolSet instances
 * from various IToolProviders (e.g., OpenAPIConnectors configured by tags).
 * This replaces the old AgentOrchestrator.
 */

import { IToolSet, IToolProvider, ITool } from '../core/tool';
import { OpenAPIConnector, OpenAPIConnectorOptions } from '../openapi/connector';
import { OpenAPISpec } from '../openapi/types'; // For spec info access
import { OpenAPISpecParser } from '../openapi/spec-parser'; // To get all tags
import { sanitizeIdForLLM } from '../core/utils';
import { ConfigurationError, ApplicationError } from '../core/errors';

/**
 * Configuration for a single source that can provide tools,
 * currently focused on OpenAPI specifications.
 */
export interface ToolProviderSourceConfig {
  /** Unique identifier for this source (e.g., 'petstore-api', 'user-service-v1'). */
  id: string;
  /** Type of the provider, defaults to 'openapi'. */
  type?: 'openapi'; // Extendable for other provider types in the future
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
}

export class ToolsetOrchestrator {
  private providerConfigs: ToolProviderSourceConfig[];
  private initializedToolsets: Map<string, IToolSet> = new Map(); // toolsetId -> IToolSet
  private initializationPromise: Promise<void> | null = null;
  // Add a new private member to store the initialized providers
  private initializedProviders: IToolProvider[] = [];

  constructor(providerConfigs: ToolProviderSourceConfig[]) {
    if (!providerConfigs || providerConfigs.length === 0) {
      throw new ConfigurationError('ToolsetOrchestrator requires at least one provider configuration.');
    }
    this.providerConfigs = providerConfigs;
  }

  private async _initialize(): Promise<void> {
    console.info(`[ToolsetOrchestrator] Initializing with ${this.providerConfigs.length} provider source(s)...`);
    this.initializedToolsets.clear();
    this.initializedProviders = []; // Clear previously initialized providers

    for (const config of this.providerConfigs) {
      if (config.type === undefined || config.type === 'openapi') {
        await this.initializeOpenApiProvider(config);
      } else {
        console.warn(
          `[ToolsetOrchestrator] Unsupported provider type "${config.type}" for source "${config.id}". Skipping.`
        );
      }
    }

    if (this.initializedToolsets.size === 0) {
      // This could be a valid scenario if, for example, all OpenAPI specs were empty or had no operations.
      console.warn(
        '[ToolsetOrchestrator] Initialization complete, but no toolsets were created. Check provider configurations and API specifications.'
      );
    } else {
      console.info(
        `[ToolsetOrchestrator] Initialization complete. ${this.initializedToolsets.size} toolset(s) created.`
      );
    }
  }

  private async initializeOpenApiProvider(
    config: ToolProviderSourceConfig,
  ): Promise<void> {
    try {
      // Prepare the full options for the OpenAPIConnector, ensuring sourceId is set
      const finalConnectorOptions: OpenAPIConnectorOptions = {
        ...config.openapiConnectorOptions,
        sourceId: config.id
      };

      const tempSpecConnectorForParsing = new OpenAPIConnector({
        // For this temporary parser, sourceId is less critical but good practice
        sourceId: `${config.id}-specparser`,
        spec: finalConnectorOptions.spec,
        specUrl: finalConnectorOptions.specUrl,
        authentication: { type: 'none' },
      });

      await tempSpecConnectorForParsing.ensureInitialized();
      const spec = tempSpecConnectorForParsing.getFullSpec();
      const specParser = tempSpecConnectorForParsing.getSpecParser();
      const allTags = specParser.getAllTags();
      const apiTitle = spec.info.title || config.id;
      let strategy = config.toolsetCreationStrategy;
      if (!strategy) strategy = allTags.length > 0 ? 'byTag' : 'allInOne';

      if (strategy === 'byTag' && allTags.length > 0) {
        for (const tag of allTags) {
          const taggedConnector = new OpenAPIConnector({
            ...finalConnectorOptions,
            spec,
            specUrl: undefined,
            tagFilter: tag,
          });
          await taggedConnector.ensureInitialized();
          // STORE THIS PROVIDER
          this.initializedProviders.push(taggedConnector);
          const tools = await taggedConnector.getTools();
          if (tools.length > 0) {
            const toolsetId = sanitizeIdForLLM(`${config.id}_tag_${tag}`);
            const toolsetName = `${apiTitle} - ${tag} Tools`;
            const toolsetDescription = `A set of tools for interacting with the '${tag}' category of operations in the ${apiTitle}.`;
            this.addToolset({
              id: toolsetId,
              name: toolsetName,
              description: toolsetDescription,
              tools: tools,
              metadata: {
                sourceId: config.id,
                providerType: 'openapi',
                originalTag: tag,
                apiTitle: apiTitle,
                baseUrl: taggedConnector.getBaseUrl(),
              },
            });
          } else {
            console.warn(
              `[ToolsetOrchestrator] No tools found for tag "${tag}" in API "${apiTitle}" from source "${config.id}". Skipping toolset creation for this tag.`
            );
          }
        }
      } else {
        // 'allInOne' or 'byTag' with no tags
        if (strategy === 'byTag' && allTags.length === 0) {
          console.info(
            `[ToolsetOrchestrator] Source "${config.id}" (${apiTitle}) has no tags, using 'allInOne' strategy.`
          );
        }
        const connector = new OpenAPIConnector({
          ...finalConnectorOptions,
          spec,
          specUrl: undefined,
          tagFilter: undefined,
        });
        await connector.ensureInitialized();
        // STORE THIS PROVIDER
        this.initializedProviders.push(connector);
        const tools = await connector.getTools();

        if (tools.length > 0) {
          const toolsetId = sanitizeIdForLLM(config.allInOneToolsetName || `${config.id}_all_tools`);
          const toolsetName = config.allInOneToolsetName || `${apiTitle} - All Tools`;
          const toolsetDescription =
            config.allInOneToolsetDescription || `A comprehensive set of tools for interacting with the ${apiTitle}.`;
          this.addToolset({
            id: toolsetId,
            name: toolsetName,
            description: toolsetDescription,
            tools: tools,
            metadata: {
              sourceId: config.id,
              providerType: 'openapi',
              apiTitle: apiTitle,
              baseUrl: connector.getBaseUrl(),
            },
          });
        } else {
          console.warn(
            `[ToolsetOrchestrator] No tools found for API "${apiTitle}" from source "${config.id}" (allInOne strategy). Skipping toolset creation.`
          );
        }
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[ToolsetOrchestrator] Failed to initialize OpenAPI provider source "${config.id}": ${errorMessage}`,
        error
      );
      // Optionally, rethrow or collect errors to report them all at once.
      // For now, just logging and continuing with other providers.
    }
  }

  private addToolset(toolset: IToolSet): void {
    if (this.initializedToolsets.has(toolset.id)) {
      console.warn(
        `[ToolsetOrchestrator] Toolset with ID "${toolset.id}" already exists. Overwriting. This might indicate a configuration issue or non-unique IDs.`
      );
    }
    this.initializedToolsets.set(toolset.id, toolset);
    console.info(
      `[ToolsetOrchestrator] Added toolset: "${toolset.name}" (ID: ${toolset.id}) with ${toolset.tools.length} tool(s).`
    );
  }

  /**
   * Gets all initialized IToolProvider instances that the orchestrator has configured.
   * These are typically OpenAPIConnector instances.
   * @returns {Promise<IToolProvider[]>} A promise that resolves to an array of IToolProvider instances.
   */
  public async getToolProviders(): Promise<IToolProvider[]> {
    await this.ensureInitialized();
    return [...this.initializedProviders]; // Return a copy
  }

  /**
   * Ensures that the orchestrator has completed its asynchronous initialization.
   * @throws Error if initialization failed.
   */
  public async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this._initialize();
    }
    await this.initializationPromise;
    // _initialize logs errors but doesn't rethrow to allow partial success.
    // If no toolsets are created, it's a warning, not necessarily an error for ensureInitialized.
  }

  /**
   * Gets all initialized toolsets.
   * @returns A Promise resolving to an array of IToolSet objects.
   */
  public async getToolsets(): Promise<IToolSet[]> {
    await this.ensureInitialized();
    return Array.from(this.initializedToolsets.values());
  }

  /**
   * Retrieves a specific toolset by its ID.
   * @param toolsetId The ID of the toolset.
   * @returns A Promise resolving to the IToolSet object if found, otherwise undefined.
   */
  public async getToolset(toolsetId: string): Promise<IToolSet | undefined> {
    await this.ensureInitialized();
    return this.initializedToolsets.get(toolsetId);
  }

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
  public async updateAuthenticationForAllOpenAPIProviders(
    newAuthCallback: (
      sourceId: string,
      currentOptions: OpenAPIConnectorOptions
    ) => OpenAPIConnectorOptions['authentication']
  ): Promise<void> {
    console.warn(
      '[ToolsetOrchestrator] updateAuthenticationForAllOpenAPIProviders is experimental and may not fully reconfigure live toolsets effectively without re-initialization. Consider re-creating the orchestrator with updated configs for robust auth changes.'
    );
    await this.ensureInitialized();
    // This is complex because toolsets hold tools from connectors instantiated with old auth.
    // A true dynamic update would require re-instantiating connectors or having connectors support dynamic auth updates reflected in their tools.
    // The current OpenAPIConnector.setAuthentication updates the connector instance,
    // but tools already generated might not pick up this change if they captured auth details at creation.
    // The simplest (though disruptive) way is to re-initialize.

    let reinitializeNeeded = false;
    for (const config of this.providerConfigs) {
      if (config.type === 'openapi' || config.type === undefined) {
        const newAuthConfig = newAuthCallback(config.id, {...config.openapiConnectorOptions, sourceId: config.id});
        if (
          newAuthConfig &&
          JSON.stringify(config.openapiConnectorOptions.authentication) !== JSON.stringify(newAuthConfig)
        ) {
          config.openapiConnectorOptions.authentication = newAuthConfig;
          reinitializeNeeded = true;
          console.info(
            `[ToolsetOrchestrator] Authentication configuration updated for source "${config.id}". Re-initialization will be triggered.`
          );
        }
      }
    }

    if (reinitializeNeeded) {
      console.info('[ToolsetOrchestrator] Re-initializing due to authentication changes...');
      this.initializationPromise = null; // Force re-initialization on next ensureInitialized call
      await this.ensureInitialized(); // Perform re-initialization
    } else {
      console.info('[ToolsetOrchestrator] No authentication changes detected that require re-initialization.');
    }
  }
}
