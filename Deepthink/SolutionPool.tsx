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

    // Atomic reconstruction — collapsible
    if (solution.atomic_reconstruction) {
        const atomicToggle = document.createElement('button');
        atomicToggle.className = 'sp-critique-toggle sp-atomic-toggle';
        atomicToggle.innerHTML = `
            <span class="material-symbols-outlined">fingerprint</span>
            Atomic Reconstruction
            <span class="material-symbols-outlined sp-critique-chevron">expand_more</span>
        `;

        const atomicBody = document.createElement('div');
        atomicBody.className = 'sp-critique-body sp-atomic-body sp-collapsed';
        atomicBody.innerHTML = renderMathContent(solution.atomic_reconstruction);

        atomicToggle.addEventListener('click', () => {
            const isCollapsed = atomicBody.classList.contains('sp-collapsed');
            atomicBody.classList.toggle('sp-collapsed');
            const chevron = atomicToggle.querySelector('.sp-critique-chevron');
            if (chevron) {
                chevron.textContent = isCollapsed ? 'expand_less' : 'expand_more';
            }
        });

        card.appendChild(atomicToggle);
        card.appendChild(atomicBody);
    }

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

                // 1. Original executed solution
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

                // 2. First critique (from the earliest iteration)
                const firstCritique = strategy.iterations?.[0]?.critique;
                if (firstCritique) {
                    const critiqueLabel = document.createElement('div');
                    critiqueLabel.className = 'sp-pool-label sp-critique-label';
                    critiqueLabel.innerHTML = '<span class="material-symbols-outlined">rate_review</span> Initial Critique';
                    section.appendChild(critiqueLabel);

                    const critiqueContent = document.createElement('div');
                    critiqueContent.className = 'sp-timeline-section sp-timeline-critique';
                    const critiqueBody = document.createElement('div');
                    critiqueBody.className = 'sp-timeline-section-content';
                    critiqueBody.innerHTML = renderMathContent(firstCritique);
                    critiqueContent.appendChild(critiqueBody);
                    section.appendChild(critiqueContent);
                }

                // 3. Atomic Reconstructions grouped by iteration/pool
                const parsedPool: SolutionPoolParsedResponse | null =
                    strategy.solution_pool && typeof strategy.solution_pool === 'object' && strategy.solution_pool.solutions
                        ? strategy.solution_pool
                        : null;

                // Collect atomics from pool version history (grouped by iteration)
                const sessionId = `solution-pool-${pipelineId}`;
                const allVersions = solutionPoolVersions.get(sessionId);

                type AtomicGroup = {
                    iterationTitle: string;
                    atomics: Array<{ title: string; reconstruction: string; confidence: number }>;
                };
                const iterationGroups: AtomicGroup[] = [];

                if (allVersions && allVersions.length > 1) {
                    // Filter to only whole-number iterations (skip "Iteration 0", "Iteration 1.5", etc.)
                    const wholeIterVersions = allVersions.filter(v => {
                        const match = v.title.match(/Iteration\s+([\d.]+)/);
                        if (!match) return false;
                        const num = parseFloat(match[1]);
                        return num >= 1 && Number.isInteger(num);
                    });

                    // Exclude the last whole iteration — it's the current pool shown below
                    const pastVersions = wholeIterVersions.slice(0, Math.max(0, wholeIterVersions.length - 1));

                    pastVersions.forEach((version, vIdx) => {
                        try {
                            const versionData = JSON.parse(version.content);
                            const strat = versionData.strategies?.find(
                                (s: any) => s.strategy_id === strategy.strategy_id
                            );
                            if (strat?.solution_pool?.solutions) {
                                const atomics = strat.solution_pool.solutions
                                    .filter((s: any) => s.atomic_reconstruction)
                                    .map((s: any, idx: number) => ({
                                        title: s.title || `Solution ${idx + 1}`,
                                        reconstruction: s.atomic_reconstruction,
                                        confidence: typeof s.confidence === 'number' ? s.confidence : 0.5
                                    }));
                                if (atomics.length > 0) {
                                    iterationGroups.push({
                                        iterationTitle: version.title || `Pool ${vIdx + 1}`,
                                        atomics
                                    });
                                }
                            }
                        } catch { /* skip unparseable versions */ }
                    });
                } else if (parsedPool && Array.isArray(parsedPool.solutions)) {
                    // Fallback: only latest pool available
                    const atomics = parsedPool.solutions
                        .filter((s: SolutionPoolParsedSolution) => s.atomic_reconstruction)
                        .map((s: SolutionPoolParsedSolution, idx: number) => ({
                            title: s.title || `Solution ${idx + 1}`,
                            reconstruction: s.atomic_reconstruction!,
                            confidence: s.confidence
                        }));
                    if (atomics.length > 0) {
                        iterationGroups.push({ iterationTitle: 'Latest Pool', atomics });
                    }
                }

                if (iterationGroups.length > 0) {
                    const atomicLabel = document.createElement('div');
                    atomicLabel.className = 'sp-pool-label sp-atomic-label';
                    atomicLabel.innerHTML = '<span class="material-symbols-outlined">fingerprint</span> Atomic Reconstructions';
                    section.appendChild(atomicLabel);

                    const atomicList = document.createElement('div');
                    atomicList.className = 'sp-atomic-list';

                    iterationGroups.forEach((group: AtomicGroup) => {
                        const groupEl = document.createElement('div');
                        groupEl.className = 'sp-atomic-iteration-group';

                        const groupTitle = document.createElement('div');
                        groupTitle.className = 'sp-atomic-iteration-title';
                        groupTitle.textContent = group.iterationTitle;
                        groupEl.appendChild(groupTitle);

                        group.atomics.forEach((item) => {
                            const entry = document.createElement('div');
                            entry.className = 'sp-atomic-entry';

                            const entryHeader = document.createElement('div');
                            entryHeader.className = 'sp-atomic-entry-header';

                            const entryTitle = document.createElement('span');
                            entryTitle.className = 'sp-atomic-entry-title';
                            entryTitle.textContent = item.title;

                            const entryConf = document.createElement('span');
                            entryConf.className = `sp-confidence-badge ${item.confidence >= 0.7 ? 'high' : item.confidence >= 0.4 ? 'medium' : 'low'}`;
                            entryConf.textContent = `${(item.confidence * 100).toFixed(0)}%`;

                            entryHeader.appendChild(entryTitle);
                            entryHeader.appendChild(entryConf);

                            const entryText = document.createElement('div');
                            entryText.className = 'sp-atomic-entry-text';
                            entryText.innerHTML = renderMathContent(item.reconstruction);

                            entry.appendChild(entryHeader);
                            entry.appendChild(entryText);
                            groupEl.appendChild(entry);
                        });

                        atomicList.appendChild(groupEl);
                    });

                    section.appendChild(atomicList);
                }

                // 4. Compressed iterations banner
                if (strategy.compressed_iterations_note) {
                    const compressedBanner = document.createElement('div');
                    compressedBanner.className = 'sp-compressed-banner';
                    compressedBanner.innerHTML = `
                        <span class="material-symbols-outlined">compress</span>
                        <span>${strategy.compressed_iterations_note}</span>
                    `;
                    section.appendChild(compressedBanner);
                }

                // 5. Latest correction (from the last iteration)
                const lastIteration = strategy.iterations?.[strategy.iterations.length - 1];
                if (lastIteration?.corrected_solution) {
                    const corrLabel = document.createElement('div');
                    corrLabel.className = 'sp-pool-label sp-corrected-label';
                    corrLabel.innerHTML = '<span class="material-symbols-outlined">auto_fix_high</span> Latest Correction';
                    section.appendChild(corrLabel);

                    const corrContent = document.createElement('div');
                    corrContent.className = 'sp-timeline-section sp-timeline-corrected';
                    const corrBody = document.createElement('div');
                    corrBody.className = 'sp-timeline-section-content';
                    corrBody.innerHTML = renderMathContent(lastIteration.corrected_solution);
                    corrContent.appendChild(corrBody);
                    section.appendChild(corrContent);
                }

                // 6. Latest critique
                const latestCritique = strategy.latest_critique || lastIteration?.critique;
                if (latestCritique && latestCritique !== firstCritique) {
                    const lcLabel = document.createElement('div');
                    lcLabel.className = 'sp-pool-label sp-critique-label';
                    lcLabel.innerHTML = '<span class="material-symbols-outlined">rate_review</span> Latest Critique';
                    section.appendChild(lcLabel);

                    const lcContent = document.createElement('div');
                    lcContent.className = 'sp-timeline-section sp-timeline-critique';
                    const lcBody = document.createElement('div');
                    lcBody.className = 'sp-timeline-section-content';
                    lcBody.innerHTML = renderMathContent(latestCritique);
                    lcContent.appendChild(lcBody);
                    section.appendChild(lcContent);
                }

                // 7. Full Solution Pool (card grid)
                if (parsedPool && Array.isArray(parsedPool.solutions)) {
                    const poolLabel = document.createElement('div');
                    poolLabel.className = 'sp-pool-label';
                    poolLabel.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> Solution Pool';
                    section.appendChild(poolLabel);

                    const grid = document.createElement('div');
                    grid.className = 'sp-cards-grid';

                    parsedPool.solutions.forEach((solution: SolutionPoolParsedSolution, idx: number) => {
                        grid.appendChild(createSolutionCard(solution, idx));
                    });

                    section.appendChild(grid);
                } else if (strategy.solution_pool && typeof strategy.solution_pool === 'string') {
                    section.appendChild(createRawTextFallback(strategy.solution_pool));
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

    // Determine actual iteration count from completed critiques
    const maxIterations = survivingStrategies.reduce((max, strategy) => {
        const critiques = deepthinkProcess.solutionCritiques.filter(
            c => c.mainStrategyId === strategy.id
        ).length;
        return Math.max(max, critiques);
    }, 0);
    const iterationCount = Math.max(maxIterations, 1); // At least show 1 row

    // Render dynamic iteration rows based on pool agent status
    for (let iteration = 1; iteration <= iterationCount; iteration++) {
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
