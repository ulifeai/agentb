
import { AggregatedToolProvider } from '../../tools/core/aggregated-tool-provider';
import { ITool, IToolProvider, IToolDefinition, IToolResult } from '../../core/tool';

// Mock ITool implementation
class MockTool implements ITool {
  constructor(public name: string, public description: string = 'A mock tool') {}

  async getDefinition(): Promise<IToolDefinition> {
    return {
      name: this.name,
      description: this.description,
      parameters: [],
    };
  }

  async execute(input: any): Promise<IToolResult> {
    return { success: true, data: { message: `Tool ${this.name} executed with input: ${JSON.stringify(input)}` } };
  }
}

// Mock IToolProvider implementation
class MockToolProvider implements IToolProvider {
  constructor(public providerId: string, private tools: ITool[]) {}

  async getTools(): Promise<ITool[]> {
    return [...this.tools];
  }

  async getTool(toolName: string): Promise<ITool | undefined> {
    // Corrected find: needs to await getDefinition inside the callback, or iterate.
    // The original provided code: `return this.tools.find(async (tool) => (await tool.getDefinition()).name === toolName);`
    // has a problem: `Array.prototype.find` does not work with async predicates.
    // The predicate will return a Promise, which is truthy, so `find` would return the first element.
    // Iterating manually:
    for (const tool of this.tools) {
        if ((await tool.getDefinition()).name === toolName) {
            return tool;
        }
    }
    return undefined;
  }

  async ensureInitialized(): Promise<void> {
    // console.log(`MockToolProvider ${this.providerId} initialized`);
  }
}

