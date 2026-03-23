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

### Codebase Structure — Retry Loops

There are **three separate retry loops** in `DeepthinkCore.ts` that all need 429 handling:

1. **`makeDeepthinkApiCall()`** (line ~600) — the main pipeline's API call function, used by Track A and Track B.
2. **`makeResumedApiCall()`** (line ~2325) — inside `resumeSolutionPoolIterations()`, a near-identical copy used for resume.
3. **`runFinalJudge()`** (line ~2815) — a standalone retry loop for the final judging step.

All three share the same pattern: `for (let attempt = 0; attempt <= MAX_RETRIES; attempt++)`. All three must be modified.

### Concurrency Model

The pipeline runs Track A (Strategic Solver) and Track B (Hypothesis Explorer) concurrently via `Promise.all([trackAPromise, trackBPromise])`. Within Track A, the iterative corrections phase uses `Promise.allSettled(correctionPromises)` to run corrections across strategies concurrently. This means:

- **Multiple API calls can be in-flight simultaneously** when quota is hit.
- When one call triggers the pause, other concurrent calls will also receive 429s.
- The `QuotaBackoffManager` must be re-entrant-safe: multiple concurrent calls to `recordQuotaError()` must not trigger duplicate saves.
- All concurrent callers must check `isPaused()` before retrying.

## Architecture

### State Machine

```
                    +──────────────+
                    |   RUNNING    |
                    +──────┬───────+
                           │ N consecutive 429s detected
                           │ (re-entrant-safe: only first caller triggers transition)
                           v
                    +──────────────+
                    |   SAVING     |  ── auto-save to localStorage + file
                    +──────┬───────+
                           │ save complete (or save failed — pause anyway)
                           v
                    +──────────────+
                    |   PAUSED     |  ── countdown UI visible, no API calls
                    +──────┬───────+
                           │ quota reset time reached
                           v
                    +──────────────+
                    |  RESUMING    |  ── calls resume entry point
                    +──────┬───────+
                           │ resume succeeded
                           v
                    +──────────────+
                    |   RUNNING    |
                    +──────────────+

Error paths:
  RESUMING ──(resume throws)──> RUNNING (manager resets; pipeline catch sets status='error')
  Any state ──(reset() called)──> RUNNING (manual cancel or new pipeline start)
```

### Data Flow

```
makeDeepthinkApiCall()                    QuotaBackoffManager
   catch (error) ──────────────────────>  recordQuotaError()
      │                                       │
      │  if error.status === 429              │ consecutive429Count++
      │                                       │
      │  if count >= threshold AND            │ (re-entrant guard: only first
      │     state is still 'running'          │  caller past threshold transitions)
      │                                       │
      │                                       v
      │                              transitionTo('saving')
      │                                       │
      │                                       v
      │                              saveToLocalStorageImmediate() [sync, primary]
      │                              saveSessionToFileAutomatic() [async, backup]
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
      │
      │  NOTE: All concurrent callers also throw PipelineQuotaPausedError
      │  after checking isPaused() at the top of their retry loops.
```

### Files Changed

| File | Change Type | Description |
|------|------------|-------------|
| `Deepthink/QuotaBackoffManager.ts` | **NEW** | State machine, 429 counting, countdown, auto-save trigger, auto-resume |
| `Deepthink/QuotaCountdownUI.ts` | **NEW** | Floating countdown overlay component (vanilla DOM, no React needed) |
| `Deepthink/QuotaBackoffManager.test.ts` | **NEW** | Unit tests for state machine, countdown math, 429 detection, concurrency |
| `Deepthink/QuotaBackoffIntegration.test.ts` | **NEW** | Integration test: synthetic pipeline through full pause/resume cycle |
| `Deepthink/DeepthinkCore.ts` | **MODIFY** | Wire 429 detection into all 3 retry loops (`makeDeepthinkApiCall`, `makeResumedApiCall`, `runFinalJudge`); add `PipelineQuotaPausedError`; add `isPaused()` guard at top of retry loops; propagate through inner try/catches; fix timeout wrappers to clean up on rejection |
| `Deepthink/DeepthinkSession.ts` | **MODIFY** | Add `saveSessionToFileAutomatic(filename)` — programmatic save; add `saveToLocalStorageImmediate()` — flush auto-save synchronously |
| `Deepthink/DeepthinkConfigPanel.tsx` | **MODIFY** | Add Quota Backoff config section |
| `Routing/DeepthinkConfigController.ts` | **MODIFY** | Add quota config fields + getters/setters |
| `Routing/ModelConfig.ts` | **MODIFY** | Add quota config persistence fields |
| `Deepthink/Deepthink.ts` | **MODIFY** | Export `QuotaBackoffManager` singleton; expose `window.__deepthinkQuota` for debugging; add cleanup for SPA navigation |

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
 *
 * CONCURRENCY SAFETY:
 * Multiple API calls can be in-flight concurrently (Track A/B, Promise.allSettled
 * corrections). All calls that hit 429 will call recordQuotaError(). A re-entrant
 * guard ensures only the first caller past the threshold triggers the save/pause
 * transition. Subsequent callers see isPaused()===true and throw immediately.
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
  /** Maximum pause/resume cycles per pipeline run (prevents infinite loops if reset time is wrong) */
  maxCyclesPerSession: number;
}

export interface QuotaBackoffSnapshot {
  state: QuotaBackoffState;
  consecutive429Count: number;
  nextResetTime: Date | null;
  msUntilReset: number;
  savedFilename: string | null;
  cycleCount: number;
  maxCyclesPerSession: number;
}

export type QuotaBackoffListener = (snapshot: QuotaBackoffSnapshot) => void;

// ── Default Config ──

