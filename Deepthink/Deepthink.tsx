import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { type CustomizablePromptsDeepthink, createDefaultCustomPromptsDeepthink } from './DeepthinkPrompts.js';

// Import types and constants from main index.tsx
export interface DeepthinkSubStrategyData {
    id: string;
    subStrategyText: string;
    requestPromptSolutionAttempt?: string;
    solutionAttempt?: string;
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
}

export interface DeepthinkHypothesisData {
    id: string;
    hypothesisText: string;
    testerRequestPrompt?: string;
    testerAttempt?: string;
    testerStatus: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    testerError?: string;
    testerRetryAttempt?: number;
    finalStatus: 'pending' | 'validated' | 'refuted' | 'unresolved' | 'contradiction' | 'needs_further_analysis';
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
let ai: GoogleGenAI | null;
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
let escapeHtml: (unsafe: string) => string;
let renderMarkdown: (content: string) => string;
let renderMathContent: (content: string) => string;
let cleanTextOutput: (text: string) => string;
let updateControlsState: (newState: any) => void;
let customPromptsDeepthinkState: CustomizablePromptsDeepthink;
let tabsNavContainer: HTMLElement | null;
let pipelinesContentContainer: HTMLElement | null;

// Constants
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 2000;
const BACKOFF_FACTOR = 2;

// Initialization function to set up dependencies
export function initializeDeepthinkModule(dependencies: {
    ai: GoogleGenAI | null;
    callGemini: typeof callGemini;
    cleanOutputByType: typeof cleanOutputByType;
    parseJsonSuggestions: typeof parseJsonSuggestions;
    parseJsonSafe: typeof parseJsonSafe;
    updateControlsState: (newState: any) => void;
    escapeHtml: typeof escapeHtml;
    renderMarkdown: typeof renderMarkdown;
    renderMathContent: (content: string) => string;
    getSelectedTemperature: () => number;
    getSelectedModel: () => string;
    getSelectedTopP: () => number;
    getSelectedStrategiesCount: () => number;
    getSelectedSubStrategiesCount: () => number;
    getRefinementEnabled: () => boolean;
    getSelectedHypothesisCount: () => number;
    getSelectedRedTeamAggressiveness: () => string;
    cleanTextOutput: (text: string) => string;
    customPromptsDeepthinkState: CustomizablePromptsDeepthink;
    tabsNavContainer: HTMLElement | null;
    pipelinesContentContainer: HTMLElement | null;
    setActiveDeepthinkPipeline: (pipeline: DeepthinkPipelineState | null) => void;
}) {
    ai = dependencies.ai;
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
    cleanTextOutput = dependencies.cleanTextOutput;
    escapeHtml = dependencies.escapeHtml;
    renderMarkdown = dependencies.renderMarkdown;
    renderMathContent = dependencies.renderMathContent;
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
export function openDeepthinkSolutionModal(subStrategyId: string) {
    const subStrategy = activeDeepthinkPipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
    if (!subStrategy) return;

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
    modalTitle.textContent = 'Solution Details';
    modalHeader.appendChild(modalTitle);

    const closeModalButton = document.createElement('button');
    closeModalButton.className = 'modal-close-button';
    closeModalButton.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeModalButton.addEventListener('click', closeSolutionModal);
    modalHeader.appendChild(closeModalButton);

    modalContent.appendChild(modalHeader);

    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    modalBody.style.padding = '20px';
    modalBody.style.height = 'calc(100vh - 120px)';

    const refinementEnabled = getRefinementEnabled();
    const solutionComparison = document.createElement('div');
    solutionComparison.style.display = 'grid';
    solutionComparison.style.gridTemplateColumns = refinementEnabled ? '1fr 1fr' : '1fr';
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
    leftHeader.innerHTML = refinementEnabled 
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

    // Always show refined solution panel, but grey it out if refinement is disabled
    const rightPanel = document.createElement('div');
    rightPanel.style.display = 'flex';
    rightPanel.style.flexDirection = 'column';
    rightPanel.style.border = '1px solid #333';
    rightPanel.style.borderRadius = '8px';
    rightPanel.style.overflow = 'hidden';
    
    // Apply disabled styling if refinement is disabled
    if (!refinementEnabled) {
        rightPanel.classList.add('disabled-pane');
    }

    const rightHeader = document.createElement('div');
    rightHeader.style.padding = '12px 16px';
    rightHeader.style.background = 'rgba(15, 17, 32, 0.4)';
    rightHeader.style.borderBottom = '1px solid #333';
    
    const headerContent = refinementEnabled 
        ? '<h4 style="margin: 0;"><span class="material-symbols-outlined">auto_fix_high</span>Refined Solution</h4>'
        : '<h4 style="margin: 0; opacity: 0.6;"><span class="material-symbols-outlined">auto_fix_off</span>Refined Solution (Disabled)</h4>';
    rightHeader.innerHTML = headerContent;
    rightPanel.appendChild(rightHeader);

    const rightContent = document.createElement('div');
    rightContent.style.flex = '1';
    rightContent.style.overflow = 'auto';
    rightContent.style.padding = '16px';
    rightContent.style.position = 'relative';
    
    const contentText = refinementEnabled 
        ? (subStrategy.refinedSolution || 'Refined solution not available')
        : (subStrategy.refinedSolution || subStrategy.solutionAttempt || 'Solution refinement is disabled');
    
    rightContent.innerHTML = renderMathContent(contentText);
    
    // Add disabled overlay if refinement is off
    if (!refinementEnabled) {
        const disabledOverlay = document.createElement('div');
        disabledOverlay.classList.add('disabled-overlay');
        disabledOverlay.textContent = 'Refinement Disabled';
        rightContent.appendChild(disabledOverlay);
    }
    
    rightPanel.appendChild(rightContent);
    solutionComparison.appendChild(rightPanel);
    modalBody.appendChild(solutionComparison);
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
}

// Knowledge packet styling function
export function parseKnowledgePacketForStyling(knowledgePacket: string): string {
    if (!knowledgePacket) return '<div class="no-knowledge">No knowledge packet available</div>';
    
    // For the current knowledge packet format, we'll render it as markdown content
    return renderMathContent(knowledgePacket);
}

// ---------- DEEPTHINK MODE SPECIFIC FUNCTIONS ----------

export async function startDeepthinkAnalysisProcess(challengeText: string, imageBase64?: string | null, imageMimeType?: string | null) {
    if (!ai) {
        return;
    }
    activeDeepthinkPipeline = {
        id: `deepthink-process-${Date.now()}`,
        challenge: challengeText,
        initialStrategies: [],
        hypotheses: [],
        redTeamAgents: [],
        status: 'processing',
        isStopRequested: false,
        activeTabId: 'challenge-details',
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
        targetStatusField: DeepthinkMainStrategyData | DeepthinkSubStrategyData | DeepthinkPipelineState | DeepthinkHypothesisData,
        retryAttemptField: 'retryAttempt' | 'selfImprovementRetryAttempt' | 'testerRetryAttempt' | 'hypothesisGenRetryAttempt'
    ): Promise<string> => {
        if (!currentProcess || currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDescription}`);
        let responseText = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDescription}`);

            try {
                (targetStatusField as any)[retryAttemptField] = attempt;
                renderActiveDeepthinkPipeline();

                const strategyResponse = await callGemini(parts, getSelectedTemperature(), getSelectedModel(), systemInstruction, isJson, getSelectedTopP());
                responseText = strategyResponse.text || "";

                if (responseText && responseText.trim() !== "") {
                    break;
                } else {
                    throw new Error("Empty response from API");
                }
            } catch (error: any) {
                console.error(`API call failed (attempt ${attempt + 1}):`, error);

                if (attempt === MAX_RETRIES) {
                    throw error;
                } else {
                    const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        return responseText;
    };

    try {
        // Track A: Strategic Solver (Main strategies → Sub-strategies → Solution attempts → Self-improvement → Judging)
        const trackAPromise = (async () => {
            try {
                // Step 1: Generate initial strategies
                currentProcess.status = 'processing';
                renderActiveDeepthinkPipeline();

                const parts: Part[] = [{ text: challengeText }];
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

                // Step 2: Generate sub-strategies for each main strategy IN PARALLEL
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
                    } catch (error: any) {
                        console.error(`Sub-strategy generation failed for ${mainStrategy.id}:`, error);
                        mainStrategy.status = 'error';
                        mainStrategy.error = error.message || "Sub-strategy generation failed";
                        renderActiveDeepthinkPipeline();
                    }
                }));

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped after sub-strategy generation.");
                
                // Step 2.5: Run Red Team evaluation BEFORE any solution attempts (if enabled)
                const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();
                if (currentRedTeamAggressiveness !== 'off') {
                    try {
                        await runDeepthinkRedTeamEvaluation(currentProcess, challengeText, imageBase64, imageMimeType, makeDeepthinkApiCall);
                    } catch (e: any) {
                        console.error("Red Team evaluation failed:", e);
                        currentProcess.redTeamStatus = 'error';
                        currentProcess.redTeamError = e.message || "Red Team evaluation failed";
                        currentProcess.redTeamComplete = true;
                        renderActiveDeepthinkPipeline();
                    }
                } else {
                    // Red team is disabled - skip evaluation entirely
                    console.log("Red team disabled - skipping evaluation");
                    currentProcess.redTeamStatus = 'completed';
                    currentProcess.redTeamComplete = true;
                    currentProcess.redTeamAgents = [];
                    renderActiveDeepthinkPipeline();
                }

                // Early exit if Red Team eliminated everything (only check if red team was enabled)
                if (currentRedTeamAggressiveness !== 'off') {
                    const remainingStrategies = currentProcess.initialStrategies.filter(s => !s.isKilledByRedTeam);
                    const remainingSubStrategies = currentProcess.initialStrategies.flatMap(s => s.subStrategies.filter(sub => !sub.isKilledByRedTeam));
                    if (remainingStrategies.length === 0) {
                        console.warn("All main strategies were eliminated by Red Team evaluation");
                        currentProcess.status = 'completed';
                        currentProcess.error = "All strategies were eliminated by Red Team evaluation. No solution attempts can be made.";
                        renderActiveDeepthinkPipeline();
                        return;
                    }
                    if (remainingSubStrategies.length === 0) {
                        console.warn("All sub-strategies were eliminated by Red Team evaluation");
                        currentProcess.status = 'completed';
                        currentProcess.error = "All sub-strategies were eliminated by Red Team evaluation. No solution attempts can be made.";
                        renderActiveDeepthinkPipeline();
                        return;
                    }
                }

                // Check prerequisites without blocking loops
                const checkPrerequisites = () => {
                    const redTeamComplete = currentProcess.redTeamComplete;
                    const knowledgePacketReady = currentProcess.hypothesisExplorerComplete && currentProcess.knowledgePacket;
                    return (redTeamComplete && knowledgePacketReady) || currentProcess.isStopRequested;
                };
                
                const waitForPrerequisites = async () => {
                    return new Promise((resolve) => {
                        const checkInterval = setInterval(() => {
                            if (checkPrerequisites()) {
                                clearInterval(checkInterval);
                                resolve(undefined);
                            }
                        }, 100);
                    });
                };
                
                await waitForPrerequisites();
                
                if (currentProcess.isStopRequested) {
                    throw new PipelineStopRequestedError("Stopped while waiting for prerequisites.");
                }

                // Step 3: Execute solution attempts for all sub-strategies IN PARALLEL (skip any killed by Red Team)
                const solutionPromises: Promise<void>[] = [];
                currentProcess.initialStrategies.forEach((mainStrategy) => {
                    mainStrategy.subStrategies.forEach((subStrategy) => {
                        if (subStrategy.isKilledByRedTeam) return;
                        
                        solutionPromises.push((async () => {
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
                                    .replace('{{currentSubStrategy}}', subStrategy.subStrategyText)
                                    .replace('{{knowledgePacket}}', currentProcess.knowledgePacket || 'Knowledge packet not available.');

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
                                console.error(`Solution attempt failed for ${subStrategy.id}:`, error);
                                subStrategy.status = 'error';
                                subStrategy.error = error.message || "Solution attempt failed";
                                renderActiveDeepthinkPipeline();
                            }
                        })());
                    });
                });
                await Promise.allSettled(solutionPromises);

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during solution attempts.");

                // Step 4: Self-improvement for all solution attempts IN PARALLEL (skip any killed by Red Team)
                // OR skip refinement entirely if disabled and just assign attempted solution to refined solution
                const refinementEnabled = getRefinementEnabled();
                const improvementPromises: Promise<void>[] = [];
                
                currentProcess.initialStrategies.forEach((mainStrategy) => {
                    mainStrategy.subStrategies.forEach((subStrategy) => {
                        if (subStrategy.isKilledByRedTeam || !subStrategy.solutionAttempt) return;
                        
                        if (!refinementEnabled) {
                            // Skip refinement - just assign attempted solution to refined solution
                            subStrategy.refinedSolution = subStrategy.solutionAttempt;
                            subStrategy.selfImprovementStatus = 'completed';
                            return;
                        }
                        
                        improvementPromises.push((async () => {
                            if (currentProcess.isStopRequested) {
                                subStrategy.selfImprovementStatus = 'cancelled';
                                subStrategy.selfImprovementError = "Process stopped by user.";
                                return;
                            }

                            try {
                                subStrategy.selfImprovementStatus = 'processing';
                                renderActiveDeepthinkPipeline();

                                const improvementPrompt = currentPrompts.user_deepthink_selfImprovement
                                    .replace('{{originalProblemText}}', challengeText)
                                    .replace('{{currentSubStrategy}}', subStrategy.subStrategyText)
                                    .replace('{{solutionAttempt}}', subStrategy.solutionAttempt || '')
                                    .replace('{{knowledgePacket}}', currentProcess.knowledgePacket || 'No hypothesis exploration results available yet.');

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
                                console.error(`Self-improvement failed for ${subStrategy.id}:`, error);
                                subStrategy.selfImprovementStatus = 'error';
                                subStrategy.selfImprovementError = error.message || "Self-improvement failed";
                                renderActiveDeepthinkPipeline();
                            }
                        })());
                    });
                });
                
                if (refinementEnabled) {
                    await Promise.allSettled(improvementPromises);
                } else {
                    // If refinement is disabled, render the pipeline to show the assigned solutions
                    renderActiveDeepthinkPipeline();
                }

                if (currentProcess.isStopRequested) throw new PipelineStopRequestedError("Stopped during self-improvement.");

                // Individual strategy judging removed - all solutions go directly to final judge

                currentProcess.strategicSolverComplete = true;
                renderActiveDeepthinkPipeline();

            } catch (error: any) {
                console.error('Track A (Strategic Solver) error:', error);
                if (!(error instanceof PipelineStopRequestedError)) {
                    currentProcess.status = 'error';
                    currentProcess.error = `Strategic Solver failed: ${error.message}`;
                    renderActiveDeepthinkPipeline();
                }
                throw error;
            }
        })();

        // Track B: Hypothesis Explorer (Generate → Test → Synthesize knowledge packet)
        const trackBPromise = (async () => {
            try {
                // Generate hypotheses with current slider values
                const currentHypothesisCount = getSelectedHypothesisCount();
                const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();
                const freshHypothesisPrompts = createDefaultCustomPromptsDeepthink(getSelectedStrategiesCount(), getSelectedSubStrategiesCount(), currentHypothesisCount, currentRedTeamAggressiveness);
                
                const hypothesisPrompt = freshHypothesisPrompts.user_deepthink_hypothesisGeneration.replace('{{originalProblemText}}', challengeText);
                currentProcess.requestPromptHypothesisGen = hypothesisPrompt;
                currentProcess.hypothesisGenStatus = 'processing';
                renderActiveDeepthinkPipeline();

                const parts: Part[] = [{ text: challengeText }];
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
                        finalStatus: 'pending',
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

                        // Determine final status based on the response
                        const response = testerResponse.toLowerCase();
                        if (response.includes('validated') || response.includes('proven true')) {
                            hypothesis.finalStatus = 'validated';
                        } else if (response.includes('refuted') || response.includes('proven false')) {
                            hypothesis.finalStatus = 'refuted';
                        } else if (response.includes('contradiction')) {
                            hypothesis.finalStatus = 'contradiction';
                        } else if (response.includes('needs further analysis')) {
                            hypothesis.finalStatus = 'needs_further_analysis';
                        } else {
                            hypothesis.finalStatus = 'unresolved';
                        }

                        renderActiveDeepthinkPipeline();
                    } catch (error: any) {
                        hypothesis.testerStatus = 'error';
                        hypothesis.testerError = error.message || "Hypothesis testing failed";
                        renderActiveDeepthinkPipeline();
                    }
                });

                await Promise.allSettled(hypothesisTestingPromises);

                // Synthesize knowledge packet
                const validatedHypotheses = currentProcess.hypotheses.filter(h => h.finalStatus === 'validated');
                const refutedHypotheses = currentProcess.hypotheses.filter(h => h.finalStatus === 'refuted');
                const unresolvedHypotheses = currentProcess.hypotheses.filter(h => h.finalStatus === 'unresolved' || h.finalStatus === 'needs_further_analysis');

                let knowledgePacket = "HYPOTHESIS EXPLORATION RESULTS:\n\n";
                
                if (validatedHypotheses.length > 0) {
                    knowledgePacket += "VALIDATED HYPOTHESES (use as established facts):\n";
                    validatedHypotheses.forEach((h, i) => {
                        knowledgePacket += `${i + 1}. ${h.hypothesisText}\n`;
                    });
                    knowledgePacket += "\n";
                }

                if (refutedHypotheses.length > 0) {
                    knowledgePacket += "REFUTED HYPOTHESES (avoid approaches that depend on these):\n";
                    refutedHypotheses.forEach((h, i) => {
                        knowledgePacket += `${i + 1}. ${h.hypothesisText}\n`;
                    });
                    knowledgePacket += "\n";
                }

                if (unresolvedHypotheses.length > 0) {
                    knowledgePacket += "UNRESOLVED QUESTIONS (acknowledge limitations):\n";
                    unresolvedHypotheses.forEach((h, i) => {
                        knowledgePacket += `${i + 1}. ${h.hypothesisText}\n`;
                    });
                    knowledgePacket += "\n";
                }

                currentProcess.knowledgePacket = knowledgePacket;
                currentProcess.hypothesisExplorerComplete = true;
                renderActiveDeepthinkPipeline();

            } catch (error: any) {
                console.error('Track B (Hypothesis Explorer) error:', error);
                if (!(error instanceof PipelineStopRequestedError)) {
                    currentProcess.hypothesisGenStatus = 'error';
                    currentProcess.hypothesisGenError = `Hypothesis exploration failed: ${error.message}`;
                    renderActiveDeepthinkPipeline();
                }
                throw error;
            }
        })();

        // Wait for hypothesis exploration to complete, but strategic solver judging runs independently
        await Promise.all([trackAPromise,trackBPromise]);

        // --- Final Judge: Direct evaluation of all solutions ---
        currentProcess.finalJudgingStatus = 'processing';
        renderActiveDeepthinkPipeline();

        // Collect all solutions from all sub-strategies (refined if available, otherwise original)
        const allSolutions: Array<{id: string, solution: string, mainStrategyId: string, subStrategyText: string}> = [];
        
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
                console.error(`Error in final judging:`, e);
            }
        }

        currentProcess.status = 'completed';
        renderActiveDeepthinkPipeline();

    } catch (error: any) {
        console.error('Deepthink analysis process error:', error);
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
function renderStrategicSolverContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-strategic-solver model-detail-card">';
    
    if (deepthinkProcess.status === 'error' && deepthinkProcess.error) {
        html += `<div class="status-message error"><pre>${escapeHtml(deepthinkProcess.error)}</pre></div>`;
    } else if (deepthinkProcess.initialStrategies && deepthinkProcess.initialStrategies.length > 0) {
        // Add sub-tabs for strategies
        html += '<div class="sub-tabs-container">';
        html += '<div class="sub-tabs-nav">';
        deepthinkProcess.initialStrategies.forEach((strategy, index) => {
            const isActive = (deepthinkProcess.activeStrategyTab || 0) === index;
            const statusClass = strategy.isKilledByRedTeam ? 'killed-strategy' : '';
            html += `<button class="sub-tab-button ${isActive ? 'active' : ''} ${statusClass}" data-strategy-index="${index}">
                Strategy ${index + 1}
            </button>`;
        });
        html += '</div>';
        
        // Add sub-tab content
        html += '<div class="sub-tabs-content">';
        deepthinkProcess.initialStrategies.forEach((strategy, index) => {
            const isActive = (deepthinkProcess.activeStrategyTab || 0) === index;
            html += `<div class="sub-tab-content ${isActive ? 'active' : ''}" data-strategy-index="${index}">`;
            html += `
                <div class="strategy-card ${strategy.isKilledByRedTeam ? 'killed-strategy' : ''}">
                    <div class="strategy-content">
                        <div class="strategy-text-container">
                            <div class="strategy-text" data-full-text="${escapeHtml(strategy.strategyText)}">
                                ${renderMathContent(strategy.strategyText.length > 200 ? strategy.strategyText.substring(0, 200) + '...' : strategy.strategyText)}
                            </div>
                            ${strategy.strategyText.length > 200 ? '<button class="show-more-btn" data-target="strategy">Show More</button>' : ''}
                        </div>
                        ${strategy.error ? `<div class="error-message">${escapeHtml(strategy.error)}</div>` : ''}
                        ${strategy.isKilledByRedTeam ? `<div class="elimination-reason">${escapeHtml(strategy.redTeamReason || 'Eliminated by Red Team')}</div>` : ''}
                    </div>
                    ${renderSubStrategiesGrid(strategy.subStrategies)}
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
                    console.error('Error opening solution modal:', error);
                }
            }
        }
        return;
    }
    
    // Handle view argument buttons (fullscreen modal)
    if (target.classList.contains('view-argument-button') || target.closest('.view-argument-button')) {
        event.preventDefault();
        event.stopPropagation();
        
        // Check if modal is already open to prevent duplicates - use more specific selector
        const existingModal = document.querySelector('.modal-overlay.fullscreen-modal[data-modal-type="hypothesis-argument"]');
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
                    console.error('Error opening argument modal:', error);
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
    
    // Handle red team reasoning fullscreen modal
    if (target.classList.contains('red-team-fullscreen-btn') || target.closest('.red-team-fullscreen-btn')) {
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

// Function to open red team reasoning in fullscreen modal
function openRedTeamReasoningModal(agent: any) {
    // Create full-screen modal overlay using same structure as View Solution
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay fullscreen-modal';
    modalOverlay.setAttribute('data-modal-type', 'red-team-reasoning');
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content fullscreen-content';
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>Red Team Agent ${agent.id} - Reasoning</h2>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body">
            <div class="red-team-modal-content">
                ${agent.reasoning}
            </div>
        </div>
    `;
    
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    // Make visible on the next frame to trigger CSS transitions
    requestAnimationFrame(() => modalOverlay.classList.add('is-visible'));
    
    // Add close functionality using same pattern as View Solution modal
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
}

// Modal function for sub-strategy solutions
function openSubStrategySolutionModal(subStrategyId: string) {
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
    
    // Check if refinement is enabled
    const refinementEnabled = getRefinementEnabled();
    
    // Create full-screen modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay fullscreen-modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content fullscreen-content';
    
    // Determine refined solution panel styling and content
    const refinedPaneClass = refinementEnabled ? '' : 'disabled-pane';
    const refinedIcon = refinementEnabled ? 'verified' : 'auto_fix_off';
    const refinedTitle = refinementEnabled ? 'Refined Solution' : 'Refined Solution (Disabled)';
    const refinedOverlay = refinementEnabled ? '' : '<div class="disabled-overlay">Refinement Disabled</div>';
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>Sub-Strategy Solution</h2>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body">
            <div class="diff-view-side-by-side">
                <div class="diff-pane">
                    <div class="diff-header">
                        <div class="diff-title-section">
                            <span class="material-symbols-outlined diff-icon attempt-icon">code</span>
                            <h4>Solution Attempt</h4>
                        </div>
                        <div class="diff-actions">
                            <button class="copy-solution-btn" data-content="${escapeHtml(subStrategy.solutionAttempt || '')}">
                                <span class="material-symbols-outlined">content_copy</span>
                                Copy
                            </button>
                            <button class="download-solution-btn" data-content="${escapeHtml(subStrategy.solutionAttempt || '')}" data-filename="solution-attempt.md">
                                <span class="material-symbols-outlined">download</span>
                                Download
                            </button>
                        </div>
                    </div>
                    <div class="solution-pane-content">
                        ${subStrategy.solutionAttempt ? renderMathContent(subStrategy.solutionAttempt) : '<div class="no-content">No solution attempt available</div>'}
                    </div>
                </div>
                <div class="diff-separator"></div>
                <div class="diff-pane ${refinedPaneClass}">
                    <div class="diff-header">
                        <div class="diff-title-section">
                            <span class="material-symbols-outlined diff-icon refined-icon">${refinedIcon}</span>
                            <h4>${refinedTitle}</h4>
                        </div>
                        <div class="diff-actions">
                            <button class="copy-solution-btn" data-content="${escapeHtml(subStrategy.refinedSolution || '')}" ${!refinementEnabled ? 'disabled' : ''}>
                                <span class="material-symbols-outlined">content_copy</span>
                                Copy
                            </button>
                            <button class="download-solution-btn" data-content="${escapeHtml(subStrategy.refinedSolution || '')}" data-filename="refined-solution.md" ${!refinementEnabled ? 'disabled' : ''}>
                                <span class="material-symbols-outlined">download</span>
                                Download
                            </button>
                        </div>
                    </div>
                    <div class="solution-pane-content">
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
    
    // Add copy and download functionality
    modalContent.querySelectorAll('.copy-solution-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const content = btn.getAttribute('data-content') || '';
            try {
                await navigator.clipboard.writeText(content);
                btn.innerHTML = '<span class="material-symbols-outlined">check</span>Copied!';
                setTimeout(() => {
                    btn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>Copy';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });
    });
    
    modalContent.querySelectorAll('.download-solution-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.getAttribute('data-content') || '';
            const filename = btn.getAttribute('data-filename') || 'solution.md';
            const blob = new Blob([content], { type: 'text/markdown' });
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
}

// Modal function for hypothesis arguments
function openHypothesisArgumentModal(hypothesisId: string) {
    if (!activeDeepthinkPipeline) {
        return;
    }
    
    const hypothesis = activeDeepthinkPipeline.hypotheses.find(h => h.id === hypothesisId);
    if (!hypothesis) {
        console.error('Hypothesis not found:', hypothesisId);
        return;
    }
    
    // Create full-screen modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay fullscreen-modal';
    modalOverlay.setAttribute('data-modal-type', 'hypothesis-argument');
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content fullscreen-content';
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>Hypothesis Argument</h2>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body">
            <div class="hypothesis-argument-content">
                ${renderMathContent(hypothesis.testerAttempt || 'No argument available')}
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
                    <span class="status-badge status-${
                        subStrategy.refinedSolution ? 'completed' : 
                        subStrategy.solutionAttempt ? 'processing' : 
                        'pending'
                    }">${
                        subStrategy.refinedSolution ? 'Completed' : 
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
function renderHypothesisExplorerContent(deepthinkProcess: DeepthinkPipelineState): string {
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
                        <span>HYPOTHESIS EXPLORATION RESULTS:</span>
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

// Helper function to render Red Team content
function renderRedTeamContent(deepthinkProcess: DeepthinkPipelineState): string {
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
function renderFinalResultContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-final-result model-detail-card">';
    
    if (deepthinkProcess.finalJudgingStatus === 'completed' && deepthinkProcess.finalJudgedBestSolution) {
        html += `
            <div class="final-solution-display judged-solution-container final-judged-solution">
                <div class="markdown-content">
                    ${renderMathContent(deepthinkProcess.finalJudgedBestSolution)}
                </div>
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

    const deepthinkProcess = activeDeepthinkPipeline;

    // Clear existing content
    tabsNavContainer.innerHTML = '';
    pipelinesContentContainer.innerHTML = '';

    // Create tab navigation with Final Result at the end
    const tabs = [
        { id: 'challenge-details', label: 'Challenge', icon: 'quiz' },
        { id: 'strategic-solver', label: 'Strategic Solver', icon: 'psychology' },
        { id: 'hypothesis-explorer', label: 'Hypothesis Explorer', icon: 'science' },
        { id: 'red-team', label: 'Red Team', icon: 'security', hasPinkGlow: true },
        { id: 'final-result', label: 'Final Result', icon: 'flag', alignRight: true }
    ];

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
        case 'challenge-details':
            contentDiv.innerHTML = renderChallengeDetailsContent(deepthinkProcess);
            break;
        case 'strategic-solver':
            contentDiv.innerHTML = renderStrategicSolverContent(deepthinkProcess);
            break;
        case 'hypothesis-explorer':
            contentDiv.innerHTML = renderHypothesisExplorerContent(deepthinkProcess);
            break;
        case 'red-team':
            contentDiv.innerHTML = renderRedTeamContent(deepthinkProcess);
            break;
        case 'final-result':
            contentDiv.innerHTML = renderFinalResultContent(deepthinkProcess);
            break;
        default:
            contentDiv.innerHTML = renderChallengeDetailsContent(deepthinkProcess);
    }

    pipelinesContentContainer.appendChild(contentDiv);
    
    // Add event handlers for new interactive elements
    addDeepthinkEventHandlers();
}

// Helper function to render challenge details
function renderChallengeDetailsContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-challenge model-detail-card">';
    html += `
        <div class="challenge-card">
            <div class="challenge-header">
                <div class="challenge-content">
                    <div class="challenge-text markdown-content">
                        ${renderMathContent(deepthinkProcess.challenge)}
                    </div>
                </div>
                <div class="challenge-status">
                    <span class="status-badge status-${deepthinkProcess.status === 'completed' ? 'completed' : deepthinkProcess.status}">
                        ${deepthinkProcess.status === 'completed' ? 'Completed' : deepthinkProcess.status}
                    </span>
                </div>
            </div>
        </div>`;
    html += '</div>';
    return html;
}


// ----- END DEEPTHINK MODE SPECIFIC FUNCTIONS -----