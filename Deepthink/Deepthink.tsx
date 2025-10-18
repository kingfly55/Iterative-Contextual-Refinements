import { Part, GenerateContentResponse } from "@google/genai";
import { AIProvider } from '../Routing/AIProvider';
import { CustomizablePromptsDeepthink, createDefaultCustomPromptsDeepthink } from './DeepthinkPrompts';
import { renderMathContent } from '../Components/RenderMathMarkdown';
import { cleanupIterativeCorrectionsRoot } from '../Contextual/ContextualUI';

// Import types and constants from main index.tsx
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
    // Iterative corrections data
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
}

export interface DeepthinkPipelineState {
    id: string;
    challenge: string;
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
    redTeamAgents: DeepthinkRedTeamData[];
    redTeamStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    redTeamError?: string;
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
}

// Pipeline Stop Error Class
class PipelineStopRequestedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PipelineStopRequestedError";
    }
}

// Global variables and dependencies that need to be passed in or imported
let getAIProvider: (() => AIProvider | null) | null;
let activeDeepthinkPipeline: DeepthinkPipelineState | null;
let setActiveDeepthinkPipeline: ((pipeline: DeepthinkPipelineState | null) => void) | null;

// Helper functions that need to be imported/passed
let callGemini: (parts: Part[], temperature: number, modelToUse: string, systemInstruction?: string, isJson?: boolean, topP?: number) => Promise<GenerateContentResponse>;
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
let getProvideAllSolutionsToCorrectors: () => boolean;
let escapeHtml: (unsafe: string) => string;
let cleanTextOutput: (text: string) => string;
let updateControlsState: (newState: any) => void;
let customPromptsDeepthinkState: CustomizablePromptsDeepthink;
let tabsNavContainer: HTMLElement | null;
let pipelinesContentContainer: HTMLElement | null;

// Constants for retry logic
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000; // 20 seconds
const BACKOFF_FACTOR = 2; // Factor by which delay increases

// Initialization function to set up dependencies
export function initializeDeepthinkModule(dependencies: {
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
    getProvideAllSolutionsToCorrectors: () => boolean;
    cleanTextOutput: (text: string) => string;
    customPromptsDeepthinkState: CustomizablePromptsDeepthink;
    tabsNavContainer: HTMLElement | null;
    pipelinesContentContainer: HTMLElement | null;
    setActiveDeepthinkPipeline: (pipeline: DeepthinkPipelineState | null) => void;
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
    getProvideAllSolutionsToCorrectors = dependencies.getProvideAllSolutionsToCorrectors;
    cleanTextOutput = dependencies.cleanTextOutput;
    escapeHtml = dependencies.escapeHtml;
    tabsNavContainer = dependencies.tabsNavContainer;
    pipelinesContentContainer = dependencies.pipelinesContentContainer;
    setActiveDeepthinkPipeline = dependencies.setActiveDeepthinkPipeline;
}

// Deepthink strategy tab activation
export function activateDeepthinkStrategyTab(strategyIndex: number) {
    if (!activeDeepthinkPipeline) return;
    activeDeepthinkPipeline.activeStrategyTab = strategyIndex;

    const subTabButtons = document.querySelectorAll('.sub-tab-button');
    subTabButtons.forEach((button, index) => {
        button.classList.toggle('active', index === strategyIndex);
    });

    const subTabContents = document.querySelectorAll('.sub-tab-content');
    subTabContents.forEach((content, index) => {
        content.classList.toggle('active', index === strategyIndex);
    });
}


// Deepthink red team evaluation function
export async function runDeepthinkRedTeamEvaluation(
    currentProcess: DeepthinkPipelineState,
    problemText: string,
    imageBase64?: string | null,
    imageMimeType?: string | null,
    makeDeepthinkApiCall?: any
): Promise<void> {
    if (!currentProcess || !makeDeepthinkApiCall) return;

    const validStrategies = currentProcess.initialStrategies.filter(s =>
        s.status === 'completed' && s.subStrategies && s.subStrategies.length > 0
    );

    if (validStrategies.length === 0) {
        currentProcess.redTeamStatus = 'completed';
        currentProcess.redTeamComplete = true;
        currentProcess.redTeamAgents = [];
        renderActiveDeepthinkPipeline();
        return;
    }

    currentProcess.redTeamAgents = validStrategies.map((strategy, index) => ({
        id: `redteam-${index}`,
        assignedStrategyId: strategy.id,
        killedStrategyIds: [],
        killedSubStrategyIds: [],
        status: 'pending',
        isDetailsOpen: true
    }));
    currentProcess.redTeamStatus = 'processing';
    renderActiveDeepthinkPipeline();

    await Promise.allSettled(currentProcess.redTeamAgents.map(async (redTeamAgent, agentIndex) => {
        if (currentProcess.isStopRequested) {
            redTeamAgent.status = 'cancelled';
            return;
        }

        try {
            redTeamAgent.status = 'processing';
            renderActiveDeepthinkPipeline();

            const assignedStrategy = currentProcess.initialStrategies.find(s => s.id === redTeamAgent.assignedStrategyId);
            if (!assignedStrategy || !assignedStrategy.subStrategies || assignedStrategy.subStrategies.length === 0) {
                redTeamAgent.status = 'completed';
                redTeamAgent.reasoning = "No sub-strategies to evaluate - strategy passed by default";
                return;
            }

            const subStrategiesText = assignedStrategy.subStrategies
                .map((sub, idx) => `${idx + 1}. [ID: ${sub.id}] ${sub.subStrategyText}`)
                .join('\n\n');

            // Generate fresh red team prompts with current aggressiveness setting
            const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();
            const freshRedTeamPrompts = createDefaultCustomPromptsDeepthink(
                getSelectedStrategiesCount(),
                getSelectedSubStrategiesCount(),
                getSelectedHypothesisCount(),
                currentRedTeamAggressiveness
            );

            const redTeamPrompt = freshRedTeamPrompts.user_deepthink_redTeam
                .replace('{{originalProblemText}}', problemText)
                .replace('{{assignedStrategy}}', `[ID: ${assignedStrategy.id}] ${assignedStrategy.strategyText}`)
                .replace('{{subStrategies}}', subStrategiesText);

            const redTeamPromptParts: Part[] = [{ text: redTeamPrompt }];
            if (imageBase64 && imageMimeType) {
                redTeamPromptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
            }
            redTeamAgent.requestPrompt = redTeamPrompt + (imageBase64 ? "\n[Image Provided]" : "");

            const redTeamResponse = await makeDeepthinkApiCall(
                redTeamPromptParts,
                freshRedTeamPrompts.sys_deepthink_redTeam,
                true,
                `Red Team Agent ${agentIndex + 1}`,
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
                // Build a comprehensive reasoning display from the strategy evaluations
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
                                if (id.includes('-sub')) killedSubStrategyIds.push(id); else killedStrategyIds.push(id);
                            } else {
                                killedSubStrategyIds.push(id);
                            }
                            reasonMap[id] = evaluation.reason || evaluation.reasoning || 'Eliminated by Red Team';
                        }
                    });
                }

                redTeamAgent.killedStrategyIds = killedStrategyIds;
                redTeamAgent.killedSubStrategyIds = killedSubStrategyIds;
                (redTeamAgent as any).killedReasonMap = reasonMap;
            } catch (parseError) {
                redTeamAgent.reasoning = `JSON parsing failed. Raw response: ${(redTeamAgent.evaluationResponse || '').substring(0, 500)}...`;
                redTeamAgent.killedStrategyIds = [];
                redTeamAgent.killedSubStrategyIds = [];
            }

            redTeamAgent.status = 'completed';
        } catch (e: any) {
            redTeamAgent.status = 'error';
            redTeamAgent.error = e.message || `Failed to run Red Team Agent ${agentIndex + 1}.`;
        } finally {
            renderActiveDeepthinkPipeline();
        }
    }));

    currentProcess.redTeamAgents.forEach(redTeamAgent => {
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

    currentProcess.redTeamStatus = 'completed';
    currentProcess.redTeamComplete = true;
    renderActiveDeepthinkPipeline();
}

// Solution modal functions
// Global variable to track active modal updates
let activeSolutionModalRoot: any = null;
let activeSolutionModalSubStrategyId: string | null = null;

export async function openDeepthinkSolutionModal(subStrategyId: string) {
    const subStrategy = activeDeepthinkPipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
    if (!subStrategy) return;

    // Check if iterative corrections is enabled globally (this is the key check)
    const iterativeCorrectionsEnabled = getIterativeCorrectionsEnabled();

    // If iterative corrections is enabled, always show the Contextual UI regardless of data availability
    // This ensures the UI is consistent with the mode selection
    const hasIterativeCorrections = iterativeCorrectionsEnabled;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'solution-modal-overlay';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.style.display = 'flex';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.setAttribute('role', 'dialog');
    modalContent.setAttribute('aria-modal', 'true');

    const modalHeader = document.createElement('header');
    modalHeader.className = 'modal-header';

    const modalTitle = document.createElement('h2');
    modalTitle.className = 'modal-title';
    modalTitle.textContent = hasIterativeCorrections ? 'Iterative Corrections' : 'Solution Details';
    modalHeader.appendChild(modalTitle);

    const closeModalButton = document.createElement('button');
    closeModalButton.className = 'modal-close-button';
    closeModalButton.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeModalButton.addEventListener('click', closeSolutionModal);
    modalHeader.appendChild(closeModalButton);

    modalContent.appendChild(modalHeader);

    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';

    if (hasIterativeCorrections) {
        // For Contextual UI: no padding, full height to match Contextual mode exactly
        modalBody.style.padding = '0';
        modalBody.style.height = 'calc(100vh - 80px)';
        modalBody.style.overflow = 'hidden'; // Let the Contextual UI handle scrolling

        // Add the contextual mode CSS class to ensure proper styling
        modalBody.classList.add('contextual-mode-container');

        // Store the modal info for real-time updates
        activeSolutionModalSubStrategyId = subStrategyId;

        // Initial render
        await updateSolutionModalContent(modalBody, subStrategyId);
    } else {
        // For default UI: standard padding and height
        modalBody.style.padding = '20px';
        modalBody.style.height = 'calc(100vh - 120px)';

        // Render default two-panel comparison UI
        renderDefaultSolutionUI(modalBody, subStrategy);
    }

    modalContent.appendChild(modalBody);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeSolutionModal();
        }
    };

    const handleOverlayClick = (e: MouseEvent) => {
        if (e.target === modalOverlay) {
            closeSolutionModal();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    modalOverlay.addEventListener('click', handleOverlayClick);

    (modalOverlay as any).cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        modalOverlay.removeEventListener('click', handleOverlayClick);
    };

    setTimeout(() => {
        modalOverlay.classList.add('is-visible');
    }, 10);
}