export const DEFAULT_QUOTA_BACKOFF_CONFIG: QuotaBackoffConfig = {
  firstResetTime: '',
  cyclicResetEnabled: true,
  consecutive429Threshold: 2,
  autoResumeEnabled: true,
  maxCyclesPerSession: 5,
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
  private cycleCount: number = 0;

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
   * Returns true if the caller should throw PipelineQuotaPausedError
   * (either because this call triggered the transition, or because
   * the manager is already in a non-running state from a concurrent call).
   * Returns false if threshold not yet met (caller should continue normal retry).
   *
   * RE-ENTRANT SAFETY: Multiple concurrent calls may invoke this simultaneously.
   * Only the first call that pushes count past threshold while state === 'running'
   * will trigger the save/pause transition. Subsequent calls see state !== 'running'
   * and return true immediately without triggering a duplicate save.
   */
  recordQuotaError(): boolean;

  /**
   * Called from makeDeepthinkApiCall() on any successful API response.
   * Resets consecutive 429 counter to 0.
   * NOTE: Only call this on actual success, NOT on non-429 errors.
   * A non-429 error between two 429s should not reset the counter —
   * the quota is still exhausted regardless of other error types.
   */
  recordSuccess(): void;

  /**
   * Force-reset to 'running' state. Used when pipeline is manually stopped
   * or a new pipeline starts. Does NOT reset cycleCount (only full reset does).
   */
  reset(): void;

  /**
   * Full reset including cycleCount. Called when a new pipeline starts.
   */
  fullReset(): void;

  /**
   * Returns true if the manager is in 'paused', 'saving', or 'resuming' state,
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
   *   3. Return the earliest future reset time (with 30s grace to avoid resuming
   *      into an exhausted window)
   *   4. If no reset today, wrap to tomorrow's first reset
   *
   * NOTE: Uses absolute millisecond offsets for cycle computation (5h = 18_000_000ms)
   * rather than "add 5 to the hour field" to avoid DST edge cases where clocks
   * spring forward/back.
   */
  private computeNextResetTime(): Date | null;

  /**
   * Transition state machine and notify listeners.
   * Validates transitions: only allows valid state changes.
   * Invalid transitions log a warning and are ignored.
   */
  private transitionTo(newState: QuotaBackoffState): void;

  /**
   * Emit current snapshot to all listeners.
   */
  private notify(): void;

  /**
   * Start countdown. Uses setInterval for UI updates (1s, acceptable if throttled
   * in background tabs) and a single setTimeout for the resume trigger.
   *
   * BACKGROUND TAB HANDLING: Browsers throttle setInterval in background tabs to
   * ~1 call/minute. This only affects countdown display accuracy. The setTimeout
   * for resume may also be delayed up to ~60s, which is acceptable for a 5-hour
   * wait (< 0.3% timing error).
   */
  private startCountdown(): void;

  /**
   * Trigger the resume. Called when countdown reaches 0 or manually via "Resume now".
   * Handles resume failures by resetting manager state.
   */
  private async triggerResume(): Promise<void>;

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
  // RE-ENTRANT GUARD: If we're already saving/paused/resuming (possibly from
  // a concurrent API call that hit 429 first), just tell the caller to throw.
  if (this.state !== 'running') {
    return true;
  }

  this.consecutive429Count++;
  console.warn(`[QuotaBackoff] 429 received (${this.consecutive429Count}/${this.config.consecutive429Threshold})`);

  if (this.consecutive429Count >= this.config.consecutive429Threshold) {
    // Check cycle limit to prevent infinite pause/resume loops
    if (this.cycleCount >= this.config.maxCyclesPerSession) {
      console.error(`[QuotaBackoff] Max pause/resume cycles (${this.config.maxCyclesPerSession}) reached. Not pausing — will let normal retry logic handle.`);
      return false;
    }

    this.cycleCount++;
    this.transitionTo('saving');

    // Compute next reset
    this.nextResetTime = this.computeNextResetTime();

    if (!this.nextResetTime) {
      console.error('[QuotaBackoff] Cannot compute next reset time (quotaResetTime not configured). Pausing without countdown — manual resume required via overlay button.');
    }

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

**`startCountdown(): void`**
```typescript
private startCountdown(): void {
  this.stopTimers();

  // UI update interval (1s). In background tabs browsers throttle to ~60s,
  // which is fine — the countdown display just updates less frequently.
  this.countdownTimerId = this.clock.setInterval(() => {
    this.notify(); // Listeners read msUntilReset from snapshot
  }, 1000);

  if (!this.nextResetTime) return; // No reset time — manual resume only, no auto-trigger

  // Resume trigger: single setTimeout for the exact duration.
  // Background tab throttling may delay this up to ~60s, which is acceptable.
  const msUntilReset = this.nextResetTime.getTime() - this.clock.now();
  if (msUntilReset <= 0) {
    // Reset time already passed — resume immediately
    this.triggerResume();
    return;
  }

  this.resumeTimerId = this.clock.setTimeout(() => {
    this.triggerResume();
  }, msUntilReset);
}
```

**`triggerResume(): void`**
```typescript
private async triggerResume(): Promise<void> {
  if (!this.config.autoResumeEnabled) {
    console.log('[QuotaBackoff] Auto-resume disabled. Waiting for manual resume.');
    return;
  }

  this.stopTimers();
  this.consecutive429Count = 0;
  this.transitionTo('resuming');

  try {
    if (this.onResumePipeline) {
      await this.onResumePipeline();
    }
    this.transitionTo('running');
  } catch (err: any) {
    console.error('[QuotaBackoff] Resume failed:', err);
    // Reset the manager so it's clean for the next attempt.
    // The pipeline's own catch block will set status to 'error'.
    this.state = 'running';
    this.consecutive429Count = 0;
    this.nextResetTime = null;
    this.notify();
  }
}
```

**`computeNextResetTime(): Date | null`**
```typescript
private computeNextResetTime(): Date | null {
  if (!this.config.firstResetTime) return null;

  const match = this.config.firstResetTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const now = new Date(this.clock.now());
  const baseToday = new Date(now);
  baseToday.setHours(hours, minutes, 0, 0);

  // Use absolute millisecond offsets for cycle computation to avoid DST issues.
  // "5 hours" means exactly 18_000_000ms, not "add 5 to the hour field".
  const CYCLE_MS = 5 * 60 * 60 * 1000; // 5 hours in ms

  const candidates: Date[] = [];

  if (this.config.cyclicResetEnabled) {
    // Generate all cycle points for a 30-hour window (covers today + wrap into tomorrow)
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

  // Find earliest candidate that is in the future (with 30s grace to avoid
  // edge case where reset time is "right now" and we'd resume into an
  // exhausted window)
  const GRACE_MS = 30_000;
  const futureResets = candidates
    .filter(c => c.getTime() > now.getTime() + GRACE_MS)
    .sort((a, b) => a.getTime() - b.getTime());

  return futureResets[0] ?? null;
}
```

**`isPaused(): boolean`**
```typescript
isPaused(): boolean {
  return this.state !== 'running';
}
```

**`transitionTo(newState): void`**
```typescript
private transitionTo(newState: QuotaBackoffState): void {
  const validTransitions: Record<QuotaBackoffState, QuotaBackoffState[]> = {
    'running':  ['saving'],
    'saving':   ['paused'],
    'paused':   ['resuming', 'running'],  // 'running' via reset()/cancel
    'resuming': ['running'],
  };
  if (!validTransitions[this.state]?.includes(newState)) {
    console.warn(`[QuotaBackoff] Invalid transition ${this.state} → ${newState}, ignoring.`);
    return;
  }
  console.log(`[QuotaBackoff] ${this.state} → ${newState}`);
  this.state = newState;
  this.notify();
}
```

**`reset(): void`**
```typescript
reset(): void {
  this.stopTimers();
  this.state = 'running'; // Direct assignment (bypasses transition validation for reset)
  this.consecutive429Count = 0;
  this.nextResetTime = null;
  this.savedFilename = null;
  this.notify();
}
```

**`fullReset(): void`**
```typescript
fullReset(): void {
  this.reset();
  this.cycleCount = 0;
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

/**
 * Mount the countdown UI and subscribe to the manager.
 * Returns an unsubscribe/cleanup function that MUST be called on
 * module teardown (SPA navigation) to remove the DOM element.
 */
export function mountQuotaCountdownUI(): () => void;
export function unmountQuotaCountdownUI(): void;

// ── Internal ──

function createOverlayElement(): HTMLDivElement;

/**
 * Formats milliseconds into "Xh Ym Zs" string.
 * Returns "0s" for zero or negative values (never shows negative durations).
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
  <div class="quota-countdown-cycle" style="font-size: 12px; color: var(--text-muted, #888);">
    Pause cycle 1 of 5
  </div>
  <div class="quota-countdown-saved" style="font-size: 12px; color: var(--text-muted, #888);">
    Session saved: deepthink-quota-pause-2026-03-22T14-30-00.json
  </div>
  <div class="quota-countdown-no-reset" style="font-size: 12px; color: var(--text-error, #ef4444); display: none;">
    No reset time configured. Set one in Config → Quota Backoff, or click Resume now.
  </div>
  <div class="quota-countdown-buttons" style="margin-top: 8px; display: flex; gap: 8px;">
    <button class="quota-countdown-resume-now" style="font-size: 12px; cursor: pointer;">
      Resume now
    </button>
    <button class="quota-countdown-cancel" style="font-size: 12px; cursor: pointer;">
      Cancel & stop pipeline
    </button>
  </div>
</div>
```

**Display logic:**
- Overlay is shown when `snapshot.state === 'paused'`.
- Overlay shows "Saving session..." during `snapshot.state === 'saving'`.
- Overlay shows "Resuming pipeline..." during `snapshot.state === 'resuming'`.
- Overlay is hidden when `snapshot.state === 'running'`.
- When `snapshot.nextResetTime === null`, hide the timer and reset-time elements, show the "no reset time configured" warning, and make the "Resume now" button prominent.
- The "Cancel & stop pipeline" button calls `manager.reset()` and sets `currentProcess.isStopRequested = true`.
- The "Resume now" button calls `manager.triggerResume()` directly (bypasses countdown), allowing manual resume before the timer expires or when no reset time is configured.

### 3. New Error Class in `Deepthink/DeepthinkCore.ts`

Add after `PipelineStopRequestedError` (line ~217):

```typescript
/**
 * Thrown when the QuotaBackoffManager transitions to 'paused'.
 * Caught at the top-level pipeline try/catch to halt execution
 * without marking the pipeline as permanently errored.
 *
 * PROPAGATION: This error must propagate through all inner try/catch blocks
 * (trackA, trackB, individual agent catches). All inner catches that re-throw
 * PipelineStopRequestedError must also re-throw PipelineQuotaPausedError.
 */
export class PipelineQuotaPausedError extends Error {
  constructor(message: string = 'Pipeline paused due to quota exceeded') {
    super(message);
    this.name = 'PipelineQuotaPausedError';
  }
}
```

### 4. Modifications to `makeDeepthinkApiCall()` in `DeepthinkCore.ts`

**Location:** The function starting at line ~600.

**Change A — Add `isPaused()` check at top of retry loop** (line ~612, after the stop-requested check):

```typescript
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (currentProcess.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDescription}`);

    // ── Quota pause check ──
    // If another concurrent API call has already triggered the pause,
    // throw immediately instead of making a doomed request.
    if (getQuotaBackoffManager().isPaused()) {
      throw new PipelineQuotaPausedError();
    }
```

**Change B — Add 429 detection inside catch block** (line ~648). Insert at the **top** of the catch, before the existing `if (attempt === MAX_RETRIES)` check:

```typescript
} catch (error: any) {
    // ── Propagate pause/stop errors without retry ──
    if (error instanceof PipelineQuotaPausedError) throw error;
    if (error instanceof PipelineStopRequestedError) throw error;

    // ── 429 Quota Detection ──
    // Check for HTTP 429 (model_cooldown) from cliproxyapi.
    // error.status is set by the Anthropic SDK's RateLimitError.
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
    }
    // NOTE: Do NOT call recordSuccess() on non-429 errors.
    // A network error between two 429s should not reset the consecutive counter —
    // the quota is still exhausted regardless of other error types.

    if (attempt === MAX_RETRIES) {
      throw error;
    } else {
      // ... existing retry logic unchanged ...
    }
}
```

**Change C — Add `recordSuccess()` call after successful response** (line ~643, after the `break`):

```typescript
if (responseText && responseText.trim() !== "") {
    getQuotaBackoffManager().recordSuccess();
    break;
}
```

### 5. Modifications to inner `catch` blocks that must propagate `PipelineQuotaPausedError`

The pipeline has several inner `try/catch` blocks that catch errors from API calls and either swallow them or re-throw selectively. These must propagate `PipelineQuotaPausedError`:

**Location 1 — Track B hypothesis catch** (line ~782):
```typescript
} catch (error: any) {
    if (error instanceof PipelineQuotaPausedError) throw error;  // ← ADD
    if (!(error instanceof PipelineStopRequestedError)) {
        currentProcess.hypothesisGenStatus = 'error';
        currentProcess.hypothesisGenError = `Hypothesis exploration failed: ${error.message}`;
        render();
    }
    throw error;
}
```

**Location 2 — Track A self-improvement outer catch** (line ~2142):
```typescript
} catch (error: any) {
    if (error instanceof PipelineQuotaPausedError) throw error;  // ← ADD
    if (!(error instanceof PipelineStopRequestedError)) {
        // ... existing error handling ...
    }
}
```

**Location 3 — Individual agent error catches within `Promise.allSettled`** (e.g., correction promises at line ~2710):

These are inside `.catch()` handlers within promises passed to `Promise.allSettled`. Since `allSettled` swallows rejections (reporting them as `{status: 'rejected'}`), we must check for quota pause AFTER `allSettled` returns:

```typescript
await Promise.allSettled(correctionPromises);

