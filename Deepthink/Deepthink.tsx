import { AIProvider } from '../Routing/AIProvider';
import { callGemini } from "@/Routing/AIService.js";
import { CustomizablePromptsDeepthink } from './DeepthinkPrompts';
import { renderMathContent } from '../Styles/Components/RenderMathMarkdown';
import { cleanupIterativeCorrectionsRoot } from '../Contextual/ContextualUI';
import { onHighlighterReady } from '../Styles/Shiki';
import {
    renderSolutionPoolContent,
    openSolutionPoolModal,
    openSolutionPoolEvolution,
    openCurrentSolutionPool,
    downloadSolutionPoolAsJSON
} from './SolutionPool';
import { parseJsonSafe } from "../Core/JsonParser";
import { parseJsonSuggestions } from "../Core/SuggestionParser";
import { cleanOutputByType } from "../Core/OutputCleaner";

// Core Imports
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
    initializeDeepthinkCore,
    startDeepthinkAnalysisProcess
} from './DeepthinkCore';

// ============================================================================ 
// Types & Re-exports
// ============================================================================ 

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

export {
    startDeepthinkAnalysisProcess,
    getActiveDeepthinkPipeline,
    setActiveDeepthinkPipelineForImport
};

// ============================================================================ 
// Module State
// ============================================================================ 

interface DeepthinkModuleState {
    tabsNavContainer: HTMLElement | null;
    pipelinesContentContainer: HTMLElement | null;
    escapeHtml: (unsafe: string) => string;
    cleanTextOutput: (text: string) => string;
    getSelectedStrategiesCount: () => number;
    getSelectedSubStrategiesCount: () => number;
    getSelectedHypothesisCount: () => number;
    getSelectedRedTeamAggressiveness: () => string;
    getRefinementEnabled: () => boolean;
    getIterativeCorrectionsEnabled: () => boolean;
    getDissectedObservationsEnabled: () => boolean;
}

// Initial state with safe defaults or placeholders
const moduleState: DeepthinkModuleState = {
    tabsNavContainer: null,
    pipelinesContentContainer: null,
    escapeHtml: (s) => s,
    cleanTextOutput: (s) => s,
    getSelectedStrategiesCount: () => 0,
    getSelectedSubStrategiesCount: () => 0,
    getSelectedHypothesisCount: () => 0,
    getSelectedRedTeamAggressiveness: () => 'off',
    getRefinementEnabled: () => false,
    getIterativeCorrectionsEnabled: () => false,
    getDissectedObservationsEnabled: () => false,
};

let activeSolutionModalSubStrategyId: string | null = null;

// ============================================================================ 
// Initialization
// ============================================================================ 

export function initializeDeepthinkModule(dependencies: {
    getAIProvider: () => AIProvider | null;
    callGemini: typeof callGemini;
    cleanOutputByType: typeof cleanOutputByType;
    parseJsonSuggestions: typeof parseJsonSuggestions;
    parseJsonSafe: typeof parseJsonSafe;
    updateControlsState: (newState: any) => void;
    escapeHtml: (unsafe: string) => string;
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
    getDeepthinkCodeExecutionEnabled: () => boolean;
    getModelProvider: () => string;
    cleanTextOutput: (text: string) => string;
    customPromptsDeepthinkState: CustomizablePromptsDeepthink;
    tabsNavContainer: HTMLElement | null;
    pipelinesContentContainer: HTMLElement | null;
    setActiveDeepthinkPipeline: (pipeline: DeepthinkPipelineState | null) => void;
}) {
    // Update local state
    moduleState.tabsNavContainer = dependencies.tabsNavContainer;
    moduleState.pipelinesContentContainer = dependencies.pipelinesContentContainer;
    moduleState.escapeHtml = dependencies.escapeHtml;
    moduleState.cleanTextOutput = dependencies.cleanTextOutput;
    moduleState.getSelectedStrategiesCount = dependencies.getSelectedStrategiesCount;
    moduleState.getSelectedSubStrategiesCount = dependencies.getSelectedSubStrategiesCount;
    moduleState.getSelectedHypothesisCount = dependencies.getSelectedHypothesisCount;
    moduleState.getSelectedRedTeamAggressiveness = dependencies.getSelectedRedTeamAggressiveness;
    moduleState.getRefinementEnabled = dependencies.getRefinementEnabled;
    moduleState.getIterativeCorrectionsEnabled = dependencies.getIterativeCorrectionsEnabled;
    moduleState.getDissectedObservationsEnabled = dependencies.getDissectedObservationsEnabled;

    // Subscribe to highlighter readiness
    onHighlighterReady(() => {
        if (getActiveDeepthinkPipeline()) {
            renderActiveDeepthinkPipeline();
        }
    });

    // Initialize DeepthinkCore
    initializeDeepthinkCore({
        ...dependencies,
        renderActiveDeepthinkPipeline
    });
}

// ============================================================================ 
// UI Helper: Modal Factory
// ============================================================================ 

interface ModalOptions {
    className?: string;
    title?: string;
    width?: string;
    height?: string;
    padding?: string;
    noPadding?: boolean;
    isEmbedded?: boolean; // If true, creates a smaller embedded modal
    onClose?: () => void;
}

/**
 * Creates a consistent modal overlay and container.
 * Returns the body element where content should be appended, and the close function.
 */
