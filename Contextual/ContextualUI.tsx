/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ContextualState, ContextualMessage } from './ContextualCore';
import RenderMathMarkdown from '../Styles/Components/RenderMathMarkdown';
import { openEmbeddedModal } from '../Styles/Components/EmbeddedModal';
import { FaRobot, FaStop, FaDatabase, FaSearch } from 'react-icons/fa';
import { MdOutlineTaskAlt } from 'react-icons/md';
import { CgSandClock } from 'react-icons/cg';

// Track React roots to prevent creating multiple roots on the same container
const rootMap = new WeakMap<HTMLElement, Root>();

interface ContextualUIProps {
    state: ContextualState;
    onStop: () => void;
}

export function ContextualUI({ state, onStop }: ContextualUIProps) {
    // Update evolution viewer when content history changes
    useEffect(() => {
        const updateViewer = async () => {
            const { updateEvolutionViewerIfOpen } = await import('../Styles/Components/DiffModal/EvolutionViewer');
            updateEvolutionViewerIfOpen(state.id, state.contentHistory);
        };
        updateViewer();
    }, [state.contentHistory.length, state.id]);

    return (
        <div className="contextual-ui-container" style={{
            display: 'flex',
            height: '100%',
            padding: '6px',
            gap: '8px',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '100%',
            overflow: 'hidden'
        }}>
            <CurrentBestGenerationPanel
                content={state.currentBestGeneration}
                originalContent={state.initialMainGeneration}
                state={state}
            />
            <AgentActivityPanel state={state} onStop={onStop} />
        </div>
    );
}

// Hook to encapsulate vanilla DOM sidebar interaction
function useSidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const checkSidebarState = () => {
            const sidebar = document.getElementById('controls-sidebar');
            setIsCollapsed(sidebar?.classList.contains('collapsed') || false);
        };

        checkSidebarState();

        const sidebar = document.getElementById('controls-sidebar');
        if (!sidebar) return;

        const observer = new MutationObserver(checkSidebarState);
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });

        return () => observer.disconnect();
    }, []);

    const expandSidebar = useCallback(() => {
        const sidebar = document.getElementById('controls-sidebar');
        const expandButton = document.getElementById('sidebar-expand-button');
        if (sidebar) {
            sidebar.classList.remove('collapsed');
            if (expandButton) {
                expandButton.style.display = 'none';
            }
        }
    }, []);

    return { isCollapsed, expandSidebar };
}

// Left Panel - Current Best Generation
const CurrentBestGenerationPanel: React.FC<{ content: string; originalContent: string; state: ContextualState }> = ({ content, state }) => {
    const { isCollapsed: sidebarCollapsed, expandSidebar } = useSidebar();

    const renderContent = () => {
        if (!content) {
            return (
                <div className="empty-state">
                    <FaRobot className="empty-icon" />
                    <p>Waiting for generation...</p>
                </div>
            );
        }

        return <RenderMathMarkdown content={content} />;
    };

    return (
        <div className="contextual-text-panel" style={{
            flex: '1 1 0%',
            minWidth: 0,
            maxWidth: 'unset'
        }}>
            <div className="text-panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {sidebarCollapsed && (
                        <>
                            <button
                                onClick={expandSidebar}
                                title="Expand Sidebar"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-color)',
                                    opacity: 0.7,
                                    transition: 'opacity 0.2s ease',
                                    alignSelf: 'center',
                                    marginLeft: '0.5rem'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>dock_to_left</span>
                            </button>
                            <div
                                style={{
                                    width: '1px',
                                    alignSelf: 'stretch',
                                    background: 'linear-gradient(180deg, transparent 0%, rgba(var(--accent-purple-rgb), 0.35) 20%, rgba(var(--accent-purple-rgb), 0.35) 80%, transparent 100%)',
                                    opacity: 1,
                                    margin: '0 0.4rem'
                                }}
                            />
                        </>
                    )}
                    <h3 style={{ margin: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }}>Current Best Generation</h3>
                </div>
                <div className="text-panel-actions">
                    <button
                        className="action-btn"
                        onClick={async () => {
                            const { openEvolutionViewerFromHistory } = await import('../Styles/Components/DiffModal/EvolutionViewer');
                            openEvolutionViewerFromHistory(state.contentHistory, state.id);
                        }}
                        title="View content evolution timeline (updates live)"
                    >
                        <span className="material-symbols-outlined">movie</span>
                        Evolutions
                    </button>
                    {state.id !== 'iterative-corrections' && (
                        <>
                            <button
                                className="action-btn"
                                onClick={() => openEmbeddedModal('Current Memory Document', state.currentMemory)}
                                title="View current memory document"
                                disabled={!state.currentMemory}
                            >
                                <CgSandClock />
                                Memory
                            </button>
                            <button
                                className="action-btn"
                                onClick={() => openEmbeddedModal('Solution Pool', state.currentStrategicPool)}
                                title="View current solution pool"
                                disabled={!state.currentStrategicPool}
                            >
                                <FaDatabase />
                                Solution Pool
                            </button>
                            <button
                                className="action-btn"
                                onClick={() => openEmbeddedModal('Current Critique', state.currentBestSuggestions)}
                                title="View current critique"
                                disabled={!state.currentBestSuggestions}
                            >
                                <FaSearch />
                                Critique
                            </button>
                        </>
                    )}
                    <button
                        className="action-btn"
                        onClick={async (e) => {
                            const button = e.currentTarget;
                            const icon = button.querySelector('.material-symbols-outlined');

                            try {
                                await navigator.clipboard.writeText(content);

                                if (icon) {
                                    const originalIcon = icon.textContent;
                                    icon.textContent = 'check';

                                    setTimeout(() => {
                                        icon.textContent = originalIcon || 'content_copy';
                                    }, 1500);
                                }
                            } catch (err) {
                                console.error('Failed to copy:', err);
                            }
                        }}
                        title="Copy current text"
                        disabled={!content}
                    >
                        <span className="material-symbols-outlined">content_copy</span>
                    </button>
                </div>
            </div>
            <div className="text-content-container custom-scrollbar">
                {renderContent()}
            </div>
        </div>
    );
};