// Helper function to render default solution UI (existing behavior)
function renderDefaultSolutionUI(container: HTMLElement, subStrategy: any) {
    const refinementWasPerformed = subStrategy.refinedSolution !== subStrategy.solutionAttempt;
    const currentRefinementEnabled = getRefinementEnabled();

    const solutionComparison = document.createElement('div');
    solutionComparison.style.display = 'grid';
    solutionComparison.style.gridTemplateColumns = currentRefinementEnabled ? '1fr 1fr' : '1fr';
    solutionComparison.style.gap = '20px';
    solutionComparison.style.height = '100%';

    const leftPanel = document.createElement('div');
    leftPanel.style.display = 'flex';
    leftPanel.style.flexDirection = 'column';
    leftPanel.style.border = '1px solid #333';
    leftPanel.style.borderRadius = '8px';
    leftPanel.style.overflow = 'hidden';

    const leftHeader = document.createElement('div');
    leftHeader.style.padding = '12px 16px';
    leftHeader.style.background = 'rgba(15, 17, 32, 0.4)';
    leftHeader.style.borderBottom = '1px solid #333';
    leftHeader.innerHTML = currentRefinementEnabled
        ? '<h4 style="margin: 0;"><span class="material-symbols-outlined">psychology</span>Attempted Solution</h4>'
        : '<h4 style="margin: 0;"><span class="material-symbols-outlined">psychology</span>Solution</h4>';
    leftPanel.appendChild(leftHeader);

    const leftContent = document.createElement('div');
    leftContent.style.flex = '1';
    leftContent.style.overflow = 'auto';
    leftContent.style.padding = '16px';
    leftContent.innerHTML = renderMathContent(subStrategy.solutionAttempt || 'Solution not available');
    leftPanel.appendChild(leftContent);

    solutionComparison.appendChild(leftPanel);

    const rightPanel = document.createElement('div');
    rightPanel.style.display = 'flex';
    rightPanel.style.flexDirection = 'column';
    rightPanel.style.border = '1px solid #333';
    rightPanel.style.borderRadius = '8px';
    rightPanel.style.overflow = 'hidden';

    if (!refinementWasPerformed) {
        rightPanel.classList.add('disabled-pane');
    }

    const rightHeader = document.createElement('div');
    rightHeader.style.padding = '12px 16px';
    rightHeader.style.background = 'rgba(15, 17, 32, 0.4)';
    rightHeader.style.borderBottom = '1px solid #333';

    const headerContent = currentRefinementEnabled
        ? '<h4 style="margin: 0;"><span class="material-symbols-outlined">auto_fix_high</span>Refined Solution</h4>'
        : '<h4 style="margin: 0; opacity: 0.6;"><span class="material-symbols-outlined">auto_fix_off</span>Refined Solution (Disabled)</h4>';
    rightHeader.innerHTML = headerContent;
    rightPanel.appendChild(rightHeader);

    const rightContent = document.createElement('div');
    rightContent.style.flex = '1';
    rightContent.style.overflow = 'auto';
    rightContent.style.padding = '16px';
    rightContent.style.position = 'relative';

    const contentText = currentRefinementEnabled
        ? (subStrategy.refinedSolution || 'Refined solution not available')
        : (subStrategy.refinedSolution || subStrategy.solutionAttempt || 'Solution refinement is disabled');

    rightContent.innerHTML = renderMathContent(contentText);

    if (!refinementWasPerformed) {
        const disabledOverlay = document.createElement('div');
        disabledOverlay.classList.add('disabled-overlay');
        disabledOverlay.textContent = 'Refinement Disabled';
        rightContent.appendChild(disabledOverlay);
    }

    rightPanel.appendChild(rightContent);
    solutionComparison.appendChild(rightPanel);
    container.appendChild(solutionComparison);
}

// Helper function to render iterative corrections UI (Contextual-style)
async function renderIterativeCorrectionsUI(container: HTMLElement, originalSolution: string, finalSolution: string, iterations: any[], isProcessing?: boolean) {
    // Dynamically import the React UI from Contextual mode
    const { renderIterativeCorrectionsUI: renderReactUI } = await import('../Contextual/ContextualUI');

    return renderReactUI(container, originalSolution, finalSolution, iterations, isProcessing);
}

// Function to update the modal content in real-time
async function updateSolutionModalContent(modalBody: HTMLElement, subStrategyId: string) {
    const subStrategy = activeDeepthinkPipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
    if (!subStrategy) return;

    // Get the iterations data and final solution
    const iterativeCorrectionsData = (subStrategy as any).iterativeCorrections;
    const iterations = iterativeCorrectionsData?.iterations || [];
    const originalSolution = subStrategy.solutionAttempt || 'Processing...';
    const latestCorrection = iterations.length > 0
        ? iterations[iterations.length - 1]?.correctedSolution
        : null;
    const currentBestSolution = latestCorrection || subStrategy.refinedSolution || subStrategy.solutionAttempt || 'Processing...';
    
    // Check if processing: use selfImprovementStatus as the primary indicator
    // This ensures we show "Processing" even before iterativeCorrections is initialized
    const isProcessing = subStrategy.selfImprovementStatus === 'processing' || 
                        subStrategy.selfImprovementStatus === 'pending' ||
                        iterativeCorrectionsData?.status === 'processing';

    // Don't clear innerHTML - just update the React component
    // The renderIterativeCorrectionsUI function will reuse the existing root
    activeSolutionModalRoot = await renderIterativeCorrectionsUI(modalBody, originalSolution, currentBestSolution, iterations, isProcessing);
}

// Function to update the active modal if it's open
export async function updateActiveSolutionModal() {
    if (activeSolutionModalSubStrategyId && document.getElementById('solution-modal-overlay')) {
        const modalBody = document.querySelector('#solution-modal-overlay .modal-body') as HTMLElement;
        if (modalBody) {
            await updateSolutionModalContent(modalBody, activeSolutionModalSubStrategyId);
        }
    }
}

export function closeSolutionModal() {
    const modalOverlay = document.getElementById('solution-modal-overlay');
    if (modalOverlay) {
        if ((modalOverlay as any).cleanup) {
            (modalOverlay as any).cleanup();
        }
        modalOverlay.classList.remove('is-visible');
        setTimeout(() => {
            modalOverlay.remove();
        }, 200);
    }

    // Clean up modal tracking and React root
    activeSolutionModalRoot = null;
    activeSolutionModalSubStrategyId = null;

    // Clean up the React root in ContextualUI
    if (cleanupIterativeCorrectionsRoot) {
        cleanupIterativeCorrectionsRoot();
    }
}

// Knowledge packet styling function
export function parseKnowledgePacketForStyling(knowledgePacket: string): string {
    if (!knowledgePacket) return '<div class="no-knowledge">No knowledge packet available</div>';

    // Check if this is the new full information packet format
    if (knowledgePacket.includes('<Full Information Packet>')) {
        // Parse the new format with full hypothesis outputs
        let html = '<div class="full-information-packet">';

        // Extract hypothesis blocks
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

        // Handle case where hypothesis exploration is disabled
        if (hypothesisCount === 0 && knowledgePacket.includes('HYPOTHESIS EXPLORATION: Disabled')) {
            html += '<div class="hypothesis-disabled">HYPOTHESIS EXPLORATION: Disabled - No hypotheses generated.</div>';
        }

        html += '</div>';
        return html;
    }

    // Fallback for old format - render as markdown content
    return renderMathContent(knowledgePacket);
}

// ---------- DEEPTHINK MODE SPECIFIC FUNCTIONS ----------

// Helper function to run red team evaluation for a single strategy
async function runRedTeamForStrategy(
    currentProcess: DeepthinkPipelineState,
    mainStrategy: DeepthinkMainStrategyData,
    problemText: string,
    imageBase64: string | null | undefined,
    imageMimeType: string | null | undefined,
    makeDeepthinkApiCall: any,
    aggressiveness: string
): Promise<void> {
    if (!mainStrategy.subStrategies || mainStrategy.subStrategies.length === 0) {
        return;
    }

    const agentIndex = currentProcess.redTeamAgents.length;
    const redTeamAgent: DeepthinkRedTeamData = {
        id: `redteam-${agentIndex}`,
        assignedStrategyId: mainStrategy.id,
        killedStrategyIds: [],
        killedSubStrategyIds: [],
        status: 'pending',
        isDetailsOpen: true
    };
    currentProcess.redTeamAgents.push(redTeamAgent);
    renderActiveDeepthinkPipeline();

    if (currentProcess.isStopRequested) {
        redTeamAgent.status = 'cancelled';
        return;
    }

    try {
        redTeamAgent.status = 'processing';
        renderActiveDeepthinkPipeline();

        const subStrategiesText = mainStrategy.subStrategies
            .map((sub, idx) => `${idx + 1}. [ID: ${sub.id}] ${sub.subStrategyText}`)
            .join('\n\n');

        // Generate fresh red team prompts with current aggressiveness setting
        const freshRedTeamPrompts = createDefaultCustomPromptsDeepthink(
            getSelectedStrategiesCount(),
            getSelectedSubStrategiesCount(),
            getSelectedHypothesisCount(),
            aggressiveness
        );

        const redTeamPrompt = freshRedTeamPrompts.user_deepthink_redTeam
            .replace('{{originalProblemText}}', problemText)
            .replace('{{assignedStrategy}}', `[ID: ${mainStrategy.id}] ${mainStrategy.strategyText}`)
            .replace('{{subStrategies}}', subStrategiesText);

        const parts: Part[] = [];
        if (imageBase64 && imageMimeType) {
            parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }
        parts.push({ text: redTeamPrompt });

        redTeamAgent.requestPrompt = redTeamPrompt + (imageBase64 ? "\n[Image Provided]" : "");

        const redTeamResponse = await makeDeepthinkApiCall(
            parts,
            freshRedTeamPrompts.sys_deepthink_redTeam,
            true,
            `Red Team Agent ${agentIndex + 1}`,
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
            
            // Build a comprehensive reasoning display from the strategy evaluations
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
                            if (id.includes('-sub')) killedSubStrategyIds.push(id); else killedStrategyIds.push(id);
                        } else {
                            killedSubStrategyIds.push(id);
                        }
                        reasonMap[id] = evaluation.reason || evaluation.reasoning || 'Eliminated by Red Team';
                    }
                });
            }

            redTeamAgent.killedStrategyIds = killedStrategyIds;
            redTeamAgent.killedSubStrategyIds = killedSubStrategyIds;
            (redTeamAgent as any).killedReasonMap = reasonMap;
        } catch (parseError) {
            redTeamAgent.reasoning = `JSON parsing failed. Raw response: ${(redTeamAgent.evaluationResponse || '').substring(0, 500)}...`;
            redTeamAgent.killedStrategyIds = [];
            redTeamAgent.killedSubStrategyIds = [];
        }

        redTeamAgent.status = 'completed';
    } catch (e: any) {
        redTeamAgent.status = 'error';
        redTeamAgent.error = e.message || `Failed to run Red Team Agent ${agentIndex + 1}.`;
    } finally {
        renderActiveDeepthinkPipeline();
    }
}

