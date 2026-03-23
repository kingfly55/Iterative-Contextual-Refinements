---
# Milestone 1: QuotaBackoffManager Core + Tests

## Goal
Create the `QuotaBackoffManager` class with its full state machine (running → saving → paused → resuming → running), 429 counting, reset time computation, countdown logic, and singleton management. Install Vitest as a dev dependency and write comprehensive unit tests covering all state transitions, re-entrancy safety, countdown math, edge cases, and listener lifecycle. This milestone is purely additive — no existing files are modified.

## Prerequisites
None

## Implementation Tasks
1. Install `vitest` and `@vitest/runner` as dev dependencies; add `"test": "vitest run"` script to `package.json`
2. Create `Deepthink/QuotaBackoffManager.ts` with:
   - `QuotaBackoffState`, `QuotaBackoffConfig`, `QuotaBackoffSnapshot`, `QuotaBackoffListener` types
   - `DEFAULT_QUOTA_BACKOFF_CONFIG` constant
   - `QuotaClock` interface and `REAL_CLOCK` implementation
   - `QuotaBackoffManager` class with all public methods: `setCallbacks`, `updateConfig`, `getConfig`, `getSnapshot`, `subscribe`, `recordQuotaError`, `recordSuccess`, `reset`, `fullReset`, `isPaused`, `resumeNow`
   - All private methods: `computeNextResetTime`, `transitionTo`, `notify`, `startCountdown`, `triggerResume`, `stopTimers`
   - Singleton functions: `getQuotaBackoffManager`, `initQuotaBackoffManager`, `resetQuotaBackoffManagerForTest`
   - `PipelineQuotaPausedError` error class (exported for use by other milestones)
3. Create `Deepthink/QuotaBackoffManager.test.ts` with `FakeClock` and all unit tests from the plan (429 detection & counting, re-entrancy safety, state machine transitions, countdown math, save trigger, auto-resume invocation, resumeNow, max cycles, reset, isPaused, no-reset-time configured, updateConfig during pause, listener lifecycle)
4. Create `Deepthink/QuotaBackoffIntegration.test.ts` with integration tests (full pause/resume cycle, concurrent 429s, double cycle, isPaused check, simulated Promise.all)

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5

# All quota backoff tests pass
npx vitest run Deepthink/QuotaBackoff 2>&1 | tail -20
```

## Definition of Done
- [ ] `vitest` is installed and `npm test` runs successfully
- [ ] `Deepthink/QuotaBackoffManager.ts` exports `QuotaBackoffManager`, `PipelineQuotaPausedError`, singleton functions, types, and `REAL_CLOCK`
- [ ] `Deepthink/QuotaBackoffManager.test.ts` contains ≥15 unit test cases all passing
- [ ] `Deepthink/QuotaBackoffIntegration.test.ts` contains ≥5 integration test cases all passing
- [ ] `npx tsc --noEmit` exits with code 0
- [ ] `npx vitest run Deepthink/QuotaBackoff` exits with code 0

**Status:** PENDING
---
