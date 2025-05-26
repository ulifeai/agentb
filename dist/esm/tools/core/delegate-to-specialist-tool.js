// src/tools/core/delegate-to-specialist-tool.ts
import { BaseAgent } from '../../agents';
import { LLMResponseProcessor } from '../../agents/response-processor';
import { ToolExecutor } from '../../agents/tool-executor';
import { ContextManager } from '../../agents/context-manager';
import { generateToolsSystemPrompt } from '../../llm/prompt-builder';
import { ConfigurationError } from '../../core/errors';
import { v4 as uuidv4 } from 'uuid';
import { MemoryStorage } from '../../threads/storage/memory-storage';
export class DelegateToSpecialistTool {
    constructor(dependencies) {
        this.toolName = 'delegateToSpecialistAgent'; // Fixed name for this meta-tool
        this.dependencies = dependencies;
        if (!dependencies.getDefaultRunConfig) {
            throw new ConfigurationError('DelegateToSpecialistTool requires getDefaultRunConfig in dependencies.');
        }
    }
    async getDefinition() {
        const toolsets = await this.dependencies.toolsetOrchestrator.getToolsets();
        const toolsetChoices = toolsets.map((ts) => ({
            id: ts.id,
            name: ts.name,
            description: ts.description,
        }));
        let description = 'Delegates a specific sub-task to a specialist agent. Choose a specialist based on its capabilities. Clearly define the sub-task description for the specialist.';
        if (toolsetChoices.length > 0) {
            description +=
                "\nAvailable specialists (use their ID for 'specialistId'):\n" +
                    toolsetChoices
                        .map((ts) => `- ID: "${ts.id}", Name: "${ts.name}", Capabilities: "${ts.description}"`)
                        .join('\n');
        }
        else {
            description += '\nNo specialist agents (toolsets) are currently available.';
        }
        return {
            name: this.toolName,
            description,
            parameters: [
                {
                    name: 'specialistId',
                    type: 'string',
                    description: 'The ID of the specialist agent (Toolset ID) to delegate the task to.',
                    required: true,
                    schema: { type: 'string', enum: toolsetChoices.length > 0 ? toolsetChoices.map((ts) => ts.id) : undefined },
                },
                {
                    name: 'subTaskDescription',
                    type: 'string',
                    description: 'A clear, concise, and self-contained description of the sub-task for the specialist agent to perform. Include all necessary context from the main plan.',
                    required: true,
                    schema: { type: 'string' },
                },
                {
                    name: 'requiredOutputFormat',
                    type: 'string',
                    description: 'Optional. A description of the desired format for the specialist\'s output (e.g., "a JSON object with fields X and Y", "a concise summary text", "the full text of the generated file"). If not provided, the specialist will return its natural output.',
                    required: false,
                    schema: { type: 'string' },
                },
                // Consider adding 'originalUserInput' if sub-agents sometimes need broader context,
                // but subTaskDescription should ideally be self-contained.
            ],
        };
    }
    async execute(input, plannerAgentContext // Optional: context of the calling planner agent for logging/tracing
    ) {
        const { specialistId, subTaskDescription, requiredOutputFormat } = input;
        const { toolsetOrchestrator, llmClient, messageStorage, workerAgentImplementation, getDefaultRunConfig } = this.dependencies;
        const toolset = await toolsetOrchestrator.getToolset(specialistId);
        if (!toolset) {
            return { success: false, data: null, error: `Specialist (Toolset) with ID "${specialistId}" not found.` };
        }
        const plannerRunId = plannerAgentContext?.runId || 'planner';
        console.info(`[${plannerRunId} > DelegateTool] Delegating task to specialist "${specialistId}" (${toolset.name}). Sub-task: "${subTaskDescription.substring(0, 70)}..."`);
        // 1. Create a dedicated IToolProvider for the specialist agent
        const specialistToolProvider = {
            getTools: async () => toolset.tools,
            getTool: async (toolName) => {
                for (const t of toolset.tools) {
                    if ((await t.getDefinition()).name === toolName)
                        return t;
                }
                return undefined;
            },
            ensureInitialized: async () => Promise.resolve(), // Tools in toolset are assumed ready
        };
        // 2. Prepare AgentRunConfig for the specialist sub-agent
        const baseSubAgentConfig = getDefaultRunConfig();
        const specialistSystemPrompt = generateToolsSystemPrompt(toolset.name, toolset.description, await Promise.all(toolset.tools.map((t) => t.getDefinition())), toolset.metadata?.apiTitle
            ? { title: toolset.metadata.apiTitle, version: toolset.metadata.apiVersion || '1.0' }
            : undefined, toolset.metadata?.baseUrl, 
        // Optionally add the requiredOutputFormat to the specialist's system prompt
        requiredOutputFormat
            ? `\nIMPORTANT: Please structure your final response to adhere to the following format: ${requiredOutputFormat}`
            : undefined);
        const specialistAgentRunConfig = {
            ...baseSubAgentConfig, // Inherit defaults (like model, temp, etc.)
            model: baseSubAgentConfig.model, // Ensure model is set
            systemPrompt: specialistSystemPrompt,
            maxToolCallContinuations: Math.max(0, (baseSubAgentConfig.maxToolCallContinuations || 10) - 2), // Specialists might have fewer retries
            // Override other configs if specialists should behave differently
            responseProcessorConfig: baseSubAgentConfig.responseProcessorConfig,
            toolExecutorConfig: baseSubAgentConfig.toolExecutorConfig,
            contextManagerConfig: baseSubAgentConfig.contextManagerConfig,
        };
        // 3. Instantiate components for the specialist's context
        const specialistResponseProcessor = new LLMResponseProcessor(specialistAgentRunConfig.responseProcessorConfig);
        const specialistToolExecutor = new ToolExecutor(specialistToolProvider, specialistAgentRunConfig.toolExecutorConfig);
        // Each specialist run could use a new MemoryStorage for its messages to keep contexts isolated,
        // or a carefully scoped view into the main messageStorage if history needs to be shared/passed.
        // For true isolation and to avoid context pollution, a new MemoryStorage is safer for sub-tasks.
        const specialistStorage = new MemoryStorage();
        const specialistMessageStorage = specialistStorage; // Isolated message history for the sub-agent
        const specialistThreadStorage = specialistStorage;
        const specialistContextManager = new ContextManager(specialistMessageStorage, llmClient, specialistAgentRunConfig.contextManagerConfig);
        // 4. Create IAgentContext for the specialist sub-agent
        const subRunId = `subrun-${plannerRunId}-${specialistId.substring(0, 8)}-${uuidv4().substring(0, 4)}`;
        // Use a dedicated sub-thread ID for message isolation, or pass the main threadId if messages should be mixed (less clean).
        let subThreadId = `subthread-${subRunId}`;
        // It's important that the sub-agent has its own thread ID if its messages are persisted,
        // to avoid polluting the planner's main thread unless that's desired.
        // If not persisting sub-agent messages, threadId might not matter as much.
        try {
            const newSubThread = await specialistThreadStorage.createThread({
                title: `Sub-task for ${specialistId}: ${subTaskDescription.substring(0, 50)}...`,
                metadata: {
                    plannerRunId: plannerRunId,
                    plannerThreadId: plannerAgentContext?.threadId,
                    specialistId: specialistId,
                    parentToolCallId: plannerAgentContext?.runId
                }
            });
            subThreadId = newSubThread.id;
            console.info(`[${plannerRunId} > DelegateTool] Created isolated sub-thread ${subThreadId} for specialist ${specialistId}.`);
        }
        catch (error) {
            const errorMsg = `Failed to create isolated sub-thread ${subThreadId} for specialist ${specialistId}: ${error.message}`;
            console.error(`[${plannerRunId} > DelegateTool] ${errorMsg}`, error);
            return { success: false, data: null, error: errorMsg };
        }
        const specialistAgentContext = {
            runId: subRunId,
            threadId: subThreadId, // Using a sub-thread for isolation
            llmClient: llmClient,
            toolProvider: specialistToolProvider,
            messageStorage: specialistMessageStorage, // Using isolated storage
            responseProcessor: specialistResponseProcessor,
            toolExecutor: specialistToolExecutor,
            contextManager: specialistContextManager,
            runConfig: specialistAgentRunConfig,
        };
        // 5. Instantiate and run the specialist sub-agent
        const WorkerAgentClass = workerAgentImplementation || BaseAgent;
        const specialistAgent = new WorkerAgentClass();
        const initialMessagesForSpecialist = [{ role: 'user', content: subTaskDescription }];
        let finalSpecialistOutput = '';
        let specialistSuccess = false;
        let lastErrorMessage;
        let rawSubAgentEvents = []; // To capture all events for detailed logging if needed
        try {
            console.info(`[${plannerRunId} > DelegateTool] Starting specialist sub-agent run: ${subRunId} for specialist "${specialistId}"`);
            const eventGenerator = specialistAgent.run(specialistAgentContext, initialMessagesForSpecialist);
            for await (const event of eventGenerator) {
                rawSubAgentEvents.push(event); // Collect all events
                // console.debug(`[DelegateTool > Specialist:${specialistId} > Event:${event.type}]`, JSON.stringify(event.data).substring(0,100));
                if (event.type === 'thread.message.completed' && event.data.message.role === 'assistant') {
                    // For simplicity, we take the content of the last assistant message as the result.
                    // More sophisticated handling might look for specific output structures.
                    if (typeof event.data.message.content === 'string') {
                        finalSpecialistOutput = event.data.message.content;
                    }
                    else if (Array.isArray(event.data.message.content)) {
                        finalSpecialistOutput = event.data.message.content
                            .filter((part) => part.type === 'text')
                            .map((part) => part.text)
                            .join('\n');
                    }
                }
                if (event.type === 'thread.run.failed') {
                    specialistSuccess = false;
                    lastErrorMessage = event.data.error.message;
                    console.error(`[${plannerRunId} > DelegateTool > Specialist:${specialistId}] Sub-agent run ${subRunId} failed: ${lastErrorMessage}`);
                    break;
                }
                if (event.type === 'thread.run.completed') {
                    specialistSuccess = true;
                    console.info(`[${plannerRunId} > DelegateTool > Specialist:${specialistId}] Sub-agent run ${subRunId} completed.`);
                    break;
                }
            }
        }
        catch (e) {
            specialistSuccess = false;
            lastErrorMessage = e.message || 'Unknown critical error during sub-agent execution.';
            console.error(`[${plannerRunId} > DelegateTool > Specialist:${specialistId}] Critical error invoking sub-agent ${subRunId}: ${lastErrorMessage}`, e);
        }
        // If loop finished without specific completion/failure, infer from last known state.
        if (!lastErrorMessage && !specialistSuccess && rawSubAgentEvents.length > 0) {
            const lastEvent = rawSubAgentEvents[rawSubAgentEvents.length - 1];
            if (lastEvent.type === 'thread.run.requires_action') {
                specialistSuccess = false; // Didn't complete fully if it ended in requires_action
                lastErrorMessage = 'Specialist agent stopped requiring further action which was not handled internally.';
            }
            else if (finalSpecialistOutput) {
                // If there's some output, consider it a partial success or completed without explicit event
                specialistSuccess = true;
            }
            else {
                specialistSuccess = false;
                lastErrorMessage = 'Specialist agent did not complete successfully or provide clear output.';
            }
        }
        const resultMetadata = {
            subAgentRunId: subRunId,
            specialistId: specialistId,
            subTaskDescription: subTaskDescription,
            // Potentially a summary of key sub-agent actions if `rawSubAgentEvents` is processed
            _rawSubAgentEventsForDebugging: rawSubAgentEvents, // Maybe conditional for debug builds
        };
        if (specialistSuccess) {
            console.info(`[${plannerRunId} > DelegateTool] Specialist "${specialistId}" succeeded. Output preview: "${finalSpecialistOutput.substring(0, 100)}..."`);
            return {
                success: true,
                data: finalSpecialistOutput.trim() || 'Specialist completed its task.',
                metadata: {
                    ...resultMetadata,
                    subAgentStatus: 'completed', // Add status
                },
            };
        }
        else {
            console.error(`[${plannerRunId} > DelegateTool] Specialist "${specialistId}" failed. Last error: ${lastErrorMessage}`);
            return {
                success: false,
                data: finalSpecialistOutput.trim(), // Include any partial output
                error: `Specialist agent "${specialistId}" failed: ${lastErrorMessage || 'Unknown error'}`,
                metadata: {
                    ...resultMetadata,
                    subAgentStatus: 'failed', // Add status
                },
            };
        }
    }
}
//# sourceMappingURL=delegate-to-specialist-tool.js.map