// Helper function to apply red team results to strategies
function applyRedTeamResults(currentProcess: DeepthinkPipelineState): void {
    currentProcess.redTeamAgents.forEach(redTeamAgent => {
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

export async function startDeepthinkAnalysisProcess(challengeText: string, imageBase64?: string | null, imageMimeType?: string | null) {
    const currentAIProvider = getAIProvider ? getAIProvider() : null;
    if (!currentAIProvider) {
        // Removed console.error
        alert("AI provider not initialized. Please check your API key configuration.");
        return;
    }
    activeDeepthinkPipeline = {
        id: `deepthink-process-${Date.now()}`,
        challenge: challengeText,
        initialStrategies: [],
        hypotheses: [],
        solutionCritiques: [],
        redTeamAgents: [],
        status: 'processing',
        isStopRequested: false,
        activeTabId: 'strategic-solver',
        activeStrategyTab: 0,
        strategicSolverComplete: false,
        hypothesisExplorerComplete: false,
        redTeamComplete: false,
        knowledgePacket: '',
        finalJudgingStatus: 'pending'
    };

    // Sync with main index.tsx activeDeepthinkPipeline
    if (setActiveDeepthinkPipeline) {
        setActiveDeepthinkPipeline(activeDeepthinkPipeline);
    }

    updateControlsState({ isGenerating: true });
    renderActiveDeepthinkPipeline();

    // activeDeepthinkPipeline is initialized immediately above; assert non-null for this scope
    const currentProcess = activeDeepthinkPipeline as DeepthinkPipelineState;

    const makeDeepthinkApiCall = async (
        parts: Part[],
        systemInstruction: string,
        isJson: boolean,
        stepDescription: string,
        targetStatusField: DeepthinkMainStrategyData | DeepthinkSubStrategyData | DeepthinkPipelineState | DeepthinkHypothesisData | DeepthinkSolutionCritiqueData | DeepthinkRedTeamData,
        retryAttemptField: 'retryAttempt' | 'selfImprovementRetryAttempt' | 'testerRetryAttempt' | 'hypothesisGenRetryAttempt' | 'solutionCritiqueRetryAttempt' | 'dissectedSynthesisRetryAttempt'
    ): Promise<string> => {
        if (!currentProcess || currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDescription}`);
        let responseText = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDescription}`);

            try {
                (targetStatusField as any)[retryAttemptField] = attempt;
                renderActiveDeepthinkPipeline();

                // Determine which agent model to use based on the step
                let agentModel = getSelectedModel(); // Default fallback

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
                } else if (stepDescription.includes('Final Judge')) {
                    agentModel = customPromptsDeepthinkState.model_finalJudge || getSelectedModel();
                }

                const strategyResponse = await callGemini(parts, getSelectedTemperature(), agentModel, systemInstruction, isJson, getSelectedTopP());
                responseText = strategyResponse.text || "";

                if (responseText && responseText.trim() !== "") {
                    break;
                } else {
                    throw new Error("Empty response from API");
                }
            } catch (error: any) {
                if (attempt === MAX_RETRIES) {
                    throw error;
                } else {
                    // Set status to 'retrying' to show in UI
                    if ('status' in targetStatusField) {
                        (targetStatusField as any).status = 'retrying';
                    }
                    (targetStatusField as any)[retryAttemptField] = attempt + 1;
                    renderActiveDeepthinkPipeline();
                    
                    const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
                    console.log(`[Deepthink] ${stepDescription} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${delay/1000}s...`);
                    
                    // Break the delay into 500ms chunks to allow UI updates
                    const chunks = Math.ceil(delay / 500);
                    for (let i = 0; i < chunks; i++) {
                        if (currentProcess.isStopRequested) {
                            throw new PipelineStopRequestedError(`Stop requested during retry delay for: ${stepDescription}`);
                        }
                        await new Promise(resolve => setTimeout(resolve, Math.min(500, delay - i * 500)));
                    }
                    
                    // Set status back to 'processing'
                    if ('status' in targetStatusField) {
                        (targetStatusField as any).status = 'processing';
                    }
                    renderActiveDeepthinkPipeline();
                }
            }
        }

        return responseText;
    };

    try {
        // Track B: Hypothesis Explorer (Generate → Test → Synthesize knowledge packet)
        // Declared FIRST so trackAPromise can await it when needed
        const trackBPromise = (async () => {
            try {
                // Check if hypothesis generation is enabled
                const currentHypothesisCount = getSelectedHypothesisCount();

                if (currentHypothesisCount === 0) {
                    // Hypothesis generation is turned off
                    currentProcess.hypothesisGenStatus = 'completed';
                    currentProcess.hypotheses = [];
                    currentProcess.knowledgePacket = "<Full Information Packet>\nHYPOTHESIS EXPLORATION: Disabled - No hypotheses generated.\n</Full Information Packet>";
                    currentProcess.hypothesisExplorerComplete = true;
                    renderActiveDeepthinkPipeline();
                    return;
                }

                // Generate hypotheses with current slider values
                const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();
                const freshHypothesisPrompts = createDefaultCustomPromptsDeepthink(getSelectedStrategiesCount(), getSelectedSubStrategiesCount(), currentHypothesisCount, currentRedTeamAggressiveness);

                const hypothesisPrompt = freshHypothesisPrompts.user_deepthink_hypothesisGeneration.replace('{{originalProblemText}}', challengeText);
                currentProcess.requestPromptHypothesisGen = hypothesisPrompt;
                currentProcess.hypothesisGenStatus = 'processing';
                renderActiveDeepthinkPipeline();

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
                    freshHypothesisPrompts.sys_deepthink_hypothesisGeneration,
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
                renderActiveDeepthinkPipeline();

                // Test each hypothesis IN PARALLEL
                const hypothesisTestingPromises = currentProcess.hypotheses.map(async (hypothesis) => {
                    if (currentProcess.isStopRequested) {
                        hypothesis.testerStatus = 'cancelled';
                        return;
                    }

                    hypothesis.testerStatus = 'processing';
                    renderActiveDeepthinkPipeline();

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

                        renderActiveDeepthinkPipeline();
                    } catch (error: any) {
                        hypothesis.testerStatus = 'error';
                        hypothesis.testerError = error.message || "Hypothesis testing failed";
                        renderActiveDeepthinkPipeline();
                    }
                });

                await Promise.allSettled(hypothesisTestingPromises);

                // Synthesize knowledge packet with full hypothesis outputs
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
                renderActiveDeepthinkPipeline();

            } catch (error: any) {
                if (!(error instanceof PipelineStopRequestedError)) {
                    currentProcess.hypothesisGenStatus = 'error';
                    currentProcess.hypothesisGenError = `Hypothesis exploration failed: ${error.message}`;
                    renderActiveDeepthinkPipeline();
                }
                throw error;
            }
        })();
        
        // Track A: Strategic Solver (Main strategies → Sub-strategies → Solution attempts → Self-improvement → Judging)
        const trackAPromise = (async () => {
            try {
                // Step 1: Generate initial strategies
                currentProcess.status = 'processing';
                renderActiveDeepthinkPipeline();

                const parts: Part[] = [];
                if (imageBase64 && imageMimeType) {
                    parts.push({
                        inlineData: {
                            data: imageBase64,
                            mimeType: imageMimeType
                        }
                    });
                }

                // Generate fresh prompts with current slider values
                const currentStrategiesCount = getSelectedStrategiesCount();
                const currentSubStrategiesCount = getSelectedSubStrategiesCount();
                const currentHypothesisCount = getSelectedHypothesisCount();
                const redTeamAggressiveness = getSelectedRedTeamAggressiveness();
                const currentPrompts = createDefaultCustomPromptsDeepthink(currentStrategiesCount, currentSubStrategiesCount, currentHypothesisCount, redTeamAggressiveness);

                const strategiesPrompt = currentPrompts.user_deepthink_initialStrategy.replace('{{originalProblemText}}', challengeText);
                currentProcess.requestPromptInitialStrategyGen = strategiesPrompt;

                const strategiesResponse = await makeDeepthinkApiCall(
                    parts.concat([{ text: strategiesPrompt }]),
                    currentPrompts.sys_deepthink_initialStrategy,
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

                renderActiveDeepthinkPipeline();

                // Step 2: Generate sub-strategies and kick off red team per-strategy IN PARALLEL
                const skipSubStrategies = getSkipSubStrategies();
                const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();
                
                // Initialize red team state
                if (currentRedTeamAggressiveness !== 'off') {
                    currentProcess.redTeamStatus = 'processing';
                    currentProcess.redTeamAgents = [];
                } else {
                    currentProcess.redTeamStatus = 'completed';
                    currentProcess.redTeamComplete = true;
                    currentProcess.redTeamAgents = [];
                }
                renderActiveDeepthinkPipeline();

                // Track red team promises for each strategy
                const redTeamPromises: Promise<void>[] = [];

                if (skipSubStrategies) {
                    // Skip sub-strategy generation - create a single sub-strategy per main strategy that mirrors the main strategy
                    currentProcess.initialStrategies.forEach((mainStrategy) => {
                        const subStrategy: DeepthinkSubStrategyData = {
                            id: `${mainStrategy.id}-direct`,
                            subStrategyText: mainStrategy.strategyText,
                            status: 'pending',
                            isDetailsOpen: false,
                            subStrategyFormat: 'markdown'
                        };
                        mainStrategy.subStrategies.push(subStrategy);
                        mainStrategy.status = 'completed';
                        
                        // Kick off red team for this strategy immediately if enabled
                        if (currentRedTeamAggressiveness !== 'off') {
                            redTeamPromises.push(
                                runRedTeamForStrategy(currentProcess, mainStrategy, challengeText, imageBase64, imageMimeType, makeDeepthinkApiCall, currentRedTeamAggressiveness)
                            );
                        }
                    });
                    renderActiveDeepthinkPipeline();
                } else {
                    // Normal sub-strategy generation with per-strategy red team kickoff
                    await Promise.allSettled(currentProcess.initialStrategies.map(async (mainStrategy) => {
                        if (currentProcess.isStopRequested) {
                            mainStrategy.status = 'cancelled';
                            mainStrategy.error = "Process stopped by user.";
                            return;
                        }

                        try {
                            mainStrategy.status = 'processing';
                            renderActiveDeepthinkPipeline();

                            const otherStrategies = currentProcess.initialStrategies
                                .filter(s => s.id !== mainStrategy.id)
                                .map(s => s.strategyText);
                            const otherMainStrategiesStr = otherStrategies.length > 0
                                ? otherStrategies.map((s, idx) => `Strategy ${idx + 1}: ${s}`).join('\n\n')
                                : "No other strategies.";

                            const subStrategyPrompt = currentPrompts.user_deepthink_subStrategy
                                .replace('{{originalProblemText}}', challengeText)
                                .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                .replace('{{otherMainStrategiesStr}}', otherMainStrategiesStr);

                            mainStrategy.requestPromptSubStrategyGen = subStrategyPrompt;

                            const subStrategyResponse = await makeDeepthinkApiCall(
                                parts.concat([{ text: subStrategyPrompt }]),
                                currentPrompts.sys_deepthink_subStrategy,
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

                            mainStrategy.status = 'completed';
                            renderActiveDeepthinkPipeline();
                            
                            // Kick off red team for this strategy as soon as its sub-strategies are ready
                            if (currentRedTeamAggressiveness !== 'off') {
                                redTeamPromises.push(
                                    runRedTeamForStrategy(currentProcess, mainStrategy, challengeText, imageBase64, imageMimeType, makeDeepthinkApiCall, currentRedTeamAggressiveness)
                                );
                            }
                        } catch (error: any) {
                            mainStrategy.status = 'error';
                            mainStrategy.error = error.message || "Sub-strategy generation failed";
                            renderActiveDeepthinkPipeline();
                        }
                    }));
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped after sub-strategy generation.");

                // Step 2.5: Wait for all red team agents to complete (they're running in parallel)
                if (currentRedTeamAggressiveness !== 'off' && redTeamPromises.length > 0) {
                    await Promise.allSettled(redTeamPromises);
                    currentProcess.redTeamComplete = true;
                    currentProcess.redTeamStatus = 'completed';
                    renderActiveDeepthinkPipeline();
                    
                    // Apply red team results to strategies
                    applyRedTeamResults(currentProcess);
                    renderActiveDeepthinkPipeline();
                    
                    // Early exit if Red Team eliminated everything
                    const remainingStrategies = currentProcess.initialStrategies.filter(s => !s.isKilledByRedTeam);
                    const remainingSubStrategies = currentProcess.initialStrategies.flatMap(s => s.subStrategies.filter(sub => !sub.isKilledByRedTeam));
                    if (remainingStrategies.length === 0) {
                        currentProcess.status = 'completed';
                        currentProcess.error = "All strategies were eliminated by Red Team evaluation. No solution attempts can be made.";
                        renderActiveDeepthinkPipeline();
                        return;
                    }
                    if (remainingSubStrategies.length === 0) {
                        currentProcess.status = 'completed';
                        currentProcess.error = "All sub-strategies were eliminated by Red Team evaluation. No solution attempts can be made.";
                        renderActiveDeepthinkPipeline();
                        return;
                    }
                }

                // Step 2.75: Wait for hypothesis track to complete (non-blocking promise await)
                // This replaces the blocking polling loop with proper promise composition
                const hypothesisCount = getSelectedHypothesisCount();
                if (hypothesisCount > 0) {
                    console.log('[Deepthink] Waiting for hypothesis exploration to complete before executing solutions...');
                    // Wait for trackBPromise to complete before proceeding
                    // trackBPromise is running in parallel and will resolve when hypothesis exploration is done
                    await trackBPromise;
                    console.log('[Deepthink] Hypothesis exploration complete. Proceeding to solution execution...');
                }
                
                if (currentProcess.isStopRequested) {
                    throw new PipelineStopRequestedError("Stopped while waiting for hypothesis exploration.");
                }

                // Step 3: Execute solution attempts and kick off per-strategy critiques in parallel
                // Each strategy waits for its sub-strategies to complete, then kicks off its critique
                const refinementEnabled = getRefinementEnabled();
                const iterativeCorrectionsEnabled = getIterativeCorrectionsEnabled();
                const dissectedObservationsEnabled = getDissectedObservationsEnabled();
                
                // Initialize critique state
                currentProcess.solutionCritiques = [];
                if (!iterativeCorrectionsEnabled && refinementEnabled) {
                    currentProcess.solutionCritiquesStatus = 'processing';
                }
                
                // Separate critique promises for proper timing control
                const critiquePromisesPerStrategy: Promise<void>[] = [];
                
                // Strategy-level execution promises
                const strategyExecutionPromises = currentProcess.initialStrategies.map(async (mainStrategy) => {
                    // Skip killed strategies
                    const activeSubStrategies = mainStrategy.subStrategies.filter(sub => !sub.isKilledByRedTeam);
                    if (activeSubStrategies.length === 0) return;
                    
                    // Execute all sub-strategies for this strategy in parallel
                    const subStrategyExecutions = activeSubStrategies.map(async (subStrategy) => {
                        if (currentProcess.isStopRequested) {
                            subStrategy.status = 'cancelled';
                            subStrategy.error = "Process stopped by user.";
                            return;
                        }

                        try {
                            subStrategy.status = 'processing';
                            renderActiveDeepthinkPipeline();

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
                            renderActiveDeepthinkPipeline();
                        } catch (error: any) {
                            subStrategy.status = 'error';
                            subStrategy.error = error.message || "Solution attempt failed";
                            renderActiveDeepthinkPipeline();
                        }
                    });
                    
                    // Wait for all sub-strategies in this strategy to complete
                    await Promise.allSettled(subStrategyExecutions);
                    
                    // Kick off critique for THIS strategy as soon as its executions complete
                    if (!iterativeCorrectionsEnabled && refinementEnabled) {
                        const completedSubStrategies = mainStrategy.subStrategies.filter(
                            sub => !sub.isKilledByRedTeam && sub.solutionAttempt
                        );
                        
                        if (completedSubStrategies.length > 0) {
                            const critiquePromise = (async () => {
                                // Create critique data
                                const critiqueData: DeepthinkSolutionCritiqueData = {
                                    id: `critique-${mainStrategy.id}`,
                                    subStrategyId: '',
                                    mainStrategyId: mainStrategy.id,
                                    status: 'pending',
                                    isDetailsOpen: true
                                };
                                currentProcess.solutionCritiques.push(critiqueData);
                                renderActiveDeepthinkPipeline();
                                
                                // Run critique for this strategy
                                if (currentProcess.isStopRequested) {
                                    critiqueData.status = 'cancelled';
                                    critiqueData.error = "Process stopped by user.";
                                    return;
                                }

                                try {
                                    critiqueData.status = 'processing';
                                    renderActiveDeepthinkPipeline();

                                    // Build the solutions text with IDs
                                    const solutionsText = completedSubStrategies.map(sub =>
                                        `${sub.id}:\nSub-Strategy: ${sub.subStrategyText}\n\nSolution Attempt:\n${sub.solutionAttempt}`
                                    ).join('\n\n---\n\n');

                                    const critiquePrompt = currentPrompts.user_deepthink_solutionCritique
                                        .replace('{{originalProblemText}}', challengeText)
                                        .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                        .replace('{{allSubStrategiesAndSolutions}}', solutionsText);

                                    critiqueData.requestPrompt = critiquePrompt;

                                    const critiqueResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: critiquePrompt }]),
                                        currentPrompts.sys_deepthink_solutionCritique,
                                        false,
                                        `Solution Critique for ${mainStrategy.id}`,
                                        critiqueData,
                                        'retryAttempt'
                                    );

                                    critiqueData.critiqueResponse = critiqueResponse;

                                    // Store the full critique in each sub-strategy for backward compatibility
                                    completedSubStrategies.forEach(sub => {
                                        sub.solutionCritique = critiqueResponse;
                                        sub.solutionCritiqueStatus = 'completed';
                                    });

                                    critiqueData.status = 'completed';
                                    renderActiveDeepthinkPipeline();
                                } catch (error: any) {
                                    critiqueData.status = 'error';
                                    critiqueData.error = error.message || "Solution critique failed";

                                    completedSubStrategies.forEach(sub => {
                                        sub.solutionCritiqueStatus = 'error';
                                        sub.solutionCritiqueError = error.message || "Solution critique failed";
                                    });

                                    renderActiveDeepthinkPipeline();
                                }
                            })();
                            
                            critiquePromisesPerStrategy.push(critiquePromise);
                        }
                    }
                });
                
                // Wait for all strategy executions to complete
                console.log('[Deepthink] Waiting for all solution executions to complete...');
                await Promise.allSettled(strategyExecutionPromises);
                console.log('[Deepthink] All solution executions complete.');
                
                // Wait for critiques only if dissected observations is enabled
                // Otherwise, correctors can start immediately while critiques run in background
                if (!iterativeCorrectionsEnabled && refinementEnabled && dissectedObservationsEnabled) {
                    console.log('[Deepthink] Dissected observations enabled - waiting for all critiques to complete...');
                    await Promise.allSettled(critiquePromisesPerStrategy);
                    currentProcess.solutionCritiquesStatus = 'completed';
                    renderActiveDeepthinkPipeline();
                    console.log('[Deepthink] All critiques complete.');
                } else if (!iterativeCorrectionsEnabled && refinementEnabled && !dissectedObservationsEnabled) {
                    console.log('[Deepthink] Dissected observations disabled - critiques running in background, correctors starting immediately.');
                    // Critiques are running in background, correctors don't need to wait
                    // We'll mark critiques complete later or let them finish in the background
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during solution attempts or critiques.");

                // Step 4: Handle refinement based on mode
                if (!refinementEnabled) {
                    // Skip refinement - just assign attempted solution to refined solution
                    currentProcess.initialStrategies.forEach((mainStrategy) => {
                        mainStrategy.subStrategies.forEach((subStrategy) => {
                            if (subStrategy.isKilledByRedTeam || !subStrategy.solutionAttempt) return;
                            subStrategy.refinedSolution = subStrategy.solutionAttempt;
                            subStrategy.selfImprovementStatus = 'completed';
                        });
                    });
                    renderActiveDeepthinkPipeline();
                } else if (iterativeCorrectionsEnabled) {
                    // Step 4 (Iterative Mode): Run 3-iteration critique-correction loop with conversation history
                    // Import the history managers
                    const { SolutionCritiqueHistoryManager, SolutionCorrectionHistoryManager } = await import('./DeepthinkIterativeHistory');

                    // Process each substrategy with iterative corrections
                    const iterativePromises: Promise<void>[] = [];

                    currentProcess.initialStrategies.forEach((mainStrategy) => {
                        mainStrategy.subStrategies.forEach((subStrategy) => {
                            if (subStrategy.isKilledByRedTeam || !subStrategy.solutionAttempt) return;

                            iterativePromises.push((async () => {
                                if (currentProcess.isStopRequested) {
                                    subStrategy.selfImprovementStatus = 'cancelled';
                                    return;
                                }

                                try {
                                    // Initialize iteration data storage
                                    (subStrategy as any).iterativeCorrections = {
                                        iterations: [],
                                        status: 'processing'
                                    };

                                    // Check if "Provide All Solutions to Correctors" is enabled
                                    const provideAllSolutions = getProvideAllSolutionsToCorrectors();
                                    
                                    // Build solutions document from OTHER strategies (if enabled)
                                    let otherStrategiesSolutions: string | null = null;
                                    if (provideAllSolutions) {
                                        // Build comprehensive solutions document excluding current strategy
                                        const otherSolutionsWithoutCritiques = currentProcess.initialStrategies
                                            .filter(strat => strat.id !== mainStrategy.id && !strat.isKilledByRedTeam)
                                            .map(strat => {
                                                const activeSubs = strat.subStrategies
                                                    .filter(sub => !sub.isKilledByRedTeam && sub.solutionAttempt);
                                                
                                                if (activeSubs.length === 0) return '';

                                                const subsSection = activeSubs
                                                    .map(sub => {
                                                        return `
═══════════════════════════════════════════════════════════════
SUB-STRATEGY: ${sub.id}
${sub.subStrategyText}

THE EXECUTION:
${sub.solutionAttempt}
═══════════════════════════════════════════════════════════════`;
                                                    })
                                                    .join('\n\n');

                                                return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRATEGY: ${strat.id}
${strat.strategyText}

${subsSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                                            })
                                            .filter(section => section.trim().length > 0)
                                            .join('\n\n\n');

                                        if (otherSolutionsWithoutCritiques.trim().length > 0) {
                                            otherStrategiesSolutions = `<SOLUTIONS FROM OTHER STRATEGIES>
You are correcting the solution for sub-strategy: ${subStrategy.id} within strategy: ${mainStrategy.id}
Below are all solution attempts from OTHER strategies (not including your current strategy to avoid duplicates). 
Note: In iterative corrections mode, critiques for these solutions are not yet available, so only the solutions themselves are provided.
Learn from these approaches but focus on correcting your assigned solution based on the critique you receive.

${otherSolutionsWithoutCritiques}
</SOLUTIONS FROM OTHER STRATEGIES>`;
                                        }
                                    }

                                    // Create history managers
                                    const critiqueManager = new SolutionCritiqueHistoryManager(
                                        customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                        challengeText,
                                        mainStrategy.strategyText,
                                        subStrategy.solutionAttempt || ''
                                    );

                                    let currentSolution = subStrategy.solutionAttempt || '';
                                    let correctionManager: any = null;

                                    // Run 3 iterations
                                    for (let iterNum = 1; iterNum <= 3; iterNum++) {
                                        if (currentProcess.isStopRequested) break;

                                        // === CRITIQUE PHASE ===
                                        const critiquePrompt = await critiqueManager.buildPromptForIteration(currentSolution, iterNum);

                                        const critiqueResponse = await makeDeepthinkApiCall(
                                            parts.concat([{ text: critiquePrompt.map(m => m.content).join('\n\n') }]),
                                            customPromptsDeepthinkState.sys_deepthink_solutionCritique,
                                            false,
                                            `Solution Critique Iteration ${iterNum} for ${subStrategy.id}`,
                                            subStrategy,
                                            'retryAttempt'
                                        );

                                        await critiqueManager.addCritique(critiqueResponse);

                                        // Store critique in main solution critique array with iteration number
                                        const critiqueData: DeepthinkSolutionCritiqueData = {
                                            id: `critique-${subStrategy.id}-iter${iterNum}`,
                                            subStrategyId: subStrategy.id,
                                            mainStrategyId: mainStrategy.id,
                                            requestPrompt: critiquePrompt.map(m => m.content).join('\n\n'),
                                            critiqueResponse: critiqueResponse,
                                            status: 'completed',
                                            isDetailsOpen: true,
                                            retryAttempt: iterNum
                                        };
                                        currentProcess.solutionCritiques.push(critiqueData);
                                        renderActiveDeepthinkPipeline();

                                        // === CORRECTION PHASE ===
                                        if (iterNum === 1) {
                                            // First iteration: initialize correction manager
                                            correctionManager = new SolutionCorrectionHistoryManager(
                                                customPromptsDeepthinkState.sys_deepthink_selfImprovement,
                                                challengeText,
                                                mainStrategy.strategyText,
                                                subStrategy.solutionAttempt || '',
                                                critiqueResponse,
                                                subStrategy.id,
                                                otherStrategiesSolutions
                                            );
                                        } else {
                                            // Subsequent iterations: add new critique to history
                                            await correctionManager.addNewCritique(critiqueResponse, iterNum);
                                        }

                                        const correctionPrompt = await correctionManager.buildPromptForIteration(critiqueResponse, iterNum);

                                        const correctedSolution = await makeDeepthinkApiCall(
                                            parts.concat([{ text: correctionPrompt.map((m: any) => m.content).join('\n\n') }]),
                                            customPromptsDeepthinkState.sys_deepthink_selfImprovement,
                                            false,
                                            `Solution Correction Iteration ${iterNum} for ${subStrategy.id}`,
                                            subStrategy,
                                            'selfImprovementRetryAttempt'
                                        );

                                        await correctionManager.addCorrectedSolution(correctedSolution);

                                        // Store iteration data for UI
                                        (subStrategy as any).iterativeCorrections.iterations.push({
                                            iterationNumber: iterNum,
                                            critique: critiqueResponse,
                                            correctedSolution: correctedSolution,
                                            timestamp: Date.now()
                                        });

                                        // Update current solution for next iteration
                                        currentSolution = correctedSolution;

                                        // Add corrected solution to critique manager for next iteration
                                        if (iterNum < 3) {
                                            await critiqueManager.addCorrectedSolution(correctedSolution, iterNum + 1);
                                        }

                                        renderActiveDeepthinkPipeline();
                                    }

                                    // Final corrected solution is the refined solution
                                    subStrategy.refinedSolution = currentSolution;
                                    subStrategy.selfImprovementStatus = 'completed';
                                    (subStrategy as any).iterativeCorrections.status = 'completed';
                                    renderActiveDeepthinkPipeline();

                                } catch (error: any) {
                                    subStrategy.selfImprovementStatus = 'error';
                                    subStrategy.selfImprovementError = error.message || "Iterative correction failed";
                                    if ((subStrategy as any).iterativeCorrections) {
                                        (subStrategy as any).iterativeCorrections.status = 'error';
                                        (subStrategy as any).iterativeCorrections.error = error.message;
                                    }
                                    renderActiveDeepthinkPipeline();
                                }
                            })());
                        });
                    });

                    await Promise.allSettled(iterativePromises);

                } else {
                    // Step 4a: Non-iterative refinement mode
                    // Critiques have been kicked off per-strategy during execution (lines 1283-1355)
                    // Corrector timing depends on dissected observations setting:
                    // - If dissected observations enabled: wait for critiques → synthesis → correctors
                    // - If dissected observations disabled: start correctors now (don't wait for critiques)
                    
                    // Step 4b: Synthesize all critiques into DissectedObservationsSynthesis (only if enabled)
                    if (dissectedObservationsEnabled) {
                        // Wait for all critiques to complete before synthesis
                        // Critiques are already running in parallel per-strategy
                        // We just need to wait for them all to finish
                        // (strategyExecutionPromises already waited for this at line 1359)
                        
                        currentProcess.dissectedSynthesisStatus = 'processing';
                        renderActiveDeepthinkPipeline();

                        try {
                            // Collect all solutions with their critiques in structured format
                            const solutionsWithCritiques = currentProcess.initialStrategies
                                .filter(mainStrategy => !mainStrategy.isKilledByRedTeam)
                                .map(mainStrategy => {
                                    const activeSubStrategies = mainStrategy.subStrategies
                                        .filter(sub => !sub.isKilledByRedTeam && sub.solutionAttempt);
                                    
                                    if (activeSubStrategies.length === 0) {
                                        return '';
                                    }

                                    // Get the critique for this main strategy (one critique covers all sub-strategies)
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

                            const synthesisPrompt = currentPrompts.user_deepthink_dissectedSynthesis
                                .replace('{{originalProblemText}}', challengeText)
                                .replace('{{knowledgePacket}}', currentProcess.knowledgePacket || 'No hypothesis exploration performed.')
                                .replace('{{solutionsWithCritiques}}', solutionsWithCritiques || 'No solution attempts available.');

                            currentProcess.dissectedSynthesisRequestPrompt = synthesisPrompt;

                            const synthesisResponse = await makeDeepthinkApiCall(
                                parts.concat([{ text: synthesisPrompt }]),
                                currentPrompts.sys_deepthink_dissectedSynthesis,
                                false,
                                'Dissected Observations Synthesis',
                                currentProcess,
                                'dissectedSynthesisRetryAttempt'
                            );

                            currentProcess.dissectedObservationsSynthesis = synthesisResponse;
                            currentProcess.dissectedSynthesisStatus = 'completed';
                            renderActiveDeepthinkPipeline();
                        } catch (error: any) {
                            // Removed console.error
                            currentProcess.dissectedSynthesisStatus = 'error';
                            currentProcess.dissectedSynthesisError = error.message || "Dissected synthesis failed";
                            renderActiveDeepthinkPipeline();
                        }

                        if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during dissected synthesis.");
                    }

                    // Step 4c: Self-improvement using DissectedObservationsSynthesis
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
                                    renderActiveDeepthinkPipeline();

                                    // Check if we should provide all solutions to correctors
                                    const provideAllSolutions = getProvideAllSolutionsToCorrectors();
                                    
                                    let solutionSection: string;
                                    
                                    if (provideAllSolutions) {
                                        // Build the comprehensive solutions with critiques section
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
                                        // Traditional format: just critique for this strategy and the original solution
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

                                    // Add dissected observations synthesis if enabled and available
                                    if (dissectedObservationsEnabled && currentProcess.dissectedObservationsSynthesis) {
                                        solutionSection += `\n\n<DISSECTED OBSERVATIONS SYNTHESIS>
This synthesis consolidates diagnostic intelligence across ALL solutions, identifies patterns of failure, documents proven impossibilities, and provides correction guidance. Learn from mistakes made across all solution attempts, not just the solution you received. This is the most critical piece of synthesis and you must genuinely accept these findings and correct the solution.
${currentProcess.dissectedObservationsSynthesis}
</DISSECTED OBSERVATIONS SYNTHESIS>`;
                                    }

                                    // Modified prompt to use strategy critique and DissectedObservationsSynthesis
                                    const improvementPrompt = currentPrompts.user_deepthink_selfImprovement
                                        .replace('{{originalProblemText}}', challengeText)
                                        .replace('{{currentMainStrategy}}', mainStrategy.strategyText)
                                        .replace('{{currentSubStrategy}}', subStrategy.subStrategyText)
                                        .replace('{{currentSubStrategyId}}', subStrategy.id)
                                        .replace('{{solutionSectionPlaceholder}}', solutionSection);

                                    subStrategy.requestPromptSelfImprovement = improvementPrompt;

                                    const improvementResponse = await makeDeepthinkApiCall(
                                        parts.concat([{ text: improvementPrompt }]),
                                        currentPrompts.sys_deepthink_selfImprovement,
                                        false,
                                        `Self-Improvement for ${subStrategy.id}`,
                                        subStrategy,
                                        'selfImprovementRetryAttempt'
                                    );

                                    subStrategy.refinedSolution = improvementResponse;
                                    subStrategy.selfImprovementStatus = 'completed';
                                    renderActiveDeepthinkPipeline();
                                } catch (error: any) {
                                    // Removed console.error
                                    subStrategy.selfImprovementStatus = 'error';
                                    subStrategy.selfImprovementError = error.message || "Self-improvement failed";
                                    renderActiveDeepthinkPipeline();
                                }
                            })());
                        });
                    });

                    await Promise.allSettled(improvementPromises);
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during self-improvement.");

                // Individual strategy judging removed - all solutions go directly to final judge

                currentProcess.strategicSolverComplete = true;
                renderActiveDeepthinkPipeline();

            } catch (error: any) {
                // Removed console.error
                if (!(error instanceof PipelineStopRequestedError)) {
                    currentProcess.status = 'error';
                    currentProcess.error = `Strategic Solver failed: ${error.message}`;
                    renderActiveDeepthinkPipeline();
                }
                throw error;
            }
        })();

        // Wait for both tracks to complete
        await Promise.all([trackAPromise, trackBPromise]);

        // --- Final Judge: Direct evaluation of all solutions ---
        currentProcess.finalJudgingStatus = 'processing';
        renderActiveDeepthinkPipeline();

        // Collect all solutions from all sub-strategies (refined if available, otherwise original)
        const allSolutions: Array<{ id: string, solution: string, mainStrategyId: string, subStrategyText: string }> = [];

        currentProcess.initialStrategies.forEach(mainStrategy => {
            if (mainStrategy.isKilledByRedTeam) return; // Skip strategies killed by red team

            mainStrategy.subStrategies.forEach(subStrategy => {
                if (subStrategy.isKilledByRedTeam) return; // Skip sub-strategies killed by red team

                // Use refined solution if available and refinement was enabled, otherwise use original solution
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

            // Format all solutions with clear structure and IDs
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

                // Find the winning solution details
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
                // Removed console.error
            }
        }

        currentProcess.status = 'completed';
        renderActiveDeepthinkPipeline();

    } catch (error: any) {
        // Removed console.error
        if (error instanceof PipelineStopRequestedError) {
            currentProcess.status = 'stopped';
        } else {
            currentProcess.status = 'error';
            currentProcess.error = error.message;
        }
        renderActiveDeepthinkPipeline();
    } finally {
        updateControlsState({ isGenerating: false });
    }
}

