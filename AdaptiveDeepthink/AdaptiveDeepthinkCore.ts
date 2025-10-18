/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Adaptive Deepthink Core - Agentic mode with Langchain conversation history
 * Uses exported Deepthink agents as tools
 */

import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import {
    generateStrategiesAgent,
    generateHypothesesAgent,
    testHypothesesAgent,
    executeStrategiesAgent,
    solutionCritiqueAgent,
    correctedSolutionsAgent,
    selectBestSolutionAgent,
    AgentExecutionContext
} from '../Deepthink/DeepthinkAgents';

// Tool call types for Adaptive Deepthink
export type AdaptiveDeepthinkToolCall =
    | { type: 'GenerateStrategies'; numStrategies: number; specialContext?: string }
    | { type: 'GenerateHypotheses'; numHypotheses: number; specialContext?: string }
    | { type: 'TestHypotheses'; hypothesisIds: string[]; specialContext?: string }
    | { type: 'ExecuteStrategies'; executions: Array<{ strategyId: string; hypothesisIds: string[] }>; specialContext?: string }
    | { type: 'SolutionCritique'; executionIds: string[]; specialContext?: string }
    | { type: 'CorrectedSolutions'; executionIds: string[] }
    | { type: 'SelectBestSolution'; solutionIds: string[] };

// State management
export interface AdaptiveDeepthinkState {
    id: string;
    question: string;
    status: 'idle' | 'processing' | 'completed' | 'error';
    error?: string;
    
    // Data stores with unique IDs
    strategies: Map<string, { text: string }>;
    hypotheses: Map<string, { text: string }>;
    hypothesisTestings: Map<string, { hypothesis: string; testing: string }>;
    executions: Map<string, { strategy: string; execution: string }>;
    critiques: Map<string, { critique: string }>;
    correctedSolutions: Map<string, { strategy: string; correctedSolution: string }>;
    
    // Final result
    selectedSolution?: string;
}

/**
 * Conversation manager for Adaptive Deepthink
 */
export class AdaptiveDeepthinkConversationManager {
    private chatHistory: ChatMessageHistory;
    private systemPrompt: string;
    private question: string;

    constructor(question: string, systemPrompt: string) {
        this.question = question;
        this.systemPrompt = systemPrompt;
        this.chatHistory = new ChatMessageHistory();
    }

    async addAgentMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new AIMessage(content));
    }

    async addSystemMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new SystemMessage(content));
    }

    async getConversationHistory(): Promise<string> {
        const messages = await this.chatHistory.getMessages();
        const formattedMessages: string[] = [];

        for (const msg of messages) {
            if (msg instanceof SystemMessage) {
                formattedMessages.push(`[System]: ${msg.content}`);
            } else if (msg instanceof AIMessage) {
                formattedMessages.push(`${msg.content}`);
            }
        }

        return formattedMessages.join('\n\n');
    }

    async buildPrompt(): Promise<string> {
        const history = await this.getConversationHistory();
        
        if (!history || history.trim().length === 0) {
            return `Core Challenge: ${this.question}`;
        }
        
        return history;
    }

    getSystemPrompt(): string {
        return this.systemPrompt;
    }

    async clearHistory(): Promise<void> {
        await this.chatHistory.clear();
    }
}

/**
 * Parse agent response to extract tool calls
 */
