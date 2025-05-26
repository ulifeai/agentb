# Tools & Tool Providers: `ToolsetOrchestrator`

When your application needs to manage tools from multiple different sources (e.g., several distinct APIs) or wants to group tools from a single large API into logical, specialized sets, the `ToolsetOrchestrator` comes into play.

It's a higher-level manager responsible for creating and providing access to `IToolSet` instances. An `IToolSet` is a named collection of tools, often representing the capabilities of a "specialist" or a particular domain.

This component is key to enabling advanced agent architectures like the `hierarchicalPlanner` mode in `ApiInteractionManager`.

## Key Responsibilities

1.  **Consuming `ToolProviderSourceConfig`s**: It takes an array of `ToolProviderSourceConfig` objects. Each config describes a source of tools, primarily an OpenAPI specification.
2.  **Instantiating `IToolProvider`s**: For each `ToolProviderSourceConfig` of type 'openapi', it creates an `OpenAPIConnector` instance.
3.  **Creating `IToolSet`s**: Based on the `toolsetCreationStrategy` in each `ToolProviderSourceConfig`:
    *   **`byTag`**: It creates a separate `IToolSet` for each tag found in the OpenAPI specification. For example, an e-commerce API might have tags like "products", "orders", "users", leading to three distinct toolsets.
    *   **`allInOne`**: It groups all tools from that specific OpenAPI provider into a single `IToolSet`.
4.  **LLM-Powered Toolset Splitting (Optional)**:
    *   If an `IToolSet` (whether from `byTag` or `allInOne`) contains more tools than a configurable `maxToolsPerLogicalGroup` threshold, and if an `ILLMClient` is provided to the `ToolsetOrchestrator`, it will attempt to use the LLM to further divide that large toolset into smaller, more semantically coherent `IToolSet`s.
    *   The LLM is prompted to analyze the tool definitions (summaries, descriptions) and suggest logical groupings.
    *   If LLM splitting is not available or fails, it falls back to creating the larger, unsplit toolset.
5.  **Providing Access to Toolsets**: Offers methods like `getToolsets()` and `getToolset(id)` for other parts of the system (like `ApiInteractionManager` or `DelegateToSpecialistTool`) to retrieve these organized collections of tools.
6.  **Managing Underlying Providers**: Keeps track of the actual `IToolProvider` instances (e.g., `OpenAPIConnector`s) it creates.

## `ToolProviderSourceConfig`

This is the input configuration for the `ToolsetOrchestrator`:

```typescript
interface ToolProviderSourceConfig {
  id: string; // e.g., 'petStoreApi', 'googleCalendarApi'
  type?: 'openapi'; // Currently primary type
  openapiConnectorOptions: Omit<OpenAPIConnectorOptions, 'sourceId'>;
  toolsetCreationStrategy?: 'byTag' | 'allInOne'; // Default: 'byTag' if tags exist, else 'allInOne'
  allInOneToolsetName?: string;
  allInOneToolsetDescription?: string;
  maxToolsPerLogicalGroup?: number; // Default: e.g., 10
  llmSplittingConfig?: { // Settings for the LLM used for splitting
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
}
```
*   `id`: A unique identifier for this source. This ID is often used to name the resulting toolsets (e.g., `petStoreApi_products`, `googleCalendarApi_events`).
*   `openapiConnectorOptions`: The configuration for the `OpenAPIConnector` that will be created for this source. **Important**: The `sourceId` field *within* `openapiConnectorOptions` will be automatically set by `ToolsetOrchestrator` to match the top-level `id` of the `ToolProviderSourceConfig`.
*   `toolsetCreationStrategy`:
    *   `byTag`: For an API with tags "A" and "B", toolsets like `id_A` and `id_B` would be created.
    *   `allInOne`: A single toolset, possibly named `id_all` or using `allInOneToolsetName`.
*   `maxToolsPerLogicalGroup`: If a toolset derived from a tag or `allInOne` strategy still has too many tools (e.g., >10), LLM-splitting is attempted.
*   `llmSplittingConfig`: If you provide an `ILLMClient` to the `ToolsetOrchestrator`'s constructor, these settings will be used when it calls the LLM to suggest splits for oversized toolsets.

