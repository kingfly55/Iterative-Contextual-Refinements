/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Adaptive Deepthink - Main orchestration logic and state management
 */

import { AgenticMessage, SystemBlock } from '../Agentic/AgenticCore';
import {
    AdaptiveDeepthinkState,
    AdaptiveDeepthinkConversationManager,
    AdaptiveDeepthinkToolCall,
    parseAdaptiveDeepthinkResponse,
    executeAdaptiveDeepthinkTool,
    createAdaptiveDeepthinkState
} from './AdaptiveDeepthinkCore';
import { CustomizablePromptsAdaptiveDeepthink } from './AdaptiveDeepthinkPrompt';
import { AgentExecutionContext } from '../Deepthink/DeepthinkAgents';
import {
    callAI,
    getSelectedModel,
    getSelectedTemperature,
    getSelectedTopP
} from '../Routing';
import { updateControlsState } from '../UI/Controls';
import { globalState } from '../Core/State';
import type {
    DeepthinkPipelineState,
    DeepthinkMainStrategyData,
    DeepthinkSubStrategyData,
    DeepthinkHypothesisData
} from '../Deepthink/Deepthink';

export interface AdaptiveDeepthinkStoreState {
    id: string;
    coreState: AdaptiveDeepthinkState;
    conversationManager: AdaptiveDeepthinkConversationManager;
    messages: AgenticMessage[];
    isProcessing: boolean;
    isComplete: boolean;
    error?: string;
    deepthinkPipelineState: DeepthinkPipelineState;
    navigationState: {
        currentTab: string;
    };
}

let activeAdaptiveDeepthinkState: AdaptiveDeepthinkStoreState | null = null;
let abortController: AbortController | null = null;
const listeners = new Set<(state: AdaptiveDeepthinkStoreState | null) => void>();

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000;
const BACKOFF_FACTOR = 2;

export function subscribeToAdaptiveDeepthinkState(listener: (state: AdaptiveDeepthinkStoreState | null) => void) {
    listeners.add(listener);
    listener(activeAdaptiveDeepthinkState);
    return () => { listeners.delete(listener); };
}

export function notifyAdaptiveDeepthinkListeners() {
    if (activeAdaptiveDeepthinkState) {
        // Create shallow copy to trigger React re-render
        listeners.forEach(l => l({ ...activeAdaptiveDeepthinkState! }));
    } else {
        listeners.forEach(l => l(null));
    }
}

export function updateAdaptiveDeepthinkTab(tabId: string) {
    if (activeAdaptiveDeepthinkState) {
        activeAdaptiveDeepthinkState.navigationState.currentTab = tabId;
        activeAdaptiveDeepthinkState.deepthinkPipelineState.activeTabId = tabId;
        notifyAdaptiveDeepthinkListeners();
    }
}

export function updateAdaptiveDeepthinkStrategyTab(strategyIndex: number) {
    if (activeAdaptiveDeepthinkState) {
        activeAdaptiveDeepthinkState.deepthinkPipelineState.activeStrategyTab = strategyIndex;
        notifyAdaptiveDeepthinkListeners();
    }
}

