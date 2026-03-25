/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deepthink — Module logic, state management, initialization, and event coordination.
 * All rendering (JSX) lives in Deepthink.tsx. This file contains ZERO innerHTML/HTML strings.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { AIProvider } from '../Routing/AIProvider';
import { callGemini } from "@/Routing/AIService.js";
import { CustomizablePromptsDeepthink } from './DeepthinkPrompts';
import { cleanupIterativeCorrectionsRoot } from '../Contextual/ContextualUI';
import { onHighlighterReady } from '../Styles/Shiki';
import {
    openSolutionPoolEvolution,
    downloadSolutionPoolAsJSON
} from './SolutionPool';
import {
    openSolutionPoolModal,
    openCurrentSolutionPool,
} from './SolutionPool.tsx';
import { parseJsonSafe } from "../Core/JsonParser";
import {
    saveSessionToFile,
    saveSessionToFileAutomatic,
    loadSessionFromFile,
    loadSessionFromLocalStorage,
    restoreSession,
} from './DeepthinkSession';
import { initQuotaBackoffManager, getQuotaBackoffManager } from './QuotaBackoffManager';
import { mountQuotaCountdownUI, unmountQuotaCountdownUI } from './QuotaCountdownUI';
import { showSessionResumeOverlay } from './SessionResumeUI';

// React component imports
import {
    BaseModal,
    DefaultSolutionUI,
    SubStrategyComparisonUI,
    EmbeddedModalContent,
    RedTeamReasoningContent,
    StrategicSolverTab,
    HypothesisExplorerTab,
    DissectedObservationsTab,
    RedTeamTab,
    FinalResultTab,
} from './Deepthink.tsx';

import { SolutionPoolTabContent } from './SolutionPool.tsx';

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
    startDeepthinkAnalysisProcess,
    resumeSolutionPoolIterations,
    runFinalJudge
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
    setActiveDeepthinkPipelineForImport,
    resumeSolutionPoolIterations
};

export { saveSessionToFile, loadSessionFromFile, loadSessionFromLocalStorage };

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

// React roots for React-rendered content
let pipelineContentRoot: Root | null = null;
let pipelineContentContainerNode: HTMLElement | null = null;
let modalRoot: Root | null = null;
let modalContainer: HTMLElement | null = null;

// ============================================================================ 
// Initialization
// ============================================================================ 