// Check if any correction triggered a quota pause.
// Promise.allSettled doesn't propagate rejections, so we check explicitly.
if (getQuotaBackoffManager().isPaused()) {
    throw new PipelineQuotaPausedError();
}

console.log(`[Resume] All corrections completed for iteration ${iterNum}`);
```

This pattern must be applied at **every** `Promise.allSettled` call site in the pipeline.

**Location 4 — Final judging catch** (line ~2220):
```typescript
} catch (e: any) {
    if (e instanceof PipelineQuotaPausedError) throw e;  // ← ADD
    currentProcess.finalJudgingStatus = 'error';
    currentProcess.finalJudgingError = e.message || "Failed to perform final judging.";
}
```

### 6. Modifications to the top-level pipeline `catch` in `DeepthinkCore.ts`

**Location:** The outer `try/catch` in `startDeepthinkAnalysisProcess()` (line ~2229) and in `resumeSolutionPoolIterations()` (line ~2756).

Add handling for `PipelineQuotaPausedError` before the generic error handler:

```typescript
} catch (error: any) {
    if (error instanceof PipelineQuotaPausedError) {
        // Do NOT mark pipeline as failed. State is preserved for resume.
        console.log('[Deepthink] Pipeline paused for quota reset. State saved.');
        // Pipeline status stays 'processing'; overlay shows countdown.
        // Auto-resume is handled by QuotaBackoffManager.
        // Do NOT call deps.updateControlsState({ isGenerating: false }) here —
        // the pipeline is paused, not finished.
        return;
    }
    if (error instanceof PipelineStopRequestedError) {
        currentProcess.status = 'stopped';
    } else {
        currentProcess.status = 'error';
        currentProcess.error = error.message;
    }
    render();
} finally {
    // Only clear isGenerating if pipeline is NOT paused.
    // If paused, the pipeline will resume later and needs isGenerating=true.
    if (!getQuotaBackoffManager().isPaused()) {
        deps.updateControlsState({ isGenerating: false });
    }
}
```

### 7. Apply the same pattern to `makeResumedApiCall()` in `resumeSolutionPoolIterations()`

The resumed API call function (line ~2325) has its own retry loop. Apply the identical changes:

- Add `isPaused()` check at top of retry loop (line ~2337)
- Add 429 detection + `PipelineQuotaPausedError` throw in catch block (line ~2362)
- Re-throw `PipelineQuotaPausedError` and `PipelineStopRequestedError` immediately in catch (before retry logic)
- Add `recordSuccess()` after successful response (line ~2360)
- Do NOT call `recordSuccess()` on non-429 errors

### 8. Apply the same pattern to `runFinalJudge()` retry loop

The `runFinalJudge()` function (line ~2815) has its own independent retry loop. Apply the identical 429 detection pattern:

```typescript
// Inside runFinalJudge(), at top of retry loop (line ~2815):
for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // ← ADD: isPaused check
    if (getQuotaBackoffManager().isPaused()) {
        throw new PipelineQuotaPausedError();
    }

    try {
        // ... existing code ...
        responseText = response.text || "";
        if (responseText && responseText.trim() !== "") {
            getQuotaBackoffManager().recordSuccess();  // ← ADD
            break;
        }
        throw new Error("Empty response from API");
    } catch (error: any) {
        if (error instanceof PipelineQuotaPausedError) throw error;  // ← ADD

        const is429 = error?.status === 429
          || error?.error?.type === 'model_cooldown'
          || (error?.message && /429|rate.?limit|model_cooldown/i.test(error.message));

        if (is429) {
          const manager = getQuotaBackoffManager();
          const shouldPause = manager.recordQuotaError();
          if (shouldPause) {
            throw new PipelineQuotaPausedError();
          }
        }

        if (attempt === MAX_RETRIES) throw error;
        const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt);
        console.error(`[Resume] Final Judge failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${delay / 1000}s...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}
```

### 9. Fix `makeDeepthinkApiCallWithTimeout` and `makeResumedApiCallWithTimeout` timeout cleanup

Both timeout wrappers (line ~1554 and ~2382) use `Promise.race` with a `setTimeout`. When the API call throws `PipelineQuotaPausedError` (or any error), the timeout `Promise`'s `setTimeout` is never cleared, creating a dangling timer that will fire later and produce an unhandled rejection.

**Fix:** Clean up the timeout in all exit paths:

```typescript
const makeDeepthinkApiCallWithTimeout = async (
    parts: Part[], systemInstruction: string, isJson: boolean,
    stepDescription: string, targetStatusField: any, retryAttemptField: any
): Promise<string> => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<string>((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error(`Timeout after ${STRUCTURED_SOLUTION_POOL_TIMEOUT_MS / 1000 / 60} minutes`)),
            STRUCTURED_SOLUTION_POOL_TIMEOUT_MS
        );
    });

    try {
        const result = await Promise.race([
            makeDeepthinkApiCall(parts, systemInstruction, isJson, stepDescription, targetStatusField, retryAttemptField),
            timeoutPromise,
        ]);
        clearTimeout(timeoutId!);
        return result;
    } catch (error) {
        clearTimeout(timeoutId!);
        throw error;
    }
};
```

Apply the identical fix to `makeResumedApiCallWithTimeout` (line ~2382).

### 10. Modifications to `DeepthinkSession.ts`

Add two new exports:

```typescript
/**
 * Programmatically save session to a file with a specific filename.
 * Uses the same buildSessionFile() logic but triggers a browser download
 * with the given filename (no file picker dialog).
 *
 * Used by QuotaBackoffManager for auto-save on quota exceeded.
 *
 * NOTE: The <a download> click trick may be blocked by some browsers if
 * there is no recent user gesture. As a fallback, we always save to
 * localStorage first (which is synchronous and reliable), and the file
 * download is best-effort.
 */
export async function saveSessionToFileAutomatic(filename: string): Promise<void> {
    // Always save to localStorage first (reliable, no user gesture needed)
    saveToLocalStorageImmediate();

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

    // Delay revokeObjectURL so the browser has time to start the download.
    // The click() triggers an async download; revoking immediately can cancel it.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Immediately flush session state to localStorage (bypasses 2s debounce).
 * Used before quota pause to ensure state is persisted synchronously.
 */
export function saveToLocalStorageImmediate(): void {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    saveToLocalStorage();
}
```

### 11. Modifications to `Routing/DeepthinkConfigController.ts`

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
    /** Quota backoff: max pause/resume cycles per session */
    quotaMaxCyclesPerSession: number;
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

public getQuotaMaxCyclesPerSession(): number {
    return this.modelConfig.getParameter('quotaMaxCyclesPerSession') ?? 5;
}

// ── Quota Backoff Setters ──

public setQuotaResetTime(time: string): void {
    // Validate HH:MM format and hour/minute ranges
    if (time) {
        const match = time.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return;
        const h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h < 0 || h > 23 || m < 0 || m > 59) return;
    }
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

public setQuotaMaxCyclesPerSession(max: number): void {
    const clamped = Math.max(1, Math.min(max, 20));
    this.modelConfig.updateParameter('quotaMaxCyclesPerSession', clamped);
    this.syncQuotaBackoffConfig();
    this.emitChange('quotaMaxCyclesPerSession');
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
        maxCyclesPerSession: this.getQuotaMaxCyclesPerSession(),
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
        quotaMaxCyclesPerSession: params.quotaMaxCyclesPerSession ?? 5,
    };
}
```

### 12. Modifications to `Routing/ModelConfig.ts`

Add the following parameter fields to the parameters interface/defaults:

```typescript
// In the parameters interface (exact name depends on existing code):
quotaResetTime: string;                // default: ''
quotaCyclicResetEnabled: boolean;      // default: true
quotaConsecutive429Threshold: number;  // default: 2
quotaAutoResumeEnabled: boolean;       // default: true
quotaMaxCyclesPerSession: number;      // default: 5
```

These are persisted alongside existing parameters via the same localStorage mechanism.

### 13. Modifications to `DeepthinkConfigPanel.tsx`

Add a new `QuotaBackoffSection` component and wire it into `DeepthinkConfigPanelComponent`.

Add to `DeepthinkConfigPanelProps`:

```typescript
export interface DeepthinkConfigPanelProps {
    // ... existing fields ...

