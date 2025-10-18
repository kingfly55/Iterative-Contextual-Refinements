import { createActionButtons, bindDiffModalButtons } from './ActionButton';
import * as Diff from 'diff';
import hljs from 'highlight.js';
import { renderMathContent } from './RenderMathMarkdown';
import { html as diff2htmlHtml } from 'diff2html';
import './SequentialViewer.css';

// Diff Modal Elements - these will be created dynamically now

let diffSourceData: { pipelineId: number, iterationNumber: number, contentType: 'html' | 'text', content: string, title: string } | null = null;
let currentSourceContent: string = '';
let currentTargetContent: string = '';
let currentDiffViewMode: 'split' | 'unified' = 'split'; // Default to split view




function renderDiff(sourceText: string, targetText: string) {
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

function renderSplitDiff(sourceText: string, targetText: string) {
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

function createUnifiedDiff(oldText: string, newText: string): string {
    // Create a proper unified diff format with correct chunk headers
    let diff = 'diff --git a/source b/target\n';
    diff += '--- a/source\n';
    diff += '+++ b/target\n';

    const changes = Diff.diffLines(oldText, newText);

    // Build chunks with proper line tracking
    let oldLineNum = 1;
    let newLineNum = 1;
    let chunkStart = true;

    changes.forEach((change, idx) => {
        const lines = change.value.split('\n').filter((line, i, arr) => {
            // Keep all lines except the last one if it's empty (trailing newline)
            return !(i === arr.length - 1 && line === '');
        });

        if (lines.length === 0) return;

        // Add chunk header before first change or when starting new chunk
        if (chunkStart) {
            // Calculate counts for this chunk (look ahead)
            let totalOldCount = 0;
            let totalNewCount = 0;

            for (let i = idx; i < changes.length; i++) {
                const c = changes[i];
                const cLines = c.value.split('\n').filter((l, j, a) => !(j === a.length - 1 && l === ''));
                if (cLines.length === 0) continue;

                if (!c.added) totalOldCount += cLines.length;
                if (!c.removed) totalNewCount += cLines.length;
            }

            diff += `@@ -${oldLineNum},${totalOldCount} +${newLineNum},${totalNewCount} @@\n`;
            chunkStart = false;
        }

        lines.forEach(line => {
            if (change.added) {
                diff += '+' + line + '\n';
                newLineNum++;
            } else if (change.removed) {
                diff += '-' + line + '\n';
                oldLineNum++;
            } else {
                diff += ' ' + line + '\n';
                oldLineNum++;
                newLineNum++;
            }
        });
    });

    return diff;
}

function applyCustomThemeToD2H(container: HTMLElement) {
    // Theme is applied via CSS ID selectors for maximum specificity
    // Apply syntax highlighting to code content
    if (typeof hljs !== 'undefined') {
        const codeLines = container.querySelectorAll('.d2h-code-line-ctn, .d2h-code-side-line-ctn');
        codeLines.forEach((lineElement) => {
            const code = lineElement.textContent || '';
            if (code.trim()) {
                try {
                    const highlighted = hljs.highlightAuto(code, ['html', 'css', 'javascript', 'typescript', 'python', 'java', 'cpp']);
                    if (highlighted.value) {
                        (lineElement as HTMLElement).innerHTML = highlighted.value;
                    }
                } catch (e) {
                    // Ignore highlighting errors
                }
            }
        });
    }
}

function onDiffViewModeChange(mode: 'split' | 'unified') {
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

function renderSideBySideComparison(sourceText: string, targetText: string, sourceTitle: string, targetTitle: string) {
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
        // Removed console.error
        return;
    }

    const sourcePipelineId = diffSourceData.pipelineId;
    const sourceIterationNumber = diffSourceData.iterationNumber;
    const pipelinesState = (window as any).pipelinesState;
    const sourcePipeline = pipelinesState.find((p: any) => p.id === sourcePipelineId);
    const targetPipeline = pipelinesState.find((p: any) => p.id === targetPipelineId);

    if (!sourcePipeline || !targetPipeline) {
        // Removed console.error
        return;
    }

    const sourceIteration = sourcePipeline.iterations.find((iter: any) => iter.iterationNumber === sourceIterationNumber);
    const targetIteration = targetPipeline.iterations.find((iter: any) => iter.iterationNumber === targetIterationNumber);

    if (!sourceIteration || !targetIteration) {
        // Removed console.error
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
        // Removed console.warn
        return;
    }

    // Create tree structure for all pipelines and iterations
    pipelinesState.forEach((pipeline, pipelineIndex) => {
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
        <div class="diff-view-selector-container">
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

/**
 * Opens the diff modal for the specified pipeline and iteration.
 * 
 * @param pipelineId The ID of the pipeline to open the diff modal for.
 * @param iterationNumber The iteration number to open the diff modal for.
 * @param contentType The content type of the diff modal ('html' or 'text').
 */
function openDiffModal(pipelineId: number, iterationNumber: number, contentType: 'html' | 'text') {
    const pipelinesState = (window as any).pipelinesState;
    const pipeline = pipelinesState.find((p: any) => p.id === pipelineId);
    if (!pipeline) {
        // Removed console.error
        return;
    }
    const iteration = pipeline.iterations.find((iter: any) => iter.iterationNumber === iterationNumber);
    if (!iteration) {
        // Removed console.error
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

function updateModalForIteration(pipelineId: number, iterationNumber: number, contentType: 'html' | 'text') {
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

function activateDiffMode(mode: 'instant-fixes' | 'global-compare', pipelinesState: any[]) {
    // Removed console.log
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

    // Check if we have the necessary data and next iteration
    if (diffSourceData) {
        // pipelinesState is available globally; no-op here
    }
}


function activateInstantFixesView(view: 'side-by-side' | 'diff-analysis' | 'preview', _pipelinesState: any[]) {
    // Removed console.log
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





function closeDiffModal() {
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

// Helper function to add dark theme styles to HTML content
function addDarkThemeStyles(htmlContent: string): string {
    const darkThemeCSS = `
        <style>
            body {
                background-color: #1a1a1a !important;
                color: #e0e0e0 !important;
                font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
            }
            * {
                color: #e0e0e0 !important;
            }
            h1, h2, h3, h4, h5, h6 {
                color: #ffffff !important;
            }
            a {
                color: #64b5f6 !important;
            }
            a:visited {
                color: #ba68c8 !important;
            }
            pre, code {
                background-color: #2d2d2d !important;
                color: #e0e0e0 !important;
                border: 1px solid #404040 !important;
            }
            table {
                border-color: #404040 !important;
            }
            th, td {
                border-color: #404040 !important;
                background-color: #2d2d2d !important;
            }
        </style>
    `;

    // Insert the CSS into the head of the HTML document
    if (htmlContent.includes('<head>')) {
        return htmlContent.replace('<head>', '<head>' + darkThemeCSS);
    } else if (htmlContent.includes('<html>')) {
        return htmlContent.replace('<html>', '<html><head>' + darkThemeCSS + '</head>');
    } else {
        // If no proper HTML structure, wrap the content
        return `<!DOCTYPE html><html><head>${darkThemeCSS}</head><body>${htmlContent}</body></html>`;
    }
}

/**
 * Detects if content is HTML
 */
function isHTMLContent(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.includes('<html') ||
        trimmed.includes('<!DOCTYPE') ||
        (trimmed.includes('<body') && trimmed.includes('</body>')) ||
        (trimmed.includes('<div') && trimmed.includes('</div>'));
}

/**
 * Opens a fullscreen HTML preview that auto-refreshes
 */
function openFullscreenPreview(content: string, sessionId: string) {
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

// Export functions that might be needed by other modules
export {
    openDiffModal,
    closeDiffModal,
    activateDiffMode,
    renderSideBySideComparison,
    isHTMLContent,
    openFullscreenPreview,
    addDarkThemeStyles
};

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
} function bindDiffModalEventListeners() {
    const instantFixesButton = document.getElementById('instant-fixes-button');
    const globalCompareButton = document.getElementById('global-compare-button');
    const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
    const previewButton = document.getElementById('preview-button');

    // Modal event listeners are now handled after modal creation

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

    // View Evolution button removed from diff modal controls
    // Now only accessible from main tab header

    const diffViewSelector = document.getElementById('diff-view-selector') as HTMLSelectElement;
    if (diffViewSelector) {
        diffViewSelector.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            onDiffViewModeChange(target.value as 'split' | 'unified');
        });
    }

    // Removed unused openPreviewFullscreen function

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

function openEvolutionViewer(pipelineIdOverride?: number) {
    const pipelinesState = (window as any).pipelinesState;
    if (!pipelinesState || !Array.isArray(pipelinesState)) {
        // Removed console.error
        alert('Cannot open evolution viewer: Invalid pipeline data.');
        return;
    }

    // Use override pipelineId if provided, otherwise use diffSourceData
    const pipelineId = pipelineIdOverride ?? diffSourceData?.pipelineId;

    if (pipelineId === null || pipelineId === undefined) {
        // Removed console.warn
        return;
    }

    const pipeline = pipelinesState.find((p: any) => p.id === pipelineId);

    if (!pipeline) {
        // Removed console.error
        alert('Pipeline not found.');
        return;
    }

    // Create evolution viewer modal
    createEvolutionViewerModal(pipeline);
}

// Store active evolution viewers for live updates
const activeEvolutionViewers = new Map<string, { scrollContainer: HTMLElement; lastCount: number }>();

/**
 * Opens evolution viewer from content history array (for Agentic and Contextual modes)
 * Supports live updates - if viewer is already open for this sessionId, it updates in place
 */
function openEvolutionViewerFromHistory(
    contentHistory: Array<{ content: string; title: string; timestamp: number }>,
    sessionId: string
) {
    if (!contentHistory || contentHistory.length === 0) {
        alert('No content history available.');
        return;
    }

    // Check if viewer is already open for this session
    const existingViewer = activeEvolutionViewers.get(sessionId);
    if (existingViewer) {
        // Update existing viewer with new content
        updateEvolutionViewer(existingViewer, contentHistory);
        return;
    }

    // Create a mock pipeline structure from content history
    const mockPipeline = {
        id: Date.now(),
        iterations: contentHistory.map((entry, index) => ({
            iterationNumber: index + 1,
            title: entry.title,
            generatedContent: entry.content,
            contentBeforeBugFix: null
        }))
    };

    createEvolutionViewerModal(mockPipeline, sessionId, contentHistory);
}

/**
 * Updates an existing evolution viewer with new content
 */
function updateEvolutionViewer(
    viewer: { scrollContainer: HTMLElement; lastCount: number },
    contentHistory: Array<{ content: string; title: string; timestamp: number }>
) {
    const { scrollContainer, lastCount } = viewer;

    // Only add new columns for new entries
    if (contentHistory.length <= lastCount) {
        return;
    }

    // Get existing columns to maintain scroll sync
    const existingColumns = Array.from(scrollContainer.querySelectorAll('.evolution-column')) as HTMLElement[];

    // Add new columns for new entries
    for (let i = lastCount; i < contentHistory.length; i++) {
        const entry = contentHistory[i];
        // Compare with previous iteration to show incremental changes
        const prevContent = i > 0 ? contentHistory[i - 1].content : '';

        const column = createEvolutionColumn(
            entry.content,
            prevContent,
            entry.title,
            i
        );

        existingColumns.push(column);
        scrollContainer.appendChild(column);

        // Animate in the new column
        setTimeout(() => {
            column.style.opacity = '1';
            column.style.transform = 'translateX(0)';
        }, 50);
    }

    // Update synced scrolling with new columns
    setupSyncedScrolling(existingColumns);

    // Update last count
    viewer.lastCount = contentHistory.length;

    // Auto-scroll to the newest column
    setTimeout(() => {
        scrollContainer.scrollLeft = scrollContainer.scrollWidth;
    }, 100);
}

/**
 * Updates evolution viewer if it's open for the given session
 */
function updateEvolutionViewerIfOpen(
    sessionId: string,
    contentHistory: Array<{ content: string; title: string; timestamp: number }>
) {
    const viewer = activeEvolutionViewers.get(sessionId);
    if (viewer && contentHistory) {
        updateEvolutionViewer(viewer, contentHistory);
    }
}

// Export for use in other modules
export { openEvolutionViewer, openEvolutionViewerFromHistory, updateEvolutionViewerIfOpen };

function createEvolutionViewerModal(pipeline: any, sessionId?: string, contentHistory?: Array<{ content: string; title: string; timestamp: number }>) {
    // Remove any existing evolution viewer
    const existing = document.getElementById('evolution-viewer-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'evolution-viewer-overlay';
    overlay.className = 'evolution-viewer-overlay';
    
    // Check if we're inside Deepthink modal (z-index 2100) and boost z-index accordingly
    const isInsideDeepthinkModal = document.getElementById('solution-modal-overlay') !== null;
    if (isInsideDeepthinkModal) {
        overlay.style.setProperty('z-index', '2300', 'important');
    }

    const container = document.createElement('div');
    container.className = 'evolution-viewer-container';

    // State for diff toggle
    let hideDiff = false;

    // Header with title and close button
    const header = document.createElement('div');
    header.className = 'evolution-viewer-header';
    header.innerHTML = `
        <div class="evolution-header-content">
            <span class="material-symbols-outlined evolution-icon">movie</span>
            <h2 class="evolution-title">Content Evolution Timeline</h2>
            <span class="evolution-subtitle">Scroll horizontally to view all iterations</span>
        </div>
        <div class="evolution-header-actions">
            <button id="hide-diff-button" class="hide-diff-button">
                <span class="material-symbols-outlined">visibility_off</span>
                <span class="button-text">Hide Diff</span>
            </button>
            <button id="sequential-view-button" class="sequential-view-button">
                <span class="material-symbols-outlined">play_circle</span>
                <span class="button-text">View Iterations Sequentially</span>
            </button>
        </div>
    `;

    const closeButton = document.createElement('button');
    closeButton.className = 'evolution-close-button';
    closeButton.innerHTML = '<span class="material-symbols-outlined">close</span>';
    closeButton.addEventListener('click', closeEvolutionViewer);
    header.appendChild(closeButton);

    // Set up buttons after DOM is ready
    setTimeout(() => {
        const sequentialBtn = document.getElementById('sequential-view-button');
        if (sequentialBtn) {
            sequentialBtn.addEventListener('click', () => {
                openSequentialViewer(contentStates);
            });
        }

        const hideDiffBtn = document.getElementById('hide-diff-button');
        if (hideDiffBtn) {
            hideDiffBtn.addEventListener('click', () => {
                hideDiff = !hideDiff;
                
                // Update button appearance
                const icon = hideDiffBtn.querySelector('.material-symbols-outlined');
                const text = hideDiffBtn.querySelector('.button-text');
                if (icon && text) {
                    icon.textContent = hideDiff ? 'visibility' : 'visibility_off';
                    text.textContent = hideDiff ? 'Show Diff' : 'Hide Diff';
                }
                hideDiffBtn.classList.toggle('active', hideDiff);
                
                // Re-render columns
                scrollContainer.innerHTML = '';
                const columns: HTMLElement[] = [];
                contentStates.forEach((state, index) => {
                    const prevContent = index > 0 ? contentStates[index - 1].content : '';
                    const column = createEvolutionColumn(
                        state.content,
                        prevContent,
                        state.title,
                        index,
                        hideDiff
                    );
                    columns.push(column);
                    scrollContainer.appendChild(column);
                });
                
                // Re-setup synchronized scrolling
                setupSyncedScrolling(columns);
            });
        }
    }, 0);

    container.appendChild(header);

    // Horizontal scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'evolution-scroll-container';

    // Get all iterations sorted
    const iterations = pipeline.iterations.sort((a: any, b: any) => a.iterationNumber - b.iterationNumber);

    // Create all content states including bug fix stages
    const contentStates: Array<{ content: string, title: string, iterationNumber: number, isBugFix: boolean }> = [];

    iterations.forEach((iteration: any) => {
        // Skip iterations without any content
        if (!iteration.generatedContent && !iteration.contentBeforeBugFix) {
            // Removed console.warn
            return;
        }

        // Add pre-bug-fix content if it exists and differs from final content
        if (iteration.contentBeforeBugFix &&
            iteration.contentBeforeBugFix.trim() !== '' &&
            iteration.contentBeforeBugFix !== iteration.generatedContent) {
            contentStates.push({
                content: iteration.contentBeforeBugFix,
                title: (iteration.title || `Iteration ${iteration.iterationNumber}`) + ' (Pre-Fix)',
                iterationNumber: iteration.iterationNumber,
                isBugFix: false
            });
        }

        // Add final content (after bug fix if it happened)
        const finalContent = iteration.generatedContent || iteration.contentBeforeBugFix || '';
        if (finalContent.trim() !== '') {
            contentStates.push({
                content: finalContent,
                title: iteration.title || `Iteration ${iteration.iterationNumber}`,
                iterationNumber: iteration.iterationNumber,
                isBugFix: !!iteration.contentBeforeBugFix
            });
        }
    });

    // Handle edge case: no content states
    if (contentStates.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'evolution-empty-message';
        emptyMessage.textContent = 'No iterations available to display.';
        scrollContainer.appendChild(emptyMessage);
    } else {
        // Create columns for each content state
        const columns: HTMLElement[] = [];
        contentStates.forEach((state, index) => {
            // Compare with previous iteration to show incremental changes
            const prevContent = index > 0 ? contentStates[index - 1].content : '';
            const column = createEvolutionColumn(
                state.content,
                prevContent,
                state.title,
                index,
                hideDiff
            );
            columns.push(column);
            scrollContainer.appendChild(column);
        });

        // Set up synchronized scrolling between all columns
        setupSyncedScrolling(columns);
    }

    container.appendChild(scrollContainer);
    overlay.appendChild(container);

    // Keyboard escape handler
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeEvolutionViewer();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    (overlay as any).cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
    };

    document.body.appendChild(overlay);

    // Register for live updates if sessionId provided
    if (sessionId && contentHistory) {
        activeEvolutionViewers.set(sessionId, {
            scrollContainer,
            lastCount: contentHistory.length
        });

        // Clean up on close
        const originalCleanup = (overlay as any).cleanup;
        (overlay as any).cleanup = () => {
            if (originalCleanup) originalCleanup();
            activeEvolutionViewers.delete(sessionId);
        };
    }

    // Animate in
    setTimeout(() => {
        overlay.classList.add('visible');
    }, 10);
}

function createEvolutionColumn(
    currentContent: string,
    previousContent: string,
    title: string,
    columnIndex: number,
    hideDiff: boolean = false
): HTMLElement {
    const column = document.createElement('div');
    column.className = 'evolution-column';

    // Column header
    const header = document.createElement('div');
    header.className = 'evolution-column-header';

    const headerContent = document.createElement('div');
    headerContent.className = 'evolution-column-header-content';

    const headerTitle = document.createElement('div');
    headerTitle.className = 'evolution-column-title';
    
    // For first column, show the title as is
    // For subsequent columns, show comparison title
    if (columnIndex === 0) {
        headerTitle.textContent = title;
    } else {
        headerTitle.textContent = `${title} (vs Previous)`;
    }

    headerContent.appendChild(headerTitle);
    header.appendChild(headerContent);

    column.appendChild(header);

    // Content area with split diff view
    const contentContainer = document.createElement('div');
    contentContainer.className = 'evolution-column-content';

    // Handle empty content edge case
    if (!currentContent || currentContent.trim() === '') {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'evolution-empty-content';
        emptyMessage.textContent = '(Empty content)';
        contentContainer.appendChild(emptyMessage);
        column.appendChild(contentContainer);
        return column;
    }

    // If hideDiff is true, render raw content with renderMathContent
    if (hideDiff) {
        const renderedContainer = document.createElement('div');
        renderedContainer.className = 'evolution-rendered-content';
        renderedContainer.innerHTML = renderMathContent(currentContent);
        contentContainer.appendChild(renderedContainer);
        column.appendChild(contentContainer);
        return column;
    }

    // Use split diff view for all columns (including first one comparing with empty)
    const sourceContent = previousContent || '';
    const targetContent = currentContent;

    // Generate split diff HTML using the existing library function
    const diffHtml = generateSplitDiffHTML(sourceContent, targetContent);
    
    // Create wrapper for diff content
    const diffWrapper = document.createElement('div');
    diffWrapper.className = 'evolution-diff-wrapper';
    diffWrapper.innerHTML = diffHtml;
    
    contentContainer.appendChild(diffWrapper);
    
    // Apply custom theme
    applyDiffTheme(diffWrapper);
    
    column.appendChild(contentContainer);
    
    return column;
}

function setupSyncedScrolling(columns: HTMLElement[]) {
    if (columns.length === 0) return;

    // Get all content containers
    const contentContainers = columns.map(col =>
        col.querySelector('.evolution-column-content') as HTMLElement
    ).filter(el => el !== null);

    if (contentContainers.length === 0) return;

    let isScrolling = false;

    // Add scroll listener to each container
    contentContainers.forEach((container, index) => {
        container.addEventListener('scroll', () => {
            if (isScrolling) return;

            isScrolling = true;
            const scrollTop = container.scrollTop;
            // const scrollLeft = container.scrollLeft; // Reserved for future horizontal sync

            // Sync vertical scroll to all other containers
            contentContainers.forEach((otherContainer, otherIndex) => {
                if (otherIndex !== index) {
                    otherContainer.scrollTop = scrollTop;
                }
            });

            requestAnimationFrame(() => {
                isScrolling = false;
            });
        });
    });
}

function closeEvolutionViewer() {
    const overlay = document.getElementById('evolution-viewer-overlay');
    if (overlay) {
        if ((overlay as any).cleanup) {
            (overlay as any).cleanup();
        }
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
}

// Sequential Animation Viewer
interface SequentialState {
    contentStates: Array<{ title: string; content: string }>;
    currentIteration: number;
    isPlaying: boolean;
    speed: number; // ms per line
    animationFrame: number | null;
    currentLineIndex: number; // Track current position for pause/resume
    viewMode: 'split' | 'unified'; // Toggle between split and unified views
}

let sequentialState: SequentialState | null = null;

function openSequentialViewer(contentStates: Array<{ title: string; content: string }>) {
    if (contentStates.length === 0) return;

    // Initialize state
    sequentialState = {
        contentStates,
        currentIteration: 0,
        isPlaying: false,
        speed: 50, // 50ms per line
        animationFrame: null,
        currentLineIndex: 0,
        viewMode: 'split' // Default to split view
    };

    // Create overlay
    const existing = document.getElementById('sequential-viewer-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sequential-viewer-overlay';
    overlay.className = 'sequential-viewer-overlay';

    const container = document.createElement('div');
    container.className = 'sequential-viewer-container';

    // Header with controls
    const header = createSequentialHeader();
    container.appendChild(header);

    // Content display area
    const contentArea = document.createElement('div');
    contentArea.className = 'sequential-content-area';
    contentArea.id = 'sequential-content-area';
    container.appendChild(contentArea);

    // Progress bar
    const progressBar = createProgressBar();
    container.appendChild(progressBar);

    // Controls footer
    const controls = createSequentialControls();
    container.appendChild(controls);

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // Initialize with first iteration
    renderSequentialContent();

    // Show with animation
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
    });

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeSequentialViewer();
        } else if (e.key === ' ') {
            e.preventDefault();
            togglePlayback();
        } else if (e.key === 'ArrowRight') {
            nextIteration();
        } else if (e.key === 'ArrowLeft') {
            previousIteration();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    (overlay as any).cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        if (sequentialState?.animationFrame) {
            cancelAnimationFrame(sequentialState.animationFrame);
        }
    };
}

function createSequentialHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'sequential-viewer-header';
    header.innerHTML = `
        <div class="sequential-header-content">
            <span class="material-symbols-outlined sequential-icon">subscriptions</span>
            <div class="sequential-title-group">
                <h2 class="sequential-title">Sequential Evolution Playback</h2>
                <span class="sequential-subtitle" id="iteration-indicator">Iteration 1</span>
            </div>
        </div>
        <div class="sequential-header-actions">
            <button class="sequential-view-toggle-button" id="sequential-view-toggle-btn" title="Toggle View Mode">
                <span class="material-symbols-outlined">view_column</span>
                <span class="button-text">Unified View</span>
            </button>
            <button class="sequential-close-button" id="sequential-close-btn">
                <span class="material-symbols-outlined">close</span>
            </button>
        </div>
    `;

    setTimeout(() => {
        const closeBtn = document.getElementById('sequential-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeSequentialViewer);
        }

        const toggleBtn = document.getElementById('sequential-view-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleViewMode);
        }
    }, 0);

    return header;
}

function createProgressBar(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'sequential-progress-container';
    container.innerHTML = `
        <div class="sequential-progress-bar">
            <div class="sequential-progress-fill" id="sequential-progress-fill"></div>
        </div>
    `;
    return container;
}

function createSequentialControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'sequential-controls';
    controls.innerHTML = `
        <div class="sequential-controls-left">
            <button class="sequential-control-btn" id="seq-prev-btn" title="Previous Iteration (←)">
                <span class="material-symbols-outlined">skip_previous</span>
            </button>
            <button class="sequential-control-btn sequential-play-btn" id="seq-play-btn" title="Play/Pause (Space)">
                <span class="material-symbols-outlined">play_arrow</span>
            </button>
            <button class="sequential-control-btn" id="seq-next-btn" title="Next Iteration (→)">
                <span class="material-symbols-outlined">skip_next</span>
            </button>
        </div>
        <div class="sequential-controls-right">
            <span class="speed-label">Speed:</span>
            <button class="sequential-speed-btn" data-speed="200" title="0.25x">0.25x</button>
            <button class="sequential-speed-btn" data-speed="100" title="0.5x">0.5x</button>
            <button class="sequential-speed-btn active" data-speed="50" title="1x">1x</button>
            <button class="sequential-speed-btn" data-speed="25" title="2x">2x</button>
            <button class="sequential-speed-btn" data-speed="10" title="4x">4x</button>
        </div>
    `;

    setTimeout(() => {
        document.getElementById('seq-prev-btn')?.addEventListener('click', previousIteration);
        document.getElementById('seq-play-btn')?.addEventListener('click', togglePlayback);
        document.getElementById('seq-next-btn')?.addEventListener('click', nextIteration);

        document.querySelectorAll('.sequential-speed-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const speed = parseInt((e.currentTarget as HTMLElement).dataset.speed || '50');
                setPlaybackSpeed(speed);
            });
        });
    }, 0);

    return controls;
}

function renderSequentialContent() {
    if (!sequentialState) return;

    const contentArea = document.getElementById('sequential-content-area');
    if (!contentArea) return;

    const currentState = sequentialState.contentStates[sequentialState.currentIteration];
    const prevState = sequentialState.currentIteration > 0
        ? sequentialState.contentStates[sequentialState.currentIteration - 1]
        : null;

    // Update iteration indicator
    const indicator = document.getElementById('iteration-indicator');
    if (indicator) {
        indicator.textContent = currentState.title || `Iteration ${sequentialState.currentIteration + 1}`;
    }

    // Update progress bar
    const progressFill = document.getElementById('sequential-progress-fill');
    if (progressFill) {
        const progress = ((sequentialState.currentIteration + 1) / sequentialState.contentStates.length) * 100;
        progressFill.style.width = `${progress}%`;
    }

    // Clear content area
    contentArea.innerHTML = '';

    if (sequentialState.viewMode === 'split') {
        renderSplitView(contentArea, currentState, prevState);
    } else {
        renderUnifiedView(contentArea, currentState, prevState);
    }
}

function renderSplitView(contentArea: HTMLElement, currentState: any, prevState: any) {
    // Create split diff view
    const splitContainer = document.createElement('div');
    splitContainer.className = 'sequential-split-container';

    // Left side (previous state)
    const leftSide = document.createElement('div');
    leftSide.className = 'sequential-split-side left';

    const leftHeader = document.createElement('div');
    leftHeader.className = 'sequential-split-header';
    leftHeader.innerHTML = `
        <h3 class="sequential-split-title">
            <span class="material-symbols-outlined">history</span>
            ${prevState ? prevState.title : 'Initial State'}
        </h3>
    `;
    leftSide.appendChild(leftHeader);

    const leftContent = document.createElement('div');
    leftContent.className = 'sequential-split-content';
    leftContent.id = 'sequential-left-content';
    leftSide.appendChild(leftContent);

    // Right side (current state)
    const rightSide = document.createElement('div');
    rightSide.className = 'sequential-split-side right';

    const rightHeader = document.createElement('div');
    rightHeader.className = 'sequential-split-header';
    rightHeader.innerHTML = `
        <h3 class="sequential-split-title">
            <span class="material-symbols-outlined">auto_awesome</span>
            ${currentState.title}
        </h3>
    `;
    rightSide.appendChild(rightHeader);

    const rightContent = document.createElement('div');
    rightContent.className = 'sequential-split-content';
    rightContent.id = 'sequential-right-content';
    rightSide.appendChild(rightContent);

    splitContainer.appendChild(leftSide);
    splitContainer.appendChild(rightSide);
    contentArea.appendChild(splitContainer);

    // Render content in both sides
    if (prevState) {
        renderSplitDiffContent(prevState.content || '', currentState.content || '', leftContent, rightContent);
    } else {
        // First iteration - show empty on left, content on right
        renderInitialContent(currentState.content || '', leftContent, rightContent);
    }

    // Set up synchronized scrolling
    setupSynchronizedScrolling(leftContent, rightContent);
}

function renderUnifiedView(contentArea: HTMLElement, currentState: any, prevState: any) {
    // Original unified view - single column with diff highlighting
    const contentDisplay = document.createElement('div');
    contentDisplay.className = 'sequential-content-display sequential-unified-view';
    contentDisplay.id = 'sequential-content-display';

    if (prevState) {
        // Show diff between previous and current
        const prevContent = prevState.content || '';
        const currentContent = currentState.content || '';

        try {
            const diffs = Diff.diffLines(prevContent, currentContent);
            const pre = document.createElement('pre');
            const code = document.createElement('code');

            diffs.forEach((part) => {
                const lines = part.value.split('\n');
                lines.forEach((line, lineIndex) => {
                    if (line === '' && lineIndex === lines.length - 1) return;

                    const lineDiv = document.createElement('div');
                    lineDiv.className = 'sequential-line';

                    if (part.added) {
                        lineDiv.classList.add('sequential-line-added');
                    } else if (part.removed) {
                        lineDiv.classList.add('sequential-line-removed');
                    }

                    const lineContent = document.createElement('span');
                    lineContent.className = 'sequential-line-content';
                    lineContent.textContent = line || ' ';
                    lineDiv.appendChild(lineContent);
                    code.appendChild(lineDiv);
                });
            });

            pre.appendChild(code);
            contentDisplay.appendChild(pre);
        } catch (error) {
            contentDisplay.innerHTML = `<div class="sequential-error">Error displaying diff</div>`;
        }
    } else {
        // Show initial content
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        const lines = (currentState.content || '').split('\n');

        lines.forEach((line: string) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'sequential-line';

            const lineContent = document.createElement('span');
            lineContent.className = 'sequential-line-content';
            lineContent.textContent = line || ' ';
            lineDiv.appendChild(lineContent);
            code.appendChild(lineDiv);
        });

        pre.appendChild(code);
        contentDisplay.appendChild(pre);
    }

    contentArea.appendChild(contentDisplay);
}

function setupSynchronizedScrolling(leftContainer: HTMLElement, rightContainer: HTMLElement) {
    let isSyncing = false;
    let syncTimeout: number | null = null;
    let lastScrollTop = 0;

    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
        if (isSyncing) return;

        // Skip if scroll position hasn't changed (prevents unnecessary syncs)
        if (source.scrollTop === lastScrollTop) return;
        lastScrollTop = source.scrollTop;

        isSyncing = true;

        // Cancel any pending sync
        if (syncTimeout) {
            cancelAnimationFrame(syncTimeout);
        }

        // Use RAF for native refresh rate sync (60/120/144fps)
        syncTimeout = requestAnimationFrame(() => {
            // Direct assignment for instant sync at high refresh rates
            target.scrollTop = source.scrollTop;

            // Reset sync flag on next frame to allow immediate response
            requestAnimationFrame(() => {
                isSyncing = false;
                syncTimeout = null;
            });
        });
    };

    leftContainer.addEventListener('scroll', () => syncScroll(leftContainer, rightContainer), { passive: true });
    rightContainer.addEventListener('scroll', () => syncScroll(rightContainer, leftContainer), { passive: true });
}

function renderSplitDiffContent(prevContent: string, currentContent: string, leftContainer: HTMLElement, rightContainer: HTMLElement) {
    try {
        const diffs = Diff.diffLines(prevContent, currentContent);

        const leftPre = document.createElement('pre');
        const leftCode = document.createElement('code');
        const leftDisplay = document.createElement('div');
        leftDisplay.className = 'sequential-content-display';

        const rightPre = document.createElement('pre');
        const rightCode = document.createElement('code');
        const rightDisplay = document.createElement('div');
        rightDisplay.className = 'sequential-content-display';

        let leftLineNum = 1;
        let rightLineNum = 1;

        diffs.forEach((part) => {
            const lines = part.value.split('\n');
            lines.forEach((line, lineIndex) => {
                if (line === '' && lineIndex === lines.length - 1) return;

                if (part.removed) {
                    // Show removed lines on left side with empty spacer on right
                    const leftLineDiv = document.createElement('div');
                    leftLineDiv.className = 'sequential-line sequential-line-removed';
                    leftLineDiv.dataset.index = `left-${leftLineNum}`;
                    leftLineDiv.dataset.lineNum = String(leftLineNum);

                    const leftLineContent = document.createElement('span');
                    leftLineContent.className = 'sequential-line-content';
                    leftLineContent.textContent = line || ' ';
                    leftLineDiv.appendChild(leftLineContent);
                    leftCode.appendChild(leftLineDiv);

                    // Add empty spacer on right to maintain alignment
                    const rightSpacerDiv = document.createElement('div');
                    rightSpacerDiv.className = 'sequential-line sequential-line-spacer';
                    rightSpacerDiv.dataset.index = `right-spacer-${leftLineNum}`;
                    const rightSpacerContent = document.createElement('span');
                    rightSpacerContent.className = 'sequential-line-content';
                    rightSpacerContent.innerHTML = '&nbsp;';
                    rightSpacerDiv.appendChild(rightSpacerContent);
                    rightCode.appendChild(rightSpacerDiv);

                    leftLineNum++;
                } else if (part.added) {
                    // Show added lines on right side with empty spacer on left
                    const leftSpacerDiv = document.createElement('div');
                    leftSpacerDiv.className = 'sequential-line sequential-line-spacer';
                    leftSpacerDiv.dataset.index = `left-spacer-${rightLineNum}`;
                    const leftSpacerContent = document.createElement('span');
                    leftSpacerContent.className = 'sequential-line-content';
                    leftSpacerContent.innerHTML = '&nbsp;';
                    leftSpacerDiv.appendChild(leftSpacerContent);
                    leftCode.appendChild(leftSpacerDiv);

                    const rightLineDiv = document.createElement('div');
                    rightLineDiv.className = 'sequential-line sequential-line-added';
                    rightLineDiv.dataset.index = `right-${rightLineNum}`;
                    rightLineDiv.dataset.lineNum = String(rightLineNum);

                    const rightLineContent = document.createElement('span');
                    rightLineContent.className = 'sequential-line-content';
                    rightLineContent.textContent = line || ' ';
                    rightLineDiv.appendChild(rightLineContent);
                    rightCode.appendChild(rightLineDiv);

                    rightLineNum++;
                } else {
                    // Show unchanged lines on both sides
                    const leftLineDiv = document.createElement('div');
                    leftLineDiv.className = 'sequential-line';
                    leftLineDiv.dataset.index = `left-${leftLineNum}`;
                    leftLineDiv.dataset.lineNum = String(leftLineNum);

                    const leftLineContent = document.createElement('span');
                    leftLineContent.className = 'sequential-line-content';
                    leftLineContent.textContent = line || ' ';
                    leftLineDiv.appendChild(leftLineContent);
                    leftCode.appendChild(leftLineDiv);

                    const rightLineDiv = document.createElement('div');
                    rightLineDiv.className = 'sequential-line';
                    rightLineDiv.dataset.index = `right-${rightLineNum}`;
                    rightLineDiv.dataset.lineNum = String(rightLineNum);

                    const rightLineContent = document.createElement('span');
                    rightLineContent.className = 'sequential-line-content';
                    rightLineContent.textContent = line || ' ';
                    rightLineDiv.appendChild(rightLineContent);
                    rightCode.appendChild(rightLineDiv);

                    leftLineNum++;
                    rightLineNum++;
                }
            });
        });

        leftPre.appendChild(leftCode);
        leftDisplay.appendChild(leftPre);
        leftContainer.appendChild(leftDisplay);

        rightPre.appendChild(rightCode);
        rightDisplay.appendChild(rightPre);
        rightContainer.appendChild(rightDisplay);

    } catch (error) {
        leftContainer.innerHTML = `<div class="sequential-error">Error displaying diff</div>`;
        rightContainer.innerHTML = `<div class="sequential-error">Error displaying diff</div>`;
    }
}

function renderInitialContent(content: string, leftContainer: HTMLElement, rightContainer: HTMLElement) {
    // Left side is empty for first iteration
    leftContainer.innerHTML = '<div class="sequential-content-display"><p style="text-align: center; color: var(--text-secondary-color); padding: 2rem;">No previous iteration</p></div>';

    // Right side shows the initial content
    const rightPre = document.createElement('pre');
    const rightCode = document.createElement('code');
    const rightDisplay = document.createElement('div');
    rightDisplay.className = 'sequential-content-display';

    const lines = content.split('\n');
    lines.forEach((line: string, index: number) => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'sequential-line';
        lineDiv.dataset.index = `right-${index + 1}`;
        lineDiv.dataset.lineNum = String(index + 1);

        const lineContent = document.createElement('span');
        lineContent.className = 'sequential-line-content';
        lineContent.textContent = line || ' ';
        lineDiv.appendChild(lineContent);
        rightCode.appendChild(lineDiv);
    });

    rightPre.appendChild(rightCode);
    rightDisplay.appendChild(rightPre);
    rightContainer.appendChild(rightDisplay);
}

