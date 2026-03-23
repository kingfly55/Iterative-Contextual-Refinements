# deepthink-quota-backoff-auto-resume

## Summary

When the Claude API quota is exceeded during a multi-hour DeepThink pipeline run, the proxy at `localhost:8317` returns HTTP 429 `model_cooldown` errors. The current retry logic in `makeDeepthinkApiCall()` (exponential backoff, max 4 attempts) exhausts all retries and fails permanently, losing all in-progress work. This plan introduces a quota-aware backoff system that detects consecutive 429 errors, auto-saves pipeline state, pauses execution with a visible countdown timer, and automatically resumes when the next 5-hour quota window opens. All parameters are configurable through the existing `DeepthinkConfigPanel`.

## Background & Context

### The Problem

DeepThink pipelines run multi-hour LLM inference workflows through a local Claude CLI proxy (`cliproxyapi` at `localhost:8317`). Claude API quotas reset on a fixed 5-hour cycle. When quota is exceeded, the proxy returns HTTP 429 with `model_cooldown`. The current code in `DeepthinkCore.ts` catches errors generically inside `makeDeepthinkApiCall()` and retries with exponential backoff (`INITIAL_DELAY_MS = 20000`, `BACKOFF_FACTOR = 2`, `MAX_RETRIES = 3`). After 4 total attempts (~2.5 minutes of retries), the pipeline throws, setting the agent/pipeline status to `'error'` and losing all accumulated progress.

### Why the Console Watchdog Failed (Root Cause)

A prior attempt monkey-patched `window.fetch` in the browser console to intercept 429 responses globally. This failed because Vite bundles `@anthropic-ai/sdk` (used by the `cliproxyapi` proxy client) with a closure that captures the original `window.fetch` reference at module initialization time (ESM top-level scope). Reassigning `window.fetch` after the bundle loads has no effect on the SDK's captured reference. Any fix **must** be at the `catch` site inside `makeDeepthinkApiCall()` in `DeepthinkCore.ts`, where the error object is already available with its HTTP status code.

### Existing Session Infrastructure

`DeepthinkSession.ts` already provides:
- `buildSessionFile(pipeline, config, prompts)` &rarr; `DeepthinkSessionFile`
- `saveSessionToFile()` &rarr; triggers browser download of `.deepthink.json`
- `restoreSession(session, renderFn)` &rarr; restores full pipeline state
- `resumeSolutionPoolIterations(depth)` &rarr; resumes iteration loop from correct point
- `window.__deepthinkResume` / `window.__deepthinkLoadAndResume` &rarr; console entry points
- `scheduleAutoSave()` &rarr; debounced localStorage auto-save

The new feature hooks into all of these rather than duplicating save/restore logic.

## Architecture

### State Machine

```
                    +──────────────+
                    |   RUNNING    |
                    +──────┬───────+
                           │ 2+ consecutive 429s detected
                           v
                    +──────────────+
                    |   SAVING     |  ── auto-save to file
                    +──────┬───────+
                           │ save complete
                           v
                    +──────────────+
                    |   PAUSED     |  ── countdown UI visible, no API calls
                    +──────┬───────+
                           │ quota reset time reached
                           v
                    +──────────────+
                    |  RESUMING    |  ── calls resumeSolutionPoolIterations()
                    +──────┬───────+
                           │ pipeline continues
                           v
                    +──────────────+
                    |   RUNNING    |
                    +──────────────+
```

### Data Flow

```
makeDeepthinkApiCall()                    QuotaBackoffManager
   catch (error) ──────────────────────>  recordError(error)
      │                                       │
      │  if error.status === 429              │ consecutive429Count++
      │                                       │
      │  if consecutive429Count >= threshold   │
      │                                       v
      │                              transitionTo('saving')
      │                                       │
      │                                       v
      │                              saveSessionToFile()  [auto, to disk]
      │                                       │
      │                                       v
      │                              transitionTo('paused')
      │                                       │
      │                              start countdown timer
      │                                       │
      │                              QuotaCountdownUI renders
      │                                       │
      │                              [wait until resetTime]
      │                                       │
      │                                       v
      │                              transitionTo('resuming')
      │                                       │
      │                                       v
      │                              resumeSolutionPoolIterations(depth)
      │                                       │
      │                                       v
      │                              transitionTo('running')
      │                                       │
      │  <──── PipelineQuotaPausedError ──────┘
      │        (thrown to abort current call chain)
```

### Files Changed

| File | Change Type | Description |
|------|------------|-------------|
| `Deepthink/QuotaBackoffManager.ts` | **NEW** | State machine, 429 counting, countdown, auto-save trigger, auto-resume |
| `Deepthink/QuotaCountdownUI.ts` | **NEW** | Floating countdown overlay component (vanilla DOM, no React needed) |
| `Deepthink/QuotaBackoffManager.test.ts` | **NEW** | Unit tests for state machine, countdown math, 429 detection |
| `Deepthink/QuotaBackoffIntegration.test.ts` | **NEW** | Integration test: synthetic pipeline through full pause/resume cycle |
| `Deepthink/DeepthinkCore.ts` | **MODIFY** | Wire 429 detection into `makeDeepthinkApiCall()` catch block; add `PipelineQuotaPausedError`; add `makeResumedApiCall()` quota hook |
| `Deepthink/DeepthinkSession.ts` | **MODIFY** | Add `saveSessionToFileAutomatic(filename)` — programmatic save without user download dialog |
| `Deepthink/DeepthinkConfigPanel.tsx` | **MODIFY** | Add Quota Backoff config section |
| `Routing/DeepthinkConfigController.ts` | **MODIFY** | Add quota config fields + getters/setters |
| `Routing/ModelConfig.ts` | **MODIFY** | Add quota config persistence fields |
| `Deepthink/Deepthink.ts` | **MODIFY** | Export `QuotaBackoffManager` singleton; expose `window.__deepthinkQuota` for debugging |

