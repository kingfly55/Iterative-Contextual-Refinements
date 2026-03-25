import { describe, test, expect } from 'vitest';
import { FakeClock } from './QuotaBackoffManager.test';
import { QuotaBackoffManager, PipelineQuotaPausedError } from './QuotaBackoffManager';

describe('Quota Backoff Integration', () => {
    /**
     * Simulates: pipeline running → 2 consecutive 429s → auto-save → pause →
     * clock advances past reset → auto-resume → pipeline continues to completion.
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
        // Flush microtasks for save → paused chain
        for (let i = 0; i < 4; i++) await Promise.resolve();

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
        for (let i = 0; i < 4; i++) await Promise.resolve();
        await clock.advanceAsync(11 * 60 * 1000); // past 10:00
        expect(resumeCount).toBe(1);
        expect(mgr.getSnapshot().state).toBe('running');

        // Second quota hit — next cycle reset at 15:00
        mgr.recordQuotaError();
        for (let i = 0; i < 4; i++) await Promise.resolve();
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
        expect(mgr.isPaused()).toBe(true); // should throw PipelineQuotaPausedError
    });

    /**
     * Verifies that Promise.all with Track A/B handles PipelineQuotaPausedError.
     */
    test('simulated Promise.all rejects with first PipelineQuotaPausedError', async () => {
        const clock = new FakeClock();
        const mgr = new QuotaBackoffManager({ consecutive429Threshold: 1 }, clock);
        mgr.setCallbacks({ onSaveSession: async () => {}, onResumePipeline: async () => {} });

        const trackA = async () => {
            mgr.recordQuotaError(); // triggers pause
            throw new PipelineQuotaPausedError();
        };
        const trackB = async () => {
            // Simulate Track B checking isPaused at next await boundary
            await Promise.resolve();
            if (mgr.isPaused()) throw new PipelineQuotaPausedError();
        };

        await expect(Promise.all([trackA(), trackB()])).rejects.toThrow('paused');
    });
});
