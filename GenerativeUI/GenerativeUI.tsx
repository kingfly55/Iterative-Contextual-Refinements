/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import * as ReactDOM from 'react-dom/client';
import { StructuredRepresentation, RewardFunction, EvaluationResult, IterationState, GenerativeUIState } from './GenerativeUICore';
import { GenerativeUIPrompts } from './GenerativeUIPrompts';

import { callAI, getSelectedModel, getSelectedTemperature, getSelectedTopP } from '../Routing';
import { parseJsonSafe } from '../Parsing';
import { updateControlsState } from '../index.tsx';

// Load CSS styles from external file
const injectStyles = () => {
    const styleId = 'generativeui-styles';
    if (document.getElementById(styleId)) return;
    
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = './GenerativeUI/GenerativeUI.css';
    document.head.appendChild(link);
};

// Prompts are now imported from './GenerativeUIPrompts'

// Constants
const MAX_ITERATIONS = 3;
const QUALITY_THRESHOLD = 90;

// Global state for GenerativeUI mode
let activeGenerativeUIState: GenerativeUIState | null = null;
let generativeUIRoot: any = null;
let isGenerativeUIRunning = false;
let abortController: AbortController | null = null;
let generativeUIPrompts: GenerativeUIPrompts = new GenerativeUIPrompts();

// Configuration constants
const DEBOUNCE_MS = 500; // Debounce rapid interactions
const INTERACTION_QUEUE_LIMIT = 5; // Max queued interactions

// ========== INTERACTIVE MODE HELPER FUNCTIONS ==========

// Function to inject event tracking script into generated HTML
function injectInteractionTracking(html: string): string {
    const trackingScript = `
<script>
(function() {
    // Helper to extract element info
    function getElementInfo(element) {
        // Only capture what's actually used in prompts
        return {
            tag: element.tagName.toLowerCase(),
            id: element.id || undefined,
            text: element.textContent?.trim().substring(0, 100) || ''
            // Removed: classes, value, attributes (not used in prompts)
        };
    }

    // extractApplicationState removed - not used in prompts
    // All state is already in screenSnapshot (full HTML)

    // Send interaction to parent with error handling
    function sendInteraction(eventType, element, position) {
        try {
            // Prevent infinite loading by setting a timeout
            const timeoutId = setTimeout(function() {
                console.warn('[GenerativeUI Tracking] Interaction processing timeout - recovering');
            }, 30000); // 30 second timeout
            
            window.parent.postMessage({
                type: 'generativeui-interaction',
                eventType: eventType,
                element: getElementInfo(element),
                // Removed: position (not used), extractedState (duplicate of HTML)
                screenSnapshot: document.documentElement.outerHTML, // Full HTML, no limits
                timestamp: Date.now()
            }, '*');
        } catch (error) {
            console.error('[GenerativeUI Tracking] Failed to send interaction:', error);
            // Show user-friendly error
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position:fixed;top:20px;right:20px;background:#ff4444;color:white;padding:15px;border-radius:5px;z-index:999999;';
            errorDiv.textContent = 'Interaction failed. Please try again.';
            document.body.appendChild(errorDiv);
            setTimeout(function() { errorDiv.remove(); }, 3000);
        }
    }
    
    // Global error handler for iframe
    window.addEventListener('error', function(e) {
        console.error('[GenerativeUI Tracking] Runtime error:', e.message);
        e.preventDefault();
    });
    
    window.addEventListener('unhandledrejection', function(e) {
        console.error('[GenerativeUI Tracking] Unhandled promise rejection:', e.reason);
        e.preventDefault();
    });

    // Click handler - ONLY for buttons, links, and submit buttons
    document.addEventListener('click', function(e) {
        try {
            const target = e.target;
            
            // Only trigger for interactive elements that should navigate/submit
            const isButton = target.tagName === 'BUTTON';
            const isLink = target.tagName === 'A';
            const isSubmitInput = target.tagName === 'INPUT' && (target.type === 'submit' || target.type === 'button');
            
            if (isButton || isLink || isSubmitInput) {
                sendInteraction('click', target, { x: e.clientX, y: e.clientY });
                
                // Prevent default to avoid navigation
                e.preventDefault();
            }
        } catch (error) {
            console.error('[GenerativeUI Tracking] Click handler error:', error);
        }
    }, true);

    // Submit handler - for form submissions
    document.addEventListener('submit', function(e) {
        try {
            e.preventDefault();
            sendInteraction('submit', e.target, { x: 0, y: 0 });
        } catch (error) {
            console.error('[GenerativeUI Tracking] Submit handler error:', error);
        }
    }, true);

    console.log('[GenerativeUI] Interaction tracking initialized');
})();
</script>`;

    // Inject before closing body tag
    if (html.includes('</body>')) {
        return html.replace('</body>', trackingScript + '</body>');
    } else {
        // If no body tag, append at end
        return html + trackingScript;
    }
}

// Function to extract design system from HTML
function extractDesignSystem(html: string): import('./GenerativeUICore').DesignSystem {
    // Simple extraction - can be enhanced
    const colorRegex = /#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g;
    const colors = [...new Set((html.match(colorRegex) || []))];
    
    const fontRegex = /font-family:\s*([^;]+)/g;
    const fonts = [...new Set(Array.from(html.matchAll(fontRegex)).map(m => m[1].trim()))];
    
    return {
        colorPalette: colors.slice(0, 10),
        typography: {
            fonts: fonts.slice(0, 5),
            sizes: ['14px', '16px', '18px', '24px', '32px']
        },
        spacing: '1rem',
        borderRadius: '8px',
        componentPatterns: ['Modern UI', 'Clean design', 'Rounded corners']
    };
}