// Helper function to render Strategic Solver content
export function renderStrategicSolverContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-strategic-solver model-detail-card">';

    if (deepthinkProcess.status === 'error' && deepthinkProcess.error) {
        html += `<div class="status-message error"><pre>${escapeHtml(deepthinkProcess.error)}</pre></div>`;
    } else if (deepthinkProcess.initialStrategies && deepthinkProcess.initialStrategies.length > 0) {
        // Add sub-tabs container with navigation
        html += '<div class="sub-tabs-container">';
        
        // Add sub-tab content
        html += '<div class="sub-tabs-content">';
        deepthinkProcess.initialStrategies.forEach((strategy, index) => {
            const isActive = (deepthinkProcess.activeStrategyTab || 0) === index;
            html += `<div class="sub-tab-content ${isActive ? 'active' : ''}" data-strategy-index="${index}">`;
            // Check if skip sub-strategies is enabled by checking if there's only one sub-strategy with "-direct" suffix
            const isSkipMode = strategy.subStrategies.length === 1 && strategy.subStrategies[0].id.endsWith('-direct');
            const directSubStrategy = isSkipMode ? strategy.subStrategies[0] : null;
            const hasDirectSolution = directSubStrategy && (directSubStrategy.solutionAttempt || directSubStrategy.refinedSolution);

            html += `
                <div class="strategy-card ${strategy.isKilledByRedTeam ? 'killed-strategy' : ''}">
                    <!-- Strategy Navigation Pills -->
                    <div class="sub-tabs-nav">`;
            
            // Add navigation buttons (only for this view)
            deepthinkProcess.initialStrategies.forEach((_, navIndex) => {
                const isNavActive = navIndex === index;
                const navStatusClass = deepthinkProcess.initialStrategies[navIndex].isKilledByRedTeam ? 'killed-strategy' : '';
                html += `<button class="sub-tab-button ${isNavActive ? 'active' : ''} ${navStatusClass}" data-strategy-index="${navIndex}" title="Strategy ${navIndex + 1}">
                    ${navIndex + 1}
                </button>`;
            });
            
            html += `</div>
                    
                    <div class="strategy-content">
                        <div class="strategy-text-container">
                            <div class="strategy-text" data-full-text="${escapeHtml(strategy.strategyText)}">
                                ${renderMathContent(strategy.strategyText.length > 200 ? strategy.strategyText.substring(0, 200) + '...' : strategy.strategyText)}
                            </div>
                            <div class="strategy-actions">
                                ${strategy.strategyText.length > 200 ? '<button class="show-more-btn" data-target="strategy">Show More</button>' : ''}
                                ${isSkipMode && hasDirectSolution ?
                    `<button class="view-solution-button" data-sub-strategy-id="${directSubStrategy.id}">
                                        <span class="material-symbols-outlined">visibility</span>
                                        View Solution
                                    </button>` : ''}
                            </div>
                        </div>
                        ${strategy.error ? `<div class="error-message">${escapeHtml(strategy.error)}</div>` : ''}
                        ${strategy.isKilledByRedTeam ? `<div class="elimination-reason">${escapeHtml(strategy.redTeamReason || 'Eliminated by Red Team')}</div>` : ''}
                    </div>
                    ${isSkipMode ? '' : renderSubStrategiesGrid(strategy.subStrategies)}
                </div>
            `;
            html += '</div>';
        });
        html += '</div>';
        html += '</div>';
    } else {
        html += '<div class="loading">Generating strategic approaches...</div>';
    }

    html += '</div>';
    return html;
}