## Detailed Implementation

### 1. New File: `Deepthink/QuotaBackoffManager.ts`

```typescript
/**
 * QuotaBackoffManager — Manages 429 quota backoff state machine.
 *
 * WHY THIS IS HERE AND NOT IN A FETCH INTERCEPTOR:
 * The @anthropic-ai/sdk (used by cliproxyapi) captures window.fetch in a
 * closure at module init time. Monkey-patching window.fetch after bundle
 * load never reaches the SDK. We must intercept at the RateLimitError
 * catch site in makeDeepthinkApiCall().
 */

// ── Types ──

export type QuotaBackoffState = 'running' | 'saving' | 'paused' | 'resuming';

export interface QuotaBackoffConfig {
  /** First quota reset time as "HH:MM" (24h format), e.g. "14:59" */
  firstResetTime: string;
  /** Whether to auto-compute subsequent resets every 5 hours */
  cyclicResetEnabled: boolean;
  /** Number of consecutive 429s before triggering pause (default: 2) */
  consecutive429Threshold: number;
  /** Whether to auto-resume when the reset time arrives */
  autoResumeEnabled: boolean;
}

export interface QuotaBackoffSnapshot {
  state: QuotaBackoffState;
  consecutive429Count: number;
  nextResetTime: Date | null;
  msUntilReset: number;
  savedFilename: string | null;
}

export type QuotaBackoffListener = (snapshot: QuotaBackoffSnapshot) => void;

// ── Default Config ──

export const DEFAULT_QUOTA_BACKOFF_CONFIG: QuotaBackoffConfig = {
  firstResetTime: '',
  cyclicResetEnabled: true,
  consecutive429Threshold: 2,
  autoResumeEnabled: true,
};

// ── Clock abstraction (for testing) ──

export interface QuotaClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export const REAL_CLOCK: QuotaClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (fn, ms) => window.setInterval(fn, ms) as unknown as number,
  clearInterval: (id) => window.clearInterval(id),
};

// ── Manager Class ──

export class QuotaBackoffManager {
  private state: QuotaBackoffState = 'running';
  private config: QuotaBackoffConfig;
  private clock: QuotaClock;
  private consecutive429Count: number = 0;
  private nextResetTime: Date | null = null;
  private savedFilename: string | null = null;
  private countdownTimerId: number | null = null;
  private resumeTimerId: number | null = null;
  private listeners: Set<QuotaBackoffListener> = new Set();

  // Injected callbacks (set via setCallbacks)
  private onSaveSession: ((filename: string) => Promise<void>) | null = null;
  private onResumePipeline: (() => Promise<void>) | null = null;

  constructor(config?: Partial<QuotaBackoffConfig>, clock?: QuotaClock) {
    this.config = { ...DEFAULT_QUOTA_BACKOFF_CONFIG, ...config };
    this.clock = clock ?? REAL_CLOCK;
  }

  // ── Public API ──

  setCallbacks(callbacks: {
    onSaveSession: (filename: string) => Promise<void>;
    onResumePipeline: () => Promise<void>;
  }): void;

  updateConfig(partial: Partial<QuotaBackoffConfig>): void;

  getConfig(): Readonly<QuotaBackoffConfig>;

  getSnapshot(): QuotaBackoffSnapshot;

  subscribe(listener: QuotaBackoffListener): () => void;

  /**
   * Called from makeDeepthinkApiCall() catch block when error.status === 429.
   * Returns true if the manager has transitioned to 'saving'/'paused'
   * (caller should throw PipelineQuotaPausedError).
   * Returns false if threshold not yet met (caller should continue normal retry).
   */
  recordQuotaError(): boolean;

  /**
   * Called from makeDeepthinkApiCall() on any successful API response.
   * Resets consecutive 429 counter to 0.
   */
  recordSuccess(): void;

  /**
   * Force-reset to 'running' state. Used when pipeline is manually stopped
   * or a new pipeline starts.
   */
  reset(): void;

  /**
   * Returns true if the manager is in 'paused' or 'saving' state,
   * meaning no API calls should be attempted.
   */
  isPaused(): boolean;

  // ── Internal Methods ──

  /**
   * Compute the next quota reset time >= now.
   * Algorithm:
   *   1. Parse firstResetTime as today's HH:MM in local timezone
   *   2. If cyclicResetEnabled, generate reset times at +0h, +5h, +10h, +15h, +20h
   *      from the first reset time
   *   3. Return the earliest future reset time
   *   4. If no reset today, wrap to tomorrow's first reset
   */
  private computeNextResetTime(): Date | null;

  /**
   * Transition state machine and notify listeners.
   */
  private transitionTo(newState: QuotaBackoffState): void;

  /**
   * Emit current snapshot to all listeners.
   */
  private notify(): void;

  /**
   * Start 1-second countdown interval that notifies listeners with updated msUntilReset.
   * When msUntilReset <= 0, triggers auto-resume if enabled.
   */
  private startCountdown(): void;

  /**
   * Stop countdown and resume timers.
   */
  private stopTimers(): void;
}

// ── Singleton ──

let _instance: QuotaBackoffManager | null = null;

export function getQuotaBackoffManager(): QuotaBackoffManager;
export function initQuotaBackoffManager(
  config?: Partial<QuotaBackoffConfig>,
  clock?: QuotaClock
): QuotaBackoffManager;
export function resetQuotaBackoffManagerForTest(): void;
```