    quotaResetTime: string;
    quotaCyclicResetEnabled: boolean;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;
    quotaMaxCyclesPerSession: number;

    onQuotaResetTimeChange: (time: string) => void;
    onQuotaCyclicResetToggle: (enabled: boolean) => void;
    onQuotaConsecutive429ThresholdChange: (threshold: number) => void;
    onQuotaAutoResumeToggle: (enabled: boolean) => void;
    onQuotaMaxCyclesPerSessionChange: (max: number) => void;
}
```

New section component:

```tsx
const QuotaBackoffSection: React.FC<{
    quotaResetTime: string;
    quotaCyclicResetEnabled: boolean;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;
    quotaMaxCyclesPerSession: number;
    onQuotaResetTimeChange: (time: string) => void;
    onQuotaCyclicResetToggle: (enabled: boolean) => void;
    onQuotaConsecutive429ThresholdChange: (threshold: number) => void;
    onQuotaAutoResumeToggle: (enabled: boolean) => void;
    onQuotaMaxCyclesPerSessionChange: (max: number) => void;
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
                <span className="input-hint">
                    Leave empty to disable auto-resume (pause + save still works).
                </span>
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

            {/* Max cycles slider */}
            <div className="input-group-tight">
                <label htmlFor="dt-quota-max-cycles-slider" className="input-label">
                    Max pause/resume cycles: <span>{props.quotaMaxCyclesPerSession}</span>
                </label>
                <SliderWithFill
                    id="dt-quota-max-cycles-slider"
                    value={props.quotaMaxCyclesPerSession}
                    min={1}
                    max={20}
                    color="#f59e0b"
                    onChange={props.onQuotaMaxCyclesPerSessionChange}
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
            quotaMaxCyclesPerSession={props.quotaMaxCyclesPerSession}
            onQuotaResetTimeChange={props.onQuotaResetTimeChange}
            onQuotaCyclicResetToggle={props.onQuotaCyclicResetToggle}
            onQuotaConsecutive429ThresholdChange={props.onQuotaConsecutive429ThresholdChange}
            onQuotaAutoResumeToggle={props.onQuotaAutoResumeToggle}
            onQuotaMaxCyclesPerSessionChange={props.onQuotaMaxCyclesPerSessionChange}
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
        onQuotaMaxCyclesPerSessionChange: v => controller.setQuotaMaxCyclesPerSession(v),
    };
}
```

### 14. Modifications to `Deepthink/Deepthink.ts`

Wire up the `QuotaBackoffManager` singleton with save/resume callbacks:

```typescript
import {
    initQuotaBackoffManager,
    getQuotaBackoffManager,
} from './QuotaBackoffManager';
import { mountQuotaCountdownUI } from './QuotaCountdownUI';
import { saveSessionToFileAutomatic } from './DeepthinkSession';

