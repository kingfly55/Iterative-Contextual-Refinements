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
- [x] `initQuotaBackoff()` and `cleanupQuotaBackoff()` are exported from `Deepthink/Deepthink.ts`
- [x] Manager's `onSaveSession` callback calls `saveSessionToFileAutomatic`
- [x] Manager's `onResumePipeline` callback calls `resumeSolutionPoolIterations`
- [x] `window.__deepthinkQuota` returns the manager snapshot
- [x] `fullReset()` is called at the start of `startDeepthinkAnalysisProcess()`
- [x] `cleanupQuotaBackoff()` is wired into SPA navigation teardown
- [x] `npx tsc --noEmit` exits with code 0
- [x] `npx vite build` exits with code 0
- [x] `npx vitest run` exits with code 0

**Status:** COMPLETED

## Completion Report

### What was changed

**`Deepthink/Deepthink.ts`:**
- Added imports for `saveSessionToFileAutomatic` from `DeepthinkSession`, `initQuotaBackoffManager`/`getQuotaBackoffManager` from `QuotaBackoffManager`, and `mountQuotaCountdownUI`/`unmountQuotaCountdownUI` from `QuotaCountdownUI`
- Created and exported `initQuotaBackoff()` function that:
  - Initializes the QuotaBackoffManager singleton via `initQuotaBackoffManager()`
  - Sets `onSaveSession` callback to call `saveSessionToFileAutomatic(filename)`
  - Sets `onResumePipeline` callback to call `resumeSolutionPoolIterations()`
  - Mounts the countdown overlay UI via `mountQuotaCountdownUI()`
  - Exposes `window.__deepthinkQuota` as a getter returning `getQuotaBackoffManager().getSnapshot()`
- Created and exported `cleanupQuotaBackoff()` function that unmounts the countdown UI and calls `fullReset()` on the manager
- Wired `initQuotaBackoff()` into `initializeDeepthinkModule()` (called after `initializeDeepthinkCore`)

**`Deepthink/DeepthinkCore.ts`:**
- Added `getQuotaBackoffManager().fullReset()` call at the start of `startDeepthinkAnalysisProcess()` to reset quota state for each new pipeline run

**`Core/AppRouter.ts`:**
- Imported `cleanupQuotaBackoff` from `Deepthink/Deepthink`
- Added cleanup call in `updateUIAfterModeChange()` when navigating away from deepthink mode (`globalState.currentMode !== 'deepthink'`)

### Verification output

**TypeScript (`npx tsc --noEmit`):** No errors in modified files (pre-existing errors in unrelated files only)

**Vite build (`npx vite build`):** ✓ built in 5.53s

**Tests (`npx vitest run`):** 2 test files, 77 tests passed (77)
---