#### Key method implementations (pseudocode):

**`recordQuotaError(): boolean`**
```typescript
recordQuotaError(): boolean {
  this.consecutive429Count++;
  console.warn(`[QuotaBackoff] 429 received (${this.consecutive429Count}/${this.config.consecutive429Threshold})`);

  if (this.consecutive429Count >= this.config.consecutive429Threshold) {
    this.transitionTo('saving');
    // Compute next reset
    this.nextResetTime = this.computeNextResetTime();
    // Trigger async save (fire-and-forget with logging)
    const ts = new Date(this.clock.now()).toISOString().replace(/[:.]/g, '-').substring(0, 19);
    this.savedFilename = `deepthink-quota-pause-${ts}.json`;
    if (this.onSaveSession) {
      this.onSaveSession(this.savedFilename)
        .then(() => {
          this.transitionTo('paused');
          this.startCountdown();
        })
        .catch((err) => {
          console.error('[QuotaBackoff] Save failed, pausing anyway:', err);
          this.transitionTo('paused');
          this.startCountdown();
        });
    } else {
      this.transitionTo('paused');
      this.startCountdown();
    }
    return true;
  }
  return false;
}
```

**`computeNextResetTime(): Date | null`**
```typescript
private computeNextResetTime(): Date | null {
  if (!this.config.firstResetTime) return null;

  const [hours, minutes] = this.config.firstResetTime.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;

  const now = new Date(this.clock.now());
  const baseToday = new Date(now);
  baseToday.setHours(hours, minutes, 0, 0);

  const CYCLE_MS = 5 * 60 * 60 * 1000; // 5 hours
  const candidates: Date[] = [];

  if (this.config.cyclicResetEnabled) {
    // Generate all cycle points for a 25-hour window (covers today + wrap)
    for (let i = 0; i < 6; i++) {
      const candidate = new Date(baseToday.getTime() + i * CYCLE_MS);
      candidates.push(candidate);
      // Also check yesterday's base + cycles that land in the future
      const yesterdayCandidate = new Date(baseToday.getTime() - 24 * 60 * 60 * 1000 + i * CYCLE_MS);
      candidates.push(yesterdayCandidate);
    }
  } else {
    candidates.push(baseToday);
    candidates.push(new Date(baseToday.getTime() + 24 * 60 * 60 * 1000));
  }

  // Find earliest candidate that is in the future
  const futureResets = candidates
    .filter(c => c.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return futureResets[0] ?? null;
}
```

### 2. New File: `Deepthink/QuotaCountdownUI.ts`

```typescript
/**
 * QuotaCountdownUI — Floating overlay showing quota pause countdown.
 * Pure DOM manipulation, no React dependency. Mounts/unmounts itself.
 */

import {
  QuotaBackoffSnapshot,
  QuotaBackoffManager,
  getQuotaBackoffManager,
} from './QuotaBackoffManager';

const OVERLAY_ID = 'deepthink-quota-countdown-overlay';

export function mountQuotaCountdownUI(): () => void;
export function unmountQuotaCountdownUI(): void;

// ── Internal ──

function createOverlayElement(): HTMLDivElement;

/**
 * Formats milliseconds into "Xh Ym Zs" string.
 */
export function formatCountdown(ms: number): string;

/**
 * Formats a Date into "HH:MM" local time string.
 */
export function formatResetTime(date: Date): string;

function updateOverlayContent(
  overlay: HTMLDivElement,
  snapshot: QuotaBackoffSnapshot
): void;
```

**Overlay HTML structure** (created in `createOverlayElement()`):
```html
<div id="deepthink-quota-countdown-overlay" style="
  position: fixed; bottom: 24px; right: 24px; z-index: 10000;
  background: var(--surface-elevated, #1e1e2e); border: 1px solid var(--border-color, #333);
  border-radius: 12px; padding: 16px 20px; min-width: 320px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4); font-family: inherit;
">
  <div class="quota-countdown-title" style="font-size: 14px; font-weight: 600; color: var(--text-warning, #f59e0b);">
    Quota exceeded — resuming at <span class="quota-reset-time">14:59</span>
  </div>
  <div class="quota-countdown-timer" style="font-size: 28px; font-weight: 700; margin: 8px 0; font-variant-numeric: tabular-nums;">
    4h 32m 10s
  </div>
  <div class="quota-countdown-saved" style="font-size: 12px; color: var(--text-muted, #888);">
    Session saved: deepthink-quota-pause-2026-03-22T14-30-00.json
  </div>
  <button class="quota-countdown-cancel" style="margin-top: 8px; font-size: 12px; cursor: pointer;">
    Cancel auto-resume
  </button>
</div>
```

