import { createActionButtons, bindDiffModalButtons } from '../ActionButton';
import * as Diff from 'diff';
import hljs from 'highlight.js';
import { html as diff2htmlHtml } from 'diff2html';
import { DiffSourceData, DiffViewMode, DiffContentType } from './types';
import { createUnifiedDiff, applyCustomThemeToD2H, addDarkThemeStyles, renderMathContent } from './utils';

// State
let diffSourceData: DiffSourceData | null = null;
let currentSourceContent: string = '';
let currentTargetContent: string = '';
let currentDiffViewMode: DiffViewMode = 'split';

export function getDiffSourceData() {
    return diffSourceData;
}

export function getCurrentSourceContent() {
    return currentSourceContent;
}

export function getCurrentTargetContent() {
    return currentTargetContent;
}

export function renderDiff(sourceText: string, targetText: string) {
    // Store content in global variables for toggle functionality
    currentSourceContent = sourceText;
    currentTargetContent = targetText;

    // Render based on current view mode
    if (currentDiffViewMode === 'split') {
        renderSplitDiff(sourceText, targetText);
    } else {
        renderUnifiedDiff(sourceText, targetText);
    }
}

function renderUnifiedDiff(sourceText: string, targetText: string) {
    // Choose the correct container based on the active panel (same logic as split view)
    const globalComparePanel = document.getElementById('global-compare-panel');
    const instantFixesPanel = document.getElementById('instant-fixes-panel');
    let container: HTMLElement | null = null;

    if (globalComparePanel && globalComparePanel.classList.contains('active')) {
        container = document.getElementById('diff-viewer-panel');
    } else if (instantFixesPanel && instantFixesPanel.classList.contains('active')) {
        container = document.getElementById('instant-fixes-diff-viewer');
    } else {
        // Fallback: try global compare container first, then instant fixes
        container = document.getElementById('diff-viewer-panel') || document.getElementById('instant-fixes-diff-viewer');
    }

    if (!container) return;

    // Update header diff stats
    updateHeaderDiffStats(sourceText, targetText);

    // Create unified diff format that diff2html expects
    const unifiedDiff = createUnifiedDiff(sourceText, targetText);

    // Generate HTML using diff2html in line-by-line mode with syntax highlighting
    const diffHtml = diff2htmlHtml(unifiedDiff, {
        outputFormat: 'line-by-line',
        drawFileList: false,
        matching: 'none',
        renderNothingWhenEmpty: false
    });

    container.innerHTML = diffHtml;

    // Apply custom theme overrides
    applyCustomThemeToD2H(container);
}

export function renderSplitDiff(sourceText: string, targetText: string) {
    // Choose the correct container based on the active panel
    const globalComparePanel = document.getElementById('global-compare-panel');
    const instantFixesPanel = document.getElementById('instant-fixes-panel');
    let container: HTMLElement | null = null;

    if (globalComparePanel && globalComparePanel.classList.contains('active')) {
        container = document.getElementById('diff-viewer-panel');
    } else if (instantFixesPanel && instantFixesPanel.classList.contains('active')) {
        container = document.getElementById('instant-fixes-diff-viewer');
    } else {
        container = document.getElementById('diff-viewer-panel') || document.getElementById('instant-fixes-diff-viewer');
    }

    if (!container) return;

    // Update header diff stats
    updateHeaderDiffStats(sourceText, targetText);

    // Create unified diff format that diff2html expects
    const unifiedDiff = createUnifiedDiff(sourceText, targetText);

    // Generate HTML using diff2html with syntax highlighting
    const diffHtml = diff2htmlHtml(unifiedDiff, {
        outputFormat: 'side-by-side',
        drawFileList: false,
        matching: 'none',
        renderNothingWhenEmpty: false
    });

    container.innerHTML = diffHtml;

    // Apply custom theme overrides
    applyCustomThemeToD2H(container);
}

// Export for reuse in Evolution Viewer
export function generateSplitDiffHTML(sourceText: string, targetText: string): string {
    const unifiedDiff = createUnifiedDiff(sourceText, targetText);

    return diff2htmlHtml(unifiedDiff, {
        outputFormat: 'side-by-side',
        drawFileList: false,
        matching: 'none',
        renderNothingWhenEmpty: false
    });
}

export function applyDiffTheme(container: HTMLElement): void {
    applyCustomThemeToD2H(container);
}

export function onDiffViewModeChange(mode: DiffViewMode) {
    currentDiffViewMode = mode;

    // Update selector value
    const selector = document.getElementById('diff-view-selector') as HTMLSelectElement;
    if (selector) {
        selector.value = mode;
    }

    // Re-render with current content
    if (currentSourceContent && currentTargetContent) {
        renderDiff(currentSourceContent, currentTargetContent);
    }
}

