/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DeepthinkSession — Session save/load for Deepthink pipelines.
 *
 * Persists the full pipeline state + configuration snapshot so that:
 *   1. Users can download/upload session files (.deepthink.json)
 *   2. State auto-saves to localStorage on each render tick
 *   3. A future resume implementation can restore and continue a pipeline
 *
 * Resume assumptions baked into the format:
 *   - Each agent/sub-strategy has a `status` field. Resume skips `completed` items
 *     and re-runs items with `error`, `pending`, or `processing` status.
 *   - `pipelineConfig` captures the exact settings used so resume can reconstruct
 *     the `deps` object without relying on current UI slider positions.
 *   - `customPrompts` are saved verbatim so the same prompt templates are used on
 *     resume, even if the user has since edited them.
 *   - `solutionPoolVersions` are included so the diff-evolution viewer works after
 *     a load.
 *   - `challengeImageBase64` is included so image-based prompts can be re-sent on
 *     resume. This can make session files large — a future optimisation could store
 *     images separately or compress them.
 *   - The `phaseProgress` block records which high-level phases completed, so resume
 *     logic can skip entire tracks (A/B) rather than re-walking the tree.
 */

import {
    DeepthinkPipelineState,
    getActiveDeepthinkPipeline,
    setActiveDeepthinkPipelineForImport,
} from './DeepthinkCore';
import {
    getSolutionPoolVersionsForExport,
    restoreSolutionPoolVersions,
    SolutionPoolVersion,
} from './SolutionPool';
import { CustomizablePromptsDeepthink } from './DeepthinkPrompts';

// ═══════════════════════════════════════════════════════════════════════
// Session File Format
// ═══════════════════════════════════════════════════════════════════════

export interface DeepthinkPipelineConfig {
    model: string;
    temperature: number;
    topP: number;
    strategiesCount: number;
    subStrategiesCount: number;
    hypothesisCount: number;
    redTeamAggressiveness: string;
    refinementEnabled: boolean;
    skipSubStrategies: boolean;
    dissectedObservationsEnabled: boolean;
    iterativeCorrectionsEnabled: boolean;
    iterativeDepth: number;
    provideAllSolutionsToCorrectors: boolean;
    postQualityFilterEnabled: boolean;
    codeExecutionEnabled: boolean;
    modelProvider: string;
}

export interface DeepthinkPhaseProgress {
    /** Track A: strategy generation → sub-strategies → red team → solutions → critiques → self-improvement */
    strategicSolverComplete: boolean;
    /** Track B: hypothesis generation → hypothesis testing → knowledge packet assembly */
    hypothesisExplorerComplete: boolean;
    /** Red team ran (or was disabled) */
    redTeamComplete: boolean;
    /** Final judge produced a verdict */
    finalJudgingComplete: boolean;
    /** Post-quality-filter loop completed (or was disabled) */
    postQualityFilterComplete: boolean;
    /** Structured solution pool completed (or was disabled) */
    structuredSolutionPoolComplete: boolean;
}

export interface DeepthinkSessionFile {
    /** Format version — bump when breaking changes are made */
    version: 1;
    /** ISO 8601 timestamp of when this session was saved */
    savedAt: string;
    /** Human-readable label (defaults to first 80 chars of challenge text) */
    label: string;
    /** The full pipeline state tree */
    pipeline: DeepthinkPipelineState;
    /** Snapshot of configuration values at pipeline start time */
    pipelineConfig: DeepthinkPipelineConfig;
    /** Custom prompts (system + user) used by this pipeline */
    customPrompts: CustomizablePromptsDeepthink;
    /** Solution pool version history (for diff viewer) */
    solutionPoolVersions: SolutionPoolVersion[] | null;
    /** High-level phase completion flags for resume logic */
    phaseProgress: DeepthinkPhaseProgress;
}

// ═══════════════════════════════════════════════════════════════════════
// Module State
// ═══════════════════════════════════════════════════════════════════════

