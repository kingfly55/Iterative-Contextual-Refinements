---
# Milestone 7: Module Wiring, Initialization, and SPA Cleanup

## Goal
Wire everything together in `Deepthink/Deepthink.ts`: initialize the QuotaBackoffManager singleton with save/resume callbacks, mount the countdown UI, expose `window.__deepthinkQuota` for debugging, call `fullReset()` on new pipeline starts, and add SPA navigation cleanup to prevent DOM/timer leaks.

## Prerequisites
- Milestone 1 (QuotaBackoffManager singleton)
- Milestone 2 (saveSessionToFileAutomatic)
- Milestone 5 (mountQuotaCountdownUI)
- Milestone 6 (core wiring complete)

## Implementation Tasks
1. In `Deepthink/Deepthink.ts`:
   - Import `initQuotaBackoffManager`, `getQuotaBackoffManager` from `QuotaBackoffManager.ts`
   - Import `mountQuotaCountdownUI` from `QuotaCountdownUI.ts`
   - Import `saveSessionToFileAutomatic` from `DeepthinkSession.ts`
   - Create `initQuotaBackoff()` function that initializes the manager, sets save/resume callbacks, and mounts the countdown UI
   - Create `cleanupQuotaBackoff()` function that unmounts UI and resets manager
   - Expose `window.__deepthinkQuota` for debugging (returns `getSnapshot()`)
2. In `Deepthink/DeepthinkCore.ts`:
   - Add `getQuotaBackoffManager().fullReset()` call at the start of `startDeepthinkAnalysisProcess()`
3. Wire `initQuotaBackoff()` into the module initialization path (called during Deepthink setup)
4. Wire `cleanupQuotaBackoff()` into SPA navigation teardown (when leaving Deepthink view)

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5

# Vite build succeeds (full app builds)
npx vite build 2>&1 | tail -10

# All tests still pass
npx vitest run 2>&1 | tail -10
```

## Definition of Done
- [ ] `initQuotaBackoff()` and `cleanupQuotaBackoff()` are exported from `Deepthink/Deepthink.ts`
- [ ] Manager's `onSaveSession` callback calls `saveSessionToFileAutomatic`
- [ ] Manager's `onResumePipeline` callback calls `resumeSolutionPoolIterations`
- [ ] `window.__deepthinkQuota` returns the manager snapshot
- [ ] `fullReset()` is called at the start of `startDeepthinkAnalysisProcess()`
- [ ] `cleanupQuotaBackoff()` is wired into SPA navigation teardown
- [ ] `npx tsc --noEmit` exits with code 0
- [ ] `npx vite build` exits with code 0
- [ ] `npx vitest run` exits with code 0

**Status:** PENDING
---
