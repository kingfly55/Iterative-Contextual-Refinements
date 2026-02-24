import { openEvolutionViewerFromHistory } from '../Styles/Components/DiffModal/EvolutionViewer';
import { DeepthinkPipelineState, getActiveDeepthinkPipeline, SolutionPoolParsedSolution, SolutionPoolParsedResponse } from './DeepthinkCore';
import { renderMathContent } from '../Styles/Components/RenderMathMarkdown';
import './SolutionPool.css';

// Track solution pool versions for evolution view
const solutionPoolVersions = new Map<string, Array<{ content: string; title: string; timestamp: number }>>();

/**
 * Adds a new version of the solution pool to the history
 */
export function addSolutionPoolVersion(pipelineId: string, poolContent: string, iterationNumber: number) {
    if (!pipelineId || !poolContent) return;

    const sessionId = `solution-pool-${pipelineId}`;
    let versions = solutionPoolVersions.get(sessionId);

    if (!versions) {
        versions = [];
        solutionPoolVersions.set(sessionId, versions);
    }

    versions.push({
        content: poolContent,
        title: `Iteration ${iterationNumber}`,
        timestamp: Date.now()
    });
}

/**
 * Opens the evolution viewer for solution pool versions
 */
export function openSolutionPoolEvolution(pipelineId: string) {
    const sessionId = `solution-pool-${pipelineId}`;
    const versions = solutionPoolVersions.get(sessionId);

    if (!versions || versions.length === 0) {
        alert('No solution pool history available yet. The pool needs at least one update to view evolution.');
        return;
    }

    openEvolutionViewerFromHistory(versions, sessionId);
}


// ==========================================================================
// FULL-SCREEN PANEL — Solution Pool Viewer
// ==========================================================================

/**
 * Creates a full-screen panel overlay for viewing solution pool content.
 * Returns the body element for content and a close function.
 */
function createSolutionPoolPanel(title: string): { body: HTMLElement; closePanel: () => void; overlay: HTMLElement } {
    const overlay = document.createElement('div');
    overlay.className = 'sp-fullscreen-overlay';

    const panel = document.createElement('div');
    panel.className = 'sp-fullscreen-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'sp-fullscreen-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'sp-fullscreen-header-left';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined sp-header-icon';
    icon.textContent = 'workspaces';

    const titleEl = document.createElement('h2');
    titleEl.className = 'sp-fullscreen-title';
    titleEl.textContent = title;

    headerLeft.appendChild(icon);
    headerLeft.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sp-close-btn';
    closeBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    body.className = 'sp-fullscreen-body custom-scrollbar';

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('sp-visible'));

    // Close logic
    const closePanel = () => {
        overlay.classList.remove('sp-visible');
        document.removeEventListener('keydown', handleKeyDown);
        setTimeout(() => overlay.remove(), 250);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closePanel();
    };

    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePanel();
    });
    document.addEventListener('keydown', handleKeyDown);

    return { body, closePanel, overlay };
}


/**
 * Renders a single solution card as a DOM element
 */