The overlay is shown when `snapshot.state === 'paused'`, hidden when `snapshot.state === 'running'` or `'resuming'`. The cancel button calls `manager.reset()` and sets `currentProcess.isStopRequested = true`.

### 3. New Error Class in `Deepthink/DeepthinkCore.ts`

Add after `PipelineStopRequestedError` (line ~217):

```typescript
/**
 * Thrown when the QuotaBackoffManager transitions to 'paused'.
 * Caught at the top-level pipeline try/catch to halt execution
 * without marking the pipeline as permanently errored.
 */
export class PipelineQuotaPausedError extends Error {
  constructor(message: string = 'Pipeline paused due to quota exceeded') {
    super(message);
    this.name = 'PipelineQuotaPausedError';
  }
}
```

### 4. Modifications to `makeDeepthinkApiCall()` in `DeepthinkCore.ts`

**Location:** Inside the `catch (error: any)` block (line ~648), before the existing `if (attempt === MAX_RETRIES)` check.

Add this block at the **top** of the catch:

```typescript
} catch (error: any) {
    // ── 429 Quota Detection ──
    // Check for HTTP 429 (model_cooldown) from cliproxyapi.
    // error.status is set by the Anthropic SDK / fetch wrapper.
    const is429 = error?.status === 429
      || error?.error?.type === 'model_cooldown'
      || (error?.message && /429|rate.?limit|model_cooldown/i.test(error.message));

    if (is429) {
      const manager = getQuotaBackoffManager();
      const shouldPause = manager.recordQuotaError();
      if (shouldPause) {
        // Set pipeline status to a non-error state so UI shows pause, not failure
        currentProcess.status = 'processing'; // keep as processing, UI reads overlay
        render();
        throw new PipelineQuotaPausedError();
      }
      // If threshold not met, fall through to normal retry logic below
    } else {
      // Non-429 error: reset consecutive counter
      getQuotaBackoffManager().recordSuccess();
    }

    if (attempt === MAX_RETRIES) {
      throw error;
    } else {
      // ... existing retry logic unchanged ...
    }
}
```

**Also add** a `recordSuccess()` call after a successful API response (line ~643, after the `break`):

```typescript
if (responseText && responseText.trim() !== "") {
    getQuotaBackoffManager().recordSuccess();
    break;
}
```

### 5. Modifications to the top-level pipeline `catch` in `DeepthinkCore.ts`

**Location:** The outer `try/catch` in `startDeepthinkAnalysisProcess()` (around line ~2200) and in `resumeSolutionPoolIterations()` (around line ~2420).

Add handling for `PipelineQuotaPausedError` before the generic error handler:

```typescript
} catch (error: any) {
    if (error instanceof PipelineQuotaPausedError) {
        // Do NOT mark pipeline as failed. State is preserved for resume.
        console.log('[Deepthink] Pipeline paused for quota reset. State saved.');
        // Pipeline status stays 'processing'; overlay shows countdown.
        // Auto-resume is handled by QuotaBackoffManager.
        return;
    }
    if (error instanceof PipelineStopRequestedError) {
        // ... existing stop handling ...
    }
    // ... existing generic error handling ...
}
```

### 6. Apply the same pattern to `makeResumedApiCall()` in `resumeSolutionPoolIterations()`

The resumed API call function (line ~2325) has its own retry loop. Apply the identical 429 detection and `PipelineQuotaPausedError` throw pattern to its `catch` block.

### 7. Modifications to `DeepthinkSession.ts`

Add a new export for programmatic (non-dialog) file save:

```typescript
/**
 * Programmatically save session to a file with a specific filename.
 * Uses the same buildSessionFile() logic but triggers a browser download
 * with the given filename (no file picker dialog).
 *
 * Used by QuotaBackoffManager for auto-save on quota exceeded.
 */
export async function saveSessionToFileAutomatic(filename: string): Promise<void> {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) {
        throw new Error('No active Deepthink session to save.');
    }
    if (!capturedConfig || !capturedPrompts) {
        throw new Error('Session config was not captured. Cannot save.');
    }

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
    URL.revokeObjectURL(url);
}
```

### 8. Modifications to `Routing/DeepthinkConfigController.ts`

Add to `DeepthinkConfigState` interface:

```typescript
export interface DeepthinkConfigState {
    // ... existing fields ...

    /** Quota backoff: first reset time "HH:MM" */
    quotaResetTime: string;
    /** Quota backoff: auto-compute 5h cycles */
    quotaCyclicResetEnabled: boolean;
    /** Quota backoff: consecutive 429s before pause */
    quotaConsecutive429Threshold: number;
    /** Quota backoff: auto-resume on reset */
    quotaAutoResumeEnabled: boolean;
}
```

Add getters and setters to `DeepthinkConfigController`:

