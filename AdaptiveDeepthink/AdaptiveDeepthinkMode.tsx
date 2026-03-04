/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Adaptive Deepthink Mode - UI Integration using Agentic components
 * Uses REAL Deepthink rendering functions and styles from index.css
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AgenticState } from '../Agentic/AgenticCore';
import { AgentActivityPanel } from '../Agentic/AgenticUI';
import { renderMathContent } from '../Styles/Components/RenderMathMarkdownLogic';
import {
    AdaptiveDeepthinkStoreState,
    subscribeToAdaptiveDeepthinkState,
    getAdaptiveDeepthinkState,
    stopAdaptiveDeepthinkProcess,
    updateAdaptiveDeepthinkTab,
    updateAdaptiveDeepthinkStrategyTab
} from './AdaptiveDeepthink';
import {
    renderStrategicSolverContent,
    renderHypothesisExplorerContent,
    renderDissectedObservationsContent,
    renderRedTeamContent,
    renderFinalResultContent,
    setActiveDeepthinkPipelineForImport
} from '../Deepthink/Deepthink';

const rootMap = new WeakMap<HTMLElement, any>();

const DeepthinkEmbeddedPanel: React.FC<{ state: AdaptiveDeepthinkStoreState }> = ({ state }) => {
    const pipelineState = state.deepthinkPipelineState;
    const currentTab = state.navigationState.currentTab;

    // Keep Deepthink module in sync with current pipeline state so modals render correctly
    setActiveDeepthinkPipelineForImport(pipelineState);

    const allTabs = [
        { id: 'strategic-solver', label: 'Strategic Solver', icon: 'psychology', alwaysShow: true },
        { id: 'hypothesis-explorer', label: 'Hypothesis Explorer', icon: 'science', alwaysShow: true },
        { id: 'dissected-observations', label: 'Dissected Observations', icon: 'troubleshoot', alwaysShow: true },
        { id: 'red-team', label: 'Red Team', icon: 'security', hasPinkGlow: true, alwaysShow: true },
        { id: 'final-result', label: 'Final Result', icon: 'flag', alignRight: true, alwaysShow: true }
    ];

    // Ensure the active tab is valid
    const isActiveTabValid = allTabs.some(tab => tab.id === currentTab);
    if (!isActiveTabValid && allTabs.length > 0) {
        // Just fail safe visually if state is out of sync; state updates via actions
    }

    const handleSidebarToggle = () => {
        const sidebar = document.getElementById('controls-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
        }
    };

    const handleDelegatedClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;

        // Handle sub-tab navigation
        const subTabBtn = target.closest('.sub-tab-button');
        if (subTabBtn) {
            e.preventDefault();
            e.stopPropagation();
            const strategyIndex = parseInt(subTabBtn.getAttribute('data-strategy-index') || '0');
            updateAdaptiveDeepthinkStrategyTab(strategyIndex);
            return;
        }

        // Handle show more/less buttons
        const showMoreBtn = target.closest('.show-more-btn');
        if (showMoreBtn) {
            e.preventDefault();
            e.stopPropagation();

            const btn = showMoreBtn as HTMLElement;
            const targetType = btn.getAttribute('data-target');
            let textDiv: HTMLElement | null = null;
            let textContainer: HTMLElement | null = null;

            if (targetType === 'sub-strategy') {
                textContainer = btn.closest('.sub-strategy-content-wrapper');
                textDiv = textContainer?.querySelector('.sub-strategy-text') as HTMLElement;
            } else if (targetType === 'hypothesis') {
                textContainer = btn.closest('.hypothesis-text-container');
                textDiv = textContainer?.querySelector('.hypothesis-text') as HTMLElement;
            } else if (targetType === 'strategy') {
                textContainer = btn.closest('.strategy-text-container');
                textDiv = textContainer?.querySelector('.strategy-text') as HTMLElement;
            }

            if (textDiv && textContainer) {
                const fullText = textDiv.getAttribute('data-full-text');
                if (fullText) {
                    let truncateLength = 200;
                    if (targetType === 'sub-strategy' || targetType === 'hypothesis') {
                        truncateLength = 150;
                    }

                    if (btn.textContent === 'Show More') {
                        textDiv.innerHTML = renderMathContent(fullText);
                        btn.textContent = 'Show Less';

                        if (targetType === 'sub-strategy') {
                            const subTextContainer = textContainer.querySelector('.sub-strategy-text-container') as HTMLElement;
                            if (subTextContainer) subTextContainer.classList.add('expanded');
                            const card = btn.closest('.red-team-agent-card') as HTMLElement;
                            if (card) card.classList.add('expanded');
                        }
                        if (targetType === 'hypothesis') {
                            const hypothesisCard = btn.closest('.hypothesis-card') as HTMLElement;
                            if (hypothesisCard) hypothesisCard.classList.add('expanded');
                        }
                        if (targetType === 'strategy') {
                            const strategyContent = textContainer.querySelector('.strategy-content') as HTMLElement;
                            if (strategyContent) strategyContent.classList.add('expanded');
                        }
                    } else {
                        const truncatedText = fullText.substring(0, truncateLength) + '...';
                        textDiv.innerHTML = renderMathContent(truncatedText);
                        btn.textContent = 'Show More';

                        if (targetType === 'sub-strategy') {
                            const subTextContainer = textContainer.querySelector('.sub-strategy-text-container') as HTMLElement;
                            if (subTextContainer) subTextContainer.classList.remove('expanded');
                            const card = btn.closest('.red-team-agent-card') as HTMLElement;
                            if (card) card.classList.remove('expanded');
                        }
                        if (targetType === 'hypothesis') {
                            const hypothesisCard = btn.closest('.hypothesis-card') as HTMLElement;
                            if (hypothesisCard) hypothesisCard.classList.remove('expanded');
                        }
                        if (targetType === 'strategy') {
                            const strategyContent = textContainer.querySelector('.strategy-content') as HTMLElement;
                            if (strategyContent) strategyContent.classList.remove('expanded');
                        }
                    }
                }
            }
        }
    };

    const getHtmlContent = () => {
        switch (currentTab) {
            case 'strategic-solver': return renderStrategicSolverContent(pipelineState);
            case 'hypothesis-explorer': return renderHypothesisExplorerContent(pipelineState);
            case 'dissected-observations': return renderDissectedObservationsContent(pipelineState);
            case 'red-team': return renderRedTeamContent(pipelineState);
            case 'final-result': return renderFinalResultContent(pipelineState);
            default: return '';
        }
    };

    return (
        <div className="adaptive-deepthink-embedded-panel">
            <div className="tabs-nav-container">
                <button
                    className="tab-button deepthink-mode-tab sidebar-toggle-button"
                    onClick={handleSidebarToggle}
                    title="Toggle Sidebar"
                >
                    <span className="material-symbols-outlined">dock_to_right</span>
                </button>
                {allTabs.map(tab => {
                    let statusClass = '';
                    if (tab.id === 'strategic-solver' && pipelineState.initialStrategies.length > 0) {
                        if (pipelineState.status === 'error') statusClass = 'status-deepthink-error';
                        else if (pipelineState.initialStrategies.some(s => s.status === 'completed')) statusClass = 'status-deepthink-completed';
                        else if (pipelineState.initialStrategies.some(s => s.status === 'processing')) statusClass = 'status-deepthink-processing';
                    } else if (tab.id === 'hypothesis-explorer' && pipelineState.hypothesisExplorerComplete) {
                        statusClass = 'status-deepthink-completed';
                    } else if (tab.id === 'dissected-observations') {
                        if (pipelineState.dissectedSynthesisStatus === 'completed') statusClass = 'status-deepthink-completed';
                        else if (pipelineState.dissectedSynthesisStatus === 'error') statusClass = 'status-deepthink-error';
                        else if (pipelineState.dissectedSynthesisStatus === 'processing' || pipelineState.solutionCritiquesStatus === 'processing') statusClass = 'status-deepthink-processing';
                    } else if (tab.id === 'red-team' && pipelineState.redTeamComplete) {
                        statusClass = 'status-deepthink-completed';
                    } else if (tab.id === 'final-result' && pipelineState.finalJudgingStatus) {
                        if (pipelineState.finalJudgingStatus === 'completed') statusClass = 'status-deepthink-completed';
                        else if (pipelineState.finalJudgingStatus === 'error') statusClass = 'status-deepthink-error';
                        else if (pipelineState.finalJudgingStatus === 'processing') statusClass = 'status-deepthink-processing';
                    }

                    return (
                        <button
                            key={tab.id}
                            id={`deepthink-tab-${tab.id}`}
                            className={`tab-button deepthink-mode-tab ${currentTab === tab.id ? 'active' : ''} ${statusClass} ${tab.hasPinkGlow ? 'red-team-pink-glow' : ''} ${tab.alignRight ? 'align-right' : ''}`}
                            onClick={() => updateAdaptiveDeepthinkTab(tab.id)}
                        >
                            <span className="material-symbols-outlined">{tab.icon}</span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>
            <div
                className="pipelines-content-container"
                onClick={handleDelegatedClick}
                dangerouslySetInnerHTML={{ __html: getHtmlContent() }}
            />
        </div>
    );
};

const AdaptiveDeepthinkUIView: React.FC = () => {
    const [state, setState] = useState<AdaptiveDeepthinkStoreState | null>(getAdaptiveDeepthinkState());

    useEffect(() => {
        return subscribeToAdaptiveDeepthinkState(setState);
    }, []);

    if (!state) return null;

    const agenticState: AgenticState = {
        id: state.id,
        currentContent: state.coreState.question,
        originalContent: state.coreState.question,
        messages: state.messages,
        contentHistory: [],
        isProcessing: state.isProcessing,
        isComplete: state.isComplete,
        error: state.error,
        streamBuffer: ''
    };

    return (
        <div className="adaptive-deepthink-ui-container">
            <DeepthinkEmbeddedPanel state={state} />
            <div className="adaptive-deepthink-agent-panel-wrapper">
                <AgentActivityPanel state={agenticState} onStop={stopAdaptiveDeepthinkProcess} />
            </div>
        </div>
    );
};

// Render function
export function renderAdaptiveDeepthinkMode() {
    const container = document.getElementById('pipelines-content-container');
    const tabsContainer = document.getElementById('tabs-nav-container');
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;

    if (!container || !tabsContainer) return;

    // Clear existing content manually on mount because it isn't managed by this React root yet
    tabsContainer.innerHTML = '';
    container.innerHTML = '';

    if (mainHeaderContent) {
        mainHeaderContent.style.display = 'none';
    }

    container.style.height = '100%';
    container.style.overflow = 'hidden';
    container.style.padding = '0';

    const adaptiveDeepthinkContainer = document.createElement('div');
    adaptiveDeepthinkContainer.id = 'adaptive-deepthink-container';
    adaptiveDeepthinkContainer.className = 'pipeline-content active';
    adaptiveDeepthinkContainer.style.height = '100%';
    adaptiveDeepthinkContainer.style.display = 'flex';
    adaptiveDeepthinkContainer.style.flexDirection = 'column';
    container.appendChild(adaptiveDeepthinkContainer);

    let root = rootMap.get(container);
    if (!root) {
        root = ReactDOM.createRoot(adaptiveDeepthinkContainer);
        rootMap.set(container, root);
    }

    root.render(<AdaptiveDeepthinkUIView />);
}

// Re-export methods for UI actions that were previously exposed natively
export {
    startAdaptiveDeepthinkProcess,
    stopAdaptiveDeepthinkProcess,
    cleanupAdaptiveDeepthinkMode,
    getAdaptiveDeepthinkState,
    setAdaptiveDeepthinkStateForImport
} from './AdaptiveDeepthink';