function createSolutionCard(solution: SolutionPoolParsedSolution, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'sp-solution-card';
    card.style.animationDelay = `${index * 0.06}s`;

    // Card header
    const cardHeader = document.createElement('div');
    cardHeader.className = 'sp-card-header';

    const cardNumber = document.createElement('span');
    cardNumber.className = 'sp-card-number';
    cardNumber.textContent = `${index + 1}`;

    const cardTitle = document.createElement('h3');
    cardTitle.className = 'sp-card-title';
    cardTitle.textContent = solution.title || `Solution ${index + 1}`;

    const confidence = solution.confidence;
    const confidenceBadge = document.createElement('span');
    confidenceBadge.className = `sp-confidence-badge ${confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low'}`;
    confidenceBadge.textContent = `${(confidence * 100).toFixed(0)}%`;

    cardHeader.appendChild(cardNumber);
    cardHeader.appendChild(cardTitle);
    cardHeader.appendChild(confidenceBadge);

    // Approach summary
    if (solution.approach_summary) {
        const summary = document.createElement('p');
        summary.className = 'sp-approach-summary';
        summary.textContent = solution.approach_summary;
        card.appendChild(cardHeader);
        card.appendChild(summary);
    } else {
        card.appendChild(cardHeader);
    }

    // Content area
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'sp-card-content-wrapper';

    const contentEl = document.createElement('div');
    contentEl.className = 'sp-card-content';
    // Render with math/markdown support
    contentEl.innerHTML = renderMathContent(solution.content || '');
    contentWrapper.appendChild(contentEl);
    card.appendChild(contentWrapper);

    // Internal critique — collapsible
    if (solution.internal_critique) {
        const critiqueToggle = document.createElement('button');
        critiqueToggle.className = 'sp-critique-toggle';
        critiqueToggle.innerHTML = `
            <span class="material-symbols-outlined">psychology_alt</span>
            Internal Critique
            <span class="material-symbols-outlined sp-critique-chevron">expand_more</span>
        `;

        const critiqueBody = document.createElement('div');
        critiqueBody.className = 'sp-critique-body sp-collapsed';
        critiqueBody.innerHTML = renderMathContent(solution.internal_critique);

        critiqueToggle.addEventListener('click', () => {
            const isCollapsed = critiqueBody.classList.contains('sp-collapsed');
            critiqueBody.classList.toggle('sp-collapsed');
            const chevron = critiqueToggle.querySelector('.sp-critique-chevron');
            if (chevron) {
                chevron.textContent = isCollapsed ? 'expand_less' : 'expand_more';
            }
        });

        card.appendChild(critiqueToggle);
        card.appendChild(critiqueBody);
    }

    return card;
}


/**
 * Renders a fallback raw-text view when JSON parsing fails
 */
function createRawTextFallback(content: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'sp-raw-fallback';

    const notice = document.createElement('div');
    notice.className = 'sp-raw-notice';
    notice.innerHTML = `
        <span class="material-symbols-outlined">info</span>
        <span>Pool response could not be parsed as structured JSON. Showing raw content.</span>
    `;

    const pre = document.createElement('pre');
    pre.className = 'sp-raw-content';
    pre.textContent = content;

    container.appendChild(notice);
    container.appendChild(pre);
    return container;
}


/**
 * Opens a full-screen panel for a specific strategy's solution pool
 */
export function openSolutionPoolModal(strategyId: string, iteration: number) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;

    const poolAgent = pipeline.structuredSolutionPoolAgents?.find(a => a.mainStrategyId === strategyId);
    if (!poolAgent || !poolAgent.poolResponse) {
        alert('No solution pool available for this strategy.');
        return;
    }

    const title = `${strategyId.toUpperCase()} — Iteration ${iteration} • Solution Pool`;
    const { body } = createSolutionPoolPanel(title);

    // Try to render parsed solutions as cards
    if (poolAgent.parsedPoolResponse && poolAgent.parsedPoolResponse.solutions.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'sp-cards-grid';

        poolAgent.parsedPoolResponse.solutions.forEach((solution, idx) => {
            grid.appendChild(createSolutionCard(solution, idx));
        });

        body.appendChild(grid);
    } else {
        // Fallback: try re-parsing raw response
        try {
            const parsed = JSON.parse(poolAgent.poolResponse);
            if (parsed && Array.isArray(parsed.solutions)) {
                const grid = document.createElement('div');
                grid.className = 'sp-cards-grid';

                parsed.solutions.forEach((solution: any, idx: number) => {
                    grid.appendChild(createSolutionCard({
                        title: solution.title || `Solution ${idx + 1}`,
                        approach_summary: solution.approach_summary || '',
                        content: solution.content || '',
                        confidence: typeof solution.confidence === 'number' ? solution.confidence : 0.5,
                        internal_critique: solution.internal_critique || ''
                    }, idx));
                });

                body.appendChild(grid);
            } else {
                body.appendChild(createRawTextFallback(poolAgent.poolResponse));
            }
        } catch {
            body.appendChild(createRawTextFallback(poolAgent.poolResponse));
        }
    }
}


/**
 * Opens the full repository solution pool in a full-screen panel with strategy sections
 */