// Track cleanup for SPA navigation
let quotaUICleanup: (() => void) | null = null;

// Initialize during module setup (called from initializeDeepthinkCore or app bootstrap):
export function initQuotaBackoff(): void {
    const manager = initQuotaBackoffManager();

    manager.setCallbacks({
        onSaveSession: async (filename: string) => {
            await saveSessionToFileAutomatic(filename);
        },
        onResumePipeline: async () => {
            const pipeline = getActiveDeepthinkPipeline();
            if (!pipeline) {
                console.error('[QuotaBackoff] No active pipeline to resume.');
                return;
            }

            // Auto-resume only works for the iterative corrections phase.
            // If the pipeline hasn't reached iterations yet, log a warning.
            const hasIterations = pipeline.initialStrategies.some(s =>
                s.subStrategies[0] && (s.subStrategies[0] as any).iterativeCorrections
            );
            if (!hasIterations) {
                console.warn('[QuotaBackoff] Auto-resume is only supported during the iterative corrections phase. The saved session can be manually resumed after quota resets.');
                return;
            }

            const depth = deps.getIterativeDepth();
            await resumeSolutionPoolIterations(depth);
        },
    });

    // Mount the floating countdown UI; save cleanup function
    quotaUICleanup = mountQuotaCountdownUI();
}

// Call on module teardown (SPA navigation away from Deepthink)
export function cleanupQuotaBackoff(): void {
    if (quotaUICleanup) {
        quotaUICleanup();
        quotaUICleanup = null;
    }
}