function togglePlayback() {
    if (!sequentialState) return;

    sequentialState.isPlaying = !sequentialState.isPlaying;
    const playBtn = document.getElementById('seq-play-btn');

    if (sequentialState.isPlaying) {
        playBtn?.querySelector('.material-symbols-outlined')?.replaceWith(
            Object.assign(document.createElement('span'), {
                className: 'material-symbols-outlined',
                textContent: 'pause'
            })
        );
        startAnimation();
    } else {
        playBtn?.querySelector('.material-symbols-outlined')?.replaceWith(
            Object.assign(document.createElement('span'), {
                className: 'material-symbols-outlined',
                textContent: 'play_arrow'
            })
        );
        if (sequentialState.animationFrame) {
            cancelAnimationFrame(sequentialState.animationFrame);
        }
    }
}

function startAnimation() {
    if (!sequentialState || !sequentialState.isPlaying) return;

    if (sequentialState.viewMode === 'split') {
        startSplitAnimation();
    } else {
        startUnifiedAnimation();
    }
}

function startSplitAnimation() {
    if (!sequentialState || !sequentialState.isPlaying) return;

    const leftContent = document.getElementById('sequential-left-content');
    const rightContent = document.getElementById('sequential-right-content');

    if (!leftContent || !rightContent) return;

    const leftLines = leftContent.querySelectorAll('.sequential-line');
    const rightLines = rightContent.querySelectorAll('.sequential-line');
    const maxLines = Math.max(leftLines.length, rightLines.length);

    let lastTimestamp = performance.now();
    let accumulatedTime = 0;

    function animateNextLine(timestamp: number) {
        if (!sequentialState || !sequentialState.isPlaying) return;

        const deltaTime = timestamp - lastTimestamp;
        lastTimestamp = timestamp;
        accumulatedTime += deltaTime;

        // Check if enough time has passed for next line (120fps compatible)
        if (accumulatedTime >= sequentialState.speed) {
            accumulatedTime = 0;

            if (sequentialState.currentLineIndex < maxLines) {
                // Animate both sides simultaneously
                if (sequentialState.currentLineIndex < leftLines.length) {
                    const leftLine = leftLines[sequentialState.currentLineIndex] as HTMLElement;
                    leftLine.classList.add('sequential-line-animate');

                    // Ultra-smooth scroll with higher interpolation for 120fps
                    if (leftContent) {
                        const lineTop = leftLine.offsetTop;
                        const containerHeight = leftContent.clientHeight;
                        const targetScroll = Math.max(0, lineTop - containerHeight / 2 + leftLine.offsetHeight / 2);

                        // Higher interpolation factor for 120fps smoothness
                        const currentScroll = leftContent.scrollTop;
                        const diff = targetScroll - currentScroll;
                        leftContent.scrollTop = currentScroll + diff * 0.25;
                    }
                }

                if (sequentialState.currentLineIndex < rightLines.length) {
                    const rightLine = rightLines[sequentialState.currentLineIndex] as HTMLElement;
                    rightLine.classList.add('sequential-line-animate');
                }

                sequentialState.currentLineIndex++;
            } else {
                // Both sides complete - move to next iteration
                sequentialState.currentLineIndex = 0;
                setTimeout(() => {
                    if (sequentialState && sequentialState.isPlaying) {
                        if (sequentialState.currentIteration < sequentialState.contentStates.length - 1) {
                            nextIteration();
                            setTimeout(() => startAnimation(), 400);
                        } else {
                            // End of playback
                            togglePlayback();
                        }
                    }
                }, 600);
                return;
            }
        }

        // Continue animation loop at native refresh rate (60/120/144fps)
        sequentialState.animationFrame = requestAnimationFrame(animateNextLine);
    }

    sequentialState.animationFrame = requestAnimationFrame(animateNextLine);
}