// Function to create user journey summary
function createUserJourneySummary(interactions: import('./GenerativeUICore').CapturedInteraction[]): string {
    if (interactions.length === 0) return 'User just started';
    
    return interactions.map((interaction, idx) => {
        const action = interaction.type;
        const element = interaction.element.text || interaction.element.tag;
        return `${idx + 1}. ${action} on "${element}"`;
    }).join(' → ');
}

// Validate and sanitize interaction
function isValidInteraction(interaction: any): boolean {
    try {
        return !!(
            interaction &&
            interaction.eventType &&
            interaction.timestamp &&
            interaction.element &&
            interaction.element.tag
        );
    } catch {
        return false;
    }
}

// Check if interaction is duplicate (same element within debounce window)
function isDuplicateInteraction(interaction: import('./GenerativeUICore').CapturedInteraction): boolean {
    if (!activeGenerativeUIState) return false;
    
    const now = Date.now();
    const timeSinceLastInteraction = now - activeGenerativeUIState.lastInteractionTimestamp;
    
    if (timeSinceLastInteraction < DEBOUNCE_MS) {
        const lastInteraction = activeGenerativeUIState.interactionHistory[activeGenerativeUIState.interactionHistory.length - 1];
        if (lastInteraction &&
            lastInteraction.type === interaction.type &&
            lastInteraction.element.text === interaction.element.text &&
            lastInteraction.element.tag === interaction.element.tag) {
            return true;
        }
    }
    
    return false;
}

// NO LIMITS - removed compression and trimming entirely

// Process queued interactions
async function processInteractionQueue(): Promise<void> {
    if (!activeGenerativeUIState || activeGenerativeUIState.interactionQueue.length === 0) {
        return;
    }
    
    // Get next interaction from queue
    const nextInteraction = activeGenerativeUIState.interactionQueue.shift();
    if (!nextInteraction) return;
    
    // Process it
    await handleUserInteraction(nextInteraction);
    
    // Continue processing queue if not empty
    if (activeGenerativeUIState && activeGenerativeUIState.interactionQueue.length > 0) {
        setTimeout(() => processInteractionQueue(), 100);
    }
}

// Navigate to specific screen in history
function navigateToScreen(index: number): void {
    if (!activeGenerativeUIState || index < 0 || index >= activeGenerativeUIState.screenHistory.length) {
        return;
    }
    
    const screen = activeGenerativeUIState.screenHistory[index];
    activeGenerativeUIState.currentScreenIndex = index;
    
    // Inject tracking into historical screen
    const trackedCode = injectInteractionTracking(screen.screenHtml);
    activeGenerativeUIState.finalCode = trackedCode;
    
    // Disable interactive mode temporarily for historical screens (not the latest)
    activeGenerativeUIState.isInteractiveMode = (index === activeGenerativeUIState.screenHistory.length - 1);
    
    renderGenerativeUIMode();
}

// Handle postMessage from iframe
function handleIframeMessage(event: MessageEvent) {
    // Check if this is our interaction message
    if (!event.data || event.data.type !== 'generativeui-interaction') {
        return;
    }
    
    // Don't process if not in interactive mode
    if (!activeGenerativeUIState || !activeGenerativeUIState.isInteractiveMode) {
        return;
    }
    
    // Validate interaction
    if (!isValidInteraction(event.data)) {
        return;
    }
    
    // Create interaction object (screenSnapshot used temporarily, not stored in history)
    const interaction: import('./GenerativeUICore').CapturedInteraction = {
        type: event.data.eventType,
        timestamp: event.data.timestamp,
        element: event.data.element,
        position: event.data.position,
        extractedState: event.data.extractedState,
        screenSnapshot: event.data.screenSnapshot  // Only used for current generation
    };
    
    // Check for duplicate
    if (isDuplicateInteraction(interaction)) {
        return;
    }
    
    // If already processing, queue it
    if (activeGenerativeUIState.isProcessingInteraction) {
        if (activeGenerativeUIState.interactionQueue.length < INTERACTION_QUEUE_LIMIT) {
            activeGenerativeUIState.interactionQueue.push(interaction);
        }
        return;
    }
    
    // Process the interaction
    handleUserInteraction(interaction);
}

// Handle user interaction and trigger regeneration
async function handleUserInteraction(interaction: import('./GenerativeUICore').CapturedInteraction) {
    if (!activeGenerativeUIState) return;
    
    // Set processing flag
    activeGenerativeUIState.isProcessingInteraction = true;
    activeGenerativeUIState.lastInteractionTimestamp = Date.now();
    
    try {
        // Extract screenSnapshot before storing (avoid duplication in history)
        const currentScreenHtml = interaction.screenSnapshot;
        
        // Store minimal interaction (only what's used in prompts)
        const interactionForHistory = {
            type: interaction.type,
            timestamp: interaction.timestamp,
            element: {
                tag: interaction.element.tag,
                id: interaction.element.id,
                text: interaction.element.text
            }
            // Removed: position, extractedState, screenSnapshot (all unused or duplicate)
        };
        activeGenerativeUIState.interactionHistory.push(interactionForHistory);
        
        // Trigger contextual generation with current HTML
        await startContextualGeneration(interaction, currentScreenHtml);
        
    } catch (error) {
        if (activeGenerativeUIState) {
            activeGenerativeUIState.status = 'error';
            activeGenerativeUIState.error = error instanceof Error ? error.message : 'Unknown error';
            renderGenerativeUIMode();
        }
    } finally {
        if (activeGenerativeUIState) {
            activeGenerativeUIState.isProcessingInteraction = false;
            
            // Process next queued interaction if any
            if (activeGenerativeUIState.interactionQueue.length > 0) {
                setTimeout(() => processInteractionQueue(), 200);
            }
        }
    }
}

