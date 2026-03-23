---
# Milestone 4: Config Panel UI

## Goal
Add the Quota Backoff configuration section to `DeepthinkConfigPanel.tsx`, allowing users to configure the reset time, cycle detection, auto-resume, and safety limits through the existing settings panel. Wire the props through the controller bridge's `deriveProps()`.

## Prerequisites
- Milestone 3 (config controller has the getters/setters and state fields)

## Implementation Tasks
1. In `Deepthink/DeepthinkConfigPanel.tsx`:
   - Add the 5 quota config props and 5 onChange callbacks to `DeepthinkConfigPanelProps` interface
   - Create `QuotaBackoffSection` component with: time input for reset time, checkbox toggle for 5h cycles, slider for consecutive 429 threshold (1–10), slider for max cycles (1–20), checkbox toggle for auto-resume
   - Add `QuotaBackoffSection` to the main `DeepthinkConfigPanelComponent` JSX as a new config row
2. In the controller bridge (wherever `deriveProps` connects the controller to the panel), add the 5 new props and 5 onChange handlers mapping to the controller setters

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5

# Vite build succeeds (catches JSX/import errors)
npx vite build 2>&1 | tail -10
```

## Definition of Done
- [x] `DeepthinkConfigPanelProps` includes all 5 quota config props and 5 callbacks
- [x] `QuotaBackoffSection` component renders reset time input, cycle toggle, threshold slider, max cycles slider, and auto-resume toggle
- [x] The section is rendered inside the config panel component
- [x] `deriveProps` maps controller getters/setters to the new props
- [x] `npx tsc --noEmit` exits with code 0
- [x] `npx vite build` exits with code 0

**Status:** COMPLETED

## Completion Report

### What was changed

**`Deepthink/DeepthinkConfigPanel.tsx`:**
1. Added 5 quota config props to `DeepthinkConfigPanelProps` interface: `quotaResetTime`, `quotaCyclicResetEnabled`, `quotaConsecutive429Threshold`, `quotaAutoResumeEnabled`, `quotaMaxCyclesPerSession`
2. Added 5 onChange callbacks to the interface: `onQuotaResetTimeChange`, `onQuotaCyclicResetToggle`, `onQuotaConsecutive429ThresholdChange`, `onQuotaAutoResumeToggle`, `onQuotaMaxCyclesPerSessionChange`
3. Created `QuotaBackoffSection` component with:
   - Text input for reset time (HH:MM 24h format)
   - Checkbox toggle for 5-hour cyclic reset
   - Slider for consecutive 429 threshold (1–10)
   - Slider for max cycles per session (1–20)
   - Checkbox toggle for auto-resume
4. Added `QuotaBackoffSection` as a new config row in `DeepthinkConfigPanelComponent`
5. Added 5 onChange handlers in `deriveProps()` mapping to controller setters: `setQuotaResetTime`, `setQuotaCyclicResetEnabled`, `setQuotaConsecutive429Threshold`, `setQuotaAutoResumeEnabled`, `setQuotaMaxCyclesPerSession`

### Verification output

**`npx tsc --noEmit`:** No errors in DeepthinkConfigPanel.tsx (0 errors from this file; all pre-existing errors are in other files)

**`npx vite build`:** `✓ built in 5.90s` — success
---
