// src/llm/__tests__/prompt-builder.test.ts

import {
    generateToolsSystemPrompt,
    generateGenericHttpToolSystemPrompt,
    generateRouterSystemPrompt,
    GENERIC_HTTP_TOOL_NAME, // Import constants if used in assertions
    ROUTER_TOOL_NAME
  } from '../prompt-builder';
  import {
    mockApiInfo,
    mockBaseUrl,
    mockBusinessContext,
    mockToolDef1,
    mockToolDef2,
    mockToolDefNoParams,
    mockToolSet1,
    mockToolSet2,
    mockConnectorOp1,
    mockConnectorOp2,
  } from './mock-prompt-data';
  import { IToolDefinition, IToolSet } from '../../core/tool';
  
  
  describe('LLM Prompt Builder', () => {
    describe('generateToolsSystemPrompt', () => {
      it('should generate a prompt for a single tool with parameters', () => {
        const prompt = generateToolsSystemPrompt(
          'Weather Agent',
          'Provides weather information.',
          [mockToolDef1],
          mockApiInfo,
          mockBaseUrl,
          mockBusinessContext
        );
        expect(prompt).toContain('You are an AI assistant equipped with the "Weather Agent"');
        expect(prompt).toContain('Your Role: Provides weather information.');
        expect(prompt).toContain(`This toolset primarily interacts with an API titled "${mockApiInfo.title}" (version ${mockApiInfo.version})`);
        expect(prompt).toContain(`Operations are generally directed towards a base URL like: ${mockBaseUrl}`);
        expect(prompt).toContain(`Tool Name: "${mockToolDef1.name}"`);
        expect(prompt).toContain(mockToolDef1.description);
        expect(prompt).toContain(`Parameters (provide as a single JSON object argument to the tool):`);
        expect(prompt).toContain(`- "${mockToolDef1.parameters[0].name}" (type: ${mockToolDef1.parameters[0].type}, required)`);
        expect(prompt).toContain(`- "${mockToolDef1.parameters[1].name}" (type: ${mockToolDef1.parameters[1].type})`);
        expect(prompt).toContain(`Required parameters for this tool: ${mockToolDef1.parameters[0].name}`);
        expect(prompt).toContain('IMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT:');
        expect(prompt).toContain(mockBusinessContext);
        expect(prompt).toContain('Always focus on using your available tools to fulfill the user\'s request');
      });
  
      it('should generate a prompt for a tool with no parameters', () => {
        const prompt = generateToolsSystemPrompt('Time Agent', 'Tells time.', [mockToolDefNoParams]);
        expect(prompt).toContain(`Tool Name: "${mockToolDefNoParams.name}"`);
        expect(prompt).toContain('Parameters: This tool does not require any parameters.');
      });
  
      it('should handle multiple tools', () => {
        const prompt = generateToolsSystemPrompt('Utility Agent', 'General utilities.', [mockToolDef1, mockToolDefNoParams]);
        expect(prompt).toContain(`Tool Name: "${mockToolDef1.name}"`);
        expect(prompt).toContain(`Tool Name: "${mockToolDefNoParams.name}"`);
      });
  
      it('should generate a prompt if no tools are provided', () => {
        const prompt = generateToolsSystemPrompt('Empty Agent', 'No capabilities.', []);
        expect(prompt).toContain('No specific tools are currently assigned to you for this role.');
      });
  
      it('should generate correctly without optional apiInfo, baseUrl, or businessContextText', () => {
          const prompt = generateToolsSystemPrompt('Simple Toolset', 'Simple description', [mockToolDefNoParams]);
          expect(prompt).not.toContain('This toolset primarily interacts with an API titled');
          expect(prompt).not.toContain('Operations are generally directed towards a base URL like');
          expect(prompt).not.toContain('IMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT');
      });
    });
  
    describe('generateGenericHttpToolSystemPrompt', () => {
      it('should generate a prompt with API operations listed', () => {
        const prompt = generateGenericHttpToolSystemPrompt(
          [mockConnectorOp1, mockConnectorOp2],
          mockApiInfo,
          mockBaseUrl,
          mockBusinessContext
        );
        expect(prompt).toContain(`You are an AI assistant with access to the "${mockApiInfo.title}" API (version ${mockApiInfo.version})`);
        expect(prompt).toContain(`Base URL for API calls: ${mockBaseUrl}`);
        expect(prompt).toContain(`To interact with this API, you MUST use the "${GENERIC_HTTP_TOOL_NAME}" tool`);
        expect(prompt).toContain('This tool allows you to make HTTP requests by specifying:');
        expect(prompt).toContain('1.  "method": The HTTP method (e.g., "GET", "POST")');
        expect(prompt).toContain('2.  "path": The relative API endpoint path');
        expect(prompt).toContain('3.  "queryParams" (optional): An object for query parameters');
        expect(prompt).toContain('4.  "headers" (optional): An object for custom HTTP headers');
        expect(prompt).toContain('5.  "requestBody" (optional): The request payload');
        
        // Check for op1 details
        expect(prompt).toContain(`Operation: "${mockConnectorOp1.summary || mockConnectorOp1.operationId}" (Operation ID: ${mockConnectorOp1.operationId})`);
        expect(prompt).toContain(`HTTP Method: ${mockConnectorOp1.method}`);
        expect(prompt).toContain(`Relative Path: ${mockConnectorOp1.path}`);
        expect(prompt).toContain(`Path Parameters (to be substituted into the 'path' string for ${GENERIC_HTTP_TOOL_NAME}):`);
        expect(prompt).toContain(`- "${mockConnectorOp1.parameters[0].name}" (in: ${mockConnectorOp1.parameters[0].in}, type: ${mockConnectorOp1.parameters[0].schema.type}, required)`);
        
        // Check for op2 details
        expect(prompt).toContain(`Operation: "${mockConnectorOp2.summary || mockConnectorOp2.operationId}" (Operation ID: ${mockConnectorOp2.operationId})`);
        expect(prompt).toContain('Request Body (provide in the \'requestBody\' field for');
        expect(prompt).toContain('IMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT:');
        expect(prompt).toContain(mockBusinessContext);
      });
  
      it('should handle case with no operations', () => {
          const prompt = generateGenericHttpToolSystemPrompt([], mockApiInfo, mockBaseUrl);
          expect(prompt).toContain('No operations are defined in the provided API specification for you to call.');
      });
    });
  
    describe('generateRouterSystemPrompt', () => {
      it('should generate a router prompt with toolsets and their tools', async () => {
        const prompt = await generateRouterSystemPrompt(
          [mockToolSet1, mockToolSet2],
          mockApiInfo,
          mockBusinessContext
        );
  
        expect(prompt).toContain(`You are a master routing AI for an application that interacts with the "${mockApiInfo.title}" API (version ${mockApiInfo.version})`);
        expect(prompt).toContain(`delegate them to the most appropriate specialist Toolset using the "${ROUTER_TOOL_NAME}" tool`);
        expect(prompt).toContain(`The "${ROUTER_TOOL_NAME}" tool requires these arguments:`);
        expect(prompt).toContain('1.  "toolSetId": The unique ID of the specialist Toolset to delegate the task to');
        expect(prompt).toContain('2.  "toolName": The name of the specific tool within the chosen Toolset to execute');
        expect(prompt).toContain('3.  "toolParameters": An object containing the parameters required by the chosen \'toolName\'');
        
        // Check for toolset1 details
        expect(prompt).toContain(`Toolset ID: "${mockToolSet1.id}" (Use this for 'toolSetId')`);
        expect(prompt).toContain(`Toolset Name: "${mockToolSet1.name}"`);
        expect(prompt).toContain(mockToolSet1.description);
        expect(prompt).toContain(`Tools it provides (select one for 'toolName'):`);
        expect(prompt).toContain(`- Tool: "${mockToolDef1.name}"`);
        expect(prompt).toContain(mockToolDef1.description.substring(0,150));
        expect(prompt).toContain(`Parameters:`);
        expect(prompt).toContain(`- "${mockToolDef1.parameters[0].name}"`);
  
        // Check for toolset2 details
        expect(prompt).toContain(`Toolset ID: "${mockToolSet2.id}" (Use this for 'toolSetId')`);
        expect(prompt).toContain(`Tool: "${mockToolDef2.name}"`);
        expect(prompt).toContain(`Tool: "${mockToolDefNoParams.name}"`);
  
        // Check for delegation instructions
        expect(prompt).toContain(`To delegate effectively using the "${ROUTER_TOOL_NAME}" tool, follow these steps:`);
        expect(prompt).toContain('1.  Analyze the user\'s request to understand their core intent');
        expect(prompt).toContain('2.  Review the list of available specialist Toolsets and their descriptions');
        expect(prompt).toContain('3.  Examine the tools listed for the chosen Toolset');
        expect(prompt).toContain('4.  Determine the \'toolParameters\' required by that specific \'toolName\'');
        expect(prompt).toContain(`5.  Invoke the "${ROUTER_TOOL_NAME}" tool with \'toolSetId\', \'toolName\', and \'toolParameters\'`);
  
        expect(prompt).toContain('IMPORTANT USAGE GUIDELINES AND BUSINESS CONTEXT:');
        expect(prompt).toContain(mockBusinessContext);
      });
  
      it('should handle case with no toolsets', async () => {
          const prompt = await generateRouterSystemPrompt([], mockApiInfo);
          expect(prompt).toContain('No specialist Toolsets are currently available. Inform the user if the request cannot be processed.');
      });
  
      it('should handle toolset with no tools', async () => {
          const toolsetNoTools: IToolSet = { ...mockToolSet1, tools: [] };
          const prompt = await generateRouterSystemPrompt([toolsetNoTools], mockApiInfo);
          expect(prompt).toContain(`Toolset ID: "${toolsetNoTools.id}" (Use this for 'toolSetId')`);
          expect(prompt).toContain('Tools: No tools specified for this toolset.');
      });
    });
  });