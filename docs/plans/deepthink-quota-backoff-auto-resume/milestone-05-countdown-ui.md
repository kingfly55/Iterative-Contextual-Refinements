---
# Milestone 5: Countdown Overlay UI

## Goal
Create the `QuotaCountdownUI.ts` floating overlay that subscribes to the QuotaBackoffManager and displays pause status, countdown timer, cycle info, saved filename, and Resume now / Cancel buttons. The overlay mounts/unmounts itself based on manager state and provides cleanup for SPA navigation.

## Prerequisites
- Milestone 1 (QuotaBackoffManager with subscribe, getSnapshot, resumeNow, reset)

## Implementation Tasks
1. Create `Deepthink/QuotaCountdownUI.ts` with:
   - `mountQuotaCountdownUI()` — creates overlay DOM element, subscribes to manager, returns cleanup function
   - `unmountQuotaCountdownUI()` — removes overlay and unsubscribes
   - `createOverlayElement()` — builds the fixed-position overlay with title, timer, cycle info, saved filename, no-reset warning, Resume now button, Cancel button
   - `updateOverlayContent(overlay, snapshot)` — updates overlay text/visibility based on snapshot state
   - `formatCountdown(ms)` — formats milliseconds to "Xh Ym Zs" string (handles 0, negative, NaN)
   - `formatResetTime(date)` — formats Date to "HH:MM" local time
2. Overlay display logic:
   - Show when state is 'saving', 'paused', or 'resuming'
   - Hide when state is 'running'
   - "Resume now" button calls `manager.resumeNow()`
   - "Cancel" button calls `manager.reset()` and sets `currentProcess.isStopRequested = true`
   - When `nextResetTime` is null, show "No reset time configured" warning

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5

# Vite build succeeds
npx vite build 2>&1 | tail -10
```

## Definition of Done
- [ ] `Deepthink/QuotaCountdownUI.ts` exports `mountQuotaCountdownUI`, `unmountQuotaCountdownUI`, `formatCountdown`, `formatResetTime`
- [ ] `formatCountdown` returns "0s" for zero/negative, "—" for NaN, and correct "Xh Ym Zs" for positive values
- [ ] Overlay shows/hides based on manager state transitions
- [ ] "Resume now" button calls `manager.resumeNow()`
- [ ] Cleanup function removes DOM element and unsubscribes listener
- [ ] `npx tsc --noEmit` exits with code 0
- [ ] `npx vite build` exits with code 0

**Status:** PENDING
---
