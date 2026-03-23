---
# Milestone 2: Session Save Helpers

## Goal
Add `saveSessionToFileAutomatic(filename)` and `saveToLocalStorageImmediate()` to `DeepthinkSession.ts`, enabling the QuotaBackoffManager to trigger programmatic saves without user interaction. These are the save entry points that the manager's `onSaveSession` callback will call.

## Prerequisites
- Milestone 1 (QuotaBackoffManager types exist but these functions don't depend on them directly)

## Implementation Tasks
1. In `Deepthink/DeepthinkSession.ts`, add `saveToLocalStorageImmediate()` export that clears any pending debounced auto-save timer and calls the existing `saveToLocalStorage()` synchronously
2. In `Deepthink/DeepthinkSession.ts`, add `saveSessionToFileAutomatic(filename: string)` export that:
   - Calls `saveToLocalStorageImmediate()` first (primary, reliable)
   - Builds the session file via `buildSessionFile()`
   - Creates a Blob and triggers download via `<a download>` click (secondary, best-effort)
   - Delays `URL.revokeObjectURL` by 5s to allow download to start

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5
```

## Definition of Done
- [ ] `saveToLocalStorageImmediate` is exported from `Deepthink/DeepthinkSession.ts`
- [ ] `saveSessionToFileAutomatic` is exported from `Deepthink/DeepthinkSession.ts`
- [ ] `npx tsc --noEmit` exits with code 0
- [ ] Existing session tests (if any) still pass

**Status:** PENDING
---