```typescript
// ── Quota Backoff Getters ──

public getQuotaResetTime(): string {
    return this.modelConfig.getParameter('quotaResetTime') ?? '';
}

public isQuotaCyclicResetEnabled(): boolean {
    return this.modelConfig.getParameter('quotaCyclicResetEnabled') ?? true;
}

public getQuotaConsecutive429Threshold(): number {
    return this.modelConfig.getParameter('quotaConsecutive429Threshold') ?? 2;
}

public isQuotaAutoResumeEnabled(): boolean {
    return this.modelConfig.getParameter('quotaAutoResumeEnabled') ?? true;
}

// ── Quota Backoff Setters ──

public setQuotaResetTime(time: string): void {
    // Validate HH:MM format
    if (time && !/^\d{1,2}:\d{2}$/.test(time)) return;
    this.modelConfig.updateParameter('quotaResetTime', time);
    this.syncQuotaBackoffConfig();
    this.emitChange('quotaResetTime');
}

public setQuotaCyclicResetEnabled(enabled: boolean): void {
    this.modelConfig.updateParameter('quotaCyclicResetEnabled', enabled);
    this.syncQuotaBackoffConfig();
    this.emitChange('quotaCyclicResetEnabled');
}

public setQuotaConsecutive429Threshold(threshold: number): void {
    const clamped = Math.max(1, Math.min(threshold, 10));
    this.modelConfig.updateParameter('quotaConsecutive429Threshold', clamped);
    this.syncQuotaBackoffConfig();
    this.emitChange('quotaConsecutive429Threshold');
}

public setQuotaAutoResumeEnabled(enabled: boolean): void {
    this.modelConfig.updateParameter('quotaAutoResumeEnabled', enabled);
    this.syncQuotaBackoffConfig();
    this.emitChange('quotaAutoResumeEnabled');
}

/**
 * Push current config values to the QuotaBackoffManager singleton.
 */
private syncQuotaBackoffConfig(): void {
    const manager = getQuotaBackoffManager();
    manager.updateConfig({
        firstResetTime: this.getQuotaResetTime(),
        cyclicResetEnabled: this.isQuotaCyclicResetEnabled(),
        consecutive429Threshold: this.getQuotaConsecutive429Threshold(),
        autoResumeEnabled: this.isQuotaAutoResumeEnabled(),
    });
}
```

Update `getState()` to include the new fields:

```typescript
public getState(): DeepthinkConfigState {
    const params = this.modelConfig.getParameters();
    return {
        // ... existing fields ...
        quotaResetTime: params.quotaResetTime ?? '',
        quotaCyclicResetEnabled: params.quotaCyclicResetEnabled ?? true,
        quotaConsecutive429Threshold: params.quotaConsecutive429Threshold ?? 2,
        quotaAutoResumeEnabled: params.quotaAutoResumeEnabled ?? true,
    };
}
```

### 9. Modifications to `Routing/ModelConfig.ts`

Add the following parameter fields to the parameters interface/defaults:

```typescript
// In the parameters interface (exact name depends on existing code):
quotaResetTime: string;            // default: ''
quotaCyclicResetEnabled: boolean;  // default: true
quotaConsecutive429Threshold: number; // default: 2
quotaAutoResumeEnabled: boolean;   // default: true
```

These are persisted alongside existing parameters via the same localStorage mechanism.

### 10. Modifications to `DeepthinkConfigPanel.tsx`

Add a new `QuotaBackoffSection` component and wire it into `DeepthinkConfigPanelComponent`.

Add to `DeepthinkConfigPanelProps`:

```typescript
export interface DeepthinkConfigPanelProps {
    // ... existing fields ...

    quotaResetTime: string;
    quotaCyclicResetEnabled: boolean;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;

    onQuotaResetTimeChange: (time: string) => void;
    onQuotaCyclicResetToggle: (enabled: boolean) => void;
    onQuotaConsecutive429ThresholdChange: (threshold: number) => void;
    onQuotaAutoResumeToggle: (enabled: boolean) => void;
}
```

New section component:

```tsx
const QuotaBackoffSection: React.FC<{
    quotaResetTime: string;
    quotaCyclicResetEnabled: boolean;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;
    onQuotaResetTimeChange: (time: string) => void;
    onQuotaCyclicResetToggle: (enabled: boolean) => void;
    onQuotaConsecutive429ThresholdChange: (threshold: number) => void;
    onQuotaAutoResumeToggle: (enabled: boolean) => void;
}> = (props) => (
    <div className="quota-backoff-container">
        <div className="quota-backoff-header">
            <span className="material-symbols-outlined">schedule</span>
            <span>Quota Backoff</span>
        </div>
        <div className="quota-backoff-card">
            {/* Reset time input */}
            <div className="input-group-tight">
                <label htmlFor="dt-quota-reset-time" className="input-label">
                    First Reset Time (HH:MM)
                </label>
                <input
                    type="time"
                    id="dt-quota-reset-time"
                    value={props.quotaResetTime}
                    onChange={e => props.onQuotaResetTimeChange(e.target.value)}
                    style={{ width: 120 }}
                />
            </div>

            {/* 5h cycle toggle */}
            <div className="quota-toggle-row">
                <label className="toggle-label">
                    <input
                        type="checkbox"
                        checked={props.quotaCyclicResetEnabled}
                        onChange={e => props.onQuotaCyclicResetToggle(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                </label>
                <span>Auto-compute 5h reset cycles</span>
            </div>

            {/* Consecutive 429 threshold slider */}
            <div className="input-group-tight">
                <label htmlFor="dt-quota-threshold-slider" className="input-label">
                    Consecutive 429s to trigger: <span>{props.quotaConsecutive429Threshold}</span>
                </label>
                <SliderWithFill
                    id="dt-quota-threshold-slider"
                    value={props.quotaConsecutive429Threshold}
                    min={1}
                    max={10}
                    color="#f59e0b"
                    onChange={props.onQuotaConsecutive429ThresholdChange}
                />
            </div>

            {/* Auto-resume toggle */}
            <div className="quota-toggle-row">
                <label className="toggle-label">
                    <input
                        type="checkbox"
                        checked={props.quotaAutoResumeEnabled}
                        onChange={e => props.onQuotaAutoResumeToggle(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                </label>
                <span>Auto-resume after quota reset</span>
            </div>
        </div>
    </div>
);
```