function startUnifiedAnimation() {
    if (!sequentialState || !sequentialState.isPlaying) return;

    const contentArea = document.getElementById('sequential-content-area');
    if (!contentArea) return;

    const lines = contentArea.querySelectorAll('.sequential-line');
    let lastTimestamp = performance.now();
    let accumulatedTime = 0;

    function animateNextLine(timestamp: number) {
        if (!sequentialState || !sequentialState.isPlaying) return;

        const deltaTime = timestamp - lastTimestamp;
        lastTimestamp = timestamp;
        accumulatedTime += deltaTime;

        if (accumulatedTime >= sequentialState.speed) {
            accumulatedTime = 0;

            if (sequentialState.currentLineIndex < lines.length) {
                const line = lines[sequentialState.currentLineIndex] as HTMLElement;
                line.classList.add('sequential-line-animate');

                // Auto-scroll to keep line in view
                line.scrollIntoView({ behavior: 'smooth', block: 'center' });

                sequentialState.currentLineIndex++;
            } else {
                // Animation complete - move to next iteration
                sequentialState.currentLineIndex = 0;
                setTimeout(() => {
                    if (sequentialState && sequentialState.isPlaying) {
                        if (sequentialState.currentIteration < sequentialState.contentStates.length - 1) {
                            nextIteration();
                            setTimeout(() => startAnimation(), 400);
                        } else {
                            togglePlayback();
                        }
                    }
                }, 600);
                return;
            }
        }

        sequentialState.animationFrame = requestAnimationFrame(animateNextLine);
    }

    sequentialState.animationFrame = requestAnimationFrame(animateNextLine);
}

