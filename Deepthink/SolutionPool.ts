/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SolutionPool — Pure data/version management logic.
 * No DOM manipulation. React components live in SolutionPool.tsx.
 */

import { openEvolutionViewerFromHistory } from '../Styles/Components/DiffModal/EvolutionViewer';
import {
    DeepthinkPipelineState,
    getActiveDeepthinkPipeline,
    SolutionPoolParsedSolution,
    SolutionPoolParsedResponse,
} from './DeepthinkCore';

// Re-export types consumed by the TSX layer
export type { SolutionPoolParsedSolution, SolutionPoolParsedResponse };

// ═══════════════════════════════════════════════════════════════════════
// Version History Store
// ═══════════════════════════════════════════════════════════════════════

export interface SolutionPoolVersion {
    content: string;
    title: string;
    timestamp: number;
}

const solutionPoolVersions = new Map<string, SolutionPoolVersion[]>();

function sessionKey(pipelineId: string): string {
    return `solution-pool-${pipelineId}`;
}

/** Appends a new snapshot of the solution pool for a given pipeline. */
export function addSolutionPoolVersion(pipelineId: string, poolContent: string, iterationNumber: number): void {
    if (!pipelineId || !poolContent) return;

    const key = sessionKey(pipelineId);
    let versions = solutionPoolVersions.get(key);
    if (!versions) {
        versions = [];
        solutionPoolVersions.set(key, versions);
    }
    versions.push({ content: poolContent, title: `Iteration ${iterationNumber}`, timestamp: Date.now() });
}

/** Clears stored versions for a pipeline. */
export function clearSolutionPoolVersions(pipelineId: string): void {
    solutionPoolVersions.delete(sessionKey(pipelineId));
}

/** Returns a defensive copy of the version history, or null if empty. */
export function getSolutionPoolVersionsForExport(pipelineId: string): SolutionPoolVersion[] | null {
    const versions = solutionPoolVersions.get(sessionKey(pipelineId));
    return versions && versions.length > 0 ? [...versions] : null;
}

/** Restores version history from a previously exported array. */
export function restoreSolutionPoolVersions(pipelineId: string, versions: SolutionPoolVersion[]): void {
    if (!pipelineId || !versions?.length) return;
    solutionPoolVersions.set(sessionKey(pipelineId), [...versions]);
}

/** Returns the raw version array reference for read-only consumption by the UI layer. */
export function getSolutionPoolVersions(pipelineId: string): SolutionPoolVersion[] | undefined {
    return solutionPoolVersions.get(sessionKey(pipelineId));
}

// ═══════════════════════════════════════════════════════════════════════
// Actions (side-effectful but no DOM rendering)
// ═══════════════════════════════════════════════════════════════════════

/** Opens the diff evolution viewer for a pipeline's solution pool history. */
export function openSolutionPoolEvolution(pipelineId: string): void {
    const key = sessionKey(pipelineId);
    const versions = solutionPoolVersions.get(key);

    if (!versions || versions.length === 0) {
        alert('No solution pool history available yet. The pool needs at least one update to view evolution.');
        return;
    }
    openEvolutionViewerFromHistory(versions, key);
}

/** Downloads the current pool as a JSON file. */
export function downloadSolutionPoolAsJSON(pipelineId: string): void {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline || pipeline.id !== pipelineId) {
        alert('Pipeline not found.');
        return;
    }
    if (!pipeline.structuredSolutionPool?.trim()) {
        alert('No solution pool content available yet. The pool is still initializing.');
        return;
    }

    const blob = new Blob([pipeline.structuredSolutionPool], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solution_pool.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════
// Data Extraction Helpers (consumed by React components)
// ═══════════════════════════════════════════════════════════════════════

export interface AtomicEntry {
    title: string;
    reconstruction: string;
    confidence: number;
}

export interface AtomicGroup {
    iterationTitle: string;
    atomics: AtomicEntry[];
}

/** Computes the iteration count for the solution pool tab grid. */
export function computeIterationCount(process: DeepthinkPipelineState): number {
    const surviving = process.initialStrategies.filter(s => !s.isKilledByRedTeam);
    const maxCritiques = surviving.reduce((max, strategy) => {
        const count = process.solutionCritiques.filter(c => c.mainStrategyId === strategy.id).length;
        return Math.max(max, count);
    }, 0);
    return Math.max(maxCritiques, 1);
}

/**
 * Extracts atomic reconstruction groups for the full repository view
 * of a given strategy within a pipeline.
 */
export function extractAtomicGroups(
    pipelineId: string,
    strategyId: string,
    parsedPool: SolutionPoolParsedResponse | null
): AtomicGroup[] {
    const versions = getSolutionPoolVersions(pipelineId);
    const groups: AtomicGroup[] = [];

    if (versions && versions.length > 1) {
        // Use historical versions (all whole-integer iterations except the latest)
        const wholeIterVersions = versions.filter(v => {
            const match = v.title.match(/Iteration\s+([\d.]+)/);
            if (!match) return false;
            const num = parseFloat(match[1]);
            return num >= 1 && Number.isInteger(num);
        });
        const pastVersions = wholeIterVersions.slice(0, Math.max(0, wholeIterVersions.length - 1));

        pastVersions.forEach((version, vIdx) => {
            try {
                const versionData = JSON.parse(version.content);
                const strat = versionData.strategies?.find((s: any) => s.strategy_id === strategyId);
                if (strat?.solution_pool?.solutions) {
                    const atomics = strat.solution_pool.solutions
                        .filter((s: any) => s.atomic_reconstruction)
                        .map((s: any, idx: number) => ({
                            title: s.title || `Solution ${idx + 1}`,
                            reconstruction: s.atomic_reconstruction,
                            confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
                        }));
                    if (atomics.length > 0) {
                        groups.push({ iterationTitle: version.title || `Pool ${vIdx + 1}`, atomics });
                    }
                }
            } catch { /* skip unparseable versions */ }
        });
    } else if (parsedPool?.solutions) {
        const atomics = parsedPool.solutions
            .filter(s => s.atomic_reconstruction)
            .map((s, idx) => ({
                title: s.title || `Solution ${idx + 1}`,
                reconstruction: s.atomic_reconstruction!,
                confidence: s.confidence,
            }));
        if (atomics.length > 0) {
            groups.push({ iterationTitle: 'Latest Pool', atomics });
        }
    }

    return groups;
}
