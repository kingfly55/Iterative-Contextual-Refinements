/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Deepthink Core - Core business logic for Deepthink mode
 * Contains state management, pipeline processing, and core algorithms
 */

import { Part, GenerateContentResponse } from "@google/genai";
import { AIProvider, ThinkingConfig } from '../Routing/AIProvider';
import { CustomizablePromptsDeepthink } from './DeepthinkPrompts';
import { renderMathContent } from '../Styles/Components/RenderMathMarkdown';
import { SolutionCritiqueHistoryManager, SolutionCorrectionHistoryManager, StructuredSolutionPoolHistoryManager, PostQualityFilterHistoryManager, StrategiesGeneratorHistoryManager } from './DeepthinkIterativeHistory';
import { addSolutionPoolVersion } from './SolutionPool';
import { extractPartsInOrder, formatPartsForDisplay } from '../Contextual/Contextual';

// ========== TYPE DEFINITIONS ==========

export interface DeepthinkSolutionCritiqueData {
    id: string;
    subStrategyId: string;
    mainStrategyId: string;
    requestPrompt?: string;
    critiqueResponse?: string;
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    retryAttempt?: number;
    isDetailsOpen?: boolean;
}

export interface SolutionPoolParsedSolution {
    title: string;
    approach_summary: string;
    content: string;
    confidence: number;
    internal_critique: string;
    atomic_reconstruction?: string;
}

export interface SolutionPoolParsedResponse {
    strategy_id: string;
    solutions: SolutionPoolParsedSolution[];
}

export interface DeepthinkStructuredSolutionPoolAgentData {
    id: string;
    mainStrategyId: string;
    requestPrompt?: string;
    poolResponse?: string;
    parsedPoolResponse?: SolutionPoolParsedResponse;
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    retryAttempt?: number;
    isDetailsOpen?: boolean;
}

export interface DeepthinkSubStrategyData {
    id: string;
    subStrategyText: string;
    requestPromptSolutionAttempt?: string;
    solutionAttempt?: string;
    requestPromptSolutionCritique?: string;
    solutionCritique?: string;
    solutionCritiqueStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    solutionCritiqueError?: string;
    solutionCritiqueRetryAttempt?: number;
    requestPromptSelfImprovement?: string;
    refinedSolution?: string;
    selfImprovementStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    selfImprovementError?: string;
    selfImprovementRetryAttempt?: number;
    isKilledByRedTeam?: boolean;
    redTeamReason?: string;
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
    subStrategyFormat?: string;
    iterativeCorrections?: {
        enabled: boolean;
        iterations: Array<{
            iterationNumber: number;
            critique: string;
            correctedSolution: string;
            timestamp: number;
        }>;
        status: 'idle' | 'processing' | 'completed' | 'error';
        error?: string;
    };
}

export interface DeepthinkHypothesisData {
    id: string;
    hypothesisText: string;
    testerRequestPrompt?: string;
    testerAttempt?: string;
    testerStatus: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    testerError?: string;
    isDetailsOpen?: boolean;
}

export interface DeepthinkRedTeamData {
    id: string;
    assignedStrategyId: string;
    requestPrompt?: string;
    evaluationResponse?: string;
    killedStrategyIds: string[];
    killedSubStrategyIds: string[];
    reasoning?: string;
    rawResponse?: string;
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
}

export interface DeepthinkPostQualityFilterData {
    id: string;
    iterationNumber: number;
    requestPrompt?: string;
    evaluationResponse?: string;
    prunedStrategyIds: string[];
    continuedStrategyIds: string[];
    reasoning?: string;
    rawResponse?: string;
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
}

export interface DeepthinkMainStrategyData {
    id: string;
    strategyText: string;
    requestPromptSubStrategyGen?: string;
    subStrategies: DeepthinkSubStrategyData[];
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
    isKilledByRedTeam?: boolean;
    redTeamReason?: string;
    strategyFormat?: string;
    generatedByPostQualityFilter?: boolean;
    updatedByPostQualityFilter?: boolean;
    postQualityFilterIteration?: number;
    judgedBestSubStrategyId?: string;
    judgedBestSolution?: string;
    judgingRequestPrompt?: string;
    judgingResponseText?: string;
    judgingStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    judgingError?: string;
    judgingRetryAttempt?: number;
}

export interface DeepthinkPipelineState {
    id: string;
    challenge: string;
    challengeText: string;
    challengeImageBase64?: string | null;
    challengeImageMimeType?: string;
    status: 'idle' | 'processing' | 'retrying' | 'completed' | 'error' | 'stopping' | 'stopped' | 'cancelled';
    error?: string;
    activeTabId: string;
    activeStrategyTab?: number;
    isStopRequested?: boolean;
    retryAttempt?: number;
    requestPromptInitialStrategyGen?: string;
    initialStrategies: DeepthinkMainStrategyData[];
    requestPromptHypothesisGen?: string;
    hypotheses: DeepthinkHypothesisData[];
    hypothesisGenStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    hypothesisGenError?: string;
    hypothesisGenRetryAttempt?: number;
    knowledgePacket?: string;
    solutionCritiques: DeepthinkSolutionCritiqueData[];
    solutionCritiquesStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    solutionCritiquesError?: string;
    dissectedObservationsSynthesis?: string;
    dissectedSynthesisRequestPrompt?: string;
    dissectedSynthesisStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    dissectedSynthesisError?: string;
    dissectedSynthesisRetryAttempt?: number;
    redTeamEvaluations: DeepthinkRedTeamData[];
    redTeamStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    redTeamError?: string;
    postQualityFilterAgents: DeepthinkPostQualityFilterData[];
    postQualityFilterStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    postQualityFilterError?: string;
    postQualityFilterIterationCount?: number;
    strategicSolverComplete?: boolean;
    hypothesisExplorerComplete?: boolean;
    redTeamComplete?: boolean;
    finalJudgedBestStrategyId?: string;
    finalJudgedBestSolution?: string;
    finalJudgingRequestPrompt?: string;
    finalJudgingResponseText?: string;
    finalJudgingStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    finalJudgingError?: string;
    finalJudgingRetryAttempt?: number;
    finalJudgingStatusDescription?: string;
    structuredSolutionPoolEnabled?: boolean;
    structuredSolutionPool?: string;
    structuredSolutionPoolAgents: DeepthinkStructuredSolutionPoolAgentData[];
    structuredSolutionPoolStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    structuredSolutionPoolError?: string;
}

// ========== ERROR CLASSES ==========

export class PipelineStopRequestedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PipelineStopRequestedError";
    }
}

// ========== STATE MANAGEMENT ==========

export let activeDeepthinkPipeline: DeepthinkPipelineState | null = null;
let setActiveDeepthinkPipeline: ((pipeline: DeepthinkPipelineState | null) => void) | null = null;
let renderActiveDeepthinkPipeline: (() => void) | null = null;

// Dependency references
let getAIProvider: (() => AIProvider | null) | null = null;
let callGemini: (parts: Part[], temperature: number, modelToUse: string, systemInstruction?: string, isJson?: boolean, topP?: number, thinkingConfig?: ThinkingConfig) => Promise<GenerateContentResponse>;
let cleanOutputByType: (rawOutput: string, type?: string) => string;
let parseJsonSuggestions: (rawJsonString: string, suggestionKey?: string, expectedCount?: number) => string[];
let parseJsonSafe: (raw: string, context: string) => any;
let getSelectedTemperature: () => number;
let getSelectedModel: () => string;
let getSelectedTopP: () => number;
let getSelectedStrategiesCount: () => number;
let getSelectedSubStrategiesCount: () => number;
let getRefinementEnabled: () => boolean;
let getSelectedHypothesisCount: () => number;
let getSelectedRedTeamAggressiveness: () => string;
let getSkipSubStrategies: () => boolean;
let getDissectedObservationsEnabled: () => boolean;
let getIterativeCorrectionsEnabled: () => boolean;
let getIterativeDepth: () => number;
let getProvideAllSolutionsToCorrectors: () => boolean;
let getPostQualityFilterEnabled: () => boolean;
let getDeepthinkCodeExecutionEnabled: () => boolean;
let getModelProvider: () => string;
let escapeHtml: (unsafe: string) => string;
let cleanTextOutput: (text: string) => string;
let updateControlsState: (newState: any) => void;
let customPromptsDeepthinkState: CustomizablePromptsDeepthink;

// ========== CONSTANTS ==========

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000; // 20 seconds
const BACKOFF_FACTOR = 2;
const STRUCTURED_SOLUTION_POOL_TIMEOUT_MS = 900000; // 15 minutes

// ========== INITIALIZATION ==========

export function initializeDeepthinkCore(dependencies: {
    getAIProvider: () => AIProvider | null;
    callGemini: typeof callGemini;
    cleanOutputByType: typeof cleanOutputByType;
    parseJsonSuggestions: typeof parseJsonSuggestions;
    parseJsonSafe: typeof parseJsonSafe;
    updateControlsState: (newState: any) => void;
    escapeHtml: typeof escapeHtml;
    getSelectedTemperature: () => number;
    getSelectedModel: () => string;
    getSelectedTopP: () => number;
    getSelectedStrategiesCount: () => number;
    getSelectedSubStrategiesCount: () => number;
    getRefinementEnabled: () => boolean;
    getSelectedHypothesisCount: () => number;
    getSelectedRedTeamAggressiveness: () => string;
    getSkipSubStrategies: () => boolean;
    getDissectedObservationsEnabled: () => boolean;
    getIterativeCorrectionsEnabled: () => boolean;
    getIterativeDepth: () => number;
    getProvideAllSolutionsToCorrectors: () => boolean;
    getPostQualityFilterEnabled: () => boolean;
    getDeepthinkCodeExecutionEnabled: () => boolean;
    getModelProvider: () => string;
    cleanTextOutput: (text: string) => string;
    customPromptsDeepthinkState: CustomizablePromptsDeepthink;
    setActiveDeepthinkPipeline: (pipeline: DeepthinkPipelineState | null) => void;
    renderActiveDeepthinkPipeline: () => void;
}) {
    getAIProvider = dependencies.getAIProvider;
    customPromptsDeepthinkState = dependencies.customPromptsDeepthinkState;
    callGemini = dependencies.callGemini;
    cleanOutputByType = dependencies.cleanOutputByType;
    parseJsonSuggestions = dependencies.parseJsonSuggestions;
    parseJsonSafe = dependencies.parseJsonSafe;
    updateControlsState = dependencies.updateControlsState;
    getSelectedTemperature = dependencies.getSelectedTemperature;
    getSelectedModel = dependencies.getSelectedModel;
    getSelectedTopP = dependencies.getSelectedTopP;
    getSelectedStrategiesCount = dependencies.getSelectedStrategiesCount;
    getSelectedSubStrategiesCount = dependencies.getSelectedSubStrategiesCount;
    getRefinementEnabled = dependencies.getRefinementEnabled;
    getSelectedHypothesisCount = dependencies.getSelectedHypothesisCount;
    getSelectedRedTeamAggressiveness = dependencies.getSelectedRedTeamAggressiveness;
    getSkipSubStrategies = dependencies.getSkipSubStrategies;
    getDissectedObservationsEnabled = dependencies.getDissectedObservationsEnabled;
    getIterativeCorrectionsEnabled = dependencies.getIterativeCorrectionsEnabled;
    getIterativeDepth = dependencies.getIterativeDepth;
    getProvideAllSolutionsToCorrectors = dependencies.getProvideAllSolutionsToCorrectors;
    getPostQualityFilterEnabled = dependencies.getPostQualityFilterEnabled;
    getDeepthinkCodeExecutionEnabled = dependencies.getDeepthinkCodeExecutionEnabled;
    getModelProvider = dependencies.getModelProvider;
    cleanTextOutput = dependencies.cleanTextOutput;
    escapeHtml = dependencies.escapeHtml;
    setActiveDeepthinkPipeline = dependencies.setActiveDeepthinkPipeline;
    renderActiveDeepthinkPipeline = dependencies.renderActiveDeepthinkPipeline;
}

