import * as Diff from 'diff';
import { html as diff2htmlHtml } from 'diff2html';
import { DiffSourceData, DiffContentType, Iteration, Pipeline } from './types';
import { createUnifiedDiff, applyCustomThemeToD2H, addDarkThemeStyles, renderMathContent } from './utils';
import { highlightCodeSync } from '../../Shiki';

export { renderMathContent, addDarkThemeStyles };

// ─── Pure Diff Logic ─────────────────────────────────────────────────────────

export function computeDiffStats(sourceText: string, targetText: string): { added: number; removed: number; total: number } {
    const differences = Diff.diffLines(sourceText, targetText, { newlineIsToken: true });
    let added = 0;
    let removed = 0;

    differences.forEach(part => {
        const lines = part.value.split('\n').filter(line => line !== '' || part.value.endsWith('\n'));
        if (part.added) {
            added += lines.length;
        } else if (part.removed) {
            removed += lines.length;
        }
    });

    return { added, removed, total: added + removed };
}

export function generateUnifiedDiffHTML(sourceText: string, targetText: string): string {
    const unifiedDiff = createUnifiedDiff(sourceText, targetText);
    return diff2htmlHtml(unifiedDiff, {
        outputFormat: 'line-by-line',
        drawFileList: false,
        matching: 'none',
        renderNothingWhenEmpty: false
    });
}

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

export function renderMathIntoElement(container: HTMLElement, text: string): void {
    container.innerHTML = renderMathContent(text);
}

export function highlightCodeBlocks(container: HTMLElement): void {
    container.querySelectorAll('pre code').forEach(block => {
        const code = block.textContent || '';
        if (!code.trim()) return;
        try {
            const highlighted = highlightCodeSync(code, 'html');
            const match = highlighted.match(/<code[^>]*>([\s\S]*)<\/code>/);
            if (match?.[1]) block.innerHTML = match[1];
        } catch {
            // Ignore highlighting errors
        }
    });
}

// ─── Iteration Content Extraction ────────────────────────────────────────────

export interface IterationContent {
    sourceContent: string;
    targetContent: string;
    sourceTitle: string;
    targetTitle: string;
}

export function extractIterationContent(iteration: Iteration, contentType: DiffContentType): IterationContent | null {
    if (contentType === 'html') {
        const sourceContent = iteration.contentBeforeBugFix || iteration.generatedContent || '';
        const targetContent = iteration.generatedContent || '';

        let sourceTitle: string;
        let targetTitle: string;

        if (iteration.title.includes('Initial')) {
            sourceTitle = 'Initial Generation (Before Bug Fix)';
            targetTitle = 'After Initial Bug Fix';
        } else if (
            iteration.title.includes('Refinement') ||
            iteration.title.includes('Stabilization') ||
            iteration.title.includes('Feature')
        ) {
            sourceTitle = 'After Feature Implementation';
            targetTitle = 'After Bug Fix & Completion';
        } else {
            sourceTitle = 'Before Bug Fix';
            targetTitle = 'After Bug Fix';
        }

        return { sourceContent, targetContent, sourceTitle, targetTitle };
    } else {
        const content = iteration.generatedOrRevisedText || iteration.generatedMainContent || '';
        return {
            sourceContent: content,
            targetContent: content,
            sourceTitle: iteration.title,
            targetTitle: iteration.title
        };
    }
}

export function resolveModalTitle(pipeline: Pipeline, iterationNumber: number): string {
    const iteration = pipeline.iterations.find(i => i.iterationNumber === iterationNumber);
    if (!iteration) return 'Compare Outputs';

    const sorted = pipeline.iterations.map(i => i.iterationNumber).sort((a, b) => a - b);
    const isFirst = iterationNumber === sorted[0];
    const isLast = iterationNumber === sorted[sorted.length - 1];

    if (isFirst && iteration.title.toLowerCase().includes('initial')) {
        return 'Compare Outputs (Initial Generation)';
    }
    if (isLast && (iteration.title.toLowerCase().includes('final') || iteration.title.toLowerCase().includes('complete'))) {
        return 'Compare Outputs (Final Generation)';
    }
    return `Compare Outputs (Iteration ${iterationNumber})`;
}

