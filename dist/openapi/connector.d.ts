/**
 * @file OpenAPIConnector class for interacting with an API defined by an OpenAPI specification.
 * It implements IToolProvider to expose API operations as ITools.
 * It can be configured to handle all operations or be filtered by a specific tag.
 */
import { OpenAPISpec, BaseOpenAPIConnectorOptions, ConnectorAuthentication, ConnectorOperation } from './types';
import { OpenAPISpecParser } from './spec-parser';
import { ITool, IToolDefinition, IToolProvider, IToolResult } from '../core/tool';
import { IAgentContext } from '../agents/types';
import { IGenericHttpToolInput } from './tools/generic-http-tool';
/**
 * Options for configuring an `OpenAPIConnector` instance.
 */
export interface OpenAPIConnectorOptions extends BaseOpenAPIConnectorOptions {
    /**
     * The unique identifier for this connector instance, matching the ToolProviderSourceConfig.id.
     * This is used to look up provider-specific authentication overrides.
     */
    sourceId: string;
    /**
     * If set, this connector instance specializes in operations associated with this tag.
     * Operations will be filtered accordingly, and the GenericHttpApiTool might not be added.
     */
    tagFilter?: string;
    /**
     * If true and no tagFilter is provided, the GenericHttpApiTool will be added to the list of tools.
     * @default true
     */
    includeGenericToolIfNoTagFilter?: boolean;
}
/**
 * Represents a single API operation exposed as an ITool.
 * This class is responsible for creating a tool definition from an OpenAPI operation
 * and for executing the operation when the tool is called.
 */
export declare class OpenAPIOperationTool implements ITool<Record<string, any>, any> {
    operation: ConnectorOperation;
    private specParser;
    private connector;
    private definition;
    constructor(operation: ConnectorOperation, specParser: OpenAPISpecParser, connector: OpenAPIConnector);
    private createDefinition;
    getDefinition(): IToolDefinition<Record<string, any>, any>;
    execute(input: Record<string, any>): Promise<IToolResult<any>>;
    getOpenAPISpec(): Promise<OpenAPISpec | undefined>;
}
/**
 * The OpenAPIConnector class loads an OpenAPI spec, parses it, and provides methods
 * to execute API operations. It implements IToolProvider to expose these operations
 * (and potentially a generic HTTP tool) as ITool instances.
 */
export declare class OpenAPIConnector implements IToolProvider {
    private spec?;
    private specParser?;
    private authentication;
    private businessContextText?;
    private tagFilter?;
    private includeGenericTool;
    private sourceId;
    private _isInitialized;
    private initializationPromise;
    private providedTools;
    constructor(options: OpenAPIConnectorOptions);
    private _initialize;
    private generateTools;
    ensureInitialized(): Promise<void>;
    private assertInitialized;
    isInitialized(): boolean;
    getFullSpec(): OpenAPISpec;
    getSpecParser(): OpenAPISpecParser;
    getBaseUrl(): string;
    setAuthentication(auth: ConnectorAuthentication): void;
    getTools(): Promise<ITool[]>;
    getTool(toolName: string): Promise<ITool | undefined>;
    /** @internal */
    executeSpecificOperationInternal(sanitizedToolName: string, args: Record<string, any>, agentContext?: IAgentContext): Promise<IToolResult<any>>;
    /** @internal */
    executeGenericOperationInternal(args: IGenericHttpToolInput, agentContext?: IAgentContext): Promise<IToolResult<any>>;
    private applyAuthentication;
    private makeApiCall;
}