function nextIteration() {
    if (!sequentialState) return;

    if (sequentialState.currentIteration < sequentialState.contentStates.length - 1) {
        const wasPlaying = sequentialState.isPlaying;

        // Calculate current progress percentage
        const currentProgress = calculateProgressPercentage();

        // Stop animation if playing
        if (wasPlaying && sequentialState.animationFrame) {
            cancelAnimationFrame(sequentialState.animationFrame);
            sequentialState.isPlaying = false;
        }

        sequentialState.currentIteration++;
        renderSequentialContent();

        // Restore position based on progress percentage
        restorePositionFromProgress(currentProgress);

        // Resume animation if it was playing
        if (wasPlaying) {
            sequentialState.isPlaying = true;
            startAnimation();
        }
    }
}

function previousIteration() {
    if (!sequentialState) return;

    if (sequentialState.currentIteration > 0) {
        const wasPlaying = sequentialState.isPlaying;

        // Calculate current progress percentage
        const currentProgress = calculateProgressPercentage();

        // Stop animation if playing
        if (wasPlaying && sequentialState.animationFrame) {
            cancelAnimationFrame(sequentialState.animationFrame);
            sequentialState.isPlaying = false;
        }

        sequentialState.currentIteration--;
        renderSequentialContent();

        // Restore position based on progress percentage
        restorePositionFromProgress(currentProgress);

        // Resume animation if it was playing
        if (wasPlaying) {
            sequentialState.isPlaying = true;
            startAnimation();
        }
    }
}