## How it's Used

The `ToolsetOrchestrator` is primarily used by:

*   **`ApiInteractionManager` in `hierarchicalPlanner` mode**:
    *   AIM instantiates `ToolsetOrchestrator` with the `toolsetOrchestratorConfig`.
    *   The resulting `IToolSet`s are then made available to the `DelegateToSpecialistTool`.
    *   The `PlanningAgent` uses the `DelegateToSpecialistTool` to delegate sub-tasks, selecting a specialist (an `IToolSet`) by its ID.

**Example Initialization (as done within `ApiInteractionManager`):**

```typescript
import { ToolsetOrchestrator, ToolProviderSourceConfig, ILLMClient } from '@ulifeai/agentb';

// Assuming llmClient is an initialized ILLMClient instance
// Assuming petStoreConfig and calendarConfig are ToolProviderSourceConfig objects

const orchestratorConfigs: ToolProviderSourceConfig[] = [petStoreConfig, calendarConfig];
const orchestrator = new ToolsetOrchestrator(orchestratorConfigs, llmClient); // Pass LLM client for splitting

async function setup() {
  await orchestrator.ensureInitialized(); // Creates all toolsets

  const allToolsets = await orchestrator.getToolsets();
  console.log("Available Toolsets (Specialists):");
  for (const ts of allToolsets) {
    console.log(`- ID: ${ts.id}, Name: ${ts.name}, Tools: ${ts.tools.length}`);
    // For debugging, list tools in each set:
    // for (const tool of ts.tools) {
    //   const def = await tool.getDefinition();
    //   console.log(`    - ${def.name}`);
    // }
  }

  const petStoreProductTools = await orchestrator.getToolset('petStoreApi_products'); // Example ID
  if (petStoreProductTools) {
    // ...
  }
}
```

## LLM-Powered Splitting

If a toolset (e.g., all tools under the "pets" tag in PetStore API) has, say, 25 tools, and `maxToolsPerLogicalGroup` is 10, the `ToolsetOrchestrator` (if given an `llmClient`) will:

1.  Extract definitions (summary, description) of those 25 tools.
2.  Send these definitions to an LLM (e.g., GPT-4o-mini) with a prompt asking it to:
    *   "Organize these API operations into 2-5 smaller, coherent, non-overlapping groups based on functionality."
    *   "Output a JSON object where keys are your suggested group names, and values are arrays of `operationId`s belonging to that group."
3.  Parse the LLM's JSON response.
4.  For each suggested group from the LLM (e.g., "PetInventoryManagement", "PetFindingServices"):
    *   Create a new `IToolSet`.
    *   The ID might be `originalSourceId_originalTag_llmGroupName` (e.g., `petStoreApi_pets_PetInventoryManagement`).
    *   The tools in this new set are only those `operationId`s assigned by the LLM to this group.
    *   The original, large toolset (e.g., `petStoreApi_pets`) is *replaced* by these smaller, LLM-defined toolsets.

This intelligent splitting helps in:
*   **Clarity for Planning LLMs**: A `PlanningAgent` sees a list of more focused specialists (e.g., "PetInventorySpecialist" instead of a generic "PetStoreSpecialist" with too many options).
*   **Improved Delegation Accuracy**: The planner can more easily choose the right specialist if their capabilities are well-defined and not overly broad.
*   **Reduced Prompt Size**: The `DelegateToSpecialistTool`'s definition (which lists available specialists) becomes more manageable.

If no `llmClient` is provided to the `ToolsetOrchestrator`, or if the LLM-splitting fails (e.g., bad JSON from LLM, LLM call error), the orchestrator falls back to creating the larger, unsplit toolset as defined by the `toolsetCreationStrategy` (`byTag` or `allInOne`).

The `ToolsetOrchestrator` is a sophisticated component that brings structure and scalability to how agents access and utilize large numbers of tools from diverse sources, especially in complex, multi-agent architectures. 