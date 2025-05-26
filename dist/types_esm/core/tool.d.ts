/**
 * @file Defines the core interfaces for tools and tool providers.
 * These interfaces aim to be generic and usable by various tool implementations
 * and LLM integration layers.
 */
import { IAgentContext } from '../agents/types';
/**
 * Represents a parameter for a tool.
 */
export interface IToolParameter {
    /** The name of the parameter. */
    name: string;
    /**
     * The primary type of the parameter (e.g., 'string', 'number', 'boolean', 'object', 'array', 'any').
     * This provides a basic understanding of the parameter type.
     */
    type: string;
    /** A human-readable description of the parameter. */
    description: string;
    /** Whether the parameter is required. */
    required: boolean;
    /**
     * Optional: A JSON schema fragment that provides more detailed type information,
     * constraints (e.g., enum, min/max), or structure (for object/array types).
     * If provided, this can be used by LLM adapters to generate precise parameter schemas.
     */
    schema?: any;
}
/**
 * Defines the structure and metadata of a tool.
 * This information is used by LLMs to understand what the tool does and how to call it.
 */
export interface IToolDefinition<Input = any, Output = any> {
    /**
     * The unique name of the tool. Should be sanitized for LLM compatibility
     * (e.g., using sanitizeIdForLLM: a-z, A-Z, 0-9, underscores, hyphens, max 64 chars).
     */
    name: string;
    /** A human-readable description of what the tool does. */
    description: string;
    /** An array of parameters the tool accepts. */
    parameters: IToolParameter[];
}
/**
 * Represents the standardized result of a tool's execution.
 */
export interface IToolResult<TData = any> {
    /** Indicates whether the tool execution was successful. */
    success: boolean;
    /** The data payload of the result if successful, or relevant info on failure. */
    data: TData;
    /** An optional error message if success is false. */
    error?: string;
    /** Optional metadata associated with the tool execution (e.g., cost, logs, call_id). */
    metadata?: Record<string, any>;
}
/**
 * Represents an executable tool.
 * @template Input The type of the input object the tool's execute method expects.
 * @template OutputData The type of the data within the IToolResult's output.
 */
export interface ITool<Input = Record<string, any>, OutputData = any> {
    /**
     * Gets the definition of the tool.
     * Can be async if the definition depends on external state or async setup.
     * @returns {Promise<IToolDefinition<Input, OutputData>> | IToolDefinition<Input, OutputData>}
     *          The tool definition, or a promise resolving to it.
     */
    getDefinition(): Promise<IToolDefinition<Input, OutputData>> | IToolDefinition<Input, OutputData>;
    /**
     * Executes the tool with the given input.
     * @param {Input} input - The input parameters for the tool, matching the structure defined by `parameters` in its `IToolDefinition`.
     * @param {IAgentContext} [agentContext] - Optional: The context of the agent run, providing access to shared services or request-specific data.
     * @returns {Promise<IToolResult<OutputData>>} A promise that resolves with the tool's result.
     */
    execute(input: Input, agentContext?: IAgentContext): Promise<IToolResult<OutputData>>;
}
/**
 * Represents a provider that can supply a collection of tools.
 * This is useful for components like an OpenAPI connector that can expose multiple API operations as tools.
 */
export interface IToolProvider {
    /**
     * Gets all tools provided by this instance.
     * @returns {Promise<ITool[]>} A promise that resolves with an array of ITool instances.
     *                             The promise handles any asynchronous initialization needed to get tools.
     */
    getTools(): Promise<ITool[]>;
    /**
     * Gets a specific tool by its name.
     * @param {string} toolName - The name of the tool to retrieve.
     * @returns {Promise<ITool | undefined>} A promise that resolves with the ITool instance if found, or undefined.
     */
    getTool(toolName: string): Promise<ITool | undefined>;
    /**
     * Ensures the provider is ready to supply tools (e.g., loads specs).
     * Optional: Providers can choose to initialize in their constructor.
     * @returns {Promise<void>}
     */
    ensureInitialized?(): Promise<void>;
}
/**
 * Represents a named collection or set of tools, often grouped by capability or purpose.
 * This is useful for organizing tools for a "specialist agent" or a specific domain.
 */
export interface IToolSet {
    /** A unique identifier for this toolset (e.g., "user_management_tools", "petstore_pet_apis"). */
    id: string;
    /** A human-readable name for the toolset. */
    name: string;
    /** A description of the toolset's purpose or capabilities. */
    description: string;
    /** The actual ITool instances belonging to this set. */
    tools: ITool[];
    /** Optional: Any additional metadata associated with the toolset. */
    metadata?: Record<string, any>;
}