const LOCALSTORAGE_KEY = 'deepthink-session-autosave';

/** Captured once when the pipeline starts so auto-save can use them */
let capturedConfig: DeepthinkPipelineConfig | null = null;
let capturedPrompts: CustomizablePromptsDeepthink | null = null;

// ═══════════════════════════════════════════════════════════════════════
// Config Capture — called at pipeline start
// ═══════════════════════════════════════════════════════════════════════

export function captureSessionConfig(config: DeepthinkPipelineConfig, prompts: CustomizablePromptsDeepthink): void {
    capturedConfig = { ...config };
    capturedPrompts = { ...prompts };
}

// ═══════════════════════════════════════════════════════════════════════
// Serialization
// ═══════════════════════════════════════════════════════════════════════

function buildPhaseProgress(pipeline: DeepthinkPipelineState): DeepthinkPhaseProgress {
    return {
        strategicSolverComplete: !!pipeline.strategicSolverComplete,
        hypothesisExplorerComplete: !!pipeline.hypothesisExplorerComplete,
        redTeamComplete: !!pipeline.redTeamComplete,
        finalJudgingComplete: pipeline.finalJudgingStatus === 'completed',
        postQualityFilterComplete: pipeline.postQualityFilterStatus === 'completed' || !pipeline.postQualityFilterAgents?.length,
        structuredSolutionPoolComplete: pipeline.structuredSolutionPoolStatus === 'completed' || !pipeline.structuredSolutionPoolEnabled,
    };
}

export function buildSessionFile(
    pipeline: DeepthinkPipelineState,
    config: DeepthinkPipelineConfig,
    prompts: CustomizablePromptsDeepthink,
): DeepthinkSessionFile {
    return {
        version: 1,
        savedAt: new Date().toISOString(),
        label: pipeline.challengeText.substring(0, 80),
        pipeline: structuredClone(pipeline),
        pipelineConfig: { ...config },
        customPrompts: { ...prompts },
        solutionPoolVersions: getSolutionPoolVersionsForExport(pipeline.id),
        phaseProgress: buildPhaseProgress(pipeline),
    };
}

// ═══════════════════════════════════════════════════════════════════════
// Auto-save to localStorage
// ═══════════════════════════════════════════════════════════════════════

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced auto-save. Called from the render() callback in DeepthinkCore.
 * Debounces at 2s to avoid hammering localStorage on rapid re-renders.
 */
export function scheduleAutoSave(): void {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        saveToLocalStorage();
    }, 2000);
}

let autoSaveFailCount = 0;