export function initializeDeepthinkModule(dependencies: {
    getAIProvider: () => AIProvider | null;
    callGemini: typeof callGemini;
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
    getIterativeDepth: () => number;
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
    Object.assign(moduleState, {
        tabsNavContainer: dependencies.tabsNavContainer,
        pipelinesContentContainer: dependencies.pipelinesContentContainer,
        escapeHtml: dependencies.escapeHtml,
        cleanTextOutput: dependencies.cleanTextOutput,
        getSelectedStrategiesCount: dependencies.getSelectedStrategiesCount,
        getSelectedSubStrategiesCount: dependencies.getSelectedSubStrategiesCount,
        getSelectedHypothesisCount: dependencies.getSelectedHypothesisCount,
        getSelectedRedTeamAggressiveness: dependencies.getSelectedRedTeamAggressiveness,
        getRefinementEnabled: dependencies.getRefinementEnabled,
        getIterativeCorrectionsEnabled: dependencies.getIterativeCorrectionsEnabled,
        getDissectedObservationsEnabled: dependencies.getDissectedObservationsEnabled,
    });

    onHighlighterReady(() => {
        if (getActiveDeepthinkPipeline()) {
            renderActiveDeepthinkPipeline();
        }
    });

    initializeDeepthinkCore({
        ...dependencies,
        renderActiveDeepthinkPipeline
    });

    // Initialize quota backoff manager, callbacks, and countdown UI
    initQuotaBackoff();

    // Attempt to restore last auto-saved session from localStorage
    tryRestoreAutoSave();
}

function tryRestoreAutoSave(): void {
    const session = loadSessionFromLocalStorage();
    if (!session) return;

    // Only restore if no pipeline is already active
    if (getActiveDeepthinkPipeline()) return;

    console.log(`[DeepthinkSession] Found auto-saved session "${session.label}" (${session.savedAt})`);
    restoreSession(session, renderActiveDeepthinkPipeline);
}

/** Load a session from a user-selected file, restore it, then show the resume overlay */
export async function loadAndRestoreSessionFromFile(): Promise<boolean> {
    const session = await loadSessionFromFile();
    if (!session) return false;

    restoreSession(session, renderActiveDeepthinkPipeline);
    console.log(`[DeepthinkSession] Restored session "${session.label}" from file`);

    showSessionResumeOverlay(session, (backoffDurationHours, targetDepth) => {
        if (backoffDurationHours > 0) {
            getQuotaBackoffManager().updateConfig({ backoffDurationHours });
        }
        resumeSolutionPoolIterations(targetDepth);
    });

    return true;
}

/** Resume solution pool iterations from current loaded state. Exposed on window for console use. */
export async function resumeFromConsole(targetDepth: number = 10): Promise<void> {
    const p = getActiveDeepthinkPipeline();
    if (!p) {
        console.error('No pipeline loaded. Load a session file first via the UI button.');
        return;
    }
    console.log(`[Resume] Pipeline "${p.id}" found. Starting resume to depth ${targetDepth}...`);
    await resumeSolutionPoolIterations(targetDepth);
}

// Expose on window so console calls use the same module instance as the app
(window as any).__deepthinkResume = resumeFromConsole;
(window as any).__deepthinkLoadAndResume = loadAndRestoreSessionFromFile;

// ============================================================================
// Quota Backoff Initialization & SPA Cleanup
// ============================================================================

/**
 * Initialize the QuotaBackoffManager singleton, set save/resume callbacks,
 * mount the countdown overlay UI, and expose a debug helper on window.
 */
export function initQuotaBackoff(): void {
    const manager = initQuotaBackoffManager();

    manager.setCallbacks({
        onSaveSession: async (filename: string) => {
            saveSessionToFileAutomatic(filename);
        },
        onResumePipeline: async () => {
            await resumeSolutionPoolIterations();
        },
    });

    mountQuotaCountdownUI();

    // Console helpers — accessible from the browser devtools:
    //   __deepthinkQuota          → current snapshot (state, msUntilReset, etc.)
    //   __deepthinkQuotaManager   → full manager (updateConfig, resumeNow, etc.)
    //   __deepthinkForceJudge()   → skip to final judge with solutions collected so far
    Object.defineProperty(window, '__deepthinkQuota', {
        get: () => getQuotaBackoffManager().getSnapshot(),
        configurable: true,
    });
    Object.defineProperty(window, '__deepthinkQuotaManager', {
        get: () => getQuotaBackoffManager(),
        configurable: true,
    });
    (window as any).__deepthinkForceJudge = () => {
        const pipeline = getActiveDeepthinkPipeline();
        if (!pipeline) {
            console.warn('[ForceJudge] No active pipeline found.');
            return;
        }
        if (pipeline.isResumeActive) {
            // resumeSolutionPoolIterations is actively running — set flags and let it abort
            console.log('[ForceJudge] Resume in progress — stopping in-flight work and jumping to final judge...');
            pipeline.skipToFinalJudgeRequested = true;
            pipeline.isStopRequested = true;
        } else {
            // Nothing running (loaded from file, idle, paused, etc.) — call judge directly
            console.log('[ForceJudge] No active resume — running final judge directly with available solutions...');
            runFinalJudge(pipeline, pipeline.challengeText).catch(err => {
                console.error('[ForceJudge] Final judge failed:', err);
            });
        }
    };
}

/**
 * Tear down quota backoff resources to prevent DOM/timer leaks during SPA
 * navigation away from the Deepthink view.
 */
export function cleanupQuotaBackoff(): void {
    unmountQuotaCountdownUI();
    getQuotaBackoffManager().fullReset();
}

// ============================================================================ 
// Modal Logic (React-rendered)
// ============================================================================ 

function ensureModalContainer(): HTMLElement {
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'deepthink-modal-portal';
        document.body.appendChild(modalContainer);
    }
    return modalContainer;
}

function mountModal(element: React.ReactElement): void {
    const container = ensureModalContainer();
    unmountModal(); // Use the safe async unmount function instead of synchronous unmount
    modalRoot = createRoot(container);
    modalRoot.render(element);
}

function unmountModal(): void {
    if (modalRoot) {
        const rootToUnmount = modalRoot;
        modalRoot = null;
        // Schedule unmount to avoid React 18 synchronous unmount race condition
        setTimeout(() => {
            rootToUnmount.unmount();
        }, 0);
    }
    activeSolutionModalSubStrategyId = null;
    if (cleanupIterativeCorrectionsRoot) cleanupIterativeCorrectionsRoot();
}

