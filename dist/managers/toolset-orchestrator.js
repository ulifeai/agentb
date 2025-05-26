"use strict";
// src/managers/toolset-orchestrator.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolsetOrchestrator = void 0;
const connector_1 = require("../openapi/connector"); // Corrected import for OpenAPIOperationTool
// Removed incorrect import: import { OpenAPIOperationTool } from '../openapi/tool'; 
const utils_1 = require("../core/utils");
const errors_1 = require("../core/errors");
/**
 * ToolsetOrchestrator is responsible for creating and managing {@link IToolSet} instances
 * from various {@link IToolProvider} sources, primarily OpenAPI specifications.
 * It can handle different strategies for toolset creation (e.g., one toolset per API tag,
 * or a single toolset for all tools from an API).
 * If a generated toolset exceeds a configurable size threshold, and an {@link ILLMClient}
 * is provided, the orchestrator will use the LLM to attempt to split the toolset
 * into smaller, logically coherent groups.
 */
class ToolsetOrchestrator {
    /**
     * Creates an instance of ToolsetOrchestrator.
     * @param {ToolProviderSourceConfig[]} providerConfigs An array of configurations for each tool provider source.
     * @param {ILLMClient} [llmClient] Optional. An LLM client instance. If provided, it will be used
     *                                   to logically split toolsets that exceed the `maxToolsPerLogicalGroup`
     *                                   threshold defined in their respective `ToolProviderSourceConfig`.
     */
    constructor(providerConfigs, llmClient) {
        this.initializedToolsets = new Map(); // toolsetId -> IToolSet
        this.initializationPromise = null;
        this.initializedProviders = [];
        if (!providerConfigs || providerConfigs.length === 0) {
            throw new errors_1.ConfigurationError('ToolsetOrchestrator requires at least one provider configuration.');
        }
        this.providerConfigs = providerConfigs;
        this.llmClient = llmClient;
    }
    async _initialize() {
        console.info(`[ToolsetOrchestrator] Initializing with ${this.providerConfigs.length} provider source(s)...`);
        this.initializedToolsets.clear();
        this.initializedProviders = []; // Clear previously initialized providers
        for (const config of this.providerConfigs) {
            if (config.type === undefined || config.type === 'openapi') {
                await this.initializeOpenApiProvider(config);
            }
            else {
                console.warn(`[ToolsetOrchestrator] Unsupported provider type "${config.type}" for source "${config.id}". Skipping.`);
            }
        }
        if (this.initializedToolsets.size === 0) {
            // This could be a valid scenario if, for example, all OpenAPI specs were empty or had no operations.
            console.warn('[ToolsetOrchestrator] Initialization complete, but no toolsets were created. Check provider configurations and API specifications.');
        }
        else {
            console.info(`[ToolsetOrchestrator] Initialization complete. ${this.initializedToolsets.size} toolset(s) created.`);
        }
    }
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
    async initializeOpenApiProvider(config) {
        const DEFAULT_MAX_TOOLS_PER_LOGICAL_GROUP = 10;
        const currentThreshold = config.maxToolsPerLogicalGroup ?? DEFAULT_MAX_TOOLS_PER_LOGICAL_GROUP;
        // The logicalGroupingStrategy is less relevant now if LLM is the primary splitting mechanism.
        // If LLM client is present, it will be used. If not, no advanced splitting occurs.
        // The warning about 'pathPrefix' can be removed or revisited if non-LLM strategies are re-introduced.
        try {
            const finalConnectorOptions = {
                ...config.openapiConnectorOptions,
                sourceId: config.id,
            };
            // Temporary connector for spec parsing and metadata extraction
            const tempSpecConnectorForParsing = new connector_1.OpenAPIConnector({
                sourceId: `${config.id}-specparser`,
                spec: finalConnectorOptions.spec,
                specUrl: finalConnectorOptions.specUrl,
                authentication: { type: 'none' }, // Auth not needed for spec parsing
            });
            await tempSpecConnectorForParsing.ensureInitialized();
            const spec = tempSpecConnectorForParsing.getFullSpec();
            const specParser = tempSpecConnectorForParsing.getSpecParser();
            const allTags = specParser.getAllTags();
            const apiTitle = spec.info.title || config.id;
            let strategy = config.toolsetCreationStrategy;
            if (!strategy) {
                strategy = allTags.length > 0 ? 'byTag' : 'allInOne';
            }
            if (strategy === 'byTag' && allTags.length > 0) {
                for (const tag of allTags) {
                    const connector = new connector_1.OpenAPIConnector({
                        ...finalConnectorOptions,
                        spec, // Use already parsed spec
                        specUrl: undefined, // Spec is already loaded
                        tagFilter: tag,
                    });
                    await connector.ensureInitialized();
                    this.initializedProviders.push(connector); // Store this provider
                    const tools = await connector.getTools();
                    const toolsetName = `${apiTitle} - ${tag} Tools`;
                    const toolsetDescription = `A set of tools for interacting with the '${tag}' category of operations in the ${apiTitle}.`;
                    const metadataBase = {
                        sourceId: config.id,
                        providerType: 'openapi',
                        originalTag: tag,
                        apiTitle: apiTitle,
                        baseUrl: connector.getBaseUrl(),
                    };
                    if (tools.length > 0) {
                        if (tools.length > currentThreshold) {
                            const tagString = `tag: ${tag}`;
                            if (this.llmClient) {
                                console.info(`[ToolsetOrchestrator] Toolset for source '${config.id}' (${tagString}) exceeds ${currentThreshold} tools (${tools.length}). Attempting LLM-based logical split.`);
                                const additionalToolsets = await this._splitToolsWithLLM(tools, connector, config, apiTitle, toolsetName, metadataBase);
                                for (const ts of additionalToolsets) {
                                    this.addToolset(ts);
                                }
                            }
                            else {
                                console.warn(`[ToolsetOrchestrator] Toolset for source '${config.id}' (${tagString}) exceeds threshold (${tools.length}/${currentThreshold}) but no LLM client provided. Falling back to creating a single large toolset.`);
                                const toolsetId = (0, utils_1.sanitizeIdForLLM)(`${config.id}_tag_${tag}`);
                                this.addToolset({
                                    id: toolsetId,
                                    name: toolsetName,
                                    description: toolsetDescription,
                                    tools: tools,
                                    metadata: metadataBase,
                                });
                            }
                        }
                        else {
                            const toolsetId = (0, utils_1.sanitizeIdForLLM)(`${config.id}_tag_${tag}`);
                            this.addToolset({
                                id: toolsetId,
                                name: toolsetName,
                                description: toolsetDescription,
                                tools: tools,
                                metadata: metadataBase,
                            });
                        }
                    }
                    else {
                        console.warn(`[ToolsetOrchestrator] No tools found for tag "${tag}" in API "${apiTitle}" from source "${config.id}". Skipping toolset creation for this tag.`);
                    }
                }
            }
            else { // 'allInOne' or 'byTag' with no tags
                if (strategy === 'byTag' && allTags.length === 0) {
                    console.info(`[ToolsetOrchestrator] Source "${config.id}" (${apiTitle}) has no tags, using 'allInOne' strategy.`);
                }
                const connector = new connector_1.OpenAPIConnector({
                    ...finalConnectorOptions,
                    spec, // Use already parsed spec
                    specUrl: undefined, // Spec is already loaded
                    tagFilter: undefined, // No tag filter for allInOne
                });
                await connector.ensureInitialized();
                this.initializedProviders.push(connector); // Store this provider
                const tools = await connector.getTools();
                const toolsetName = config.allInOneToolsetName || `${apiTitle} - All Tools`;
                const toolsetDescription = config.allInOneToolsetDescription ||
                    `A comprehensive set of tools for interacting with the ${apiTitle}.`;
                const metadataBase = {
                    sourceId: config.id,
                    providerType: 'openapi',
                    apiTitle: apiTitle,
                    baseUrl: connector.getBaseUrl(),
                };
                if (tools.length > 0) {
                    if (tools.length > currentThreshold) {
                        const tagString = 'allInOne';
                        if (this.llmClient) {
                            console.info(`[ToolsetOrchestrator] Toolset for source '${config.id}' (${tagString}) exceeds ${currentThreshold} tools (${tools.length}). Attempting LLM-based logical split.`);
                            const additionalToolsets = await this._splitToolsWithLLM(tools, connector, config, apiTitle, toolsetName, metadataBase);
                            for (const ts of additionalToolsets) {
                                this.addToolset(ts);
                            }
                        }
                        else {
                            console.warn(`[ToolsetOrchestrator] Toolset for source '${config.id}' (${tagString}) exceeds threshold (${tools.length}/${currentThreshold}) but no LLM client provided. Falling back to creating a single large toolset.`);
                            const toolsetId = (0, utils_1.sanitizeIdForLLM)(config.allInOneToolsetName || `${config.id}_all_tools`);
                            this.addToolset({
                                id: toolsetId,
                                name: toolsetName,
                                description: toolsetDescription,
                                tools: tools,
                                metadata: metadataBase,
                            });
                        }
                    }
                    else {
                        const toolsetId = (0, utils_1.sanitizeIdForLLM)(config.allInOneToolsetName || `${config.id}_all_tools`);
                        this.addToolset({
                            id: toolsetId,
                            name: toolsetName,
                            description: toolsetDescription,
                            tools: tools,
                            metadata: metadataBase,
                        });
                    }
                }
                else {
                    console.warn(`[ToolsetOrchestrator] No tools found for API "${apiTitle}" from source "${config.id}" (allInOne strategy). Skipping toolset creation.`);
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[ToolsetOrchestrator] Failed to initialize OpenAPI provider source "${config.id}": ${errorMessage}`, error);
            // Optionally, rethrow or collect errors to report them all at once.
            // For now, just logging and continuing with other providers.
        }
    }
    addToolset(toolset) {
        if (this.initializedToolsets.has(toolset.id)) {
            console.warn(`[ToolsetOrchestrator] Toolset with ID "${toolset.id}" already exists. Overwriting. This might indicate a configuration issue or non-unique IDs.`);
        }
        this.initializedToolsets.set(toolset.id, toolset);
        console.info(`[ToolsetOrchestrator] Added toolset: "${toolset.name}" (ID: ${toolset.id}) with ${toolset.tools.length} tool(s).`);
    }
    /**
     * Helper to create a fallback toolset when LLM splitting isn't performed or fails.
     */
    createFallbackToolset(toolsToGroup, config, apiTitle, baseToolsetName, // e.g., "PetStore - Pets Tools" or "PetStore - All Tools"
    baseMetadata, reasonCode // Short code for logging/metadata, e.g., "no_llm", "llm_failure"
    ) {
        const fallbackToolsetName = `${baseToolsetName} (Fallback Group - ${reasonCode})`;
        const fallbackToolsetId = (0, utils_1.sanitizeIdForLLM)(`${config.id}_fallback_${reasonCode}_${baseToolsetName.replace(/\s+/g, '_')}`);
        const fallbackToolsetDesc = `A collection of tools for ${apiTitle}. These tools were grouped together because automatic splitting (e.g., by LLM) was not performed or did not succeed (reason: ${reasonCode}). Original source: ${config.id}.`;
        const fallbackMetadata = {
            ...baseMetadata,
            logicalGroup: `fallback_group_${reasonCode}`,
            splittingFallbackReason: reasonCode,
            originalTag: baseMetadata.originalTag ? `${baseMetadata.originalTag}-fallback-${reasonCode}` : `fallback-${reasonCode}`
        };
        console.info(`[ToolsetOrchestrator] Creating fallback toolset: "${fallbackToolsetName}" (ID: ${fallbackToolsetId}) with ${toolsToGroup.length} tool(s).`);
        return {
            id: fallbackToolsetId,
            name: fallbackToolsetName,
            description: fallbackToolsetDesc,
            tools: toolsToGroup,
            metadata: fallbackMetadata,
        };
    }
    async _splitToolsWithLLM(toolsToSplit, connector, config, apiTitle, baseToolsetNameForFallback, baseMetadata) {
        const resultingToolsets = [];
        // 1. Separate OpenAPI tools from other (auxiliary) tools
        const openApiTools = [];
        const otherTools = [];
        for (const tool of toolsToSplit) {
            if (tool instanceof connector_1.OpenAPIOperationTool) {
                openApiTools.push(tool);
            }
            else {
                otherTools.push(tool);
            }
        }
        // 2. Handle 'otherTools' immediately by creating a dedicated toolset for them
        if (otherTools.length > 0) {
            const otherToolsId = (0, utils_1.sanitizeIdForLLM)(`${config.id}_auxiliary_tools`);
            const otherToolsName = `${apiTitle} - Auxiliary Tools`;
            const otherToolsDescription = `A collection of auxiliary (non-OpenAPI or manually added) tools from source '${config.id}'.`;
            const otherToolsMetadata = {
                ...baseMetadata,
                logicalGroup: 'auxiliary_tools',
                // Adjust originalTag if it exists to avoid clashes
                originalTag: baseMetadata.originalTag ? `${baseMetadata.originalTag}_auxiliary` : 'auxiliary_tools'
            };
            resultingToolsets.push({
                id: otherToolsId,
                name: otherToolsName,
                description: otherToolsDescription,
                tools: otherTools,
                metadata: otherToolsMetadata,
            });
            console.info(`[ToolsetOrchestrator] Created '${otherToolsName}' for ${otherTools.length} auxiliary tool(s) from source '${config.id}'.`);
        }
        // 3. If no OpenAPI tools to split, return early (might just contain the auxiliary toolset)
        if (openApiTools.length === 0) {
            if (resultingToolsets.length > 0) {
                // console.info('[ToolsetOrchestrator] No OpenAPI tools to split with LLM. Returning auxiliary toolset if created.');
            }
            else {
                console.info('[ToolsetOrchestrator] No OpenAPI tools and no auxiliary tools. Nothing to split or group for this input.');
            }
            return resultingToolsets;
        }
        // 4. Attempt LLM-based splitting for openApiTools
        if (!this.llmClient) {
            console.warn(`[ToolsetOrchestrator] LLM client not provided. Cannot split OpenAPI tools for source '${config.id}'. Falling back to a single group for these ${openApiTools.length} OpenAPI tools.`);
            const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "no_llm_client");
            resultingToolsets.push(fallbackToolset);
            return resultingToolsets;
        }
        const operationsDataForLLM = openApiTools.map(opTool => ({
            operationId: opTool.operation.operationId,
            summary: opTool.operation.summary || '',
            description: opTool.operation.description || '',
            // method: opTool.operation.method, // Method and path might be too much detail for grouping prompt
            // path: opTool.operation.path,
            // tags: opTool.operation.tags || [], // Tags might bias the LLM if it's already tag-based
        }));
        const DEFAULT_LLM_SPLITTING_MODEL = config.llmSplittingConfig?.model || "gpt-4.1-mini";
        const DEFAULT_LLM_SPLITTING_TEMPERATURE = config.llmSplittingConfig?.temperature || 0.2;
        const DEFAULT_LLM_SPLITTING_MAX_TOKENS = config.llmSplittingConfig?.maxTokens || 3000; // Increased slightly
        const systemPrompt = `You are an expert API analyst. Your task is to organize a list of API operations into a few (2-5 ideally) smaller, coherent, non-overlapping groups based on their functionality.
The API is titled "${apiTitle}".
You will be provided with a JSON array of operation details (operationId, summary, description).
Based on this data, suggest a set of new group names and assign each relevant operationId to EXACTLY ONE of these groups.
Output your response as a single, valid JSON object. The keys of this object MUST be your suggested group names (e.g., "User Management"),
and the value for each key MUST be an array of operationId strings (e.g., ["getUserOpId", "updateUserOpId"]) that belong to that group.
Ensure operationIds are not duplicated across groups.
If some operations don't fit well into specific functional groups, you can suggest a "Miscellaneous" or "General" group for them.
Every operationId provided in the input MUST be assigned to one of the groups in your output. Do not omit any.
Example Output Format:
{
  "User Profile Management": ["getUserProfile", "updateUserProfile", "deleteUserProfile"],
  "Order History Services": ["listOrders", "getOrderDetails"],
  "Utility Operations": ["getServerStatus", "getApiVersion"]
}
The output MUST be a valid JSON object and nothing else.`;
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Please group the following ${operationsDataForLLM.length} operations for API '${apiTitle}':
${JSON.stringify(operationsDataForLLM, null, 2)}` }
        ];
        let llmResponseText;
        try {
            console.info(`[ToolsetOrchestrator] Calling LLM (${DEFAULT_LLM_SPLITTING_MODEL}) for toolset splits for ${openApiTools.length} OpenAPI tools from source '${config.id}'.`);
            const llmResponse = await this.llmClient.generateResponse(messages, {
                model: DEFAULT_LLM_SPLITTING_MODEL,
                temperature: DEFAULT_LLM_SPLITTING_TEMPERATURE,
                max_tokens: DEFAULT_LLM_SPLITTING_MAX_TOKENS,
                response_format: { type: "json_object" }
            });
            if (typeof llmResponse?.content === 'string') {
                llmResponseText = llmResponse.content;
            }
            else {
                console.error(`[ToolsetOrchestrator] LLM response content was not a string for source '${config.id}'. Response:`, llmResponse);
                const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_bad_response_content");
                resultingToolsets.push(fallbackToolset);
                return resultingToolsets;
            }
        }
        catch (error) {
            console.error(`[ToolsetOrchestrator] LLM call failed during tool splitting for source '${config.id}': ${error.message}`, error);
            const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_call_failure");
            resultingToolsets.push(fallbackToolset);
            return resultingToolsets;
        }
        if (!llmResponseText || llmResponseText.trim() === '') {
            console.error(`[ToolsetOrchestrator] LLM returned empty content for tool splitting (source '${config.id}').`);
            const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_empty_response");
            resultingToolsets.push(fallbackToolset);
            return resultingToolsets;
        }
        let llmSuggestedGroups;
        try {
            const cleanedJsonResponse = llmResponseText.replace(/^```json\s*|\s*```$/g, '').trim();
            llmSuggestedGroups = JSON.parse(cleanedJsonResponse);
        }
        catch (error) {
            console.error(`[ToolsetOrchestrator] Failed to parse LLM JSON for tool splitting (source '${config.id}'). Error: ${error.message}. Cleaned Response (first 500 chars): ${llmResponseText.substring(0, 500)}`);
            const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_json_parse_failure");
            resultingToolsets.push(fallbackToolset);
            return resultingToolsets;
        }
        if (typeof llmSuggestedGroups !== 'object' || llmSuggestedGroups === null || Array.isArray(llmSuggestedGroups)) {
            console.error(`[ToolsetOrchestrator] LLM response for tool splitting (source '${config.id}') is not a valid JSON object map. Parsed: ${JSON.stringify(llmSuggestedGroups)}`);
            const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_invalid_json_structure");
            resultingToolsets.push(fallbackToolset);
            return resultingToolsets;
        }
        const toolsByOpId = new Map(openApiTools.map(t => [t.operation.operationId, t]));
        const llmCreatedToolsets = [];
        const assignedOperationIds = new Set();
        let allOpsAssignedCorrectly = true;
        for (const [groupName, operationIdsInGroup] of Object.entries(llmSuggestedGroups)) {
            if (typeof groupName !== 'string' || !groupName.trim()) {
                console.warn(`[ToolsetOrchestrator] LLM suggested an invalid group name (empty or not a string) for source '${config.id}'. Skipping this group.`);
                allOpsAssignedCorrectly = false;
                continue;
            }
            if (!Array.isArray(operationIdsInGroup) || operationIdsInGroup.some(id => typeof id !== 'string')) {
                console.warn(`[ToolsetOrchestrator] LLM suggested group '${groupName}' for source '${config.id}' has invalid operationIds (must be an array of strings). Skipping group.`);
                allOpsAssignedCorrectly = false;
                continue;
            }
            const toolsInGroup = [];
            for (const opId of operationIdsInGroup) {
                if (assignedOperationIds.has(opId)) {
                    console.warn(`[ToolsetOrchestrator] LLM suggested operationId '${opId}' for group '${groupName}' (source '${config.id}') which was already assigned to another group. This suggests an issue with the LLM's grouping logic or prompt adherence. Skipping duplicate assignment for this group.`);
                    allOpsAssignedCorrectly = false;
                    continue; // Skip this opId for this group
                }
                const tool = toolsByOpId.get(opId);
                if (tool) {
                    toolsInGroup.push(tool);
                    assignedOperationIds.add(opId);
                }
                else {
                    console.warn(`[ToolsetOrchestrator] LLM suggested operationId '${opId}' for group '${groupName}' (source '${config.id}') which was not found in the original OpenAPI tools. Skipping this unknown operationId.`);
                    allOpsAssignedCorrectly = false;
                }
            }
            if (toolsInGroup.length === 0) {
                if (operationIdsInGroup.length > 0) { // Only warn if LLM intended to put something here but all were invalid
                    console.warn(`[ToolsetOrchestrator] LLM-suggested group '${groupName}' for source '${config.id}' resulted in no valid tools after filtering. Skipping toolset creation for this group.`);
                }
                continue;
            }
            const toolsetId = (0, utils_1.sanitizeIdForLLM)(`${config.id}_llm_group_${groupName.replace(/\s+/g, '_')}`);
            const toolsetName = `${apiTitle} - ${groupName}`;
            const toolsetDescription = `LLM-defined group for "${groupName}" operations in the ${apiTitle}. From source ${config.id}.`;
            const newMetadata = {
                ...baseMetadata,
                logicalGroup: groupName,
                llmGroupName: groupName,
                llmModelUsed: DEFAULT_LLM_SPLITTING_MODEL,
                originalTag: baseMetadata.originalTag ? `${baseMetadata.originalTag}_llm_${groupName.replace(/\s+/g, '_')}` : `llm_group_${groupName.replace(/\s+/g, '_')}`
            };
            llmCreatedToolsets.push({
                id: toolsetId,
                name: toolsetName,
                description: toolsetDescription,
                tools: toolsInGroup,
                metadata: newMetadata,
            });
            console.info(`[ToolsetOrchestrator] LLM created toolset: "${toolsetName}" (ID: ${toolsetId}) with ${toolsInGroup.length} tool(s) for source '${config.id}'.`);
        }
        const unassignedTools = openApiTools.filter(tool => !assignedOperationIds.has(tool.operation.operationId));
        if (unassignedTools.length > 0) {
            allOpsAssignedCorrectly = false; // Not all tools were assigned by LLM's main grouping.
            console.warn(`[ToolsetOrchestrator] ${unassignedTools.length} OpenAPI tools were not assigned to any primary group by the LLM for source '${config.id}'. Creating a 'Miscellaneous' group for them.`);
            const miscToolset = this.createFallbackToolset(unassignedTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_unassigned_misc");
            llmCreatedToolsets.push(miscToolset);
        }
        if (!allOpsAssignedCorrectly || llmCreatedToolsets.length === 0) {
            // If there were significant issues (like duplicate assignments, unknown opIds from LLM, or no groups created at all),
            // it's safer to fall back to a single group for all openApiTools.
            console.warn(`[ToolsetOrchestrator] LLM splitting for source '${config.id}' had issues or resulted in no valid primary groups. Falling back to a single group for all ${openApiTools.length} OpenAPI tools.`);
            const fallbackToolset = this.createFallbackToolset(openApiTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "llm_split_issues_or_empty");
            // Clear any partially created LLM toolsets and the auxiliary one, return only the full fallback + auxiliary if it exists
            resultingToolsets.length = 0; // Clear existing (which might be just auxiliary)
            if (otherTools.length > 0) { // Re-add auxiliary if it was there
                const auxToolset = this.createFallbackToolset(otherTools, config, apiTitle, baseToolsetNameForFallback, baseMetadata, "auxiliary_preserved"); // Or use its original name/id
                auxToolset.id = (0, utils_1.sanitizeIdForLLM)(`${config.id}_auxiliary_tools`); // keep original ID
                auxToolset.name = `${apiTitle} - Auxiliary Tools`;
                auxToolset.description = `A collection of auxiliary (non-OpenAPI or manually added) tools from source '${config.id}'.`;
                if (auxToolset.metadata) {
                    auxToolset.metadata.logicalGroup = 'auxiliary_tools';
                }
                resultingToolsets.push(auxToolset);
            }
            resultingToolsets.push(fallbackToolset);
            return resultingToolsets;
        }
        resultingToolsets.push(...llmCreatedToolsets);
        return resultingToolsets;
    }
    /**
     * Gets all initialized IToolProvider instances that the orchestrator has configured.
     * These are typically OpenAPIConnector instances.
     * @returns {Promise<IToolProvider[]>} A promise that resolves to an array of IToolProvider instances.
     */
    async getToolProviders() {
        await this.ensureInitialized();
        return [...this.initializedProviders]; // Return a copy
    }
    /**
     * Ensures that the orchestrator has completed its asynchronous initialization.
     * @throws Error if initialization failed.
     */
    async ensureInitialized() {
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
    async getToolsets() {
        await this.ensureInitialized();
        return Array.from(this.initializedToolsets.values());
    }
    /**
     * Retrieves a specific toolset by its ID.
     * @param toolsetId The ID of the toolset.
     * @returns A Promise resolving to the IToolSet object if found, otherwise undefined.
     */
    async getToolset(toolsetId) {
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
    async updateAuthenticationForAllOpenAPIProviders(newAuthCallback) {
        console.warn('[ToolsetOrchestrator] updateAuthenticationForAllOpenAPIProviders is experimental and may not fully reconfigure live toolsets effectively without re-initialization. Consider re-creating the orchestrator with updated configs for robust auth changes.');
        await this.ensureInitialized();
        // This is complex because toolsets hold tools from connectors instantiated with old auth.
        // A true dynamic update would require re-instantiating connectors or having connectors support dynamic auth updates reflected in their tools.
        // The current OpenAPIConnector.setAuthentication updates the connector instance,
        // but tools already generated might not pick up this change if they captured auth details at creation.
        // The simplest (though disruptive) way is to re-initialize.
        let reinitializeNeeded = false;
        for (const config of this.providerConfigs) {
            if (config.type === 'openapi' || config.type === undefined) {
                const newAuthConfig = newAuthCallback(config.id, { ...config.openapiConnectorOptions, sourceId: config.id });
                if (newAuthConfig &&
                    JSON.stringify(config.openapiConnectorOptions.authentication) !== JSON.stringify(newAuthConfig)) {
                    config.openapiConnectorOptions.authentication = newAuthConfig;
                    reinitializeNeeded = true;
                    console.info(`[ToolsetOrchestrator] Authentication configuration updated for source "${config.id}". Re-initialization will be triggered.`);
                }
            }
        }
        if (reinitializeNeeded) {
            console.info('[ToolsetOrchestrator] Re-initializing due to authentication changes...');
            this.initializationPromise = null; // Force re-initialization on next ensureInitialized call
            await this.ensureInitialized(); // Perform re-initialization
        }
        else {
            console.info('[ToolsetOrchestrator] No authentication changes detected that require re-initialization.');
        }
    }
}
exports.ToolsetOrchestrator = ToolsetOrchestrator;
//# sourceMappingURL=toolset-orchestrator.js.map