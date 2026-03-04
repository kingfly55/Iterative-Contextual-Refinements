import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { globalState } from '../Core/State';
import { IterationData, PipelineState } from '../Core/Types';
import RenderMathMarkdown from '../Styles/Components/RenderMathMarkdown';
import { getEmptyStateMessage } from '../UI/CommonUI';
import { activateTab } from '../Core/AppRouter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;

function isEmptyOrPlaceholder(content?: string): boolean {
    return (
        !content ||
        content.trim() === '' ||
        content.includes('<!-- No HTML generated yet') ||
        content.includes('<!-- No valid HTML was generated') ||
        content.includes('<!-- HTML generation cancelled. -->')
    );
}

function statusLabel(iter: IterationData): string {
    if (iter.status === 'retrying' && iter.retryAttempt !== undefined) {
        return `Retrying (${iter.retryAttempt}/${MAX_RETRIES})...`;
    }
    const map: Record<string, string> = { error: 'Error', cancelled: 'Cancelled' };
    return map[iter.status] ?? (iter.status.charAt(0).toUpperCase() + iter.status.slice(1));
}

// ---------------------------------------------------------------------------
// LivePreviewPane — the right-side iframe panel only.
// ---------------------------------------------------------------------------

interface LivePreviewPaneProps {
    pipelineId: number;
    iterationNumber: number;
    content: string;
    status: IterationData['status'];
    hasContent: boolean;
}