// Export for external use
export function getActiveDeepthinkPipeline() {
    return activeDeepthinkPipeline;
}

export function setActiveDeepthinkPipelineForImport(pipeline: DeepthinkPipelineState | null) {
    activeDeepthinkPipeline = pipeline;
    if (setActiveDeepthinkPipeline) {
        setActiveDeepthinkPipeline(pipeline);
    }
}

export function setActiveDeepthinkPipelineInternal(pipeline: DeepthinkPipelineState | null) {
    activeDeepthinkPipeline = pipeline;
}

// ========== UTILITY FUNCTIONS ==========

export function parseKnowledgePacketForStyling(knowledgePacket: string): string {
    if (!knowledgePacket) return '<div class="no-knowledge">No knowledge packet available</div>';

    if (knowledgePacket.includes('<Full Information Packet>')) {
        let html = '<div class="full-information-packet">';
        const hypothesisRegex = /<Hypothesis (\d+)>\s*Hypothesis:\s*(.*?)\s*Hypothesis Testing:\s*(.*?)\s*<\/Hypothesis \d+>/gs;
        let match;
        let hypothesisCount = 0;

        while ((match = hypothesisRegex.exec(knowledgePacket)) !== null) {
            hypothesisCount++;
            const [, number, hypothesis, testing] = match;
            html += `<div class="hypothesis-block">
                <div class="hypothesis-header">
                    <span class="hypothesis-number">Hypothesis ${number}</span>
                </div>
                <div class="hypothesis-content">
                    <div class="hypothesis-text">
                        <strong>Hypothesis:</strong>
                        <div class="hypothesis-description">${renderMathContent(hypothesis.trim())}</div>
                    </div>
                    <div class="hypothesis-testing">
                        <strong>Hypothesis Testing:</strong>
                        <div class="testing-output">${renderMathContent(testing.trim())}</div>
                    </div>
                </div>
            </div>`;
        }

        if (hypothesisCount === 0 && knowledgePacket.includes('HYPOTHESIS EXPLORATION: Disabled')) {
            html += '<div class="hypothesis-disabled">HYPOTHESIS EXPLORATION: Disabled - No hypotheses generated.</div>';
        }

        html += '</div>';
        return html;
    }

    return renderMathContent(knowledgePacket);
}

// ========== RED TEAM EVALUATION FUNCTIONS ==========

export function applyRedTeamResults(currentProcess: DeepthinkPipelineState): void {
    currentProcess.redTeamEvaluations.forEach(redTeamAgent => {
        if (redTeamAgent.status === 'completed') {
            const reasonMap = (redTeamAgent as any).killedReasonMap || {};
            const fallbackReason = `Eliminated by Red Team Agent ${redTeamAgent.id}`;

            redTeamAgent.killedStrategyIds.forEach(strategyId => {
                const strategy = currentProcess.initialStrategies.find(s => s.id === strategyId);
                if (strategy) {
                    strategy.isKilledByRedTeam = true;
                    strategy.redTeamReason = reasonMap[strategyId] || fallbackReason;
                }
            });

            redTeamAgent.killedSubStrategyIds.forEach(subStrategyId => {
                currentProcess.initialStrategies.forEach(strategy => {
                    const subStrategy = strategy.subStrategies.find(sub => sub.id === subStrategyId);
                    if (subStrategy) {
                        subStrategy.isKilledByRedTeam = true;
                        subStrategy.redTeamReason = reasonMap[subStrategyId] || fallbackReason;
                    }
                });
            });
        }
    });
}

export async function runConsolidatedRedTeamAnalysis(
    currentProcess: DeepthinkPipelineState,
    strategies: DeepthinkMainStrategyData[],
    problemText: string,
    imageBase64: string | null | undefined,
    imageMimeType: string | null | undefined,
    makeDeepthinkApiCall: any,
    _aggressiveness: string
): Promise<void> {
    if (!strategies || strategies.length === 0) return;

    const redTeamAgent: DeepthinkRedTeamData = {
        id: `redteam-consolidated`,
        assignedStrategyId: 'all',
        killedStrategyIds: [],
        killedSubStrategyIds: [],
        status: 'pending',
        isDetailsOpen: true
    };
    currentProcess.redTeamEvaluations = [redTeamAgent];
    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

    if (currentProcess.isStopRequested) {
        redTeamAgent.status = 'cancelled';
        return;
    }

    try {
        redTeamAgent.status = 'processing';
        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

        const allStrategiesText = strategies.map(mainStrategy => {
            const subStrategiesText = mainStrategy.subStrategies
                .map((sub) => `  - Sub-Strategy [ID: ${sub.id}]: ${sub.subStrategyText}`)
                .join('\n');
            return `Main Strategy [ID: ${mainStrategy.id}]:\n${mainStrategy.strategyText}\nSub-Strategies:\n${subStrategiesText}`;
        }).join('\n\n' + '='.repeat(40) + '\n\n');

        const redTeamPrompt = customPromptsDeepthinkState.user_deepthink_redTeam
            .replace('{{originalProblemText}}', problemText)
            .replace('{{allStrategies}}', allStrategiesText);

        const redTeamPromptParts: Part[] = [{ text: redTeamPrompt }];
        if (imageBase64 && imageMimeType) {
            redTeamPromptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }
        redTeamAgent.requestPrompt = redTeamPrompt + (imageBase64 ? "\n[Image Provided]" : "");

        const redTeamResponse = await makeDeepthinkApiCall(
            redTeamPromptParts,
            customPromptsDeepthinkState.sys_deepthink_redTeam,
            true,
            `Red Team Evaluation`,
            redTeamAgent,
            'retryAttempt'
        );

        redTeamAgent.evaluationResponse = cleanTextOutput(redTeamResponse);
        redTeamAgent.rawResponse = redTeamResponse;

        try {
            let cleanedResponse = redTeamResponse.trim();
            cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            cleanedResponse = cleanedResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');

            const jsonStart = cleanedResponse.indexOf('{');
            const jsonEnd = cleanedResponse.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
                throw new Error(`No valid JSON object boundaries found`);
            }
            cleanedResponse = cleanedResponse.substring(jsonStart, jsonEnd + 1);

            const parsed = JSON.parse(cleanedResponse);
            let reasoningHtml = '<div class="red-team-evaluation-results">';

            if (parsed.challenge) {
                reasoningHtml += `<h4>Challenge Evaluation: ${parsed.challenge}</h4>`;
            }

            if (Array.isArray(parsed.strategy_evaluations)) {
                parsed.strategy_evaluations.forEach((evaluation: any) => {
                    const decision = String(evaluation.decision || '').toLowerCase();
                    const id = evaluation.id || 'Unknown ID';
                    const reason = evaluation.reason || 'No reason provided';

                    reasoningHtml += `
                        <div class="strategy-evaluation-item">
                            <div class="evaluation-header">
                                <span class="strategy-id">${id}</span>
                                <span class="decision-badge decision-${decision}">${decision}</span>
                            </div>
                            <div class="evaluation-reason">
                                ${renderMathContent(reason)}
                            </div>
                        </div>`;
                });
            }

            reasoningHtml += '</div>';
            redTeamAgent.reasoning = reasoningHtml;

            const killedStrategyIds: string[] = [];
            const killedSubStrategyIds: string[] = [];
            const reasonMap: { [key: string]: string } = {};

            if (Array.isArray(parsed.strategy_evaluations)) {
                parsed.strategy_evaluations.forEach((evaluation: any) => {
                    if (!evaluation || typeof evaluation !== 'object') return;
                    const decision = String(evaluation.decision || '').toLowerCase();
                    const id = typeof evaluation.id === 'string' ? evaluation.id : '';
                    if (!id) return;
                    if (decision === 'eliminate') {
                        if (id.includes('main')) {
                            if (id.includes('sub')) {
                                killedSubStrategyIds.push(id);
                            } else {
                                killedStrategyIds.push(id);
                            }
                        }
                        const reason = evaluation.reason || 'No reason provided';
                        reasonMap[id] = reason;
                    }
                });
            }

            redTeamAgent.killedStrategyIds = killedStrategyIds;
            redTeamAgent.killedSubStrategyIds = killedSubStrategyIds;
            (redTeamAgent as any).killedReasonMap = reasonMap;
            redTeamAgent.status = 'completed';
            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

        } catch (e: any) {
            console.error("Error parsing Red Team JSON:", e);
            redTeamAgent.status = 'error';
            redTeamAgent.error = "Failed to parse Red Team response: " + e.message;
            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
        }
    } catch (error: any) {
        redTeamAgent.status = 'error';
        redTeamAgent.error = error.message || "Red Team evaluation failed";
        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
    }
}

// ========== MAIN PIPELINE FUNCTION ==========

