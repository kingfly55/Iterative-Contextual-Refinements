# Plan: CLIProxy Quota Exceeded Behavior Control + Dynamic Model Discovery

## Problem Statement

The DeepThink application routes all LLM API requests through a central `APIRequestController` which provides per-provider throttling, exponential backoff on 429s, and configurable fallback chains. When the "Local Models" provider is used, requests go through CLIProxyAPI — an OpenAI-compatible proxy running at `localhost:8317` that manages multiple API keys across providers (Claude, Gemini, OpenAI-compatible).

The CLIProxy exposes a **Management API** (documented in `/home/joenathan/deepthink/CLIProxyAPIManagementAPI.md`) at `http://localhost:8317/v0/management` with Bearer token auth. This API provides:

- **Quota exceeded behavior control** — `GET/PUT /quota-exceeded/switch-project` and `/quota-exceeded/switch-preview-model` toggle how the proxy handles rate limits at the provider level (e.g., auto-switching to a different project/key or falling back to a preview model)
- **Configuration discovery** — `GET /config` returns the full proxy config including all provider key arrays (`claude-api-key`, `gemini-api-key`, `codex-api-key`) and `openai-compatibility` entries with explicit model `name`/`alias` pairs
- **Health status** — `GET /auth-files` returns per-credential status

**Current gaps:**
1. **Quota behavior is invisible** — The proxy's quota-exceeded toggles (`switch-project`, `switch-preview-model`) can only be changed by directly calling the management API. The user has no way to see or control these from the DeepThink web interface.
2. **Models are hardcoded** — Available models for the local provider come from the `VITE_CLIPROXY_MODELS` env var (currently `claude-opus-4-6(xhigh)`). If the proxy is configured with additional models or the env var is outdated, the app won't see them.

These two features close both gaps: the user gets toggles for quota-exceeded behavior in the Provider Management modal, and the app auto-discovers available models from the proxy's config endpoint.

---

## CLIProxy Management API Reference

Full docs: `/home/joenathan/deepthink/CLIProxyAPIManagementAPI.md`

Key endpoints used by this plan:

| Endpoint | Method | Request Body | Response |
|----------|--------|-------------|----------|
| `/v0/management/quota-exceeded/switch-project` | GET | — | `{"switch-project": true}` |
| `/v0/management/quota-exceeded/switch-project` | PUT | `{"value": false}` | `{"switch-project": false}` |
| `/v0/management/quota-exceeded/switch-preview-model` | GET | — | `{"switch-preview-model": true}` |
| `/v0/management/quota-exceeded/switch-preview-model` | PUT | `{"value": false}` | `{"switch-preview-model": false}` |
| `/v0/management/config` | GET | — | Full config with provider key arrays + `openai-compatibility` model entries |

Auth: `Authorization: Bearer <VITE_CLIPROXY_API_KEY>` or `X-Management-Key: <key>`

Proxy routing: The existing Vite dev proxy at `/cliproxy` -> `http://localhost:8317` already handles these. A request to `/cliproxy/v0/management/config` reaches `http://localhost:8317/v0/management/config`. No new proxy route needed.

---

## Feature 1: Quota Exceeded Behavior Control

### What it does
Two toggles in the Provider Management modal that read/write the CLIProxy's `switch-project` and `switch-preview-model` quota-exceeded settings.

### Implementation

#### Step 1: Create `Routing/CLIProxyManagementClient.ts`

New file — stateless API client wrapping management API fetch calls.

**Types:**
```typescript
interface QuotaExceededSettings {
    switchProject: boolean;
    switchPreviewModel: boolean;
}

interface CLIProxyKeyEntry { name: string; key: string; disabled?: boolean; }
interface CLIProxyOpenAICompatEntry { name: string; alias?: string; [key: string]: any; }
interface CLIProxyConfig {
    'claude-api-key'?: CLIProxyKeyEntry[];
    'gemini-api-key'?: CLIProxyKeyEntry[];
    'codex-api-key'?: CLIProxyKeyEntry[];
    'openai-compatibility'?: CLIProxyOpenAICompatEntry[];
}
```

**Functions:**
- `getManagementBaseURL()` — returns `${window.location.origin}/cliproxy/v0/management` (works through Vite proxy, no new proxy route needed)
- `getAuthHeaders()` — returns `{ 'Authorization': 'Bearer ' + import.meta.env.VITE_CLIPROXY_API_KEY }`
- `isCliProxyConfigured()` — returns `!!import.meta.env.VITE_CLIPROXY_BASE_URL`
- `fetchQuotaExceededSettings()` — `Promise.all` of GET `/quota-exceeded/switch-project` and `/quota-exceeded/switch-preview-model`, returns `QuotaExceededSettings`
- `updateQuotaExceededSetting(setting: 'switch-project' | 'switch-preview-model', value: boolean)` — PUT with `{"value": bool}` body
- `fetchConfig()` — GET `/config`, returns `CLIProxyConfig`
- `discoverModels(config: CLIProxyConfig)` — pure function extracting model IDs from config (see Feature 2)

#### Step 2: Add UI in `Routing/ProviderManagementUI.ts`

Add a "CLIProxy Settings" section between the provider cards grid and the fallback section. Only rendered when `isCliProxyConfigured()` is true.

**New methods (following existing `renderFallbackSection`/`attachFallbackListeners` pattern):**
- `renderCliProxySection()` — returns HTML string with two toggle rows + discovered models count
- `attachCliProxyListeners()` — binds toggle change events
- `loadCliProxySettings()` — async, called from `show()`, fetches current values and updates checkboxes