export function renderSideBySideComparison(sourceText: string, targetText: string, sourceTitle: string, targetTitle: string) {
    // Store content in global variables for preview controls
    currentSourceContent = sourceText;
    currentTargetContent = targetText;

    const diffSourceContent = document.getElementById('diff-source-content');
    const diffTargetContent = document.getElementById('diff-target-content');
    const diffSourceTitleElement = document.getElementById('diff-source-title');
    const diffTargetTitleElement = document.getElementById('diff-target-title');

    if (!diffSourceContent || !diffTargetContent || !diffSourceTitleElement || !diffTargetTitleElement) return;

    // Update titles
    diffSourceTitleElement.textContent = sourceTitle;
    diffTargetTitleElement.textContent = targetTitle;

    // Update preview titles
    const previewSourceTitle = document.getElementById('preview-source-title');
    const previewTargetTitle = document.getElementById('preview-target-title');
    if (previewSourceTitle) previewSourceTitle.textContent = sourceTitle;
    if (previewTargetTitle) previewTargetTitle.textContent = targetTitle;

    // Calculate and update header diff stats
    updateHeaderDiffStats(sourceText, targetText);

    // Render content using renderMathContent for proper rendering with syntax highlighting
    const renderContent = (text: string) => {
        return renderMathContent(text);
    };

    diffSourceContent.innerHTML = renderContent(sourceText);
    diffTargetContent.innerHTML = renderContent(targetText);

    // Update preview frames if content is HTML
    if (diffSourceData && diffSourceData.contentType === 'html') {
        const previewSourceFrame = document.getElementById('preview-source-frame') as HTMLIFrameElement;
        const previewTargetFrame = document.getElementById('preview-target-frame') as HTMLIFrameElement;

        if (previewSourceFrame) {
            const styledSourceText = addDarkThemeStyles(sourceText);
            const sourceBlob = new Blob([styledSourceText], { type: 'text/html' });
            previewSourceFrame.src = URL.createObjectURL(sourceBlob);
        }

        if (previewTargetFrame) {
            const styledTargetText = addDarkThemeStyles(targetText);
            const targetBlob = new Blob([styledTargetText], { type: 'text/html' });
            previewTargetFrame.src = URL.createObjectURL(targetBlob);
        }
    }

    // Apply syntax highlighting
    if (typeof hljs !== 'undefined') {
        diffSourceContent.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block as HTMLElement));
        diffTargetContent.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block as HTMLElement));
    }
}

function loadGlobalComparison(targetPipelineId: number, targetIterationNumber: number) {
    // Get source from diffSourceData
    if (!diffSourceData) {
        return;
    }

    const sourcePipelineId = diffSourceData.pipelineId;
    const sourceIterationNumber = diffSourceData.iterationNumber;
    const pipelinesState = (window as any).pipelinesState;
    const sourcePipeline = pipelinesState.find((p: any) => p.id === sourcePipelineId);
    const targetPipeline = pipelinesState.find((p: any) => p.id === targetPipelineId);

    if (!sourcePipeline || !targetPipeline) {
        return;
    }

    const sourceIteration = sourcePipeline.iterations.find((iter: any) => iter.iterationNumber === sourceIterationNumber);
    const targetIteration = targetPipeline.iterations.find((iter: any) => iter.iterationNumber === targetIterationNumber);

    if (!sourceIteration || !targetIteration) {
        return;
    }

    // Logic to get the correct content (before bug fix vs. after bug fix)
    const sourceContent = sourceIteration.contentBeforeBugFix || sourceIteration.generatedContent || '';
    const targetContent = targetIteration.generatedContent || sourceIteration.contentBeforeBugFix || ''; // Prioritize bug-fixed version

    // Update the global content variables
    currentSourceContent = sourceContent;
    currentTargetContent = targetContent;

    // Always render in unified view mode
    renderDiff(sourceContent, targetContent);
}

function populateDiffTargetTree() {
    const diffTargetTreeContainer = document.getElementById('diff-target-tree');
    if (!diffTargetTreeContainer) return;
    diffTargetTreeContainer.innerHTML = ''; // Clear previous tree

    const pipelinesState = (window as any).pipelinesState;
    if (!pipelinesState || !Array.isArray(pipelinesState)) {
        return;
    }

    // Create tree structure for all pipelines and iterations
    pipelinesState.forEach((pipeline: any, pipelineIndex: number) => {
        if (!pipeline.iterations || pipeline.iterations.length === 0) return;

        const pipelineGroup = document.createElement('div');
        pipelineGroup.className = 'diff-target-pipeline-group';

        const pipelineHeader = document.createElement('div');
        pipelineHeader.className = 'diff-target-pipeline-header';
        pipelineHeader.textContent = `Pipeline ${pipeline.id || pipelineIndex + 1}`;
        pipelineGroup.appendChild(pipelineHeader);

        const iterationsContainer = document.createElement('div');
        iterationsContainer.className = 'diff-target-iterations';

        pipeline.iterations.forEach((iteration: any, iterIndex: number) => {
            const iterationItem = document.createElement('div');
            iterationItem.className = 'diff-target-iteration-item';
            iterationItem.textContent = `Iteration ${iteration.iterationNumber || iterIndex + 1}`;
            iterationItem.dataset.pipelineId = String(pipeline.id || pipelineIndex);
            iterationItem.dataset.iterationNumber = String(iteration.iterationNumber || iterIndex + 1);

            iterationItem.addEventListener('click', () => {
                // Remove active class from all items
                document.querySelectorAll('.diff-target-iteration-item').forEach(item => {
                    item.classList.remove('active');
                });
                iterationItem.classList.add('active');

                // Load comparison
                const targetPipelineId = parseInt(iterationItem.dataset.pipelineId || '0');
                const targetIterationNumber = parseInt(iterationItem.dataset.iterationNumber || '0');
                loadGlobalComparison(targetPipelineId, targetIterationNumber);
            });

            iterationsContainer.appendChild(iterationItem);
        });

        pipelineGroup.appendChild(iterationsContainer);
        diffTargetTreeContainer.appendChild(pipelineGroup);
    });
}