Add to `DeepthinkConfigPanelComponent` JSX, as a third row after the existing two `config-row-container` divs:

```tsx
{/* Quota Backoff Row */}
<div className="config-row-container">
    <div className="config-row-inner">
        <QuotaBackoffSection
            quotaResetTime={props.quotaResetTime}
            quotaCyclicResetEnabled={props.quotaCyclicResetEnabled}
            quotaConsecutive429Threshold={props.quotaConsecutive429Threshold}
            quotaAutoResumeEnabled={props.quotaAutoResumeEnabled}
            onQuotaResetTimeChange={props.onQuotaResetTimeChange}
            onQuotaCyclicResetToggle={props.onQuotaCyclicResetToggle}
            onQuotaConsecutive429ThresholdChange={props.onQuotaConsecutive429ThresholdChange}
            onQuotaAutoResumeToggle={props.onQuotaAutoResumeToggle}
        />
    </div>
</div>
```

Update `deriveProps()` in the controller bridge:

```typescript
function deriveProps(controller: ReturnType<typeof getDeepthinkConfigController>): DeepthinkConfigPanelProps {
    const s = controller.getState();
    return {
        ...s,
        isGeminiProvider: true,
        // ... existing callbacks ...
        onQuotaResetTimeChange: v => controller.setQuotaResetTime(v),
        onQuotaCyclicResetToggle: v => controller.setQuotaCyclicResetEnabled(v),
        onQuotaConsecutive429ThresholdChange: v => controller.setQuotaConsecutive429Threshold(v),
        onQuotaAutoResumeToggle: v => controller.setQuotaAutoResumeEnabled(v),
    };
}
```

### 11. Modifications to `Deepthink/Deepthink.ts`

Wire up the `QuotaBackoffManager` singleton with save/resume callbacks:

```typescript
import {
    initQuotaBackoffManager,
    getQuotaBackoffManager,
} from './QuotaBackoffManager';
import { mountQuotaCountdownUI } from './QuotaCountdownUI';
import { saveSessionToFileAutomatic } from './DeepthinkSession';

// Initialize during module setup (called from initializeDeepthinkCore or app bootstrap):
export function initQuotaBackoff(): void {
    const manager = initQuotaBackoffManager();

    manager.setCallbacks({
        onSaveSession: async (filename: string) => {
            await saveSessionToFileAutomatic(filename);
        },
        onResumePipeline: async () => {
            const pipeline = getActiveDeepthinkPipeline();
            if (!pipeline) return;
            const depth = deps.getIterativeDepth();
            await resumeSolutionPoolIterations(depth);
        },
    });

    // Mount the floating countdown UI
    mountQuotaCountdownUI();
}

// Expose for debugging
(window as any).__deepthinkQuota = () => getQuotaBackoffManager().getSnapshot();
```

## Testing Strategy

All tests use dependency injection and clock mocking to avoid waiting for real quota limits.

### Test File: `Deepthink/QuotaBackoffManager.test.ts`

Uses a `FakeClock` implementation of the `QuotaClock` interface for deterministic time control.

```typescript
import {
    QuotaBackoffManager,
    QuotaClock,
    QuotaBackoffConfig,
    QuotaBackoffSnapshot,
    DEFAULT_QUOTA_BACKOFF_CONFIG,
} from './QuotaBackoffManager';

// ── Fake Clock ──

class FakeClock implements QuotaClock {
    private _now: number;
    private timers: Map<number, { fn: () => void; fireAt: number; interval?: number }> = new Map();
    private nextId = 1;

    constructor(initialTime: number = Date.parse('2026-03-22T10:00:00')) {
        this._now = initialTime;
    }

    now(): number { return this._now; }

    setTimeout(fn: () => void, ms: number): number {
        const id = this.nextId++;
        this.timers.set(id, { fn, fireAt: this._now + ms });
        return id;
    }

    clearTimeout(id: number): void { this.timers.delete(id); }

    setInterval(fn: () => void, ms: number): number {
        const id = this.nextId++;
        this.timers.set(id, { fn, fireAt: this._now + ms, interval: ms });
        return id;
    }

    clearInterval(id: number): void { this.timers.delete(id); }

    /**
     * Advance time by `ms` milliseconds, firing all timers that fall within the window.
     */
    advance(ms: number): void {
        const targetTime = this._now + ms;
        while (this._now < targetTime) {
            // Find earliest timer
            let earliest: { id: number; entry: { fn: () => void; fireAt: number; interval?: number } } | null = null;
            for (const [id, entry] of this.timers) {
                if (entry.fireAt <= targetTime && (!earliest || entry.fireAt < earliest.entry.fireAt)) {
                    earliest = { id, entry };
                }
            }
            if (!earliest || earliest.entry.fireAt > targetTime) {
                this._now = targetTime;
                break;
            }
            this._now = earliest.entry.fireAt;
            const { fn, interval } = earliest.entry;
            if (interval) {
                earliest.entry.fireAt += interval;
            } else {
                this.timers.delete(earliest.id);
            }
            fn();
        }
    }
}
```

