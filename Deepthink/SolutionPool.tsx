import { openEvolutionViewerFromHistory } from '../Components/DiffModal/EvolutionViewer';
import { DeepthinkPipelineState, getActiveDeepthinkPipeline } from './DeepthinkCore';
import { openEmbeddedModal } from '../Components/EmbeddedModal';
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

/**
 * Opens the current full solution pool in an embedded modal
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

    // Open the current pool content in an embedded modal
    openEmbeddedModal(
        'Current Solution Pool',
        pipeline.structuredSolutionPool
    );
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
 * Renders the Solution Pool component content
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
            // Each iteration generates one critique, so critique count = iterations completed
            const critiquesForThisStrategy = deepthinkProcess.solutionCritiques.filter(
                c => c.mainStrategyId === strategy.id
            ).length;

            // Pool for iteration N is available only if:
            // - At least N critiques have been completed (means pool N can run)
            // - Pool agent has a response (means it has run at least once)
            let hasPool = false;
            if (iteration <= critiquesForThisStrategy && hasPoolResponse) {
                hasPool = true;
            }

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


/**
 * Opens solution pool modal for a specific strategy and iteration
 */
export function openSolutionPoolModal(strategyId: string, iteration: number) {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;

    // Find the pool agent for this strategy
    const poolAgent = pipeline.structuredSolutionPoolAgents?.find(a => a.mainStrategyId === strategyId);
    if (!poolAgent || !poolAgent.poolResponse) {
        alert('No solution pool available for this strategy.');
        return;
    }

    const title = `${strategyId.toUpperCase()} — Iteration ${iteration} • Solution Pool`;
    openEmbeddedModal(title, poolAgent.poolResponse);
}