describe('AggregatedToolProvider', () => {
  let tool1: ITool;
  let tool2: ITool;
  let tool3SameName: ITool; // Same name as tool1
  let tool4: ITool;

  let provider1: MockToolProvider;
  let provider2: MockToolProvider;

  beforeEach(async () => {
    tool1 = new MockTool('tool1', 'Tool one from provider one');
    tool2 = new MockTool('tool2', 'Tool two from provider one');
    tool3SameName = new MockTool('tool1', 'Tool one from provider two (duplicate name)');
    tool4 = new MockTool('tool4', 'Tool four from provider two');

    provider1 = new MockToolProvider('provider1', [tool1, tool2]);
    provider2 = new MockToolProvider('provider2', [tool3SameName, tool4]);
  });

  it('should correctly aggregate tools from multiple providers', async () => {
    const aggregatedProvider = new AggregatedToolProvider([provider1, provider2]);
    const tools = await aggregatedProvider.getTools();

    expect(tools).toHaveLength(3); // tool1 (from P1), tool2 (from P1), tool4 (from P2)
    
    const toolNames = await Promise.all(tools.map(async t => (await t.getDefinition()).name));
    expect(toolNames).toContain('tool1');
    expect(toolNames).toContain('tool2');
    expect(toolNames).toContain('tool4');
    // The name 'tool3SameName' is the variable name, but the tool's name is 'tool1'.
    // The test is that 'tool1' from provider2 (which is tool3SameName) is NOT chosen.
    // So, we check that the description of 'tool1' is from provider1.
    
    const retrievedTool1 = tools.find(t => toolNames[tools.indexOf(t)] === 'tool1');
    expect(await (await retrievedTool1!.getDefinition()).description).toBe('Tool one from provider one');
  });

  it('should return an empty array if no providers are given', async () => {
    const aggregatedProvider = new AggregatedToolProvider([]);
    const tools = await aggregatedProvider.getTools();
    expect(tools).toHaveLength(0);
  });
  
  it('should return an empty array if providers have no tools', async () => {
    const emptyProvider1 = new MockToolProvider('empty1', []);
    const emptyProvider2 = new MockToolProvider('empty2', []);
    const aggregatedProvider = new AggregatedToolProvider([emptyProvider1, emptyProvider2]);
    const tools = await aggregatedProvider.getTools();
    expect(tools).toHaveLength(0);
  });

  it('should retrieve a specific tool by name, prioritizing earlier providers', async () => {
    const aggregatedProvider = new AggregatedToolProvider([provider1, provider2]);

    const retrievedTool1 = await aggregatedProvider.getTool('tool1');
    expect(retrievedTool1).toBeDefined();
    expect(await (await retrievedTool1!.getDefinition()).description).toBe('Tool one from provider one');

    const retrievedTool2 = await aggregatedProvider.getTool('tool2');
    expect(retrievedTool2).toBeDefined();
    expect(await (await retrievedTool2!.getDefinition()).name).toBe('tool2');
    
    const retrievedTool4 = await aggregatedProvider.getTool('tool4');
    expect(retrievedTool4).toBeDefined();
    expect(await (await retrievedTool4!.getDefinition()).name).toBe('tool4');
  });

  it('should return undefined if a tool is not found', async () => {
    const aggregatedProvider = new AggregatedToolProvider([provider1, provider2]);
    const nonExistentTool = await aggregatedProvider.getTool('nonExistentTool');
    expect(nonExistentTool).toBeUndefined();
  });

  it('should call ensureInitialized on all sub-providers', async () => {
    const spyProvider1Init = jest.spyOn(provider1, 'ensureInitialized');
    const spyProvider2Init = jest.spyOn(provider2, 'ensureInitialized');

    const aggregatedProvider = new AggregatedToolProvider([provider1, provider2]);
    await aggregatedProvider.ensureInitialized!(); // Use non-null assertion as it's optional

    expect(spyProvider1Init).toHaveBeenCalledTimes(1);
    expect(spyProvider2Init).toHaveBeenCalledTimes(1);
  });
  
  it('should handle errors when a provider fails to fetch tools in getTools', async () => {
    const failingProvider = new MockToolProvider('failingProvider', []);
    jest.spyOn(failingProvider, 'getTools').mockRejectedValueOnce(new Error('Failed to fetch tools'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const aggregatedProvider = new AggregatedToolProvider([provider1, failingProvider, provider2]);
    const tools = await aggregatedProvider.getTools();

    expect(tools.length).toBeGreaterThanOrEqual(2); // Should still get tools from provider1 and provider2
    const toolNames = await Promise.all(tools.map(async (t: any) => (await t.getDefinition()).name));
    expect(toolNames).toContain('tool1'); // from provider1
    expect(toolNames).toContain('tool4'); // from provider2
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AggregatedToolProvider] Error fetching tools from a provider: Failed to fetch tools'),
        expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it('should handle errors when a provider fails to fetch a specific tool in getTool', async () => {
    const failingProvider = new MockToolProvider('failingProvider', [new MockTool('toolToFail')]);
    jest.spyOn(failingProvider, 'getTool').mockImplementation(async (toolName) => {
      if (toolName === 'toolToFail') {
        throw new Error('Failed to fetch toolToFail');
      }
      return undefined;
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const aggregatedProvider = new AggregatedToolProvider([failingProvider, provider1]);
    
    const result1 = await aggregatedProvider.getTool('toolToFail');
    // Expect undefined because the failingProvider is first and errors.
    // The current AggregatedToolProvider logs the error and continues, meaning it would then
    // check provider1. If toolToFail was ALSO in provider1, it would be found.
    // Since toolToFail is only in failingProvider, and that errors, it's correct that it's not found.
    expect(result1).toBeUndefined(); 
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AggregatedToolProvider] Error fetching tool "toolToFail" from a provider: Failed to fetch toolToFail'),
        expect.any(Error)
    );

    const result2 = await aggregatedProvider.getTool('tool1');
    expect(result2).toBeDefined(); // Should still get tool1 from provider1
    expect(await (await result2!.getDefinition()).name).toBe('tool1');
    
    consoleErrorSpy.mockRestore();
  });
});