const LivePreviewPane: React.FC<LivePreviewPaneProps> = ({ pipelineId, iterationNumber, content, status, hasContent }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !hasContent) return;

        const blob = new Blob([content], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        iframe.src = blobUrl;

        const revoke = () => setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        iframe.addEventListener('load', revoke, { once: true });
        return () => {
            iframe.removeEventListener('load', revoke);
            URL.revokeObjectURL(blobUrl);
        };
    }, [content, hasContent]);

    const handleFullscreen = useCallback(async () => {
        if (!hasContent) return;
        const { openLivePreviewFullscreen } = await import('../Styles/Components/ActionButton');
        openLivePreviewFullscreen(content);
    }, [content, hasContent]);

    return (
        <div className="preview-column" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="model-detail-section preview-section">
                <div className="model-section-header">
                    <h5 className="model-section-title">Live Preview</h5>
                    <button
                        className="button button-icon"
                        type="button"
                        disabled={!hasContent}
                        title="Toggle Fullscreen Preview"
                        aria-label="Toggle Fullscreen Preview"
                        onClick={handleFullscreen}
                    >
                        <span className="icon-fullscreen material-symbols-outlined">fullscreen</span>
                    </button>
                </div>
                <div className="preview-container diff-preview-container">
                    {hasContent ? (
                        <iframe
                            ref={iframeRef}
                            sandbox="allow-scripts allow-forms allow-popups allow-modals"
                            title={`Content Preview for Iteration ${iterationNumber} of Pipeline ${pipelineId + 1}`}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                    ) : (
                        <div className="empty-state-message">{getEmptyStateMessage(status, 'Preview')}</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// IterationCard — a single pipeline iteration rendered as a React component.
// Layout: .info-column (left) | .preview-column (right)
// info-column order: error → Generated Content → Feature Suggestions
// ---------------------------------------------------------------------------

interface IterationCardProps {
    pipelineId: number;
    iter: IterationData;
}

const IterationCard: React.FC<IterationCardProps> = ({ pipelineId, iter }) => {
    const hasContent = !!iter.generatedContent && !isEmptyOrPlaceholder(iter.generatedContent);
    // Show suggestions card whenever there is any non-empty suggestion text
    const suggestionsText = iter.suggestedFeaturesContent ?? '';
    const hasSuggestions = suggestionsText.length > 0;
    // Show the generated content section for all meaningful statuses
    const showContentSection = hasContent || ['completed', 'error', 'retrying', 'processing', 'pending', 'cancelled'].includes(iter.status);

    const handleCompare = useCallback(async () => {
        if (!hasContent) return;
        const { openDiffModal } = await import('../Styles/Components/DiffModal/DiffModalController');
        openDiffModal(pipelineId, iter.iterationNumber, 'html');
    }, [pipelineId, iter.iterationNumber, hasContent]);

    return (
        <li className="model-detail-card" style={{ overflow: 'hidden', contain: 'layout' }}>
            <div className="model-detail-header">
                <div className="model-title-area">
                    <h4 className="model-title">{iter.title}</h4>
                </div>
                <div className="model-card-actions">
                    <span className={`status-badge status-${iter.status}`}>{statusLabel(iter)}</span>
                </div>
            </div>

            <div className="iteration-details iteration-grid-website">
                {/* Left column: error → Generated Content → Feature Suggestions */}
                <div className="info-column" style={{ minWidth: 0, overflow: 'hidden' }}>
                    {iter.error && (
                        <div className="status-message error">
                            <pre>{iter.error}</pre>
                        </div>
                    )}

                    {showContentSection && (
                        <div className="model-detail-section">
                            <div className="model-section-header">
                                <span className="model-section-title">Generated Content</span>
                                <div className="code-actions">
                                    <button
                                        className="compare-output-button button"
                                        type="button"
                                        disabled={!hasContent}
                                        onClick={handleCompare}
                                    >
                                        <span className="material-symbols-outlined">compare_arrows</span>
                                        <span className="button-text">Compare</span>
                                    </button>
                                </div>
                            </div>
                            <div
                                className="scrollable-content-area custom-scrollbar"
                                style={{ padding: '0 12px' }}
                            >
                                {hasContent ? (
                                    <RenderMathMarkdown content={iter.generatedContent!} />
                                ) : (
                                    <div className="empty-state-message">{getEmptyStateMessage(iter.status, 'Content')}</div>
                                )}
                            </div>
                        </div>
                    )}

                    {hasSuggestions && (
                        <div className="model-detail-section">
                            <h5 className="model-section-title">Feature Suggestions</h5>
                            <div className="feature-suggestions-container">
                                <RenderMathMarkdown content={suggestionsText} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Right column: Live Preview iframe — always shown alongside content section */}
                {showContentSection && (
                    <LivePreviewPane
                        pipelineId={pipelineId}
                        iterationNumber={iter.iterationNumber}
                        content={iter.generatedContent ?? ''}
                        status={iter.status}
                        hasContent={hasContent}
                    />
                )}
            </div>
        </li>
    );
};

// ---------------------------------------------------------------------------
// PipelinePanel — content panel for one pipeline. Subscribes to custom events
// fired by WebsiteUI.ts to re-render when globalState mutates.
// ---------------------------------------------------------------------------

interface PipelinePanelProps {
    pipeline: PipelineState;
    isActive: boolean;
}

const PipelinePanel: React.FC<PipelinePanelProps> = ({ pipeline, isActive }) => {
    const [, setTick] = useState(0);
    const forceUpdate = useCallback(() => setTick(t => t + 1), []);

    useEffect(() => {
        const handler = (e: Event) => {
            const { pipelineId } = (e as CustomEvent).detail;
            if (pipelineId === pipeline.id) forceUpdate();
        };
        window.addEventListener('refine:iteration-updated', handler);
        window.addEventListener('refine:pipeline-status', handler);
        return () => {
            window.removeEventListener('refine:iteration-updated', handler);
            window.removeEventListener('refine:pipeline-status', handler);
        };
    }, [pipeline.id, forceUpdate]);

    return (
        <div
            className={`pipeline-content${isActive ? ' active' : ''}`}
            id={`pipeline-content-${pipeline.id}`}
            role="tabpanel"
            aria-labelledby={`pipeline-tab-${pipeline.id}`}
        >
            <ul className="iterations-list" id={`iterations-list-${pipeline.id}`}>
                {pipeline.iterations.map(iter => (
                    <IterationCard key={iter.iterationNumber} pipelineId={pipeline.id} iter={iter} />
                ))}
            </ul>
        </div>
    );
};

// ---------------------------------------------------------------------------
// TabBar — rendered via a React Portal into #tabs-nav-container so that tabs
// appear in the correct header location while the panels stay in
// #pipelines-content-container.
// ---------------------------------------------------------------------------

interface TabBarProps {
    pipelines: PipelineState[];
    activePipelineId: number | null;
    onTabClick: (id: number) => void;
    onViewEvolution: () => void;
    tabsNavContainer: HTMLElement;
}

const TabBar: React.FC<TabBarProps> = ({ pipelines, activePipelineId, onTabClick, onViewEvolution, tabsNavContainer }) => {
    return createPortal(
        <>
            {pipelines.map((pipeline, index) => (
                <button
                    key={pipeline.id}
                    id={`pipeline-tab-${pipeline.id}`}
                    className={`tab-button status-${pipeline.status}${activePipelineId === pipeline.id ? ' active' : ''}`}
                    role="tab"
                    aria-selected={activePipelineId === pipeline.id}
                    onClick={() => onTabClick(pipeline.id)}
                >
                    Pipeline {index + 1}
                </button>
            ))}
            {pipelines.length > 0 && (
                <button
                    id="main-view-evolution-button"
                    className="main-view-evolution-button"
                    title="View content evolution timeline"
                    onClick={onViewEvolution}
                >
                    <span className="material-symbols-outlined">movie</span>
                    <span className="button-text">View Evolution</span>
                </button>
            )}
        </>,
        tabsNavContainer
    );
};

// ---------------------------------------------------------------------------
// RefinePipelineTabs — root component mounted into #pipelines-content-container.
// Portals the tab bar into #tabs-nav-container and renders panels inline.
// ---------------------------------------------------------------------------

export const RefinePipelineTabs: React.FC = () => {
    const [activePipelineId, setActivePipelineId] = useState<number | null>(
        globalState.activePipelineId ?? (globalState.pipelinesState[0]?.id ?? null)
    );
    const [, setTick] = useState(0);
    const forceUpdate = useCallback(() => setTick(t => t + 1), []);

    const tabsNavContainer = document.getElementById('tabs-nav-container');

    const handleTabClick = useCallback((id: number) => {
        setActivePipelineId(id);
        activateTab(id);
    }, []);

    useEffect(() => {
        const handler = () => forceUpdate();
        window.addEventListener('refine:pipeline-status', handler);
        return () => window.removeEventListener('refine:pipeline-status', handler);
    }, [forceUpdate]);

    const handleViewEvolution = useCallback(async () => {
        const { openEvolutionViewer } = await import('../Styles/Components/DiffModal/EvolutionViewer');
        const pipeline =
            globalState.pipelinesState.find(p => p.id === activePipelineId) ??
            globalState.pipelinesState.find(p => p.iterations?.length > 0) ??
            globalState.pipelinesState[0];
        if (pipeline) openEvolutionViewer(pipeline.id);
    }, [activePipelineId]);

    const pipelines = globalState.pipelinesState;

    return (
        <>
            {/* Portal tabs into the header's #tabs-nav-container */}
            {tabsNavContainer && (
                <TabBar
                    pipelines={pipelines}
                    activePipelineId={activePipelineId}
                    onTabClick={handleTabClick}
                    onViewEvolution={handleViewEvolution}
                    tabsNavContainer={tabsNavContainer}
                />
            )}

            {/* Pipeline content panels render inline in #pipelines-content-container */}
            {pipelines.map(pipeline => (
                <PipelinePanel
                    key={pipeline.id}
                    pipeline={pipeline}
                    isActive={pipeline.id === activePipelineId}
                />
            ))}
        </>
    );
};

// ---------------------------------------------------------------------------
// renderWebsiteMode — mounts RefinePipelineTabs into the content container.
// Called by AppRouter after pipelines are initialised.
// ---------------------------------------------------------------------------

let refinePipelinesRoot: Root | null = null;

export function renderWebsiteMode(
    _tabsNavContainer: HTMLElement | null,
    pipelinesContentContainer: HTMLElement | null
) {
    if (!pipelinesContentContainer) return;
    if (refinePipelinesRoot) {
        refinePipelinesRoot.unmount();
        refinePipelinesRoot = null;
    }
    refinePipelinesRoot = createRoot(pipelinesContentContainer);
    refinePipelinesRoot.render(React.createElement(RefinePipelineTabs));
}


