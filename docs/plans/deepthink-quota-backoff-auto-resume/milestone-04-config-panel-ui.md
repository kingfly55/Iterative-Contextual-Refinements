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
- [ ] `DeepthinkConfigPanelProps` includes all 5 quota config props and 5 callbacks
- [ ] `QuotaBackoffSection` component renders reset time input, cycle toggle, threshold slider, max cycles slider, and auto-resume toggle
- [ ] The section is rendered inside the config panel component
- [ ] `deriveProps` maps controller getters/setters to the new props
- [ ] `npx tsc --noEmit` exits with code 0
- [ ] `npx vite build` exits with code 0

**Status:** PENDING
---
