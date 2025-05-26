/**
* @file BaseAgent - Provides a foundational class for creating agents.
* It outlines the main execution loop and uses an IAgentContext for dependencies,
* including LLM interaction, tool execution, message storage, and context management.
*/
import { IAgent, IAgentContext, AgentEvent } from './types';
import { LLMMessage } from '../llm/types';
/**
* BaseAgent provides a standard implementation of the IAgent interface.
* It orchestrates the interaction between the LLM, tools, and conversation history.
* Concrete agent types can extend this class or implement IAgent directly.
*/
export declare class BaseAgent implements IAgent {
    /**
    * Flag to indicate if a cancellation request has been received for the current run.
    * This is managed per `run` invocation.
    */
    private isCancelledThisRun;
    constructor();
    /**
    * Executes the main agent loop.
    * This involves preparing messages, calling the LLM, processing the response,
    * executing tools if requested, and managing the conversation state.
    *
    * @param agentContext The context providing all necessary services and configurations for this run.
    * @param initialTurnMessages Messages that initiate this turn of the agent's execution
    *                            (e.g., new user input, or tool results from a previous `requires_action` state).
    * @yields {AgentEvent} Events that describe the agent's progress and state changes.
    */
    run(agentContext: IAgentContext, initialTurnMessages: LLMMessage[]): AsyncGenerator<AgentEvent, void, undefined>;
    /**
    * Handles the submission of tool outputs when an agent run is paused in a 'requires_action' state.
    * This method prepares the tool results as LLMMessages and re-enters the main `run` loop.
    *
    * @param agentContext The context for the current agent run.
    * @param toolCallOutputs An array of tool outputs to be submitted.
    * @yields {AgentEvent} Events as the agent run continues.
    */
    submitToolOutputs(agentContext: IAgentContext, toolCallOutputs: Array<{
        tool_call_id: string;
        output: string;
        tool_name?: string;
    }>): AsyncGenerator<AgentEvent, void, undefined>;
    /**
    * Requests cancellation of the currently executing or next iteration of the agent run.
    * The cancellation is cooperative and takes effect at designated check points in the `run` loop.
    *
    * @param agentContext The context for the agent run to be cancelled.
    */
    cancelRun(agentContext: IAgentContext): Promise<void>;
    /**
    * Helper to create standardized AgentEvent objects.
    * Ensures `runId` and `threadId` from the call arguments are used,
    * not potentially from the `data` payload if it also contains them.
    */
    private createEventHelper;
}