function createDiffModal() {
    // Remove any existing diff modal overlays to prevent duplicates
    const existing = document.getElementById('diff-modal-overlay');
    if (existing) existing.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'diff-modal-overlay';
    modalOverlay.className = 'modal-overlay fullscreen-modal';
    modalOverlay.style.display = 'flex';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.setAttribute('role', 'dialog');
    modalContent.setAttribute('aria-modal', 'true');

    const modalHeader = document.createElement('header');
    modalHeader.className = 'modal-header';

    const modalHeaderLeft = document.createElement('div');
    modalHeaderLeft.className = 'modal-header-left';

    const modalTitle = document.createElement('h2');
    modalTitle.className = 'modal-title';
    modalTitle.id = 'diff-modal-title';
    modalTitle.textContent = 'Compare Outputs';
    modalHeaderLeft.appendChild(modalTitle);
    modalHeader.appendChild(modalHeaderLeft);

    const modalHeaderRight = document.createElement('div');
    modalHeaderRight.className = 'modal-header-right';

    const diffModalControls = document.createElement('div');
    diffModalControls.className = 'diff-modal-controls';
    diffModalControls.innerHTML = `
        <button id="instant-fixes-button" class="button diff-mode-button active" data-mode="instant-fixes">
            <span class="material-symbols-outlined">auto_fix_high</span>
            <span class="button-text">Instant Fixes</span>
        </button>
        <button id="diff-analysis-view-button" class="view-mode-button" data-view="diff-analysis">
            <span class="material-symbols-outlined">difference</span>
            <span class="button-text">Diff Analysis</span>
        </button>
        <button id="preview-button" class="view-mode-button" data-view="preview">
            <span class="material-symbols-outlined">preview</span>
            <span class="button-text">Preview</span>
        </button>
        <button id="global-compare-button" class="button diff-mode-button" data-mode="global-compare">
            <span class="material-symbols-outlined">compare</span>
            <span class="button-text">Global Compare</span>
        </button>
        <div class="diff-view-selector-container" id="diff-view-selector-container">
            <label for="diff-view-selector" class="diff-view-label">
                <span class="material-symbols-outlined">view_column</span>
            </label>
            <select id="diff-view-selector" class="diff-view-selector">
                <option value="split" selected>Split View</option>
                <option value="unified">Unified View</option>
            </select>
        </div>
    `;
    modalHeaderRight.appendChild(diffModalControls);

    const closeModalButton = document.createElement('button');
    closeModalButton.className = 'modal-close-button';
    closeModalButton.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeModalButton.addEventListener('click', closeDiffModal);
    modalHeaderRight.appendChild(closeModalButton);

    modalHeader.appendChild(modalHeaderRight);
    modalContent.appendChild(modalHeader);

    // Create diff stats section below header
    const diffStatsSection = document.createElement('div');
    diffStatsSection.className = 'diff-stats-section';
    diffStatsSection.innerHTML = `
        <div id="header-diff-stats" class="header-diff-stats">
            <div class="diff-stat-item diff-stat-additions">
                <span class="diff-stat-sign">+</span>
                <span id="header-additions-count">0 lines</span>
            </div>
            <div class="diff-stat-item diff-stat-deletions">
                <span class="diff-stat-sign">-</span>
                <span id="header-deletions-count">0 lines</span>
            </div>
            <div class="diff-stat-item diff-stat-total">
                <span class="material-symbols-outlined">difference</span>
                <span id="header-total-count">0 changes</span>
            </div>
        </div>
        <div class="iteration-navigation">
            <button id="prev-iteration-button" class="iteration-nav-button" title="Previous Iteration">
                <span class="material-symbols-outlined">arrow_back</span>
            </button>
            <button id="next-iteration-button" class="iteration-nav-button" title="Next Iteration">
                <span class="material-symbols-outlined">arrow_forward</span>
            </button>
        </div>
    `;
    modalContent.appendChild(diffStatsSection);

    const modalBody = document.createElement('div');
    modalBody.id = 'diff-modal-body';
    modalBody.style.display = 'flex';
    modalBody.style.overflow = 'hidden';
    modalBody.style.height = 'calc(100vh - 180px)';
    modalBody.style.padding = '0';

    // Create instant fixes panel
    const instantFixesPanel = document.createElement('div');
    instantFixesPanel.id = 'instant-fixes-panel';
    instantFixesPanel.className = 'diff-mode-panel';

    const instantFixesContent = document.createElement('div');
    instantFixesContent.className = 'instant-fixes-content';

    const sideBySideView = document.createElement('div');
    sideBySideView.id = 'side-by-side-view';
    sideBySideView.className = 'instant-fixes-view active';

    const sideBySideComparison = document.createElement('div');
    sideBySideComparison.className = 'side-by-side-comparison';
    sideBySideComparison.innerHTML = `
        <div class="comparison-side">
            <div class="preview-header">
                <h4 class="comparison-title">
                    <span class="material-symbols-outlined">psychology</span>
                    <span id="diff-source-title">Main Generation</span>
                </h4>
                ${createActionButtons('source', 'instant')}
            </div>
            <div id="diff-source-content" class="comparison-content custom-scrollbar"></div>
        </div>
        <div class="comparison-side">
            <div class="preview-header">
                <h4 class="comparison-title">
                    <span class="material-symbols-outlined">auto_fix_high</span>
                    <span id="diff-target-title">Bug Fixed/Polished</span>
                </h4>
                ${createActionButtons('target', 'instant')}
            </div>
            <div id="diff-target-content" class="comparison-content custom-scrollbar"></div>
        </div>
    `;
    sideBySideView.appendChild(sideBySideComparison);

    const diffAnalysisView = document.createElement('div');
    diffAnalysisView.id = 'diff-analysis-view';
    diffAnalysisView.className = 'instant-fixes-view';

    const instantFixesDiffViewer = document.createElement('div');
    instantFixesDiffViewer.id = 'instant-fixes-diff-viewer';
    instantFixesDiffViewer.className = 'diff-viewer-container custom-scrollbar';
    instantFixesDiffViewer.innerHTML = '<div class="empty-state-message"><p>Click "Diff Analysis" to see detailed line-by-line changes</p></div>';
    diffAnalysisView.appendChild(instantFixesDiffViewer);

    // Preview view (missing before) - replicates original structure
    const previewView = document.createElement('div');
    previewView.id = 'preview-view';
    previewView.className = 'instant-fixes-view';
    previewView.innerHTML = `
        <div class="preview-comparison">
            <div class="preview-side">
                <div class="preview-header">
                    <h4 class="comparison-title">
                        <span class="material-symbols-outlined">psychology</span>
                        <span id="preview-source-title">Main Generation</span>
                    </h4>
                    <div class="preview-controls">
                        ${createActionButtons('source', 'preview')}
                    </div>
                </div>
                <iframe id="preview-source-frame" class="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
            </div>
            <div class="preview-side">
                <div class="preview-header">
                    <h4 class="comparison-title">
                        <span class="material-symbols-outlined">auto_fix_high</span>
                        <span id="preview-target-title">Bug Fixed/Polished</span>
                    </h4>
                    ${createActionButtons('target', 'preview')}
                </div>
                <iframe id="preview-target-frame" class="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
            </div>
        </div>
    `;

    instantFixesContent.appendChild(sideBySideView);
    instantFixesContent.appendChild(diffAnalysisView);
    instantFixesContent.appendChild(previewView);
    instantFixesPanel.appendChild(instantFixesContent);

    // Create global compare panel
    const globalComparePanel = document.createElement('div');
    globalComparePanel.id = 'global-compare-panel';
    globalComparePanel.className = 'diff-mode-panel';
    globalComparePanel.innerHTML = `
        <div style="display: flex; height: 100%; width: 100%;">
            <aside id="diff-selector-panel" class="inspector-panel custom-scrollbar" style="width: 300px; flex-shrink: 0;">
                <div class="sidebar-section-content">
                    <div id="diff-source-display" class="input-group">
                        <h4 class="model-section-title">Source (A)</h4>
                        <p id="diff-source-label">None selected</p>
                    </div>
                    <div class="input-group" style="display: flex; flex-direction: column; flex-grow: 1;">
                        <h4 class="model-section-title">Select Target (B)</h4>
                        <div id="diff-target-tree" class="custom-scrollbar" style="flex-grow: 1; overflow-y: auto; padding-right: 0.5rem;"></div>
                    </div>
                </div>
            </aside>
            <div id="diff-viewer-panel" class="custom-scrollbar" style="flex: 1;">
                <div class="diff-no-selection empty-state-message">
                    <p>Select a target from the list to view differences.</p>
                </div>
            </div>
        </div>
    `;

    modalBody.appendChild(instantFixesPanel);
    modalBody.appendChild(globalComparePanel);
    modalContent.appendChild(modalBody);
    modalOverlay.appendChild(modalContent);

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeDiffModal();
        }
    };

    const handleOverlayClick = (e: MouseEvent) => {
        if (e.target === modalOverlay) {
            closeDiffModal();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    modalOverlay.addEventListener('click', handleOverlayClick);

    (modalOverlay as any).cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        modalOverlay.removeEventListener('click', handleOverlayClick);
    };

    document.body.appendChild(modalOverlay);
    // Bind modal-specific listeners now that DOM exists
    bindDiffModalEventListeners();

    // Bind iteration navigation listeners
    bindIterationNavigationListeners();

    setTimeout(() => {
        modalOverlay.classList.add('is-visible');
    }, 10);

    return modalOverlay;
}