export function openCurrentSolutionPool(pipelineId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline || pipeline.id !== pipelineId) {
        alert('Pipeline not found.');
        return;
    }

    if (!pipeline.structuredSolutionPool || pipeline.structuredSolutionPool.trim() === '') {
        alert('No solution pool content available yet. The pool is still initializing.');
        return;
    }

    const { body } = createSolutionPoolPanel('Solution Pool Repository');

    // Try to parse the full structured pool as JSON
    try {
        const poolData = JSON.parse(pipeline.structuredSolutionPool);

        if (poolData && Array.isArray(poolData.strategies)) {
            poolData.strategies.forEach((strategy: any, stratIdx: number) => {
                const section = document.createElement('div');
                section.className = 'sp-strategy-section';
                section.style.animationDelay = `${stratIdx * 0.08}s`;

                // Strategy header
                const sectionHeader = document.createElement('div');
                sectionHeader.className = 'sp-strategy-section-header';

                const headerIcon = document.createElement('span');
                headerIcon.className = 'material-symbols-outlined';
                headerIcon.textContent = 'deployed_code';

                const headerTitle = document.createElement('h3');
                headerTitle.textContent = strategy.strategy_id?.toUpperCase() || `Strategy ${stratIdx + 1}`;

                const headerSubtitle = document.createElement('span');
                headerSubtitle.className = 'sp-strategy-subtitle';
                headerSubtitle.textContent = strategy.strategy_text ?
                    (strategy.strategy_text.length > 120 ? strategy.strategy_text.slice(0, 120) + '…' : strategy.strategy_text)
                    : '';

                sectionHeader.appendChild(headerIcon);
                sectionHeader.appendChild(headerTitle);
                if (strategy.strategy_text) sectionHeader.appendChild(headerSubtitle);

                section.appendChild(sectionHeader);

                // Original executed solution
                if (strategy.original_solution) {
                    const origLabel = document.createElement('div');
                    origLabel.className = 'sp-pool-label sp-original-label';
                    origLabel.innerHTML = '<span class="material-symbols-outlined">code</span> Original Executed Solution';
                    section.appendChild(origLabel);

                    const origContent = document.createElement('div');
                    origContent.className = 'sp-timeline-section sp-timeline-corrected';
                    const origBody = document.createElement('div');
                    origBody.className = 'sp-timeline-section-content';
                    origBody.innerHTML = renderMathContent(strategy.original_solution);
                    origContent.appendChild(origBody);
                    section.appendChild(origContent);
                }

                // Latest critique (the most recent critique for this strategy)
                if (strategy.latest_critique) {
                    const critiqueLabel = document.createElement('div');
                    critiqueLabel.className = 'sp-pool-label sp-critique-label';
                    critiqueLabel.innerHTML = '<span class="material-symbols-outlined">rate_review</span> Latest Critique';
                    section.appendChild(critiqueLabel);

                    const critiqueContent = document.createElement('div');
                    critiqueContent.className = 'sp-timeline-section sp-timeline-critique';
                    const critiqueBody = document.createElement('div');
                    critiqueBody.className = 'sp-timeline-section-content';
                    critiqueBody.innerHTML = renderMathContent(strategy.latest_critique);
                    critiqueContent.appendChild(critiqueBody);
                    section.appendChild(critiqueContent);
                }

                // Solution pool cards for this strategy
                if (strategy.solution_pool) {
                    const poolLabel = document.createElement('div');
                    poolLabel.className = 'sp-pool-label';
                    poolLabel.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> Solution Pool Output';
                    section.appendChild(poolLabel);

                    const parsedPool: SolutionPoolParsedResponse | null =
                        typeof strategy.solution_pool === 'object' && strategy.solution_pool.solutions
                            ? strategy.solution_pool
                            : null;

                    if (parsedPool && Array.isArray(parsedPool.solutions)) {
                        const grid = document.createElement('div');
                        grid.className = 'sp-cards-grid';

                        parsedPool.solutions.forEach((solution: SolutionPoolParsedSolution, idx: number) => {
                            grid.appendChild(createSolutionCard(solution, idx));
                        });

                        section.appendChild(grid);
                    } else if (typeof strategy.solution_pool === 'string') {
                        section.appendChild(createRawTextFallback(strategy.solution_pool));
                    }
                }

                // Show iteration history (critiques & corrections) as a timeline
                if (strategy.iterations && strategy.iterations.length > 0) {
                    const timelineLabel = document.createElement('div');
                    timelineLabel.className = 'sp-pool-label sp-timeline-label';
                    timelineLabel.innerHTML = '<span class="material-symbols-outlined">timeline</span> Iteration History';
                    section.appendChild(timelineLabel);

                    const timeline = document.createElement('div');
                    timeline.className = 'sp-iteration-timeline';

                    strategy.iterations.forEach((iter: any) => {
                        const iterEl = document.createElement('div');
                        iterEl.className = 'sp-timeline-item';

                        const iterHeader = document.createElement('div');
                        iterHeader.className = 'sp-timeline-item-header';
                        iterHeader.textContent = `Iteration ${iter.iteration_number}`;

                        iterEl.appendChild(iterHeader);

                        if (iter.critique) {
                            const critiqueEl = document.createElement('div');
                            critiqueEl.className = 'sp-timeline-section sp-timeline-critique';
                            critiqueEl.innerHTML = `<div class="sp-timeline-section-label"><span class="material-symbols-outlined">rate_review</span> Critique</div>`;
                            const critiqueContent = document.createElement('div');
                            critiqueContent.className = 'sp-timeline-section-content';
                            critiqueContent.innerHTML = renderMathContent(iter.critique);
                            critiqueEl.appendChild(critiqueContent);
                            iterEl.appendChild(critiqueEl);
                        }

                        if (iter.corrected_solution) {
                            const correctedEl = document.createElement('div');
                            correctedEl.className = 'sp-timeline-section sp-timeline-corrected';
                            correctedEl.innerHTML = `<div class="sp-timeline-section-label"><span class="material-symbols-outlined">auto_fix_high</span> Corrected Solution</div>`;
                            const correctedContent = document.createElement('div');
                            correctedContent.className = 'sp-timeline-section-content';
                            correctedContent.innerHTML = renderMathContent(iter.corrected_solution);
                            correctedEl.appendChild(correctedContent);
                            iterEl.appendChild(correctedEl);
                        }

                        timeline.appendChild(iterEl);
                    });

                    section.appendChild(timeline);
                }

                body.appendChild(section);
            });
        } else {
            // poolData exists but isn't in expected format
            body.appendChild(createRawTextFallback(pipeline.structuredSolutionPool));
        }
    } catch {
        // Not valid JSON — show raw text
        body.appendChild(createRawTextFallback(pipeline.structuredSolutionPool));
    }
}


