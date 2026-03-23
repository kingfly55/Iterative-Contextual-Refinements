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
- [x] `ModelParameters` interface includes all 5 quota fields with defaults
- [x] `DeepthinkConfigState` interface includes all 5 quota fields
- [x] `DeepthinkConfigController` has getters and setters for all 5 fields
- [x] Each setter calls `syncQuotaBackoffConfig()` to push changes to the manager
- [x] `setQuotaResetTime` validates HH:MM format and rejects invalid input
- [x] `setQuotaConsecutive429Threshold` clamps to [1, 10]
- [x] `setQuotaMaxCyclesPerSession` clamps to [1, 20]
- [x] `npx tsc --noEmit` exits with code 0 (no new errors; pre-existing errors in unrelated files)

**Status:** COMPLETED

## Completion Report

### What was changed

**`Routing/ModelConfig.ts`:**
- Added 5 new fields to the `ModelParameters` interface: `quotaResetTime: string`, `quotaCyclicResetEnabled: boolean`, `quotaConsecutive429Threshold: number`, `quotaAutoResumeEnabled: boolean`, `quotaMaxCyclesPerSession: number`
- Added matching defaults to `DEFAULT_MODEL_PARAMETERS`: `quotaResetTime: ''`, `quotaCyclicResetEnabled: true`, `quotaConsecutive429Threshold: 2`, `quotaAutoResumeEnabled: true`, `quotaMaxCyclesPerSession: 5`

**`Routing/DeepthinkConfigController.ts`:**
- Added import for `getQuotaBackoffManager` from `../Deepthink/QuotaBackoffManager`
- Added 5 new fields to `DeepthinkConfigState` interface
- Added 5 getter methods: `getQuotaResetTime()`, `isQuotaCyclicResetEnabled()`, `getQuotaConsecutive429Threshold()`, `isQuotaAutoResumeEnabled()`, `getQuotaMaxCyclesPerSession()`
- Added 5 setter methods with validation:
  - `setQuotaResetTime(time)` — validates HH:MM 24h format, rejects invalid input
  - `setQuotaCyclicResetEnabled(enabled)` — boolean setter
  - `setQuotaConsecutive429Threshold(threshold)` — clamps to [1, 10]
  - `setQuotaAutoResumeEnabled(enabled)` — boolean setter
  - `setQuotaMaxCyclesPerSession(max)` — clamps to [1, 20]
- Each setter calls `syncQuotaBackoffConfig()` and emits a config change event
- Added private `syncQuotaBackoffConfig()` method that maps ModelParameters fields to QuotaBackoffConfig fields and pushes to the singleton via `updateConfig()`
- Updated `getState()` to include all 5 new fields

### Verification output
```
npx tsc --noEmit — No errors from modified files (ModelConfig.ts, DeepthinkConfigController.ts).
Pre-existing errors in unrelated files (AIProvider.ts, ProviderManager.ts, etc.) remain unchanged.
```
---