export function openDiffModal(pipelineId: number, iterationNumber: number, contentType: DiffContentType) {
    const pipelinesState = (window as any).pipelinesState;
    const pipeline = pipelinesState.find((p: any) => p.id === pipelineId);
    if (!pipeline) {
        return;
    }
    const iteration = pipeline.iterations.find((iter: any) => iter.iterationNumber === iterationNumber);
    if (!iteration) {
        return;
    }

    let sourceContent: string | undefined;
    let targetContent: string | undefined;
    let sourceTitle: string;
    let targetTitle: string;

    if (contentType === 'html') {
        // Simplified logic: always use contentBeforeBugFix as source and generatedContent as target
        sourceContent = iteration.contentBeforeBugFix || iteration.generatedContent || '';
        targetContent = iteration.generatedContent || '';

        // Set appropriate titles based on iteration type
        if (iteration.title.includes('Initial')) {
            sourceTitle = "Initial Generation (Before Bug Fix)";
            targetTitle = "After Initial Bug Fix";
        } else if (iteration.title.includes('Refinement') || iteration.title.includes('Stabilization') || iteration.title.includes('Feature')) {
            sourceTitle = "After Feature Implementation";
            targetTitle = "After Bug Fix & Completion";
        } else {
            sourceTitle = "Before Bug Fix";
            targetTitle = "After Bug Fix";
        }
    } else {
        sourceContent = iteration.generatedOrRevisedText || iteration.generatedMainContent;
        targetContent = sourceContent;
        sourceTitle = iteration.title;
        targetTitle = iteration.title;
    }

    if (!sourceContent) {
        alert("Source content is not available for comparison.");
        return;
    }

    if (!targetContent) {
        alert("Target content is not available for comparison.");
        return;
    }

    diffSourceData = { pipelineId, iterationNumber, contentType, content: sourceContent, title: sourceTitle };

    // Create the new modal using Deepthink-style approach
    createDiffModal();

    // Set up the modal for instant fixes mode by default
    setTimeout(() => {
        activateDiffMode('instant-fixes', pipelinesState);
    }, 0);

    // Show side-by-side comparison by default
    renderSideBySideComparison(sourceContent, targetContent, sourceTitle, targetTitle);

    // Store content globally for diff view switching
    currentSourceContent = sourceContent;
    currentTargetContent = targetContent;

    // Update modal title with iteration information
    updateModalTitle(pipelineId, iterationNumber);


    // Set up global compare mode
    const diffSourceLabel = document.getElementById('diff-source-label');
    const diffViewerPanel = document.getElementById('diff-viewer-panel');
    if (diffSourceLabel) diffSourceLabel.textContent = `Variant ${pipelineId + 1} - ${iteration.title}`;
    if (diffViewerPanel) {
        diffViewerPanel.innerHTML = '<div class="diff-no-selection empty-state-message"><p>Select a target (B) from the list to view differences.</p></div>';
    }
    populateDiffTargetTree();
}

