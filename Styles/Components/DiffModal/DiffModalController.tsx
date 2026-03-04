import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ActionButtonGroup } from '../ActionButton';
import {
    DiffViewMode,
    DiffContentType,
    Pipeline,
} from './types';
import {
    computeDiffStats,
    generateUnifiedDiffHTML,
    generateSplitDiffHTML,
    applyDiffTheme,
    renderMathIntoElement,
    highlightCodeBlocks,
    extractIterationContent,
    resolveModalTitle,
    buildDiffTargetTree,
    resolveGlobalCompareContent,
} from './DiffModalController';

// ─── Types ────────────────────────────────────────────────────────────────────

type DiffMode = 'instant-fixes' | 'global-compare';
type InstantFixesView = 'side-by-side' | 'diff-analysis' | 'preview';

// ─── Diff Stats Bar ───────────────────────────────────────────────────────────

interface DiffStatsProps {
    added: number;
    removed: number;
    total: number;
}

const DiffStats: React.FC<DiffStatsProps> = ({ added, removed, total }) => (
    <div id="header-diff-stats" className="header-diff-stats visible">
        <div className="diff-stat-item diff-stat-additions">
            <span className="diff-stat-sign">+</span>
            <span>{added} lines</span>
        </div>
        <div className="diff-stat-item diff-stat-deletions">
            <span className="diff-stat-sign">-</span>
            <span>{removed} lines</span>
        </div>
        <div className="diff-stat-item diff-stat-total">
            <span className="material-symbols-outlined">difference</span>
            <span>{total} changes</span>
        </div>
    </div>
);

// ─── Diff Viewer Panel (handles d2h rendering) ────────────────────────────────

interface DiffViewerPanelProps {
    id: string;
    sourceText: string;
    targetText: string;
    viewMode: DiffViewMode;
    className?: string;
}

const DiffViewerPanel: React.FC<DiffViewerPanelProps> = ({ id, sourceText, targetText, viewMode, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || !sourceText || !targetText) return;
        const html = viewMode === 'split'
            ? generateSplitDiffHTML(sourceText, targetText)
            : generateUnifiedDiffHTML(sourceText, targetText);
        containerRef.current.innerHTML = html;
        applyDiffTheme(containerRef.current);
    }, [sourceText, targetText, viewMode]);

    return <div id={id} ref={containerRef} className={`diff-viewer-container custom-scrollbar ${className ?? ''}`} />;
};

// ─── Side-by-Side Rendered Content Panel ─────────────────────────────────────

interface RenderedContentPanelProps {
    id: string;
    content: string;
    className?: string;
}

const RenderedContentPanel: React.FC<RenderedContentPanelProps> = ({ id, content, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const idleCb = typeof requestIdleCallback !== 'undefined'
            ? requestIdleCallback
            : (fn: () => void) => setTimeout(fn, 16);

        // Defer ALL heavy work (markdown+math pipeline + Shiki) to idle time
        // so the modal opens instantly without blocking the render thread.
        const handle = idleCb(() => {
            if (!el.isConnected) return;
            renderMathIntoElement(el, content);
            const codeBlocks = el.querySelectorAll('pre code');
            if (codeBlocks.length > 0) highlightCodeBlocks(el);
        });

        return () => {
            if (typeof cancelIdleCallback !== 'undefined' && typeof handle === 'number') {
                cancelIdleCallback(handle);
            }
        };
    }, [content]);

    return <div id={id} ref={containerRef} className={`comparison-content custom-scrollbar ${className ?? ''}`} />;
};

// ─── Instant Fixes Panel ──────────────────────────────────────────────────────

interface InstantFixesPanelProps {
    activeView: InstantFixesView;
    sourceContent: string;
    targetContent: string;
    sourceTitle: string;
    targetTitle: string;
    viewMode: DiffViewMode;
    isHtmlContent: boolean;
}

