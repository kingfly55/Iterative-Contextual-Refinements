# Plan: CLIProxy Management API Integration

## Problem Statement

The DeepThink application routes all LLM API requests through a central `APIRequestController` which provides per-provider throttling, exponential backoff on 429s, and configurable fallback chains. When the "Local Models" provider is used, requests go through CLIProxyAPI — an OpenAI-compatible proxy running at `localhost:8317` that manages multiple API keys across providers (Claude, Gemini, OpenAI-compatible).

The CLIProxy exposes a **Management API** (documented in `/home/joenathan/deepthink/CLIProxyAPIManagementAPI.md`) at `http://localhost:8317/v0/management` with Bearer token auth. This API provides:

- **Quota exceeded behavior control** — `GET/PUT /quota-exceeded/switch-project` and `/quota-exceeded/switch-preview-model` toggle how the proxy handles rate limits at the provider level
- **Configuration discovery** — `GET /config` returns the full proxy config including all provider key arrays and `openai-compatibility` entries with explicit model `name`/`alias` pairs (also `claude-api-key[].models[]`)

**Current gaps:**
1. **Quota behavior is invisible** — The proxy's quota-exceeded toggles can only be changed by directly calling the management API. The user has no way to see or control these from the DeepThink web interface.
2. **Models are hardcoded** — Available models for the local provider come from the `VITE_CLIPROXY_MODELS` env var. If the proxy is configured with additional models or the env var is outdated, the app won't see them.

## Architecture Decisions

- **Stateless API client** — All CLIProxy management calls go through a single new module (`CLIProxyManagementClient.ts`) with no internal state. In **dev mode** (`import.meta.env.DEV`), requests use the Vite dev proxy at `/cliproxy` -> `localhost:8317`. In **production**, requests go directly to `VITE_CLIPROXY_BASE_URL`. This mirrors the existing pattern in `AIProvider.ts` (line ~563).
- **No new proxy routes** — The existing `/cliproxy` Vite dev proxy already forwards to the proxy host. Note: in production, a reverse proxy must handle this (same constraint as the existing LLM request path).
- **Auth via env var** — `VITE_CLIPROXY_API_KEY` (accessed via `import.meta.env.VITE_CLIPROXY_API_KEY`) provides the Bearer token for management API calls. This env var is already used in `AIProvider.ts:576`.
- **Graceful degradation** — If the proxy is unreachable, the app falls back to `VITE_CLIPROXY_MODELS` for model lists and disables quota toggles with a notice. No crashes or blocked UI. Key design: `fetchQuotaExceededSettings()` returns `null` (not default false values) on network error, allowing callers to distinguish "proxy unreachable" from "both toggles are intentionally false".
- **Transient model discovery** — Discovered models are held in memory only (not persisted to localStorage) so stale lists don't accumulate.
- **Follow existing patterns** — The CLIProxy settings section mirrors `renderFallbackSection()`/`attachFallbackListeners()` in structure and CSS naming.

## Constraints

- All management API calls must include a 5-second timeout (AbortController) to prevent UI hangs
- CLIProxy section only renders when `isCliProxyConfigured()` returns true (checks `VITE_CLIPROXY_BASE_URL` presence via `import.meta.env`)
- `isCliProxyConfigured()` checks `import.meta.env.VITE_CLIPROXY_BASE_URL` — same env var used in `ProviderManager.ts:158` and `AIProvider.ts:563`
- Toggle failures must revert the checkbox and show a 3-second auto-dismissing error
- Model discovery is fire-and-forget async — must never block app initialization or modal rendering
- `VITE_CLIPROXY_MODELS` env var must continue to work as fallback when proxy is unreachable
- `getManagementBaseURL()` must handle both dev and prod: use `/cliproxy/v0/management` when `import.meta.env.DEV` is true, else `${VITE_CLIPROXY_BASE_URL}/v0/management` (mirrors `AIProvider.ts:565` pattern)
- The Vite proxy at `/cliproxy` rewrites the prefix away (`vite.config.ts:23`), so `/cliproxy/v0/management/config` becomes `/v0/management/config` at the target
- All env vars must use `import.meta.env.VITE_*` (not `process.env`) — this is a Vite project
- All `AbortController` timeouts must be cleared with `clearTimeout` after fetch completes to avoid calling `abort()` on completed requests
- Async DOM-updating methods (`loadCliProxySettings`) must guard with `if (!this.elements.content) return;` after each `await` — the modal may close while the fetch is in-flight, or `renderProviderCards()` may re-render the DOM while the fetch is pending
- `fetchQuotaExceededSettings()` returns `null` on error (not default values) — callers must check for `null` to show "unreachable" vs displaying false-false as valid state

## Files Changed

| File | Action |
|------|--------|
| `Routing/CLIProxyManagementClient.ts` | **CREATE** — API client for management endpoints |
| `Routing/ProviderManagementUI.ts` | **MODIFY** — Add CLIProxy settings section (toggles + model count) |
| `Routing/ProviderManagement.css` | **MODIFY** — Add `.cliproxy-*` styles |
| `Routing/ProviderManager.ts` | **MODIFY** — Add `updateLocalModels()` method |
| `Routing/RoutingManager.ts` | **MODIFY** — Add startup model discovery call |
| `Routing/index.ts` | **MODIFY** — Add barrel exports |