function bindIterationNavigationListeners() {
    const prevButton = document.getElementById('prev-iteration-button');
    const nextButton = document.getElementById('next-iteration-button');

    if (prevButton) {
        prevButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigateToIteration('prev');
        });
    }

    if (nextButton) {
        nextButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            navigateToIteration('next');
        });
    }

    // Update button states based on current iteration
    updateIterationNavigationButtons();
}

function navigateToIteration(direction: 'prev' | 'next') {
    if (!diffSourceData) return;

    const pipelinesState = (window as any).pipelinesState;
    const pipeline = pipelinesState.find((p: any) => p.id === diffSourceData!.pipelineId);
    if (!pipeline || !pipeline.iterations) return;

    const currentIterationNumber = diffSourceData.iterationNumber;
    const targetIterationNumber = direction === 'prev'
        ? currentIterationNumber - 1
        : currentIterationNumber + 1;

    // Check if target iteration exists
    const targetIteration = pipeline.iterations.find((iter: any) => iter.iterationNumber === targetIterationNumber);
    if (!targetIteration) return;

    // Update the modal content in place instead of closing/reopening
    updateModalForIteration(diffSourceData.pipelineId, targetIterationNumber, diffSourceData.contentType);
}

function updateModalForIteration(pipelineId: number, iterationNumber: number, contentType: DiffContentType) {
    const pipelinesState = (window as any).pipelinesState;
    const pipeline = pipelinesState.find((p: any) => p.id === pipelineId);
    if (!pipeline) return;

    const iteration = pipeline.iterations.find((iter: any) => iter.iterationNumber === iterationNumber);
    if (!iteration) return;

    let sourceContent: string | undefined;
    let targetContent: string | undefined;
    let sourceTitle: string;
    let targetTitle: string;

    if (contentType === 'html') {
        // Simplified logic: always use contentBeforeBugFix as source and generatedContent as target
        sourceContent = iteration.contentBeforeBugFix || iteration.generatedContent || '';
        targetContent = iteration.generatedContent || '';

        // Set appropriate titles based on iteration type
        if (iteration.title.includes('Initial')) {
            sourceTitle = "Initial Generation (Before Bug Fix)";
            targetTitle = "After Initial Bug Fix";
        } else if (iteration.title.includes('Refinement') || iteration.title.includes('Stabilization') || iteration.title.includes('Feature')) {
            sourceTitle = "After Feature Implementation";
            targetTitle = "After Bug Fix & Completion";
        } else {
            sourceTitle = "Before Bug Fix";
            targetTitle = "After Bug Fix";
        }
    } else {
        sourceContent = iteration.generatedOrRevisedText || iteration.generatedMainContent;
        targetContent = sourceContent;
        sourceTitle = iteration.title;
        targetTitle = iteration.title;
    }

    if (!sourceContent || !targetContent) return;

    // Update diffSourceData
    diffSourceData = { pipelineId, iterationNumber, contentType, content: sourceContent, title: sourceTitle };

    // Update content globally
    currentSourceContent = sourceContent;
    currentTargetContent = targetContent;

    // Update the side-by-side comparison
    renderSideBySideComparison(sourceContent, targetContent, sourceTitle, targetTitle);

    // Update diff analysis view if it's currently active
    const diffAnalysisView = document.getElementById('diff-analysis-view');
    if (diffAnalysisView && diffAnalysisView.classList.contains('active')) {
        renderDiff(sourceContent, targetContent);
    }

    // Force refresh preview tab if it's currently active by simulating a tab click
    const previewView = document.getElementById('preview-view');
    if (previewView && previewView.classList.contains('active')) {
        const previewButton = document.getElementById('preview-button');
        if (previewButton) {
            // Trigger the same refresh logic as manual tab clicking
            setTimeout(() => {
                activateInstantFixesView('preview', pipelinesState);
            }, 100);
        }
    }

    // Update global compare mode
    const diffSourceLabel = document.getElementById('diff-source-label');
    const diffViewerPanel = document.getElementById('diff-viewer-panel');
    if (diffSourceLabel) diffSourceLabel.textContent = `Variant ${pipelineId + 1} - ${iteration.title}`;

    // Auto-setup global compare with previous iteration if available
    const globalComparePanel = document.getElementById('global-compare-panel');
    if (globalComparePanel && globalComparePanel.classList.contains('active')) {
        // Try to find previous iteration for comparison
        const prevIteration = pipeline.iterations.find((iter: any) => iter.iterationNumber === iterationNumber - 1);
        if (prevIteration && diffViewerPanel) {
            // Auto-load comparison with previous iteration
            loadGlobalComparison(pipelineId, prevIteration.iterationNumber);

            // Highlight the previous iteration in the tree
            const prevIterationItem = document.querySelector(`[data-pipeline-id="${pipelineId}"][data-iteration-number="${prevIteration.iterationNumber}"]`);
            if (prevIterationItem) {
                document.querySelectorAll('.diff-target-iteration-item').forEach(item => item.classList.remove('active'));
                prevIterationItem.classList.add('active');
            }
        } else if (diffViewerPanel) {
            diffViewerPanel.innerHTML = '<div class="diff-no-selection empty-state-message"><p>Select a target (B) from the list to view differences.</p></div>';
        }
    }

    populateDiffTargetTree();

    // Update navigation button states
    updateIterationNavigationButtons();

    // Update modal title
    updateModalTitle(pipelineId, iterationNumber);
}

