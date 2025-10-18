/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Adaptive Deepthink Mode - UI Integration using Agentic components
 * Uses REAL Deepthink rendering functions and styles from index.css
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AgenticState, AgenticMessage, SystemBlock } from '../Agentic/AgenticCore';
import { AgentActivityPanel } from '../Agentic/AgenticUI';
import { renderMathContent } from '../Components/RenderMathMarkdown';
import {
    AdaptiveDeepthinkState,
    AdaptiveDeepthinkConversationManager,
    AdaptiveDeepthinkToolCall,
    parseAdaptiveDeepthinkResponse,
    executeAdaptiveDeepthinkTool
} from './AdaptiveDeepthinkCore';
import { CustomizablePromptsAdaptiveDeepthink } from './AdaptiveDeepthinkPrompt';
import { AgentExecutionContext } from '../Deepthink/DeepthinkAgents';
import { 
    callAI, 
    getSelectedModel, 
    getSelectedTemperature, 
    getSelectedTopP
} from '../Routing';
import { updateControlsState } from '../index';
import type {
    DeepthinkPipelineState,
    DeepthinkMainStrategyData,
    DeepthinkSubStrategyData,
    DeepthinkHypothesisData
} from '../Deepthink/Deepthink';
import {
    renderStrategicSolverContent,
    renderHypothesisExplorerContent,
    renderDissectedObservationsContent,
    renderRedTeamContent,
    renderFinalResultContent,
    setActiveDeepthinkPipelineForImport
} from '../Deepthink/Deepthink';

// Track React roots by container to prevent duplicate root creation
const rootMap = new WeakMap<HTMLElement, any>();

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000;
const BACKOFF_FACTOR = 4;

// Global state for Adaptive Deepthink mode
let activeAdaptiveDeepthinkState: AdaptiveDeepthinkUIState | null = null;
let adaptiveDeepthinkUIRoot: any = null;
let isAdaptiveDeepthinkRunning = false;
let abortController: AbortController | null = null;

// UI State that wraps the core state with display-friendly structure
interface AdaptiveDeepthinkUIState {
    id: string;
    coreState: AdaptiveDeepthinkState;
    conversationManager: AdaptiveDeepthinkConversationManager;
    messages: AgenticMessage[]; // Reuse Agentic message structure
    isProcessing: boolean;
    isComplete: boolean;
    error?: string;
    // Deepthink pipeline state for rendering the real Deepthink UI
    deepthinkPipelineState: DeepthinkPipelineState;
    // Navigation state
    navigationState: {
        currentTab: string;
    };
}