/**
 * Downloads the current solution pool as a JSON file
 */
export function downloadSolutionPoolAsJSON(pipelineId: string) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline || pipeline.id !== pipelineId) {
        alert('Pipeline not found.');
        return;
    }

    if (!pipeline.structuredSolutionPool || pipeline.structuredSolutionPool.trim() === '') {
        alert('No solution pool content available yet. The pool is still initializing.');
        return;
    }

    const content = pipeline.structuredSolutionPool;
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solution_pool.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Clears solution pool versions for a given pipeline
 */
export function clearSolutionPoolVersions(pipelineId: string) {
    const sessionId = `solution-pool-${pipelineId}`;
    solutionPoolVersions.delete(sessionId);
}

/**
 * Gets solution pool versions for export
 */
export function getSolutionPoolVersionsForExport(pipelineId: string): Array<{ content: string; title: string; timestamp: number }> | null {
    const sessionId = `solution-pool-${pipelineId}`;
    const versions = solutionPoolVersions.get(sessionId);
    return versions && versions.length > 0 ? [...versions] : null;
}

/**
 * Restores solution pool versions from import
 */
export function restoreSolutionPoolVersions(pipelineId: string, versions: Array<{ content: string; title: string; timestamp: number }>) {
    if (!pipelineId || !versions || versions.length === 0) return;
    const sessionId = `solution-pool-${pipelineId}`;
    solutionPoolVersions.set(sessionId, [...versions]);
}

/**
 * Renders the Solution Pool component content (iteration grid with strategy cards)
 */