function newMsgId(prefix: string = 'msg'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAgentNameFromToolType(toolType: string): string {
    const mapping: Record<string, string> = {
        'GenerateStrategies': 'Strategy Generation Agent',
        'GenerateHypotheses': 'Hypothesis Generation Agent',
        'TestHypotheses': 'Hypothesis Testing Agent',
        'ExecuteStrategies': 'Strategy Execution Agent',
        'SolutionCritique': 'Solution Critique Agent',
        'CorrectedSolutions': 'Solution Correction Agent',
        'SelectBestSolution': 'Final Judge Agent'
    };
    return mapping[toolType] || toolType;
}

function getAgentIconFromToolType(toolType: string): string {
    const mapping: Record<string, string> = {
        'GenerateStrategies': 'psychology',
        'GenerateHypotheses': 'science',
        'TestHypotheses': 'troubleshoot',
        'ExecuteStrategies': 'settings_suggest',
        'SolutionCritique': 'security',
        'CorrectedSolutions': 'auto_fix',
        'SelectBestSolution': 'flag'
    };
    return mapping[toolType] || 'smart_toy';
}

function formatToolCallDisplay(toolCall: AdaptiveDeepthinkToolCall): string {
    switch (toolCall.type) {
        case 'GenerateStrategies':
            return `GenerateStrategies(${toolCall.numStrategies})`;
        case 'GenerateHypotheses':
            return `GenerateHypotheses(${toolCall.numHypotheses})`;
        case 'TestHypotheses':
            return `TestHypotheses([${toolCall.hypothesisIds.length} hypotheses])`;
        case 'ExecuteStrategies':
            return `ExecuteStrategies([${toolCall.executions.length} strategies])`;
        case 'SolutionCritique':
            return `SolutionCritique([${toolCall.executionIds.length} solutions])`;
        case 'CorrectedSolutions':
            return `CorrectedSolutions([${toolCall.executionIds.length} solutions])`;
        case 'SelectBestSolution':
            return `SelectBestSolution([${toolCall.solutionIds.length} solutions])`;
        default:
            return (toolCall as any).type || 'Unknown Tool';
    }
}

interface ResponseSegment {
    kind: 'text' | 'tool';
    text?: string;
    tool?: {
        type: string;
        rawType: string;
    };
}

function parseIntoSegments(narrative: string, toolCalls: AdaptiveDeepthinkToolCall[]): ResponseSegment[] {
    const segments: ResponseSegment[] = [];
    if (narrative && narrative.trim()) {
        segments.push({ kind: 'text', text: narrative.trim() });
    }
    if (toolCalls.length > 0) {
        segments.push({
            kind: 'tool',
            tool: {
                type: formatToolCallDisplay(toolCalls[0]),
                rawType: toolCalls[0].type
            }
        });
    }
    return segments;
}

function createInitialDeepthinkPipelineState(question: string): DeepthinkPipelineState {
    return {
        id: `deepthink-embedded-${Date.now()}`,
        challenge: question,
        status: 'processing',
        activeTabId: 'strategic-solver',
        challengeText: '',
        activeStrategyTab: 0,
        initialStrategies: [],
        hypotheses: [],
        solutionCritiques: [],
        redTeamEvaluations: [],
        postQualityFilterAgents: [],
        structuredSolutionPoolAgents: [],
        strategicSolverComplete: false,
        hypothesisExplorerComplete: false,
        redTeamComplete: false,
        knowledgePacket: '',
        finalJudgingStatus: 'pending',
        isStopRequested: false,
        hypothesisGenStatus: 'pending',
        dissectedSynthesisStatus: 'pending',
        solutionCritiquesStatus: 'pending'
    };
}

function parseToolResultAndUpdateState(toolCall: AdaptiveDeepthinkToolCall, toolResult: string) {
    if (!activeAdaptiveDeepthinkState) return;
    const state = activeAdaptiveDeepthinkState.deepthinkPipelineState;

    switch (toolCall.type) {
        case 'GenerateStrategies': {
            state.initialStrategies = [];
            const strategyMatches = toolResult.matchAll(/<Strategy ID: (strategy-\d+-\d+)>\s*([\s\S]*?)\s*<\/Strategy ID: \1>/g);
            let idx = 0;
            for (const match of strategyMatches) {
                const strategyId = match[1];
                const strategyText = match[2].trim();
                const strategy: DeepthinkMainStrategyData = {
                    id: strategyId,
                    strategyText,
                    subStrategies: [],
                    status: 'completed',
                    isDetailsOpen: false,
                    strategyFormat: 'markdown'
                };
                state.initialStrategies.push(strategy);
                idx++;
            }
            break;
        }
        case 'GenerateHypotheses': {
            state.hypotheses = [];
            const hypothesisMatches = toolResult.matchAll(/<Hypothesis ID: (hypothesis-\d+-\d+)>\s*([\s\S]*?)\s*<\/Hypothesis ID: \1>/g);
            for (const match of hypothesisMatches) {
                const hypothesisId = match[1];
                const hypothesisText = match[2].trim();
                const hypothesis: DeepthinkHypothesisData = {
                    id: hypothesisId,
                    hypothesisText,
                    testerStatus: 'pending',
                    isDetailsOpen: false
                };
                state.hypotheses.push(hypothesis);
            }
            state.hypothesisGenStatus = 'completed';
            break;
        }
        case 'TestHypotheses': {
            const testMatches = toolResult.matchAll(/<(hypothesis-\d+-\d+)>\s*<Actual Hypothesis>([\s\S]*?)<\/Actual Hypothesis>\s*<Hypothesis Testing>([\s\S]*?)<\/Hypothesis Testing>\s*<\/\1>/g);
            for (const match of testMatches) {
                const hypothesisId = match[1];
                const testing = match[3].trim();
                const hypothesis = state.hypotheses.find(h => h.id === hypothesisId);
                if (hypothesis) {
                    hypothesis.testerAttempt = testing;
                    hypothesis.testerStatus = 'completed';
                }
            }
            if (state.hypotheses.length > 0) {
                let knowledgePacket = '<Full Information Packet>\n\n';
                state.hypotheses.forEach((hyp, idx) => {
                    if (hyp.testerAttempt) {
                        knowledgePacket += `<Hypothesis ${idx + 1}>\nHypothesis: ${hyp.hypothesisText}\n\nHypothesis Testing: ${hyp.testerAttempt}\n</Hypothesis ${idx + 1}>\n\n`;
                    }
                });
                knowledgePacket += '</Full Information Packet>';
                state.knowledgePacket = knowledgePacket;
                state.hypothesisExplorerComplete = true;
            }
            break;
        }
        case 'ExecuteStrategies': {
            state.initialStrategies.forEach(strategy => {
                strategy.subStrategies.forEach(sub => {
                    sub.solutionAttempt = undefined;
                    sub.refinedSolution = undefined;
                });
            });
            const executionMatches = toolResult.matchAll(/<Execution ID: (execution-strategy-\d+-\d+)>\s*([\s\S]*?)\s*<\/Execution ID: \1>/g);
            for (const match of executionMatches) {
                const executionId = match[1];
                const execution = match[2].trim();
                const strategyIdMatch = executionId.match(/execution-(strategy-\d+-\d+)/);
                if (strategyIdMatch) {
                    const strategyId = strategyIdMatch[1];
                    const strategy = state.initialStrategies.find(s => s.id === strategyId);
                    if (strategy) {
                        let subStrategy = strategy.subStrategies[0];
                        if (!subStrategy) {
                            subStrategy = {
                                id: `${strategyId}-sub1`,
                                subStrategyText: strategy.strategyText,
                                status: 'completed',
                                isDetailsOpen: false,
                                subStrategyFormat: 'markdown'
                            } as DeepthinkSubStrategyData;
                            strategy.subStrategies.push(subStrategy);
                        }
                        subStrategy.solutionAttempt = execution;
                        subStrategy.status = 'completed';
                    }
                }
            }
            break;
        }
        case 'SolutionCritique': {
            const critiqueContent = toolResult.replace(/<Solution Critiques>|<\/Solution Critiques>/g, '').trim();
            if (critiqueContent) {
                state.dissectedObservationsSynthesis = critiqueContent;
                state.dissectedSynthesisStatus = 'completed';
                state.solutionCritiquesStatus = 'completed';
                state.solutionCritiques = [];
                state.initialStrategies.forEach((strategy) => {
                    strategy.subStrategies.forEach((subStrategy) => {
                        if (subStrategy.solutionAttempt) {
                            state.solutionCritiques.push({
                                id: `critique-${subStrategy.id}`,
                                subStrategyId: subStrategy.id,
                                mainStrategyId: strategy.id,
                                critiqueResponse: critiqueContent,
                                status: 'completed'
                            });
                        }
                    });
                });
            }
            break;
        }
        case 'CorrectedSolutions': {
            state.initialStrategies.forEach(strategy => {
                strategy.subStrategies.forEach(sub => {
                    sub.refinedSolution = undefined;
                    sub.selfImprovementStatus = undefined;
                });
            });
            const correctedMatches = toolResult.matchAll(/<(execution-strategy-\d+-\d+):Corrected>\s*([\s\S]*?)\s*<\/\1:Corrected>/g);
            for (const match of correctedMatches) {
                const executionId = match[1];
                const correctedSolution = match[2].trim();
                const strategyIdMatch = executionId.match(/execution-(strategy-\d+-\d+)/);
                if (strategyIdMatch) {
                    const strategyId = strategyIdMatch[1];
                    const strategy = state.initialStrategies.find(s => s.id === strategyId);
                    if (strategy && strategy.subStrategies[0]) {
                        strategy.subStrategies[0].refinedSolution = correctedSolution;
                        strategy.subStrategies[0].selfImprovementStatus = 'completed';
                    }
                }
            }
            break;
        }
        case 'SelectBestSolution': {
            const solutionMatch = toolResult.match(/<Best Solution Selected>\s*([\s\S]*?)\s*<\/Best Solution Selected>/);
            if (solutionMatch) {
                let selectedText = solutionMatch[1].trim();
                selectedText = selectedText.replace(/<Solution \d+ ID:.*?>/g, '');
                selectedText = selectedText.replace(/<\/Solution \d+>/g, '');
                selectedText = selectedText.replace(/Strategy:.*?\n\n/g, '');
                selectedText = selectedText.replace(/Corrected Solution:/g, '');
                selectedText = selectedText.trim();

                state.finalJudgedBestSolution = selectedText;
                state.finalJudgingStatus = 'completed';
                state.finalJudgingResponseText = selectedText;
                state.status = 'completed';

                const strategyIdMatch = toolResult.match(/strategy-(\d+-\d+)/);
                if (strategyIdMatch) {
                    state.finalJudgedBestStrategyId = strategyIdMatch[0];
                }
            }
            break;
        }
    }
}

export async function startAdaptiveDeepthinkProcess(
    question: string,
    customPrompts: CustomizablePromptsAdaptiveDeepthink,
    images: Array<{ base64: string, mimeType: string }> = []
) {
    if (activeAdaptiveDeepthinkState) {
        stopAdaptiveDeepthinkProcess();
    }
    if (!question || globalState.isAdaptiveDeepthinkRunning) return;

    const coreState: AdaptiveDeepthinkState = createAdaptiveDeepthinkState(question);
    const conversationManager = new AdaptiveDeepthinkConversationManager(
        question,
        customPrompts.sys_adaptiveDeepthink_main
    );

    activeAdaptiveDeepthinkState = {
        id: coreState.id,
        coreState,
        conversationManager,
        messages: [],
        isProcessing: true,
        isComplete: false,
        deepthinkPipelineState: createInitialDeepthinkPipelineState(question),
        navigationState: {
            currentTab: 'strategic-solver'
        }
    };

    globalState.isAdaptiveDeepthinkRunning = true;
    updateControlsState();
    abortController = new AbortController();

    notifyAdaptiveDeepthinkListeners();

    startAdaptiveDeepthinkSession(question, customPrompts, images).catch(err => {
        console.error("Adaptive Deepthink Error:", err);
    });
}

async function startAdaptiveDeepthinkSession(
    _question: string,
    customPrompts: CustomizablePromptsAdaptiveDeepthink,
    images: Array<{ base64: string, mimeType: string }> = []
) {
    if (!activeAdaptiveDeepthinkState || !globalState.isAdaptiveDeepthinkRunning) return;

    const deepthinkPrompts = {
        sys_deepthink_initialStrategy: customPrompts.sys_adaptiveDeepthink_strategyGeneration,
        user_deepthink_initialStrategy: '',
        sys_deepthink_hypothesisGeneration: customPrompts.sys_adaptiveDeepthink_hypothesisGeneration,
        user_deepthink_hypothesisGeneration: '',
        sys_deepthink_hypothesisTester: customPrompts.sys_adaptiveDeepthink_hypothesisTesting,
        user_deepthink_hypothesisTester: '',
        sys_deepthink_solutionAttempt: customPrompts.sys_adaptiveDeepthink_execution,
        user_deepthink_solutionAttempt: '',
        sys_deepthink_solutionCritique: customPrompts.sys_adaptiveDeepthink_solutionCritique,
        user_deepthink_solutionCritique: '',
        sys_deepthink_selfImprovement: customPrompts.sys_adaptiveDeepthink_corrector,
        user_deepthink_selfImprovement: '',
        sys_deepthink_finalJudge: customPrompts.sys_adaptiveDeepthink_finalJudge
    };

    const agentContext: AgentExecutionContext = {
        callAI: callAI as any,
        cleanOutputByType: (raw: string) => raw,
        parseJsonSafe: (raw: string) => {
            try { return JSON.parse(raw); } catch { return null; }
        },
        getSelectedTemperature,
        getSelectedModel,
        getSelectedTopP
    };

    while (globalState.isAdaptiveDeepthinkRunning && !activeAdaptiveDeepthinkState.isComplete) {
        try {
            activeAdaptiveDeepthinkState.isProcessing = true;
            notifyAdaptiveDeepthinkListeners();

            const placeholderIndex = activeAdaptiveDeepthinkState.messages.length;
            activeAdaptiveDeepthinkState.messages = [...activeAdaptiveDeepthinkState.messages, {
                id: newMsgId('agent'),
                role: 'agent' as const,
                content: '',
                timestamp: Date.now(),
                status: 'processing' as const
            }];
            notifyAdaptiveDeepthinkListeners();

            const prompt = await activeAdaptiveDeepthinkState.conversationManager.buildPrompt();
            const systemPrompt = activeAdaptiveDeepthinkState.conversationManager.getSystemPrompt();

            const modelName = getSelectedModel();
            const temperature = getSelectedTemperature();
            const topP = getSelectedTopP();

            let responseText = '';
            let lastError: Error | null = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (abortController?.signal.aborted) {
                    throw new Error('Process stopped by user');
                }

                try {
                    if (attempt > 0) {
                        const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                    const promptParts: any[] = [{ text: prompt }];
                    images.slice().reverse().forEach(img => {
                        promptParts.unshift({
                            inlineData: { mimeType: img.mimeType, data: img.base64 }
                        });
                    });

                    const response = await callAI(
                        promptParts,
                        temperature,
                        modelName,
                        systemPrompt,
                        false,
                        topP
                    );

                    responseText = response.text || '';
                    if (responseText) break;

                    throw new Error('Provider returned empty response');
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`Adaptive Deepthink AI call attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);
                    if (attempt === MAX_RETRIES) break;
                }
            }

            if (!responseText) {
                const errMsg = lastError
                    ? `AI call failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`
                    : 'Provider returned an empty response after all retries.';

                activeAdaptiveDeepthinkState.messages = [
                    ...activeAdaptiveDeepthinkState.messages.slice(0, placeholderIndex),
                    ...activeAdaptiveDeepthinkState.messages.slice(placeholderIndex + 1),
                    {
                        id: newMsgId('system'),
                        role: 'system',
                        content: errMsg,
                        timestamp: Date.now(),
                        status: 'error' as const,
                        blocks: [{ kind: 'error', message: errMsg } as SystemBlock]
                    }
                ];
                activeAdaptiveDeepthinkState.isProcessing = false;
                notifyAdaptiveDeepthinkListeners();
                continue;
            }

            await activeAdaptiveDeepthinkState.conversationManager.addAgentMessage(responseText);

            const parsed = parseAdaptiveDeepthinkResponse(responseText);
            const segments = parseIntoSegments(parsed.narrative, parsed.toolCalls);

            const msgs = activeAdaptiveDeepthinkState.messages;
            msgs[placeholderIndex] = {
                ...msgs[placeholderIndex],
                content: parsed.narrative,
                segments: segments as any
            };

            notifyAdaptiveDeepthinkListeners();

            if (parsed.toolCalls.length === 0) {
                activeAdaptiveDeepthinkState.coreState.status = 'completed';
                activeAdaptiveDeepthinkState.isComplete = true;
                activeAdaptiveDeepthinkState.isProcessing = false;
                notifyAdaptiveDeepthinkListeners();
                break;
            }

            const toolCall = parsed.toolCalls[0];
            const agentName = getAgentNameFromToolType(toolCall.type);
            const agentIcon = getAgentIconFromToolType(toolCall.type);

            activeAdaptiveDeepthinkState.messages = [...activeAdaptiveDeepthinkState.messages, {
                id: newMsgId('system'),
                role: 'system',
                content: `<div class="deepthink-tool-executing">
                    <span class="material-symbols-outlined tool-executing-icon">${agentIcon}</span>
                    <div class="tool-executing-content">
                        <div class="tool-executing-title">Executing: ${agentName}</div>
                        <div class="tool-executing-subtitle">Processing response...</div>
                    </div>
                </div>`,
                timestamp: Date.now(),
                status: 'processing' as const
            }];
            notifyAdaptiveDeepthinkListeners();

            const toolResult = await executeAdaptiveDeepthinkTool(
                toolCall,
                activeAdaptiveDeepthinkState.coreState,
                agentContext,
                deepthinkPrompts,
                images
            );

            parseToolResultAndUpdateState(toolCall, toolResult);
            notifyAdaptiveDeepthinkListeners();

            activeAdaptiveDeepthinkState.messages = [
                ...activeAdaptiveDeepthinkState.messages.slice(0, -1),
                {
                    id: newMsgId('system'),
                    role: 'system',
                    content: toolResult,
                    timestamp: Date.now(),
                    status: toolResult.includes('[ERROR:') ? 'error' : 'success',
                    blocks: [{
                        kind: 'tool_result',
                        tool: toolCall.type,
                        result: toolResult
                    } as SystemBlock]
                }
            ];

            await activeAdaptiveDeepthinkState.conversationManager.addSystemMessage(toolResult);
            activeAdaptiveDeepthinkState.isProcessing = false;
            notifyAdaptiveDeepthinkListeners();

        } catch (error) {
            console.error('Adaptive Deepthink loop error:', error);
            activeAdaptiveDeepthinkState.messages = [...activeAdaptiveDeepthinkState.messages, {
                id: newMsgId('system'),
                role: 'system',
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: Date.now(),
                status: 'error',
                blocks: [{
                    kind: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error'
                } as SystemBlock]
            }];

            activeAdaptiveDeepthinkState.isProcessing = false;
            activeAdaptiveDeepthinkState.error = error instanceof Error ? error.message : 'Unknown error';
            notifyAdaptiveDeepthinkListeners();
            break;
        }

        if (abortController?.signal.aborted) break;
    }

    globalState.isAdaptiveDeepthinkRunning = false;
    updateControlsState();
}

export function stopAdaptiveDeepthinkProcess() {
    globalState.isAdaptiveDeepthinkRunning = false;
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    updateControlsState();

    if (activeAdaptiveDeepthinkState) {
        activeAdaptiveDeepthinkState.isProcessing = false;
        activeAdaptiveDeepthinkState.isComplete = true;
        notifyAdaptiveDeepthinkListeners();
    }
}

export function cleanupAdaptiveDeepthinkMode() {
    stopAdaptiveDeepthinkProcess();
    activeAdaptiveDeepthinkState = null;
    notifyAdaptiveDeepthinkListeners();
}

export function getAdaptiveDeepthinkState(): AdaptiveDeepthinkStoreState | null {
    return activeAdaptiveDeepthinkState;
}

export function setAdaptiveDeepthinkStateForImport(state: AdaptiveDeepthinkStoreState | null) {
    if (state) {
        state.isProcessing = false;
        activeAdaptiveDeepthinkState = state;
        globalState.isAdaptiveDeepthinkRunning = false;
    } else {
        activeAdaptiveDeepthinkState = null;
    }
    notifyAdaptiveDeepthinkListeners();
}