// Helper to generate stable message IDs
function newMsgId(prefix: string = 'msg'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Helper to get agent name from tool type
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

// Helper to get icon for agent type
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

// Helper to format tool call for display
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

// Segment type for UI rendering
interface ResponseSegment {
    kind: 'text' | 'tool';
    text?: string;
    tool?: {
        type: string;
        rawType: string;
    };
}

// Parse agent response into segments (narrative + tool calls)
// Note: narrative is already cleaned by the backend parser
function parseIntoSegments(narrative: string, toolCalls: AdaptiveDeepthinkToolCall[]): ResponseSegment[] {
    const segments: ResponseSegment[] = [];
    
    // Add narrative as text segment if not empty
    if (narrative && narrative.trim()) {
        segments.push({ kind: 'text', text: narrative.trim() });
    }
    
    // Add tool call as a segment (only first tool call, as per orchestrator rules)
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

// Left panel showing embedded REAL Deepthink UI with REAL tabs
const DeepthinkEmbeddedPanel: React.FC<{ state: AdaptiveDeepthinkUIState }> = ({ state }) => {
    const tabsRef = React.useRef<HTMLDivElement>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const [updateTrigger, setUpdateTrigger] = React.useState(0);

    const pipelineState = state.deepthinkPipelineState;
    const currentTab = state.navigationState.currentTab;
    
    // Force update when state changes externally
    React.useEffect(() => {
        setUpdateTrigger(prev => prev + 1);
    }, [state]);

    // Render REAL Deepthink tabs and content
    React.useEffect(() => {
        if (!tabsRef.current || !containerRef.current) return;

        // Keep Deepthink module in sync with current pipeline state so modals render correctly
        setActiveDeepthinkPipelineForImport(pipelineState);

        // Clear existing
        tabsRef.current.innerHTML = '';
        containerRef.current.innerHTML = '';

        // In Adaptive Deepthink, the AGENT decides which tools to use
        // All tabs should always be available based on actual pipeline data, not user config
        const allTabs = [
            { id: 'strategic-solver', label: 'Strategic Solver', icon: 'psychology', alwaysShow: true },
            { id: 'hypothesis-explorer', label: 'Hypothesis Explorer', icon: 'science', alwaysShow: true },
            { id: 'dissected-observations', label: 'Dissected Observations', icon: 'troubleshoot', alwaysShow: true },
            { id: 'red-team', label: 'Red Team', icon: 'security', hasPinkGlow: true, alwaysShow: true },
            { id: 'final-result', label: 'Final Result', icon: 'flag', alignRight: true, alwaysShow: true }
        ];

        // All tabs are always enabled for Adaptive Deepthink
        const tabs = allTabs;

        // Ensure the active tab is valid - if current active tab is disabled, switch to first available tab
        const isActiveTabValid = tabs.some(tab => tab.id === currentTab);
        if (!isActiveTabValid && tabs.length > 0) {
            state.navigationState.currentTab = tabs[0].id;
            state.deepthinkPipelineState.activeTabId = tabs[0].id;
        }

        // Add sidebar collapse/expand button FIRST (match main sidebar button)
        const sidebarButton = document.createElement('button');
        sidebarButton.className = 'tab-button deepthink-mode-tab sidebar-toggle-button';
        sidebarButton.innerHTML = `<span class="material-symbols-outlined">dock_to_right</span>`;
        sidebarButton.title = 'Collapse Sidebar';
        sidebarButton.addEventListener('click', () => {
            const sidebar = document.getElementById('controls-sidebar');
            if (sidebar) {
                const isCollapsed = sidebar.classList.contains('collapsed');
                if (isCollapsed) {
                    sidebar.classList.remove('collapsed');
                    sidebarButton.innerHTML = `<span class="material-symbols-outlined">dock_to_right</span>`;
                    sidebarButton.title = 'Collapse Sidebar';
                } else {
                    sidebar.classList.add('collapsed');
                    sidebarButton.innerHTML = `<span class="material-symbols-outlined">chevron_right</span>`;
                    sidebarButton.title = 'Expand Sidebar';
                }
            }
        });
        tabsRef.current!.appendChild(sidebarButton);
        
        tabs.forEach(tab => {
            const tabButton = document.createElement('button');
            
            // Determine status class based on pipeline state (REAL logic from Deepthink)
            let statusClass = '';
            if (tab.id === 'strategic-solver' && pipelineState.initialStrategies.length > 0) {
                if (pipelineState.status === 'error') {
                    statusClass = 'status-deepthink-error';
                } else if (pipelineState.initialStrategies.some(s => s.status === 'completed')) {
                    statusClass = 'status-deepthink-completed';
                } else if (pipelineState.initialStrategies.some(s => s.status === 'processing')) {
                    statusClass = 'status-deepthink-processing';
                }
            } else if (tab.id === 'hypothesis-explorer' && pipelineState.hypothesisExplorerComplete) {
                statusClass = 'status-deepthink-completed';
            } else if (tab.id === 'dissected-observations') {
                if (pipelineState.dissectedSynthesisStatus === 'completed') {
                    statusClass = 'status-deepthink-completed';
                } else if (pipelineState.dissectedSynthesisStatus === 'error') {
                    statusClass = 'status-deepthink-error';
                } else if (pipelineState.dissectedSynthesisStatus === 'processing' || pipelineState.solutionCritiquesStatus === 'processing') {
                    statusClass = 'status-deepthink-processing';
                }
            } else if (tab.id === 'red-team' && pipelineState.redTeamComplete) {
                statusClass = 'status-deepthink-completed';
            } else if (tab.id === 'final-result' && pipelineState.finalJudgingStatus) {
                if (pipelineState.finalJudgingStatus === 'completed') {
                    statusClass = 'status-deepthink-completed';
                } else if (pipelineState.finalJudgingStatus === 'error') {
                    statusClass = 'status-deepthink-error';
                } else if (pipelineState.finalJudgingStatus === 'processing') {
                    statusClass = 'status-deepthink-processing';
                }
            }
            
            tabButton.className = `tab-button deepthink-mode-tab ${pipelineState.activeTabId === tab.id ? 'active' : ''} ${statusClass} ${tab.hasPinkGlow ? 'red-team-pink-glow' : ''} ${tab.alignRight ? 'align-right' : ''}`;
            tabButton.innerHTML = `<span class="material-symbols-outlined">${tab.icon}</span>${tab.label}`;
            tabButton.dataset.tab = tab.id;
            
            // Allow user to click tabs
            tabButton.addEventListener('click', () => {
                state.navigationState.currentTab = tab.id;
                state.deepthinkPipelineState.activeTabId = tab.id;
                setUpdateTrigger(prev => prev + 1);
            });
            
            tabsRef.current!.appendChild(tabButton);
        });

        // Render content using REAL Deepthink functions
        const contentDiv = document.createElement('div');
        contentDiv.className = 'tab-content deepthink-tab-content';
        
        switch (currentTab) {
            case 'strategic-solver':
                contentDiv.innerHTML = renderStrategicSolverContent(pipelineState);
                break;
            case 'hypothesis-explorer':
                contentDiv.innerHTML = renderHypothesisExplorerContent(pipelineState);
                break;
            case 'dissected-observations':
                contentDiv.innerHTML = renderDissectedObservationsContent(pipelineState);
                break;
            case 'red-team':
                contentDiv.innerHTML = renderRedTeamContent(pipelineState);
                break;
            case 'final-result':
                contentDiv.innerHTML = renderFinalResultContent(pipelineState);
                break;
        }

        containerRef.current.appendChild(contentDiv);

        // Attach event handlers for interactive elements
        attachEmbeddedDeepthinkEventHandlers(contentDiv, pipelineState);
    }, [
        updateTrigger,
        pipelineState.initialStrategies.length,
        pipelineState.hypotheses.length,
        pipelineState.dissectedObservationsSynthesis,
        pipelineState.redTeamAgents.length,
        pipelineState.finalJudgedBestSolution,
        pipelineState.activeStrategyTab,
        pipelineState.hypothesisExplorerComplete,
        pipelineState.hypothesisGenStatus,
        pipelineState.dissectedSynthesisStatus,
        pipelineState.solutionCritiquesStatus,
        pipelineState.redTeamComplete,
        pipelineState.finalJudgingStatus,
        pipelineState.finalJudgedBestStrategyId,
        pipelineState.finalJudgingResponseText,
        pipelineState.status,
        pipelineState.solutionCritiques.length,
        pipelineState.redTeamStatus,
        currentTab,
        // Deep change detection
        JSON.stringify(pipelineState.initialStrategies.map(s => ({
            id: s.id,
            status: s.status,
            subCount: s.subStrategies.length,
            hasSolution: s.subStrategies.some(sub => sub.solutionAttempt || sub.refinedSolution),
            hasRefinedSolution: s.subStrategies.some(sub => sub.refinedSolution),
            isKilled: s.isKilledByRedTeam
        }))),
        JSON.stringify(pipelineState.hypotheses.map(h => ({
            id: h.id,
            hasTester: !!h.testerAttempt,
            testerStatus: h.testerStatus
        }))),
        JSON.stringify(pipelineState.redTeamAgents.map(r => ({
            id: r.id,
            status: r.status,
            killedCount: (r.killedStrategyIds?.length || 0) + (r.killedSubStrategyIds?.length || 0)
        })))
    ]);

    return (
        <div className="adaptive-deepthink-embedded-panel" ref={panelRef}>
            <div className="tabs-nav-container" ref={tabsRef}>
                {/* REAL Deepthink tabs rendered via DOM manipulation */}
            </div>
            <div className="pipelines-content-container" ref={containerRef}>
                {/* REAL Deepthink content rendered via DOM manipulation */}
            </div>
        </div>
    );
};

// Attach event handlers to embedded Deepthink UI elements
function attachEmbeddedDeepthinkEventHandlers(container: HTMLElement, pipelineState: DeepthinkPipelineState) {
    // Handle sub-tab navigation (switching between strategies)
    const subTabButtons = container.querySelectorAll('.sub-tab-button');
    subTabButtons.forEach((button) => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const strategyIndex = parseInt((button as HTMLElement).getAttribute('data-strategy-index') || '0');
            pipelineState.activeStrategyTab = strategyIndex;
            
            // Update active state
            subTabButtons.forEach((btn, idx) => {
                btn.classList.toggle('active', idx === strategyIndex);
            });
            
            // Re-render the content
            if (activeAdaptiveDeepthinkState) {
                updateAdaptiveDeepthinkUI(
                    adaptiveDeepthinkUIRoot,
                    activeAdaptiveDeepthinkState,
                    stopAdaptiveDeepthinkProcess
                );
            }
        });
    });
    
    // Handle show more/less buttons
    const showMoreButtons = container.querySelectorAll('.show-more-btn');
    showMoreButtons.forEach((button) => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const btn = button as HTMLElement;
            const targetType = btn.getAttribute('data-target');
            let textDiv: HTMLElement | null = null;
            let textContainer: HTMLElement | null = null;
            
            // Find the correct text div based on target type
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
                        
                        // For sub-strategies, expand the container
                        if (targetType === 'sub-strategy') {
                            const subTextContainer = textContainer.querySelector('.sub-strategy-text-container') as HTMLElement;
                            if (subTextContainer) {
                                subTextContainer.classList.add('expanded');
                            }
                            const card = btn.closest('.red-team-agent-card') as HTMLElement;
                            if (card) {
                                card.classList.add('expanded');
                            }
                        }
                        
                        // For hypotheses, expand the container
                        if (targetType === 'hypothesis') {
                            const hypothesisCard = btn.closest('.hypothesis-card') as HTMLElement;
                            if (hypothesisCard) {
                                hypothesisCard.classList.add('expanded');
                            }
                        }
                        
                        // For strategies, expand container
                        if (targetType === 'strategy') {
                            const strategyContent = textContainer.querySelector('.strategy-content') as HTMLElement;
                            if (strategyContent) {
                                strategyContent.classList.add('expanded');
                            }
                        }
                    } else {
                        // Show less
                        const truncatedText = fullText.substring(0, truncateLength) + '...';
                        textDiv.innerHTML = renderMathContent(truncatedText);
                        btn.textContent = 'Show More';
                        
                        // Collapse containers
                        if (targetType === 'sub-strategy') {
                            const subTextContainer = textContainer.querySelector('.sub-strategy-text-container') as HTMLElement;
                            if (subTextContainer) {
                                subTextContainer.classList.remove('expanded');
                            }
                            const card = btn.closest('.red-team-agent-card') as HTMLElement;
                            if (card) {
                                card.classList.remove('expanded');
                            }
                        }
                        
                        if (targetType === 'hypothesis') {
                            const hypothesisCard = btn.closest('.hypothesis-card') as HTMLElement;
                            if (hypothesisCard) {
                                hypothesisCard.classList.remove('expanded');
                            }
                        }
                        
                        if (targetType === 'strategy') {
                            const strategyContent = textContainer.querySelector('.strategy-content') as HTMLElement;
                            if (strategyContent) {
                                strategyContent.classList.remove('expanded');
                            }
                        }
                    }
                }
            }
        });
    });
}


