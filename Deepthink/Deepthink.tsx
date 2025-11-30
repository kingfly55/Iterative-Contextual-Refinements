import { Part } from "@google/genai";
import { AIProvider } from '../Routing/AIProvider';
import { CustomizablePromptsDeepthink, createDefaultCustomPromptsDeepthink } from './DeepthinkPrompts';
import { renderMathContent } from '../Components/RenderMathMarkdown';
import { cleanupIterativeCorrectionsRoot } from '../Contextual/ContextualUI';
import { renderSolutionPoolContent, openSolutionPoolModal, openSolutionPoolEvolution, openCurrentSolutionPool } from './SolutionPool';

// Import types and core functions from DeepthinkCore
import {
    DeepthinkSolutionCritiqueData,
    DeepthinkSubStrategyData,
    DeepthinkHypothesisData,
    DeepthinkRedTeamData,
    DeepthinkPostQualityFilterData,
    DeepthinkMainStrategyData,

    DeepthinkPipelineState,
    DeepthinkStructuredSolutionPoolAgentData,
    getActiveDeepthinkPipeline,
    setActiveDeepthinkPipelineForImport,
    parseKnowledgePacketForStyling,
    initializeDeepthinkCore
} from './DeepthinkCore';
import { parseJsonSafe } from "@/Parsing/JsonParser.js";
import { parseJsonSuggestions } from "@/Parsing/SuggestionParser.js";
import { cleanOutputByType } from "@/Parsing/OutputCleaner.js";
import { callGemini } from "@/Routing/AIService.js";

// Re-export types for backward compatibility
export type {
    DeepthinkSolutionCritiqueData,
    DeepthinkSubStrategyData,
    DeepthinkHypothesisData,
    DeepthinkRedTeamData,
    DeepthinkPostQualityFilterData,
    DeepthinkMainStrategyData,
    DeepthinkPipelineState,
    DeepthinkStructuredSolutionPoolAgentData
};

// UI state variables and helper functions used in this module
let tabsNavContainer: HTMLElement | null;
let pipelinesContentContainer: HTMLElement | null;
let escapeHtml: (unsafe: string) => string;
let cleanTextOutput: (text: string) => string;
let getSelectedStrategiesCount: () => number;
let getSelectedSubStrategiesCount: () => number;
let getSelectedHypothesisCount: () => number;
let getSelectedRedTeamAggressiveness: () => string;
let getRefinementEnabled: () => boolean;
let getIterativeCorrectionsEnabled: () => boolean;
let getDissectedObservationsEnabled: () => boolean;

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
    getPostQualityFilterEnabled: () => boolean;
    cleanTextOutput: (text: string) => string;
    customPromptsDeepthinkState: CustomizablePromptsDeepthink;
    tabsNavContainer: HTMLElement | null;
    pipelinesContentContainer: HTMLElement | null;
    setActiveDeepthinkPipeline: (pipeline: DeepthinkPipelineState | null) => void;
}) {
    // Store UI-specific dependencies used in this module
    tabsNavContainer = dependencies.tabsNavContainer;
    pipelinesContentContainer = dependencies.pipelinesContentContainer;
    escapeHtml = dependencies.escapeHtml;
    cleanTextOutput = dependencies.cleanTextOutput;
    getSelectedStrategiesCount = dependencies.getSelectedStrategiesCount;
    getSelectedSubStrategiesCount = dependencies.getSelectedSubStrategiesCount;
    getSelectedHypothesisCount = dependencies.getSelectedHypothesisCount;
    getSelectedRedTeamAggressiveness = dependencies.getSelectedRedTeamAggressiveness;
    getRefinementEnabled = dependencies.getRefinementEnabled;
    getIterativeCorrectionsEnabled = dependencies.getIterativeCorrectionsEnabled;
    getDissectedObservationsEnabled = dependencies.getDissectedObservationsEnabled;

    // Initialize DeepthinkCore with the same dependencies
    initializeDeepthinkCore({
        getAIProvider: dependencies.getAIProvider,
        callGemini: dependencies.callGemini,
        cleanOutputByType: dependencies.cleanOutputByType,
        parseJsonSuggestions: dependencies.parseJsonSuggestions as any,
        parseJsonSafe: dependencies.parseJsonSafe,
        updateControlsState: dependencies.updateControlsState,
        escapeHtml: dependencies.escapeHtml,
        getSelectedTemperature: dependencies.getSelectedTemperature,
        getSelectedModel: dependencies.getSelectedModel,
        getSelectedTopP: dependencies.getSelectedTopP,
        getSelectedStrategiesCount: dependencies.getSelectedStrategiesCount,
        getSelectedSubStrategiesCount: dependencies.getSelectedSubStrategiesCount,
        getRefinementEnabled: dependencies.getRefinementEnabled,
        getSelectedHypothesisCount: dependencies.getSelectedHypothesisCount,
        getSelectedRedTeamAggressiveness: dependencies.getSelectedRedTeamAggressiveness,
        getSkipSubStrategies: dependencies.getSkipSubStrategies,
        getDissectedObservationsEnabled: dependencies.getDissectedObservationsEnabled,
        getIterativeCorrectionsEnabled: dependencies.getIterativeCorrectionsEnabled,
        getProvideAllSolutionsToCorrectors: dependencies.getProvideAllSolutionsToCorrectors,
        getPostQualityFilterEnabled: dependencies.getPostQualityFilterEnabled,
        cleanTextOutput: dependencies.cleanTextOutput,
        customPromptsDeepthinkState: dependencies.customPromptsDeepthinkState,
        setActiveDeepthinkPipeline: dependencies.setActiveDeepthinkPipeline,
        renderActiveDeepthinkPipeline: renderActiveDeepthinkPipeline
    });
}

