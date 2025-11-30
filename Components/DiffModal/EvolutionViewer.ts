import { generateSplitDiffHTML, applyDiffTheme } from './DiffModalController';
import { renderMathContent } from './utils';
import { EvolutionViewerState, ContentState } from './types';
import { openSequentialViewer } from './SequentialViewer';

// Store active evolution viewers for live updates
const activeEvolutionViewers = new Map<string, EvolutionViewerState>();

export function openEvolutionViewer(pipelineIdOverride?: number) {
    const pipelinesState = (window as any).pipelinesState;
    if (!pipelinesState || !Array.isArray(pipelinesState)) {
        alert('Cannot open evolution viewer: Invalid pipeline data.');
        return;
    }

    // Use override pipelineId if provided, otherwise check if we can get it from somewhere else
    // In the original code, it tried to get it from diffSourceData. 
    // Since we don't have direct access to diffSourceData here (it's in Controller), 
    // we might need to pass it or export a getter from Controller.
    // For now, let's assume pipelineIdOverride is provided or we fail gracefully.

    // If pipelineIdOverride is not provided, we should probably try to get the "current" pipeline.
    // But for now, let's rely on the caller providing it.
    const pipelineId = pipelineIdOverride;

    if (pipelineId === null || pipelineId === undefined) {
        // Try to get from global diff source data if available
        // This would require importing getDiffSourceData from Controller
        // Let's do that dynamically or assume caller handles it.
        // For strict modularity, let's import the getter.
        const { getDiffSourceData } = require('./DiffModalController');
        const diffSourceData = getDiffSourceData();
        if (diffSourceData) {
            // pipelineId = diffSourceData.pipelineId; // This would be a re-assignment
            // Let's just call createEvolutionViewerModal with the found pipeline
            const pipeline = pipelinesState.find((p: any) => p.id === diffSourceData.pipelineId);
            if (pipeline) {
                createEvolutionViewerModal(pipeline);
                return;
            }
        }
        return;
    }

    const pipeline = pipelinesState.find((p: any) => p.id === pipelineId);

    if (!pipeline) {
        alert('Pipeline not found.');
        return;
    }

    // Create evolution viewer modal
    createEvolutionViewerModal(pipeline);
}

/**
 * Opens evolution viewer from content history array (for Agentic and Contextual modes)
 * Supports live updates - if viewer is already open for this sessionId, it updates in place
 */
export function openEvolutionViewerFromHistory(
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
    viewer: EvolutionViewerState,
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
export function updateEvolutionViewerIfOpen(
    sessionId: string,
    contentHistory: Array<{ content: string; title: string; timestamp: number }>
) {
    const viewer = activeEvolutionViewers.get(sessionId);
    if (viewer && contentHistory) {
        updateEvolutionViewer(viewer, contentHistory);
    }
}

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

export function closeEvolutionViewer() {
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