// Main UI Component
const AdaptiveDeepthinkUI: React.FC<{ state: AdaptiveDeepthinkUIState; onStop: () => void }> = ({ state, onStop }) => {
    // Convert to AgenticState for compatibility with AgentActivityPanel
    // Use React.useMemo to ensure the object only changes when dependencies change
    const agenticState: AgenticState = React.useMemo(() => ({
        id: state.id,
        currentContent: state.coreState.question,
        originalContent: state.coreState.question,
        messages: state.messages,
        contentHistory: [],
        isProcessing: state.isProcessing,
        isComplete: state.isComplete,
        error: state.error,
        streamBuffer: ''
    }), [state.id, state.coreState.question, state.messages, state.isProcessing, state.isComplete, state.error]);

    return (
        <div className="adaptive-deepthink-ui-container">
            <DeepthinkEmbeddedPanel state={state} />
            <div className="adaptive-deepthink-agent-panel-wrapper">
                <AgentActivityPanel state={agenticState} onStop={onStop} />
            </div>
        </div>
    );
};

// Render function
export function renderAdaptiveDeepthinkUI(container: HTMLElement, state: AdaptiveDeepthinkUIState, onStop: () => void) {
    // Check if root already exists for this container
    let root = rootMap.get(container);
    if (!root) {
        root = ReactDOM.createRoot(container);
        rootMap.set(container, root);
    }
    
    root.render(<AdaptiveDeepthinkUI state={state} onStop={onStop} />);
    return root;
}

