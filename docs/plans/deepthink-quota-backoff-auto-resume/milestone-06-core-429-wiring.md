---
# Milestone 6: Wire 429 Detection into DeepthinkCore Retry Loops

## Goal
Modify all three retry loops in `DeepthinkCore.ts` (`makeDeepthinkApiCall`, `makeResumedApiCall`, `runFinalJudge`) to detect HTTP 429 errors, report them to the QuotaBackoffManager, throw `PipelineQuotaPausedError` when the manager triggers a pause, and add `isPaused()` guards at the top of each retry loop. Also fix the timeout wrappers to clean up dangling timers, and propagate `PipelineQuotaPausedError` through all inner catch blocks and `Promise.allSettled` sites.

## Prerequisites
- Milestone 1 (QuotaBackoffManager, PipelineQuotaPausedError)
- Milestone 2 (session save helpers)

## Implementation Tasks
1. In `Deepthink/DeepthinkCore.ts`, add `PipelineQuotaPausedError` import from `QuotaBackoffManager.ts` (or move the class here if preferred)
2. In `makeDeepthinkApiCall()`:
   - Add `isPaused()` check at top of retry loop (after stop-requested check)
   - Add 429 detection in catch block (check `error.status === 429`, `error.error.type === 'model_cooldown'`, regex `/\b429\b|rate.?limit|model_cooldown/i`)
   - Call `manager.recordQuotaError()`, throw `PipelineQuotaPausedError` if it returns true
   - Add `recordSuccess()` call after successful response
   - Re-throw `PipelineQuotaPausedError` and `PipelineStopRequestedError` at top of catch (before retry logic)
3. Apply identical changes to `makeResumedApiCall()` in `resumeSolutionPoolIterations()`
4. Apply identical changes to `runFinalJudge()` retry loop
5. Fix `makeDeepthinkApiCallWithTimeout` and `makeResumedApiCallWithTimeout` to `clearTimeout` in both success and error paths (prevent dangling timers)
6. Propagate `PipelineQuotaPausedError` through all inner catch blocks:
   - Track B hypothesis catch
   - Track A self-improvement outer catch
   - Individual agent error catches within Promise.allSettled correction promises
   - Final judging catch
   - Add `isPaused()` check after every `Promise.allSettled` call
7. Handle `PipelineQuotaPausedError` in top-level pipeline catches:
   - In `startDeepthinkAnalysisProcess()` — return without marking pipeline as failed
   - In `resumeSolutionPoolIterations()` — same handling
   - In `finally` blocks — don't clear `isGenerating` if paused

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5

# All existing tests still pass
npx vitest run 2>&1 | tail -10
```

## Definition of Done
- [ ] All 3 retry loops (`makeDeepthinkApiCall`, `makeResumedApiCall`, `runFinalJudge`) have `isPaused()` guard at loop top
- [ ] All 3 retry loops detect 429 errors and call `manager.recordQuotaError()`
- [ ] All 3 retry loops call `manager.recordSuccess()` on successful responses
- [ ] All 3 retry loops re-throw `PipelineQuotaPausedError` immediately in catch (no retry)
- [ ] Both timeout wrappers clear their `setTimeout` in error paths
- [ ] `PipelineQuotaPausedError` propagates through all inner catch blocks (≥4 locations)
- [ ] `isPaused()` check exists after every `Promise.allSettled` call site
- [ ] Top-level catches handle `PipelineQuotaPausedError` without marking pipeline as failed
- [ ] `npx tsc --noEmit` exits with code 0

**Status:** PENDING
---