function updateModalTitle(pipelineId: number, iterationNumber: number) {
    const modalTitle = document.getElementById('diff-modal-title');
    if (!modalTitle) return;

    const pipelinesState = (window as any).pipelinesState;
    const pipeline = pipelinesState.find((p: any) => p.id === pipelineId);
    if (!pipeline || !pipeline.iterations) return;

    const iteration = pipeline.iterations.find((iter: any) => iter.iterationNumber === iterationNumber);
    if (!iteration) return;

    // Determine if this is the first or last iteration
    const allIterations = pipeline.iterations.map((iter: any) => iter.iterationNumber).sort((a: number, b: number) => a - b);
    const isFirst = iterationNumber === allIterations[0];
    const isLast = iterationNumber === allIterations[allIterations.length - 1];

    let titleText: string;

    if (isFirst && iteration.title.toLowerCase().includes('initial')) {
        titleText = 'Compare Outputs (Initial Generation)';
    } else if (isLast && (iteration.title.toLowerCase().includes('final') || iteration.title.toLowerCase().includes('complete'))) {
        titleText = 'Compare Outputs (Final Generation)';
    } else {
        titleText = `Compare Outputs (Iteration ${iterationNumber})`;
    }

    modalTitle.textContent = titleText;
}

function updateIterationNavigationButtons() {
    const prevButton = document.getElementById('prev-iteration-button') as HTMLButtonElement;
    const nextButton = document.getElementById('next-iteration-button') as HTMLButtonElement;

    if (!prevButton || !nextButton || !diffSourceData) return;

    const pipelinesState = (window as any).pipelinesState;
    const pipeline = pipelinesState.find((p: any) => p.id === diffSourceData!.pipelineId);
    if (!pipeline || !pipeline.iterations) return;

    const currentIterationNumber = diffSourceData.iterationNumber;

    // Check if previous iteration exists
    const hasPrev = pipeline.iterations.some((iter: any) => iter.iterationNumber === currentIterationNumber - 1);
    prevButton.disabled = !hasPrev;

    // Check if next iteration exists
    const hasNext = pipeline.iterations.some((iter: any) => iter.iterationNumber === currentIterationNumber + 1);
    nextButton.disabled = !hasNext;
}

export function activateDiffMode(mode: 'instant-fixes' | 'global-compare', pipelinesState: any[]) {
    const instantFixesButton = document.getElementById('instant-fixes-button');
    const globalCompareButton = document.getElementById('global-compare-button');
    const instantFixesPanel = document.getElementById('instant-fixes-panel');
    const globalComparePanel = document.getElementById('global-compare-panel');
    const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
    const previewButton = document.getElementById('preview-button');

    if (!instantFixesButton || !globalCompareButton || !instantFixesPanel || !globalComparePanel || !diffAnalysisButton || !previewButton) return;

    // Update button states
    instantFixesButton.classList.toggle('active', mode === 'instant-fixes');
    globalCompareButton.classList.toggle('active', mode === 'global-compare');

    // Update panel visibility
    instantFixesPanel.classList.toggle('active', mode === 'instant-fixes');
    globalComparePanel.classList.toggle('active', mode === 'global-compare');

    // Get the view selector
    const diffViewSelector = document.getElementById('diff-view-selector-container');

    // Show/hide and enable/disable view mode buttons based on mode
    if (mode === 'instant-fixes') {
        diffAnalysisButton.style.display = 'flex';
        previewButton.style.display = 'flex';
        if (diffViewSelector) diffViewSelector.style.display = 'none';
        // Reset to side-by-side view when switching to instant fixes
        activateInstantFixesView('side-by-side', pipelinesState);
    } else {
        diffAnalysisButton.style.display = 'none';
        previewButton.style.display = 'none';
        if (diffViewSelector) diffViewSelector.style.display = 'flex';
        // Reset button states when hiding
        diffAnalysisButton.classList.remove('active');
        previewButton.classList.remove('active');
        // Global compare uses split view by default

        // If we have content available, render it in current mode
        if (currentSourceContent && currentTargetContent) {
            renderDiff(currentSourceContent, currentTargetContent);
        }
    }
}

