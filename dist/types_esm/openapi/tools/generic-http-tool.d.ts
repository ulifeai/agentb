import { ITool, IToolDefinition, IToolResult } from '../../core/tool';
import { OpenAPIConnector } from '../connector';
export declare const GENERIC_HTTP_TOOL_NAME = "genericHttpRequest";
/**
 * Input type for the GenericHttpApiTool.
 */
export interface IGenericHttpToolInput {
    method: string;
    path: string;
    queryParams?: Record<string, string | number | boolean | (string | number | boolean)[]>;
    headers?: Record<string, string>;
    requestBody?: any;
}
/**
 * Implements the ITool interface for making generic HTTP requests via an OpenAPIConnector.
 * This tool is typically added to an OpenAPIConnector instance when no specific tagFilter is applied,
 * allowing an LLM to make arbitrary calls to the API based on its documentation.
 */
export declare class GenericHttpApiTool implements ITool<IGenericHttpToolInput, any> {
    private connector;
    private toolDefinition;
    constructor(connector: OpenAPIConnector);
    private createDefinition;
    getDefinition(): IToolDefinition<IGenericHttpToolInput, any>;
    /**
     * Executes the generic HTTP request.
     * @param input Parameters for the generic HTTP call.
     * @returns A promise resolving to the API response as an IToolResult.
     */
    execute(input: IGenericHttpToolInput): Promise<IToolResult<any>>;
}
