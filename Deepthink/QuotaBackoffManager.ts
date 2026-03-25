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
 *
 * THREAD SAFETY NOTE:
 * JavaScript is single-threaded. "Concurrent" here means interleaved at await
 * boundaries, not parallel execution. There are no data races on the state or
 * counter fields. The re-entrant guard protects against the scenario where
 * multiple callers invoke recordQuotaError() synchronously in sequence (e.g.,
 * when multiple promises resolve in the same microtask batch).
 */

// ── Types ──

export type QuotaBackoffState = 'running' | 'saving' | 'paused' | 'resuming';

export interface QuotaBackoffConfig {
  /** Duration in hours to wait after a quota pause before auto-resuming (0 = no auto-resume) */
  backoffDurationHours: number;
  /** Whether to auto-compute subsequent resets every 5 hours (no longer used; kept for config compat) */
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
  backoffDurationHours: 0,
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

// ── Error Class ──

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
  /** Absolute target time set when the user configures the backoff duration. */
  private backoffTargetTime: Date | null = null;

  // Injected callbacks (set via setCallbacks)
  private onSaveSession: ((filename: string) => Promise<void>) | null = null;
  private onResumePipeline: (() => Promise<void>) | null = null;

  constructor(config?: Partial<QuotaBackoffConfig>, clock?: QuotaClock) {
    this.config = { ...DEFAULT_QUOTA_BACKOFF_CONFIG, ...config };
    this.clock = clock ?? REAL_CLOCK;
    if (this.config.backoffDurationHours > 0) {
      this.backoffTargetTime = new Date(this.clock.now() + this.config.backoffDurationHours * 60 * 60 * 1000);
    }
  }

  // ── Public API ──

  setCallbacks(callbacks: {
    onSaveSession: (filename: string) => Promise<void>;
    onResumePipeline: () => Promise<void>;
  }): void {
    this.onSaveSession = callbacks.onSaveSession;
    this.onResumePipeline = callbacks.onResumePipeline;
  }

  /**
   * Update config at runtime (e.g., from config panel changes).
   * If currently paused, recomputes the next reset time and restarts
   * the countdown timer with the new reset time.
   */
  updateConfig(partial: Partial<QuotaBackoffConfig>): void {
    const prevDuration = this.config.backoffDurationHours;
    this.config = { ...this.config, ...partial };

    // Recompute target time only when the duration value itself changes.
    // This preserves "X hours from when I configured it" semantics.
    if ('backoffDurationHours' in partial && partial.backoffDurationHours !== prevDuration) {
      if (this.config.backoffDurationHours > 0) {
        this.backoffTargetTime = new Date(this.clock.now() + this.config.backoffDurationHours * 60 * 60 * 1000);
      } else {
        this.backoffTargetTime = null;
      }
    }

    // If currently paused, recompute reset time and restart countdown
    // so config changes take effect immediately.
    if (this.state === 'paused') {
      const newResetTime = this.computeNextResetTime();
      if (newResetTime?.getTime() !== this.nextResetTime?.getTime()) {
        this.nextResetTime = newResetTime;
        this.startCountdown(); // restarts timers with new reset time
      }
      this.notify();
    }
  }

  getConfig(): Readonly<QuotaBackoffConfig> {
    return this.config;
  }

  /**
   * Build a snapshot of current state. msUntilReset is computed dynamically
   * from this.nextResetTime and this.clock.now() — it is NOT stored as a field.
   * Returns 0 for msUntilReset when nextResetTime is null or in the past.
   */
  getSnapshot(): QuotaBackoffSnapshot {
    const now = this.clock.now();
    const msUntilReset = this.nextResetTime
      ? Math.max(0, this.nextResetTime.getTime() - now)
      : 0;

    return {
      state: this.state,
      consecutive429Count: this.consecutive429Count,
      nextResetTime: this.nextResetTime,
      msUntilReset,
      savedFilename: this.savedFilename,
      cycleCount: this.cycleCount,
      maxCyclesPerSession: this.config.maxCyclesPerSession,
    };
  }