// Add event handlers for Deepthink interactive elements
function addDeepthinkEventHandlers() {
    if (!pipelinesContentContainer) return;

    // Remove existing event listeners to prevent duplicates
    pipelinesContentContainer.removeEventListener('click', deepthinkClickHandler);

    // Add new event listener with delegation
    pipelinesContentContainer.addEventListener('click', deepthinkClickHandler);
}

// Centralized click handler for all Deepthink interactive elements
function deepthinkClickHandler(event: Event) {
    const target = event.target as HTMLElement;
    if (!target || !activeDeepthinkPipeline) return;

    // Handle sub-tab navigation
    if (target.classList.contains('sub-tab-button') || target.closest('.sub-tab-button')) {
        const button = target.closest('.sub-tab-button') as HTMLElement;
        if (button) {
            const strategyIndex = parseInt(button.getAttribute('data-strategy-index') || '0');
            activeDeepthinkPipeline.activeStrategyTab = strategyIndex;
            renderActiveDeepthinkPipeline();
        }
        return;
    }

    // Handle view solution buttons
    if (target.classList.contains('view-solution-button') || target.closest('.view-solution-button')) {
        event.preventDefault();
        event.stopPropagation();

        const button = target.closest('.view-solution-button') as HTMLElement;
        if (button) {
            const subStrategyId = button.getAttribute('data-sub-strategy-id');
            if (subStrategyId) {
                try {
                    openSubStrategySolutionModal(subStrategyId);
                } catch (error) {
                    // Removed console.error
                }
            }
        }
        return;
    }

    // Handle view argument buttons (embedded modal)
    if (target.classList.contains('view-argument-button') || target.closest('.view-argument-button')) {
        event.preventDefault();
        event.stopPropagation();

        // Check if modal is already open to prevent duplicates
        const existingModal = document.querySelector('.embedded-modal-overlay');
        if (existingModal) {
            return;
        }

        const button = target.closest('.view-argument-button') as HTMLElement;
        if (button) {
            const hypothesisId = button.getAttribute('data-hypothesis-id');
            if (hypothesisId) {
                try {
                    openHypothesisArgumentModal(hypothesisId);
                } catch (error) {
                    // Removed console.error
                }
            }
        }
        return;
    }

    // Handle view critique buttons (embedded modal)
    if (target.classList.contains('view-critique-button') || target.closest('.view-critique-button')) {
        event.preventDefault();
        event.stopPropagation();

        // Check if modal is already open to prevent duplicates
        const existingModal = document.querySelector('.embedded-modal-overlay');
        if (existingModal) {
            return;
        }

        const button = target.closest('.view-critique-button') as HTMLElement;
        if (button) {
            const critiqueId = button.getAttribute('data-critique-id');
            if (critiqueId) {
                try {
                    openCritiqueModal(critiqueId);
                } catch (error) {
                    // Removed console.error
                }
            }
        }
        return;
    }

    // Handle show more/less buttons
    if (target.classList.contains('show-more-btn')) {
        event.preventDefault();
        event.stopPropagation();

        const button = target as HTMLElement;
        const targetType = button.getAttribute('data-target');
        let textDiv: HTMLElement | null = null;
        let container: HTMLElement | null = null;

        // Find the correct text div and container based on target type
        if (targetType === 'sub-strategy') {
            container = button.closest('.sub-strategy-content-wrapper');
            textDiv = container?.querySelector('.sub-strategy-text') as HTMLElement;
        } else if (targetType === 'hypothesis') {
            container = button.closest('.hypothesis-text-container');
            textDiv = container?.querySelector('.hypothesis-text') as HTMLElement;
        } else if (targetType === 'strategy') {
            container = button.closest('.strategy-text-container');
            textDiv = container?.querySelector('.strategy-text') as HTMLElement;
        }

        if (textDiv && container) {
            const fullText = textDiv.getAttribute('data-full-text');
            if (fullText) {
                let truncateLength = 200;
                if (targetType === 'sub-strategy' || targetType === 'hypothesis') {
                    truncateLength = 150;
                }

                if (button.textContent === 'Show More') {
                    textDiv.innerHTML = renderMathContent(fullText);
                    button.textContent = 'Show Less';

                    // For sub-strategies, expand the text container
                    if (targetType === 'sub-strategy') {
                        const textContainer = container.querySelector('.sub-strategy-text-container') as HTMLElement;
                        if (textContainer) {
                            textContainer.classList.add('expanded');
                        }
                        // Also expand the parent card if it exists
                        const card = button.closest('.red-team-agent-card') as HTMLElement;
                        if (card) {
                            card.classList.add('expanded');
                        }
                    }

                    // For hypotheses, expand the container height
                    if (targetType === 'hypothesis') {
                        const card = button.closest('.red-team-agent-card');
                        if (card) {
                            const textContainer = card.querySelector('.hypothesis-text-container') as HTMLElement;
                            if (textContainer) {
                                textContainer.classList.add('expanded');
                            }
                        }
                    }

                    // For strategies, expand the strategy content
                    if (targetType === 'strategy') {
                        const strategyContent = button.closest('.strategy-content') as HTMLElement;
                        if (strategyContent) {
                            strategyContent.classList.add('expanded');
                        }
                    }
                } else {
                    const truncatedText = fullText.length > truncateLength ? fullText.substring(0, truncateLength) + '...' : fullText;
                    textDiv.innerHTML = renderMathContent(truncatedText);
                    button.textContent = 'Show More';

                    // Reset container heights when collapsing
                    if (targetType === 'sub-strategy') {
                        const textContainer = container.querySelector('.sub-strategy-text-container') as HTMLElement;
                        if (textContainer) {
                            textContainer.classList.remove('expanded');
                        }
                        const card = button.closest('.red-team-agent-card') as HTMLElement;
                        if (card) {
                            card.classList.remove('expanded');
                        }
                    }

                    if (targetType === 'hypothesis') {
                        const card = button.closest('.red-team-agent-card');
                        if (card) {
                            const textContainer = card.querySelector('.hypothesis-text-container') as HTMLElement;
                            if (textContainer) {
                                textContainer.classList.remove('expanded');
                            }
                        }
                    }

                    // For strategies, collapse the strategy content
                    if (targetType === 'strategy') {
                        const strategyContent = button.closest('.strategy-content') as HTMLElement;
                        if (strategyContent) {
                            strategyContent.classList.remove('expanded');
                        }
                    }

                    // Scroll the container to show the beginning of the content when collapsed
                    setTimeout(() => {
                        const container = button.closest('.red-team-agent-card, .strategy-text-container');
                        if (container) {
                            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 100);
                }
            }
        }
        return;
    }

    // Handle red team reasoning embedded modal
    if (target.classList.contains('red-team-fullscreen-btn') || target.closest('.red-team-fullscreen-btn')) {
        // Check if modal is already open
        const existingModal = document.querySelector('.embedded-modal-overlay');
        if (existingModal) {
            return;
        }
        
        const button = target.closest('.red-team-fullscreen-btn') as HTMLElement;
        if (button) {
            const agentId = button.getAttribute('data-agent-id');
            if (agentId && activeDeepthinkPipeline) {
                const agent = activeDeepthinkPipeline.redTeamAgents.find(a => a.id === agentId);
                if (agent && agent.reasoning) {
                    openRedTeamReasoningModal(agent);
                }
            }
        }
        return;
    }
}

// Function to open red team reasoning in embedded modal (like Adaptive Deepthink)
export function openRedTeamReasoningModal(agent: any) {
    // Parse the reasoning JSON
    let reasoningData: any = {};
    try {
        reasoningData = typeof agent.reasoning === 'string' ? JSON.parse(agent.reasoning) : agent.reasoning;
    } catch (e) {
        reasoningData = { raw: agent.reasoning };
    }

    // Build formatted content with red background
    let formattedContent = '';
    
    // Strategy Info
    if (reasoningData.strategy_id || reasoningData.strategy) {
        formattedContent += `
            <div class="red-team-strategy-id">${reasoningData.strategy_id || reasoningData.strategy || 'N/A'}</div>
        `;
    }

    // Verdict/Decision
    if (reasoningData.verdict || reasoningData.decision || reasoningData.action) {
        const verdict = reasoningData.verdict || reasoningData.decision || reasoningData.action;
        const verdictClass = verdict === 'ELIMINATE' || verdict === 'eliminate' || verdict.toLowerCase().includes('eliminate') ? 'verdict-eliminate' : 'verdict-keep';
        formattedContent += `
            <div class="red-team-verdict ${verdictClass}">${verdict}</div>
        `;
    }

    // Reasoning/Explanation
    const rawAnalysis = reasoningData.reasoning || reasoningData.explanation || reasoningData.analysis;
    if (rawAnalysis) {
        let cleanedAnalysis = rawAnalysis;
        if (typeof cleanedAnalysis === 'string') {
            cleanedAnalysis = cleanedAnalysis
                .replace(/(^|\n)\*{0,2}Challenge Evaluation:.*?(?=\n|$)/i, '$1')
                .trim();
        }

        const contentToRender = cleanedAnalysis && cleanedAnalysis !== ''
            ? cleanedAnalysis
            : (typeof agent.reasoning === 'string' ? agent.reasoning : JSON.stringify(agent.reasoning, null, 2));

        formattedContent += `
            <div class="red-team-analysis">
                ${renderMathContent(contentToRender)}
            </div>
        `;
    }

    // If no structured data, show raw
    if (!formattedContent) {
        formattedContent = `
            <div class="red-team-analysis">
                ${renderMathContent(typeof agent.reasoning === 'string' ? agent.reasoning : JSON.stringify(agent.reasoning, null, 2))}
            </div>
        `;
    }

    // Create embedded modal overlay with blur backdrop
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'embedded-modal-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.pointerEvents = 'auto';

    const modalContent = document.createElement('div');
    modalContent.className = 'embedded-modal-content';

    modalContent.innerHTML = `
        <div class="modal-header">
            <h4>Red Team Agent ${agent.id} - Evaluation</h4>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body custom-scrollbar red-team-reasoning-display">
            ${formattedContent}
        </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Add close functionality
    const closeBtn = modalContent.querySelector('.close-modal-btn');
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    const closeModal = () => {
        modalOverlay.remove();
        document.removeEventListener('keydown', handleKeydown);
    };

    closeBtn?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', handleKeydown);
}

// Modal function for sub-strategy solutions
export async function openSubStrategySolutionModal(subStrategyId: string) {
    if (!activeDeepthinkPipeline) {
        return;
    }

    // Find the sub-strategy
    let subStrategy: any = null;
    for (const strategy of activeDeepthinkPipeline.initialStrategies) {
        if (strategy.subStrategies) {
            subStrategy = strategy.subStrategies.find((sub: any) => sub.id === subStrategyId);
            if (subStrategy) break;
        }
    }

    if (!subStrategy) {
        return;
    }

    // Check if iterative corrections is enabled globally
    const iterativeCorrectionsEnabled = getIterativeCorrectionsEnabled();

    // If iterative corrections is enabled, use the Contextual UI
    if (iterativeCorrectionsEnabled) {
        // Call the other modal function that handles Contextual UI
        await openDeepthinkSolutionModal(subStrategyId);
        return;
    }

    // Otherwise, show the traditional side-by-side comparison UI
    // Check if refinement was actually performed during this run
    const refinementWasPerformed = subStrategy.refinedSolution !== subStrategy.solutionAttempt;
    const currentRefinementEnabled = getRefinementEnabled();

    // Create full-screen modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay fullscreen-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content fullscreen-content';

    // Determine refined solution panel styling and content
    const refinedPaneClass = refinementWasPerformed ? '' : 'disabled-pane';
    const refinedIcon = currentRefinementEnabled ? 'verified' : 'auto_fix_off';
    const refinedTitle = currentRefinementEnabled ? 'Refined Solution' : 'Refined Solution (Disabled)';
    const refinedOverlay = refinementWasPerformed ? '' : '<div class="disabled-overlay">Refinement Disabled</div>';

    modalContent.innerHTML = `
        <div class="modal-header" style="padding: 0.5rem 1.5rem; min-height: auto;">
            <h4 class="modal-title">Sub-Strategy Solution</h4>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body">
            <div class="side-by-side-comparison">
                <div class="comparison-side">
                    <div class="preview-header">
                        <h4 class="comparison-title no-padding-left">
                            <span class="material-symbols-outlined">psychology</span>
                            <span>Solution Attempt</span>
                        </h4>
                        <div class="code-actions">
                            <button class="copy-solution-btn" data-content="${escapeHtml(subStrategy.solutionAttempt || '')}">
                                <span class="material-symbols-outlined">content_copy</span>
                                <span class="button-text">Copy</span>
                            </button>
                            <button class="download-solution-btn" data-content="${escapeHtml(subStrategy.solutionAttempt || '')}" data-filename="solution-attempt.md">
                                <span class="material-symbols-outlined">download</span>
                                <span class="button-text">Download</span>
                            </button>
                        </div>
                    </div>
                    <div class="comparison-content custom-scrollbar">
                        ${subStrategy.solutionAttempt ? renderMathContent(subStrategy.solutionAttempt) : '<div class="no-content">No solution attempt available</div>'}
                    </div>
                </div>
                <div class="comparison-side ${refinedPaneClass}">
                    <div class="preview-header">
                        <h4 class="comparison-title no-padding-left">
                            <span class="material-symbols-outlined">${refinedIcon}</span>
                            <span>${refinedTitle}</span>
                        </h4>
                        <div class="code-actions">
                            <button class="copy-solution-btn" data-content="${escapeHtml(subStrategy.refinedSolution || '')}" ${!refinementWasPerformed ? 'disabled' : ''}>
                                <span class="material-symbols-outlined">content_copy</span>
                                <span class="button-text">Copy</span>
                            </button>
                            <button class="download-solution-btn" data-content="${escapeHtml(subStrategy.refinedSolution || '')}" data-filename="refined-solution.md" ${!refinementWasPerformed ? 'disabled' : ''}>
                                <span class="material-symbols-outlined">download</span>
                                <span class="button-text">Download</span>
                            </button>
                        </div>
                    </div>
                    <div class="comparison-content custom-scrollbar">
                        ${subStrategy.refinedSolution ? renderMathContent(subStrategy.refinedSolution) : '<div class="no-content">No refined solution available</div>'}
                        ${subStrategy.error ? `<div class="error-content">${escapeHtml(subStrategy.error)}</div>` : ''}
                        ${refinedOverlay}
                    </div>
                </div>
            </div>
        </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    // Make visible on the next frame to trigger CSS transitions
    requestAnimationFrame(() => modalOverlay.classList.add('is-visible'));

    // Add close functionality
    const closeBtn = modalContent.querySelector('.close-modal-btn');
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    const closeModal = () => {
        modalOverlay.classList.remove('is-visible');
        // After transition ends, remove from DOM and cleanup listeners
        const remove = () => {
            modalOverlay.removeEventListener('transitionend', remove);
            document.removeEventListener('keydown', handleKeydown);
            if (modalOverlay.parentNode) {
                document.body.removeChild(modalOverlay);
            }
        };
        modalOverlay.addEventListener('transitionend', remove);
        // Fallback in case transitionend doesn't fire
        setTimeout(remove, 400);
    };

    closeBtn?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', handleKeydown);

    // Use the modular action button functionality
    import('../Components/ActionButton.js').then(module => {
        module.bindCopyDownloadButtons(modalContent);
    }).catch(() => {
        // Fallback if module import fails
        // Removed console.warn

        modalContent.querySelectorAll('.copy-solution-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const content = btn.getAttribute('data-content') || '';
                try {
                    await navigator.clipboard.writeText(content);
                    // Removed console.log
                } catch (err) {
                    // Removed console.error
                }
            });
        });

        modalContent.querySelectorAll('.download-solution-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const content = btn.getAttribute('data-content') || '';
                const filename = btn.getAttribute('data-filename') || 'solution.md';

                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        });
    });
}

