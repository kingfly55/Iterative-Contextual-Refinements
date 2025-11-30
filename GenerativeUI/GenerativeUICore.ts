/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// TypeScript Interfaces for GenerativeUI mode
export interface StructuredRepresentation {
    interactionFlows: {
        nodes: Array<{ id: string; description: string }>;
        edges: Array<{ from: string; to: string; trigger: string }>;
    };
    finiteStateMachines: Array<{
        componentId: string;
        states: string[];
        initialState: string;
        events: string[];
        transitions: Array<{ from: string; to: string; event: string }>;
    }>;
}

export interface RewardMetric {
    name: string;
    description: string;
    criteria: string[];
    weight: number;
}

export interface RewardFunction {
    metrics: RewardMetric[];
}

export interface MetricScore {
    name: string;
    score: number;
    justification: string;
}

export interface EvaluationResult {
    metricScores: MetricScore[];
    finalScore: number;
}

export interface IterationState {
    iteration: number;
    code: string;
    evaluation?: EvaluationResult;
}

export type GenerativeUIViewState = 'form' | 'loading' | 'ui';

// Interactive mode interfaces
export interface ApplicationState {
    formData: Record<string, any>; // All form input values
    displayedContent: string[]; // Visible text content
    interactiveElements: InteractiveElement[]; // All clickable elements
    userJourneyText: string; // Natural language summary
}

export interface InteractiveElement {
    tag: string;
    text: string;
    id?: string;
    classes: string[];
    href?: string;
    type?: string;
}

export interface CapturedInteraction {
    type: 'click' | 'input' | 'submit' | 'hover' | 'focus' | 'change';
    timestamp: number;
    element: {
        tag: string;
        id?: string;
        classes?: string[];
        text: string;
        value?: any;
        attributes?: Record<string, string>;
    };
    position?: { x: number; y: number };
    extractedState?: ApplicationState;
    screenSnapshot?: string; // HTML of current screen
}

export interface ScreenHistoryItem {
    screenHtml: string;
    spec: string;
    interaction?: CapturedInteraction;
    timestamp: number;
    designSystem?: DesignSystem;
}

export interface DesignSystem {
    colorPalette: string[];
    typography: { fonts: string[], sizes: string[] };
    spacing: string;
    borderRadius: string;
    componentPatterns: string[];
}

export interface GenerativeUIState {
    id: string;
    userQuery: string;
    status: 'idle' | 'processing' | 'completed' | 'error' | 'stopped';
    currentStatus?: string;
    activeTab: 'preview' | 'background';
    enableIterativeRefinements: boolean; // Toggle for iterative refinements
    requirementSpec: string | null;
    structuredRep: StructuredRepresentation | null;
    rewardFunction: RewardFunction | null;
    iterations: IterationState[];
    finalCode: string | null;
    error?: string | null;

    // Interactive mode fields
    interactionHistory: CapturedInteraction[]; // All interactions
    screenHistory: ScreenHistoryItem[]; // All screens generated
    currentScreenIndex: number; // Current position in history
    designSystem: DesignSystem | null; // Extracted from first screen
    isInteractiveMode: boolean; // Whether interactive mode is active
    isProcessingInteraction: boolean; // Concurrency control flag
    interactionQueue: CapturedInteraction[]; // Queue for pending interactions
    lastInteractionTimestamp: number; // For debouncing
    interactionSummary?: string; // Compressed old interactions for token management
    maxHistorySize: number; // Maximum interactions to keep in full detail
}