function saveToLocalStorage(): void {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline || !capturedConfig || !capturedPrompts) return;
    // Stop retrying after 3 consecutive failures (quota exceeded)
    if (autoSaveFailCount >= 3) return;

    try {
        const session = buildSessionFile(pipeline, capturedConfig, capturedPrompts);
        // Strip the large structuredSolutionPool to fit in localStorage (~5MB limit)
        // The full pool is preserved in file saves
        if (session.pipeline.structuredSolutionPool && session.pipeline.structuredSolutionPool.length > 100000) {
            session.pipeline.structuredSolutionPool = '[auto-save: truncated — use file save for full data]';
        }
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(session));
        autoSaveFailCount = 0;
    } catch (e) {
        autoSaveFailCount++;
        if (autoSaveFailCount === 1) {
            console.warn('[DeepthinkSession] Auto-save to localStorage failed (will suppress further warnings). Use file save instead.');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Save to file (download)
// ═══════════════════════════════════════════════════════════════════════

export function saveSessionToFile(): void {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) {
        alert('No active Deepthink session to save.');
        return;
    }
    if (!capturedConfig || !capturedPrompts) {
        alert('Session config was not captured. Cannot save.');
        return;
    }

    const session = buildSessionFile(pipeline, capturedConfig, capturedPrompts);
    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const statusTag = pipeline.status === 'completed' ? 'complete' : pipeline.status;
    const filename = `deepthink-session-${ts}-${statusTag}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════
// Immediate / Programmatic Save Helpers
// (used by QuotaBackoffManager's onSaveSession callback)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Flush any pending debounced auto-save and write to localStorage immediately.
 * Safe to call even when no pipeline is active (silently no-ops).
 */
export function saveToLocalStorageImmediate(): void {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    saveToLocalStorage();
}

/**
 * Programmatic session-file download — triggered by the quota backoff manager.
 *
 * 1. Persists to localStorage first (primary, reliable).
 * 2. Builds the full session file and triggers a browser download (secondary, best-effort).
 * 3. Delays `URL.revokeObjectURL` by 5 seconds so the download has time to start.
 *
 * @param filename - The desired download filename (e.g. `deepthink-quota-save-2026-03-22T12-00-00.json`)
 */
export function saveSessionToFileAutomatic(filename: string): void {
    // Primary: flush to localStorage immediately
    saveToLocalStorageImmediate();

    // Secondary: build session file and trigger download
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline || !capturedConfig || !capturedPrompts) return;

    const session = buildSessionFile(pipeline, capturedConfig, capturedPrompts);
    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Delay revocation so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ═══════════════════════════════════════════════════════════════════════
// Load from file
// ═══════════════════════════════════════════════════════════════════════

export function loadSessionFromFile(): Promise<DeepthinkSessionFile | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) { resolve(null); return; }
            try {
                const text = await file.text();
                const session = parseSessionFile(text);
                resolve(session);
            } catch (e: any) {
                alert(`Failed to load session file: ${e.message}`);
                resolve(null);
            }
        };
        input.click();
    });
}

// ═══════════════════════════════════════════════════════════════════════
// Load from localStorage
// ═══════════════════════════════════════════════════════════════════════

export function loadSessionFromLocalStorage(): DeepthinkSessionFile | null {
    try {
        const raw = localStorage.getItem(LOCALSTORAGE_KEY);
        if (!raw) return null;
        return parseSessionFile(raw);
    } catch (e) {
        console.warn('[DeepthinkSession] Failed to load auto-saved session:', e);
        return null;
    }
}

export function clearAutoSave(): void {
    localStorage.removeItem(LOCALSTORAGE_KEY);
}

// ═══════════════════════════════════════════════════════════════════════
// Parsing & Validation
// ═══════════════════════════════════════════════════════════════════════

function parseSessionFile(raw: string): DeepthinkSessionFile {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid session file: not a JSON object');
    }
    if (parsed.version !== 1) {
        throw new Error(`Unsupported session file version: ${parsed.version}`);
    }
    if (!parsed.pipeline || !parsed.pipeline.id) {
        throw new Error('Invalid session file: missing pipeline state');
    }
    if (!parsed.pipelineConfig) {
        console.warn('[DeepthinkSession] Session file has no pipelineConfig — resume will use current UI settings');
    }
    if (!parsed.customPrompts) {
        console.warn('[DeepthinkSession] Session file has no customPrompts — resume will use current prompts');
    }

    return parsed as DeepthinkSessionFile;
}

// ═══════════════════════════════════════════════════════════════════════
// Restore — applies a loaded session to the running app
// ═══════════════════════════════════════════════════════════════════════

export function restoreSession(
    session: DeepthinkSessionFile,
    renderFn: () => void,
): void {
    // Restore pipeline state
    setActiveDeepthinkPipelineForImport(session.pipeline);

    // Restore solution pool version history
    if (session.solutionPoolVersions?.length) {
        restoreSolutionPoolVersions(session.pipeline.id, session.solutionPoolVersions);
    }

    // Capture the saved config/prompts so auto-save continues from the loaded state
    capturedConfig = { ...session.pipelineConfig };
    capturedPrompts = { ...session.customPrompts };

    // Re-render
    renderFn();
}