// Right Panel - Agent Activity
const AgentActivityPanel: React.FC<{ state: ContextualState; onStop: () => void }> = ({ state, onStop }) => {
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

    const handleScroll = useCallback(() => {
        const el = messagesContainerRef.current;
        if (el) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) <= 2;
            setIsUserScrolledUp(!isAtBottom);
        }
    }, []);

    useEffect(() => {
        if (!isUserScrolledUp && messagesContainerRef.current) {
            const el = messagesContainerRef.current;
            el.scrollTop = el.scrollHeight;
            requestAnimationFrame(() => {
                if (!isUserScrolledUp && messagesContainerRef.current) {
                    const el2 = messagesContainerRef.current;
                    el2.scrollTop = el2.scrollHeight;
                }
            });
        }
    }, [state.messages, isUserScrolledUp]);

    useEffect(() => {
        if (state.isProcessing && messagesContainerRef.current) {
            const el = messagesContainerRef.current;
            el.scrollTop = el.scrollHeight;
            setIsUserScrolledUp(false);
        }
    }, [state.isProcessing]);

    return (
        <div className="contextual-agent-panel" style={{
            flex: '0 0 32%',
            minWidth: 0,
            maxWidth: '32%'
        }}>
            <div className="agent-panel-header">
                <h3 style={{ margin: 0 }}>Agent Activity</h3>
                <div className="header-info">
                    <span className="iteration-badge">{state.iterationCount}</span>
                    {state.isProcessing && (
                        <button className="stop-button" onClick={onStop}>
                            <FaStop />
                            Stop
                        </button>
                    )}
                </div>
            </div>
            <div className="agent-messages-container custom-scrollbar" ref={messagesContainerRef} onScroll={handleScroll}>
                {state.messages.map((message) => (
                    <MinimalMessageCard key={message.id} message={message} allMessages={state.messages} />
                ))}
                {state.isProcessing && (
                    <div className="processing-indicator">
                        <div className="spinner"></div>
                        <span>Processing agent response...</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// Minimal Message Card (similar to verification report in Agentic mode)
const MinimalMessageCard: React.FC<{ message: ContextualMessage; allMessages: ContextualMessage[] }> = ({ message, allMessages }) => {
    const [expanded, setExpanded] = useState(false);

    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'main_generator': return 'Execution';
            case 'iterative_agent': return 'Solution Critique';
            case 'memory_agent': return 'Memory';
            case 'strategic_pool_agent': return 'Solution Pool';
            case 'system': return 'System';
            default: return role;
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'main_generator': return <MdOutlineTaskAlt className="card-icon" />;
            case 'iterative_agent': return <FaSearch className="card-icon" />;
            case 'memory_agent': return <CgSandClock className="card-icon" />;
            case 'strategic_pool_agent': return <FaDatabase className="card-icon" />;
            case 'system': return <FaRobot className="card-icon" />;
            default: return <FaRobot className="card-icon" />;
        }
    };

    const getRoleClass = (role: string) => {
        const baseClass = (() => {
            switch (role) {
                case 'main_generator': return 'main-generator-card';
                case 'iterative_agent': return 'iterative-agent-card';
                case 'memory_agent': return 'memory-agent-card';
                case 'strategic_pool_agent': return 'strategic-pool-agent-card';
                case 'system': return 'system-card';
                default: return '';
            }
        })();

        // Add status class if present
        const statusClass = message.status ? ` status-${message.status}` : '';
        return baseClass + statusClass;
    };

    const lines = message.content.split('\n');
    const needsCollapse = lines.length > 30;
    const preview = needsCollapse && !expanded ? lines.slice(0, 30).join('\n') : message.content;

    return (
        <div className={`minimal-message-card ${getRoleClass(message.role)}`}>
            <div className="minimal-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {getRoleIcon(message.role)}
                    <span className="card-title">{getRoleLabel(message.role)}</span>
                    <span className="card-iteration">{message.iterationNumber}</span>
                </div>
                <button
                    className="action-btn"
                    onClick={() => openEmbeddedModal(getRoleLabel(message.role), message.content, message, allMessages)}
                    title="View full response"
                >
                    <span className="material-symbols-outlined">visibility</span>
                    View
                </button>
            </div>
            <div className="minimal-card-content">
                <RenderMathMarkdown content={preview} />
                {needsCollapse && (
                    <>
                        {!expanded && (
                            <div className="content-truncated">... {lines.length - 30} more lines ...</div>
                        )}
                        <button className="action-btn" onClick={() => setExpanded(!expanded)}>
                            {expanded ? 'Show less' : 'Show all'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export function renderContextualUI(
    container: HTMLElement,
    state: ContextualState,
    onStop: () => void
): Root {
    let root = rootMap.get(container);
    if (!root) {
        root = createRoot(container);
        rootMap.set(container, root);
    }
    flushSync(() => {
        root.render(<ContextualUI state={state} onStop={onStop} />);
    });
    return root;
}

export function updateContextualUI(
    root: any,
    state: ContextualState,
    onStop: () => void
): void {
    if (!root) return;
    flushSync(() => {
        root.render(<ContextualUI state={state} onStop={onStop} />);
    });
}

/**
 * Render iterative corrections UI (for Deepthink mode)
 * Uses the same UI as Contextual mode
 */
export function cleanupIterativeCorrectionsRoot() {
    // Root cleanup is handled automatically by WeakMap when containers are GC'd
    // This function is kept for backward compatibility
}

export function renderIterativeCorrectionsUI(
    container: HTMLElement,
    originalSolution: string,
    finalSolution: string,
    iterations: Array<{ iterationNumber: number, critique: string, correctedSolution: string, timestamp?: number }>,
    isProcessing?: boolean
): any {
    // Transform iterations into ContextualState format
    const messages: ContextualMessage[] = [];

    // Handle case where iterations might be empty or undefined
    const safeIterations = iterations || [];

    safeIterations.forEach((iter, index) => {
        const baseTimestamp = iter.timestamp || (Date.now() + index * 1000);

        // Add critique message
        messages.push({
            id: `critique-iter-${iter.iterationNumber}`,
            role: 'iterative_agent',
            content: iter.critique,
            timestamp: baseTimestamp,
            iterationNumber: iter.iterationNumber
        });

        // Add correction message
        messages.push({
            id: `correction-iter-${iter.iterationNumber}`,
            role: 'main_generator',
            content: iter.correctedSolution,
            timestamp: baseTimestamp + 500, // 500ms after critique
            iterationNumber: iter.iterationNumber
        });
    });

    // Build content history from iterations for the evolution viewer
    // Start with the original solution as the first entry
    const contentHistory: Array<{ content: string; title: string; timestamp: number }> = [];

    if (originalSolution) {
        contentHistory.push({
            content: originalSolution,
            title: 'Original Solution (Iteration 0)',
            timestamp: safeIterations[0]?.timestamp ? safeIterations[0].timestamp - 1000 : Date.now() - 1000
        });
    }

    safeIterations.forEach((iter, index) => {
        contentHistory.push({
            content: iter.correctedSolution,
            title: `Iteration ${iter.iterationNumber} - Corrected Solution`,
            timestamp: iter.timestamp || (Date.now() + index * 1000)
        });
    });

    // Add final solution if different from last iteration
    if (finalSolution && (safeIterations.length === 0 || finalSolution !== safeIterations[safeIterations.length - 1]?.correctedSolution)) {
        contentHistory.push({
            content: finalSolution,
            title: 'Final Solution',
            timestamp: Date.now()
        });
    }

    const mockState: ContextualState = {
        id: 'iterative-corrections',
        initialUserRequest: '',
        initialMainGeneration: originalSolution || 'Processing...',
        currentBestGeneration: finalSolution || 'Processing iterative corrections...',
        currentBestSuggestions: '',
        allIterativeSuggestions: [],
        mainGeneratorHistory: [],
        iterativeAgentHistory: [],
        memoryAgentHistory: [],
        strategicPoolAgentHistory: [],
        messages: messages,
        iterationCount: safeIterations.length,
        isRunning: false,
        isProcessing: isProcessing !== undefined ? isProcessing : safeIterations.length === 0,
        contentHistory: contentHistory,
        currentMemory: '',
        memorySnapshots: [],
        currentStrategicPool: '',
        allStrategicPools: []
    };

    // Create or reuse React root using the rootMap to prevent duplicate roots
    let root = rootMap.get(container);
    if (!root) {
        root = createRoot(container);
        rootMap.set(container, root);
    }

    flushSync(() => {
        root.render(<ContextualUI state={mockState} onStop={() => { }} />);
    });

    return root;
}
