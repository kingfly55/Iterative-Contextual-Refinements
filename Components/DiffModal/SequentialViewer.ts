import * as Diff from 'diff';
import { SequentialState } from './types';

// Sequential Animation Viewer
let sequentialState: SequentialState | null = null;

export function openSequentialViewer(contentStates: Array<{ title: string; content: string }>) {
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

                    if (rightContent) {
                        const lineTop = rightLine.offsetTop;
                        const containerHeight = rightContent.clientHeight;
                        const targetScroll = Math.max(0, lineTop - containerHeight / 2 + rightLine.offsetHeight / 2);

                        const currentScroll = rightContent.scrollTop;
                        const diff = targetScroll - currentScroll;
                        rightContent.scrollTop = currentScroll + diff * 0.25;
                    }
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

export function closeSequentialViewer() {
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
