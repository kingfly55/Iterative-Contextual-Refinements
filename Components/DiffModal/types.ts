export type DiffContentType = 'html' | 'text';
export type DiffViewMode = 'split' | 'unified';

export interface DiffSourceData {
    pipelineId: number;
    iterationNumber: number;
    contentType: DiffContentType;
    content: string;
    title: string;
}

export interface Iteration {
    iterationNumber: number;
    title: string;
    generatedContent: string;
    contentBeforeBugFix?: string | null;
    generatedOrRevisedText?: string;
    generatedMainContent?: string;
}

export interface Pipeline {
    id: number;
    iterations: Iteration[];
}

export interface ContentState {
    content: string;
    title: string;
    iterationNumber: number;
    isBugFix: boolean;
}

export interface SequentialState {
    contentStates: Array<{ title: string; content: string }>;
    currentIteration: number;
    isPlaying: boolean;
    speed: number; // ms per line
    animationFrame: number | null;
    currentLineIndex: number; // Track current position for pause/resume
    viewMode: DiffViewMode;
}

export interface EvolutionViewerState {
    scrollContainer: HTMLElement;
    lastCount: number;
}