// Expose for debugging (read-only snapshot, no mutation surface)
if (typeof window !== 'undefined') {
    (window as any).__deepthinkQuota = () => getQuotaBackoffManager().getSnapshot();
}
```

### 15. Reset `QuotaBackoffManager` on new pipeline start

In `startDeepthinkAnalysisProcess()` (line ~550, near the beginning of the function), add:

```typescript
// Reset quota backoff state from any previous pipeline run
getQuotaBackoffManager().fullReset();
```

This ensures a fresh counter and cycle count for each new pipeline, and prevents stale pause state from a previous run from interfering.

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

export class FakeClock implements QuotaClock {
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
     * Fires timers in chronological order. Interval timers re-arm automatically.
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

    /**
     * Advance time and flush all microtasks between timer firings.
     * Use this when timer callbacks trigger async operations (onSaveSession,
     * onResumePipeline). Without this, Promise.resolve() flushes in tests
     * may not catch all microtask queue entries.
     */
    async advanceAsync(ms: number): Promise<void> {
        const targetTime = this._now + ms;
        while (this._now < targetTime) {
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
            // Flush microtask queue (Promise callbacks, then chains)
            await new Promise(resolve => resolve(undefined));
            await new Promise(resolve => resolve(undefined));
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
        expect(mgr.recordQuotaError()).toBe(true);  // 3/3 → saving
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

    test('non-429 errors do NOT reset consecutive count (recordSuccess not called)', () => {
        // Validates the design: only actual successful responses reset the counter.
        // A network timeout between two 429s should not reset it.
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 2 }, clock);
        mgr.recordQuotaError(); // 1/2
        // Simulate non-429 error: we do NOT call recordSuccess()
        // (matching the actual catch block behavior)
        expect(mgr.getSnapshot().consecutive429Count).toBe(1);
        expect(mgr.recordQuotaError()).toBe(true); // 2/2 → triggers pause
    });

    // ── Re-entrancy Safety ──

    test('concurrent recordQuotaError calls only trigger one save', () => {
        const clock = new FakeClock();
        let saveCount = 0;
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({
            onSaveSession: async () => { saveCount++; },
            onResumePipeline: async () => {},
        });

        // Simulate 3 concurrent API calls all hitting 429 at the same time
        const r1 = mgr.recordQuotaError(); // triggers transition to 'saving'
        const r2 = mgr.recordQuotaError(); // state is already 'saving', returns true
        const r3 = mgr.recordQuotaError(); // state is already 'saving', returns true

        expect(r1).toBe(true);
        expect(r2).toBe(true); // concurrent caller told to throw
        expect(r3).toBe(true); // concurrent caller told to throw
        expect(saveCount).toBe(1); // Only one save triggered
    });

    test('recordQuotaError returns true when already paused (for late-arriving concurrent calls)', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError(); // transition to saving
        // Simulate: by now the manager has transitioned to 'paused' (async save resolved)
        // A late-arriving call should still return true
        expect(mgr.recordQuotaError()).toBe(true);
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
        await Promise.resolve(); // flush then() chain
        expect(states).toContain('paused');

        // Advance clock past reset time
        await clock.advanceAsync(31 * 60 * 1000); // 31 minutes to 10:31
        expect(states).toContain('resuming');

        resumeResolve!();
        await Promise.resolve();
        await Promise.resolve();
        expect(states).toContain('running');
    });

    test('invalid state transitions are ignored with warning', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 100 }, clock);
        // Manager is in 'running' state. Can't go directly to 'paused'.
        // Since transitionTo is private, we test indirectly via reset()
        // which uses direct assignment (bypasses validation).
        mgr.reset();
        expect(mgr.getSnapshot().state).toBe('running');
    });

    // ── Countdown Math ──

    test('computeNextResetTime returns nearest future 5h-cycle reset', () => {
        // Clock at 10:00, first reset at 05:00 → cycles: 05:00, 10:00, 15:00, 20:00, 01:00
        // 10:00 is "now" with 30s grace → skipped. Nearest future is 15:00
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '05:00', cyclicResetEnabled: true, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        const snap = mgr.getSnapshot();
        expect(snap.nextResetTime?.getHours()).toBe(15);
        expect(snap.nextResetTime?.getMinutes()).toBe(0);
    });

    test('computeNextResetTime handles edge case: reset time is right now (30s grace)', () => {
        // Clock at exactly 10:00:00, first reset at 10:00.
        // 30s grace should skip 10:00 and pick 15:00 (next cycle).
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '10:00', cyclicResetEnabled: true, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        const snap = mgr.getSnapshot();
        expect(snap.nextResetTime?.getHours()).toBe(15);
    });

    test('computeNextResetTime wraps to next day when all today\'s resets are past', () => {
        // Clock at 23:30, first reset at 05:00. Cycles: 05, 10, 15, 20 — all past.
        // 05:00+20h=01:00 next day, 05:00+25h=06:00 next day. Nearest future = 01:00.
        const clock = new FakeClock(Date.parse('2026-03-22T23:30:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '05:00', cyclicResetEnabled: true, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        const snap = mgr.getSnapshot();
        expect(snap.nextResetTime).not.toBeNull();
        expect(snap.nextResetTime!.getTime()).toBeGreaterThan(clock.now());
    });

    test('computeNextResetTime returns null when firstResetTime is empty', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '', consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        const snap = mgr.getSnapshot();
        expect(snap.nextResetTime).toBeNull();
    });

    test('computeNextResetTime rejects invalid time formats', () => {
        for (const badTime of ['25:00', '-1:00', '12:60', 'abc', '12', '1230']) {
            const clock = new FakeClock();
            const mgr = new QuotaBackoffManager(
                { firstResetTime: badTime, consecutive429Threshold: 1 },
                clock,
            );
            mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
            mgr.recordQuotaError();
            expect(mgr.getSnapshot().nextResetTime).toBeNull();
            mgr.reset();
        }
    });

    test('non-cyclic mode picks today if in future, else tomorrow', () => {
        // Clock at 10:00, firstResetTime: 15:00, cyclic disabled → today 15:00
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '15:00', cyclicResetEnabled: false, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        expect(mgr.getSnapshot().nextResetTime?.getHours()).toBe(15);
        expect(mgr.getSnapshot().nextResetTime?.getDate()).toBe(22); // today
    });

    test('msUntilReset decrements as clock advances', () => {
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '15:00', cyclicResetEnabled: false, consecutive429Threshold: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
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

    test('save failure does not prevent pausing', async () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({
            onSaveSession: async () => { throw new Error('Disk full'); },
            onResumePipeline: async () => {},
        });
        mgr.recordQuotaError();
        await Promise.resolve();
        await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');
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
        await Promise.resolve(); // paused transition

        // Advance 10 minutes (past 14:59)
        await clock.advanceAsync(10 * 60 * 1000);
        expect(resumed).toBe(true);
        expect(mgr.getSnapshot().state).toBe('running');
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
        await Promise.resolve();
        await clock.advanceAsync(10 * 60 * 1000);
        expect(resumed).toBe(false);
        expect(mgr.getSnapshot().state).toBe('paused'); // stays paused
    });

    test('resume failure resets manager state cleanly', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '14:59', cyclicResetEnabled: false, consecutive429Threshold: 1, autoResumeEnabled: true },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { throw new Error('Resume exploded'); },
        });
        mgr.recordQuotaError();
        await Promise.resolve();
        await Promise.resolve();
        await clock.advanceAsync(10 * 60 * 1000);
        // Manager should be back to running (reset), not stuck in 'resuming'
        expect(mgr.getSnapshot().state).toBe('running');
        expect(mgr.getSnapshot().consecutive429Count).toBe(0);
    });

    // ── Max Cycles ──

    test('recordQuotaError returns false after maxCyclesPerSession reached', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager(
            { consecutive429Threshold: 1, maxCyclesPerSession: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });

        // First cycle
        expect(mgr.recordQuotaError()).toBe(true); // cycle 1 of 1
        mgr.reset(); // simulate resume completing

        // Second attempt — should be blocked by maxCycles
        expect(mgr.recordQuotaError()).toBe(false); // cycle limit reached
    });

    test('fullReset() clears cycleCount', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager(
            { consecutive429Threshold: 1, maxCyclesPerSession: 1 },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError(); // cycle 1
        mgr.fullReset(); // new pipeline
        expect(mgr.recordQuotaError()).toBe(true); // cycle count was reset
    });

    // ── Reset ──

    test('reset() returns to running and clears counters but preserves cycleCount', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        mgr.reset();
        const snap = mgr.getSnapshot();
        expect(snap.state).toBe('running');
        expect(snap.consecutive429Count).toBe(0);
        expect(snap.nextResetTime).toBeNull();
        expect(snap.cycleCount).toBe(1); // preserved
    });

    test('reset() stops active countdown timers', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        let resumed = false;
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '14:59', consecutive429Threshold: 1, autoResumeEnabled: true },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { resumed = true; },
        });
        mgr.recordQuotaError();
        await Promise.resolve();
        await Promise.resolve();
        // Reset before countdown fires
        mgr.reset();
        await clock.advanceAsync(20 * 60 * 1000); // advance well past 14:59
        expect(resumed).toBe(false); // timer was cancelled
    });

    // ── isPaused ──

    test('isPaused returns true for saving, paused, and resuming states', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        expect(mgr.isPaused()).toBe(false); // running
        mgr.recordQuotaError();
        expect(mgr.isPaused()).toBe(true); // saving
    });

    test('isPaused returns false after reset', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        expect(mgr.isPaused()).toBe(true);
        mgr.reset();
        expect(mgr.isPaused()).toBe(false);
    });

    // ── No reset time configured ──

    test('pauses without auto-resume when firstResetTime is empty', async () => {
        const clock = new FakeClock();
        let resumed = false;
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '', consecutive429Threshold: 1, autoResumeEnabled: true },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { resumed = true; },
        });
        mgr.recordQuotaError();
        await Promise.resolve();
        await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');
        expect(mgr.getSnapshot().nextResetTime).toBeNull();
        // Advance time — should NOT auto-resume (no reset time)
        await clock.advanceAsync(10 * 60 * 60 * 1000); // 10 hours
        expect(resumed).toBe(false);
        expect(mgr.getSnapshot().state).toBe('paused'); // still paused, manual resume needed
    });
});
```