export function parseAdaptiveDeepthinkResponse(response: string): {
    narrative: string;
    toolCalls: AdaptiveDeepthinkToolCall[];
} {
    const toolCalls: AdaptiveDeepthinkToolCall[] = [];
    let narrative = response;

    // Parse GenerateStrategies
    const stratRegex = /\[TOOL:GenerateStrategies\((\d+)(?:,\s*"([^"]*)")?\s*\)\s*\]/g;
    let match;
    while ((match = stratRegex.exec(response)) !== null) {
        toolCalls.push({
            type: 'GenerateStrategies',
            numStrategies: parseInt(match[1]),
            specialContext: match[2] || undefined
        });
        narrative = narrative.replace(match[0], '');
    }

    // Parse GenerateHypotheses
    const hypRegex = /\[TOOL:GenerateHypotheses\((\d+)(?:,\s*"([^"]*)")?\s*\)\s*\]/g;
    while ((match = hypRegex.exec(response)) !== null) {
        toolCalls.push({
            type: 'GenerateHypotheses',
            numHypotheses: parseInt(match[1]),
            specialContext: match[2] || undefined
        });
        narrative = narrative.replace(match[0], '');
    }

    // Parse TestHypotheses
    const testHypRegex = /\[TOOL:TestHypotheses\(\[(.*?)\](?:,\s*"([^"]*)")?\s*\)\s*\]/g;
    while ((match = testHypRegex.exec(response)) !== null) {
        const ids = match[1].split(',').map(id => id.trim().replace(/['"]/g, ''));
        toolCalls.push({
            type: 'TestHypotheses',
            hypothesisIds: ids,
            specialContext: match[2] || undefined
        });
        narrative = narrative.replace(match[0], '');
    }

    // Parse ExecuteStrategies
    const execStratRegex = /\[TOOL:ExecuteStrategies\(\[(.*?)\](?:,\s*"([^"]*)")?\s*\)\s*\]/g;
    while ((match = execStratRegex.exec(response)) !== null) {
        try {
            const execsJson = match[1];
            const parsed = JSON.parse(`[${execsJson}]`);
            toolCalls.push({
                type: 'ExecuteStrategies',
                executions: parsed,
                specialContext: match[2] || undefined
            });
        } catch (e) {
            // Skip malformed execution
        }
        narrative = narrative.replace(match[0], '');
    }

    // Parse SolutionCritique
    const critiqueRegex = /\[TOOL:SolutionCritique\(\[(.*?)\](?:,\s*"([^"]*)")?\s*\)\s*\]/g;
    while ((match = critiqueRegex.exec(response)) !== null) {
        const ids = match[1].split(',').map(id => id.trim().replace(/['"]/g, ''));
        toolCalls.push({
            type: 'SolutionCritique',
            executionIds: ids,
            specialContext: match[2] || undefined
        });
        narrative = narrative.replace(match[0], '');
    }

    // Parse CorrectedSolutions
    const correctedRegex = /\[TOOL:CorrectedSolutions\(\[(.*?)\]\s*\)\s*\]/g;
    while ((match = correctedRegex.exec(response)) !== null) {
        const ids = match[1].split(',').map(id => id.trim().replace(/['"]/g, ''));
        toolCalls.push({
            type: 'CorrectedSolutions',
            executionIds: ids
        });
        narrative = narrative.replace(match[0], '');
    }

    // Parse SelectBestSolution
    const selectRegex = /\[TOOL:SelectBestSolution\(\[(.*?)\]\s*\)\s*\]/g;
    while ((match = selectRegex.exec(response)) !== null) {
        const ids = match[1].split(',').map(id => id.trim().replace(/['"]/g, ''));
        toolCalls.push({
            type: 'SelectBestSolution',
            solutionIds: ids
        });
        narrative = narrative.replace(match[0], '');
    }

    return {
        narrative: narrative.trim(),
        toolCalls
    };
}

/**
 * Execute a tool call
 */
export async function executeAdaptiveDeepthinkTool(
    toolCall: AdaptiveDeepthinkToolCall,
    state: AdaptiveDeepthinkState,
    context: AgentExecutionContext,
    deepthinkPrompts: any,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<string> {
    try {
        switch (toolCall.type) {
            case 'GenerateStrategies': {
                const response = await generateStrategiesAgent(
                    state.question,
                    toolCall.numStrategies,
                    toolCall.specialContext || '',
                    deepthinkPrompts.sys_deepthink_initialStrategy,
                    deepthinkPrompts.user_deepthink_initialStrategy,
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                let result = '<Strategies Generated>\n';
                response.data.strategies.forEach((strat: string, idx: number) => {
                    const id = `strategy-${Date.now()}-${idx}`;
                    state.strategies.set(id, { text: strat });
                    result += `<Strategy ID: ${id}>\n${strat}\n</Strategy ID: ${id}>\n\n`;
                });
                result += '</Strategies Generated>';

                return result;
            }

            case 'GenerateHypotheses': {
                const response = await generateHypothesesAgent(
                    state.question,
                    toolCall.numHypotheses,
                    toolCall.specialContext || '',
                    deepthinkPrompts.sys_deepthink_hypothesisGeneration,
                    deepthinkPrompts.user_deepthink_hypothesisGeneration,
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                let result = '<Hypotheses Generated>\n';
                response.data.hypotheses.forEach((hyp: string, idx: number) => {
                    const id = `hypothesis-${Date.now()}-${idx}`;
                    state.hypotheses.set(id, { text: hyp });
                    result += `<Hypothesis ID: ${id}>\n${hyp}\n</Hypothesis ID: ${id}>\n\n`;
                });
                result += '</Hypotheses Generated>';

                return result;
            }

            case 'TestHypotheses': {
                const response = await testHypothesesAgent(
                    state.question,
                    toolCall.hypothesisIds,
                    state.hypotheses,
                    toolCall.specialContext || '',
                    deepthinkPrompts.sys_deepthink_hypothesisTester,
                    deepthinkPrompts.user_deepthink_hypothesisTester,
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                let result = '<Hypothesis Testing Results>\n';
                response.data.results.forEach((res: any) => {
                    if (res.success) {
                        state.hypothesisTestings.set(res.id, {
                            hypothesis: res.hypothesis,
                            testing: res.testing
                        });
                        result += `<${res.id}>\n`;
                        result += `<Actual Hypothesis>${res.hypothesis}</Actual Hypothesis>\n`;
                        result += `<Hypothesis Testing>${res.testing}</Hypothesis Testing>\n`;
                        result += `</${res.id}>\n\n`;
                    }
                });
                result += '</Hypothesis Testing Results>';

                return result;
            }

            case 'ExecuteStrategies': {
                const response = await executeStrategiesAgent(
                    state.question,
                    toolCall.executions,
                    state.strategies,
                    state.hypothesisTestings,
                    toolCall.specialContext || '',
                    deepthinkPrompts.sys_deepthink_solutionAttempt,
                    deepthinkPrompts.user_deepthink_solutionAttempt,
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                let result = '<Strategy Executions>\n';
                response.data.results.forEach((res: any) => {
                    if (res.success) {
                        const execId = `execution-${res.id}`;
                        state.executions.set(execId, {
                            strategy: res.strategy,
                            execution: res.execution
                        });
                        result += `<Execution ID: ${execId}>\n${res.execution}\n</Execution ID: ${execId}>\n\n`;
                    }
                });
                result += '</Strategy Executions>';

                return result;
            }

            case 'SolutionCritique': {
                const response = await solutionCritiqueAgent(
                    state.question,
                    toolCall.executionIds,
                    state.executions,
                    toolCall.specialContext || '',
                    deepthinkPrompts.sys_deepthink_solutionCritique,
                    deepthinkPrompts.user_deepthink_solutionCritique,
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                let result = '<Solution Critiques>\n';
                response.data.results.forEach((res: any) => {
                    if (res.success) {
                        state.critiques.set(res.id, { critique: res.critique });
                        result += `<${res.id}: Critique>\n${res.critique}\n</${res.id}: Critique>\n\n`;
                    }
                });
                result += '</Solution Critiques>';

                return result;
            }

            case 'CorrectedSolutions': {
                const response = await correctedSolutionsAgent(
                    state.question,
                    toolCall.executionIds,
                    state.executions,
                    state.critiques,
                    deepthinkPrompts.sys_deepthink_selfImprovement,
                    deepthinkPrompts.user_deepthink_selfImprovement,
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                let result = '<Corrected Solutions>\n';
                response.data.results.forEach((res: any) => {
                    if (res.success) {
                        const correctedId = `${res.id}:Corrected`;
                        const originalExec = state.executions.get(res.id);
                        if (originalExec) {
                            state.correctedSolutions.set(correctedId, {
                                strategy: originalExec.strategy,
                                correctedSolution: res.correctedSolution
                            });
                            result += `<${correctedId}>\n${res.correctedSolution}\n</${correctedId}>\n\n`;
                        }
                    }
                });
                result += '</Corrected Solutions>';

                return result;
            }

            case 'SelectBestSolution': {
                const response = await selectBestSolutionAgent(
                    state.question,
                    toolCall.solutionIds,
                    state.correctedSolutions,
                    deepthinkPrompts.sys_deepthink_finalJudge,
                    'Evaluate all provided solutions and select the best one. Provide your reasoning and the selected solution.\n\nCore Challenge: {{originalProblemText}}\n\n{{allSolutions}}',
                    context,
                    imageBase64,
                    imageMimeType
                );

                if (!response.success || !response.data) {
                    return `[ERROR: ${response.error}]`;
                }

                state.selectedSolution = response.data.selection;
                return `<Best Solution Selected>\n${response.data.selection}\n</Best Solution Selected>`;
            }

            default:
                return '[ERROR: Unknown tool type]';
        }
    } catch (error) {
        return `[ERROR: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
}

/**
 * Create initial state
 */
export function createAdaptiveDeepthinkState(question: string): AdaptiveDeepthinkState {
    return {
        id: `adaptive-deepthink-${Date.now()}`,
        question,
        status: 'idle',
        strategies: new Map(),
        hypotheses: new Map(),
        hypothesisTestings: new Map(),
        executions: new Map(),
        critiques: new Map(),
        correctedSolutions: new Map()
    };
}