function calculateProgressPercentage(): number {
    if (!sequentialState) return 0;

    // Get total lines in current view
    let totalLines = 0;

    if (sequentialState.viewMode === 'split') {
        const leftContent = document.getElementById('sequential-left-content');
        const rightContent = document.getElementById('sequential-right-content');
        if (leftContent && rightContent) {
            const leftLines = leftContent.querySelectorAll('.sequential-line').length;
            const rightLines = rightContent.querySelectorAll('.sequential-line').length;
            totalLines = Math.max(leftLines, rightLines);
        }
    } else {
        const contentArea = document.getElementById('sequential-content-area');
        if (contentArea) {
            totalLines = contentArea.querySelectorAll('.sequential-line').length;
        }
    }

    if (totalLines === 0) return 0;

    // Calculate percentage based on current line index
    return sequentialState.currentLineIndex / totalLines;
}

function restorePositionFromProgress(progressPercentage: number) {
    if (!sequentialState) return;

    // Get total lines in new view
    let totalLines = 0;

    if (sequentialState.viewMode === 'split') {
        const leftContent = document.getElementById('sequential-left-content');
        const rightContent = document.getElementById('sequential-right-content');
        if (leftContent && rightContent) {
            const leftLines = leftContent.querySelectorAll('.sequential-line').length;
            const rightLines = rightContent.querySelectorAll('.sequential-line').length;
            totalLines = Math.max(leftLines, rightLines);
        }
    } else {
        const contentArea = document.getElementById('sequential-content-area');
        if (contentArea) {
            totalLines = contentArea.querySelectorAll('.sequential-line').length;
        }
    }

    // Calculate new line index based on progress percentage
    sequentialState.currentLineIndex = Math.floor(totalLines * progressPercentage);

    // Animate all lines up to the current position instantly
    if (sequentialState.viewMode === 'split') {
        const leftContent = document.getElementById('sequential-left-content');
        const rightContent = document.getElementById('sequential-right-content');
        if (leftContent && rightContent) {
            const leftLines = leftContent.querySelectorAll('.sequential-line');
            const rightLines = rightContent.querySelectorAll('.sequential-line');

            for (let i = 0; i < sequentialState.currentLineIndex; i++) {
                if (i < leftLines.length) {
                    leftLines[i].classList.add('sequential-line-animate');
                }
                if (i < rightLines.length) {
                    rightLines[i].classList.add('sequential-line-animate');
                }
            }

            // Scroll to current position
            if (sequentialState.currentLineIndex < leftLines.length) {
                const line = leftLines[sequentialState.currentLineIndex] as HTMLElement;
                const lineTop = line.offsetTop;
                const containerHeight = leftContent.clientHeight;
                leftContent.scrollTop = Math.max(0, lineTop - containerHeight / 2);
            }
        }
    } else {
        const contentArea = document.getElementById('sequential-content-area');
        if (contentArea) {
            const lines = contentArea.querySelectorAll('.sequential-line');

            for (let i = 0; i < sequentialState.currentLineIndex; i++) {
                if (i < lines.length) {
                    lines[i].classList.add('sequential-line-animate');
                }
            }

            // Scroll to current position
            if (sequentialState.currentLineIndex < lines.length) {
                const line = lines[sequentialState.currentLineIndex] as HTMLElement;
                line.scrollIntoView({ behavior: 'auto', block: 'center' });
            }
        }
    }
}