const InstantFixesPanel: React.FC<InstantFixesPanelProps> = ({
    activeView,
    sourceContent,
    targetContent,
    sourceTitle,
    targetTitle,
    viewMode,
    isHtmlContent
}) => {
    // Track which views have been visited — once mounted, keep them in DOM to
    // avoid re-processing on tab switch, but don't mount until first visited.
    const [mounted, setMounted] = useState<Record<InstantFixesView, boolean>>({ 'side-by-side': true, 'diff-analysis': false, 'preview': false });

    useEffect(() => {
        setMounted(prev => prev[activeView] ? prev : { ...prev, [activeView]: true });
    }, [activeView]);

    const previewSourceRef = useRef<HTMLIFrameElement>(null);
    const previewTargetRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (activeView !== 'preview' || !isHtmlContent) return;
        if (previewSourceRef.current) previewSourceRef.current.srcdoc = sourceContent;
        if (previewTargetRef.current) previewTargetRef.current.srcdoc = targetContent;
    }, [activeView, sourceContent, targetContent, isHtmlContent]);

    return (
        <div className="instant-fixes-content">
            {/* Side-by-side view — always mounted (default tab) */}
            <div id="side-by-side-view" className={`instant-fixes-view${activeView === 'side-by-side' ? ' active' : ''}`}>
                <div className="side-by-side-comparison">
                    <div className="comparison-side">
                        <div className="preview-header">
                            <h4 className="comparison-title">
                                <span className="material-symbols-outlined">psychology</span>
                                <span>{sourceTitle}</span>
                            </h4>
                            <ActionButtonGroup
                                type="source"
                                view="instant"
                                contentSource={() => sourceContent}
                            />
                        </div>
                        <RenderedContentPanel id="diff-source-content" content={sourceContent} />
                    </div>
                    <div className="comparison-side">
                        <div className="preview-header">
                            <h4 className="comparison-title">
                                <span className="material-symbols-outlined">auto_fix_high</span>
                                <span>{targetTitle}</span>
                            </h4>
                            <ActionButtonGroup
                                type="target"
                                view="instant"
                                contentSource={() => targetContent}
                            />
                        </div>
                        <RenderedContentPanel id="diff-target-content" content={targetContent} />
                    </div>
                </div>
            </div>

            {/* Diff analysis view — mounted lazily on first visit */}
            <div id="diff-analysis-view" className={`instant-fixes-view${activeView === 'diff-analysis' ? ' active' : ''}`}>
                {mounted['diff-analysis']
                    ? <DiffViewerPanel
                        id="instant-fixes-diff-viewer"
                        sourceText={sourceContent}
                        targetText={targetContent}
                        viewMode={viewMode}
                    />
                    : <div id="instant-fixes-diff-viewer" className="diff-viewer-container custom-scrollbar">
                        <div className="empty-state-message"><p>Click &ldquo;Diff Analysis&rdquo; to see detailed line-by-line changes</p></div>
                    </div>
                }
            </div>

            {/* Preview view — mounted lazily on first visit */}
            <div id="preview-view" className={`instant-fixes-view${activeView === 'preview' ? ' active' : ''}`}>
                {mounted['preview'] && (
                    <div className="preview-comparison">
                        <div className="preview-side">
                            <div className="preview-header">
                                <h4 className="comparison-title">
                                    <span className="material-symbols-outlined">psychology</span>
                                    <span>{sourceTitle}</span>
                                </h4>
                                <div className="preview-controls">
                                    <ActionButtonGroup type="source" view="preview" contentSource={() => sourceContent} />
                                </div>
                            </div>
                            <iframe
                                ref={previewSourceRef}
                                id="preview-source-frame"
                                className="preview-frame"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                        <div className="preview-side">
                            <div className="preview-header">
                                <h4 className="comparison-title">
                                    <span className="material-symbols-outlined">auto_fix_high</span>
                                    <span>{targetTitle}</span>
                                </h4>
                                <ActionButtonGroup type="target" view="preview" contentSource={() => targetContent} />
                            </div>
                            <iframe
                                ref={previewTargetRef}
                                id="preview-target-frame"
                                className="preview-frame"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Global Compare Panel ─────────────────────────────────────────────────────

interface GlobalComparePanelProps {
    sourceLabel: string;
    pipelines: Pipeline[];
    sourceContent: string;
    targetContent: string;
    viewMode: DiffViewMode;
    onSelectTarget: (pipelineId: number, iterationNumber: number) => void;
    selectedTarget: { pipelineId: number; iterationNumber: number } | null;
}

const GlobalComparePanel: React.FC<GlobalComparePanelProps> = ({
    sourceLabel,
    pipelines,
    sourceContent,
    targetContent,
    viewMode,
    onSelectTarget,
    selectedTarget
}) => {
    const treeData = buildDiffTargetTree(pipelines);

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <aside id="diff-selector-panel" className="inspector-panel custom-scrollbar" style={{ width: 300, flexShrink: 0 }}>
                <div className="sidebar-section-content">
                    <div id="diff-source-display" className="input-group">
                        <h4 className="model-section-title">Source (A)</h4>
                        <p id="diff-source-label">{sourceLabel}</p>
                    </div>
                    <div className="input-group" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                        <h4 className="model-section-title">Select Target (B)</h4>
                        <div id="diff-target-tree" className="custom-scrollbar" style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                            {treeData.map(group => (
                                <div key={group.pipelineId} className="diff-target-pipeline-group">
                                    <div className="diff-target-pipeline-header">{group.pipelineLabel}</div>
                                    <div className="diff-target-iterations">
                                        {group.iterations.map(iter => {
                                            const isActive = selectedTarget?.pipelineId === group.pipelineId && selectedTarget?.iterationNumber === iter.iterationNumber;
                                            return (
                                                <div
                                                    key={iter.iterationNumber}
                                                    className={`diff-target-iteration-item${isActive ? ' active' : ''}`}
                                                    onClick={() => onSelectTarget(group.pipelineId, iter.iterationNumber)}
                                                >
                                                    {iter.label}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </aside>
            <div id="diff-viewer-panel" className="custom-scrollbar" style={{ flex: 1 }}>
                {selectedTarget && sourceContent && targetContent
                    ? <DiffViewerPanel
                        id="diff-viewer-panel-inner"
                        sourceText={sourceContent}
                        targetText={targetContent}
                        viewMode={viewMode}
                    />
                    : <div className="diff-no-selection empty-state-message">
                        <p>Select a target from the list to view differences.</p>
                    </div>
                }
            </div>
        </div>
    );
};

// ─── Main Diff Modal ──────────────────────────────────────────────────────────

interface DiffModalProps {
    initialPipelineId: number;
    initialIterationNumber: number;
    contentType: DiffContentType;
    pipelines: Pipeline[];
    onClose: () => void;
}

const DiffModal: React.FC<DiffModalProps> = ({
    initialPipelineId,
    initialIterationNumber,
    contentType,
    pipelines,
    onClose
}) => {
    const [currentPipelineId] = useState(initialPipelineId);
    const [currentIterationNumber, setCurrentIterationNumber] = useState(initialIterationNumber);
    const [diffMode, setDiffMode] = useState<DiffMode>('instant-fixes');
    const [instantView, setInstantView] = useState<InstantFixesView>('side-by-side');
    const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>('split');
    const [selectedTarget, setSelectedTarget] = useState<{ pipelineId: number; iterationNumber: number } | null>(null);
    const [globalCompareContents, setGlobalCompareContents] = useState<{ source: string; target: string } | null>(null);

    const pipeline = pipelines.find(p => p.id === currentPipelineId);
    const iteration = pipeline?.iterations.find(i => i.iterationNumber === currentIterationNumber);
    const iterationContent = iteration ? extractIterationContent(iteration, contentType) : null;

    const sourceContent = iterationContent?.sourceContent ?? '';
    const targetContent = iterationContent?.targetContent ?? '';
    const sourceTitle = iterationContent?.sourceTitle ?? 'Source';
    const targetTitle = iterationContent?.targetTitle ?? 'Target';
    const modalTitle = pipeline ? resolveModalTitle(pipeline, currentIterationNumber) : 'Compare Outputs';
    const sourceLabel = pipeline && iteration ? `${iteration.title} — Source (A)` : 'None selected';

    const allIterNums = pipeline?.iterations
        .filter(i => i.generatedContent || i.contentBeforeBugFix)
        .map(i => i.iterationNumber)
        .sort((a, b) => a - b) ?? [];
    const hasPrev = currentIterationNumber > (allIterNums[0] ?? currentIterationNumber);
    const hasNext = currentIterationNumber < (allIterNums[allIterNums.length - 1] ?? currentIterationNumber);

    const stats = computeDiffStats(sourceContent, targetContent);

    // Recompute global compare contents whenever source iteration changes or target changes
    const recomputeGlobalCompare = useCallback((targetPipelineId: number, targetIterNum: number, srcIterNum: number) => {
        const result = resolveGlobalCompareContent(
            { pipelineId: currentPipelineId, iterationNumber: srcIterNum, contentType, content: '', title: '' },
            targetPipelineId,
            targetIterNum,
            pipelines
        );
        if (result) setGlobalCompareContents({ source: result.sourceContent, target: result.targetContent });
    }, [currentPipelineId, contentType, pipelines]);

    // When iteration changes in global compare mode, refresh the diff
    useEffect(() => {
        if (diffMode !== 'global-compare' || !selectedTarget) return;
        recomputeGlobalCompare(selectedTarget.pipelineId, selectedTarget.iterationNumber, currentIterationNumber);
    }, [currentIterationNumber, diffMode, selectedTarget, recomputeGlobalCompare]);

    const handleSelectTarget = useCallback((pipelineId: number, iterationNumber: number) => {
        setSelectedTarget({ pipelineId, iterationNumber });
        recomputeGlobalCompare(pipelineId, iterationNumber, currentIterationNumber);
    }, [currentIterationNumber, recomputeGlobalCompare]);

    const handleDiffModeChange = useCallback((mode: DiffMode) => {
        setDiffMode(mode);
        if (mode === 'instant-fixes') {
            setInstantView('side-by-side');
        } else if (mode === 'global-compare') {
            // Auto-select default target: same iteration of same pipeline — compares
            // contentBeforeBugFix (source A) vs generatedContent (target B)
            const defaultTarget = { pipelineId: currentPipelineId, iterationNumber: currentIterationNumber };
            setSelectedTarget(defaultTarget);
            recomputeGlobalCompare(defaultTarget.pipelineId, defaultTarget.iterationNumber, currentIterationNumber);
        }
    }, [currentPipelineId, currentIterationNumber, recomputeGlobalCompare]);

    const handleInstantViewChange = useCallback((view: InstantFixesView) => {
        setInstantView(view);
    }, []);

    // ESC + overlay click
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            id="diff-modal-overlay"
            className="modal-overlay fullscreen-modal is-visible"
            style={{ display: 'flex' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="modal-content" role="dialog" aria-modal="true">
                {/* Header */}
                <header className="modal-header">
                    <div className="modal-header-left">
                        <h2 className="modal-title" id="diff-modal-title">{modalTitle}</h2>
                    </div>
                    <div className="modal-header-right">
                        <div className="diff-modal-controls">
                            <button
                                id="instant-fixes-button"
                                className={`button diff-mode-button${diffMode === 'instant-fixes' ? ' active' : ''}`}
                                onClick={() => handleDiffModeChange('instant-fixes')}
                            >
                                <span className="material-symbols-outlined">auto_fix_high</span>
                                <span className="button-text">Instant Fixes</span>
                            </button>
                            <button
                                id="diff-analysis-view-button"
                                className={`view-mode-button${instantView === 'diff-analysis' && diffMode === 'instant-fixes' ? ' active' : ''}`}
                                style={{ display: diffMode === 'instant-fixes' ? 'flex' : 'none' }}
                                onClick={() => handleInstantViewChange('diff-analysis')}
                            >
                                <span className="material-symbols-outlined">difference</span>
                                <span className="button-text">Diff Analysis</span>
                            </button>
                            <button
                                id="preview-button"
                                className={`view-mode-button${instantView === 'preview' && diffMode === 'instant-fixes' ? ' active' : ''}`}
                                style={{ display: diffMode === 'instant-fixes' ? 'flex' : 'none' }}
                                onClick={() => handleInstantViewChange('preview')}
                            >
                                <span className="material-symbols-outlined">preview</span>
                                <span className="button-text">Preview</span>
                            </button>
                            <button
                                id="global-compare-button"
                                className={`button diff-mode-button${diffMode === 'global-compare' ? ' active' : ''}`}
                                onClick={() => handleDiffModeChange('global-compare')}
                            >
                                <span className="material-symbols-outlined">compare</span>
                                <span className="button-text">Global Compare</span>
                            </button>
                            <div
                                className="diff-view-selector-container"
                                id="diff-view-selector-container"
                                style={{ display: diffMode === 'global-compare' || instantView === 'diff-analysis' ? 'flex' : 'none' }}
                            >
                                <label htmlFor="diff-view-selector" className="diff-view-label">
                                    <span className="material-symbols-outlined">view_column</span>
                                </label>
                                <select
                                    id="diff-view-selector"
                                    className="diff-view-selector"
                                    value={diffViewMode}
                                    onChange={e => setDiffViewMode(e.target.value as DiffViewMode)}
                                >
                                    <option value="split">Split View</option>
                                    <option value="unified">Unified View</option>
                                </select>
                            </div>
                        </div>
                        <button className="modal-close-button" onClick={onClose}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </header>

                {/* Diff Stats + Iteration Navigation */}
                <div className="diff-stats-section">
                    <DiffStats added={stats.added} removed={stats.removed} total={stats.total} />
                    <div className="iteration-navigation">
                        <button
                            id="prev-iteration-button"
                            className="iteration-nav-button"
                            title="Previous Iteration"
                            disabled={!hasPrev}
                            onClick={() => {
                                const idx = allIterNums.indexOf(currentIterationNumber);
                                if (idx > 0) setCurrentIterationNumber(allIterNums[idx - 1]);
                            }}
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <button
                            id="next-iteration-button"
                            className="iteration-nav-button"
                            title="Next Iteration"
                            disabled={!hasNext}
                            onClick={() => {
                                const idx = allIterNums.indexOf(currentIterationNumber);
                                if (idx < allIterNums.length - 1) setCurrentIterationNumber(allIterNums[idx + 1]);
                            }}
                        >
                            <span className="material-symbols-outlined">arrow_forward</span>
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div
                    id="diff-modal-body"
                    style={{ display: 'flex', overflow: 'hidden', height: 'calc(100vh - 180px)', padding: 0 }}
                >
                    {/* Instant Fixes Panel */}
                    <div
                        id="instant-fixes-panel"
                        className={`diff-mode-panel${diffMode === 'instant-fixes' ? ' active' : ''}`}
                    >
                        <InstantFixesPanel
                            activeView={instantView}
                            sourceContent={sourceContent}
                            targetContent={targetContent}
                            sourceTitle={sourceTitle}
                            targetTitle={targetTitle}
                            viewMode={diffViewMode}
                            isHtmlContent={contentType === 'html'}
                        />
                    </div>

                    {/* Global Compare Panel */}
                    <div
                        id="global-compare-panel"
                        className={`diff-mode-panel${diffMode === 'global-compare' ? ' active' : ''}`}
                    >
                        <GlobalComparePanel
                            sourceLabel={sourceLabel}
                            pipelines={pipelines}
                            sourceContent={globalCompareContents?.source ?? ''}
                            targetContent={globalCompareContents?.target ?? ''}
                            viewMode={diffViewMode}
                            onSelectTarget={handleSelectTarget}
                            selectedTarget={selectedTarget}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Prompt Diff Modal ────────────────────────────────────────────────────────

interface PromptDiffModalProps {
    originalPrompt: string;
    currentPrompt: string;
    title: string;
    onClose: () => void;
}

const PromptDiffModal: React.FC<PromptDiffModalProps> = ({ originalPrompt, currentPrompt, title, onClose }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        if (!containerRef.current) return;
        const html = generateSplitDiffHTML(originalPrompt, currentPrompt);
        containerRef.current.innerHTML = html;
        applyDiffTheme(containerRef.current);
    }, [originalPrompt, currentPrompt]);

    return (
        <div
            id="prompt-diff-modal-overlay"
            className="modal-overlay fullscreen-modal is-visible"
            style={{ display: 'flex', zIndex: 10001 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="modal-content">
                <header className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="modal-header-left">
                        <h2 className="modal-title" style={{ margin: 0 }}>{title}</h2>
                    </div>
                    <div className="modal-header-right">
                        <button className="modal-close-button" onClick={onClose}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </header>
                <div className="modal-body" style={{ padding: 0, overflow: 'hidden', height: 'calc(100vh - 120px)' }}>
                    <div
                        ref={containerRef}
                        id="diff-viewer-panel"
                        className="diff-viewer-container custom-scrollbar"
                        style={{ height: '100%', overflow: 'auto' }}
                    />
                </div>
            </div>
        </div>
    );
};

// ─── Imperative Portal API ────────────────────────────────────────────────────
// These functions are called from non-React code (Core/App.ts, PromptsModal.ts, etc.)
// They mount React components into a portal root on the document body.

const roots = new Map<string, Root>();

function getOrCreateRoot(id: string): Root {
    if (roots.has(id)) return roots.get(id)!;
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
    const root = createRoot(el);
    roots.set(id, root);
    return root;
}

function unmountRoot(id: string): void {
    const root = roots.get(id);
    if (root) {
        root.unmount();
        roots.delete(id);
    }
    document.getElementById(id)?.remove();
}

export function openDiffModal(pipelineId: number, iterationNumber: number, contentType: DiffContentType): void {
    // Read from globalState — this is the canonical source of truth for all modes
    let pipelines: Pipeline[];
    try {
        const { globalState } = require('../../../Core/State') as typeof import('../../../Core/State');
        pipelines = globalState.pipelinesState as unknown as Pipeline[];
    } catch {
        pipelines = (window as any).pipelinesState ?? [];
    }

    const pipeline = pipelines.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const iteration = pipeline.iterations.find(i => i.iterationNumber === iterationNumber);
    if (!iteration) return;

    const content = extractIterationContent(iteration, contentType);
    if (!content?.sourceContent) { alert('Source content is not available for comparison.'); return; }
    if (!content?.targetContent) { alert('Target content is not available for comparison.'); return; }

    const root = getOrCreateRoot('diff-modal-root');
    root.render(
        <DiffModal
            initialPipelineId={pipelineId}
            initialIterationNumber={iterationNumber}
            contentType={contentType}
            pipelines={pipelines}
            onClose={() => unmountRoot('diff-modal-root')}
        />
    );
}

export function closeDiffModal(): void {
    unmountRoot('diff-modal-root');
}

export function openPromptDiffModal(originalPrompt: string, currentPrompt: string, title: string): void {
    const root = getOrCreateRoot('prompt-diff-modal-root');
    root.render(
        <PromptDiffModal
            originalPrompt={originalPrompt}
            currentPrompt={currentPrompt}
            title={title}
            onClose={() => unmountRoot('prompt-diff-modal-root')}
        />
    );
}

// Legacy exports for any code that accesses these
export function getDiffSourceData(): null { return null; }
export function getCurrentSourceContent(): string { return ''; }
export function getCurrentTargetContent(): string { return ''; }