## CLIProxy Management API Reference

Full docs: `/home/joenathan/deepthink/CLIProxyAPIManagementAPI.md`

Key endpoints used:

| Endpoint | Method | Request Body | Response |
|----------|--------|-------------|----------|
| `/v0/management/quota-exceeded/switch-project` | GET | — | `{"switch-project": true}` |
| `/v0/management/quota-exceeded/switch-project` | PUT | `{"value": false}` | `{"status": "ok"}` |
| `/v0/management/quota-exceeded/switch-preview-model` | GET | — | `{"switch-preview-model": true}` |
| `/v0/management/quota-exceeded/switch-preview-model` | PUT | `{"value": false}` | `{"status": "ok"}` |
| `/v0/management/config` | GET | — | Full config with provider key arrays + `openai-compatibility` model entries |

Auth: `Authorization: Bearer <VITE_CLIPROXY_API_KEY>` (via `import.meta.env.VITE_CLIPROXY_API_KEY`)

## Existing Code to Reuse

- `renderFallbackSection()` / `attachFallbackListeners()` pattern in `ProviderManagementUI.ts` (lines 551–674) — template for new section structure and event binding
- `showError()` (line 465) / `showFallbackError()` (line 700) — error display pattern (3s auto-dismiss via `setTimeout(() => errorDiv.remove(), 3000)`)
- `notifyModelsChanged()` (line 543) -> `refreshProviders()` (line 89 in RoutingManager) chain — triggers model list refresh after discovery
- `renderProviderCards()` (line 157) innerHTML template — the CLIProxy section HTML must be appended after the `${this.renderFallbackSection()}` call in the template literal (line 166)
- `attachProviderCardListeners()` / `attachFallbackListeners()` call pattern in `renderProviderCards()` (lines 170–173) — `attachCliProxyListeners()` must be added after `attachFallbackListeners()` on line 173. **Important:** `renderProviderCards()` is called from multiple internal handlers (lines 389, 425, 448, 459, 670, 697) — not just `show()`. The CLIProxy section must survive re-renders, so `loadCliProxySettings()` must be called from `renderProviderCards()` (fire-and-forget), not from `show()`.
- Vite dev proxy at `/cliproxy` (`vite.config.ts:20–24`) — forwards to `VITE_CLIPROXY_BASE_URL || localhost:8317`, stripping the `/cliproxy` prefix
- `import.meta.env.DEV` check in `AIProvider.ts:565` — pattern for dev vs. prod URL selection

---

## Milestones

### Milestone 1 — CLIProxy Management API Client
- **File**: 1.md
- **Status**: complete
- **Summary**: Create `Routing/CLIProxyManagementClient.ts` with types (`CLIProxyConfig`, `CLIProxyOpenAICompatEntry`, `CLIProxyClaudeEntry`, `CLIProxyModelEntry`, `QuotaExceededSettings`), fetch wrappers for quota-exceeded settings and config with dev/prod URL handling, and a pure `discoverModels()` function that extracts models from `openai-compatibility` and `claude-api-key` entries. `fetchQuotaExceededSettings()` returns `null` on error (not default values) to let UI distinguish "unreachable" from "both false".

### Milestone 2 — Quota Exceeded Behavior Toggles UI
- **File**: 2.md
- **Status**: complete
- **Summary**: Add CLIProxy Settings section with two toggles to the Provider Management modal, including CSS styles and async loading with error handling.

### Milestone 3 — Dynamic Model Discovery
- **File**: 3.md
- **Status**: complete
- **Summary**: Wire model discovery from CLIProxy config into `ProviderManager` and `RoutingManager` at startup and modal open, with env var fallback.

### Milestone 4 — Barrel Exports and Build Verification
- **File**: 4.md
- **Status**: complete
- **Summary**: Add barrel exports in `Routing/index.ts` for the new client module and verify the full application builds cleanly.

## Verification (End-to-End)

1. **Quota toggles**: Open Provider Management modal -> CLIProxy Settings section visible -> toggles reflect current proxy state -> toggle one -> verify PUT in Network tab -> re-open modal -> value persisted
2. **Toggles survive re-render**: Open modal -> CLIProxy toggles loaded -> add a custom model to any provider -> verify CLIProxy toggles reload correctly (not stuck disabled). This validates that `loadCliProxySettings()` is called from `renderProviderCards()`, not just `show()`.
3. **Dynamic models**: Remove `VITE_CLIPROXY_MODELS` from `.env` -> restart app -> models still appear from discovery -> restore env var -> stop proxy -> restart app -> env var models used as fallback
4. **Error handling**: Stop proxy -> open modal -> see "CLIProxy unreachable" notice -> toggles disabled -> start proxy -> re-open modal -> settings load correctly
5. **Build**: `npx vite build` succeeds cleanly with zero errors
6. **No env var regression**: `grep -rn 'process\.env' Routing/CLIProxyManagementClient.ts` returns 0 matches. Confirm `VITE_CLIPROXY_BASE_URL`, `VITE_CLIPROXY_MODELS`, and `VITE_CLIPROXY_API_KEY` are all accessed via `import.meta.env` in new code