function setPlaybackSpeed(speed: number) {
    if (!sequentialState) return;

    sequentialState.speed = speed;

    // Update active button
    document.querySelectorAll('.sequential-speed-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((btn as HTMLElement).dataset.speed === String(speed)) {
            btn.classList.add('active');
        }
    });
}

function toggleViewMode() {
    if (!sequentialState) return;

    // Stop animation if playing
    const wasPlaying = sequentialState.isPlaying;
    if (wasPlaying) {
        togglePlayback();
    }

    // Toggle view mode
    sequentialState.viewMode = sequentialState.viewMode === 'split' ? 'unified' : 'split';

    // Update button text
    const toggleBtn = document.getElementById('sequential-view-toggle-btn');
    if (toggleBtn) {
        const buttonText = toggleBtn.querySelector('.button-text');
        const icon = toggleBtn.querySelector('.material-symbols-outlined');
        if (buttonText && icon) {
            if (sequentialState.viewMode === 'split') {
                buttonText.textContent = 'Unified View';
                icon.textContent = 'view_column';
            } else {
                buttonText.textContent = 'Split View';
                icon.textContent = 'view_agenda';
            }
        }
    }

    // Re-render content
    renderSequentialContent();

    // Resume animation if it was playing
    if (wasPlaying) {
        togglePlayback();
    }
}

function closeSequentialViewer() {
    const overlay = document.getElementById('sequential-viewer-overlay');
    if (overlay) {
        if ((overlay as any).cleanup) {
            (overlay as any).cleanup();
        }
        overlay.classList.remove('visible');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }
    sequentialState = null;
}

// Add event listener for Compare buttons
// Note: Compare button handler is registered in index.tsx. Avoid duplicating here to prevent
// double-opening modals and broken event bindings.