export async function openDeepthinkSolutionModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const subStrategy = pipeline?.initialStrategies.flatMap(ms => ms.subStrategies).find(ss => ss.id === subStrategyId);
    if (!subStrategy) return;

    const iterativeCorrectionsEnabled = moduleState.getIterativeCorrectionsEnabled();

    if (iterativeCorrectionsEnabled) {
        activeSolutionModalSubStrategyId = subStrategyId;

        // For iterative corrections, we keep the imperative approach because it uses
        // the external ContextualUI component which has its own rendering lifecycle
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'solution-modal-overlay';
        overlay.style.display = 'flex';

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');

        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h2');
        title.className = 'modal-title';
        title.textContent = 'Iterative Corrections';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-button';
        closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.padding = '0';
        body.style.height = 'calc(100vh - 80px)';
        body.style.overflow = 'hidden';
        body.classList.add('contextual-mode-container');

        content.appendChild(header);
        content.appendChild(body);
        overlay.appendChild(content);
        document.body.appendChild(overlay);

        const cleanup = () => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            activeSolutionModalSubStrategyId = null;
            cleanupIterativeCorrectionsRoot();
        };
        const close = () => { overlay.classList.remove('is-visible'); setTimeout(cleanup, 200); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', onKey);
        (overlay as any).cleanup = () => document.removeEventListener('keydown', onKey);
        setTimeout(() => overlay.classList.add('is-visible'), 10);

        await updateSolutionModalContent(body, subStrategyId);
    } else {
        // Non-iterative: mount React components
        const close = () => unmountModal();
        mountModal(
            React.createElement(BaseModal, {
                title: 'Solution Details',
                onClose: close,
                children: React.createElement(DefaultSolutionUI, {
                    subStrategy,
                    refinementEnabled: moduleState.getRefinementEnabled(),
                })
            })
        );
    }
}

export function closeSolutionModal() {
    const modalOverlay = document.getElementById('solution-modal-overlay');
    if (modalOverlay) {
        modalOverlay.click();
    }
    unmountModal();
}

export async function openSubStrategySolutionModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;

    if (moduleState.getIterativeCorrectionsEnabled()) {
        await openDeepthinkSolutionModal(subStrategyId);
        return;
    }

    const subStrategy = pipeline.initialStrategies.flatMap(s => s.subStrategies).find(sub => sub.id === subStrategyId);
    if (!subStrategy) return;

    const close = () => unmountModal();
    mountModal(
        React.createElement(BaseModal, {
            title: 'Sub-Strategy Solution',
            className: 'fullscreen-modal',
            onClose: close,
            children: React.createElement(SubStrategyComparisonUI, {
                subStrategy,
                refinementEnabled: moduleState.getRefinementEnabled(),
                escapeHtml: moduleState.escapeHtml,
            })
        })
    );
}

export function openCritiqueModal(critiqueId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const critique = pipeline?.solutionCritiques.find(c => c.id === critiqueId);
    if (!critique || document.querySelector('.embedded-modal-overlay')) return;

    const close = () => unmountModal();
    mountModal(
        React.createElement(BaseModal, {
            title: 'Solution Critique',
            isEmbedded: true,
            onClose: close,
            children: React.createElement(EmbeddedModalContent, {
                content: critique.critiqueResponse || 'No critique available',
            })
        })
    );
}

export function openSubStrategyCritiqueModal(subStrategyId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    if (document.querySelector('.embedded-modal-overlay')) return;

    let subStrategy: any = null;
    let mainStrategyId = '';
    for (const strategy of pipeline?.initialStrategies ?? []) {
        subStrategy = strategy.subStrategies.find(sub => sub.id === subStrategyId);
        if (subStrategy) { mainStrategyId = strategy.id; break; }
    }
    if (!subStrategy?.solutionCritique) return;

    const close = () => unmountModal();
    mountModal(
        React.createElement(BaseModal, {
            title: `Solution Critique - ${mainStrategyId}`,
            isEmbedded: true,
            onClose: close,
            children: React.createElement(EmbeddedModalContent, {
                content: subStrategy.solutionCritique,
            })
        })
    );
}

export function openHypothesisArgumentModal(hypothesisId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    const hypothesis = pipeline?.hypotheses.find(h => h.id === hypothesisId);
    if (!hypothesis || document.querySelector('.embedded-modal-overlay')) return;

    const close = () => unmountModal();
    mountModal(
        React.createElement(BaseModal, {
            title: 'Hypothesis Argument',
            isEmbedded: true,
            onClose: close,
            children: React.createElement(EmbeddedModalContent, {
                content: hypothesis.testerAttempt || 'No argument available',
                contentClass: 'hypothesis-argument-content',
            })
        })
    );
}