#### Unit Test Cases

```typescript
describe('QuotaBackoffManager', () => {

    // ── 429 Detection & Counting ──

    test('recordQuotaError increments consecutive count', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 3 }, clock);
        expect(mgr.recordQuotaError()).toBe(false); // 1/3
        expect(mgr.getSnapshot().consecutive429Count).toBe(1);
        expect(mgr.recordQuotaError()).toBe(false); // 2/3
        expect(mgr.recordQuotaError()).toBe(true);  // 3/3 → paused
        expect(mgr.getSnapshot().state).toBe('saving');
    });

    test('recordSuccess resets consecutive count', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 2 }, clock);
        mgr.recordQuotaError(); // 1/2
        mgr.recordSuccess();
        expect(mgr.getSnapshot().consecutive429Count).toBe(0);
        expect(mgr.recordQuotaError()).toBe(false); // 1/2 again
    });

    // ── State Machine Transitions ──

    test('state transitions: running → saving → paused → resuming → running', async () => {
        const clock = new FakeClock();
        const states: string[] = [];
        let saveResolve: () => void;
        let resumeResolve: () => void;

        const mgr = new QuotaBackoffManager(
            { consecutive429Threshold: 2, firstResetTime: '10:30', autoResumeEnabled: true },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: () => new Promise<void>(r => { saveResolve = r; }),
            onResumePipeline: () => new Promise<void>(r => { resumeResolve = r; }),
        });
        mgr.subscribe(snap => states.push(snap.state));

        mgr.recordQuotaError();
        mgr.recordQuotaError(); // triggers saving
        expect(states).toContain('saving');

        saveResolve!();
        await Promise.resolve(); // flush microtask
        expect(states).toContain('paused');

        // Advance clock past reset time
        clock.advance(31 * 60 * 1000); // 31 minutes to 10:31
        expect(states).toContain('resuming');

        resumeResolve!();
        await Promise.resolve();
        expect(states).toContain('running');
    });

    // ── Countdown Math ──

    test('computeNextResetTime returns nearest future 5h-cycle reset', () => {
        // Clock at 10:00, first reset at 05:00 → cycles: 05:00, 10:00, 15:00, 20:00, 01:00
        // Nearest future is 15:00
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '05:00', cyclicResetEnabled: true, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        const snap = mgr.getSnapshot();
        // nextResetTime should be 15:00 today
        expect(snap.nextResetTime?.getHours()).toBe(15);
        expect(snap.nextResetTime?.getMinutes()).toBe(0);
    });

    test('msUntilReset decrements as clock advances', () => {
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '15:00', cyclicResetEnabled: false, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        // Initial: 5 hours = 18_000_000ms
        const snap1 = mgr.getSnapshot();
        expect(snap1.msUntilReset).toBeCloseTo(5 * 3600 * 1000, -3);

        clock.advance(3600 * 1000); // +1 hour
        const snap2 = mgr.getSnapshot();
        expect(snap2.msUntilReset).toBeCloseTo(4 * 3600 * 1000, -3);
    });

    // ── Save Trigger ──

    test('onSaveSession is called with timestamped filename', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T10:30:45'));
        let savedFilename = '';
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({
            onSaveSession: async (fn) => { savedFilename = fn; },
            onResumePipeline: async () => {},
        });
        mgr.recordQuotaError();
        await Promise.resolve();
        expect(savedFilename).toMatch(/^deepthink-quota-pause-2026-03-22T10-30-45\.json$/);
    });

    // ── Auto-Resume Invocation ──

    test('onResumePipeline is called when countdown reaches 0', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        let resumed = false;
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '14:59', cyclicResetEnabled: false, consecutive429Threshold: 1, autoResumeEnabled: true },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { resumed = true; },
        });
        mgr.recordQuotaError();
        await Promise.resolve(); // save resolves

        // Advance 10 minutes (past 14:59)
        clock.advance(10 * 60 * 1000);
        await Promise.resolve();
        expect(resumed).toBe(true);
    });

    test('auto-resume does NOT fire when autoResumeEnabled is false', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        let resumed = false;
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '14:59', cyclicResetEnabled: false, consecutive429Threshold: 1, autoResumeEnabled: false },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { resumed = true; },
        });
        mgr.recordQuotaError();
        await Promise.resolve();
        clock.advance(10 * 60 * 1000);
        await Promise.resolve();
        expect(resumed).toBe(false);
    });

    // ── Reset ──

    test('reset() returns to running and clears counters', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        mgr.reset();
        const snap = mgr.getSnapshot();
        expect(snap.state).toBe('running');
        expect(snap.consecutive429Count).toBe(0);
        expect(snap.nextResetTime).toBeNull();
    });
});
```

### Test File: `Deepthink/QuotaBackoffIntegration.test.ts`

End-to-end test that simulates a short pipeline with injected 429 failures.