// Deepthink strategy tab activation
export function activateDeepthinkStrategyTab(strategyIndex: number) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;
    pipeline.activeStrategyTab = strategyIndex;

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

let activeSolutionModalSubStrategyId: string | null = null;

export async function openDeepthinkSolutionModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const subStrategy = pipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
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
    const pipeline = getActiveDeepthinkPipeline();
    const subStrategy = pipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
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
    await renderIterativeCorrectionsUI(modalBody, originalSolution, currentBestSolution, iterations, isProcessing);
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

    activeSolutionModalSubStrategyId = null;

    // Clean up the React root in ContextualUI
    if (cleanupIterativeCorrectionsRoot) {
        cleanupIterativeCorrectionsRoot();
    }
}

// parseKnowledgePacketForStyling is now imported from DeepthinkCore

// ---------- DEEPTHINK MODE SPECIFIC FUNCTIONS ----------
// Core business logic functions are imported from DeepthinkCore

// Import and re-export the main pipeline function from DeepthinkCore
export { startDeepthinkAnalysisProcess } from './DeepthinkCore';

// Helper function to render Strategic Solver content
export function renderStrategicSolverContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-strategic-solver">';

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
    const pipeline = getActiveDeepthinkPipeline();
    if (!target || !pipeline) return;

    // Handle sub-tab navigation
    if (target.classList.contains('sub-tab-button') || target.closest('.sub-tab-button')) {
        const button = target.closest('.sub-tab-button') as HTMLElement;
        if (button) {
            const strategyIndex = parseInt(button.getAttribute('data-strategy-index') || '0');
            pipeline.activeStrategyTab = strategyIndex;
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
            // Check if it's a solution pool button
            if (button.classList.contains('view-pool-button')) {
                const strategyId = button.getAttribute('data-strategy-id');
                const iterationAttr = button.getAttribute('data-iteration');
                if (strategyId && iterationAttr) {
                    openSolutionPoolModal(strategyId, parseInt(iterationAttr, 10));
                }
                return;
            }

            // Otherwise it's a hypothesis button
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
            // Check for sub-strategy critique (iterative corrections mode)
            const subStrategyId = button.getAttribute('data-critique-substrategy-id');
            if (subStrategyId && pipeline) {
                try {
                    openSubStrategyCritiqueModal(subStrategyId);
                } catch (error) {
                    // Removed console.error
                }
                return;
            }

            // Check for regular critique (standard mode)
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

    // Handle solution pool current button
    if (target.classList.contains('solution-pool-current-button') || target.closest('.solution-pool-current-button')) {
        event.preventDefault();
        event.stopPropagation();

        const button = target.closest('.solution-pool-current-button') as HTMLElement;
        if (button) {
            const pipelineId = button.getAttribute('data-pipeline-id');
            if (pipelineId) {
                openCurrentSolutionPool(pipelineId);
            }
        }
        return;
    }

    // Handle solution pool evolution button
    if (target.classList.contains('solution-pool-evolution-button') || target.closest('.solution-pool-evolution-button')) {
        event.preventDefault();
        event.stopPropagation();

        const button = target.closest('.solution-pool-evolution-button') as HTMLElement;
        if (button) {
            const pipelineId = button.getAttribute('data-pipeline-id');
            if (pipelineId) {
                openSolutionPoolEvolution(pipelineId);
            }
        }
        return;
    }

    // Handle red team and post quality filter reasoning embedded modal
    if (target.classList.contains('red-team-fullscreen-btn') || target.closest('.red-team-fullscreen-btn')) {
        // Check if modal is already open
        const existingModal = document.querySelector('.embedded-modal-overlay');
        if (existingModal) {
            return;
        }

        const button = target.closest('.red-team-fullscreen-btn') as HTMLElement;
        if (button) {
            const agentId = button.getAttribute('data-agent-id');
            if (agentId && pipeline) {
                // Check Red Team agents first
                const redTeamAgent = pipeline.redTeamAgents.find(a => a.id === agentId);
                if (redTeamAgent && redTeamAgent.reasoning) {
                    openRedTeamReasoningModal(redTeamAgent);
                    return;
                }

                // Check PostQualityFilter agents
                const postQFAgent = pipeline.postQualityFilterAgents.find(a => a.id === agentId);
                if (postQFAgent && postQFAgent.reasoning) {
                    openPostQualityFilterModal(postQFAgent);
                    return;
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

// Function to open PostQualityFilter analysis in embedded modal
export function openPostQualityFilterModal(agent: any) {
    // PostQualityFilter reasoning is already formatted as HTML
    const formattedContent = agent.reasoning || '<p>No analysis available</p>';

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
            <h4>PostQualityFilter Iteration ${agent.iterationNumber} - Analysis</h4>
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
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) {
        return;
    }

    // Find the sub-strategy
    let subStrategy: any = null;
    for (const strategy of pipeline.initialStrategies) {
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
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) {
        return;
    }

    const critique = pipeline.solutionCritiques.find(c => c.id === critiqueId);
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

// Modal function for sub-strategy critique view (iterative corrections mode)
export function openSubStrategyCritiqueModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) {
        return;
    }

    // Find the sub-strategy
    let subStrategy: any = null;
    let mainStrategyId = '';
    for (const strategy of pipeline.initialStrategies) {
        if (strategy.subStrategies) {
            subStrategy = strategy.subStrategies.find((sub: any) => sub.id === subStrategyId);
            if (subStrategy) {
                mainStrategyId = strategy.id;
                break;
            }
        }
    }

    if (!subStrategy || !subStrategy.solutionCritique) {
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
            <h4>Solution Critique - ${mainStrategyId}</h4>
            <button class="close-modal-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
        <div class="modal-body custom-scrollbar">
            <div class="critique-content">
                ${renderMathContent(subStrategy.solutionCritique || 'No critique available')}
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
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) {
        return;
    }

    const hypothesis = pipeline.hypotheses.find(h => h.id === hypothesisId);
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
    let html = '<div class="deepthink-hypothesis-explorer">';

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
    let html = '<div class="deepthink-dissected-observations">';

    // Only show if refinement is enabled or if we have existing critique data (for imported sessions)
    const refinementEnabled = getRefinementEnabled ? getRefinementEnabled() : false;
    const iterativeCorrectionsEnabled = getIterativeCorrectionsEnabled ? getIterativeCorrectionsEnabled() : false;
    const hasExistingCritiqueData = deepthinkProcess.solutionCritiques && deepthinkProcess.solutionCritiques.length > 0;

    // In iterative corrections mode, check if any sub-strategies have critiques
    const hasSubStrategyCritiques = iterativeCorrectionsEnabled && deepthinkProcess.initialStrategies.some(s =>
        s.subStrategies.some(sub => sub.solutionCritique && sub.solutionCritique.length > 0)
    );

    if (!refinementEnabled && !hasExistingCritiqueData && !hasSubStrategyCritiques) {
        html += '<div class="status-message">Dissected Observations are only available when refinement is enabled.</div>';
    } else if (hasSubStrategyCritiques || hasExistingCritiqueData) {
        // In iterative corrections mode, show ALL critiques from solutionCritiques array as cards
        // This includes critiques from all iterations (iter1, iter2, iter3)
        html += '<div class="red-team-agents-grid">';

        if (hasExistingCritiqueData) {
            // Show all critique cards from solutionCritiques array (works for both modes)
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
                                    ${!iterativeCorrectionsEnabled ? `<div class="sub-strategy-label" style="margin-top: 8px;">Sub-Strategies Critiqued: ${activeSubStrategies.length}</div>` : ''}
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
        } else if (hasSubStrategyCritiques) {
            // Fallback: show critiques from sub-strategies directly (for cases where solutionCritiques isn't populated)
            deepthinkProcess.initialStrategies.forEach((mainStrategy) => {
                const directSub = mainStrategy.subStrategies[0];
                if (!directSub || !directSub.solutionCritique) return;

                const critiqueStatus = directSub.solutionCritiqueStatus || 'completed';

                html += `
                    <div class="red-team-agent-card">
                        <div class="red-team-agent-header">
                            <h4 class="red-team-agent-title">Critique: ${mainStrategy.id}</h4>
                            <span class="status-badge status-${critiqueStatus}">${critiqueStatus === 'completed' ? 'Completed' :
                        critiqueStatus === 'processing' ? 'Processing' :
                            critiqueStatus === 'error' ? 'Error' : 'Pending'
                    }</span>
                        </div>
                        <div class="red-team-results">
                            <div class="sub-strategy-text-container">
                                <div class="sub-strategy-label">Strategy:</div>
                                <div class="sub-strategy-text">
                                    ${renderMathContent(mainStrategy.strategyText && mainStrategy.strategyText.length > 150 ?
                        mainStrategy.strategyText.substring(0, 150) + '...' :
                        (mainStrategy.strategyText || 'No strategy text'))}
                                </div>
                            </div>
                            <div class="red-team-reasoning-section">
                                <button class="view-critique-button" data-critique-substrategy-id="${directSub.id}">
                                    <span class="material-symbols-outlined">rate_review</span>
                                    View Full Critique
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        html += '</div>';

        // Show synthesis section if available (only for non-iterative mode)
        if (!iterativeCorrectionsEnabled && deepthinkProcess.dissectedSynthesisStatus) {
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
    let html = '<div class="deepthink-red-team">';

    const hasRedTeam = deepthinkProcess.redTeamAgents && deepthinkProcess.redTeamAgents.length > 0;
    const hasPostQF = deepthinkProcess.postQualityFilterAgents && deepthinkProcess.postQualityFilterAgents.length > 0;

    if (hasRedTeam || hasPostQF) {
        // Add red team agents grid
        if (hasRedTeam) {
            html += '<div class="red-team-agents-grid">';
            deepthinkProcess.redTeamAgents.forEach((agent, index) => {
                const killedCount = (agent.killedStrategyIds?.length || 0) + (agent.killedSubStrategyIds?.length || 0);
                const reasoningSubtitle = killedCount > 0 ? 'See elimination rationale' : 'View agent notes';
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
                            </div>
                            ${killedCount > 0 ? `<div class="killed-items">
                                ${agent.killedStrategyIds?.length > 0 ? `<p><strong>Eliminated Strategies:</strong> ${agent.killedStrategyIds.join(', ')}</p>` : ''}
                                ${agent.killedSubStrategyIds?.length > 0 ? `<p><strong>Eliminated Sub-Strategies:</strong> ${agent.killedSubStrategyIds.join(', ')}</p>` : ''}
                            </div>` : ''}
                            ${agent.reasoning ? `<div class="red-team-reasoning-section">
                                <button type="button" class="red-team-fullscreen-btn red-team-reasoning-pill" data-agent-id="${agent.id}">
                                    <div class="pill-content">
                                        <span class="material-symbols-outlined pill-icon">code</span>
                                        <div class="pill-text">
                                            <span class="pill-label">Reasoning</span>
                                            <span class="pill-subtext">${reasoningSubtitle}</span>
                                        </div>
                                    </div>
                                    <span class="material-symbols-outlined pill-action-icon">open_in_new</span>
                                </button>
                            </div>` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        // Add PostQualityFilter agents grid
        if (hasPostQF) {
            html += '<h3 class="red-team-section-title" style="margin-top: 2rem;">Post Quality Filter</h3>';
            html += '<div class="red-team-agents-grid">';
            deepthinkProcess.postQualityFilterAgents.forEach((agent) => {
                const updateCount = agent.prunedStrategyIds?.length || 0; // Reusing field for updateIds
                const keepCount = agent.continuedStrategyIds?.length || 0; // Reusing field for keepIds
                const analysisSubtitle = updateCount > 0 || keepCount > 0 ? 'Iteration decisions' : 'View agent notes';
                html += `
                    <div class="red-team-agent-card">
                        <div class="red-team-agent-header">
                            <h4 class="red-team-agent-title">PostQF Iteration ${agent.iterationNumber}</h4>
                            <span class="status-badge status-${agent.status}">${agent.status}</span>
                        </div>
                        <div class="red-team-results">
                            <div class="red-team-evaluation-summary">
                                <div class="evaluation-metric">
                                    <span class="metric-value">${updateCount}</span>
                                    <span class="metric-label">Strategies Updated</span>
                                </div>
                                <div class="evaluation-metric">
                                    <span class="metric-value">${keepCount}</span>
                                    <span class="metric-label">Strategies Kept</span>
                                </div>
                            </div>
                            ${updateCount > 0 || keepCount > 0 ? `<div class="killed-items">
                                ${updateCount > 0 ? `<p><strong>Updated:</strong> ${agent.prunedStrategyIds.join(', ')}</p>` : ''}
                                ${keepCount > 0 ? `<p><strong>Kept:</strong> ${agent.continuedStrategyIds.join(', ')}</p>` : ''}
                            </div>` : ''}
                            ${agent.reasoning ? `<div class="red-team-reasoning-section">
                                <button type="button" class="red-team-fullscreen-btn red-team-reasoning-pill" data-agent-id="${agent.id}">
                                    <div class="pill-content">
                                        <span class="material-symbols-outlined pill-icon">code</span>
                                        <div class="pill-text">
                                            <span class="pill-label">Analysis</span>
                                            <span class="pill-subtext">${analysisSubtitle}</span>
                                        </div>
                                    </div>
                                    <span class="material-symbols-outlined pill-action-icon">open_in_new</span>
                                </button>
                            </div>` : ''}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }
    } else {
        html += '<div class="status-message">Red Team evaluation not yet started.</div>';
    }

    html += '</div>';
    return html;
}

// Helper function to render Final Result content
export function renderFinalResultContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-final-result">';

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

// getActiveDeepthinkPipeline and setActiveDeepthinkPipelineForImport are now imported from DeepthinkCore
// Local wrapper exports for backward compatibility
export { getActiveDeepthinkPipeline, setActiveDeepthinkPipelineForImport };

// Main function to render the active Deepthink pipeline UI
export function renderActiveDeepthinkPipeline() {
    // Get the current pipeline from DeepthinkCore (source of truth)
    const deepthinkProcess = getActiveDeepthinkPipeline();

    if (!deepthinkProcess || !tabsNavContainer || !pipelinesContentContainer) {
        return;
    }

    // Re-enable sidebar collapse button and show header/tabs (in case they were disabled/hidden by config panel)
    const sidebarCollapseButton = document.getElementById('sidebar-collapse-button') as HTMLButtonElement;
    if (sidebarCollapseButton) {
        sidebarCollapseButton.disabled = false;
        sidebarCollapseButton.style.opacity = '';
        sidebarCollapseButton.style.cursor = '';
        sidebarCollapseButton.title = 'Collapse Sidebar';
    }

    // Show main header and tabs
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;
    if (mainHeaderContent) {
        mainHeaderContent.style.display = '';
    }
    if (tabsNavContainer) {
        tabsNavContainer.style.display = '';
    }

    // Update the active solution modal if it's open
    updateActiveSolutionModal().catch(() => {
        // Ignore errors in modal updates
    });

    // Clear existing content
    tabsNavContainer.innerHTML = '';
    pipelinesContentContainer.innerHTML = '';

    // Check feature enablement
    const isRedTeamEnabled = getSelectedRedTeamAggressiveness() !== 'off';
    const hasPostQualityFilter = deepthinkProcess.postQualityFilterAgents && deepthinkProcess.postQualityFilterAgents.length > 0;
    const isRedTeamTabEnabled = isRedTeamEnabled || hasPostQualityFilter;
    const isHypothesisEnabled = getSelectedHypothesisCount() > 0;
    const isDissectedObservationsEnabled = getRefinementEnabled() || getIterativeCorrectionsEnabled() || getDissectedObservationsEnabled();

    // Create tab navigation with Final Result at the end - filter based on enabled features
    const allTabs = [
        { id: 'strategic-solver', label: 'Strategic Solver', icon: 'psychology', alwaysShow: true },
        { id: 'hypothesis-explorer', label: 'Hypothesis Explorer', icon: 'science', alwaysShow: false, enabled: isHypothesisEnabled },
        { id: 'solution-pool', label: 'Solution Pool', icon: 'database', alwaysShow: false, enabled: deepthinkProcess.structuredSolutionPoolEnabled },
        { id: 'dissected-observations', label: 'Dissected Observations', icon: 'troubleshoot', alwaysShow: false, enabled: isDissectedObservationsEnabled },
        { id: 'red-team', label: 'Red Team', icon: 'security', hasPinkGlow: true, alwaysShow: false, enabled: isRedTeamTabEnabled },
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
        } else if (tab.id === 'solution-pool') {
            if (deepthinkProcess.structuredSolutionPoolStatus === 'completed') {
                statusClass = 'status-deepthink-completed';
            } else if (deepthinkProcess.structuredSolutionPoolStatus === 'processing') {
                statusClass = 'status-deepthink-processing';
            } else if (deepthinkProcess.structuredSolutionPoolStatus === 'error') {
                statusClass = 'status-deepthink-error';
            }
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

    // Render tab content directly without wrapper
    switch (deepthinkProcess.activeTabId) {
        case 'strategic-solver':
            pipelinesContentContainer.innerHTML = renderStrategicSolverContent(deepthinkProcess);
            break;
        case 'hypothesis-explorer':
            pipelinesContentContainer.innerHTML = renderHypothesisExplorerContent(deepthinkProcess);
            break;
        case 'solution-pool':
            pipelinesContentContainer.innerHTML = renderSolutionPoolContent(deepthinkProcess);
            break;
        case 'dissected-observations':
            pipelinesContentContainer.innerHTML = renderDissectedObservationsContent(deepthinkProcess);
            break;
        case 'red-team':
            pipelinesContentContainer.innerHTML = renderRedTeamContent(deepthinkProcess);
            break;
        case 'final-result':
            pipelinesContentContainer.innerHTML = renderFinalResultContent(deepthinkProcess);
            break;
        default:
            pipelinesContentContainer.innerHTML = renderStrategicSolverContent(deepthinkProcess);
    }

    // Add event handlers for new interactive elements
    addDeepthinkEventHandlers();
}



// ----- END DEEPTHINK MODE SPECIFIC FUNCTIONS -----