// Modal function for critique view
export function openCritiqueModal(critiqueId: string) {
    if (!activeDeepthinkPipeline) {
        return;
    }

    const critique = activeDeepthinkPipeline.solutionCritiques.find(c => c.id === critiqueId);
    if (!critique) {
        // Removed console.error
        return;
    }

    // Create embedded modal overlay with blur backdrop
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'embedded-modal-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.pointerEvents = 'auto';

    const modalContent = document.createElement('div');
    modalContent.className = 'embedded-modal-content';

    modalContent.innerHTML = `
        <div class="modal-header">
            <h4>Solution Critique</h4>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body custom-scrollbar">
            <div class="critique-content">
                ${renderMathContent(critique.critiqueResponse || 'No critique available')}
            </div>
        </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Add close functionality
    const closeBtn = modalContent.querySelector('.close-modal-btn');
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    const closeModal = () => {
        modalOverlay.remove();
        document.removeEventListener('keydown', handleKeydown);
    };

    closeBtn?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', handleKeydown);
}

// Modal function for hypothesis arguments
export function openHypothesisArgumentModal(hypothesisId: string) {
    if (!activeDeepthinkPipeline) {
        return;
    }

    const hypothesis = activeDeepthinkPipeline.hypotheses.find(h => h.id === hypothesisId);
    if (!hypothesis) {
        // Removed console.error
        return;
    }

    // Create embedded modal overlay with blur backdrop
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'embedded-modal-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.pointerEvents = 'auto';

    const modalContent = document.createElement('div');
    modalContent.className = 'embedded-modal-content';

    modalContent.innerHTML = `
        <div class="modal-header">
            <h4>Hypothesis Argument</h4>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body custom-scrollbar">
            <div class="hypothesis-argument-content">
                ${renderMathContent(hypothesis.testerAttempt || 'No argument available')}
            </div>
        </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Add close functionality
    const closeBtn = modalContent.querySelector('.close-modal-btn');
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    const closeModal = () => {
        modalOverlay.remove();
        document.removeEventListener('keydown', handleKeydown);
    };

    closeBtn?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', handleKeydown);
}

