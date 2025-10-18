/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Exported Deepthink Agents for reuse in other modes
 * These agents are independent API calls without conversation history
 */

import { Part, GenerateContentResponse } from "@google/genai";

// Agent response interface
export interface AgentResponse {
    success: boolean;
    data?: any;
    error?: string;
    rawResponse?: string;
}

// Agent execution context
export interface AgentExecutionContext {
    callAI: (parts: Part[], temperature: number, modelToUse: string, systemInstruction?: string, isJson?: boolean, topP?: number) => Promise<GenerateContentResponse>;
    cleanOutputByType: (rawOutput: string, type?: string) => string;
    parseJsonSafe: (raw: string, context: string) => any;
    getSelectedTemperature: () => number;
    getSelectedModel: () => string;
    getSelectedTopP: () => number;
}

/**
 * Generate Strategies Agent
 * Generates N high-level strategic interpretations for a problem
 */
export async function generateStrategiesAgent(
    question: string,
    numStrategies: number,
    specialContext: string,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        const userPrompt = userPromptTemplate
            .replace('{{originalProblemText}}', question)
            .replace(/\$\{NUM_INITIAL_STRATEGIES_DEEPTHINK\}/g, numStrategies.toString());

        const finalUserPrompt = specialContext 
            ? `${userPrompt}\n\n<Special Context>\n${specialContext}\n</Special Context>`
            : userPrompt;

        const promptParts: Part[] = [{ text: finalUserPrompt }];
        if (imageBase64 && imageMimeType) {
            promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }

        const response = await context.callAI(
            promptParts,
            context.getSelectedTemperature(),
            context.getSelectedModel(),
            systemPrompt,
            true,
            context.getSelectedTopP()
        );

        const rawText = context.cleanOutputByType(response.text || '', 'json');
        const parsed = context.parseJsonSafe(rawText, 'GenerateStrategies');

        if (!parsed || !Array.isArray(parsed.strategies)) {
            return {
                success: false,
                error: 'Failed to parse strategies from response',
                rawResponse: rawText
            };
        }

        return {
            success: true,
            data: { strategies: parsed.strategies },
            rawResponse: rawText
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Generate Hypotheses Agent
 * Generates N hypotheses for testing
 */
export async function generateHypothesesAgent(
    question: string,
    numHypotheses: number,
    specialContext: string,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        const userPrompt = userPromptTemplate
            .replace('{{originalProblemText}}', question)
            .replace(/\$\{NUM_HYPOTHESES\}/g, numHypotheses.toString());

        const finalUserPrompt = specialContext 
            ? `${userPrompt}\n\n<Special Context>\n${specialContext}\n</Special Context>`
            : userPrompt;

        const promptParts: Part[] = [{ text: finalUserPrompt }];
        if (imageBase64 && imageMimeType) {
            promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }

        const response = await context.callAI(
            promptParts,
            context.getSelectedTemperature(),
            context.getSelectedModel(),
            systemPrompt,
            true,
            context.getSelectedTopP()
        );

        const rawText = context.cleanOutputByType(response.text || '', 'json');
        const parsed = context.parseJsonSafe(rawText, 'GenerateHypotheses');

        if (!parsed || !Array.isArray(parsed.hypotheses)) {
            return {
                success: false,
                error: 'Failed to parse hypotheses from response',
                rawResponse: rawText
            };
        }

        return {
            success: true,
            data: { hypotheses: parsed.hypotheses },
            rawResponse: rawText
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Test Hypotheses Agent
 * Tests multiple hypotheses in parallel
 */
export async function testHypothesesAgent(
    question: string,
    hypothesisIds: string[],
    hypothesesData: Map<string, { text: string }>,
    specialContext: string,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        const results = await Promise.all(
            hypothesisIds.map(async (id) => {
                const hypothesis = hypothesesData.get(id);
                if (!hypothesis) {
                    return { id, success: false, error: 'Hypothesis not found' };
                }

                const userPrompt = userPromptTemplate
                    .replace('{{originalProblemText}}', question)
                    .replace('{{hypothesisText}}', hypothesis.text);

                const finalUserPrompt = specialContext 
                    ? `${userPrompt}\n\n<Special Context>\n${specialContext}\n</Special Context>`
                    : userPrompt;

                const promptParts: Part[] = [{ text: finalUserPrompt }];
                if (imageBase64 && imageMimeType) {
                    promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
                }

                const response = await context.callAI(
                    promptParts,
                    context.getSelectedTemperature(),
                    context.getSelectedModel(),
                    systemPrompt,
                    false,
                    context.getSelectedTopP()
                );

                const testingResult = context.cleanOutputByType(response.text || '');

                return {
                    id,
                    success: true,
                    hypothesis: hypothesis.text,
                    testing: testingResult
                };
            })
        );

        return {
            success: true,
            data: { results }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Execute Strategies Agent
 * Executes multiple strategies in parallel with selected hypothesis testing results
 */
export async function executeStrategiesAgent(
    question: string,
    strategyExecutions: Array<{ strategyId: string; hypothesisIds: string[] }>,
    strategiesData: Map<string, { text: string }>,
    hypothesisTestingResults: Map<string, { hypothesis: string; testing: string }>,
    specialContext: string,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        const results = await Promise.all(
            strategyExecutions.map(async (exec) => {
                const strategy = strategiesData.get(exec.strategyId);
                if (!strategy) {
                    return { id: exec.strategyId, success: false, error: 'Strategy not found' };
                }

                // Build information packet for this execution
                let informationPacket = '<Full Information Packet>\n';
                exec.hypothesisIds.forEach((hypId, idx) => {
                    const hypResult = hypothesisTestingResults.get(hypId);
                    if (hypResult) {
                        informationPacket += `<Hypothesis ${idx + 1}>\n`;
                        informationPacket += `Hypothesis: ${hypResult.hypothesis}\n`;
                        informationPacket += `Hypothesis Testing: ${hypResult.testing}\n`;
                        informationPacket += `</Hypothesis ${idx + 1}>\n\n`;
                    }
                });
                informationPacket += '</Full Information Packet>';

                const userPrompt = userPromptTemplate
                    .replace('{{originalProblemText}}', question)
                    .replace('{{assignedStrategy}}', strategy.text)
                    .replace('{{knowledgePacket}}', informationPacket);

                const finalUserPrompt = specialContext 
                    ? `${userPrompt}\n\n<Special Context>\n${specialContext}\n</Special Context>`
                    : userPrompt;

                const promptParts: Part[] = [{ text: finalUserPrompt }];
                if (imageBase64 && imageMimeType) {
                    promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
                }

                const response = await context.callAI(
                    promptParts,
                    context.getSelectedTemperature(),
                    context.getSelectedModel(),
                    systemPrompt,
                    false,
                    context.getSelectedTopP()
                );

                const executionResult = context.cleanOutputByType(response.text || '');

                return {
                    id: exec.strategyId,
                    success: true,
                    strategy: strategy.text,
                    execution: executionResult
                };
            })
        );

        return {
            success: true,
            data: { results }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Solution Critique Agent
 * Critiques multiple executed solutions in parallel
 */
export async function solutionCritiqueAgent(
    question: string,
    executionIds: string[],
    executionsData: Map<string, { strategy: string; execution: string }>,
    specialContext: string,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        const results = await Promise.all(
            executionIds.map(async (id) => {
                const execution = executionsData.get(id);
                if (!execution) {
                    return { id, success: false, error: 'Execution not found' };
                }

                const userPrompt = userPromptTemplate
                    .replace('{{originalProblemText}}', question)
                    .replace('{{assignedStrategy}}', execution.strategy)
                    .replace('{{solutionAttempt}}', execution.execution);

                const finalUserPrompt = specialContext 
                    ? `${userPrompt}\n\n<Special Context>\n${specialContext}\n</Special Context>`
                    : userPrompt;

                const promptParts: Part[] = [{ text: finalUserPrompt }];
                if (imageBase64 && imageMimeType) {
                    promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
                }

                const response = await context.callAI(
                    promptParts,
                    context.getSelectedTemperature(),
                    context.getSelectedModel(),
                    systemPrompt,
                    false,
                    context.getSelectedTopP()
                );

                const critiqueResult = context.cleanOutputByType(response.text || '');

                return {
                    id,
                    success: true,
                    critique: critiqueResult
                };
            })
        );

        return {
            success: true,
            data: { results }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Corrected Solutions Agent
 * Generates corrected solutions based on critiques
 */
export async function correctedSolutionsAgent(
    question: string,
    executionIds: string[],
    executionsData: Map<string, { strategy: string; execution: string }>,
    critiquesData: Map<string, { critique: string }>,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        const results = await Promise.all(
            executionIds.map(async (id) => {
                const execution = executionsData.get(id);
                const critique = critiquesData.get(id);
                
                if (!execution || !critique) {
                    return { id, success: false, error: 'Execution or critique not found' };
                }

                const userPrompt = userPromptTemplate
                    .replace('{{originalProblemText}}', question)
                    .replace('{{assignedStrategy}}', execution.strategy)
                    .replace('{{solutionAttempt}}', execution.execution)
                    .replace('{{solutionCritique}}', critique.critique);

                const promptParts: Part[] = [{ text: userPrompt }];
                if (imageBase64 && imageMimeType) {
                    promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
                }

                const response = await context.callAI(
                    promptParts,
                    context.getSelectedTemperature(),
                    context.getSelectedModel(),
                    systemPrompt,
                    false,
                    context.getSelectedTopP()
                );

                const correctedResult = context.cleanOutputByType(response.text || '');

                return {
                    id,
                    success: true,
                    correctedSolution: correctedResult
                };
            })
        );

        return {
            success: true,
            data: { results }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Select Best Solution Agent
 * Evaluates and selects the best solution from corrected solutions
 */
export async function selectBestSolutionAgent(
    question: string,
    solutionIds: string[],
    solutionsData: Map<string, { strategy: string; correctedSolution: string }>,
    systemPrompt: string,
    userPromptTemplate: string,
    context: AgentExecutionContext,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<AgentResponse> {
    try {
        // Build all solutions for comparison
        let allSolutions = '';
        solutionIds.forEach((id, idx) => {
            const solution = solutionsData.get(id);
            if (solution) {
                allSolutions += `<Solution ${idx + 1} ID: ${id}>\n`;
                allSolutions += `Strategy: ${solution.strategy}\n\n`;
                allSolutions += `Corrected Solution:\n${solution.correctedSolution}\n`;
                allSolutions += `</Solution ${idx + 1}>\n\n`;
            }
        });

        const userPrompt = userPromptTemplate
            .replace('{{originalProblemText}}', question)
            .replace('{{allSolutions}}', allSolutions);

        const promptParts: Part[] = [{ text: userPrompt }];
        if (imageBase64 && imageMimeType) {
            promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }

        const response = await context.callAI(
            promptParts,
            context.getSelectedTemperature(),
            context.getSelectedModel(),
            systemPrompt,
            false,
            context.getSelectedTopP()
        );

        const selectionResult = context.cleanOutputByType(response.text || '');

        return {
            success: true,
            data: { selection: selectionResult },
            rawResponse: selectionResult
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