export function openRedTeamReasoningModal(agent: any) {
    if (document.querySelector('.embedded-modal-overlay')) return;

    let reasoningData: any = {};
    try {
        reasoningData = typeof agent.reasoning === 'string' ? JSON.parse(agent.reasoning) : agent.reasoning;
    } catch { reasoningData = { raw: agent.reasoning }; }

    const close = () => unmountModal();
    mountModal(
        React.createElement(BaseModal, {
            title: `Red Team Agent ${agent.id} - Evaluation`,
            isEmbedded: true,
            onClose: close,
            children: React.createElement(RedTeamReasoningContent, { agent, reasoningData })
        })
    );
}

export function openPostQualityFilterModal(agent: any) {
    if (document.querySelector('.embedded-modal-overlay')) return;

    const close = () => unmountModal();
    mountModal(
        React.createElement(BaseModal, {
            title: `PostQualityFilter Iteration ${agent.iterationNumber} - Analysis`,
            isEmbedded: true,
            onClose: close,
            children: React.createElement(EmbeddedModalContent, {
                content: agent.reasoning || 'No analysis available',
            })
        })
    );
}

// Update active modal content dynamically (for iterative corrections)
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

// ============================================================================ 
// Event Handling
// ============================================================================ 

export function activateDeepthinkStrategyTab(strategyIndex: number) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;
    pipeline.activeStrategyTab = strategyIndex;
    renderActiveDeepthinkPipeline();
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

    const closest = (cls: string) => target.closest('.' + cls) as HTMLElement;

    if (closest('sub-tab-button')) {
        const idxAttr = closest('sub-tab-button').getAttribute('data-strategy-index');
        if (idxAttr !== null) {
            pipeline.activeStrategyTab = parseInt(idxAttr);
            renderActiveDeepthinkPipeline();
        }
        return;
    }

    if (closest('view-solution-button')) {
        event.preventDefault(); event.stopPropagation();
        const id = closest('view-solution-button').getAttribute('data-sub-strategy-id');
        if (id) openSubStrategySolutionModal(id);
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

// ============================================================================ 
// Main Pipeline Render
// ============================================================================ 

export function renderActiveDeepthinkPipeline() {
    const deepthinkProcess = getActiveDeepthinkPipeline();
    const { tabsNavContainer, pipelinesContentContainer } = moduleState;

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

    // Unmount existing React content root ONLY if the container is different (which shouldn't happen)
    // We want to reuse the root for React 18 update semantics to avoid synchronous unmount errors

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
        { id: 'red-team', label: 'Red Team', icon: 'security', visible: isRedTeamEnabled || hasPostQualityFilter },
        { id: 'final-result', label: 'Final Result', icon: 'flag', visible: true, alignRight: true }
    ].filter(t => t.visible);

    if (!tabs.some(t => t.id === deepthinkProcess.activeTabId) && tabs.length > 0) {
        deepthinkProcess.activeTabId = tabs[0].id;
    }

    // Render Tab buttons (imperative — lightweight DOM, React overhead not needed here)
    tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.id = `deepthink-tab-${tab.id}`;
        const statusClass = getTabStatusClass(tab.id, deepthinkProcess);

        btn.className = `tab-button deepthink-mode-tab ${deepthinkProcess.activeTabId === tab.id ? 'active' : ''} ${statusClass} ${(tab as any).alignRight ? 'align-right' : ''}`;
        btn.innerHTML = `<span class="material-symbols-outlined">${tab.icon}</span>${tab.label}`;
        btn.addEventListener('click', () => {
            deepthinkProcess.activeTabId = tab.id;
            renderActiveDeepthinkPipeline();
        });
        moduleState.tabsNavContainer!.appendChild(btn);
    });

    // Session save button (always visible when pipeline exists)
    const saveBtn = document.createElement('button');
    saveBtn.className = 'tab-button deepthink-mode-tab deepthink-session-btn align-right';
    saveBtn.title = 'Save session to file';
    saveBtn.innerHTML = '<span class="material-symbols-outlined">download</span>';
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveSessionToFile();
    });
    moduleState.tabsNavContainer!.appendChild(saveBtn);

    // Mount or update React content root
    const contentContainer = moduleState.pipelinesContentContainer!;

    // Unmount explicitly if the DOM node was wiped by the AppRouter
    if (pipelineContentRoot && pipelineContentContainerNode && !document.contains(pipelineContentContainerNode)) {
        const oldRoot = pipelineContentRoot;
        setTimeout(() => oldRoot.unmount(), 0);
        pipelineContentRoot = null;
        pipelineContentContainerNode = null;
    }

    if (!pipelineContentRoot) {
        contentContainer.innerHTML = '';
        pipelineContentContainerNode = document.createElement('div');
        pipelineContentContainerNode.className = 'deepthink-pipeline-react-root';
        contentContainer.appendChild(pipelineContentContainerNode);

        pipelineContentRoot = createRoot(pipelineContentContainerNode);
    }

    const tabContent = renderTabContent(deepthinkProcess);
    pipelineContentRoot.render(tabContent);

    addDeepthinkEventHandlers();
}