function createBaseModal(options: ModalOptions) {
    const isEmbedded = options.isEmbedded || false;
    const overlayClass = isEmbedded ? 'embedded-modal-overlay' : 'modal-overlay';
    const contentClass = isEmbedded ? 'embedded-modal-content' : 'modal-content';

    // Create Overlay
    const overlay = document.createElement('div');
    overlay.className = overlayClass + (options.className ? ` ${options.className}` : '');
    if (isEmbedded) {
        overlay.style.position = 'fixed';
        overlay.style.zIndex = '1000';
        overlay.style.pointerEvents = 'auto';
    } else {
        overlay.id = 'solution-modal-overlay'; // Legacy ID for main solution modal
        overlay.style.display = 'flex';
    }

    // Create Content Container
    const content = document.createElement('div');
    content.className = contentClass;
    if (!isEmbedded) {
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');
    }

    // Header
    const header = document.createElement('div'); // Using div for embedded, header for main to match legacy styles if needed
    header.className = 'modal-header';

    if (!isEmbedded) {
        // Main modal specific header styling override if needed
        if (options.padding) header.style.padding = options.padding;
        if (options.height) header.style.minHeight = options.height;
    }

    if (options.title) {
        const title = document.createElement(isEmbedded ? 'h4' : 'h2');
        if (!isEmbedded) title.className = 'modal-title';
        title.textContent = options.title;
        header.appendChild(title);
    }

    // Close Button
    const closeBtn = document.createElement('button');
    closeBtn.className = isEmbedded ? 'close-modal-btn' : 'modal-close-button';
    closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    header.appendChild(closeBtn);

    content.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (options.isEmbedded) body.classList.add('custom-scrollbar');
    if (options.noPadding) body.style.padding = '0';

    content.appendChild(body);
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // Close Logic
    const cleanup = () => {
        if (options.onClose) options.onClose();
        document.removeEventListener('keydown', handleKeyDown);
        overlay.remove();

        // Specific cleanup for main solution modal
        if (!isEmbedded) {
            activeSolutionModalSubStrategyId = null;
            if (cleanupIterativeCorrectionsRoot) cleanupIterativeCorrectionsRoot();
        }
    };

    const closeModal = () => {
        if (!isEmbedded) {
            overlay.classList.remove('is-visible');
            setTimeout(cleanup, 200);
        } else {
            cleanup();
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeModal();
    };

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', handleKeyDown);

    // Animation for main modal
    if (!isEmbedded) {
        // Expose cleanup for external calls
        (overlay as any).cleanup = () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
        setTimeout(() => overlay.classList.add('is-visible'), 10);
    }

    return { body, closeModal, overlay, content };
}

// ============================================================================ 
// Modal Implementations
// ============================================================================ 

export async function openDeepthinkSolutionModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const subStrategy = pipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
    if (!subStrategy) return;

    const iterativeCorrectionsEnabled = moduleState.getIterativeCorrectionsEnabled();
    const hasIterativeCorrections = iterativeCorrectionsEnabled;

    const { body, overlay } = createBaseModal({
        title: hasIterativeCorrections ? 'Iterative Corrections' : 'Solution Details',
        noPadding: hasIterativeCorrections
    });

    if (hasIterativeCorrections) {
        body.style.height = 'calc(100vh - 80px)';
        body.style.overflow = 'hidden';
        body.classList.add('contextual-mode-container');

        activeSolutionModalSubStrategyId = subStrategyId;
        await updateSolutionModalContent(body, subStrategyId);
    } else {
        body.style.padding = '20px';
        body.style.height = 'calc(100vh - 120px)';
        renderDefaultSolutionUI(body, subStrategy);
    }
}

export function closeSolutionModal() {
    const modalOverlay = document.getElementById('solution-modal-overlay');
    if (modalOverlay) {
        modalOverlay.click(); // Trigger click handler which handles cleanup
    }
}

// Sub-Strategy Solution Modal (Fullscreen)
export async function openSubStrategySolutionModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;

    // Check Iterative Mode first
    if (moduleState.getIterativeCorrectionsEnabled()) {
        await openDeepthinkSolutionModal(subStrategyId);
        return;
    }

    const subStrategy = pipeline.initialStrategies.flatMap(s => s.subStrategies).find(sub => sub.id === subStrategyId);
    if (!subStrategy) return;

    const { body } = createBaseModal({
        className: 'fullscreen-modal',
        title: 'Sub-Strategy Solution',
        height: 'auto',
        padding: '0.5rem 1.5rem',
        onClose: () => { } // Cleanup handled by base
    });

    // Override base class specificities for this specific modal type to match exact legacy styles
    const content = body.parentElement as HTMLElement;
    content.className = 'modal-content fullscreen-content';

    renderLegacySubStrategyComparison(body, subStrategy);

    // Bind copy/download buttons
    import('../Styles/Components/ActionButton.js').then(module => {
        module.bindCopyDownloadButtons(content);
    }).catch(() => {
        // Fallback manual binding if needed
        bindLegacyActionButtons(content);
    });
}

// Critique Modals
export function openCritiqueModal(critiqueId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const critique = pipeline?.solutionCritiques.find(c => c.id === critiqueId);
    if (!critique) return;

    renderSimpleEmbeddedModal('Solution Critique', critique.critiqueResponse || 'No critique available');
}

export function openSubStrategyCritiqueModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    let subStrategy: any = null;
    let mainStrategyId = '';

    pipeline?.initialStrategies.forEach(strategy => {
        const found = strategy.subStrategies.find(sub => sub.id === subStrategyId);
        if (found) {
            subStrategy = found;
            mainStrategyId = strategy.id;
        }
    });

    if (!subStrategy?.solutionCritique) return;

    renderSimpleEmbeddedModal(
        `Solution Critique - ${mainStrategyId}`,
        subStrategy.solutionCritique
    );
}

export function openHypothesisArgumentModal(hypothesisId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const hypothesis = pipeline?.hypotheses.find(h => h.id === hypothesisId);
    if (!hypothesis) return;

    renderSimpleEmbeddedModal(
        'Hypothesis Argument',
        hypothesis.testerAttempt || 'No argument available',
        'hypothesis-argument-content'
    );
}

function renderSimpleEmbeddedModal(title: string, contentMarkdown: string, contentClass: string = 'critique-content') {
    if (document.querySelector('.embedded-modal-overlay')) return;

    const { body } = createBaseModal({
        title,
        isEmbedded: true
    });

    body.innerHTML = `
        <div class="${contentClass}">
            ${renderMathContent(contentMarkdown)}
        </div>
    `;
}

// Red Team Reasoning Modal
export function openRedTeamReasoningModal(agent: any) {
    if (document.querySelector('.embedded-modal-overlay')) return;

    let reasoningData: any = {};
    try {
        reasoningData = typeof agent.reasoning === 'string' ? JSON.parse(agent.reasoning) : agent.reasoning;
    } catch (e) {
        reasoningData = { raw: agent.reasoning };
    }

    const { body } = createBaseModal({
        title: `Red Team Agent ${agent.id} - Evaluation`,
        isEmbedded: true
    });
    body.classList.add('red-team-reasoning-display');

    body.innerHTML = renderRedTeamReasoningContent(agent, reasoningData);
}

export function openPostQualityFilterModal(agent: any) {
    if (document.querySelector('.embedded-modal-overlay')) return;

    const { body } = createBaseModal({
        title: `PostQualityFilter Iteration ${agent.iterationNumber} - Analysis`,
        isEmbedded: true
    });
    body.classList.add('red-team-reasoning-display');

    body.innerHTML = agent.reasoning || '<p>No analysis available</p>';
}


// ============================================================================ 
// Internal Rendering Logic
// ============================================================================ 