// Helper function to render sub-strategies with grid layout and view solution buttons
function renderSubStrategiesGrid(subStrategies: any[]): string {
    if (!subStrategies || subStrategies.length === 0) return '';

    let html = '<div class="red-team-agents-grid">';
    subStrategies.forEach((subStrategy, index) => {
        const hasContent = subStrategy.solutionAttempt || subStrategy.refinedSolution;
        const fullText = subStrategy.subStrategyText || 'No sub-strategy text available';
        const truncatedText = fullText.length > 150 ? fullText.substring(0, 150) + '...' : fullText;

        // Ensure we have content to display
        const displayText = fullText === 'No sub-strategy text available' ? fullText : truncatedText;
        const renderedContent = renderMathContent && typeof renderMathContent === 'function' ? renderMathContent(displayText) : displayText;

        html += `
            <div class="red-team-agent-card ${subStrategy.isKilledByRedTeam ? 'killed-sub-strategy' : ''}">
                <div class="red-team-agent-header">
                    <h4 class="red-team-agent-title">Sub-Strategy ${index + 1}</h4>
                    <span class="status-badge status-${subStrategy.refinedSolution ? 'completed' :
                subStrategy.solutionAttempt ? 'processing' :
                    'pending'
            }">${subStrategy.refinedSolution ? 'Completed' :
                subStrategy.solutionAttempt ? 'Processing (1/2)' :
                    'Processing'
            }</span>
                </div>
                <div class="red-team-results">
                    <div class="sub-strategy-content-wrapper">
                        <div class="sub-strategy-text-container">
                            <div class="sub-strategy-text" data-full-text="${escapeHtml(fullText)}" style="max-height: none; overflow: visible;">
                                ${renderedContent}
                            </div>
                        </div>
                        <div class="sub-strategy-actions">
                            ${fullText.length > 150 && fullText !== 'No sub-strategy text available' ?
                '<button class="show-more-btn" data-target="sub-strategy">Show More</button>' : ''}
                            ${hasContent ?
                `<button class="view-solution-button" data-sub-strategy-id="${subStrategy.id}">
                                    <span class="material-symbols-outlined">visibility</span>
                                    View Solution
                                </button>` : ''}
                        </div>
                    </div>
                    ${subStrategy.error ? `<div class="error-message">${escapeHtml(subStrategy.error)}</div>` : ''}
                    ${subStrategy.isKilledByRedTeam ? `<div class="elimination-reason">${escapeHtml(subStrategy.redTeamReason || 'Eliminated by Red Team')}</div>` : ''}
                </div>
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Helper function to render Hypothesis Explorer content
export function renderHypothesisExplorerContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-hypothesis-explorer model-detail-card">';

    if (deepthinkProcess.hypothesisGenStatus === 'completed' && deepthinkProcess.hypotheses?.length > 0) {

        // Add hypothesis grid with red team structure
        html += '<div class="red-team-agents-grid">';
        deepthinkProcess.hypotheses.forEach((hypothesis, index) => {
            html += `
                <div class="red-team-agent-card">
                    <div class="red-team-agent-header">
                        <h4 class="red-team-agent-title">Hypothesis ${index + 1}</h4>
                        <span class="status-badge status-${hypothesis.testerStatus}">${hypothesis.testerStatus === 'completed' ? 'Completed' : hypothesis.testerStatus === 'processing' ? 'Processing' : 'Pending'}</span>
                    </div>
                    <div class="red-team-results">
                        <div class="hypothesis-text-container">
                            <div class="hypothesis-text" data-full-text="${escapeHtml(hypothesis.hypothesisText)}">
                                ${renderMathContent(hypothesis.hypothesisText && hypothesis.hypothesisText.length > 150 ? hypothesis.hypothesisText.substring(0, 150) + '...' : (hypothesis.hypothesisText || 'No hypothesis text available'))}
                            </div>
                            ${hypothesis.hypothesisText && hypothesis.hypothesisText.length > 150 ? '<button class="show-more-btn" data-target="hypothesis">Show More</button>' : ''}
                        </div>
                        ${hypothesis.testerAttempt ? `<div class="red-team-reasoning-section">
                            <button class="view-argument-button" data-hypothesis-id="${hypothesis.id}">
                                <span class="material-symbols-outlined">article</span>
                                View The Argument
                            </button>
                        </div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        // Show knowledge packet section below hypothesis grid if it exists
        if (deepthinkProcess.knowledgePacket) {
            html += `<div class="knowledge-packet-section">
                <div class="knowledge-packet-header">
                    <div class="knowledge-packet-title">
                        <span class="material-symbols-outlined">psychology</span>
                        <span>Full Information Packet:</span>
                    </div>
                </div>
                <div class="knowledge-packet-content">
                    <div class="knowledge-packet-card">
                        ${parseKnowledgePacketForStyling(deepthinkProcess.knowledgePacket)}
                    </div>
                </div>
            </div>`;
        }
    } else if (deepthinkProcess.hypothesisGenStatus === 'processing') {
        html += '<div class="loading">Generating and testing hypotheses...</div>';
    } else {
        html += '<div class="status-message">Hypothesis exploration not yet started.</div>';
    }

    html += '</div>';
    return html;
}

// Helper function to render Dissected Observations content
export function renderDissectedObservationsContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-dissected-observations model-detail-card">';

    // Only show if refinement is enabled or if we have existing critique data (for imported sessions)
    const refinementEnabled = getRefinementEnabled ? getRefinementEnabled() : false;
    const hasExistingCritiqueData = deepthinkProcess.solutionCritiques && deepthinkProcess.solutionCritiques.length > 0;

    if (!refinementEnabled && !hasExistingCritiqueData) {
        html += '<div class="status-message">Dissected Observations are only available when refinement is enabled.</div>';
    } else if (hasExistingCritiqueData) {
        // Show critique cards (one per main strategy)
        html += '<div class="red-team-agents-grid">';
        deepthinkProcess.solutionCritiques.forEach((critique) => {
            const mainStrategy = deepthinkProcess.initialStrategies.find(s => s.id === critique.mainStrategyId);
            const activeSubStrategies = mainStrategy?.subStrategies.filter(
                sub => !sub.isKilledByRedTeam && sub.solutionAttempt
            ) || [];

            // Determine if this is an iterative critique
            const iterationLabel = (critique as any).retryAttempt
                ? ` - Iteration ${(critique as any).retryAttempt}`
                : '';

            html += `
                <div class="red-team-agent-card">
                    <div class="red-team-agent-header">
                        <h4 class="red-team-agent-title">Critique: ${critique.mainStrategyId}${iterationLabel}</h4>
                        <span class="status-badge status-${critique.status}">${critique.status === 'completed' ? 'Completed' :
                    critique.status === 'processing' ? 'Processing' :
                        critique.status === 'error' ? 'Error' : 'Pending'
                }</span>
                    </div>
                    <div class="red-team-results">
                        ${mainStrategy ? `
                            <div class="sub-strategy-text-container">
                                <div class="sub-strategy-label">Main Strategy:</div>
                                <div class="sub-strategy-text">
                                    ${renderMathContent(mainStrategy.strategyText && mainStrategy.strategyText.length > 150 ?
                    mainStrategy.strategyText.substring(0, 150) + '...' :
                    (mainStrategy.strategyText || 'No strategy text'))}
                                </div>
                                <div class="sub-strategy-label" style="margin-top: 8px;">Sub-Strategies Critiqued: ${activeSubStrategies.length}</div>
                            </div>
                        ` : ''}
                        ${critique.critiqueResponse ? `
                            <div class="red-team-reasoning-section">
                                <button class="view-critique-button" data-critique-id="${critique.id}">
                                    <span class="material-symbols-outlined">rate_review</span>
                                    View Full Critique
                                </button>
                            </div>
                        ` : critique.status === 'error' ? `
                            <div class="error-message">${critique.error || 'Critique failed'}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        // Show synthesis section if available
        if (deepthinkProcess.dissectedSynthesisStatus) {
            html += `<div class="synthesis-section">
                <div class="synthesis-header">
                    <div class="synthesis-title">
                        <span class="material-symbols-outlined">integration_instructions</span>
                        <span>Dissected Observations Synthesis:</span>
                    </div>
                    <span class="status-badge status-${deepthinkProcess.dissectedSynthesisStatus}">
                        ${deepthinkProcess.dissectedSynthesisStatus === 'completed' ? 'Synthesis Complete' :
                    deepthinkProcess.dissectedSynthesisStatus === 'processing' ? 'Synthesizing...' :
                        deepthinkProcess.dissectedSynthesisStatus === 'error' ? 'Synthesis Failed' : 'Pending'}
                    </span>
                </div>`;

            if (deepthinkProcess.dissectedObservationsSynthesis) {
                html += `
                    <div class="synthesis-content">
                        <div class="synthesis-card">
                            ${renderMathContent(deepthinkProcess.dissectedObservationsSynthesis)}
                        </div>
                    </div>
                `;
            } else if (deepthinkProcess.dissectedSynthesisStatus === 'error') {
                html += `<div class="error-message">${deepthinkProcess.dissectedSynthesisError || 'Synthesis failed'}</div>`;
            }

            html += '</div>';
        }
    } else if (deepthinkProcess.solutionCritiquesStatus === 'processing') {
        html += '<div class="loading">Critiquing solutions...</div>';
    } else {
        html += '<div class="status-message">Solution critiques not yet started. Waiting for solutions to be generated.</div>';
    }

    html += '</div>';
    return html;
}

// Helper function to render Red Team content
export function renderRedTeamContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-red-team model-detail-card">';

    if (deepthinkProcess.redTeamAgents && deepthinkProcess.redTeamAgents.length > 0) {
        // Add red team agents grid
        html += '<div class="red-team-agents-grid">';
        deepthinkProcess.redTeamAgents.forEach((agent, index) => {
            const killedCount = (agent.killedStrategyIds?.length || 0) + (agent.killedSubStrategyIds?.length || 0);
            html += `
                <div class="red-team-agent-card">
                    <div class="red-team-agent-header">
                        <h4 class="red-team-agent-title">Red Team Agent ${index + 1}</h4>
                        <span class="status-badge status-${agent.status}">${agent.status}</span>
                    </div>
                    <div class="red-team-results">
                        <div class="red-team-evaluation-summary">
                            <div class="evaluation-metric">
                                <span class="metric-value">${killedCount}</span>
                                <span class="metric-label">Items Eliminated</span>
                            </div>
                            <div class="evaluation-metric">
                                <span class="metric-value">${agent.killedStrategyIds?.length || 0}</span>
                                <span class="metric-label">Strategies Killed</span>
                            </div>
                        </div>
                        ${killedCount > 0 ? `<div class="killed-items">
                            ${agent.killedStrategyIds?.length > 0 ? `<p><strong>Eliminated Strategies:</strong> ${agent.killedStrategyIds.join(', ')}</p>` : ''}
                            ${agent.killedSubStrategyIds?.length > 0 ? `<p><strong>Eliminated Sub-Strategies:</strong> ${agent.killedSubStrategyIds.join(', ')}</p>` : ''}
                        </div>` : ''}
                        ${agent.reasoning ? `<div class="red-team-reasoning-section">
                            <div class="red-team-reasoning-header">
                                <div class="red-team-reasoning-toggle">
                                    <span class="code-icon">&lt;/&gt;</span>
                                    <span>Reasoning</span>
                                </div>
                                <div class="red-team-reasoning-buttons">
                                    <button class="red-team-fullscreen-btn" data-agent-id="${agent.id}">
                                        <span class="material-symbols-outlined">fullscreen</span>
                                    </button>
                                </div>
                            </div>
                        </div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += '<div class="status-message">Red Team evaluation not yet started.</div>';
    }

    html += '</div>';
    return html;
}

// Helper function to render Final Result content
export function renderFinalResultContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-final-result model-detail-card">';

    if (deepthinkProcess.finalJudgingStatus === 'completed' && deepthinkProcess.finalJudgedBestSolution) {
        html += `
            <div class="judged-solution-container final-judged-solution">
                ${renderMathContent(deepthinkProcess.finalJudgedBestSolution)}
            </div>
        `;
    } else if (deepthinkProcess.finalJudgingStatus === 'processing') {
        html += '<div class="loading">Final judging in progress...</div>';
    } else if (deepthinkProcess.finalJudgingStatus === 'error') {
        html += `<div class="status-message error">
            <p>Error during final judging:</p>
            <pre>${escapeHtml(deepthinkProcess.finalJudgingError || 'Unknown error')}</pre>
        </div>`;
    } else if (deepthinkProcess.status === 'completed') {
        html += '<div class="status-message">Final result not available</div>';
    } else {
        html += '<div class="status-message">Waiting for solution completion...</div>';
    }

    html += '</div>';
    return html;
}

// Function to get the current active deepthink pipeline
export function getActiveDeepthinkPipeline() {
    return activeDeepthinkPipeline;
}

// Function to set the active deepthink pipeline (for import)
export function setActiveDeepthinkPipelineForImport(pipeline: DeepthinkPipelineState | null) {
    activeDeepthinkPipeline = pipeline;
    if (setActiveDeepthinkPipeline) {
        setActiveDeepthinkPipeline(pipeline);
    }
}

// Main function to render the active Deepthink pipeline UI
export function renderActiveDeepthinkPipeline() {
    if (!activeDeepthinkPipeline || !tabsNavContainer || !pipelinesContentContainer) {
        return;
    }

    // Update the active solution modal if it's open
    updateActiveSolutionModal().catch(() => {
        // Ignore errors in modal updates
    });

    const deepthinkProcess = activeDeepthinkPipeline;

    // Clear existing content
    tabsNavContainer.innerHTML = '';
    pipelinesContentContainer.innerHTML = '';

    // Check feature enablement
    const isRedTeamEnabled = getSelectedRedTeamAggressiveness() !== 'off';
    const isHypothesisEnabled = getSelectedHypothesisCount() > 0;
    const isDissectedObservationsEnabled = getRefinementEnabled() || getIterativeCorrectionsEnabled() || getDissectedObservationsEnabled();

    // Create tab navigation with Final Result at the end - filter based on enabled features
    const allTabs = [
        { id: 'strategic-solver', label: 'Strategic Solver', icon: 'psychology', alwaysShow: true },
        { id: 'hypothesis-explorer', label: 'Hypothesis Explorer', icon: 'science', alwaysShow: false, enabled: isHypothesisEnabled },
        { id: 'dissected-observations', label: 'Dissected Observations', icon: 'troubleshoot', alwaysShow: false, enabled: isDissectedObservationsEnabled },
        { id: 'red-team', label: 'Red Team', icon: 'security', hasPinkGlow: true, alwaysShow: false, enabled: isRedTeamEnabled },
        { id: 'final-result', label: 'Final Result', icon: 'flag', alignRight: true, alwaysShow: true }
    ];

    // Filter tabs based on enabled features
    const tabs = allTabs.filter(tab => tab.alwaysShow || tab.enabled);

    // Ensure the active tab is valid - if current active tab is disabled, switch to first available tab
    const isActiveTabValid = tabs.some(tab => tab.id === deepthinkProcess.activeTabId);
    if (!isActiveTabValid && tabs.length > 0) {
        deepthinkProcess.activeTabId = tabs[0].id;
    }

    // Create tab buttons
    tabs.forEach(tab => {
        const tabButton = document.createElement('button');

        // Determine status class based on pipeline state
        let statusClass = '';
        if (tab.id === 'strategic-solver' && deepthinkProcess.initialStrategies) {
            if (deepthinkProcess.status === 'error') {
                statusClass = 'status-deepthink-error';
            } else if (deepthinkProcess.initialStrategies.some(s => s.status === 'completed')) {
                statusClass = 'status-deepthink-completed';
            } else if (deepthinkProcess.initialStrategies.some(s => s.status === 'processing')) {
                statusClass = 'status-deepthink-processing';
            }
        } else if (tab.id === 'hypothesis-explorer' && deepthinkProcess.hypothesisExplorerComplete) {
            statusClass = 'status-deepthink-completed';
        } else if (tab.id === 'dissected-observations') {
            if (deepthinkProcess.dissectedSynthesisStatus === 'completed') {
                statusClass = 'status-deepthink-completed';
            } else if (deepthinkProcess.dissectedSynthesisStatus === 'error') {
                statusClass = 'status-deepthink-error';
            } else if (deepthinkProcess.dissectedSynthesisStatus === 'processing' || deepthinkProcess.solutionCritiquesStatus === 'processing') {
                statusClass = 'status-deepthink-processing';
            }
        } else if (tab.id === 'red-team' && deepthinkProcess.redTeamComplete) {
            statusClass = 'status-deepthink-completed';
        } else if (tab.id === 'final-result' && deepthinkProcess.finalJudgingStatus) {
            if (deepthinkProcess.finalJudgingStatus === 'completed') {
                statusClass = 'status-deepthink-completed';
            } else if (deepthinkProcess.finalJudgingStatus === 'error') {
                statusClass = 'status-deepthink-error';
            } else if (deepthinkProcess.finalJudgingStatus === 'processing') {
                statusClass = 'status-deepthink-processing';
            }
        }

        tabButton.className = `tab-button deepthink-mode-tab ${deepthinkProcess.activeTabId === tab.id ? 'active' : ''} ${statusClass} ${tab.hasPinkGlow ? 'red-team-pink-glow' : ''} ${tab.alignRight ? 'align-right' : ''}`;
        tabButton.innerHTML = `<span class="material-symbols-outlined">${tab.icon}</span>${tab.label}`;
        tabButton.addEventListener('click', () => {
            deepthinkProcess.activeTabId = tab.id;
            renderActiveDeepthinkPipeline();
        });
        tabsNavContainer!.appendChild(tabButton);
    });

    // Create tab content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'tab-content deepthink-tab-content';

    switch (deepthinkProcess.activeTabId) {
        case 'strategic-solver':
            contentDiv.innerHTML = renderStrategicSolverContent(deepthinkProcess);
            break;
        case 'hypothesis-explorer':
            contentDiv.innerHTML = renderHypothesisExplorerContent(deepthinkProcess);
            break;
        case 'dissected-observations':
            contentDiv.innerHTML = renderDissectedObservationsContent(deepthinkProcess);
            break;
        case 'red-team':
            contentDiv.innerHTML = renderRedTeamContent(deepthinkProcess);
            break;
        case 'final-result':
            contentDiv.innerHTML = renderFinalResultContent(deepthinkProcess);
            break;
        default:
            contentDiv.innerHTML = renderStrategicSolverContent(deepthinkProcess);
    }

    pipelinesContentContainer.appendChild(contentDiv);

    // Add event handlers for new interactive elements
    addDeepthinkEventHandlers();
}



// ----- END DEEPTHINK MODE SPECIFIC FUNCTIONS -----