### Test File: `Deepthink/QuotaBackoffIntegration.test.ts`

End-to-end test that simulates a short pipeline with injected 429 failures.

```typescript
import { FakeClock } from './QuotaBackoffManager.test';
import { QuotaBackoffManager } from './QuotaBackoffManager';

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
                maxCyclesPerSession: 5,
            },
            clock,
        );

        mgr.setCallbacks({
            onSaveSession: async () => { saveCount++; },
            onResumePipeline: async () => {
                resumeCount++;
                // Simulate resumed pipeline making successful calls
                mgr.recordSuccess();
                mgr.recordSuccess();
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
        await Promise.resolve(); // paused transition

        expect(saveCount).toBe(1);
        expect(mgr.getSnapshot().state).toBe('paused');

        // Advance clock past 14:59
        await clock.advanceAsync(10 * 60 * 1000);

        expect(resumeCount).toBe(1);
        expect(pipelineCompleted).toBe(true);
        expect(mgr.getSnapshot().state).toBe('running');
    });

    /**
     * Simulates concurrent 429s from Track A and Track B hitting at the same time.
     * Ensures only one save is triggered and all callers are told to throw.
     */
    test('concurrent 429s from multiple tracks only trigger one save', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        let saveCount = 0;

        const mgr = new QuotaBackoffManager(
            {
                firstResetTime: '14:59',
                consecutive429Threshold: 2,
                autoResumeEnabled: true,
            },
            clock,
        );

        mgr.setCallbacks({
            onSaveSession: async () => { saveCount++; },
            onResumePipeline: async () => {},
        });

        // First 429 from Track A
        mgr.recordQuotaError(); // 1/2

        // Second 429 from Track A — triggers pause
        const r1 = mgr.recordQuotaError(); // 2/2

        // Meanwhile, Track B also gets 429 (concurrent, state already 'saving')
        const r2 = mgr.recordQuotaError();

        // Another concurrent call from Promise.allSettled correction
        const r3 = mgr.recordQuotaError();

        expect(r1).toBe(true);
        expect(r2).toBe(true); // told to throw PipelineQuotaPausedError
        expect(r3).toBe(true); // told to throw PipelineQuotaPausedError
        expect(saveCount).toBe(1); // Only one save triggered
    });

    /**
     * Simulates double pause/resume cycle (quota hit twice in one session).
     */
    test('second quota hit after resume triggers second pause/resume cycle', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T09:50:00'));
        let resumeCount = 0;

        const mgr = new QuotaBackoffManager(
            {
                firstResetTime: '10:00',
                cyclicResetEnabled: true,
                consecutive429Threshold: 1,
                autoResumeEnabled: true,
                maxCyclesPerSession: 5,
            },
            clock,
        );

        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => {
                resumeCount++;
                mgr.recordSuccess(); // reset counter after resume
            },
        });

        // First pause/resume cycle
        mgr.recordQuotaError();
        await Promise.resolve();
        await Promise.resolve();
        await clock.advanceAsync(11 * 60 * 1000); // past 10:00
        expect(resumeCount).toBe(1);
        expect(mgr.getSnapshot().state).toBe('running');

        // Second quota hit — next cycle reset at 15:00
        mgr.recordQuotaError();
        await Promise.resolve();
        await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');
        expect(mgr.getSnapshot().cycleCount).toBe(2);
    });

    /**
     * Edge case: isPaused() check in retry loop prevents doomed API calls.
     */
    test('isPaused check prevents API calls after another track triggers pause', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });

        // Track A triggers pause
        mgr.recordQuotaError();
        expect(mgr.isPaused()).toBe(true);

        // Track B checks isPaused before making an API call
        // (this is the check at the top of the retry loop)
        expect(mgr.isPaused()).toBe(true); // should throw PipelineQuotaPausedError
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

- **No breaking changes.** All new config fields have defaults (`quotaResetTime: ''`, `quotaCyclicResetEnabled: true`, `quotaConsecutive429Threshold: 2`, `quotaAutoResumeEnabled: true`, `quotaMaxCyclesPerSession: 5`).
- When `quotaResetTime` is empty string (default), `computeNextResetTime()` returns `null`. The manager still pauses to save state (protecting against data loss), but shows "No reset time configured" in the overlay and requires manual resume via the "Resume now" button.
- The `DeepthinkSessionFile` interface is **not** modified. Session files saved before this feature load and work identically.
- `PipelineQuotaPausedError` is caught before the generic error handler, so existing error handling paths are unaffected.

### Migration

- **No data migration required.** New config fields are read from `ModelConfig` with fallback defaults.
- Existing localStorage auto-saves do not contain quota state and do not need to.
- The `QuotaBackoffManager` state is ephemeral (in-memory only) and resets on page reload. (The session file saved before pause can be manually loaded to resume after a page reload.)

### Config Defaults

| Field | Default | Rationale |
|-------|---------|-----------|
| `quotaResetTime` | `''` (empty) | Feature is opt-in for auto-resume. Pause + save triggers automatically on 429s even without configuration, to protect against data loss. |
| `quotaCyclicResetEnabled` | `true` | Claude API quotas always reset on 5h cycles, so this is the expected mode. |
| `quotaConsecutive429Threshold` | `2` | A single transient 429 could be a fluke; 2 consecutive confirms quota exhaustion. |
| `quotaAutoResumeEnabled` | `true` | The whole point of the feature is unattended operation. |
| `quotaMaxCyclesPerSession` | `5` | Prevents infinite pause/resume loops if the reset time is misconfigured. 5 cycles = up to 25 hours of coverage. |

### Feature Flag

No feature flag needed. The 429 detection and pause/save behavior is always active once deployed — it protects against data loss even without configuration. Auto-resume requires `quotaResetTime` to be set. Setting `quotaResetTime` back to empty disables auto-resume but keeps the protective pause/save.

## Resolved Design Decisions

### 1. Browser tab sleep/throttle

**Decision:** Accept up to 60s delay for auto-resume in background tabs. Use a single `setTimeout` for the resume trigger rather than relying on `setInterval` accuracy. The `setInterval` is used only for UI updates and can be throttled without consequence. 60s delay on a 5-hour wait is < 0.3% timing error and is acceptable.

**Not using Web Worker** because: the countdown is non-critical (negligible delay relative to wait time), and adding a Worker increases complexity with messaging, build config, and CSP issues.

### 2. Multiple quota resets in one session (infinite loop prevention)

**Decision:** Allow up to `maxCyclesPerSession` (default 5) pause/resume cycles. After that, `recordQuotaError()` returns `false` and lets the normal retry logic handle it (which will eventually exhaust retries and fail). This prevents infinite loops from misconfigured reset times. The cycle count is displayed in the countdown UI. `fullReset()` clears the cycle count when a new pipeline starts.

### 3. Save mechanism

**Decision:** Primary save target is **localStorage** (synchronous, reliable, no user gesture needed). Secondary save is a file download via `<a download>` (best-effort, may be blocked in background tabs or without user gesture). The `saveSessionToFileAutomatic()` function always calls `saveToLocalStorageImmediate()` first, so state is guaranteed persisted even if the file download is silently blocked.

### 4. Non-iterative pipeline phases

**Decision:** The pause/save mechanism works for **all** pipeline phases (it operates at the `makeDeepthinkApiCall` level, which is used everywhere). Auto-resume only restores into the **iteration loop** via `resumeSolutionPoolIterations()`.

If quota is exceeded during strategy generation or hypothesis testing (before iterations start), the pipeline pauses and saves state, but:
- The `onResumePipeline` callback detects this case and logs a warning.
- The countdown UI still shows, with a "Resume now" button for manual resume.
- The user can manually resume by loading the saved session file after the quota resets.

**Future work:** A more general resume mechanism that can restart from any phase checkpoint would address this limitation.

### 5. Page reload during pause

**Decision:** Quota pause state is **not** persisted across page reloads. If the user refreshes during a pause:
1. The session was already auto-saved to localStorage (synchronous, before pause).
2. On reload, `loadSessionFromLocalStorage()` can restore the pipeline state.
3. The user must manually trigger resume (the quota backoff manager resets on reload).

This is acceptable because page reloads during a multi-hour pipeline are exceptional, and the auto-save ensures no data is lost.

### 6. `recordSuccess()` vs non-429 errors

**Decision:** `recordSuccess()` is ONLY called on actual successful API responses, never on non-429 errors. This means a sequence like `429 → network timeout → 429` correctly counts as 2 consecutive 429s and triggers the pause. The quota is exhausted regardless of intervening network errors.

### 7. Concurrent API call handling

**Decision:** The `QuotaBackoffManager` uses a re-entrant guard: only the first call that pushes the count past the threshold while `state === 'running'` triggers the save/pause transition. All subsequent calls (from concurrent Track A, Track B, or `Promise.allSettled` corrections) see `state !== 'running'` and return `true` immediately, telling the caller to throw `PipelineQuotaPausedError`. An `isPaused()` check at the top of each retry loop prevents doomed API calls from even being attempted after another concurrent call has triggered the pause.

## Open Questions

1. **Notification** — Should we fire a browser `Notification` (requires permission) or play an audio tone when the pipeline auto-resumes, so the user knows it's running again if they've switched to another task? (Low priority — can be added as a follow-up without architectural changes.)