// Start contextual generation based on interaction
async function startContextualGeneration(
    interaction: import('./GenerativeUICore').CapturedInteraction,
    currentScreenHtml?: string
) {
    if (!activeGenerativeUIState) return;
    
    // Set status to processing
    isGenerativeUIRunning = true;
    activeGenerativeUIState.status = 'processing';
    renderGenerativeUIMode();
    
    try {
        // Execute contextual pipeline with current HTML
        await executeContextualPipeline(interaction, currentScreenHtml || interaction.screenSnapshot);
        
        activeGenerativeUIState.status = 'completed';
        activeGenerativeUIState.currentStatus = 'Screen generated!';
    } catch (error) {
        activeGenerativeUIState.status = 'error';
        activeGenerativeUIState.error = error instanceof Error ? error.message : 'Unknown error';
        activeGenerativeUIState.currentStatus = 'Error: ' + activeGenerativeUIState.error;
    } finally {
        isGenerativeUIRunning = false;
        updateControlsState();
        renderGenerativeUIMode();
    }
}

// Initialize GenerativeUI mode
export function initializeGenerativeUIMode() {
    // Inject styles when initializing
    injectStyles();
    
    // Setup postMessage listener for iframe interactions
    window.addEventListener('message', handleIframeMessage);
}

// Main render function for GenerativeUI mode
export function renderGenerativeUIMode() {
    const container = document.getElementById('pipelines-content-container');
    const tabsContainer = document.getElementById('tabs-nav-container');
    
    if (!container || !tabsContainer) return;
    
    // Check if GenerativeUI container already exists
    let generativeUIContainer = document.getElementById('generativeui-container');
    
    // Only set up DOM structure if it doesn't exist
    if (!generativeUIContainer) {
        // Clear existing content
        tabsContainer.innerHTML = '';
        container.innerHTML = '';

        // Add GenerativeUI tabs  
        const tabsWrapper = document.createElement('div');
        tabsWrapper.className = 'generativeui-tabs-wrapper';
        
        const previewBtn = document.createElement('button');
        previewBtn.className = 'tab-button generativeui-mode-tab active';
        previewBtn.id = 'generativeui-tab-preview';
        previewBtn.innerHTML = 'Preview';
        
        const backgroundBtn = document.createElement('button');
        backgroundBtn.className = 'tab-button generativeui-mode-tab';
        backgroundBtn.id = 'generativeui-tab-background';
        backgroundBtn.innerHTML = 'Pipeline Details';
        
        tabsWrapper.appendChild(previewBtn);
        tabsWrapper.appendChild(backgroundBtn);
        tabsContainer.appendChild(tabsWrapper);

        // Create container for GenerativeUI
        generativeUIContainer = document.createElement('div');
        generativeUIContainer.id = 'generativeui-container';
        generativeUIContainer.className = 'pipeline-content active';
        container.appendChild(generativeUIContainer);
        
        // Set up tab switching
        setupTabSwitching();
    }
    
    // Render or update the GenerativeUI interface
    if (activeGenerativeUIState) {
        // Render the GenerativeUI interface
        try {
            if (!generativeUIRoot) {
                generativeUIRoot = ReactDOM.createRoot(generativeUIContainer);
            }
            generativeUIRoot.render(
                <GenerativeUIApp 
                    state={activeGenerativeUIState} 
                    onStop={stopGenerativeUIProcess}
                />
            );
        } catch (error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-state';
            errorDiv.style.padding = '2rem';
            errorDiv.style.color = 'var(--accent-pink)';
            
            const errorTitle = document.createElement('h3');
            errorTitle.textContent = 'Error rendering interface';
            
            const errorMsg = document.createElement('p');
            errorMsg.textContent = error instanceof Error ? error.message : 'Unknown error';
            
            errorDiv.appendChild(errorTitle);
            errorDiv.appendChild(errorMsg);
            
            generativeUIContainer.innerHTML = '';
            generativeUIContainer.appendChild(errorDiv);
        }
    } else {
        // Show empty state when no active generation
        if (generativeUIRoot) {
            generativeUIRoot.unmount();
            generativeUIRoot = null;
        }
        renderInputForm(generativeUIContainer);
    }
}

function setupTabSwitching() {
    const previewTab = document.getElementById('generativeui-tab-preview');
    const backgroundTab = document.getElementById('generativeui-tab-background');
    
    previewTab?.addEventListener('click', () => {
        switchToTab('preview');
    });
    
    backgroundTab?.addEventListener('click', () => {
        switchToTab('background');
    });
}

function switchToTab(tab: 'preview' | 'background') {
    const tabs = document.querySelectorAll('.generativeui-mode-tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'preview') {
        document.getElementById('generativeui-tab-preview')?.classList.add('active');
    } else {
        document.getElementById('generativeui-tab-background')?.classList.add('active');
    }
    
    if (activeGenerativeUIState) {
        activeGenerativeUIState.activeTab = tab;
        if (generativeUIRoot) {
            generativeUIRoot.render(
                <GenerativeUIApp 
                    state={activeGenerativeUIState} 
                    onStop={stopGenerativeUIProcess}
                />
            );
        }
    }
}

// Global setting for iterative refinements (persists between generations)
let globalEnableIterativeRefinements = true;