```typescript
import { FakeClock } from './QuotaBackoffManager.test'; // or inline

describe('Quota Backoff Integration', () => {
    /**
     * Simulates: pipeline running → 2 consecutive 429s → auto-save → pause →
     * clock advances past reset → auto-resume → pipeline continues to completion.
     *
     * Total wall-clock time: < 2 seconds (all time is mocked).
     */
    test('full pause/resume cycle completes in mocked time', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        let saveCount = 0;
        let resumeCount = 0;
        let pipelineCompleted = false;

        const mgr = new QuotaBackoffManager(
            {
                firstResetTime: '14:59',
                cyclicResetEnabled: true,
                consecutive429Threshold: 2,
                autoResumeEnabled: true,
            },
            clock,
        );

        // Simulate makeDeepthinkApiCall behavior
        let callIndex = 0;
        const apiResults = [
            { success: true },   // call 0: succeeds
            { status: 429 },     // call 1: first 429
            { status: 429 },     // call 2: second 429 → triggers pause
            // After resume:
            { success: true },   // call 3: succeeds
            { success: true },   // call 4: succeeds (pipeline done)
        ];

        mgr.setCallbacks({
            onSaveSession: async () => { saveCount++; },
            onResumePipeline: async () => {
                resumeCount++;
                // Simulate resumed pipeline making calls 3 and 4
                const r3 = apiResults[3];
                expect(r3.success).toBe(true);
                const r4 = apiResults[4];
                expect(r4.success).toBe(true);
                pipelineCompleted = true;
            },
        });

        // Simulate pipeline execution
        // Call 0: success
        mgr.recordSuccess();
        expect(mgr.getSnapshot().state).toBe('running');

        // Call 1: 429
        expect(mgr.recordQuotaError()).toBe(false); // 1/2, not yet paused

        // Call 2: 429
        expect(mgr.recordQuotaError()).toBe(true); // 2/2, pause triggered
        await Promise.resolve(); // save completes

        expect(saveCount).toBe(1);
        expect(mgr.getSnapshot().state).toBe('paused');

        // Advance clock past 14:59
        clock.advance(10 * 60 * 1000);
        await Promise.resolve(); // resume triggers

        expect(resumeCount).toBe(1);
        expect(pipelineCompleted).toBe(true);
        expect(mgr.getSnapshot().state).toBe('running');
    });
});
```

### Test runner

Tests use the project's existing test framework (Vitest, based on the Vite toolchain). No special configuration needed beyond the existing `vitest.config.ts`. The `FakeClock` class is self-contained and has no external dependencies.

Run all quota-related tests:
```bash
npx vitest run Deepthink/QuotaBackoff
```

## Rollout Notes

### Backwards Compatibility

- **No breaking changes.** All new config fields have defaults (`quotaResetTime: ''`, `quotaCyclicResetEnabled: true`, `quotaConsecutive429Threshold: 2`, `quotaAutoResumeEnabled: true`).
- When `quotaResetTime` is empty string (default), `computeNextResetTime()` returns `null` and the manager never pauses — behavior is identical to pre-feature.
- The `DeepthinkSessionFile` interface is **not** modified. Session files saved before this feature load and work identically.
- `PipelineQuotaPausedError` is caught before the generic error handler, so existing error handling paths are unaffected.

### Migration

- **No data migration required.** New config fields are read from `ModelConfig` with fallback defaults.
- Existing localStorage auto-saves do not contain quota state and do not need to.
- The `QuotaBackoffManager` state is ephemeral (in-memory only) and resets on page reload.

### Config Defaults

| Field | Default | Rationale |
|-------|---------|-----------|
| `quotaResetTime` | `''` (empty) | Feature is opt-in. No pause behavior until user sets a time. |
| `quotaCyclicResetEnabled` | `true` | Claude API quotas always reset on 5h cycles, so this is the expected mode. |
| `quotaConsecutive429Threshold` | `2` | A single transient 429 could be a fluke; 2 consecutive confirms quota exhaustion. |
| `quotaAutoResumeEnabled` | `true` | The whole point of the feature is unattended operation. |

### Feature Flag

No feature flag needed. The feature is inert until `quotaResetTime` is set to a non-empty value. Setting it back to empty disables all quota backoff behavior.

## Open Questions

1. **Browser tab sleep/throttle** — Browsers throttle `setInterval` in background tabs to ~1 call/minute. Should we use a Web Worker for the countdown timer, or is the 1-minute resolution acceptable (resume would be delayed up to 60s)?

2. **Multiple quota resets in one session** — If the pipeline hits quota a second time after the first auto-resume, the current design will cycle through save→pause→resume again. Should there be a max-cycles-per-session limit to avoid infinite loops if the quota estimation is wrong?

3. **Save mechanism** — `saveSessionToFileAutomatic()` uses the `<a download>` trick, which triggers a browser download. This works but creates files in the user's Downloads folder. An alternative would be to use the File System Access API (`showSaveFilePicker`) for a consistent save location, but that requires user gesture the first time. Should we use localStorage as the primary auto-save target instead of file download for the quota-pause case?

4. **Notification** — Should we fire a browser `Notification` (requires permission) or play an audio tone when the pipeline auto-resumes, so the user knows it's running again if they've switched to another task?

5. **Non-iterative pipelines** — `resumeSolutionPoolIterations()` only handles the iterative corrections loop. If quota is exceeded during the initial strategy generation or hypothesis testing phases (before the iteration loop), the resume entry point doesn't cover those. Should a more general resume mechanism be implemented, or is it acceptable to document that auto-resume only works for the iteration phase?