// Update function with synchronous rendering
export function updateAdaptiveDeepthinkUI(root: any, state: AdaptiveDeepthinkUIState, onStop: () => void) {
    flushSync(() => {
        root.render(<AdaptiveDeepthinkUI state={state} onStop={onStop} />);
    });
}

// Helper to force UI render
export async function forceAdaptiveDeepthinkUIRender() {
    return new Promise<void>(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}

// Initialize Deepthink pipeline state for embedded UI
function createInitialDeepthinkPipelineState(question: string): DeepthinkPipelineState {
    return {
        id: `deepthink-embedded-${Date.now()}`,
        challenge: question,
        status: 'processing',
        activeTabId: 'strategic-solver',
        activeStrategyTab: 0,
        initialStrategies: [],
        hypotheses: [],
        solutionCritiques: [],
        redTeamAgents: [],
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



// Parse tool execution result and update Deepthink state
function parseToolResultAndUpdateState(toolCall: AdaptiveDeepthinkToolCall, toolResult: string) {
    if (!activeAdaptiveDeepthinkState) return;

    const state = activeAdaptiveDeepthinkState.deepthinkPipelineState;

    switch (toolCall.type) {
        case 'GenerateStrategies': {
            // Clear existing strategies to prevent duplication if agent calls this tool twice
            state.initialStrategies = [];
            
            // Parse strategies from tool result
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
            // Clear existing hypotheses to prevent duplication if agent calls this tool twice
            state.hypotheses = [];
            
            // Parse hypotheses from tool result
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
            // Set hypothesis generation status
            state.hypothesisGenStatus = 'completed';
            break;
        }

        case 'TestHypotheses': {
            // Parse hypothesis testing results
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
            
            // Build knowledge packet
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
            // Clear all existing solutions from strategies to replace with new executions
            state.initialStrategies.forEach(strategy => {
                strategy.subStrategies.forEach(sub => {
                    sub.solutionAttempt = undefined;
                    sub.refinedSolution = undefined;
                });
            });
            
            // Parse strategy executions
            const executionMatches = toolResult.matchAll(/<Execution ID: (execution-strategy-\d+-\d+)>\s*([\s\S]*?)\s*<\/Execution ID: \1>/g);
            for (const match of executionMatches) {
                const executionId = match[1];
                const execution = match[2].trim();
                
                // Find the corresponding strategy and add as sub-strategy with solution
                const strategyIdMatch = executionId.match(/execution-(strategy-\d+-\d+)/);
                if (strategyIdMatch) {
                    const strategyId = strategyIdMatch[1];
                    const strategy = state.initialStrategies.find(s => s.id === strategyId);
                    if (strategy) {
                        // Create or update sub-strategy
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
            // Parse solution critiques and update dissected observations
            const critiqueContent = toolResult.replace(/<Solution Critiques>|<\/Solution Critiques>/g, '').trim();
            if (critiqueContent) {
                state.dissectedObservationsSynthesis = critiqueContent;
                state.dissectedSynthesisStatus = 'completed';
                state.solutionCritiquesStatus = 'completed';
                
                // Clear and rebuild critique cards to prevent duplication
                state.solutionCritiques = [];
                state.initialStrategies.forEach((strategy) => {
                    strategy.subStrategies.forEach((subStrategy) => {
                        if (subStrategy.solutionAttempt) {
                            // Create critique entry for each solution
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
            // Clear all existing refined solutions to replace with new corrections
            state.initialStrategies.forEach(strategy => {
                strategy.subStrategies.forEach(sub => {
                    sub.refinedSolution = undefined;
                    sub.selfImprovementStatus = undefined;
                });
            });
            
            // Parse corrected solutions
            const correctedMatches = toolResult.matchAll(/<(execution-strategy-\d+-\d+):Corrected>\s*([\s\S]*?)\s*<\/\1:Corrected>/g);
            for (const match of correctedMatches) {
                const executionId = match[1];
                const correctedSolution = match[2].trim();
                
                // Find corresponding sub-strategy
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
            // Parse final selected solution - extract ONLY the solution content, not the XML tags
            const solutionMatch = toolResult.match(/<Best Solution Selected>\s*([\s\S]*?)\s*<\/Best Solution Selected>/);
            if (solutionMatch) {
                let selectedText = solutionMatch[1].trim();
                
                // Remove any remaining XML-like tags or metadata that might be in the solution
                // Keep only the actual solution reasoning and answer
                selectedText = selectedText.replace(/<Solution \d+ ID:.*?>/g, '');
                selectedText = selectedText.replace(/<\/Solution \d+>/g, '');
                selectedText = selectedText.replace(/Strategy:.*?\n\n/g, '');
                selectedText = selectedText.replace(/Corrected Solution:/g, '');
                selectedText = selectedText.trim();
                
                state.finalJudgedBestSolution = selectedText;
                state.finalJudgingStatus = 'completed';
                state.finalJudgingResponseText = selectedText;
                state.status = 'completed';
                
                // Try to identify which strategy was selected
                const strategyIdMatch = toolResult.match(/strategy-(\d+-\d+)/);
                if (strategyIdMatch) {
                    state.finalJudgedBestStrategyId = strategyIdMatch[0];
                }
            }
            break;
        }
    }
}

// Render mode function (called from main app)
export function renderAdaptiveDeepthinkMode() {
    const container = document.getElementById('pipelines-content-container');
    const tabsContainer = document.getElementById('tabs-nav-container');
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;

    if (!container || !tabsContainer) return;

    // Clear existing content
    tabsContainer.innerHTML = '';
    container.innerHTML = '';

    // Hide entire header section for Adaptive Deepthink mode (no generic tabs/header needed)
    // The embedded Deepthink UI has its own tabs
    if (mainHeaderContent) {
        mainHeaderContent.style.display = 'none';
    }

    // Ensure parent container has proper height
    container.style.height = '100%';
    container.style.overflow = 'hidden'; // Override default auto
    container.style.padding = '0'; // Remove padding for full height
    
    // Create container
    const adaptiveDeepthinkContainer = document.createElement('div');
    adaptiveDeepthinkContainer.id = 'adaptive-deepthink-container';
    adaptiveDeepthinkContainer.className = 'pipeline-content active';
    adaptiveDeepthinkContainer.style.height = '100%';
    adaptiveDeepthinkContainer.style.display = 'flex';
    adaptiveDeepthinkContainer.style.flexDirection = 'column';
    container.appendChild(adaptiveDeepthinkContainer);

    // If there's no active state, show empty container
    if (!activeAdaptiveDeepthinkState) {
        adaptiveDeepthinkContainer.innerHTML = '';
        return;
    }

    // Render the UI
    if (!adaptiveDeepthinkUIRoot) {
        adaptiveDeepthinkUIRoot = renderAdaptiveDeepthinkUI(
            adaptiveDeepthinkContainer,
            activeAdaptiveDeepthinkState,
            stopAdaptiveDeepthinkProcess
        );
    } else {
        updateAdaptiveDeepthinkUI(
            adaptiveDeepthinkUIRoot,
            activeAdaptiveDeepthinkState,
            stopAdaptiveDeepthinkProcess
        );
    }
}

// Start Adaptive Deepthink process
export async function startAdaptiveDeepthinkProcess(
    question: string,
    customPrompts: CustomizablePromptsAdaptiveDeepthink,
    imageBase64?: string | null,
    imageMimeType?: string | null
) {
    if (!question || isAdaptiveDeepthinkRunning) return;

    // Create state
    const coreState: AdaptiveDeepthinkState = {
        id: `adaptive-deepthink-${Date.now()}`,
        question,
        status: 'processing',
        strategies: new Map(),
        hypotheses: new Map(),
        hypothesisTestings: new Map(),
        executions: new Map(),
        critiques: new Map(),
        correctedSolutions: new Map()
    };

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

    isAdaptiveDeepthinkRunning = true;
    updateControlsState();
    abortController = new AbortController();

    // Render initial UI
    renderAdaptiveDeepthinkMode();

    // Start the orchestration loop
    await runAdaptiveDeepthinkLoop(customPrompts, imageBase64, imageMimeType);
}

// Main orchestration loop
async function runAdaptiveDeepthinkLoop(
    customPrompts: CustomizablePromptsAdaptiveDeepthink,
    imageBase64?: string | null,
    imageMimeType?: string | null
) {
    if (!activeAdaptiveDeepthinkState || !isAdaptiveDeepthinkRunning) return;

    const flushUI = async () => {
        await forceAdaptiveDeepthinkUIRender();
    };

    // Build deepthink prompts from customizable Adaptive Deepthink prompts
    const deepthinkPrompts = {
        sys_deepthink_initialStrategy: customPrompts.sys_adaptiveDeepthink_strategyGeneration,
        user_deepthink_initialStrategy: '', // User prompts are built dynamically
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

    // Agent execution context
    const agentContext: AgentExecutionContext = {
        callAI: callAI as any,
        cleanOutputByType: (raw: string) => raw,
        parseJsonSafe: (raw: string) => {
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        },
        getSelectedTemperature,
        getSelectedModel,
        getSelectedTopP
    };

    while (isAdaptiveDeepthinkRunning && !activeAdaptiveDeepthinkState.isComplete) {
        try {
            activeAdaptiveDeepthinkState.isProcessing = true;
            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );

            // Add placeholder agent message
            const placeholderIndex = activeAdaptiveDeepthinkState.messages.length;
            activeAdaptiveDeepthinkState.messages = [...activeAdaptiveDeepthinkState.messages, {
                id: newMsgId('agent'),
                role: 'agent' as const,
                content: '',
                timestamp: Date.now(),
                status: 'processing' as const
            }];
            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );
            await flushUI();

            // Build prompt
            const prompt = await activeAdaptiveDeepthinkState.conversationManager.buildPrompt();
            const systemPrompt = activeAdaptiveDeepthinkState.conversationManager.getSystemPrompt();

            // Call AI with retry logic
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
                    if (imageBase64 && imageMimeType) {
                        promptParts.unshift({
                            inlineData: { mimeType: imageMimeType, data: imageBase64 }
                        });
                    }

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

            // Handle failure after all retries
            if (!responseText) {
                const errMsg = lastError
                    ? `AI call failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`
                    : 'Provider returned an empty response after all retries.';

                // Remove placeholder and add error message (create new array)
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
                updateAdaptiveDeepthinkUI(
                    adaptiveDeepthinkUIRoot,
                    activeAdaptiveDeepthinkState,
                    stopAdaptiveDeepthinkProcess
                );
                await flushUI();
                continue;
            }

            // Add agent response to history
            await activeAdaptiveDeepthinkState.conversationManager.addAgentMessage(responseText);

            // Parse response for tool calls (backend does the heavy lifting)
            const parsed = parseAdaptiveDeepthinkResponse(responseText);
            // Use the cleaned narrative from backend, not the raw response
            const segments = parseIntoSegments(parsed.narrative, parsed.toolCalls);

            // Replace placeholder with actual message
            const msgs = activeAdaptiveDeepthinkState.messages;
            msgs[placeholderIndex] = {
                id: msgs[placeholderIndex].id,
                role: 'agent',
                content: parsed.narrative,
                timestamp: msgs[placeholderIndex].timestamp,
                status: 'processing',
                segments: segments as any
            };

            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );
            await flushUI();

            // If no tool calls, process is complete
            if (parsed.toolCalls.length === 0) {
                activeAdaptiveDeepthinkState.coreState.status = 'completed';
                activeAdaptiveDeepthinkState.isComplete = true;
                activeAdaptiveDeepthinkState.isProcessing = false;
                updateAdaptiveDeepthinkUI(
                    adaptiveDeepthinkUIRoot,
                    activeAdaptiveDeepthinkState,
                    stopAdaptiveDeepthinkProcess
                );
                await flushUI();
                break;
            }

            // Execute the tool (only first tool call)
            const toolCall = parsed.toolCalls[0];
            const agentName = getAgentNameFromToolType(toolCall.type);
            const agentIcon = getAgentIconFromToolType(toolCall.type);

            // Add visually appealing "tool executing" message with icon (create new array)
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
            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );
            await flushUI();

            // Execute tool
            const toolResult = await executeAdaptiveDeepthinkTool(
                toolCall,
                activeAdaptiveDeepthinkState.coreState,
                agentContext,
                deepthinkPrompts,
                imageBase64,
                imageMimeType
            );

            // Parse tool result and update Deepthink state IMMEDIATELY
            parseToolResultAndUpdateState(toolCall, toolResult);
            
            // Force UI update RIGHT NOW
            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );
            await flushUI();

            // Remove processing message and add tool result (create new array)
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

            // Add tool result to conversation history
            await activeAdaptiveDeepthinkState.conversationManager.addSystemMessage(toolResult);

            activeAdaptiveDeepthinkState.isProcessing = false;
            
            // Update UI with tool result
            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );
            await flushUI();

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
            updateAdaptiveDeepthinkUI(
                adaptiveDeepthinkUIRoot,
                activeAdaptiveDeepthinkState,
                stopAdaptiveDeepthinkProcess
            );
            await flushUI();
            break;
        }

        if (abortController?.signal.aborted) break;
    }

    isAdaptiveDeepthinkRunning = false;
    updateControlsState();
}

// Stop process
export function stopAdaptiveDeepthinkProcess() {
    isAdaptiveDeepthinkRunning = false;
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    updateControlsState();

    if (activeAdaptiveDeepthinkState) {
        activeAdaptiveDeepthinkState.isProcessing = false;
        activeAdaptiveDeepthinkState.isComplete = true;
        updateAdaptiveDeepthinkUI(
            adaptiveDeepthinkUIRoot,
            activeAdaptiveDeepthinkState,
            stopAdaptiveDeepthinkProcess
        );
    }
}

// Cleanup
export function cleanupAdaptiveDeepthinkMode() {
    stopAdaptiveDeepthinkProcess();
    activeAdaptiveDeepthinkState = null;
    adaptiveDeepthinkUIRoot = null;
    
    // Cleanup the mutation observer
    const observer = (window as any).__adaptiveDeepthinkTabsObserver;
    if (observer) {
        observer.disconnect();
        (window as any).__adaptiveDeepthinkTabsObserver = null;
    }
    
    // Show tabs container again
    const tabsContainer = document.getElementById('tabs-nav-container');
    if (tabsContainer) {
        tabsContainer.style.display = '';
    }
}

// Get state
export function getAdaptiveDeepthinkState(): AdaptiveDeepthinkUIState | null {
    return activeAdaptiveDeepthinkState;
}

// Set state for import
export function setAdaptiveDeepthinkStateForImport(state: AdaptiveDeepthinkUIState | null) {
    if (state) {
        // Reset processing flags
        state.isProcessing = false;
        activeAdaptiveDeepthinkState = state;
        isAdaptiveDeepthinkRunning = false;
        adaptiveDeepthinkUIRoot = null;
    } else {
        activeAdaptiveDeepthinkState = null;
        adaptiveDeepthinkUIRoot = null;
    }
}