export async function startDeepthinkAnalysisProcess(challengeText: string, imageBase64?: string | null, imageMimeType?: string | null) {
    const currentAIProvider = getAIProvider ? getAIProvider() : null;
    if (!currentAIProvider) {
        alert("AI provider not initialized. Please check your API key configuration.");
        return;
    }

    activeDeepthinkPipeline = {
        id: `deepthink-process-${Date.now()}`,
        challenge: challengeText,
        challengeText: challengeText,
        initialStrategies: [],
        hypotheses: [],
        solutionCritiques: [],
        redTeamEvaluations: [],
        postQualityFilterAgents: [],
        structuredSolutionPoolAgents: [],
        status: 'processing',
        isStopRequested: false,
        activeTabId: 'strategic-solver',
        activeStrategyTab: 0,
        strategicSolverComplete: false,
        hypothesisExplorerComplete: false,
        redTeamComplete: false,
        knowledgePacket: '',
        finalJudgingStatus: 'pending',
        structuredSolutionPoolEnabled: false
    };

    if (setActiveDeepthinkPipeline) {
        setActiveDeepthinkPipeline(activeDeepthinkPipeline);
    }

    updateControlsState({ isGenerating: true });
    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

    const currentProcess = activeDeepthinkPipeline as DeepthinkPipelineState;

    const makeDeepthinkApiCall = async (
        parts: Part[],
        systemInstruction: string,
        isJson: boolean,
        stepDescription: string,
        targetStatusField: DeepthinkMainStrategyData | DeepthinkSubStrategyData | DeepthinkPipelineState | DeepthinkHypothesisData | DeepthinkSolutionCritiqueData | DeepthinkRedTeamData | DeepthinkPostQualityFilterData,
        retryAttemptField: 'retryAttempt' | 'selfImprovementRetryAttempt' | 'testerRetryAttempt' | 'hypothesisGenRetryAttempt' | 'solutionCritiqueRetryAttempt' | 'dissectedSynthesisRetryAttempt'
    ): Promise<string> => {
        if (!currentProcess || currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDescription}`);
        let responseText = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDescription}`);

            try {
                (targetStatusField as any)[retryAttemptField] = attempt;
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                let agentModel = getSelectedModel();

                if (stepDescription.includes('Initial Strategy Generation')) {
                    agentModel = customPromptsDeepthinkState.model_initialStrategy || getSelectedModel();
                } else if (stepDescription.includes('Sub-Strategy Generation')) {
                    agentModel = customPromptsDeepthinkState.model_subStrategy || getSelectedModel();
                } else if (stepDescription.includes('Solution Attempt')) {
                    agentModel = customPromptsDeepthinkState.model_solutionAttempt || getSelectedModel();
                } else if (stepDescription.includes('Solution Critique')) {
                    agentModel = customPromptsDeepthinkState.model_solutionCritique || getSelectedModel();
                } else if (stepDescription.includes('Dissected Observations Synthesis')) {
                    agentModel = customPromptsDeepthinkState.model_dissectedSynthesis || getSelectedModel();
                } else if (stepDescription.includes('Self-Improvement') || stepDescription.includes('Self Improvement')) {
                    agentModel = customPromptsDeepthinkState.model_selfImprovement || getSelectedModel();
                } else if (stepDescription.includes('Hypothesis Generation')) {
                    agentModel = customPromptsDeepthinkState.model_hypothesisGeneration || getSelectedModel();
                } else if (stepDescription.includes('Hypothesis Testing')) {
                    agentModel = customPromptsDeepthinkState.model_hypothesisTester || getSelectedModel();
                } else if (stepDescription.includes('Red Team')) {
                    agentModel = customPromptsDeepthinkState.model_redTeam || getSelectedModel();
                } else if (stepDescription.includes('PostQualityFilter')) {
                    agentModel = customPromptsDeepthinkState.model_postQualityFilter || getSelectedModel();
                } else if (stepDescription.includes('Final Judge')) {
                    agentModel = customPromptsDeepthinkState.model_finalJudge || getSelectedModel();
                }

                // Determine if this agent should use code execution
                // Target agents: Hypothesis Testing, Solution Attempt, Solution Critique, Self-Improvement, Structured Solution Pool
                const codeExecutionTargetAgents = [
                    'Hypothesis Testing',
                    'Solution Attempt',
                    'Solution Critique',
                    'Self-Improvement',
                    'Self Improvement',
                    'Structured Solution Pool'
                ];

                const isCodeExecutionAgent = codeExecutionTargetAgents.some(agent => stepDescription.includes(agent));
                const isGeminiProvider = getModelProvider() === 'gemini';
                const shouldEnableCodeExecution = isCodeExecutionAgent && isGeminiProvider && getDeepthinkCodeExecutionEnabled();

                const thinkingConfig: ThinkingConfig | undefined = shouldEnableCodeExecution
                    ? { codeExecution: true }
                    : undefined;

                const strategyResponse = await callGemini(parts, getSelectedTemperature(), agentModel, systemInstruction, isJson, getSelectedTopP(), thinkingConfig);

                // Handle code execution responses specially to preserve code blocks and output
                if (shouldEnableCodeExecution && strategyResponse?.candidates?.[0]?.content?.parts) {
                    const orderedParts = extractPartsInOrder(strategyResponse);
                    responseText = formatPartsForDisplay(orderedParts);
                } else {
                    responseText = strategyResponse.text || "";
                }

                if (responseText && responseText.trim() !== "") {
                    break;
                } else {
                    throw new Error("Empty response from API");
                }
            } catch (error: any) {
                if (attempt === MAX_RETRIES) {
                    throw error;
                } else {
                    if ('status' in targetStatusField) {
                        (targetStatusField as any).status = 'retrying';
                    }
                    (targetStatusField as any)[retryAttemptField] = attempt + 1;
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                    const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
                    console.log(`[Deepthink] ${stepDescription} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${delay / 1000}s...`);

                    const chunks = Math.ceil(delay / 500);
                    for (let i = 0; i < chunks; i++) {
                        if (currentProcess.isStopRequested) {
                            throw new PipelineStopRequestedError(`Stop requested during retry delay for: ${stepDescription}`);
                        }
                        await new Promise(resolve => setTimeout(resolve, Math.min(500, delay - i * 500)));
                    }

                    if ('status' in targetStatusField) {
                        (targetStatusField as any).status = 'processing';
                    }
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                }
            }
        }

        return responseText;
    };

    try {
        // Track B: Hypothesis Explorer
        const trackBPromise = (async () => {
            try {
                const currentHypothesisCount = getSelectedHypothesisCount();

                if (currentHypothesisCount === 0) {
                    currentProcess.hypothesisGenStatus = 'completed';
                    currentProcess.hypotheses = [];
                    currentProcess.knowledgePacket = "<Full Information Packet>\nHYPOTHESIS EXPLORATION: Disabled - No hypotheses generated.\n</Full Information Packet>";
                    currentProcess.hypothesisExplorerComplete = true;
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                    return;
                }

                const hypothesisPrompt = customPromptsDeepthinkState.user_deepthink_hypothesisGeneration.replace('{{originalProblemText}}', challengeText);
                currentProcess.requestPromptHypothesisGen = hypothesisPrompt;
                currentProcess.hypothesisGenStatus = 'processing';
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                const parts: Part[] = [];
                if (imageBase64 && imageMimeType) {
                    parts.push({
                        inlineData: {
                            data: imageBase64,
                            mimeType: imageMimeType
                        }
                    });
                }

                const hypothesisResponse = await makeDeepthinkApiCall(
                    parts.concat([{ text: hypothesisPrompt }]),
                    customPromptsDeepthinkState.sys_deepthink_hypothesisGeneration,
                    true,
                    "Hypothesis Generation",
                    currentProcess,
                    'hypothesisGenRetryAttempt'
                );

                const hypothesisData = parseJsonSafe(hypothesisResponse, 'Hypothesis Generation');
                const hypotheses = hypothesisData.hypotheses || [];

                for (let i = 0; i < hypotheses.length; i++) {
                    const hypothesis: DeepthinkHypothesisData = {
                        id: `hyp${i + 1}`,
                        hypothesisText: hypotheses[i],
                        testerStatus: 'pending',
                        isDetailsOpen: false
                    };
                    currentProcess.hypotheses.push(hypothesis);
                }

                currentProcess.hypothesisGenStatus = 'completed';
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                const hypothesisTestingPromises = currentProcess.hypotheses.map(async (hypothesis) => {
                    if (currentProcess.isStopRequested) {
                        hypothesis.testerStatus = 'cancelled';
                        return;
                    }

                    hypothesis.testerStatus = 'processing';
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                    try {
                        const testerPrompt = customPromptsDeepthinkState.user_deepthink_hypothesisTester
                            .replace('{{originalProblemText}}', challengeText)
                            .replace('{{hypothesisText}}', hypothesis.hypothesisText);

                        hypothesis.testerRequestPrompt = testerPrompt;

                        const testerResponse = await makeDeepthinkApiCall(
                            parts.concat([{ text: testerPrompt }]),
                            customPromptsDeepthinkState.sys_deepthink_hypothesisTester,
                            false,
                            `Hypothesis Testing for ${hypothesis.id}`,
                            hypothesis,
                            'testerRetryAttempt'
                        );

                        hypothesis.testerAttempt = testerResponse;
                        hypothesis.testerStatus = 'completed';

                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                    } catch (error: any) {
                        hypothesis.testerStatus = 'error';
                        hypothesis.testerError = error.message || "Hypothesis testing failed";
                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                    }
                });

                await Promise.allSettled(hypothesisTestingPromises);

                let knowledgePacket = "<Full Information Packet>\n";

                currentProcess.hypotheses.forEach((hypothesis, index) => {
                    knowledgePacket += `<Hypothesis ${index + 1}>\n`;
                    knowledgePacket += `Hypothesis: ${hypothesis.hypothesisText}\n`;
                    knowledgePacket += `Hypothesis Testing: ${hypothesis.testerAttempt || 'No testing output available'}\n`;
                    knowledgePacket += `</Hypothesis ${index + 1}>\n`;
                });

                knowledgePacket += "</Full Information Packet>";

                currentProcess.knowledgePacket = knowledgePacket;
                currentProcess.hypothesisExplorerComplete = true;
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

            } catch (error: any) {
                if (!(error instanceof PipelineStopRequestedError)) {
                    currentProcess.hypothesisGenStatus = 'error';
                    currentProcess.hypothesisGenError = `Hypothesis exploration failed: ${error.message}`;
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                }
                throw error;
            }
        })();

        // Track A: Strategic Solver - PART 1
        const trackAPromise = (async () => {
            try {
                currentProcess.status = 'processing';
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                const parts: Part[] = [];
                if (imageBase64 && imageMimeType) {
                    parts.push({
                        inlineData: {
                            data: imageBase64,
                            mimeType: imageMimeType
                        }
                    });
                }

                const strategiesPrompt = customPromptsDeepthinkState.user_deepthink_initialStrategy.replace('{{originalProblemText}}', challengeText);
                currentProcess.requestPromptInitialStrategyGen = strategiesPrompt;

                const strategiesResponse = await makeDeepthinkApiCall(
                    parts.concat([{ text: strategiesPrompt }]),
                    customPromptsDeepthinkState.sys_deepthink_initialStrategy,
                    true,
                    "Initial Strategy Generation",
                    currentProcess,
                    'retryAttempt'
                );

                const strategies = parseJsonSuggestions(strategiesResponse, 'strategies', getSelectedStrategiesCount());

                for (let i = 0; i < strategies.length; i++) {
                    const strategy: DeepthinkMainStrategyData = {
                        id: `main${i + 1}`,
                        strategyText: strategies[i],
                        subStrategies: [],
                        status: 'pending',
                        isDetailsOpen: false,
                        strategyFormat: 'markdown'
                    };
                    currentProcess.initialStrategies.push(strategy);
                }

                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                const skipSubStrategies = getSkipSubStrategies();
                const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();

                if (currentRedTeamAggressiveness !== 'off') {
                    currentProcess.redTeamStatus = 'processing';
                    currentProcess.redTeamEvaluations = [];
                } else {
                    currentProcess.redTeamStatus = 'completed';
                    currentProcess.redTeamComplete = true;
                    currentProcess.redTeamEvaluations = [];
                }
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                if (skipSubStrategies) {
                    currentProcess.initialStrategies.forEach((mainStrategy) => {
                        const subStrategy: DeepthinkSubStrategyData = {
                            id: `${mainStrategy.id}-direct`,
                            subStrategyText: mainStrategy.strategyText,
                            status: 'pending',
                            isDetailsOpen: false,
                            subStrategyFormat: 'markdown'
                        };
                        mainStrategy.subStrategies.push(subStrategy);
                    });
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                } else {
                    await Promise.allSettled(currentProcess.initialStrategies.map(async (mainStrategy) => {
                        if (currentProcess.isStopRequested) {
                            mainStrategy.status = 'cancelled';
                            mainStrategy.error = "Process stopped by user.";
                            return;
                        }

                        try {
                            mainStrategy.status = 'processing';
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                            const otherStrategies = currentProcess.initialStrategies
                                .filter(s => s.id !== mainStrategy.id)
                                .map(s => s.strategyText);
                            const otherMainStrategiesStr = otherStrategies.length > 0
                                ? otherStrategies.map((s, idx) => `Strategy ${idx + 1}: ${s}`).join('\n\n')
                                : "No other strategies.";

                            const subStrategyPrompt = customPromptsDeepthinkState.user_deepthink_subStrategy
                                .replace('{{originalProblemText}}', challengeText)
                                .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                .replace('{{otherMainStrategiesStr}}', otherMainStrategiesStr);

                            mainStrategy.requestPromptSubStrategyGen = subStrategyPrompt;

                            const subStrategyResponse = await makeDeepthinkApiCall(
                                parts.concat([{ text: subStrategyPrompt }]),
                                customPromptsDeepthinkState.sys_deepthink_subStrategy,
                                true,
                                `Sub-Strategy Generation for ${mainStrategy.id}`,
                                mainStrategy,
                                'retryAttempt'
                            );

                            const subStrategies = parseJsonSuggestions(subStrategyResponse, 'sub_strategies', getSelectedSubStrategiesCount());

                            for (let j = 0; j < subStrategies.length; j++) {
                                const subStrategy: DeepthinkSubStrategyData = {
                                    id: `${mainStrategy.id}-sub${j + 1}`,
                                    subStrategyText: subStrategies[j],
                                    status: 'pending',
                                    isDetailsOpen: false,
                                    subStrategyFormat: 'markdown'
                                };
                                mainStrategy.subStrategies.push(subStrategy);
                            }

                        } catch (error: any) {
                            mainStrategy.status = 'error';
                            mainStrategy.error = error.message || "Sub-strategy generation failed";
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        }
                    }));
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped after sub-strategy generation.");

                if (currentRedTeamAggressiveness !== 'off') {
                    await runConsolidatedRedTeamAnalysis(
                        currentProcess,
                        currentProcess.initialStrategies,
                        challengeText,
                        imageBase64,
                        imageMimeType,
                        makeDeepthinkApiCall,
                        currentRedTeamAggressiveness
                    );
                    currentProcess.redTeamComplete = true;
                    currentProcess.redTeamStatus = 'completed';
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                    applyRedTeamResults(currentProcess);
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                    const remainingStrategies = currentProcess.initialStrategies.filter(s => !s.isKilledByRedTeam);
                    const remainingSubStrategies = currentProcess.initialStrategies.flatMap(s => s.subStrategies.filter(sub => !sub.isKilledByRedTeam));
                    if (remainingStrategies.length === 0) {
                        currentProcess.status = 'completed';
                        currentProcess.error = "All strategies were eliminated by Red Team evaluation. No solution attempts can be made.";
                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        return;
                    }
                    if (remainingSubStrategies.length === 0) {
                        currentProcess.status = 'completed';
                        currentProcess.error = "All sub-strategies were eliminated by Red Team evaluation. No solution attempts can be made.";
                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        return;
                    }
                }

                const hypothesisCount = getSelectedHypothesisCount();
                if (hypothesisCount > 0) {
                    console.log('[Deepthink] Waiting for hypothesis exploration to complete before executing solutions...');
                    await trackBPromise;
                    console.log('[Deepthink] Hypothesis exploration complete. Proceeding to solution execution...');
                }

                if (currentProcess.isStopRequested) {
                    throw new PipelineStopRequestedError("Stopped while waiting for hypothesis exploration.");
                }

                const refinementEnabled = getRefinementEnabled();
                const iterativeCorrectionsEnabled = getIterativeCorrectionsEnabled();
                const dissectedObservationsEnabled = getDissectedObservationsEnabled();

                currentProcess.solutionCritiques = [];
                if (!iterativeCorrectionsEnabled && refinementEnabled) {
                    currentProcess.solutionCritiquesStatus = 'processing';
                }

                const critiquePromisesPerStrategy: Promise<void>[] = [];

                const strategyExecutionPromises = currentProcess.initialStrategies.map(async (mainStrategy) => {
                    const activeSubStrategies = mainStrategy.subStrategies.filter(sub => !sub.isKilledByRedTeam);
                    if (activeSubStrategies.length === 0) return;

                    const subStrategyExecutions = activeSubStrategies.map(async (subStrategy) => {
                        if (currentProcess.isStopRequested) {
                            subStrategy.status = 'cancelled';
                            subStrategy.error = "Process stopped by user.";
                            return;
                        }

                        try {
                            subStrategy.status = 'processing';
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                            const solutionPrompt = customPromptsDeepthinkState.user_deepthink_solutionAttempt
                                .replace('{{originalProblemText}}', challengeText)
                                .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                .replace('{{currentSubStrategy}}', subStrategy.subStrategyText)
                                .replace('{{knowledgePacket}}', currentProcess.knowledgePacket || 'No hypothesis exploration performed.');

                            subStrategy.requestPromptSolutionAttempt = solutionPrompt;

                            const solutionResponse = await makeDeepthinkApiCall(
                                parts.concat([{ text: solutionPrompt }]),
                                customPromptsDeepthinkState.sys_deepthink_solutionAttempt,
                                false,
                                `Solution Attempt for ${subStrategy.id}`,
                                subStrategy,
                                'retryAttempt'
                            );

                            subStrategy.solutionAttempt = solutionResponse;
                            subStrategy.status = 'completed';
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        } catch (error: any) {
                            subStrategy.status = 'error';
                            subStrategy.error = error.message || "Solution attempt failed";
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        }
                    });

                    await Promise.allSettled(subStrategyExecutions);

                    if (!iterativeCorrectionsEnabled && refinementEnabled) {
                        const completedSubStrategies = mainStrategy.subStrategies.filter(
                            sub => !sub.isKilledByRedTeam && sub.solutionAttempt
                        );

                        if (completedSubStrategies.length > 0) {
                            const critiquePromise = (async () => {
                                const critiqueData: DeepthinkSolutionCritiqueData = {
                                    id: `critique-${mainStrategy.id}`,
                                    subStrategyId: '',
                                    mainStrategyId: mainStrategy.id,
                                    status: 'pending',
                                    isDetailsOpen: true
                                };
                                currentProcess.solutionCritiques.push(critiqueData);
                                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                if (currentProcess.isStopRequested) {
                                    critiqueData.status = 'cancelled';
                                    critiqueData.error = "Process stopped by user.";
                                    return;
                                }

                                try {
                                    critiqueData.status = 'processing';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    const solutionsText = completedSubStrategies.map(sub =>
                                        `${sub.id}:\nSub-Strategy: ${sub.subStrategyText}\n\nSolution Attempt:\n${sub.solutionAttempt}`
                                    ).join('\n\n---\n\n');

                                    const critiquePrompt = customPromptsDeepthinkState.user_deepthink_solutionCritique
                                        .replace('{{originalProblemText}}', challengeText)
                                        .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                        .replace('{{allSubStrategiesAndSolutions}}', solutionsText);

                                    critiqueData.requestPrompt = critiquePrompt;

                                    const critiqueResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: critiquePrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                        false,
                                        `Solution Critique for ${mainStrategy.id}`,
                                        critiqueData,
                                        'retryAttempt'
                                    );

                                    critiqueData.critiqueResponse = critiqueResponse;

                                    completedSubStrategies.forEach(sub => {
                                        sub.solutionCritique = critiqueResponse;
                                        sub.solutionCritiqueStatus = 'completed';
                                    });

                                    critiqueData.status = 'completed';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                } catch (error: any) {
                                    critiqueData.status = 'error';
                                    critiqueData.error = error.message || "Solution critique failed";

                                    completedSubStrategies.forEach(sub => {
                                        sub.solutionCritiqueStatus = 'error';
                                        sub.solutionCritiqueError = error.message || "Solution critique failed";
                                    });

                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                }
                            })();

                            critiquePromisesPerStrategy.push(critiquePromise);
                        }
                    }
                });

                console.log('[Deepthink] Waiting for all solution executions to complete...');
                await Promise.allSettled(strategyExecutionPromises);
                console.log('[Deepthink] All solution executions complete.');

                if (!iterativeCorrectionsEnabled && refinementEnabled && dissectedObservationsEnabled) {
                    console.log('[Deepthink] Dissected observations enabled - waiting for all critiques to complete...');
                    await Promise.allSettled(critiquePromisesPerStrategy);
                    currentProcess.solutionCritiquesStatus = 'completed';
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                    console.log('[Deepthink] All critiques complete.');
                } else if (!iterativeCorrectionsEnabled && refinementEnabled && !dissectedObservationsEnabled) {
                    console.log('[Deepthink] Dissected observations disabled - critiques running in background, correctors starting immediately.');
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during solution attempts or critiques.");

                if (!refinementEnabled) {
                    currentProcess.initialStrategies.forEach((mainStrategy) => {
                        mainStrategy.subStrategies.forEach((subStrategy) => {
                            if (subStrategy.isKilledByRedTeam || !subStrategy.solutionAttempt) return;
                            subStrategy.refinedSolution = subStrategy.solutionAttempt;
                            subStrategy.selfImprovementStatus = 'completed';
                        });
                    });
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                } else if (iterativeCorrectionsEnabled) {
                    // PostQualityFilter workflow - only when sub-strategies are disabled
                    const skipSubStrategies = getSkipSubStrategies();
                    const postQualityFilterEnabled = getPostQualityFilterEnabled();
                    if (skipSubStrategies) {
                        console.log('[Deepthink] Generating initial critiques...');

                        // Generate initial critiques for all strategies
                        const initialCritiquePromises: Promise<void>[] = [];
                        currentProcess.initialStrategies.forEach((mainStrategy) => {
                            if (mainStrategy.isKilledByRedTeam) return;
                            const directSub = mainStrategy.subStrategies[0];
                            if (!directSub || directSub.isKilledByRedTeam || !directSub.solutionAttempt) return;

                            const critiquePromise = (async () => {
                                try {
                                    directSub.solutionCritiqueStatus = 'processing';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    const solutionsText = `${directSub.id}:\nSub-Strategy: ${directSub.subStrategyText}\n\nSolution Attempt:\n${directSub.solutionAttempt}`;

                                    const critiquePrompt = customPromptsDeepthinkState.user_deepthink_solutionCritique
                                        .replace(/\{\{originalProblemText\}\}/g, challengeText)
                                        .replace(/\{\{currentMainStrategy\}\}/g, mainStrategy.strategyText)
                                        .replace(/\{\{allSubStrategiesAndSolutions\}\}/g, solutionsText);

                                    const critiqueResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: critiquePrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                        false,
                                        `Initial Solution Critique for ${mainStrategy.id}`,
                                        directSub,
                                        'solutionCritiqueRetryAttempt'
                                    );

                                    directSub.solutionCritique = cleanTextOutput(critiqueResponse);
                                    directSub.solutionCritiqueStatus = 'completed';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                } catch (error: any) {
                                    directSub.solutionCritiqueStatus = 'error';
                                    directSub.solutionCritiqueError = error.message || "Initial critique failed";
                                    console.error(`[Deepthink] Initial critique failed for ${mainStrategy.id}:`, error.message);
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                }
                            })();

                            initialCritiquePromises.push(critiquePromise);
                        });

                        await Promise.allSettled(initialCritiquePromises);
                        console.log('[Deepthink] Initial critiques complete');

                        // Only run PostQualityFilter if enabled
                        if (postQualityFilterEnabled) {
                            console.log('[Deepthink] Starting PostQualityFilter workflow...');
                            currentProcess.postQualityFilterStatus = 'processing';
                            currentProcess.postQualityFilterIterationCount = 0;
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                            // Initialize history managers
                            const postQualityFilterHistoryManager = new PostQualityFilterHistoryManager(
                                customPromptsDeepthinkState.sys_deepthink_postQualityFilter,
                                challengeText
                            );
                            const strategiesGeneratorHistoryManager = new StrategiesGeneratorHistoryManager(
                                customPromptsDeepthinkState.sys_deepthink_initialStrategy,
                                challengeText
                            );



                            // Run PostQualityFilter iterations (max 3)
                            for (let pqfIteration = 1; pqfIteration <= 3; pqfIteration++) {
                                if (currentProcess.isStopRequested) break;
                                console.log(`[Deepthink] PostQualityFilter iteration ${pqfIteration}...`);
                                currentProcess.postQualityFilterIterationCount = pqfIteration;

                                // Get all strategies with their solutions and critiques
                                const strategiesWithExecutions: Array<{
                                    strategyId: string;
                                    strategyText: string;
                                    solutionAttempt: string;
                                    solutionCritique: string;
                                }> = [];

                                currentProcess.initialStrategies.forEach(mainStrategy => {
                                    if (mainStrategy.isKilledByRedTeam) return;
                                    const directSub = mainStrategy.subStrategies[0];
                                    if (!directSub || !directSub.solutionAttempt || !directSub.solutionCritique) return;

                                    strategiesWithExecutions.push({
                                        strategyId: mainStrategy.id,
                                        strategyText: mainStrategy.strategyText,
                                        solutionAttempt: directSub.solutionAttempt,
                                        solutionCritique: directSub.solutionCritique
                                    });
                                });

                                if (strategiesWithExecutions.length === 0) {
                                    console.log('[Deepthink] No strategies available for PostQualityFilter');
                                    break;
                                }

                                // Build prompt using history manager
                                const pqfPromptMessages = await postQualityFilterHistoryManager.buildPromptForIteration(
                                    strategiesWithExecutions,
                                    pqfIteration
                                );
                                const pqfPrompt = pqfPromptMessages.map(m => m.content).join('\n\n');

                                // Create PostQualityFilter agent
                                const pqfAgent: DeepthinkPostQualityFilterData = {
                                    id: `postqf-${pqfIteration}`,
                                    iterationNumber: pqfIteration,
                                    requestPrompt: pqfPrompt,
                                    prunedStrategyIds: [],
                                    continuedStrategyIds: [],
                                    status: 'processing',
                                    isDetailsOpen: true
                                };
                                currentProcess.postQualityFilterAgents.push(pqfAgent);
                                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                try {
                                    // Call PostQualityFilter agent
                                    const pqfResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: pqfPrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_postQualityFilter,
                                        true,
                                        `PostQualityFilter Iteration ${pqfIteration}`,
                                        pqfAgent,
                                        'retryAttempt'
                                    );

                                    pqfAgent.evaluationResponse = cleanTextOutput(pqfResponse);
                                    pqfAgent.rawResponse = pqfResponse;

                                    // Parse JSON response
                                    let cleanedResponse = pqfResponse.trim();
                                    cleanedResponse = cleanedResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                                    cleanedResponse = cleanedResponse.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
                                    const jsonStart = cleanedResponse.indexOf('{');
                                    const jsonEnd = cleanedResponse.lastIndexOf('}');
                                    if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
                                        throw new Error('No valid JSON object boundaries found');
                                    }
                                    cleanedResponse = cleanedResponse.substring(jsonStart, jsonEnd + 1);
                                    const parsed = JSON.parse(cleanedResponse);

                                    // Extract decisions
                                    const updateIds: string[] = []; // Strategies that need updating
                                    const keepIds: string[] = []; // Strategies that are good
                                    let reasoningHtml = '<div class="post-quality-filter-results">';

                                    // Create set of valid strategy IDs that were sent for evaluation
                                    const validStrategyIds = new Set(strategiesWithExecutions.map(s => s.strategyId.trim().toLowerCase()));

                                    if (parsed.analysis_summary) {
                                        reasoningHtml += `<h4>Analysis Summary</h4><p>${renderMathContent(parsed.analysis_summary)}</p>`;
                                    }

                                    if (Array.isArray(parsed.strategies)) {
                                        parsed.strategies.forEach((strategyEval: any) => {
                                            const decision = String(strategyEval.decision || '').toLowerCase();
                                            const id = strategyEval.strategy_id || '';
                                            const reasoning = strategyEval.reasoning || 'No reasoning provided';

                                            // CRITICAL: Validate that this strategy was actually sent for evaluation
                                            const cleanId = String(id).trim().toLowerCase();
                                            if (!validStrategyIds.has(cleanId)) {
                                                console.log(`[Deepthink] PostQualityFilter returned decision for unexpected strategy "${id}" - IGNORING`);
                                                return; // Skip this decision
                                            }

                                            if (decision === 'update') {
                                                updateIds.push(id);
                                            } else if (decision === 'keep') {
                                                keepIds.push(id);
                                            }

                                            reasoningHtml += `
                                            <div class="strategy-evaluation-item">
                                                <div class="evaluation-header">
                                                    <span class="strategy-id">${id}</span>
                                                    <span class="decision-badge decision-${decision}">${decision}</span>
                                                </div>
                                                <div class="evaluation-reason">
                                                    ${renderMathContent(reasoning)}
                                                </div>
                                            </div>`;
                                        });
                                    }

                                    reasoningHtml += '</div>';
                                    pqfAgent.reasoning = reasoningHtml;
                                    pqfAgent.prunedStrategyIds = updateIds; // Reusing this field for updateIds
                                    pqfAgent.continuedStrategyIds = keepIds; // Reusing this field for keepIds
                                    pqfAgent.status = 'completed';

                                    // Add to history (both user prompt and AI response)
                                    await postQualityFilterHistoryManager.addFilterDecision(pqfResponse, pqfPrompt);

                                    console.log(`[Deepthink] PostQualityFilter: ${updateIds.length} strategies need update, ${keepIds.length} kept`);

                                    // If no strategies need update, stop
                                    if (updateIds.length === 0) {
                                        console.log('[Deepthink] No strategies need update - stopping PostQualityFilter workflow');
                                        break;
                                    }

                                    // If this is the 3rd iteration, don't update strategies
                                    if (pqfIteration === 3) {
                                        console.log('[Deepthink] Reached max PostQualityFilter iterations (3) - stopping');
                                        break;
                                    }

                                    // Generate UPDATED strategies (same IDs, new text)
                                    console.log(`[Deepthink] Updating ${updateIds.length} flawed strategies...`);

                                    const strategiesGenPromptMessages = await strategiesGeneratorHistoryManager.buildPromptForGeneration(
                                        updateIds.length,
                                        updateIds,
                                        keepIds,
                                        pqfIteration
                                    );
                                    const strategiesGenPrompt = strategiesGenPromptMessages.map(m => m.content).join('\n\n');

                                    const updatedStrategiesResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: strategiesGenPrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_initialStrategy,
                                        true,
                                        `Strategy Updates (PostQualityFilter Iteration ${pqfIteration})`,
                                        currentProcess,
                                        'retryAttempt'
                                    );

                                    const updatedStrategies = parseJsonSuggestions(updatedStrategiesResponse, 'strategies', updateIds.length);

                                    // Add to history (user prompt + AI response)
                                    await strategiesGeneratorHistoryManager.addGeneratedStrategies(updatedStrategiesResponse, strategiesGenPrompt);

                                    // Update existing strategies IN-PLACE (same IDs)
                                    const updatedStrategyObjects: DeepthinkMainStrategyData[] = [];
                                    for (let i = 0; i < Math.min(updatedStrategies.length, updateIds.length); i++) {
                                        const strategyId = updateIds[i];
                                        const cleanId = String(strategyId).trim().toLowerCase();
                                        const existingStrategy = currentProcess.initialStrategies.find(s =>
                                            s.id.trim().toLowerCase() === cleanId
                                        );

                                        if (existingStrategy) {
                                            // Update strategy text IN-PLACE
                                            existingStrategy.strategyText = updatedStrategies[i];
                                            existingStrategy.updatedByPostQualityFilter = true;
                                            existingStrategy.postQualityFilterIteration = pqfIteration;

                                            // Reset sub-strategy for re-execution
                                            const directSub = existingStrategy.subStrategies[0];
                                            if (directSub) {
                                                directSub.subStrategyText = updatedStrategies[i];
                                                directSub.status = 'pending';
                                                directSub.solutionAttempt = undefined;
                                                directSub.solutionCritique = undefined;
                                                directSub.solutionCritiqueStatus = undefined;
                                            }

                                            updatedStrategyObjects.push(existingStrategy);
                                        }
                                    }

                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    // Re-execute solutions for updated strategies
                                    console.log(`[Deepthink] Re-executing solutions for ${updatedStrategyObjects.length} updated strategies...`);
                                    const updatedStrategyExecutionPromises = updatedStrategyObjects.map(async (strategy) => {
                                        const directSub = strategy.subStrategies[0];
                                        if (!directSub) return;

                                        try {
                                            directSub.status = 'processing';
                                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                            const solutionPrompt = customPromptsDeepthinkState.user_deepthink_solutionAttempt
                                                .replace('{{originalProblemText}}', challengeText)
                                                .replace('{{assignedStrategy}}', strategy.strategyText)
                                                .replace('{{knowledgePacket}}', currentProcess.knowledgePacket || '');

                                            directSub.requestPromptSolutionAttempt = solutionPrompt;

                                            const solutionResponse = await makeDeepthinkApiCall(
                                                parts.concat([{ text: solutionPrompt }]),
                                                customPromptsDeepthinkState.sys_deepthink_solutionAttempt,
                                                false,
                                                `Solution Execution for ${strategy.id} (Updated)`,
                                                directSub,
                                                'retryAttempt'
                                            );

                                            directSub.solutionAttempt = cleanTextOutput(solutionResponse);
                                            directSub.status = 'completed';
                                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                            // Generate critique immediately
                                            directSub.solutionCritiqueStatus = 'processing';
                                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                            const solutionsText = `${directSub.id}:\nSub-Strategy: ${directSub.subStrategyText}\n\nSolution Attempt:\n${directSub.solutionAttempt}`;

                                            const critiquePrompt = customPromptsDeepthinkState.user_deepthink_solutionCritique
                                                .replace('{{originalProblemText}}', challengeText)
                                                .replace('{{currentMainStrategy}}', strategy.strategyText)
                                                .replace('{{allSubStrategiesAndSolutions}}', solutionsText);

                                            directSub.requestPromptSolutionCritique = critiquePrompt;

                                            const critiqueResponse = await makeDeepthinkApiCall(
                                                parts.concat([{ text: critiquePrompt }]),
                                                customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                                false,
                                                `Solution Critique for ${strategy.id} (Updated)`,
                                                directSub,
                                                'solutionCritiqueRetryAttempt'
                                            );

                                            directSub.solutionCritique = cleanTextOutput(critiqueResponse);
                                            directSub.solutionCritiqueStatus = 'completed';
                                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                        } catch (error: any) {
                                            directSub.status = 'error';
                                            directSub.error = error.message || 'Solution execution failed';
                                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                        }
                                    });

                                    await Promise.allSettled(updatedStrategyExecutionPromises);
                                    console.log(`[Deepthink] Completed re-execution for updated strategies`);

                                    // CRITICAL: Mark updated strategies so PQF re-evaluates them with new executions
                                    postQualityFilterHistoryManager.markStrategiesAsUpdated(updateIds);
                                    console.log(`[Deepthink] Marked ${updateIds.length} strategies as updated for re-evaluation`);

                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                } catch (error: any) {
                                    pqfAgent.status = 'error';
                                    pqfAgent.error = error.message || 'PostQualityFilter failed';
                                    console.error(`[Deepthink] PostQualityFilter error:`, error.message);
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                    break;
                                }
                            }

                            currentProcess.postQualityFilterStatus = 'completed';
                            console.log('[Deepthink] PostQualityFilter workflow complete');
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        } else {
                            // PostQualityFilter is disabled - proceed directly with current strategies
                            console.log('[Deepthink] PostQualityFilter disabled - proceeding with current strategies');
                            currentProcess.postQualityFilterStatus = 'completed';
                        }
                    }

                    // StructuredSolutionPool mode enabled
                    currentProcess.structuredSolutionPoolEnabled = true;
                    currentProcess.structuredSolutionPoolStatus = 'processing';
                    console.log('[Deepthink] Starting StructuredSolutionPool mode with iterative corrections...');

                    // Get active main strategies (sub-strategies are disabled in this mode)
                    const activeMainStrategies = currentProcess.initialStrategies.filter(s => !s.isKilledByRedTeam);

                    if (activeMainStrategies.length === 0) {
                        console.log('[Deepthink] No active main strategies. Skipping StructuredSolutionPool.');
                        currentProcess.structuredSolutionPoolStatus = 'completed';
                    } else {
                        // Helper function to build StructuredSolutionPool string
                        const buildStructuredSolutionPool = (): string => {
                            const poolData: {
                                strategies: Array<{
                                    strategy_id: string;
                                    strategy_text: string;
                                    original_solution: string;
                                    iterations: Array<{
                                        iteration_number: number;
                                        critique: string;
                                        corrected_solution: string;
                                    }>;
                                    latest_critique?: string;
                                    solution_pool?: any;
                                }>;
                            } = { strategies: [] };

                            activeMainStrategies.forEach((mainStrategy) => {
                                const directSub = mainStrategy.subStrategies[0];
                                if (!directSub || directSub.isKilledByRedTeam || !directSub.solutionAttempt) return;

                                const strategyEntry: any = {
                                    strategy_id: mainStrategy.id,
                                    strategy_text: mainStrategy.strategyText,
                                    original_solution: directSub.solutionAttempt,
                                    iterations: []
                                };

                                // Add critiques and corrected solutions from COMPLETED iterations
                                // History compression: only keep the last 3 iterations in full detail
                                const iterations = (directSub as any).iterativeCorrections?.iterations || [];
                                const compressionThreshold = 3;
                                const totalIterations = iterations.length;
                                if (totalIterations > compressionThreshold) {
                                    strategyEntry.compressed_iterations_note = `Iterations 1-${totalIterations - compressionThreshold} completed and compressed. See atomic_reconstruction in solution_pool for summaries.`;
                                }
                                const startIdx = Math.max(0, totalIterations - compressionThreshold);
                                iterations.forEach((iter: any, idx: number) => {
                                    if (idx >= startIdx) {
                                        strategyEntry.iterations.push({
                                            iteration_number: idx + 1,
                                            critique: iter.critique,
                                            corrected_solution: iter.correctedSolution
                                        });
                                    }
                                });

                                // CRITICAL FIX: Add the LATEST critique if it exists but isn't in the iterations array yet
                                if (directSub.solutionCritique && directSub.solutionCritiqueStatus === 'completed') {
                                    const lastIter = iterations.length > 0 ? iterations[iterations.length - 1] : null;
                                    if (!lastIter || lastIter.critique !== directSub.solutionCritique) {
                                        strategyEntry.latest_critique = directSub.solutionCritique;
                                    }
                                }

                                // Add solution pool output if exists
                                const poolAgent = currentProcess.structuredSolutionPoolAgents.find(a => a.mainStrategyId === mainStrategy.id);
                                if (poolAgent && poolAgent.poolResponse) {
                                    // Try to use parsed pool response if available, otherwise include raw
                                    strategyEntry.solution_pool = poolAgent.parsedPoolResponse || poolAgent.poolResponse;
                                }

                                poolData.strategies.push(strategyEntry);
                            });

                            return JSON.stringify(poolData, null, 2);
                        };

                        // Helper function to make API call with timeout
                        const makeDeepthinkApiCallWithTimeout = async (
                            parts: Part[],
                            systemInstruction: string,
                            isJson: boolean,
                            stepDescription: string,
                            targetStatusField: any,
                            retryAttemptField: 'retryAttempt' | 'selfImprovementRetryAttempt' | 'testerRetryAttempt' | 'hypothesisGenRetryAttempt' | 'solutionCritiqueRetryAttempt' | 'dissectedSynthesisRetryAttempt'
                        ): Promise<string> => {
                            return Promise.race([
                                makeDeepthinkApiCall(parts, systemInstruction, isJson, stepDescription, targetStatusField, retryAttemptField),
                                new Promise<string>((_, reject) =>
                                    setTimeout(() => reject(new Error(`Timeout after ${STRUCTURED_SOLUTION_POOL_TIMEOUT_MS / 1000 / 60} minutes`)),
                                        STRUCTURED_SOLUTION_POOL_TIMEOUT_MS)
                                )
                            ]);
                        };

                        // Initialize iterative corrections for all active strategies
                        activeMainStrategies.forEach((mainStrategy) => {
                            const directSub = mainStrategy.subStrategies[0];
                            if (directSub && !directSub.isKilledByRedTeam && directSub.solutionAttempt) {
                                (directSub as any).iterativeCorrections = {
                                    iterations: [],
                                    status: 'processing'
                                };
                            }
                        });

                        // Initialize StructuredSolutionPool
                        currentProcess.structuredSolutionPool = buildStructuredSolutionPool();
                        console.log('[Deepthink] Initialized StructuredSolutionPool');

                        // Track initial version for evolution viewer
                        if (currentProcess.structuredSolutionPool) {
                            addSolutionPoolVersion(currentProcess.id, currentProcess.structuredSolutionPool, 0);
                        }

                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                        // Initialize history managers for critiques, pool agents, and correctors
                        const critiqueHistoryManagers = new Map<string, SolutionCritiqueHistoryManager>();
                        const poolHistoryManagers = new Map<string, StructuredSolutionPoolHistoryManager>();
                        const correctionHistoryManagers = new Map<string, SolutionCorrectionHistoryManager>();

                        activeMainStrategies.forEach((mainStrategy) => {
                            const directSub = mainStrategy.subStrategies[0];
                            if (!directSub || directSub.isKilledByRedTeam || !directSub.solutionAttempt) return;

                            // Create critique history manager with original solution
                            critiqueHistoryManagers.set(
                                mainStrategy.id,
                                new SolutionCritiqueHistoryManager(
                                    customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                    challengeText,
                                    mainStrategy.strategyText,
                                    directSub.solutionAttempt
                                )
                            );

                            // Create pool history manager
                            poolHistoryManagers.set(
                                mainStrategy.id,
                                new StructuredSolutionPoolHistoryManager(
                                    customPromptsDeepthinkState.sys_deepthink_structuredSolutionPool,
                                    challengeText,
                                    mainStrategy.id,
                                    mainStrategy.strategyText
                                )
                            );
                        });

                        // Main iteration loop (configurable depth)
                        const iterativeDepth = getIterativeDepth();
                        for (let iterNum = 1; iterNum <= iterativeDepth; iterNum++) {
                            if (currentProcess.isStopRequested) break;
                            console.log(`[Deepthink] Starting StructuredSolutionPool iteration ${iterNum}...`);

                            // PHASE 1: Generate critiques for all strategies in parallel
                            console.log(`[Deepthink] Phase 1: Generating critiques for iteration ${iterNum}...`);
                            const critiquePromises = activeMainStrategies.map(async (mainStrategy) => {
                                const directSub = mainStrategy.subStrategies[0];
                                if (!directSub || directSub.isKilledByRedTeam || !directSub.solutionAttempt) return;

                                if (currentProcess.isStopRequested) {
                                    directSub.solutionCritiqueStatus = 'cancelled';
                                    return;
                                }

                                try {
                                    directSub.solutionCritiqueStatus = 'processing';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    // Get history manager for this strategy
                                    const critiqueHistoryManager = critiqueHistoryManagers.get(mainStrategy.id);
                                    if (!critiqueHistoryManager) throw new Error(`No critique history manager for ${mainStrategy.id}`);

                                    // Get the current solution to critique
                                    let currentSolution: string;
                                    const iterations = (directSub as any).iterativeCorrections?.iterations || [];
                                    if (iterations.length > 0) {
                                        currentSolution = iterations[iterations.length - 1].correctedSolution;
                                    } else {
                                        currentSolution = directSub.solutionAttempt || '';
                                    }

                                    // Build critique prompt using history manager
                                    const critiquePromptMessages = await critiqueHistoryManager.buildPromptForIteration(
                                        currentSolution,
                                        iterNum
                                    );

                                    const critiquePrompt = critiquePromptMessages.map(m => m.content).join('\n\n');
                                    directSub.requestPromptSolutionCritique = critiquePrompt;

                                    const critiqueResponse = await makeDeepthinkApiCallWithTimeout(
                                        parts.concat([{ text: critiquePrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                        false,
                                        `Solution Critique Iteration ${iterNum} for ${mainStrategy.id}`,
                                        directSub,
                                        'solutionCritiqueRetryAttempt'
                                    );

                                    // Add critique to history
                                    await critiqueHistoryManager.addCritique(critiqueResponse);

                                    // Add corrected solution to history if this isn't the first iteration
                                    if (iterNum > 1 && iterations.length > 0) {
                                        await critiqueHistoryManager.addCorrectedSolution(
                                            iterations[iterations.length - 1].correctedSolution,
                                            iterNum
                                        );
                                    }

                                    directSub.solutionCritique = critiqueResponse;
                                    directSub.solutionCritiqueStatus = 'completed';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    const critiqueData: DeepthinkSolutionCritiqueData = {
                                        id: `critique-${mainStrategy.id}-iter${iterNum}`,
                                        subStrategyId: directSub.id,
                                        mainStrategyId: mainStrategy.id,
                                        requestPrompt: critiquePrompt,
                                        critiqueResponse: critiqueResponse,
                                        status: 'completed',
                                        isDetailsOpen: true,
                                        retryAttempt: iterNum
                                    };
                                    currentProcess.solutionCritiques.push(critiqueData);
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                } catch (error: any) {
                                    directSub.solutionCritiqueStatus = 'error';
                                    directSub.solutionCritiqueError = error.message || "Critique failed";
                                    console.error(`[Deepthink] Critique failed for ${mainStrategy.id}:`, error.message);
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                }
                            });

                            await Promise.allSettled(critiquePromises);
                            console.log(`[Deepthink] All critiques completed for iteration ${iterNum}`);

                            // Update StructuredSolutionPool to include the new critiques
                            currentProcess.structuredSolutionPool = buildStructuredSolutionPool();
                            console.log(`[Deepthink] Updated StructuredSolutionPool after critique generation`);
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                            // PHASE 2: Generate solution pools for all strategies in parallel
                            console.log(`[Deepthink] Phase 2: Generating solution pools for iteration ${iterNum}...`);
                            const poolPromises = activeMainStrategies.map(async (mainStrategy) => {
                                const directSub = mainStrategy.subStrategies[0];
                                if (!directSub || directSub.isKilledByRedTeam || !directSub.solutionAttempt) return;
                                if (directSub.solutionCritiqueStatus !== 'completed' || !directSub.solutionCritique) return;

                                if (currentProcess.isStopRequested) return;

                                // Find or create pool agent for this strategy
                                let poolAgent = currentProcess.structuredSolutionPoolAgents.find(a => a.mainStrategyId === mainStrategy.id);
                                if (!poolAgent) {
                                    poolAgent = {
                                        id: `pool-${mainStrategy.id}`,
                                        mainStrategyId: mainStrategy.id,
                                        status: 'pending',
                                        isDetailsOpen: true
                                    };
                                    currentProcess.structuredSolutionPoolAgents.push(poolAgent);
                                }

                                try {
                                    poolAgent.status = 'processing';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    // Get history manager for this strategy
                                    const poolHistoryManager = poolHistoryManagers.get(mainStrategy.id);
                                    if (!poolHistoryManager) throw new Error(`No history manager for ${mainStrategy.id}`);

                                    // Build prompt using history manager
                                    const poolPromptMessages = await poolHistoryManager.buildPromptForIteration(
                                        currentProcess.structuredSolutionPool || '',
                                        directSub.solutionCritique || '',
                                        iterNum
                                    );

                                    const poolPrompt = poolPromptMessages.map(m => m.content).join('\n\n');
                                    poolAgent.requestPrompt = poolPrompt;

                                    const poolResponse = await makeDeepthinkApiCallWithTimeout(
                                        parts.concat([{ text: poolPrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_structuredSolutionPool,
                                        true,
                                        `StructuredSolutionPool Agent for ${mainStrategy.id} Iteration ${iterNum}`,
                                        poolAgent,
                                        'retryAttempt'
                                    );

                                    // Add response to history
                                    await poolHistoryManager.addPoolResponse(poolResponse);

                                    poolAgent.poolResponse = poolResponse;

                                    // Parse JSON response for UI consumption
                                    try {
                                        const parsed = parseJsonSafe(poolResponse, `SolutionPool-${mainStrategy.id}`);
                                        if (parsed && Array.isArray(parsed.solutions)) {
                                            poolAgent.parsedPoolResponse = {
                                                strategy_id: parsed.strategy_id || mainStrategy.id,
                                                solutions: parsed.solutions.map((s: any) => ({
                                                    title: s.title || 'Untitled Solution',
                                                    approach_summary: s.approach_summary || '',
                                                    content: s.content || '',
                                                    confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
                                                    internal_critique: s.internal_critique || '',
                                                    atomic_reconstruction: s.atomic_reconstruction || ''
                                                }))
                                            };
                                        }
                                    } catch (parseError: any) {
                                        console.warn(`[Deepthink] Failed to parse pool JSON for ${mainStrategy.id}, raw text will be used:`, parseError.message);
                                    }

                                    poolAgent.status = 'completed';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                } catch (error: any) {
                                    poolAgent.status = 'error';
                                    poolAgent.error = error.message || "Solution pool generation failed";
                                    console.error(`[Deepthink] Solution pool failed for ${mainStrategy.id}:`, error.message);
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                }
                            });

                            await Promise.allSettled(poolPromises);
                            console.log(`[Deepthink] All solution pools completed for iteration ${iterNum}`);

                            // Update the StructuredSolutionPool with new pool outputs
                            currentProcess.structuredSolutionPool = buildStructuredSolutionPool();
                            console.log(`[Deepthink] Updated StructuredSolutionPool after pool generation`);

                            // Track version for evolution viewer
                            if (currentProcess.structuredSolutionPool) {
                                addSolutionPoolVersion(currentProcess.id, currentProcess.structuredSolutionPool, iterNum);
                            }

                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                            // PHASE 3: Generate corrected solutions for all strategies in parallel
                            console.log(`[Deepthink] Phase 3: Generating corrected solutions for iteration ${iterNum}...`);
                            const correctionPromises = activeMainStrategies.map(async (mainStrategy) => {
                                const directSub = mainStrategy.subStrategies[0];
                                if (!directSub || directSub.isKilledByRedTeam || !directSub.solutionAttempt) return;
                                if (directSub.solutionCritiqueStatus !== 'completed' || !directSub.solutionCritique) return;

                                if (currentProcess.isStopRequested) {
                                    directSub.selfImprovementStatus = 'cancelled';
                                    return;
                                }

                                try {
                                    directSub.selfImprovementStatus = 'processing';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    // Get or create correction history manager for this strategy
                                    let correctionManager = correctionHistoryManagers.get(mainStrategy.id);

                                    // Get current solution to correct
                                    let currentSolution: string;
                                    const iterations = (directSub as any).iterativeCorrections?.iterations || [];
                                    if (iterations.length > 0) {
                                        currentSolution = iterations[iterations.length - 1].correctedSolution;
                                    } else {
                                        currentSolution = directSub.solutionAttempt || '';
                                    }

                                    if (iterNum === 1) {
                                        // Create manager with pool context on first iteration
                                        correctionManager = new SolutionCorrectionHistoryManager(
                                            customPromptsDeepthinkState.sys_deepthink_selfImprovement,
                                            challengeText,
                                            mainStrategy.strategyText,
                                            currentSolution,
                                            directSub.solutionCritique || '',
                                            mainStrategy.id,
                                            currentProcess.structuredSolutionPool || null // Pass full pool as context
                                        );
                                        correctionHistoryManagers.set(mainStrategy.id, correctionManager);
                                    } else {
                                        // Add new critique to existing manager
                                        if (correctionManager) {
                                            await correctionManager.addNewCritique(directSub.solutionCritique || '', iterNum);
                                        }
                                    }

                                    if (!correctionManager) throw new Error(`No correction manager for ${mainStrategy.id}`);

                                    // Build correction prompt using history manager (pass current pool for iterations 2+)
                                    const correctionPromptMessages = await correctionManager.buildPromptForIteration(
                                        directSub.solutionCritique || '',
                                        iterNum,
                                        iterNum > 1 ? currentProcess.structuredSolutionPool : null
                                    );

                                    const correctionPrompt = correctionPromptMessages.map(m => m.content).join('\n\n');
                                    directSub.requestPromptSelfImprovement = correctionPrompt;

                                    const correctedSolution = await makeDeepthinkApiCallWithTimeout(
                                        parts.concat([{ text: correctionPrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_selfImprovement,
                                        false,
                                        `Solution Correction Iteration ${iterNum} for ${mainStrategy.id}`,
                                        directSub,
                                        'selfImprovementRetryAttempt'
                                    );

                                    // Add corrected solution to history
                                    await correctionManager.addCorrectedSolution(correctedSolution);

                                    directSub.refinedSolution = correctedSolution;
                                    directSub.selfImprovementStatus = 'completed';

                                    // Add to iterations
                                    (directSub as any).iterativeCorrections.iterations.push({
                                        iterationNumber: iterNum,
                                        critique: directSub.solutionCritique || '',
                                        correctedSolution: correctedSolution,
                                        timestamp: Date.now()
                                    });

                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                } catch (error: any) {
                                    directSub.selfImprovementStatus = 'error';
                                    directSub.selfImprovementError = error.message || "Correction failed";
                                    console.error(`[Deepthink] Correction failed for ${mainStrategy.id}:`, error.message);
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                }
                            });

                            await Promise.allSettled(correctionPromises);
                            console.log(`[Deepthink] All corrections completed for iteration ${iterNum}`);

                            // Update the StructuredSolutionPool with new corrected solutions
                            currentProcess.structuredSolutionPool = buildStructuredSolutionPool();
                            console.log(`[Deepthink] Updated StructuredSolutionPool after corrections`);

                            // Track version for evolution viewer (final state for this iteration)
                            if (currentProcess.structuredSolutionPool) {
                                addSolutionPoolVersion(currentProcess.id, currentProcess.structuredSolutionPool, iterNum + 0.5);
                            }

                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        }

                        // Mark all iterative corrections as completed
                        activeMainStrategies.forEach((mainStrategy) => {
                            const directSub = mainStrategy.subStrategies[0];
                            if (directSub && (directSub as any).iterativeCorrections) {
                                (directSub as any).iterativeCorrections.status = 'completed';
                            }
                        });

                        currentProcess.structuredSolutionPoolStatus = 'completed';
                        console.log('[Deepthink] StructuredSolutionPool mode completed');
                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                    }

                } else {
                    // Non-iterative refinement mode with dissected observations synthesis
                    if (dissectedObservationsEnabled) {
                        currentProcess.dissectedSynthesisStatus = 'processing';
                        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                        try {
                            const solutionsWithCritiques = currentProcess.initialStrategies
                                .filter(mainStrategy => !mainStrategy.isKilledByRedTeam)
                                .map(mainStrategy => {
                                    const activeSubStrategies = mainStrategy.subStrategies
                                        .filter(sub => !sub.isKilledByRedTeam && sub.solutionAttempt);

                                    if (activeSubStrategies.length === 0) {
                                        return '';
                                    }

                                    const critiqueData = currentProcess.solutionCritiques.find(c => c.mainStrategyId === mainStrategy.id);
                                    const strategyCritique = critiqueData?.critiqueResponse || 'No critique available';

                                    const subStrategiesSolutions = activeSubStrategies
                                        .map(sub => {
                                            return `
═══════════════════════════════════════════════════════════════
SUB-STRATEGY:
${sub.subStrategyText}

THE EXECUTION:
${sub.solutionAttempt}
═══════════════════════════════════════════════════════════════`;
                                        })
                                        .join('\n\n');

                                    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRATEGY:
${mainStrategy.strategyText}

${subStrategiesSolutions}

ITS CRITIQUE (covers all sub-strategies above):
${strategyCritique}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                                })
                                .filter(section => section.trim().length > 0)
                                .join('\n\n\n');

                            const synthesisPrompt = customPromptsDeepthinkState.user_deepthink_dissectedSynthesis
                                .replace('{{originalProblemText}}', challengeText)
                                .replace('{{knowledgePacket}}', currentProcess.knowledgePacket || 'No hypothesis exploration performed.')
                                .replace('{{solutionsWithCritiques}}', solutionsWithCritiques || 'No solution attempts available.');

                            currentProcess.dissectedSynthesisRequestPrompt = synthesisPrompt;

                            const synthesisResponse = await makeDeepthinkApiCall(
                                parts.concat([{ text: synthesisPrompt }]),
                                customPromptsDeepthinkState.sys_deepthink_dissectedSynthesis,
                                false,
                                'Dissected Observations Synthesis',
                                currentProcess,
                                'dissectedSynthesisRetryAttempt'
                            );

                            currentProcess.dissectedObservationsSynthesis = synthesisResponse;
                            currentProcess.dissectedSynthesisStatus = 'completed';
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        } catch (error: any) {
                            currentProcess.dissectedSynthesisStatus = 'error';
                            currentProcess.dissectedSynthesisError = error.message || "Dissected synthesis failed";
                            if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                        }

                        if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during dissected synthesis.");
                    }

                    const improvementPromises: Promise<void>[] = [];

                    currentProcess.initialStrategies.forEach((mainStrategy) => {
                        mainStrategy.subStrategies.forEach((subStrategy) => {
                            if (subStrategy.isKilledByRedTeam || !subStrategy.solutionAttempt) return;

                            improvementPromises.push((async () => {
                                if (currentProcess.isStopRequested) {
                                    subStrategy.selfImprovementStatus = 'cancelled';
                                    subStrategy.selfImprovementError = "Process stopped by user.";
                                    return;
                                }

                                try {
                                    subStrategy.selfImprovementStatus = 'processing';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

                                    const provideAllSolutions = getProvideAllSolutionsToCorrectors();

                                    let solutionSection: string;

                                    if (provideAllSolutions) {
                                        const allSolutionsWithCritiques = currentProcess.initialStrategies
                                            .filter(strat => !strat.isKilledByRedTeam)
                                            .map(strat => {
                                                const activeSubs = strat.subStrategies
                                                    .filter(sub => !sub.isKilledByRedTeam && sub.solutionAttempt);

                                                if (activeSubs.length === 0) return '';

                                                const critiqueData = currentProcess.solutionCritiques.find(c => c.mainStrategyId === strat.id);
                                                const stratCritique = critiqueData?.critiqueResponse || 'No critique available';

                                                const subsSection = activeSubs
                                                    .map(sub => {
                                                        return `
═══════════════════════════════════════════════════════════════
SUB-STRATEGY: ${sub.id}${sub.id === subStrategy.id ? ' ← YOUR ASSIGNED SUB-STRATEGY' : ''}
${sub.subStrategyText}

THE EXECUTION:
${sub.solutionAttempt}
═══════════════════════════════════════════════════════════════`;
                                                    })
                                                    .join('\n\n');

                                                return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRATEGY: ${strat.id}${strat.id === mainStrategy.id ? ' ← YOUR ASSIGNED STRATEGY' : ''}
${strat.strategyText}

${subsSection}

ITS CRITIQUE (covers all sub-strategies above):
${stratCritique}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                                            })
                                            .filter(section => section.trim().length > 0)
                                            .join('\n\n\n');

                                        solutionSection = `<ALL SOLUTION ATTEMPTS WITH THEIR CRITIQUES ACROSS ALL STRATEGIES>
You are correcting the solution for sub-strategy: ${subStrategy.id}
Below you can see all solutions attempted across all strategies and sub-strategies with their critiques. Your assigned sub-strategy is marked clearly.

${allSolutionsWithCritiques}
</ALL SOLUTION ATTEMPTS WITH THEIR CRITIQUES ACROSS ALL STRATEGIES>`;
                                    } else {
                                        const strategyCritique = currentProcess.solutionCritiques.find(
                                            c => c.mainStrategyId === mainStrategy.id && c.status === 'completed'
                                        );

                                        solutionSection = `<Solution Critique For Your Provided Main Framework>
This analysis identifies problems in the specific solution attempt you have received as well as the problems in other solutions attempted in parallel inside this framework.
You have received the executed solution from the ${subStrategy.id}. You must take those findings seriously as well as learn from the other parallel critique in the same framework.
${strategyCritique?.critiqueResponse || 'No critique available for this strategy.'}
</Solution Critique For Your Provided Main Framework>

<ORIGINAL SOLUTION ATTEMPT>
${subStrategy.solutionAttempt || ''}
</ORIGINAL SOLUTION ATTEMPT>`;
                                    }

                                    if (dissectedObservationsEnabled && currentProcess.dissectedObservationsSynthesis) {
                                        solutionSection += `\n\n<DISSECTED OBSERVATIONS SYNTHESIS>
This synthesis consolidates diagnostic intelligence across ALL solutions, identifies patterns of failure, documents proven impossibilities, and provides correction guidance. Learn from mistakes made across all solution attempts, not just the solution you received. This is the most critical piece of synthesis and you must genuinely accept these findings and correct the solution.
${currentProcess.dissectedObservationsSynthesis}
</DISSECTED OBSERVATIONS SYNTHESIS>`;
                                    }

                                    const improvementPrompt = customPromptsDeepthinkState.user_deepthink_selfImprovement
                                        .replace('{{originalProblemText}}', challengeText)
                                        .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                        .replace('{{currentSubStrategy}}', subStrategy.subStrategyText)
                                        .replace('{{solutionAttempt}}', subStrategy.solutionAttempt || 'No solution attempt available')
                                        .replace('{{solutionCritique}}', subStrategy.solutionCritique || 'No critique available');

                                    subStrategy.requestPromptSelfImprovement = improvementPrompt;

                                    const improvementResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: improvementPrompt }]),
                                        customPromptsDeepthinkState.sys_deepthink_selfImprovement,
                                        false,
                                        `Self-Improvement for ${subStrategy.id}`,
                                        subStrategy,
                                        'selfImprovementRetryAttempt'
                                    );

                                    subStrategy.refinedSolution = improvementResponse;
                                    subStrategy.selfImprovementStatus = 'completed';
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                } catch (error: any) {
                                    subStrategy.selfImprovementStatus = 'error';
                                    subStrategy.selfImprovementError = error.message || "Self-improvement failed";
                                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                                }
                            })());
                        });
                    });

                    await Promise.allSettled(improvementPromises);
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during self-improvement.");

                currentProcess.strategicSolverComplete = true;
                if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

            } catch (error: any) {
                if (!(error instanceof PipelineStopRequestedError)) {
                    currentProcess.status = 'error';
                    currentProcess.error = `Strategic Solver failed: ${error.message}`;
                    if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
                }
                throw error;
            }
        })();

        await Promise.all([trackAPromise, trackBPromise]);

        currentProcess.finalJudgingStatus = 'processing';
        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

        const allSolutions: Array<{ id: string, solution: string, mainStrategyId: string, subStrategyText: string }> = [];

        currentProcess.initialStrategies.forEach(mainStrategy => {
            if (mainStrategy.isKilledByRedTeam) return;

            mainStrategy.subStrategies.forEach(subStrategy => {
                if (subStrategy.isKilledByRedTeam) return;

                const solution = subStrategy.refinedSolution || subStrategy.solutionAttempt;
                if (solution && subStrategy.selfImprovementStatus === 'completed') {
                    allSolutions.push({
                        id: subStrategy.id,
                        solution: solution,
                        mainStrategyId: mainStrategy.id,
                        subStrategyText: subStrategy.subStrategyText
                    });
                }
            });
        });

        if (allSolutions.length === 0) {
            currentProcess.finalJudgingStatus = 'error';
            currentProcess.finalJudgingError = "No completed solutions available for final review.";
        } else {
            const sysPromptFinalJudge = customPromptsDeepthinkState.sys_deepthink_finalJudge;

            const finalSolutionsText = allSolutions.map((sol, i) =>
                `<SOLUTION_${i + 1}>\n` +
                `ID: ${sol.id}\n` +
                `Main Strategy: ${sol.mainStrategyId}\n` +
                `Sub-Strategy: ${sol.subStrategyText.substring(0, 100)}...\n` +
                `Solution Text:\n${sol.solution}\n` +
                `</SOLUTION_${i + 1}>`
            ).join('\n\n');

            const userPromptFinalJudge = `Original Challenge: ${challengeText}\n\nBelow are ${allSolutions.length} candidate solutions from different strategic approaches and sub-strategies. Your task is to select the SINGLE OVERALL BEST solution based on correctness, efficiency, elegance, and clarity.\n\nPresent your final verdict as a JSON object with the following structure: \`{"best_solution_id": "ID of the winning solution", "final_solution_text": "The full text of the absolute best solution", "final_reasoning": "Your detailed reasoning for why this solution is the ultimate winner"}\`\n\n${finalSolutionsText}`;

            currentProcess.finalJudgingRequestPrompt = userPromptFinalJudge;

            try {
                const finalJudgingResponseText = await makeDeepthinkApiCall(
                    [{ text: userPromptFinalJudge }],
                    sysPromptFinalJudge,
                    true,
                    'Final Judging',
                    currentProcess,
                    'retryAttempt'
                );
                currentProcess.finalJudgingResponseText = finalJudgingResponseText;
                const cleanedJson = cleanOutputByType(finalJudgingResponseText, 'json');
                const parsed = JSON.parse(cleanedJson);

                if (!parsed.best_solution_id || !parsed.final_reasoning) {
                    throw new Error("Final Judge LLM response is missing critical fields (best_solution_id, final_reasoning).");
                }

                const winningSolution = allSolutions.find(sol => sol.id === parsed.best_solution_id);
                const solutionTitle = winningSolution ?
                    `Sub-Strategy "${winningSolution.subStrategyText.substring(0, 60)}..." from Main Strategy ${winningSolution.mainStrategyId}` :
                    `Solution ${parsed.best_solution_id}`;

                currentProcess.finalJudgedBestStrategyId = winningSolution?.id || parsed.best_solution_id;
                currentProcess.finalJudgedBestSolution = `### Final Judged Best Solution\n\n**Solution ID:** <span class="sub-strategy-purple-id">${parsed.best_solution_id}</span>\n\n**Origin:** ${solutionTitle}\n\n**Final Reasoning:**\n${parsed.final_reasoning}\n\n---\n\n**Definitive Solution:**\n${winningSolution?.solution || parsed.final_solution_text || 'Solution not found'}`;
                currentProcess.finalJudgingStatus = 'completed';

            } catch (e: any) {
                currentProcess.finalJudgingStatus = 'error';
                currentProcess.finalJudgingError = e.message || "Failed to perform final judging.";
            }
        }

        currentProcess.status = 'completed';
        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();

    } catch (error: any) {
        if (error instanceof PipelineStopRequestedError) {
            currentProcess.status = 'stopped';
        } else {
            currentProcess.status = 'error';
            currentProcess.error = error.message;
        }
        if (renderActiveDeepthinkPipeline) renderActiveDeepthinkPipeline();
    } finally {
        updateControlsState({ isGenerating: false });
    }
}