export function activateInstantFixesView(view: 'side-by-side' | 'diff-analysis' | 'preview', _pipelinesState: any[]) {
    const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
    const previewButton = document.getElementById('preview-button');
    const sideBySideView = document.getElementById('side-by-side-view');
    const diffAnalysisView = document.getElementById('diff-analysis-view');
    const previewView = document.getElementById('preview-view');
    const diffViewSelector = document.getElementById('diff-view-selector-container');

    if (!diffAnalysisButton || !previewButton || !sideBySideView || !diffAnalysisView || !previewView) return;

    // Update button states
    diffAnalysisButton.classList.toggle('active', view === 'diff-analysis');
    previewButton.classList.toggle('active', view === 'preview');

    // Update view visibility
    sideBySideView.classList.toggle('active', view === 'side-by-side');
    diffAnalysisView.classList.toggle('active', view === 'diff-analysis');
    previewView.classList.toggle('active', view === 'preview');

    // Show selector only for diff-analysis view
    if (diffViewSelector) {
        diffViewSelector.style.display = view === 'diff-analysis' ? 'flex' : 'none';
    }

    // For diff analysis, render content in current diff view mode
    if (view === 'diff-analysis') {
        // Use the same source/target as Instant Fixes (side-by-side view)
        if (currentSourceContent && currentTargetContent) {
            renderDiff(currentSourceContent, currentTargetContent);
        }
    }

    // Handle preview view
    if (view === 'preview' && diffSourceData && currentSourceContent && currentTargetContent) {
        renderHtmlPreview(currentSourceContent, currentTargetContent,
            diffSourceData.title || 'Source', 'Target');
    }
}

function renderHtmlPreview(sourceHtml: string, targetHtml: string, sourceTitle: string, targetTitle: string) {
    const previewSourceFrame = document.getElementById('preview-source-frame') as HTMLIFrameElement;
    const previewTargetFrame = document.getElementById('preview-target-frame') as HTMLIFrameElement;
    const previewSourceTitleElement = document.getElementById('preview-source-title');
    const previewTargetTitleElement = document.getElementById('preview-target-title');

    if (!previewSourceFrame || !previewTargetFrame || !previewSourceTitleElement || !previewTargetTitleElement) return;

    // Update titles
    previewSourceTitleElement.textContent = sourceTitle;
    previewTargetTitleElement.textContent = targetTitle;

    // Calculate and update header diff stats
    updateHeaderDiffStats(sourceHtml, targetHtml);

    // Load HTML content into iframes
    previewSourceFrame.srcdoc = sourceHtml;
    previewTargetFrame.srcdoc = targetHtml;
}

function updateHeaderDiffStats(sourceText: string, targetText: string) {
    const headerDiffStats = document.getElementById('header-diff-stats');
    const additionsCount = document.getElementById('header-additions-count');
    const deletionsCount = document.getElementById('header-deletions-count');
    const totalCount = document.getElementById('header-total-count');

    if (!headerDiffStats || !additionsCount || !deletionsCount || !totalCount) return;

    const differences = Diff.diffLines(sourceText, targetText, { newlineIsToken: true });

    let addedLines = 0;
    let removedLines = 0;
    let totalChanges = 0;

    differences.forEach(part => {
        const lines = part.value.split('\n').filter(line => line !== '' || part.value.endsWith('\n'));
        if (part.added) {
            addedLines += lines.length;
            totalChanges += lines.length;
        } else if (part.removed) {
            removedLines += lines.length;
            totalChanges += lines.length;
        }
    });

    // Update the header stats (without duplicate +/- signs)
    additionsCount.textContent = `${addedLines} lines`;
    deletionsCount.textContent = `${removedLines} lines`;
    totalCount.textContent = `${totalChanges} changes`;

    // Show the stats with animation
    headerDiffStats.classList.add('visible');
}

export function closeDiffModal() {
    const modalOverlay = document.getElementById('diff-modal-overlay');
    if (modalOverlay) {
        if ((modalOverlay as any).cleanup) {
            (modalOverlay as any).cleanup();
        }
        modalOverlay.classList.remove('is-visible');
        setTimeout(() => {
            modalOverlay.remove();
        }, 200);
    }

    // Clear diff source data and content
    diffSourceData = null;
    currentSourceContent = '';
    currentTargetContent = '';
}

function bindDiffModalEventListeners() {
    const instantFixesButton = document.getElementById('instant-fixes-button');
    const globalCompareButton = document.getElementById('global-compare-button');
    const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
    const previewButton = document.getElementById('preview-button');

    if (instantFixesButton) {
        instantFixesButton.addEventListener('click', () => activateDiffMode('instant-fixes', (window as any).pipelinesState));
    }

    if (globalCompareButton) {
        globalCompareButton.addEventListener('click', () => activateDiffMode('global-compare', (window as any).pipelinesState));
    }

    if (diffAnalysisButton) {
        diffAnalysisButton.addEventListener('click', () => activateInstantFixesView('diff-analysis', (window as any).pipelinesState));
    }

    if (previewButton) {
        previewButton.addEventListener('click', () => activateInstantFixesView('preview', (window as any).pipelinesState));
    }

    const diffViewSelector = document.getElementById('diff-view-selector') as HTMLSelectElement;
    if (diffViewSelector) {
        diffViewSelector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            onDiffViewModeChange(target.value as DiffViewMode);
        });
    }

    // Bind action buttons using the new modular system
    const modalContent = document.getElementById('diff-modal-body');
    if (modalContent) {
        bindDiffModalButtons(
            modalContent,
            () => currentSourceContent,
            () => currentTargetContent
        );
    }
}

