/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vite/client" />

// ── Types ──────────────────────────────────────────────────────────────────

export interface CLIProxyModelEntry {
    name: string;
    alias?: string;
}

export interface CLIProxyOpenAICompatEntry {
    name: string;
    'base-url': string;
    models?: CLIProxyModelEntry[];
    'excluded-models'?: string[];
}

export interface CLIProxyClaudeEntry {
    'api-key'?: string;
    'base-url'?: string;
    'proxy-url'?: string;
    models?: CLIProxyModelEntry[];
    'excluded-models'?: string[];
}

export interface CLIProxyConfig {
    'openai-compatibility'?: CLIProxyOpenAICompatEntry[];
    'claude-api-key'?: CLIProxyClaudeEntry[];
    'quota-exceeded'?: {
        'switch-project'?: boolean;
        'switch-preview-model'?: boolean;
    };
    [key: string]: unknown;
}

export interface QuotaExceededSettings {
    switchProject: boolean;
    switchPreviewModel: boolean;
}

// ── URL & Auth Helpers ─────────────────────────────────────────────────────

/**
 * Returns true when the CLIProxy base URL env var is set, indicating the
 * proxy is configured for this deployment.
 */
export function isCliProxyConfigured(): boolean {
    return Boolean(import.meta.env.VITE_CLIPROXY_BASE_URL);
}

/**
 * Returns the base URL for the CLIProxy Management API.
 * In dev mode, routes through the Vite proxy at /cliproxy (which strips the
 * prefix before forwarding to the target). In production, uses the base URL
 * env var directly.
 */
export function getManagementBaseURL(): string {
    if (import.meta.env.DEV) {
        return '/cliproxy/v0/management';
    }
    return `${import.meta.env.VITE_CLIPROXY_BASE_URL}/v0/management`;
}

/**
 * Returns the auth and content-type headers for management API requests.
 * Uses VITE_CLIPROXY_MANAGEMENT_KEY (the management API key), which is
 * distinct from VITE_CLIPROXY_API_KEY (the LLM request API key).
 */
export function getAuthHeaders(): Record<string, string> {
    return {
        'Authorization': `Bearer ${import.meta.env.VITE_CLIPROXY_MANAGEMENT_KEY}`,
        'Content-Type': 'application/json',
    };
}

// ── Private Fetch Helper ───────────────────────────────────────────────────

/**
 * Internal helper that wraps fetch with a 5-second AbortController timeout
 * and auth headers. Propagates errors — callers control their own catch logic.
 */
async function managementFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(`${getManagementBaseURL()}${path}`, {
            ...options,
            headers: {
                ...getAuthHeaders(),
                ...(options.headers as Record<string, string> | undefined),
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// ── Quota Exceeded — Switch Project ───────────────────────────────────────

/**
 * GETs the current value of the switch-project quota toggle.
 * Returns false on any error.
 */
export async function getQuotaSwitchProject(): Promise<boolean> {
    try {
        const response = await managementFetch('/quota-exceeded/switch-project');
        if (!response.ok) return false;
        const data = await response.json();
        return Boolean(data['switch-project']);
    } catch {
        return false;
    }
}

/**
 * PUTs a new value for the switch-project quota toggle.
 * Returns true on success, false on any error.
 */
export async function setQuotaSwitchProject(value: boolean): Promise<boolean> {
    try {
        const response = await managementFetch('/quota-exceeded/switch-project', {
            method: 'PUT',
            body: JSON.stringify({ value }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

// ── Quota Exceeded — Switch Preview Model ─────────────────────────────────

/**
 * GETs the current value of the switch-preview-model quota toggle.
 * Returns false on any error.
 */
export async function getQuotaSwitchPreviewModel(): Promise<boolean> {
    try {
        const response = await managementFetch('/quota-exceeded/switch-preview-model');
        if (!response.ok) return false;
        const data = await response.json();
        return Boolean(data['switch-preview-model']);
    } catch {
        return false;
    }
}

/**
 * PUTs a new value for the switch-preview-model quota toggle.
 * Returns true on success, false on any error.
 */
export async function setQuotaSwitchPreviewModel(value: boolean): Promise<boolean> {
    try {
        const response = await managementFetch('/quota-exceeded/switch-preview-model', {
            method: 'PUT',
            body: JSON.stringify({ value }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

// ── Combined Quota Settings ────────────────────────────────────────────────

/**
 * Fetches both quota-exceeded toggles in parallel using its own fetch calls
 * (does NOT delegate to getQuotaSwitchProject / getQuotaSwitchPreviewModel,
 * which swallow errors). Returns null when the proxy is unreachable so callers
 * can distinguish "proxy down" from "both toggles are intentionally false".
 */
export async function fetchQuotaExceededSettings(): Promise<QuotaExceededSettings | null> {
    try {
        const [projectResponse, previewResponse] = await Promise.all([
            managementFetch('/quota-exceeded/switch-project'),
            managementFetch('/quota-exceeded/switch-preview-model'),
        ]);

        if (!projectResponse.ok || !previewResponse.ok) {
            return null;
        }

        const [projectData, previewData] = await Promise.all([
            projectResponse.json(),
            previewResponse.json(),
        ]);

        return {
            switchProject: Boolean(projectData['switch-project']),
            switchPreviewModel: Boolean(previewData['switch-preview-model']),
        };
    } catch {
        return null;
    }
}

// ── Config ─────────────────────────────────────────────────────────────────

/**
 * Fetches the full CLIProxy config from GET /config.
 * Returns an empty CLIProxyConfig (with no arrays) on any error — never null.
 */
export async function fetchConfig(): Promise<CLIProxyConfig> {
    try {
        const response = await managementFetch('/config');
        if (!response.ok) return {};
        const data = await response.json();
        return data as CLIProxyConfig;
    } catch {
        return {};
    }
}

// ── Model Discovery ────────────────────────────────────────────────────────

/**
 * Pure function that extracts deduplicated model IDs from a CLIProxyConfig.
 * Extracts models from openai-compatibility entries and claude-api-key entries.
 * Uses alias if present, otherwise name.
 * Does NOT extract from key-only entry types that lack models arrays.
 * Guards against entries where models is undefined.
 */
export function discoverModels(config: CLIProxyConfig): string[] {
    const seen = new Set<string>();

    // Extract from openai-compatibility entries
    for (const entry of (config['openai-compatibility'] || [])) {
        entry.models?.forEach((model) => {
            seen.add(model.alias || model.name);
        });
    }

    // Extract from claude-api-key entries
    for (const entry of (config['claude-api-key'] || [])) {
        entry.models?.forEach((model) => {
            seen.add(model.alias || model.name);
        });
    }

    return Array.from(seen);
}