function renderTabContent(process: DeepthinkPipelineState): React.ReactElement {
    switch (process.activeTabId) {
        case 'strategic-solver':
            return React.createElement(StrategicSolverTab, {
                process,
                escapeHtml: moduleState.escapeHtml,
                onStrategyTabClick: (idx: number) => {
                    process.activeStrategyTab = idx;
                    renderActiveDeepthinkPipeline();
                },
                onViewSolution: (id: string) => openSubStrategySolutionModal(id),
            });
        case 'hypothesis-explorer':
            return React.createElement(HypothesisExplorerTab, {
                process,
                escapeHtml: moduleState.escapeHtml,
                onViewArgument: (id: string) => openHypothesisArgumentModal(id),
            });
        case 'solution-pool':
            return React.createElement(SolutionPoolTabContent, { process });
        case 'dissected-observations':
            return React.createElement(DissectedObservationsTab, {
                process,
                refinementEnabled: moduleState.getRefinementEnabled(),
                iterativeCorrectionsEnabled: moduleState.getIterativeCorrectionsEnabled(),
                onViewCritique: (id: string) => openCritiqueModal(id),
                onViewSubStrategyCritique: (id: string) => openSubStrategyCritiqueModal(id),
            });
        case 'red-team':
            return React.createElement(RedTeamTab, {
                process,
                onViewReasoning: (id: string) => {
                    const rtAgent = process.redTeamEvaluations.find(a => a.id === id);
                    if (rtAgent?.reasoning) { openRedTeamReasoningModal(rtAgent); return; }
                    const pqfAgent = process.postQualityFilterAgents.find(a => a.id === id);
                    if (pqfAgent?.reasoning) openPostQualityFilterModal(pqfAgent);
                },
            });
        case 'final-result':
            return React.createElement(FinalResultTab, {
                process,
                escapeHtml: moduleState.escapeHtml,
            });
        default:
            return React.createElement(StrategicSolverTab, {
                process,
                escapeHtml: moduleState.escapeHtml,
                onStrategyTabClick: (idx: number) => {
                    process.activeStrategyTab = idx;
                    renderActiveDeepthinkPipeline();
                },
                onViewSolution: (id: string) => openSubStrategySolutionModal(id),
            });
    }
}

// ============================================================================ 
// Tab Status Helper
// ============================================================================ 

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

// ============================================================================ 
// Backward-Compatible HTML String Adapters
// Used by AdaptiveDeepthinkMode.tsx which still renders via innerHTML.
// These will be removed once AdaptiveDeepthink is migrated to React.
// ============================================================================ 

export function renderStrategicSolverContent(process: DeepthinkPipelineState): string {
    return renderToStaticMarkup(
        React.createElement(StrategicSolverTab, {
            process,
            escapeHtml: moduleState.escapeHtml,
            onStrategyTabClick: () => { },
            onViewSolution: () => { },
        })
    );
}

export function renderHypothesisExplorerContent(process: DeepthinkPipelineState): string {
    return renderToStaticMarkup(
        React.createElement(HypothesisExplorerTab, {
            process,
            escapeHtml: moduleState.escapeHtml,
            onViewArgument: () => { },
        })
    );
}

export function renderDissectedObservationsContent(process: DeepthinkPipelineState): string {
    return renderToStaticMarkup(
        React.createElement(DissectedObservationsTab, {
            process,
            refinementEnabled: moduleState.getRefinementEnabled(),
            iterativeCorrectionsEnabled: moduleState.getIterativeCorrectionsEnabled(),
            onViewCritique: () => { },
            onViewSubStrategyCritique: () => { },
        })
    );
}

export function renderRedTeamContent(process: DeepthinkPipelineState): string {
    return renderToStaticMarkup(
        React.createElement(RedTeamTab, {
            process,
            onViewReasoning: () => { },
        })
    );
}

export function renderFinalResultContent(process: DeepthinkPipelineState): string {
    return renderToStaticMarkup(
        React.createElement(FinalResultTab, {
            process,
            escapeHtml: moduleState.escapeHtml,
        })
    );
}