/**
 * Opens a fullscreen HTML preview that auto-refreshes
 */
export function openFullscreenPreview(content: string, sessionId: string) {
    // Remove existing preview if any
    let overlay = document.getElementById(`preview-overlay-${sessionId}`);
    if (overlay) {
        // Update existing preview with refresh indicator
        const iframe = overlay.querySelector('iframe') as HTMLIFrameElement;
        const refreshIndicator = overlay.querySelector('.refresh-indicator') as HTMLElement;

        if (iframe && refreshIndicator) {
            // Show refresh indicator
            refreshIndicator.style.display = 'flex';

            const styledContent = addDarkThemeStyles(content);
            const blob = new Blob([styledContent], { type: 'text/html' });
            iframe.src = URL.createObjectURL(blob);

            // Hide refresh indicator after iframe loads
            iframe.onload = () => {
                setTimeout(() => {
                    refreshIndicator.style.display = 'none';
                }, 300);
            };
        }
        return;
    }

    // Create new preview overlay
    overlay = document.createElement('div');
    overlay.id = `preview-overlay-${sessionId}`;
    overlay.className = 'preview-fullscreen-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: var(--bg-color);
        z-index: 10000;
        display: flex;
        flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.5rem;
        background: rgba(var(--card-bg-base-rgb), 0.85);
        border-bottom: 1px solid var(--border-color);
        backdrop-filter: blur(16px);
    `;
    header.innerHTML = `
        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-color);">
            <span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 0.5rem;">preview</span>
            Live Preview
        </h3>
        <button class="preview-close-btn" style="
            background: rgba(var(--accent-pink-rgb), 0.2);
            border: 1px solid var(--accent-pink);
            color: var(--accent-pink);
            padding: 0.5rem 1rem;
            border-radius: var(--border-radius-md);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-weight: 500;
        ">
            <span class="material-symbols-outlined">close</span>
            Close
        </button>
    `;

    // Refresh indicator
    const refreshIndicator = document.createElement('div');
    refreshIndicator.className = 'refresh-indicator';
    refreshIndicator.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(var(--card-bg-base-rgb), 0.95);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-md);
        padding: 1rem 1.5rem;
        display: none;
        align-items: center;
        gap: 0.75rem;
        z-index: 10001;
        backdrop-filter: blur(16px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    `;
    refreshIndicator.innerHTML = `
        <div class="spinner" style="
            width: 20px;
            height: 20px;
            border: 2px solid rgba(var(--accent-purple-rgb), 0.3);
            border-top-color: var(--accent-purple);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        "></div>
        <span style="color: var(--text-color); font-weight: 500;">Refreshing...</span>
    `;

    // Iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = `
        flex: 1;
        position: relative;
        width: 100%;
    `;

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
    `;
    iframe.sandbox.add('allow-scripts', 'allow-same-origin');

    const styledContent = addDarkThemeStyles(content);
    const blob = new Blob([styledContent], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);

    iframeContainer.appendChild(iframe);
    iframeContainer.appendChild(refreshIndicator);

    overlay.appendChild(header);
    overlay.appendChild(iframeContainer);
    document.body.appendChild(overlay);

    // Close button handler
    const closeBtn = header.querySelector('.preview-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            overlay?.remove();
        });
    }

    // ESC key handler
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay?.remove();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);
}

// Simple function to open a diff modal for prompt comparison
export function openPromptDiffModal(originalPrompt: string, currentPrompt: string, title: string) {
    // Remove existing diff modal if any
    const existing = document.getElementById('prompt-diff-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'prompt-diff-modal-overlay';
    overlay.className = 'modal-overlay fullscreen-modal';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '10001'; // Higher than prompts modal

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    const modalHeader = document.createElement('header');
    modalHeader.className = 'modal-header';
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.innerHTML = `
        <div class="modal-header-left">
            <h2 class="modal-title" style="margin: 0;">${title}</h2>
        </div>
        <div class="modal-header-right">
            <button class="modal-close-button" id="prompt-diff-close-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
    `;

    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    modalBody.style.padding = '0';
    modalBody.style.overflow = 'hidden';
    modalBody.style.height = 'calc(100vh - 120px)';

    // Create container for diff2html rendering
    const diffViewerPanel = document.createElement('div');
    diffViewerPanel.id = 'diff-viewer-panel';
    diffViewerPanel.className = 'diff-viewer-container custom-scrollbar';
    diffViewerPanel.style.height = '100%';
    diffViewerPanel.style.overflow = 'auto';

    modalBody.appendChild(diffViewerPanel);
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    overlay.appendChild(modalContent);

    // Add event listeners
    const closeBtn = modalContent.querySelector('#prompt-diff-close-btn');
    closeBtn?.addEventListener('click', () => {
        overlay.classList.remove('is-visible');
        setTimeout(() => overlay.remove(), 300);
        document.removeEventListener('keydown', handleKeyDown);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('is-visible');
            setTimeout(() => overlay.remove(), 300);
            document.removeEventListener('keydown', handleKeyDown);
        }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay.classList.remove('is-visible');
            setTimeout(() => overlay.remove(), 300);
            document.removeEventListener('keydown', handleKeyDown);
        }
    };
    document.addEventListener('keydown', handleKeyDown);

    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.classList.add('is-visible');
        // Use renderSplitDiff to show actual diff highlighting
        renderSplitDiff(originalPrompt, currentPrompt);
    }, 10);
}