function renderInputForm(container: HTMLElement) {
    // Create React root for empty state if it doesn't exist
    if (!generativeUIRoot) {
        generativeUIRoot = ReactDOM.createRoot(container);
    }
    
    // Render empty state with settings
    generativeUIRoot.render(<GenerativeUIEmptyState />);
}

// Empty State Component
const GenerativeUIEmptyState: React.FC = () => {
    const toggleGlobalRefinements = () => {
        globalEnableIterativeRefinements = !globalEnableIterativeRefinements;
        renderGenerativeUIMode(); // Re-render to update the checkbox
    };

    return (
        <div className="generativeui-app">
            <div className="generativeui-preview-container">
                <div className="generativeui-preview-header">
                    <div className="preview-status">
                        <span className="status-text">Ready to generate</span>
                    </div>
                    <div className="preview-controls">
                        <label className="refinements-toggle">
                            <input 
                                type="checkbox" 
                                checked={globalEnableIterativeRefinements}
                                onChange={toggleGlobalRefinements}
                            />
                            <span className="toggle-label">Enable Iterative Refinements</span>
                        </label>
                    </div>
                </div>
                
                <div className="generativeui-preview-content">
                    <div className="empty-state">
                        <p>Start a generation to see the UI preview here</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// React Component for GenerativeUI App
const GenerativeUIApp: React.FC<{ state: GenerativeUIState; onStop: () => void }> = ({ state, onStop }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    
    return (
        <div className="generativeui-app">
            {state.activeTab === 'preview' ? (
                <GenerativeUIPreview state={state} iframeRef={iframeRef} onStop={onStop} />
            ) : (
                <GenerativeUIBackground state={state} onStop={onStop} />
            )}
        </div>
    );
};

// Preview Tab Component
const GenerativeUIPreview: React.FC<{ 
    state: GenerativeUIState; 
    iframeRef: React.RefObject<HTMLIFrameElement | null>;
    onStop: () => void;
}> = ({ state, iframeRef, onStop }) => {
    const toggleIterativeRefinements = () => {
        if (activeGenerativeUIState && activeGenerativeUIState.status !== 'processing') {
            activeGenerativeUIState.enableIterativeRefinements = !activeGenerativeUIState.enableIterativeRefinements;
            globalEnableIterativeRefinements = activeGenerativeUIState.enableIterativeRefinements; // Sync global setting
            renderGenerativeUIMode();
        }
    };
    
    useEffect(() => {
        // Effect for iframe loading state
    }, [state.finalCode]);
    
    return (
        <div className="generativeui-preview-container">
            <div className="generativeui-preview-header">
                <div className="preview-status">
                    <span className={`status-indicator ${state.status === 'processing' ? 'processing' : state.status === 'completed' ? 'completed' : 'error'}`}></span>
                    <span className="status-text">{state.currentStatus || 'Ready'}</span>
                </div>
                <div className="preview-controls">
                    <label className="refinements-toggle">
                        <input 
                            type="checkbox" 
                            checked={state.enableIterativeRefinements}
                            onChange={toggleIterativeRefinements}
                            disabled={state.status === 'processing'}
                        />
                        <span className="toggle-label">Enable Iterative Refinements</span>
                    </label>
                    {state.status === 'processing' && (
                        <button className="stop-btn" onClick={onStop}>
                            Stop Generation
                        </button>
                    )}
                </div>
            </div>
            
            <div className="generativeui-preview-content">
                {state.finalCode ? (
                    <iframe 
                        ref={iframeRef}
                        srcDoc={state.finalCode}
                        title="Generated UI"
                        className="generativeui-iframe"
                        sandbox="allow-scripts allow-forms"
                    />
                ) : state.status === 'processing' ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>{state.currentStatus || 'Generating interface...'}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

// Background Details Tab Component
const GenerativeUIBackground: React.FC<{ 
    state: GenerativeUIState; 
    onStop: () => void;
}> = ({ state, onStop }) => {
    const [expandedIteration, setExpandedIteration] = useState<number | null>(null);
    const codeRef = useRef<HTMLElement | null>(null);
    
    // register xml/html highlighter once
    useEffect(() => {
        try {
            hljs.registerLanguage('xml', xml);
        } catch {}
    }, []);
    
    // highlight whenever expanded iteration or content changes
    useEffect(() => {
        if (codeRef.current) {
            hljs.highlightElement(codeRef.current);
        }
    }, [expandedIteration, state.iterations]);
    
    const toggleIteration = (iteration: number) => {
        setExpandedIteration(expandedIteration === iteration ? null : iteration);
    };
    
    return (
        <div className="generativeui-background-container">
            <div className="background-header">
                <h3>Pipeline Progress</h3>
                <div className="pipeline-status">
                    <span className={`status-badge ${state.status}`}>
                        {state.status.toUpperCase()}
                    </span>
                    {state.status === 'processing' && (
                        <button className="stop-btn-small" onClick={onStop}>Stop</button>
                    )}
                </div>
                
                {/* Iterations as sub-cards inside header */}
                {state.iterations.length > 0 && (
                    <>
                        <div className="iterations-subcards">
                            {state.iterations.map((iter) => (
                                <div key={iter.iteration} className="iteration-subcard">
                                    <div 
                                        className="iteration-subcard-header"
                                        onClick={() => toggleIteration(iter.iteration)}
                                    >
                                        <span className="iteration-title">Iteration {iter.iteration}</span>
                                        <span className="iteration-score-badge">
                                            {iter.evaluation ? `Score: ${iter.evaluation.finalScore}/100` : 'Pending'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Expanded iteration details - full width below all iterations */}
                        {expandedIteration !== null && (
                            <div className="iteration-details-container">
                                {(() => {
                                    const selectedIter = state.iterations.find(iter => iter.iteration === expandedIteration);
                                    if (!selectedIter) return null;
                                    
                                    return (
                                        <div className="iteration-full-details">
                                            <div className="iteration-details-header">
                                                <h4>Iteration {selectedIter.iteration} Details</h4>
                                            </div>
                                            <div className="iteration-content-grid">
                                                {/* Evaluation Metrics */}
                                                {selectedIter.evaluation && (
                                                    <div className="evaluation-section">
                                                        <h5>Evaluation Metrics</h5>
                                                        <div className="evaluation-metrics">
                                                            {Object.entries(selectedIter.evaluation.metricScores).map(([name, data]: [string, any]) => (
                                                                <div key={name} className="metric-score-card">
                                                                    <div className="metric-score-header">
                                                                        <span className="metric-name">{name}</span>
                                                                        <span className="metric-value">{data.score}/100</span>
                                                                    </div>
                                                                    <p className="metric-justification">{data.justification}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Generated Code */}
                                                {selectedIter.code && (
                                                    <div className="code-section">
                                                        <h5>Generated Code</h5>
                                                        <div className="code-preview-container">
                                                            <pre className="iteration-code-content">
                                                                <code ref={codeRef} className="language-html">{selectedIter.code}</code>
                                                            </pre>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </>
                )}
            </div>
            
            {/* Requirement Specification - Full width with fixed height */}
            {state.requirementSpec && (
                <div className="background-section requirement-spec-card">
                    <div className="section-header">
                        <span className="section-title">Requirement Specification</span>
                    </div>
                    <div className="section-content spec-content">
                        <RequirementSpecView spec={state.requirementSpec} />
                    </div>
                </div>
            )}
            
            {/* FSM and Reward Function side by side */}
            <div className="side-by-side-container">
                {/* Structured Representation (FSMs) */}
                {state.structuredRep && (
                    <div className="background-section fsm-card">
                        <div className="section-header">
                            <span className="section-title">Finite State Machines & Interaction Flows</span>
                        </div>
                        <div className="section-content">
                            <StructuredRepView data={state.structuredRep} />
                        </div>
                    </div>
                )}
                
                {/* Reward Function */}
                {state.rewardFunction && (
                    <div className="background-section reward-card">
                        <div className="section-header">
                            <span className="section-title">Adaptive Reward Function</span>
                        </div>
                        <div className="section-content">
                            <RewardFunctionView data={state.rewardFunction} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Component for Requirement Specification View
const RequirementSpecView: React.FC<{ spec: string }> = ({ spec }) => {
    try {
        const parsed = JSON.parse(spec);
        return (
            <div className="requirement-spec-view">
                {parsed.keyFeatures && (
                    <div className="spec-section">
                        <h4>Key Features</h4>
                        <div className="features-grid">
                            {parsed.keyFeatures.map((feature: string, idx: number) => (
                                <div key={idx} className="feature-card">
                                    <span className="feature-text">{feature}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {parsed.uiComponents && (
                    <div className="spec-section">
                        <h4>UI Components</h4>
                        <div className="components-grid">
                            {parsed.uiComponents.map((component: string, idx: number) => (
                                <div key={idx} className="component-card">
                                    <span className="component-text">{component}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    } catch {
        return <pre className="json-content">{spec}</pre>;
    }
};

// Component for Structured Representation View
const StructuredRepView: React.FC<{ data: StructuredRepresentation }> = ({ data }) => {
    return (
        <div className="structured-rep-view">
            <div className="subsection">
                <h4>Interaction Flows</h4>
                {data.interactionFlows && (
                    <div className="flow-visualization">
                        {data.interactionFlows.nodes.map((node: any, idx: number) => (
                            <div key={idx} className="flow-node-card">
                                <div className="node-header">
                                    <span className="node-id">{node.id}</span>
                                </div>
                                <div className="node-body">
                                    <p className="node-desc">{node.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="subsection">
                <h4>Finite State Machines</h4>
                {data.finiteStateMachines.map((fsm: any, i: any) => (
                    <div key={i} className="fsm-item">
                        <h5>{fsm.componentId}</h5>
                        <div className="fsm-details">
                            <div className="fsm-states">
                                <strong>States:</strong> {fsm.states.join(', ')}
                            </div>
                            <div className="fsm-initial">
                                <strong>Initial:</strong> {fsm.initialState}
                            </div>
                            <div className="fsm-events">
                                <strong>Events:</strong> {fsm.events.join(', ')}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Component for Reward Function View
const RewardFunctionView: React.FC<{ data: RewardFunction }> = ({ data }) => {
    return (
        <div className="reward-function-view">
            {data.metrics.map((metric: any, i: any) => (
                <div key={i} className="metric-item">
                    <div className="metric-header">
                        <span className="metric-name">{metric.name}</span>
                        <span className="metric-weight">{(metric.weight * 100).toFixed(0)}%</span>
                    </div>
                    <p className="metric-description">{metric.description}</p>
                    <div className="metric-criteria">
                        <strong>Criteria:</strong>
                        <ul>
                            {metric.criteria.map((criterion: any, j: any) => (
                                <li key={j}>{criterion}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            ))}
        </div>
    );
};


// Execute contextual pipeline (for interactive mode)
async function executeContextualPipeline(
    interaction: import('./GenerativeUICore').CapturedInteraction,
    currentScreenHtml: string
) {
    if (!activeGenerativeUIState) return;
    
    const state = activeGenerativeUIState; // Capture for null-safety
    const model = getSelectedModel();
    const temperature = getSelectedTemperature();
    const topP = getSelectedTopP();
    
    // Step 1: Generate contextual requirement spec
    updateStatus('Step 1/2: Analyzing interaction and generating spec...');
    
    const contextualSpec = await retryOperation(async () => {
        const specPrompt = generativeUIPrompts.getContextualRequirementSpecPrompt(
            state.userQuery,
            state.interactionHistory,
            interaction,
            currentScreenHtml,  // Use passed HTML, not from interaction
            state.designSystem || undefined
        );
        
        const specResponse = await callAI(specPrompt, temperature, model, undefined, true, topP);
        
        const spec = parseJsonSafe(specResponse.text || '', 'contextual spec');
        if (!spec || typeof spec !== 'object') {
            throw new Error('Invalid contextual spec format');
        }
        return spec;
    }, 'Contextual Spec Generation');
    
    // Step 2: Generate contextual UI
    updateStatus('Step 2/2: Generating next screen based on spec...');
    
    const contextualCode = await retryOperation(async () => {
        const codePrompt = generativeUIPrompts.getContextualUIGenerationPrompt(
            state.userQuery,
            contextualSpec,
            currentScreenHtml,  // Use passed HTML
            interaction,
            state.designSystem || undefined
        );
        
        const codeResponse = await callAI(codePrompt, temperature, model, undefined, false, topP);
        
        const code = (codeResponse.text || '').replace(/^```html|```$/g, '').trim();
        if (!code || code.length < 50) {
            throw new Error('Generated code is too short or empty');
        }
        return code;
    }, 'Contextual UI Generation');
    
    if (!activeGenerativeUIState) return; // Safety check
    
    // Add to screen history
    const screenHistoryItem: import('./GenerativeUICore').ScreenHistoryItem = {
        screenHtml: contextualCode,
        spec: JSON.stringify(contextualSpec, null, 2),
        interaction: interaction,
        timestamp: Date.now()
    };
    
    activeGenerativeUIState.screenHistory.push(screenHistoryItem);
    activeGenerativeUIState.currentScreenIndex = activeGenerativeUIState.screenHistory.length - 1;
    
    // Inject tracking into the new screen
    const trackedCode = injectInteractionTracking(contextualCode);
    activeGenerativeUIState.finalCode = trackedCode;
    
    renderGenerativeUIMode();
    updateStatus('Next screen ready!');
}

// Helper for retry logic
async function retryOperation<T>(operation: () => Promise<T>, stepName: string): Promise<T> {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    let lastError: Error | null = null;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            if (i > 0) {
                updateStatus(stepName + ' (Retry ' + i + '/' + (MAX_RETRIES - 1) + ')...');
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, i - 1)));
            }
            return await operation();
        } catch (error) {
            lastError = error as Error;
            if (abortController?.signal.aborted) {
                throw new Error('Generation stopped by user');
            }
            if (i === MAX_RETRIES - 1) {
                throw lastError;
            }
        }
    }
    throw lastError;
}

// Start GenerativeUI process
export async function startGenerativeUIProcess(userQuery: string) {
    if (!userQuery || isGenerativeUIRunning) return;
    
    // Create initial state
    activeGenerativeUIState = {
        id: `genui-${Date.now()}`,
        userQuery,
        status: 'processing',
        currentStatus: 'Initializing...',
        activeTab: 'background', // Start with background tab to show progress
        enableIterativeRefinements: globalEnableIterativeRefinements, // Use global setting
        requirementSpec: null,
        structuredRep: null,
        rewardFunction: null,
        iterations: [],
        finalCode: null,
        error: null,
        // Interactive mode fields
        interactionHistory: [],
        screenHistory: [],
        currentScreenIndex: -1,
        designSystem: null,
        isInteractiveMode: false, // Will be enabled after first screen
        isProcessingInteraction: false,
        interactionQueue: [],
        lastInteractionTimestamp: 0,
        interactionSummary: undefined,
        maxHistorySize: Infinity // No limits
    };
    
    isGenerativeUIRunning = true;
    updateControlsState();
    abortController = new AbortController();
    
    // Re-render to show processing state
    renderGenerativeUIMode();
    
    try {
        // Execute the generation pipeline
        await executePipeline(userQuery);
    } catch (error) {
        if (abortController?.signal.aborted) {
            activeGenerativeUIState.error = 'Generation stopped by user';
            activeGenerativeUIState.status = 'stopped';
            activeGenerativeUIState.currentStatus = 'Generation stopped';
        } else if (error instanceof Error) {
            activeGenerativeUIState.error = error.message;
            activeGenerativeUIState.status = 'error';
            activeGenerativeUIState.currentStatus = 'Error: ' + error.message;
        } else {
            activeGenerativeUIState.error = 'An unknown error occurred';
            activeGenerativeUIState.status = 'error';
            activeGenerativeUIState.currentStatus = 'Error: Unknown error occurred';
        }
    } finally {
        isGenerativeUIRunning = false;
        updateControlsState();
        if (activeGenerativeUIState) {
            if (!activeGenerativeUIState.error) {
                activeGenerativeUIState.status = 'completed';
                activeGenerativeUIState.currentStatus = 'Generation complete!';
                // Switch to preview tab when complete
                activeGenerativeUIState.activeTab = 'preview';
            }
        }
        renderGenerativeUIMode();
    }
}

// Execute the generation pipeline with retry logic
async function executePipeline(userQuery: string) {
    if (!activeGenerativeUIState) return;
    
    const model = getSelectedModel();
    const temperature = getSelectedTemperature();
    const topP = getSelectedTopP();
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;
    
    // Helper function for retry logic
    async function retryOperation<T>(operation: () => Promise<T>, stepName: string): Promise<T> {
        let lastError: Error | null = null;
        for (let i = 0; i < MAX_RETRIES; i++) {
            try {
                if (i > 0) {
                    updateStatus(stepName + ' (Retry ' + i + '/' + (MAX_RETRIES - 1) + ')...');
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, i - 1)));
                }
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (abortController?.signal.aborted) {
                    throw new Error('Generation stopped by user');
                }
                if (i === MAX_RETRIES - 1) {
                    throw lastError;
                }
            }
        }
        throw lastError;
    }
    
    // Step 1: Generate Requirement Specification
    updateStatus('1. Generating Requirement Specification...');
    const reqSpec = await retryOperation(async () => {
        const reqSpecPrompt = generativeUIPrompts.getRequirementSpecPrompt(userQuery);
        const reqSpecResponse = await callAI(
            reqSpecPrompt,
            temperature,
            model,
            undefined,
            true,
            topP
        );
        const spec = parseJsonSafe(reqSpecResponse.text || '', 'requirement specification');
        if (!spec || typeof spec !== 'object') {
            throw new Error('Invalid requirement specification format');
        }
        return spec;
    }, '1. Generating Requirement Specification');
    
    activeGenerativeUIState.requirementSpec = JSON.stringify(reqSpec, null, 2);
    renderGenerativeUIMode();
    
    if (abortController?.signal.aborted) throw new Error('Generation stopped by user');
    
    // Step 2: Generate Structured Representation
    updateStatus('2. Generating Structured Representation...');
    const structRep = await retryOperation(async () => {
        const structRepPrompt = generativeUIPrompts.getStructuredRepPrompt(reqSpec);
        const structRepResponse = await callAI(
            structRepPrompt,
            temperature,
            model,
            undefined,
            true,
            topP
        );
        const rep = parseJsonSafe(structRepResponse.text || '', 'structured representation') as StructuredRepresentation;
        if (!rep || !rep.interactionFlows || !rep.finiteStateMachines) {
            throw new Error('Invalid structured representation format');
        }
        return rep;
    }, '2. Generating Structured Representation');
    
    activeGenerativeUIState.structuredRep = structRep;
    renderGenerativeUIMode();
    
    if (abortController?.signal.aborted) throw new Error('Generation stopped by user');
    
    // Step 3: Generate Adaptive Reward Function
    updateStatus('3. Generating Adaptive Reward Function...');
    const rewardFn = await retryOperation(async () => {
        const rewardFnPrompt = generativeUIPrompts.getRewardFunctionPrompt(userQuery);
        const rewardFnResponse = await callAI(
            rewardFnPrompt,
            temperature,
            model,
            undefined,
            true,
            topP
        );
        const fn = parseJsonSafe(rewardFnResponse.text || '', 'reward function') as RewardFunction;
        if (!fn || !fn.metrics || !Array.isArray(fn.metrics)) {
            throw new Error('Invalid reward function format');
        }
        // Validate weights sum to 1.0
        const weightSum = fn.metrics.reduce((sum, m) => sum + (m.weight || 0), 0);
        if (Math.abs(weightSum - 1.0) > 0.01) {
            // Normalize weights if they don't sum to 1
            fn.metrics = fn.metrics.map(m => ({ ...m, weight: m.weight / weightSum }));
        }
        return fn;
    }, '3. Generating Adaptive Reward Function');
    
    activeGenerativeUIState.rewardFunction = rewardFn;
    renderGenerativeUIMode();
    
    if (abortController?.signal.aborted) throw new Error('Generation stopped by user');
    
    // Step 4: Iterative UI Refinement (or single generation if disabled)
    let currentCode = "";
    let lastEvaluation: EvaluationResult | undefined;
    
    const iterationsToRun = activeGenerativeUIState.enableIterativeRefinements ? MAX_ITERATIONS : 1;
    
    for (let i = 1; i <= iterationsToRun; i++) {
        const stepLabel = activeGenerativeUIState.enableIterativeRefinements 
            ? '4. Iterative Refinement (' + i + '/' + iterationsToRun + ')... Generating UI...'
            : '4. Generating UI...';
        updateStatus(stepLabel);
        
        if (abortController?.signal.aborted) throw new Error('Generation stopped by user');
        
        const uiGeneration = await retryOperation(async () => {
            const generationPrompt = generativeUIPrompts.getUIGenerationPrompt(
                userQuery,
                reqSpec,
                structRep,
                i > 1 ? currentCode : undefined,
                lastEvaluation
            );
            
            const uiResponse = await callAI(
                generationPrompt,
                temperature,
                model,
                undefined,
                false,
                topP
            );
            const code = (uiResponse.text || '').replace(/^```html|```$/g, '').trim();
            if (!code || code.length < 50) {
                throw new Error('Generated code is too short or empty');
            }
            return code;
        }, activeGenerativeUIState.enableIterativeRefinements 
            ? '4. Iterative Refinement (' + i + '/' + iterationsToRun + ') - Generation'
            : '4. UI Generation');
        
        currentCode = uiGeneration;
        
        const evalLabel = activeGenerativeUIState.enableIterativeRefinements
            ? '4. Iterative Refinement (' + i + '/' + iterationsToRun + ')... Evaluating UI...'
            : '4. Evaluating UI...';
        updateStatus(evalLabel);
        
        if (abortController?.signal.aborted) throw new Error('Generation stopped by user');
        
        const evaluation = await retryOperation(async () => {
            const evalPrompt = generativeUIPrompts.getEvaluationPrompt(userQuery, rewardFn, currentCode);
            const evalResponse = await callAI(
                evalPrompt,
                temperature,
                model,
                undefined,
                true,
                topP
            );
            
            const evalResult = parseJsonSafe(evalResponse.text || '', 'evaluation result') as EvaluationResult;
            if (!evalResult || !evalResult.metricScores || typeof evalResult.finalScore !== 'number') {
                throw new Error('Invalid evaluation result format');
            }
            return evalResult;
        }, activeGenerativeUIState.enableIterativeRefinements
            ? '4. Iterative Refinement (' + i + '/' + iterationsToRun + ') - Evaluation'
            : '4. UI Evaluation');
        
        lastEvaluation = evaluation;
        
        const iterationState: IterationState = {
            iteration: i,
            code: currentCode,
            evaluation: lastEvaluation
        };
        
        activeGenerativeUIState.iterations.push(iterationState);
        
        // Check if quality threshold is met (only for iterative mode)
        if (activeGenerativeUIState.enableIterativeRefinements && 
            lastEvaluation.finalScore >= QUALITY_THRESHOLD && 
            i < iterationsToRun) {
            updateStatus('Quality threshold met. Finalizing...');
            break;
        }
    }
    
    // After generation complete, inject tracking and enable interactive mode
    updateStatus('Enabling interactive mode...');
    
    let designSys: import('./GenerativeUICore').DesignSystem | null = null;
    
    try {
        // Extract design system from first generated code
        designSys = extractDesignSystem(currentCode);
        activeGenerativeUIState.designSystem = designSys;
        
        // Inject interaction tracking into the code
        const trackedCode = injectInteractionTracking(currentCode);
        activeGenerativeUIState.finalCode = trackedCode;
    } catch (error) {
        // Fallback: use code without tracking
        activeGenerativeUIState.finalCode = currentCode;
        activeGenerativeUIState.isInteractiveMode = false;
    }
    
    // Add to screen history
    const initialScreenHistoryItem: import('./GenerativeUICore').ScreenHistoryItem = {
        screenHtml: currentCode,
        spec: activeGenerativeUIState.requirementSpec || '',
        timestamp: Date.now(),
        designSystem: designSys || undefined
    };
    activeGenerativeUIState.screenHistory.push(initialScreenHistoryItem);
    activeGenerativeUIState.currentScreenIndex = 0;
    
    // Enable interactive mode
    activeGenerativeUIState.isInteractiveMode = true;
    
    renderGenerativeUIMode();
    updateStatus('Done! Interactive mode enabled. Click elements to continue the UI evolution.');
}

function updateStatus(status: string) {
    if (activeGenerativeUIState) {
        activeGenerativeUIState.currentStatus = status;
        renderGenerativeUIMode();
    }
}

// Stop GenerativeUI process
export function stopGenerativeUIProcess() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    isGenerativeUIRunning = false;
    if (activeGenerativeUIState) {
        activeGenerativeUIState.status = 'stopped';
        activeGenerativeUIState.currentStatus = 'Generation stopped by user';
    }
    updateControlsState();
    renderGenerativeUIMode();
}

// Check if GenerativeUI mode is active
export function isGenerativeUIModeActive(): boolean {
    return isGenerativeUIRunning;
}

// Clean up GenerativeUI mode
export function cleanupGenerativeUIMode() {
    // Stop any running process
    if (isGenerativeUIRunning) {
        stopGenerativeUIProcess();
    }
    // Unmount React root
    if (generativeUIRoot) {
        try {
            generativeUIRoot.unmount();
        } catch (e) {
            // Cleanup error - non-critical
        }
        generativeUIRoot = null;
    }
    // Clear state
    activeGenerativeUIState = null;
    isGenerativeUIRunning = false;
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
}

// Get active GenerativeUI state (for export/import)
export function getActiveGenerativeUIState(): GenerativeUIState | null {
    return activeGenerativeUIState;
}

// Set active GenerativeUI state (for import)
export function setActiveGenerativeUIStateForImport(state: GenerativeUIState | null) {
    if (state) {
        // Handle backward compatibility: if enableIterativeRefinements is not set, default to true
        if (state.enableIterativeRefinements === undefined) {
            state.enableIterativeRefinements = true;
        }
        // Handle backward compatibility for new interactive mode fields
        if (state.interactionHistory === undefined) {
            state.interactionHistory = [];
        }
        if (state.screenHistory === undefined) {
            state.screenHistory = [];
        }
        if (state.currentScreenIndex === undefined) {
            state.currentScreenIndex = -1;
        }
        if (state.designSystem === undefined) {
            state.designSystem = null;
        }
        if (state.isInteractiveMode === undefined) {
            state.isInteractiveMode = false;
        }
        // New scalability fields
        if (state.isProcessingInteraction === undefined) {
            state.isProcessingInteraction = false;
        }
        if (state.interactionQueue === undefined) {
            state.interactionQueue = [];
        }
        if (state.lastInteractionTimestamp === undefined) {
            state.lastInteractionTimestamp = 0;
        }
        if (state.maxHistorySize === undefined) {
            state.maxHistorySize = Infinity; // No limits
        }
    }
    activeGenerativeUIState = state;
    if (state) {
        renderGenerativeUIMode();
    }
}
