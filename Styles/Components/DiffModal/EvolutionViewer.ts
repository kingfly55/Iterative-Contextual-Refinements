import * as Diff from 'diff';
import { ContentState, EvolutionViewerState } from './types';

// ─── Active Viewer Registry ───────────────────────────────────────────────────

const activeEvolutionViewers = new Map<string, EvolutionViewerState>();

export function getActiveEvolutionViewer(sessionId: string): EvolutionViewerState | undefined {
    return activeEvolutionViewers.get(sessionId);
}

export function registerEvolutionViewer(sessionId: string, state: EvolutionViewerState): void {
    activeEvolutionViewers.set(sessionId, state);
}

export function unregisterEvolutionViewer(sessionId: string): void {
    activeEvolutionViewers.delete(sessionId);
}

export function hasEvolutionViewerOpen(sessionId: string): boolean {
    return activeEvolutionViewers.has(sessionId);
}

// ─── Content State Builders ───────────────────────────────────────────────────

export interface HistoryEntry {
    content: string;
    title: string;
    timestamp: number;
}

export function buildContentStatesFromPipeline(pipeline: any): ContentState[] {
    const iterations = [...pipeline.iterations].sort((a: any, b: any) => a.iterationNumber - b.iterationNumber);
    const states: ContentState[] = [];

    for (const iteration of iterations) {
        if (!iteration.generatedContent && !iteration.contentBeforeBugFix) continue;

        if (
            iteration.contentBeforeBugFix &&
            iteration.contentBeforeBugFix.trim() !== '' &&
            iteration.contentBeforeBugFix !== iteration.generatedContent
        ) {
            states.push({
                content: iteration.contentBeforeBugFix,
                title: (iteration.title || `Iteration ${iteration.iterationNumber}`) + ' (Pre-Fix)',
                iterationNumber: iteration.iterationNumber,
                isBugFix: false
            });
        }

        const finalContent = iteration.generatedContent || iteration.contentBeforeBugFix || '';
        if (finalContent.trim() !== '') {
            states.push({
                content: finalContent,
                title: iteration.title || `Iteration ${iteration.iterationNumber}`,
                iterationNumber: iteration.iterationNumber,
                isBugFix: !!iteration.contentBeforeBugFix
            });
        }
    }

    return states;
}

export function buildContentStatesFromHistory(history: HistoryEntry[]): ContentState[] {
    return history.map((entry, index) => ({
        content: entry.content,
        title: entry.title,
        iterationNumber: index + 1,
        isBugFix: false
    }));
}

export function buildMockPipelineFromHistory(history: HistoryEntry[]): any {
    return {
        id: Date.now(),
        iterations: history.map((entry, index) => ({
            iterationNumber: index + 1,
            title: entry.title,
            generatedContent: entry.content,
            contentBeforeBugFix: null
        }))
    };
}

// ─── Diff Line Computation ────────────────────────────────────────────────────

export interface DiffLine {
    text: string;
    type: 'added' | 'removed' | 'unchanged';
}

export function computeEvolutionDiff(prevContent: string, currContent: string): DiffLine[] {
    const diffs = Diff.diffLines(prevContent, currContent);
    const lines: DiffLine[] = [];

    for (const part of diffs) {
        const partLines = part.value.split('\n');
        partLines.forEach((line, idx) => {
            // Skip trailing empty line from split
            if (line === '' && idx === partLines.length - 1) return;
            lines.push({
                text: line || ' ',
                type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged'
            });
        });
    }

    return lines;
}

export function splitIntoLines(content: string): string[] {
    return content.split('\n');
}

// Re-export imperative portal API from the React component file
export { openEvolutionViewer, openEvolutionViewerFromHistory, updateEvolutionViewerIfOpen, closeEvolutionViewer } from './EvolutionViewer.tsx';