export function renderSolutionPoolContent(deepthinkProcess: DeepthinkPipelineState): string {
    let html = '<div class="solution-pool-container">';

    // Header with evolution and current pool buttons
    html += `
        <div class="solution-pool-header">
            <div class="solution-pool-header-left">
                <span class="material-symbols-outlined solution-pool-icon">workspaces</span>
                <div class="solution-pool-title-group">
                    <h3 class="solution-pool-title">Structured Solution Pool</h3>
                    <p class="solution-pool-subtitle">Cross-strategy collaborative solution repository</p>
                </div>
            </div>
            <div class="solution-pool-header-buttons">
                <button class="solution-pool-current-button" data-pipeline-id="${deepthinkProcess.id}">
                    <span class="material-symbols-outlined">database</span>
                    Current Pool
                </button>
                <button class="solution-pool-download-button" data-pipeline-id="${deepthinkProcess.id}">
                    <span class="material-symbols-outlined">download</span>
                    Download Pool (JSON)
                </button>
                <button class="solution-pool-evolution-button" data-pipeline-id="${deepthinkProcess.id}">
                    <span class="material-symbols-outlined">timeline</span>
                    View Evolution
                </button>
            </div>
        </div>
    `;

    // If the feature is disabled, show disabled state
    if (!deepthinkProcess.structuredSolutionPoolEnabled) {
        html += `
            <div class="solution-pool-disabled-state">
                <span class="material-symbols-outlined disabled-icon">block</span>
                <h4>Structured Solution Pool Disabled</h4>
                <p>This feature is currently disabled for this session.</p>
                <p class="disabled-hint">Enable "Iterative Corrections" in settings to use this feature.</p>
            </div>
        `;
        html += '</div>';
        return html;
    }

    // If no pool content yet (still processing originals), show empty state
    if (!deepthinkProcess.structuredSolutionPool || deepthinkProcess.structuredSolutionPool.trim() === '') {
        html += `
            <div class="solution-pool-empty-state">
                <span class="material-symbols-outlined empty-icon">pending</span>
                <h4>Pool Initializing</h4>
                <p>Waiting for initial solutions to be generated...</p>
            </div>
        `;
        html += '</div>';
        return html;
    }

    // Get pool agents directly from process
    const poolAgents = deepthinkProcess.structuredSolutionPoolAgents || [];

    // Get surviving strategies
    const survivingStrategies = deepthinkProcess.initialStrategies.filter(s => !s.isKilledByRedTeam);

    // Content wrapper for consistent paddings/scroll behavior
    html += `<div class="solution-pool-content-wrapper">`;

    // Render 3 iteration rows based on pool agent status
    for (let iteration = 1; iteration <= 3; iteration++) {
        html += `
            <div class="pool-iteration-container">
                <div class="pool-iteration-header">
                    <h4 class="pool-iteration-title">Iteration ${iteration}</h4>
                </div>
                <div class="pool-iteration-content">
                    <div class="red-team-agents-grid">
        `;

        survivingStrategies.forEach((strategy) => {
            // Find the pool agent for this strategy
            const poolAgent = poolAgents.find(a => a.mainStrategyId === strategy.id);
            const hasPoolResponse = poolAgent && poolAgent.poolResponse && poolAgent.poolResponse.trim() !== '';
            const isError = poolAgent && poolAgent.status === 'error';

            // Count how many critiques have been completed for this strategy
            const critiquesForThisStrategy = deepthinkProcess.solutionCritiques.filter(
                c => c.mainStrategyId === strategy.id
            ).length;

            let hasPool = false;
            if (iteration <= critiquesForThisStrategy && hasPoolResponse) {
                hasPool = true;
            }

            // Show solution count badge if parsed data is available
            const solutionCount = poolAgent?.parsedPoolResponse?.solutions?.length;
            const countBadge = hasPool && solutionCount
                ? `<span class="sp-count-badge">${solutionCount} solutions</span>`
                : '';

            html += `
                <div class="red-team-agent-card ${!hasPool ? 'pool-pending' : ''}">
                    <div class="red-team-agent-header">
                        <h4 class="red-team-agent-title">${strategy.id.toUpperCase()}</h4>
                        ${hasPool ? '<span class="status-badge status-completed">Available</span>' :
                    isError ? '<span class="status-badge status-error">Error</span>' :
                        '<span class="status-badge status-pending">Pending</span>'}
                    </div>
                    <div class="red-team-results">
                        ${hasPool ? `
                            ${countBadge}
                            <button class="view-argument-button view-pool-button" data-strategy-id="${strategy.id}" data-iteration="${iteration}">
                                <span class="material-symbols-outlined">visibility</span>
                                View Solution Pool
                            </button>
                        ` : `
                            <div class="pool-empty-state-mini">
                                <span class="material-symbols-outlined">hourglass_empty</span>
                                <span>${isError ? 'Failed' : 'Processing...'}</span>
                            </div>
                        `}
                    </div>
                </div>
            `;
        });

        html += `
                    </div>
                </div>
            </div>
        `;
    }

    html += `</div>`; // Close solution-pool-content-wrapper

    html += '</div>'; // Close solution-pool-container
    return html;
}