function renderDefaultSolutionUI(container: HTMLElement, subStrategy: any) {
    const refinementWasPerformed = subStrategy.refinedSolution !== subStrategy.solutionAttempt;
    const currentRefinementEnabled = moduleState.getRefinementEnabled();

    // Use a grid layout
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: ${currentRefinementEnabled ? '1fr 1fr' : '1fr'}; gap: 20px; height: 100%;">
            ${renderSolutionPanel(
        'psychology',
        currentRefinementEnabled ? 'Attempted Solution' : 'Solution',
        subStrategy.solutionAttempt || 'Solution not available'
    )}
            
            <div style="display: flex; flex-direction: column; border: 1px solid #333; border-radius: 8px; overflow: hidden; ${!refinementWasPerformed ? 'position: relative;' : ''} ${!refinementWasPerformed ? 'class="disabled-pane"' : ''}">
                <div style="padding: 12px 16px; background: rgba(15, 17, 32, 0.4); border-bottom: 1px solid #333;">
                     <h4 style="margin: 0; ${!currentRefinementEnabled ? 'opacity: 0.6;' : ''}">
                        <span class="material-symbols-outlined">${currentRefinementEnabled ? 'auto_fix_high' : 'auto_fix_off'}</span>
                        ${currentRefinementEnabled ? 'Refined Solution' : 'Refined Solution (Disabled)'}
                     </h4>
                </div>
                <div style="flex: 1; overflow: auto; padding: 16px; position: relative;">
                    ${renderMathContent(currentRefinementEnabled
        ? (subStrategy.refinedSolution || 'Refined solution not available')
        : (subStrategy.refinedSolution || subStrategy.solutionAttempt || 'Solution refinement is disabled'))}
                    ${!refinementWasPerformed ? '<div class="disabled-overlay">Refinement Disabled</div>' : ''}
                </div>
            </div>
        </div>
    `;

    // Helper for left panel to reduce duplication
    function renderSolutionPanel(icon: string, title: string, content: string) {
        return `
        <div style="display: flex; flex-direction: column; border: 1px solid #333; border-radius: 8px; overflow: hidden;">
            <div style="padding: 12px 16px; background: rgba(15, 17, 32, 0.4); border-bottom: 1px solid #333;">
                <h4 style="margin: 0;"><span class="material-symbols-outlined">${icon}</span>${title}</h4>
            </div>
            <div style="flex: 1; overflow: auto; padding: 16px;">
                ${renderMathContent(content)}
            </div>
        </div>`;
    }
}

function renderLegacySubStrategyComparison(container: HTMLElement, subStrategy: any) {
    const refinementWasPerformed = subStrategy.refinedSolution !== subStrategy.solutionAttempt;
    const currentRefinementEnabled = moduleState.getRefinementEnabled();
    const refinedIcon = currentRefinementEnabled ? 'verified' : 'auto_fix_off';
    const refinedTitle = currentRefinementEnabled ? 'Refined Solution' : 'Refined Solution (Disabled)';

    container.innerHTML = `
        <div class="side-by-side-comparison">
            <div class="comparison-side">
                <div class="preview-header">
                    <h4 class="comparison-title no-padding-left">
                        <span class="material-symbols-outlined">psychology</span>
                        <span>Solution Attempt</span>
                    </h4>
                    <div class="code-actions">
                        <button class="copy-solution-btn" data-content="${moduleState.escapeHtml(subStrategy.solutionAttempt || '')}">
                            <span class="material-symbols-outlined">content_copy</span>
                            <span class="button-text">Copy</span>
                        </button>
                        <button class="download-solution-btn" data-content="${moduleState.escapeHtml(subStrategy.solutionAttempt || '')}" data-filename="solution-attempt.md">
                            <span class="material-symbols-outlined">download</span>
                            <span class="button-text">Download</span>
                        </button>
                    </div>
                </div>
                <div class="comparison-content custom-scrollbar">
                    ${subStrategy.solutionAttempt ? renderMathContent(subStrategy.solutionAttempt) : '<div class="no-content">No solution attempt available</div>'}
                </div>
            </div>
            <div class="comparison-side ${refinementWasPerformed ? '' : 'disabled-pane'}">
                <div class="preview-header">
                    <h4 class="comparison-title no-padding-left">
                        <span class="material-symbols-outlined">${refinedIcon}</span>
                        <span>${refinedTitle}</span>
                    </h4>
                    <div class="code-actions">
                        <button class="copy-solution-btn" data-content="${moduleState.escapeHtml(subStrategy.refinedSolution || '')}" ${!refinementWasPerformed ? 'disabled' : ''}>
                            <span class="material-symbols-outlined">content_copy</span>
                            <span class="button-text">Copy</span>
                        </button>
                        <button class="download-solution-btn" data-content="${moduleState.escapeHtml(subStrategy.refinedSolution || '')}" data-filename="refined-solution.md" ${!refinementWasPerformed ? 'disabled' : ''}>
                            <span class="material-symbols-outlined">download</span>
                            <span class="button-text">Download</span>
                        </button>
                    </div>
                </div>
                <div class="comparison-content custom-scrollbar">
                    ${subStrategy.refinedSolution ? renderMathContent(subStrategy.refinedSolution) : '<div class="no-content">No refined solution available</div>'}
                    ${subStrategy.error ? `<div class="error-content">${moduleState.escapeHtml(subStrategy.error)}</div>` : ''}
                    ${!refinementWasPerformed ? '<div class="disabled-overlay">Refinement Disabled</div>' : ''}
                </div>
            </div>
        </div>
    `;
}

function renderRedTeamReasoningContent(agent: any, reasoningData: any) {
    let html = '';

    // Strategy Info
    if (reasoningData.strategy_id || reasoningData.strategy) {
        html += `<div class="red-team-strategy-id">${reasoningData.strategy_id || reasoningData.strategy || 'N/A'}</div>`;
    }

    // Verdict
    if (reasoningData.verdict || reasoningData.decision || reasoningData.action) {
        const verdict = reasoningData.verdict || reasoningData.decision || reasoningData.action;
        const verdictClass = /eliminate/i.test(verdict) ? 'verdict-eliminate' : 'verdict-keep';
        html += `<div class="red-team-verdict ${verdictClass}">${verdict}</div>`;
    }

    // Analysis
    const rawAnalysis = reasoningData.reasoning || reasoningData.explanation || reasoningData.analysis;
    let contentToRender = '';

    if (rawAnalysis && typeof rawAnalysis === 'string') {
        contentToRender = rawAnalysis.replace(/(^|\n)\*{0,2}Challenge Evaluation:.*?(?=\n|$)/i, '$1').trim();
    } else if (rawAnalysis) {
        contentToRender = JSON.stringify(rawAnalysis, null, 2);
    } else {
        contentToRender = typeof agent.reasoning === 'string' ? agent.reasoning : JSON.stringify(agent.reasoning, null, 2);
    }

    html += `<div class="red-team-analysis">${renderMathContent(contentToRender)}</div>`;
    return html;
}

// Update active modal content dynamically
async function updateSolutionModalContent(modalBody: HTMLElement, subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const subStrategy = pipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
    if (!subStrategy) return;

    const iterativeCorrectionsData = (subStrategy as any).iterativeCorrections;
    const iterations = iterativeCorrectionsData?.iterations || [];
    const originalSolution = subStrategy.solutionAttempt || 'Processing...';
    const latestCorrection = iterations.length > 0 ? iterations[iterations.length - 1]?.correctedSolution : null;
    const currentBestSolution = latestCorrection || subStrategy.refinedSolution || subStrategy.solutionAttempt || 'Processing...';

    const isProcessing = subStrategy.selfImprovementStatus === 'processing' ||
        subStrategy.selfImprovementStatus === 'pending' ||
        iterativeCorrectionsData?.status === 'processing';

    const { renderIterativeCorrectionsUI } = await import('../Contextual/ContextualUI');
    await renderIterativeCorrectionsUI(modalBody, originalSolution, currentBestSolution, iterations, isProcessing);
}

export async function updateActiveSolutionModal() {
    if (activeSolutionModalSubStrategyId && document.getElementById('solution-modal-overlay')) {
        const modalBody = document.querySelector('#solution-modal-overlay .modal-body') as HTMLElement;
        if (modalBody) {
            await updateSolutionModalContent(modalBody, activeSolutionModalSubStrategyId);
        }
    }
}

function bindLegacyActionButtons(container: HTMLElement) {
    container.querySelectorAll('.copy-solution-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const content = btn.getAttribute('data-content') || '';
            try { await navigator.clipboard.writeText(content); } catch (e) { }
        });
    });

    container.querySelectorAll('.download-solution-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.getAttribute('data-content') || '';
            const filename = btn.getAttribute('data-filename') || 'solution.md';
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });
}

// ============================================================================ 
// Main Tab Renderers
// ============================================================================ 

export function renderStrategicSolverContent(process: DeepthinkPipelineState): string {
    if (process.status === 'error' && process.error) {
        return `<div class="status-message error"><pre>${moduleState.escapeHtml(process.error)}</pre></div>`;
    }

    if (!process.initialStrategies || process.initialStrategies.length === 0) {
        return '<div class="loading">Generating strategic approaches...</div>';
    }

    const activeIndex = process.activeStrategyTab || 0;

    // Generate Navigation
    const navButtons = process.initialStrategies.map((s, idx) => {
        const isActive = idx === activeIndex;
        const statusClass = s.isKilledByRedTeam ? 'killed-strategy' : '';
        return `<button class="sub-tab-button ${isActive ? 'active' : ''} ${statusClass}" data-strategy-index="${idx}" title="Strategy ${idx + 1}">${idx + 1}</button>`;
    }).join('');

    // Generate Content
    const strategiesContent = process.initialStrategies.map((strategy, index) => {
        const isActive = activeIndex === index;
        const isSkipMode = strategy.subStrategies.length === 1 && strategy.subStrategies[0].id.endsWith('-direct');
        const directSubStrategy = isSkipMode ? strategy.subStrategies[0] : null;
        const hasDirectSolution = directSubStrategy && (directSubStrategy.solutionAttempt || directSubStrategy.refinedSolution);
        const strategyTextTruncated = strategy.strategyText.length > 200 ? strategy.strategyText.substring(0, 200) + '...' : strategy.strategyText;

        return `
            <div class="sub-tab-content ${isActive ? 'active' : ''}" data-strategy-index="${index}">
                <div class="strategy-card ${strategy.isKilledByRedTeam ? 'killed-strategy' : ''}">
                    <div class="sub-tabs-nav">${navButtons}</div>
                    
                    <div class="strategy-content">
                        <div class="strategy-text-container">
                            <div class="strategy-text" data-full-text="${moduleState.escapeHtml(strategy.strategyText)}">
                                ${renderMathContent(strategyTextTruncated)}
                            </div>
                            <div class="strategy-actions">
                                ${strategy.strategyText.length > 200 ? '<button class="show-more-btn" data-target="strategy">Show More</button>' : ''}
                                ${isSkipMode && hasDirectSolution ? `
                                    <button class="view-solution-button" data-sub-strategy-id="${directSubStrategy.id}">
                                        <span class="material-symbols-outlined">visibility</span> View Solution
                                    </button>` : ''}
                            </div>
                        </div>
                        ${strategy.error ? `<div class="error-message">${moduleState.escapeHtml(strategy.error)}</div>` : ''}
                        ${strategy.isKilledByRedTeam ? `<div class="elimination-reason">${moduleState.escapeHtml(strategy.redTeamReason || 'Eliminated by Red Team')}</div>` : ''}
                    </div>
                    ${isSkipMode ? '' : renderSubStrategiesGrid(strategy.subStrategies)}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="deepthink-strategic-solver">
            <div class="sub-tabs-container">
                <div class="sub-tabs-content">
                    ${strategiesContent}
                </div>
            </div>
        </div>
    `;
}

function renderSubStrategiesGrid(subStrategies: any[]): string {
    if (!subStrategies?.length) return '';

    return `<div class="red-team-agents-grid">
        ${subStrategies.map((sub, index) => {
        const hasContent = sub.solutionAttempt || sub.refinedSolution;
        const fullText = sub.subStrategyText || 'No sub-strategy text available';
        const isLong = fullText.length > 150;
        const displayText = isLong ? fullText.substring(0, 150) + '...' : fullText;

        return `
            <div class="red-team-agent-card ${sub.isKilledByRedTeam ? 'killed-sub-strategy' : ''}">
                <div class="red-team-agent-header">
                    <h4 class="red-team-agent-title">Sub-Strategy ${index + 1}</h4>
                    <span class="status-badge status-${sub.refinedSolution ? 'completed' : sub.solutionAttempt ? 'processing' : 'pending'}">
                        ${sub.refinedSolution ? 'Completed' : sub.solutionAttempt ? 'Processing (1/2)' : 'Processing'}
                    </span>
                </div>
                <div class="red-team-results">
                    <div class="sub-strategy-content-wrapper">
                        <div class="sub-strategy-text-container">
                            <div class="sub-strategy-text" data-full-text="${moduleState.escapeHtml(fullText)}" style="max-height: none; overflow: visible;">
                                ${renderMathContent(displayText)}
                            </div>
                        </div>
                        <div class="sub-strategy-actions">
                            ${isLong ? '<button class="show-more-btn" data-target="sub-strategy">Show More</button>' : ''}
                            ${hasContent ? `
                                <button class="view-solution-button" data-sub-strategy-id="${sub.id}">
                                    <span class="material-symbols-outlined">visibility</span> View Solution
                                </button>` : ''}
                        </div>
                    </div>
                    ${sub.error ? `<div class="error-message">${moduleState.escapeHtml(sub.error)}</div>` : ''}
                    ${sub.isKilledByRedTeam ? `<div class="elimination-reason">${moduleState.escapeHtml(sub.redTeamReason || 'Eliminated by Red Team')}</div>` : ''}
                </div>
            </div>`;
    }).join('')}
    </div>`;
}

export function renderHypothesisExplorerContent(process: DeepthinkPipelineState): string {
    if (process.hypothesisGenStatus === 'processing') return '<div class="loading">Generating and testing hypotheses...</div>';
    if (process.hypothesisGenStatus !== 'completed' || !process.hypotheses?.length) return '<div class="status-message">Hypothesis exploration not yet started.</div>';

    let html = '<div class="deepthink-hypothesis-explorer">';

    // Hypotheses Grid
    html += `<div class="red-team-agents-grid">
        ${process.hypotheses.map((h, i) => `
            <div class="red-team-agent-card">
                <div class="red-team-agent-header">
                    <h4 class="red-team-agent-title">Hypothesis ${i + 1}</h4>
                    <span class="status-badge status-${h.testerStatus}">${h.testerStatus === 'completed' ? 'Completed' : h.testerStatus === 'processing' ? 'Processing' : 'Pending'}</span>
                </div>
                <div class="red-team-results">
                    <div class="hypothesis-text-container">
                        <div class="hypothesis-text" data-full-text="${moduleState.escapeHtml(h.hypothesisText)}">
                            ${renderMathContent(h.hypothesisText?.length > 150 ? h.hypothesisText.substring(0, 150) + '...' : (h.hypothesisText || 'No hypothesis text'))}
                        </div>
                        ${h.hypothesisText?.length > 150 ? '<button class="show-more-btn" data-target="hypothesis">Show More</button>' : ''}
                    </div>
                    ${h.testerAttempt ? `
                    <div class="red-team-reasoning-section">
                        <button class="view-argument-button" data-hypothesis-id="${h.id}">
                            <span class="material-symbols-outlined">article</span> View The Argument
                        </button>
                    </div>` : ''}
                </div>
            </div>
        `).join('')}
    </div>`;

    // Knowledge Packet
    if (process.knowledgePacket) {
        html += renderKnowledgePacket(process.knowledgePacket);
    }

    html += '</div>';
    return html;
}

function renderKnowledgePacket(packetContent: string): string {
    let packetBody = '';

    if (packetContent.includes('<Full Information Packet>')) {
        const hypothesisRegex = /<Hypothesis (\d+)>\s*Hypothesis:\s*(.*?)\s*Hypothesis Testing:\s*(.*?)\s*<\/Hypothesis \d+>/gs;
        let match;
        let found = false;

        while ((match = hypothesisRegex.exec(packetContent)) !== null) {
            found = true;
            const [, number, hypothesis, testing] = match;
            packetBody += `
            <details class="hypothesis-details" style="margin-bottom: 1rem; border: 1px solid var(--border-color); border-radius: var(--border-radius-md); overflow: hidden;">
                <summary style="padding: 1rem; background: rgba(var(--card-bg-base-rgb), 0.5); cursor: pointer; font-weight: 600; list-style: none; display: flex; align-items: center; gap: 0.5rem;">
                    <span class="material-symbols-outlined dropdown-icon" style="transition: transform 0.2s;">chevron_right</span>
                    Hypothesis ${number}
                </summary>
                <div class="hypothesis-details-content" style="padding: 1rem; border-top: 1px solid var(--border-color);">
                    <div class="hypothesis-block" style="margin-bottom: 1.5rem;">
                        <strong style="display: block; margin-bottom: 0.5rem; color: var(--accent-blue);">Hypothesis:</strong>
                        <div class="hypothesis-description">${renderMathContent(hypothesis.trim())}</div>
                    </div>
                    <div class="hypothesis-testing">
                        <strong style="display: block; margin-bottom: 0.5rem; color: var(--accent-purple);">Hypothesis Testing:</strong>
                        <div class="testing-output">${renderMathContent(testing.trim())}</div>
                    </div>
                </div>
            </details>`;
        }
        if (!found) packetBody = renderMathContent(packetContent);
    } else {
        packetBody = renderMathContent(packetContent);
    }

    return `
    <div class="knowledge-packet-section">
        <div class="knowledge-packet-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div class="knowledge-packet-title"><span class="material-symbols-outlined">psychology</span><span>Full Information Packet</span></div>
            <div class="code-actions" style="margin-top: 0;">
                <button class="action-btn copy-xml-btn" data-content="${moduleState.escapeHtml(packetContent)}"><span class="material-symbols-outlined">content_copy</span> XML</button>
                <button class="action-btn download-xml-btn" data-content="${moduleState.escapeHtml(packetContent)}"><span class="material-symbols-outlined">download</span> XML</button>
            </div>
        </div>
        <div class="knowledge-packet-content">
            <div class="knowledge-packet-card">${packetBody}</div>
        </div>
    </div>`;
}

export function renderDissectedObservationsContent(process: DeepthinkPipelineState): string {
    const refinementEnabled = moduleState.getRefinementEnabled();
    const iterativeCorrectionsEnabled = moduleState.getIterativeCorrectionsEnabled();
    const hasExistingCritique = process.solutionCritiques && process.solutionCritiques.length > 0;
    const hasSubStrategyCritiques = iterativeCorrectionsEnabled && process.initialStrategies.some(s =>
        s.subStrategies.some(sub => sub.solutionCritique?.length > 0)
    );

    if (process.solutionCritiquesStatus === 'processing') return '<div class="loading">Critiquing solutions...</div>';
    if (!refinementEnabled && !hasExistingCritique && !hasSubStrategyCritiques) return '<div class="status-message">Dissected Observations are only available when refinement is enabled.</div>';
    if (!hasSubStrategyCritiques && !hasExistingCritique && process.solutionCritiquesStatus !== 'processing') {
        return '<div class="status-message">Solution critiques not yet started. Waiting for solutions to be generated.</div>';
    }

    let html = '<div class="deepthink-dissected-observations"><div class="red-team-agents-grid">';

    if (hasExistingCritique) {
        // Standard or Legacy Data
        html += process.solutionCritiques.map(critique => {
            const mainStrategy = process.initialStrategies.find(s => s.id === critique.mainStrategyId);
            const activeSub = mainStrategy?.subStrategies.filter(sub => !sub.isKilledByRedTeam && sub.solutionAttempt) || [];
            const iterLabel = (critique as any).retryAttempt ? ` - Iteration ${(critique as any).retryAttempt}` : '';

            return `
            <div class="red-team-agent-card">
                <div class="red-team-agent-header">
                    <h4 class="red-team-agent-title">Critique: ${critique.mainStrategyId}${iterLabel}</h4>
                    <span class="status-badge status-${critique.status}">${critique.status}</span>
                </div>
                <div class="red-team-results">
                    ${mainStrategy ? `
                    <div class="sub-strategy-text-container">
                        <div class="sub-strategy-label">Main Strategy:</div>
                        <div class="sub-strategy-text">${renderMathContent(mainStrategy.strategyText?.substring(0, 150) + '...' || '')}</div>
                        ${!iterativeCorrectionsEnabled ? `<div class="sub-strategy-label" style="margin-top: 8px;">Sub-Strategies Critiqued: ${activeSub.length}</div>` : ''}
                    </div>` : ''}
                    ${critique.critiqueResponse ? `
                    <div class="red-team-reasoning-section">
                        <button class="view-critique-button" data-critique-id="${critique.id}">
                            <span class="material-symbols-outlined">rate_review</span> View Full Critique
                        </button>
                    </div>` : critique.status === 'error' ? `<div class="error-message">${critique.error || 'Critique failed'}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    } else if (hasSubStrategyCritiques) {
        // Iterative Mode Fallback
        html += process.initialStrategies.map(mainStrategy => {
            const directSub = mainStrategy.subStrategies[0];
            if (!directSub || !directSub.solutionCritique) return '';
            const status = directSub.solutionCritiqueStatus || 'completed';

            return `
            <div class="red-team-agent-card">
                <div class="red-team-agent-header">
                    <h4 class="red-team-agent-title">Critique: ${mainStrategy.id}</h4>
                    <span class="status-badge status-${status}">${status}</span>
                </div>
                <div class="red-team-results">
                    <div class="sub-strategy-text-container">
                        <div class="sub-strategy-label">Strategy:</div>
                        <div class="sub-strategy-text">${renderMathContent(mainStrategy.strategyText?.substring(0, 150) + '...' || '')}</div>
                    </div>
                    <div class="red-team-reasoning-section">
                        <button class="view-critique-button" data-critique-substrategy-id="${directSub.id}">
                            <span class="material-symbols-outlined">rate_review</span> View Full Critique
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    html += '</div>'; // close grid

    // Synthesis Section
    if (!iterativeCorrectionsEnabled && process.dissectedSynthesisStatus) {
        html += `
        <div class="synthesis-section">
            <div class="synthesis-header">
                <div class="synthesis-title"><span class="material-symbols-outlined">integration_instructions</span><span>Dissected Observations Synthesis:</span></div>
                <span class="status-badge status-${process.dissectedSynthesisStatus}">
                    ${process.dissectedSynthesisStatus === 'completed' ? 'Synthesis Complete' : process.dissectedSynthesisStatus === 'processing' ? 'Synthesizing...' : 'Pending'}
                </span>
            </div>
            ${process.dissectedObservationsSynthesis ? `<div class="synthesis-content"><div class="synthesis-card">${renderMathContent(process.dissectedObservationsSynthesis)}</div></div>` : ''}
            ${process.dissectedSynthesisStatus === 'error' ? `<div class="error-message">${process.dissectedSynthesisError || 'Synthesis failed'}</div>` : ''}
        </div>`;
    }

    html += '</div>';
    return html;
}

export function renderRedTeamContent(process: DeepthinkPipelineState): string {
    const hasRedTeam = process.redTeamEvaluations?.length > 0;
    const hasPostQF = process.postQualityFilterAgents?.length > 0;

    if (!hasRedTeam && !hasPostQF) return '<div class="deepthink-red-team"><div class="status-message">Red Team evaluation not yet started.</div></div>';

    let html = '<div class="deepthink-red-team">';

    if (hasRedTeam) {
        html += `<div class="red-team-agents-grid">
            ${process.redTeamEvaluations.map((agent, i) => {
            const killedCount = (agent.killedStrategyIds?.length || 0) + (agent.killedSubStrategyIds?.length || 0);
            return `
                <div class="red-team-agent-card">
                    <div class="red-team-agent-header">
                        <h4 class="red-team-agent-title">${process.redTeamEvaluations.length === 1 ? "Red Team Evaluation" : `Red Team Agent ${i + 1}`}</h4>
                        <span class="status-badge status-${agent.status}">${agent.status}</span>
                    </div>
                    <div class="red-team-results">
                        <div class="red-team-evaluation-summary">
                            <div class="evaluation-metric"><span class="metric-value">${killedCount}</span><span class="metric-label">Items Eliminated</span></div>
                        </div>
                        ${killedCount > 0 ? `<div class="killed-items">
                            ${agent.killedStrategyIds?.length ? `<p><strong>Eliminated Strategies:</strong> ${agent.killedStrategyIds.join(', ')}</p>` : ''}
                            ${agent.killedSubStrategyIds?.length ? `<p><strong>Eliminated Sub-Strategies:</strong> ${agent.killedSubStrategyIds.join(', ')}</p>` : ''}
                        </div>` : ''}
                        ${agent.reasoning ? `
                        <div class="red-team-reasoning-section">
                            <button type="button" class="red-team-fullscreen-btn red-team-reasoning-pill" data-agent-id="${agent.id}">
                                <div class="pill-content">
                                    <span class="material-symbols-outlined pill-icon">code</span>
                                    <div class="pill-text"><span class="pill-label">Reasoning</span><span class="pill-subtext">${killedCount > 0 ? 'See elimination rationale' : 'View agent notes'}</span></div>
                                </div>
                                <span class="material-symbols-outlined pill-action-icon">open_in_new</span>
                            </button>
                        </div>` : ''}
                    </div>
                </div>`;
        }).join('')}
        </div>`;
    }

    if (hasPostQF) {
        html += '<h3 class="red-team-section-title" style="margin-top: 2rem;">Post Quality Filter</h3><div class="red-team-agents-grid">';
        html += process.postQualityFilterAgents.map(agent => {
            const updateCount = agent.prunedStrategyIds?.length || 0;
            const keepCount = agent.continuedStrategyIds?.length || 0;
            return `
            <div class="red-team-agent-card">
                <div class="red-team-agent-header">
                    <h4 class="red-team-agent-title">PostQF Iteration ${agent.iterationNumber}</h4>
                    <span class="status-badge status-${agent.status}">${agent.status}</span>
                </div>
                <div class="red-team-results">
                    <div class="red-team-evaluation-summary">
                        <div class="evaluation-metric"><span class="metric-value">${updateCount}</span><span class="metric-label">Strategies Updated</span></div>
                        <div class="evaluation-metric"><span class="metric-value">${keepCount}</span><span class="metric-label">Strategies Kept</span></div>
                    </div>
                    ${(updateCount > 0 || keepCount > 0) ? `<div class="killed-items">
                        ${updateCount > 0 ? `<p><strong>Updated:</strong> ${agent.prunedStrategyIds.join(', ')}</p>` : ''}
                        ${keepCount > 0 ? `<p><strong>Kept:</strong> ${agent.continuedStrategyIds.join(', ')}</p>` : ''}
                    </div>` : ''}
                    ${agent.reasoning ? `
                    <div class="red-team-reasoning-section">
                        <button type="button" class="red-team-fullscreen-btn red-team-reasoning-pill" data-agent-id="${agent.id}">
                            <div class="pill-content">
                                <span class="material-symbols-outlined pill-icon">code</span>
                                <div class="pill-text"><span class="pill-label">Analysis</span><span class="pill-subtext">${(updateCount > 0 || keepCount > 0) ? 'Iteration decisions' : 'View agent notes'}</span></div>
                            </div>
                            <span class="material-symbols-outlined pill-action-icon">open_in_new</span>
                        </button>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('');
        html += '</div>';
    }

    html += '</div>';
    return html;
}

export function renderFinalResultContent(process: DeepthinkPipelineState): string {
    let html = '<div class="deepthink-final-result">';

    if (process.finalJudgingStatus === 'completed' && process.finalJudgedBestSolution) {
        html += `<div class="judged-solution-container final-judged-solution">${renderMathContent(process.finalJudgedBestSolution)}</div>`;
    } else if (process.finalJudgingStatus === 'processing') {
        html += '<div class="loading">Final judging in progress...</div>';
    } else if (process.finalJudgingStatus === 'error') {
        html += `<div class="status-message error"><p>Error during final judging:</p><pre>${moduleState.escapeHtml(process.finalJudgingError || 'Unknown error')}</pre></div>`;
    } else if (process.status === 'completed') {
        html += '<div class="status-message">Final result not available</div>';
    } else {
        html += '<div class="status-message">Waiting for solution completion...</div>';
    }

    html += '</div>';
    return html;
}

// ============================================================================ 
// Event Handling
// ============================================================================ 

export function activateDeepthinkStrategyTab(strategyIndex: number) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;
    pipeline.activeStrategyTab = strategyIndex;

    document.querySelectorAll('.sub-tab-button').forEach((b, i) => b.classList.toggle('active', i === strategyIndex));
    document.querySelectorAll('.sub-tab-content').forEach((c, i) => c.classList.toggle('active', i === strategyIndex));
}

function addDeepthinkEventHandlers() {
    if (!moduleState.pipelinesContentContainer) return;
    moduleState.pipelinesContentContainer.removeEventListener('click', deepthinkClickHandler);
    moduleState.pipelinesContentContainer.addEventListener('click', deepthinkClickHandler);
}

function deepthinkClickHandler(event: Event) {
    const target = event.target as HTMLElement;
    const pipeline = getActiveDeepthinkPipeline();
    if (!target || !pipeline) return;

    // Helper to find closest element with class
    const closest = (cls: string) => target.closest('.' + cls) as HTMLElement;

    // Dispatcher
    if (closest('sub-tab-button')) {
        const idx = parseInt(closest('sub-tab-button').getAttribute('data-strategy-index') || '0');
        pipeline.activeStrategyTab = idx;
        renderActiveDeepthinkPipeline();
        return;
    }

    if (closest('view-solution-button')) {
        event.preventDefault(); event.stopPropagation();
        const id = closest('view-solution-button').getAttribute('data-sub-strategy-id');
        if (id) openSubStrategySolutionModal(id);
        return;
    }

    if (closest('copy-xml-btn')) {
        event.preventDefault(); event.stopPropagation();
        const btn = closest('copy-xml-btn');
        const content = btn.getAttribute('data-content');
        if (content) {
            navigator.clipboard.writeText(content).catch(console.error);
            const original = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined">check</span> Copied';
            setTimeout(() => btn.innerHTML = original, 2000);
        }
        return;
    }

    if (closest('download-xml-btn')) {
        event.preventDefault(); event.stopPropagation();
        const content = closest('download-xml-btn').getAttribute('data-content');
        if (content) {
            const blob = new Blob([content], { type: 'text/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'information_packet.xml';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        return;
    }

    if (closest('view-argument-button')) {
        event.preventDefault(); event.stopPropagation();
        if (document.querySelector('.embedded-modal-overlay')) return;
        const btn = closest('view-argument-button');
        if (btn.classList.contains('view-pool-button')) {
            const sid = btn.getAttribute('data-strategy-id');
            const iter = btn.getAttribute('data-iteration');
            if (sid && iter) openSolutionPoolModal(sid, parseInt(iter));
        } else {
            const hid = btn.getAttribute('data-hypothesis-id');
            if (hid) openHypothesisArgumentModal(hid);
        }
        return;
    }

    if (closest('view-critique-button')) {
        event.preventDefault(); event.stopPropagation();
        if (document.querySelector('.embedded-modal-overlay')) return;
        const btn = closest('view-critique-button');
        const subId = btn.getAttribute('data-critique-substrategy-id');
        if (subId) openSubStrategyCritiqueModal(subId);
        else {
            const cId = btn.getAttribute('data-critique-id');
            if (cId) openCritiqueModal(cId);
        }
        return;
    }

    if (target.classList.contains('show-more-btn')) {
        event.preventDefault(); event.stopPropagation();
        handleShowMore(target);
        return;
    }

    if (closest('solution-pool-current-button')) {
        event.preventDefault(); event.stopPropagation();
        const pid = closest('solution-pool-current-button').getAttribute('data-pipeline-id');
        if (pid) openCurrentSolutionPool(pid);
        return;
    }

    if (closest('solution-pool-evolution-button')) {
        event.preventDefault(); event.stopPropagation();
        const pid = closest('solution-pool-evolution-button').getAttribute('data-pipeline-id');
        if (pid) openSolutionPoolEvolution(pid);
        return;
    }

    if (closest('solution-pool-download-button')) {
        event.preventDefault(); event.stopPropagation();
        const pid = closest('solution-pool-download-button').getAttribute('data-pipeline-id');
        if (pid) downloadSolutionPoolAsJSON(pid);
        return;
    }

    if (closest('red-team-fullscreen-btn')) {
        if (document.querySelector('.embedded-modal-overlay')) return;
        const id = closest('red-team-fullscreen-btn').getAttribute('data-agent-id');
        if (id) {
            const rtAgent = pipeline.redTeamEvaluations.find(a => a.id === id);
            if (rtAgent && rtAgent.reasoning) { openRedTeamReasoningModal(rtAgent); return; }
            const pqfAgent = pipeline.postQualityFilterAgents.find(a => a.id === id);
            if (pqfAgent && pqfAgent.reasoning) { openPostQualityFilterModal(pqfAgent); return; }
        }
        return;
    }
}

function handleShowMore(button: HTMLElement) {
    const targetType = button.getAttribute('data-target');
    let container, textDiv;

    if (targetType === 'sub-strategy') {
        container = button.closest('.sub-strategy-content-wrapper');
        textDiv = container?.querySelector('.sub-strategy-text');
    } else if (targetType === 'hypothesis') {
        container = button.closest('.hypothesis-text-container');
        textDiv = container?.querySelector('.hypothesis-text');
    } else if (targetType === 'strategy') {
        container = button.closest('.strategy-text-container');
        textDiv = container?.querySelector('.strategy-text');
    }

    if (textDiv && container) {
        const fullText = textDiv.getAttribute('data-full-text') || '';
        const isExpanded = button.textContent === 'Show Less';
        const truncateLength = (targetType === 'sub-strategy' || targetType === 'hypothesis') ? 150 : 200;

        if (!isExpanded) {
            textDiv.innerHTML = renderMathContent(fullText);
            button.textContent = 'Show Less';

            // Expand classes
            if (targetType === 'sub-strategy') {
                container.querySelector('.sub-strategy-text-container')?.classList.add('expanded');
                button.closest('.red-team-agent-card')?.classList.add('expanded');
            } else if (targetType === 'hypothesis') {
                button.closest('.red-team-agent-card')?.querySelector('.hypothesis-text-container')?.classList.add('expanded');
            } else if (targetType === 'strategy') {
                button.closest('.strategy-content')?.classList.add('expanded');
            }
        } else {
            textDiv.innerHTML = renderMathContent(fullText.length > truncateLength ? fullText.substring(0, truncateLength) + '...' : fullText);
            button.textContent = 'Show More';

            // Collapse classes
            if (targetType === 'sub-strategy') {
                container.querySelector('.sub-strategy-text-container')?.classList.remove('expanded');
                button.closest('.red-team-agent-card')?.classList.remove('expanded');
            } else if (targetType === 'hypothesis') {
                button.closest('.red-team-agent-card')?.querySelector('.hypothesis-text-container')?.classList.remove('expanded');
            } else if (targetType === 'strategy') {
                button.closest('.strategy-content')?.classList.remove('expanded');
            }

            setTimeout(() => {
                const scrollTarget = button.closest('.red-team-agent-card, .strategy-text-container');
                scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }
}


// ============================================================================ 
// Main Pipeline Render
// ============================================================================ 

export function renderActiveDeepthinkPipeline() {
    const deepthinkProcess = getActiveDeepthinkPipeline();
    const { tabsNavContainer, pipelinesContentContainer } = moduleState;

    // Safety checks and recovery of DOM references if missing
    if (!deepthinkProcess || !tabsNavContainer || !pipelinesContentContainer) {
        if (!moduleState.tabsNavContainer) moduleState.tabsNavContainer = document.getElementById('tabs-nav-container');
        if (!moduleState.pipelinesContentContainer) moduleState.pipelinesContentContainer = document.getElementById('pipelines-content-container');
        if (!moduleState.tabsNavContainer || !moduleState.pipelinesContentContainer || !deepthinkProcess) return;
    }

    // Restore UI state
    const sidebarBtn = document.getElementById('sidebar-collapse-button') as HTMLButtonElement;
    if (sidebarBtn) {
        sidebarBtn.disabled = false;
        sidebarBtn.style.opacity = '';
        sidebarBtn.style.cursor = '';
    }

    const header = document.querySelector('.main-header-content') as HTMLElement;
    if (header) header.style.display = '';
    moduleState.tabsNavContainer!.style.display = '';

    updateActiveSolutionModal().catch(() => { });

    // Clear Previous
    moduleState.tabsNavContainer!.innerHTML = '';
    moduleState.pipelinesContentContainer!.innerHTML = '';

    // Determine Tabs
    const isRedTeamEnabled = moduleState.getSelectedRedTeamAggressiveness() !== 'off';
    const hasPostQualityFilter = deepthinkProcess.postQualityFilterAgents?.length > 0;
    const isHypothesisEnabled = moduleState.getSelectedHypothesisCount() > 0;
    const isDissectedEnabled = moduleState.getRefinementEnabled() || moduleState.getIterativeCorrectionsEnabled() || moduleState.getDissectedObservationsEnabled();

    const tabs = [
        { id: 'strategic-solver', label: 'Strategic Solver', icon: 'psychology', visible: true },
        { id: 'hypothesis-explorer', label: 'Hypothesis Explorer', icon: 'science', visible: isHypothesisEnabled },
        { id: 'solution-pool', label: 'Solution Pool', icon: 'database', visible: deepthinkProcess.structuredSolutionPoolEnabled },
        { id: 'dissected-observations', label: 'Dissected Observations', icon: 'troubleshoot', visible: isDissectedEnabled },
        { id: 'red-team', label: 'Red Team', icon: 'security', visible: isRedTeamEnabled || hasPostQualityFilter, hasPinkGlow: true },
        { id: 'final-result', label: 'Final Result', icon: 'flag', visible: true, alignRight: true }
    ].filter(t => t.visible);

    if (!tabs.some(t => t.id === deepthinkProcess.activeTabId) && tabs.length > 0) {
        deepthinkProcess.activeTabId = tabs[0].id;
    }

    // Render Tabs
    tabs.forEach(tab => {
        const btn = document.createElement('button');
        const statusClass = getTabStatusClass(tab.id, deepthinkProcess);

        btn.className = `tab-button deepthink-mode-tab ${deepthinkProcess.activeTabId === tab.id ? 'active' : ''} ${statusClass} ${tab.hasPinkGlow ? 'red-team-pink-glow' : ''} ${tab.alignRight ? 'align-right' : ''}`;
        btn.innerHTML = `<span class="material-symbols-outlined">${tab.icon}</span>${tab.label}`;
        btn.addEventListener('click', () => {
            deepthinkProcess.activeTabId = tab.id;
            renderActiveDeepthinkPipeline();
        });
        moduleState.tabsNavContainer!.appendChild(btn);
    });

    // Render Content
    const content = moduleState.pipelinesContentContainer!;
    switch (deepthinkProcess.activeTabId) {
        case 'strategic-solver': content.innerHTML = renderStrategicSolverContent(deepthinkProcess); break;
        case 'hypothesis-explorer': content.innerHTML = renderHypothesisExplorerContent(deepthinkProcess); break;
        case 'solution-pool': content.innerHTML = renderSolutionPoolContent(deepthinkProcess); break;
        case 'dissected-observations': content.innerHTML = renderDissectedObservationsContent(deepthinkProcess); break;
        case 'red-team': content.innerHTML = renderRedTeamContent(deepthinkProcess); break;
        case 'final-result': content.innerHTML = renderFinalResultContent(deepthinkProcess); break;
        default: content.innerHTML = renderStrategicSolverContent(deepthinkProcess);
    }

    addDeepthinkEventHandlers();
}

function getTabStatusClass(tabId: string, process: DeepthinkPipelineState): string {
    switch (tabId) {
        case 'strategic-solver':
            if (process.status === 'error') return 'status-deepthink-error';
            if (process.initialStrategies?.some(s => s.status === 'completed')) return 'status-deepthink-completed';
            if (process.initialStrategies?.some(s => s.status === 'processing')) return 'status-deepthink-processing';
            return '';
        case 'hypothesis-explorer':
            return process.hypothesisExplorerComplete ? 'status-deepthink-completed' : '';
        case 'solution-pool':
            if (process.structuredSolutionPoolStatus === 'completed') return 'status-deepthink-completed';
            if (process.structuredSolutionPoolStatus === 'processing') return 'status-deepthink-processing';
            if (process.structuredSolutionPoolStatus === 'error') return 'status-deepthink-error';
            return '';
        case 'dissected-observations':
            if (process.dissectedSynthesisStatus === 'completed') return 'status-deepthink-completed';
            if (process.dissectedSynthesisStatus === 'error') return 'status-deepthink-error';
            if (process.dissectedSynthesisStatus === 'processing' || process.solutionCritiquesStatus === 'processing') return 'status-deepthink-processing';
            return '';
        case 'red-team':
            return process.redTeamComplete ? 'status-deepthink-completed' : '';
        case 'final-result':
            if (process.finalJudgingStatus === 'completed') return 'status-deepthink-completed';
            if (process.finalJudgingStatus === 'error') return 'status-deepthink-error';
            if (process.finalJudgingStatus === 'processing') return 'status-deepthink-processing';
            return '';
        default: return '';
    }
}
