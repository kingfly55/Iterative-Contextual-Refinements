---
# Milestone 3: Config Persistence Layer

## Goal
Add the five quota backoff configuration fields (`quotaResetTime`, `quotaCyclicResetEnabled`, `quotaConsecutive429Threshold`, `quotaAutoResumeEnabled`, `quotaMaxCyclesPerSession`) to `ModelConfig.ts` and `DeepthinkConfigController.ts` with getters, setters, validation, and live sync to the `QuotaBackoffManager` singleton.

## Prerequisites
- Milestone 1 (QuotaBackoffManager singleton and `updateConfig` method exist)

## Implementation Tasks
1. In `Routing/ModelConfig.ts`, add the 5 new fields to the `ModelParameters` interface and `DEFAULT_MODEL_PARAMETERS` constant with default values: `quotaResetTime: ''`, `quotaCyclicResetEnabled: true`, `quotaConsecutive429Threshold: 2`, `quotaAutoResumeEnabled: true`, `quotaMaxCyclesPerSession: 5`
2. In `Routing/DeepthinkConfigController.ts`:
   - Add the 5 new fields to `DeepthinkConfigState` interface
   - Add getter methods: `getQuotaResetTime()`, `isQuotaCyclicResetEnabled()`, `getQuotaConsecutive429Threshold()`, `isQuotaAutoResumeEnabled()`, `getQuotaMaxCyclesPerSession()`
   - Add setter methods with validation: `setQuotaResetTime(time)` (HH:MM validation), `setQuotaCyclicResetEnabled(enabled)`, `setQuotaConsecutive429Threshold(threshold)` (clamp 1–10), `setQuotaAutoResumeEnabled(enabled)`, `setQuotaMaxCyclesPerSession(max)` (clamp 1–20)
   - Add private `syncQuotaBackoffConfig()` method that pushes current config to the manager singleton
   - Update `getState()` to include the new fields

## Verification
```bash
# TypeScript compiles without errors
npx tsc --noEmit 2>&1 | tail -5
```

## Definition of Done
- [ ] `ModelParameters` interface includes all 5 quota fields with defaults
- [ ] `DeepthinkConfigState` interface includes all 5 quota fields
- [ ] `DeepthinkConfigController` has getters and setters for all 5 fields
- [ ] Each setter calls `syncQuotaBackoffConfig()` to push changes to the manager
- [ ] `setQuotaResetTime` validates HH:MM format and rejects invalid input
- [ ] `setQuotaConsecutive429Threshold` clamps to [1, 10]
- [ ] `setQuotaMaxCyclesPerSession` clamps to [1, 20]
- [ ] `npx tsc --noEmit` exits with code 0

**Status:** PENDING
---
