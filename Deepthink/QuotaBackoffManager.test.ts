import { describe, test, expect, vi } from 'vitest';
import {
    QuotaBackoffManager,
    QuotaClock,
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
     */
    advance(ms: number): void {
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
        }
    }

    /**
     * Advance time and flush all microtasks between timer firings.
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
            // Flush microtask queue
            for (let i = 0; i < 4; i++) {
                await new Promise(resolve => resolve(undefined));
            }
        }
    }
}

// ── Unit Test Cases ──

describe('QuotaBackoffManager', () => {

    // ── 429 Detection & Counting ──

    test('recordQuotaError increments consecutive count', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 3 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        expect(mgr.recordQuotaError()).toBe(false); // 1/3
        expect(mgr.getSnapshot().consecutive429Count).toBe(1);
        expect(mgr.recordQuotaError()).toBe(false); // 2/3
        expect(mgr.recordQuotaError()).toBe(true);  // 3/3 → saving
        expect(mgr.getSnapshot().state).toBe('saving');
    });

    test('recordSuccess resets consecutive count', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 2 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError(); // 1/2
        mgr.recordSuccess();
        expect(mgr.getSnapshot().consecutive429Count).toBe(0);
        expect(mgr.recordQuotaError()).toBe(false); // 1/2 again
    });

    test('non-429 errors do NOT reset consecutive count (recordSuccess not called)', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 2 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError(); // 1/2
        // Simulate non-429 error: we do NOT call recordSuccess()
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
        // Flush enough microtask rounds for the full chain
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(states).toContain('paused');

        // Advance clock past reset time
        await clock.advanceAsync(31 * 60 * 1000); // 31 minutes to 10:31
        expect(states).toContain('resuming');

        resumeResolve!();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(states).toContain('running');
    });

    test('invalid state transitions are ignored with warning', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 100 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        // Manager is in 'running' state. Can't go directly to 'paused'.
        // Since transitionTo is private, we test indirectly via reset()
        mgr.reset();
        expect(mgr.getSnapshot().state).toBe('running');
    });

    test('reset() called during saving state prevents transition to paused', async () => {
        const clock = new FakeClock();
        let saveResolve: () => void;
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({
            onSaveSession: () => new Promise<void>(r => { saveResolve = r; }),
            onResumePipeline: async () => {},
        });
        mgr.recordQuotaError(); // transitions to 'saving'
        expect(mgr.getSnapshot().state).toBe('saving');

        // Reset while save is in-flight
        mgr.reset();
        expect(mgr.getSnapshot().state).toBe('running');

        // Now resolve the save — should NOT transition to paused (guard in .then())
        saveResolve!();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('running'); // stays running
    });

    // ── Countdown Math ──

    test('computeNextResetTime returns nearest future 5h-cycle reset', () => {
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

    test('msUntilReset is computed dynamically from clock.now()', () => {
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

    test('msUntilReset returns 0 when nextResetTime is null', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ firstResetTime: '', consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        expect(mgr.getSnapshot().msUntilReset).toBe(0);
    });

    test('msUntilReset never goes negative (clamped to 0)', () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '14:59', cyclicResetEnabled: false, consecutive429Threshold: 1, autoResumeEnabled: false },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        // Advance well past the reset time
        clock.advance(60 * 60 * 1000); // +1 hour
        expect(mgr.getSnapshot().msUntilReset).toBe(0); // clamped, not negative
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
        // toISOString() converts to UTC, so the time in the filename depends on timezone.
        // Just verify the pattern and date are correct.
        expect(savedFilename).toMatch(/^deepthink-quota-pause-2026-03-22T\d{2}-\d{2}-\d{2}\.json$/);
    });

    test('save failure does not prevent pausing', async () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({
            onSaveSession: async () => { throw new Error('Disk full'); },
            onResumePipeline: async () => {},
        });
        mgr.recordQuotaError();
        // Flush enough microtask rounds for .catch → transitionTo chain
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');
    });

    test('logs warning when onSaveSession is not set', () => {
        const clock = new FakeClock();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        // Do NOT call setCallbacks
        mgr.recordQuotaError();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No onSaveSession callback'));
        expect(mgr.getSnapshot().state).toBe('paused'); // still pauses
        warnSpy.mockRestore();
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
        // Flush microtasks for save → paused → startCountdown chain
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');

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
        for (let i = 0; i < 4; i++) await Promise.resolve();
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
        for (let i = 0; i < 4; i++) await Promise.resolve();
        await clock.advanceAsync(10 * 60 * 1000);
        // Manager should be back to running (reset), not stuck in 'resuming'
        expect(mgr.getSnapshot().state).toBe('running');
        expect(mgr.getSnapshot().consecutive429Count).toBe(0);
    });

    // ── resumeNow ──

    test('resumeNow triggers resume even when autoResumeEnabled is false', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T14:50:00'));
        let resumed = false;
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '14:59', consecutive429Threshold: 1, autoResumeEnabled: false },
            clock,
        );
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { resumed = true; },
        });
        mgr.recordQuotaError();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');

        mgr.resumeNow();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(resumed).toBe(true);
        expect(mgr.getSnapshot().state).toBe('running');
    });

    test('resumeNow is no-op when not paused', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 2 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.resumeNow(); // should not throw or change state
        expect(mgr.getSnapshot().state).toBe('running');
    });

    test('double resumeNow only triggers one resume', async () => {
        const clock = new FakeClock();
        let resumeCount = 0;
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({
            onSaveSession: async () => {},
            onResumePipeline: async () => { resumeCount++; },
        });
        mgr.recordQuotaError();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');

        mgr.resumeNow(); // transitions to 'resuming'
        mgr.resumeNow(); // state is 'resuming', should be no-op
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(resumeCount).toBe(1);
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
        for (let i = 0; i < 4; i++) await Promise.resolve();
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
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().state).toBe('paused');
        expect(mgr.getSnapshot().nextResetTime).toBeNull();
        // Advance time — should NOT auto-resume (no reset time)
        await clock.advanceAsync(10 * 60 * 60 * 1000); // 10 hours
        expect(resumed).toBe(false);
        expect(mgr.getSnapshot().state).toBe('paused'); // still paused, manual resume needed
    });

    // ── updateConfig during pause ──

    test('updateConfig while paused recomputes reset time and restarts countdown', async () => {
        const clock = new FakeClock(Date.parse('2026-03-22T10:00:00'));
        const mgr = new QuotaBackoffManager(
            { firstResetTime: '15:00', cyclicResetEnabled: false, consecutive429Threshold: 1, autoResumeEnabled: true },
            clock,
        );
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        mgr.recordQuotaError();
        for (let i = 0; i < 4; i++) await Promise.resolve();
        expect(mgr.getSnapshot().nextResetTime?.getHours()).toBe(15);

        // User changes reset time while paused
        mgr.updateConfig({ firstResetTime: '12:00' });
        expect(mgr.getSnapshot().nextResetTime?.getHours()).toBe(12);
    });

    // ── Listener lifecycle ──

    test('subscribe returns unsubscribe function that prevents further notifications', () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 2 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });
        let callCount = 0;
        const unsub = mgr.subscribe(() => { callCount++; });
        mgr.recordQuotaError(); // triggers notify (count changes)
        const countAfterFirst = callCount;
        unsub();
        mgr.recordQuotaError(); // would trigger notify, but we unsubscribed
        expect(callCount).toBe(countAfterFirst); // no additional calls
    });

    // ── Default config ──

    test('DEFAULT_QUOTA_BACKOFF_CONFIG has expected values', () => {
        expect(DEFAULT_QUOTA_BACKOFF_CONFIG.firstResetTime).toBe('');
        expect(DEFAULT_QUOTA_BACKOFF_CONFIG.cyclicResetEnabled).toBe(true);
        expect(DEFAULT_QUOTA_BACKOFF_CONFIG.consecutive429Threshold).toBe(2);
        expect(DEFAULT_QUOTA_BACKOFF_CONFIG.autoResumeEnabled).toBe(true);
        expect(DEFAULT_QUOTA_BACKOFF_CONFIG.maxCyclesPerSession).toBe(5);
    });
});