**Modify `renderProviderCards()`** (line 157):
```typescript
// Current:
${this.renderFallbackSection()}
// Change to:
${isCliProxyConfigured() ? this.renderCliProxySection() : ''}
${this.renderFallbackSection()}
```

**Modify `show()`** (line 136): After `renderProviderCards()`, call `this.loadCliProxySettings()` (fire-and-forget async).

**Toggle behavior:** On change -> call `updateQuotaExceededSetting()`. On failure -> revert checkbox, show 3s error via existing `showError` pattern. On proxy unreachable -> disable toggles, show "CLIProxy unreachable" notice.

#### Step 3: Add CSS in `Routing/ProviderManagement.css`

Follow exact `.fallback-section` patterns:
- `.cliproxy-section` — container with margin-top
- `.cliproxy-toggle-row` — flex row with label, description, and checkbox
- `.cliproxy-status` — discovered models count indicator
- `.cliproxy-error` — error notice (reuse `.error-message` pattern)

---

## Feature 2: Dynamic Model Discovery

### What it does
On app startup and when the Provider Management modal opens, call `GET /config` to discover all models the CLIProxy can route to and update the local provider's model list. `VITE_CLIPROXY_MODELS` env var remains as fallback.

### Implementation

#### Step 4: Add `discoverModels()` in `CLIProxyManagementClient.ts`

```typescript
function discoverModels(config: CLIProxyConfig): string[] {
    const models: string[] = [];
    // openai-compatibility entries have explicit model names
    for (const entry of config['openai-compatibility'] || []) {
        const modelId = entry.alias || entry.name;
        if (modelId && !models.includes(modelId)) models.push(modelId);
    }
    return models;
}
```

#### Step 5: Add `updateLocalModels()` to `Routing/ProviderManager.ts`

```typescript
public updateLocalModels(models: string[]): void {
    const config = this.providers.get('local');
    if (!config) return;
    config.models = models;
    // Don't save to localStorage — these are dynamically discovered
}
```

#### Step 6: Add startup discovery in `Routing/RoutingManager.ts`

In `initialize()`, after existing setup, add:
```typescript
if (isCliProxyConfigured()) {
    this.discoverCliProxyModels(); // fire-and-forget async
}
```

New private method:
```typescript
private async discoverCliProxyModels(): Promise<void> {
    try {
        const config = await fetchConfig();
        if (config) {
            const models = discoverModels(config);
            if (models.length > 0) {
                this.providerManager.updateLocalModels(models);
                this.updateAvailableModels();
            }
        }
    } catch (e) {
        console.warn('[RoutingManager] CLIProxy model discovery failed, using env var fallback:', e);
    }
}
```

#### Step 7: Also trigger discovery from modal open

In `ProviderManagementUI.loadCliProxySettings()` (the async method added in Step 2), also call `fetchConfig()` + `discoverModels()` and update the models display. Show "X models discovered" in the CLIProxy section.

#### Step 8: Add barrel export in `Routing/index.ts`

```typescript
export { isCliProxyConfigured, fetchQuotaExceededSettings, updateQuotaExceededSetting,
         fetchConfig, discoverModels, type QuotaExceededSettings, type CLIProxyConfig
       } from './CLIProxyManagementClient';
```

---

## Files to Modify

| File | Change |
|------|--------|
| `Routing/CLIProxyManagementClient.ts` | **NEW** — API client for management endpoints |
| `Routing/ProviderManagementUI.ts` | Add CLIProxy settings section (toggles + model count) |
| `Routing/ProviderManagement.css` | Add `.cliproxy-*` styles |
| `Routing/ProviderManager.ts` | Add `updateLocalModels()` method |
| `Routing/RoutingManager.ts` | Add startup model discovery call |
| `Routing/index.ts` | Add barrel exports |

## Existing Code to Reuse

- `renderFallbackSection()` / `attachFallbackListeners()` pattern in `ProviderManagementUI.ts` — exact template for the new section
- `showError()` / `showFallbackError()` — error display pattern (3s auto-dismiss)
- `notifyModelsChanged()` -> `refreshProviders()` chain — for triggering model list refresh after discovery
- Vite proxy at `/cliproxy` — already forwards to the proxy host, management API is reachable at `/cliproxy/v0/management/*`

## Implementation Order

1. `CLIProxyManagementClient.ts` (new file, no dependencies)
2. `ProviderManager.ts` (add `updateLocalModels`)
3. `RoutingManager.ts` (add startup discovery)
4. `ProviderManagement.css` (add styles)
5. `ProviderManagementUI.ts` (add section, toggles, modal-open fetch)
6. `index.ts` (add exports)

## Verification

1. **Quota toggles**: Open Provider Management modal -> CLIProxy Settings section visible -> toggles reflect current proxy state -> toggle one -> verify PUT in Network tab -> re-open modal -> value persisted
2. **Dynamic models**: Remove `VITE_CLIPROXY_MODELS` from `.env` -> restart app -> models still appear from discovery -> restore env var -> stop proxy -> restart app -> env var models used as fallback
3. **Error handling**: Stop proxy -> open modal -> see "CLIProxy unreachable" notice -> toggles disabled -> start proxy -> re-open modal -> settings load correctly
4. **Build**: `npx vite build` succeeds cleanly