export function buildDiffTargetTree(pipelines: Pipeline[]): Array<{ pipelineId: number; pipelineLabel: string; iterations: Array<{ iterationNumber: number; label: string }> }> {
    return pipelines
        .filter(p => p.iterations && p.iterations.length > 0)
        .map((p, idx) => ({
            pipelineId: p.id,
            pipelineLabel: `Pipeline ${idx + 1}`,
            iterations: p.iterations
                .filter(iter => iter.generatedContent || iter.contentBeforeBugFix)
                .map((iter, iIdx) => ({
                    iterationNumber: iter.iterationNumber ?? iIdx + 1,
                    label: iter.title || `Iteration ${iter.iterationNumber ?? iIdx + 1}`
                }))
        }))
        .filter(group => group.iterations.length > 0);
}

export function resolveGlobalCompareContent(
    diffSourceData: DiffSourceData,
    targetPipelineId: number,
    targetIterationNumber: number,
    pipelines: Pipeline[]
): { sourceContent: string; targetContent: string } | null {
    const sourcePipeline = pipelines.find(p => p.id === diffSourceData.pipelineId);
    const targetPipeline = pipelines.find(p => p.id === targetPipelineId);
    if (!sourcePipeline || !targetPipeline) return null;

    const sourceIter = sourcePipeline.iterations.find(i => i.iterationNumber === diffSourceData.iterationNumber);
    const targetIter = targetPipeline.iterations.find(i => i.iterationNumber === targetIterationNumber);
    if (!sourceIter || !targetIter) return null;

    const sourceContent = sourceIter.contentBeforeBugFix || sourceIter.generatedContent || '';
    const targetContent = targetIter.generatedContent || sourceIter.contentBeforeBugFix || '';

    return { sourceContent, targetContent };
}

// ─── Fullscreen Preview Logic (pure DOM — standalone, no React needed) ───────

export function openFullscreenPreview(content: string, sessionId: string): void {
    let overlay = document.getElementById(`preview-overlay-${sessionId}`);
    if (overlay) {
        const iframe = overlay.querySelector('iframe') as HTMLIFrameElement;
        const refreshIndicator = overlay.querySelector('.refresh-indicator') as HTMLElement;
        if (iframe && refreshIndicator) {
            refreshIndicator.style.display = 'flex';
            const styledContent = addDarkThemeStyles(content);
            const blob = new Blob([styledContent], { type: 'text/html' });
            iframe.src = URL.createObjectURL(blob);
            iframe.onload = () => {
                setTimeout(() => { refreshIndicator.style.display = 'none'; }, 300);
            };
        }
        return;
    }

    overlay = document.createElement('div');
    overlay.id = `preview-overlay-${sessionId}`;
    overlay.className = 'preview-fullscreen-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100vw; height: 100vh;
        background: var(--bg-color); z-index: 10000;
        display: flex; flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex; align-items: center; justify-content: space-between;
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
            cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-weight: 500;
        ">
            <span class="material-symbols-outlined">close</span>
            Close
        </button>
    `;

    const refreshIndicator = document.createElement('div');
    refreshIndicator.className = 'refresh-indicator';
    refreshIndicator.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: rgba(var(--card-bg-base-rgb), 0.95);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius-md);
        padding: 1rem 1.5rem; display: none; align-items: center; gap: 0.75rem;
        z-index: 10001; backdrop-filter: blur(16px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    `;
    refreshIndicator.innerHTML = `
        <div style="
            width: 20px; height: 20px;
            border: 2px solid rgba(var(--accent-purple-rgb), 0.3);
            border-top-color: var(--accent-purple);
            border-radius: 50%; animation: spin 0.8s linear infinite;
        "></div>
        <span style="color: var(--text-color); font-weight: 500;">Refreshing...</span>
    `;

    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = 'flex: 1; position: relative; width: 100%;';

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width: 100%; height: 100%; border: none; background: white;';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');

    const styledContent = addDarkThemeStyles(content);
    const blob = new Blob([styledContent], { type: 'text/html' });
    iframe.src = URL.createObjectURL(blob);

    iframeContainer.appendChild(refreshIndicator);
    iframeContainer.appendChild(iframe);

    overlay.appendChild(header);
    overlay.appendChild(iframeContainer);
    document.body.appendChild(overlay);

    const closeBtn = header.querySelector('.preview-close-btn');
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay!.remove();
            document.removeEventListener('keydown', handleKeyDown);
        }
    };

    closeBtn?.addEventListener('click', () => {
        overlay!.remove();
    });
    document.addEventListener('keydown', handleKeyDown);
}

// Re-export imperative portal API from the React component file
export { openDiffModal, closeDiffModal, openPromptDiffModal, getDiffSourceData, getCurrentSourceContent, getCurrentTargetContent } from './DiffModalController.tsx';