  subscribe(listener: QuotaBackoffListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

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
        console.error(`[QuotaBackoff] Max pause/resume cycles (${this.config.maxCyclesPerSession}) reached. Not pausing — will let normal retry logic handle (which will eventually exhaust retries and fail with data loss). This is a deliberate fail-open to prevent infinite loops from misconfigured reset times.`);
        return false;
      }

      this.cycleCount++;
      this.transitionTo('saving');

      // Compute next reset
      this.nextResetTime = this.computeNextResetTime();

      if (!this.nextResetTime) {
        console.error('[QuotaBackoff] Cannot compute next reset time (backoffDurationHours not configured). Pausing without countdown — manual resume required via overlay button.');
      }

      // Trigger async save (fire-and-forget with logging)
      const ts = new Date(this.clock.now()).toISOString().replace(/[:.]/g, '-').substring(0, 19);
      this.savedFilename = `deepthink-quota-pause-${ts}.json`;
      if (this.onSaveSession) {
        this.onSaveSession(this.savedFilename)
          .then(() => {
            // Guard: if reset() was called while save was in-flight, don't transition
            if (this.state !== 'saving') return;
            this.transitionTo('paused');
            this.startCountdown();
          })
          .catch((_err) => {
            console.error('[QuotaBackoff] Save failed, pausing anyway:', _err);
            if (this.state !== 'saving') return;
            this.transitionTo('paused');
            this.startCountdown();
          });
      } else {
        console.warn('[QuotaBackoff] No onSaveSession callback set — session will NOT be saved. Call setCallbacks() during initialization.');
        this.transitionTo('paused');
        this.startCountdown();
      }
      return true;
    }
    return false;
  }

  /**
   * Called from makeDeepthinkApiCall() on any successful API response.
   * Resets consecutive 429 counter to 0.
   * NOTE: Only call this on actual success, NOT on non-429 errors.
   */
  recordSuccess(): void {
    this.consecutive429Count = 0;
  }

  /**
   * Force-reset to 'running' state. Used when pipeline is manually stopped
   * or a new pipeline starts. Does NOT reset cycleCount (only fullReset does).
   * Stops all timers. Does NOT clear listeners (they persist across resets).
   */
  reset(): void {
    this.stopTimers();
    this.state = 'running'; // Direct assignment (bypasses transition validation for reset)
    this.consecutive429Count = 0;
    this.nextResetTime = null;
    this.savedFilename = null;
    // NOTE: listeners are NOT cleared. They persist across resets (the UI
    // listener needs to stay subscribed to show/hide the overlay).
    // NOTE: cycleCount is NOT cleared. Use fullReset() for that.
    this.notify();
  }

  /**
   * Full reset including cycleCount and backoffTargetTime. Called when a new pipeline starts.
   */
  fullReset(): void {
    this.reset();
    this.cycleCount = 0;
    this.backoffTargetTime = null;
  }

  /**
   * Returns true if the manager is in 'paused', 'saving', or 'resuming' state,
   * meaning no API calls should be attempted.
   */
  isPaused(): boolean {
    // 'resuming' means the pipeline callback is actively running — API calls
    // should proceed. Only 'saving' and 'paused' should block new API calls.
    return this.state === 'saving' || this.state === 'paused';
  }

  /**
   * Public entry point for "Resume now" button. Bypasses countdown timer
   * and triggers resume immediately. Ignores the autoResumeEnabled flag
   * (manual resume is always allowed). No-op if not in 'paused' state.
   */
  resumeNow(): void {
    if (this.state !== 'paused') {
      console.warn(`[QuotaBackoff] resumeNow called in state '${this.state}', ignoring.`);
      return;
    }

    // Manual resume — bypass autoResumeEnabled check.
    this.stopTimers();
    this.consecutive429Count = 0;
    this.transitionTo('resuming');

    const doResume = async () => {
      try {
        if (this.onResumePipeline) {
          await this.onResumePipeline();
        }
        this.transitionTo('running');
      } catch (err: unknown) {
        console.error('[QuotaBackoff] Manual resume failed:', err);
        this.state = 'running';
        this.consecutive429Count = 0;
        this.nextResetTime = null;
        this.notify();
      }
    };

    doResume().catch(err => {
      console.error('[QuotaBackoff] Unhandled error in resumeNow:', err);
    });
  }

  // ── Internal Methods ──

  /**
   * Compute the reset time. Uses the pre-stored target time (set when the user
   * configured the duration) if it is still in the future, so the countdown
   * reflects "X hours from when I set it" rather than "X hours from now".
   * Falls back to now + duration if the stored target has already passed.
   */
  private computeNextResetTime(): Date | null {
    if (!this.config.backoffDurationHours || this.config.backoffDurationHours <= 0) return null;
    const GRACE_MS = 30_000;
    const now = this.clock.now();
    if (this.backoffTargetTime && this.backoffTargetTime.getTime() > now + GRACE_MS) {
      return this.backoffTargetTime;
    }
    return new Date(now + this.config.backoffDurationHours * 60 * 60 * 1000);
  }

  /**
   * Transition state machine and notify listeners.
   */
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

  /**
   * Emit current snapshot to all listeners.
   */
  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  /**
   * Start countdown. Uses setInterval for UI updates (1s) and a single
   * setTimeout for the resume trigger.
   */
  private startCountdown(): void {
    this.stopTimers();

    // UI update interval (1s)
    this.countdownTimerId = this.clock.setInterval(() => {
      this.notify();
    }, 1000);

    if (!this.nextResetTime) return; // No reset time — manual resume only

    // Resume trigger
    const msUntilReset = this.nextResetTime.getTime() - this.clock.now();
    if (msUntilReset <= 0) {
      // Reset time already passed — resume immediately
      this.triggerResume().catch(err => {
        console.error('[QuotaBackoff] Immediate resume failed:', err);
      });
      return;
    }

    this.resumeTimerId = this.clock.setTimeout(() => {
      this.triggerResume().catch(err => {
        console.error('[QuotaBackoff] Scheduled resume failed:', err);
      });
    }, msUntilReset);
  }

  /**
   * Trigger the resume. Called when countdown reaches 0 or manually via "Resume now".
   */
  private async triggerResume(): Promise<void> {
    // Guard: only resume from 'paused' state
    if (this.state !== 'paused') {
      console.warn(`[QuotaBackoff] triggerResume called in state '${this.state}', ignoring.`);
      return;
    }

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
      } else {
        console.warn('[QuotaBackoff] No onResumePipeline callback set. Cannot auto-resume.');
      }
      this.transitionTo('running');
    } catch (err: unknown) {
      console.error('[QuotaBackoff] Resume failed:', err);
      // Reset the manager so it's clean for the next attempt.
      this.state = 'running';
      this.consecutive429Count = 0;
      this.nextResetTime = null;
      this.notify();
    }
  }

  /**
   * Stop countdown and resume timers.
   */
  private stopTimers(): void {
    if (this.countdownTimerId !== null) {
      this.clock.clearInterval(this.countdownTimerId);
      this.countdownTimerId = null;
    }
    if (this.resumeTimerId !== null) {
      this.clock.clearTimeout(this.resumeTimerId);
      this.resumeTimerId = null;
    }
  }
}

// ── Singleton ──

let _instance: QuotaBackoffManager | null = null;

export function getQuotaBackoffManager(): QuotaBackoffManager {
  if (!_instance) {
    _instance = new QuotaBackoffManager();
  }
  return _instance;
}

export function initQuotaBackoffManager(
  config?: Partial<QuotaBackoffConfig>,
  clock?: QuotaClock
): QuotaBackoffManager {
  _instance = new QuotaBackoffManager(config, clock);
  return _instance;
}

export function resetQuotaBackoffManagerForTest(): void {
  _instance = null;
}
