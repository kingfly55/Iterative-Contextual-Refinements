/**
 * APIRequestController — Central controller for all LLM API requests.
 *
 * Responsibilities:
 *   1. Per-provider throttle: minimum 2 seconds between requests to the same provider.
 *   2. Exponential backoff with jitter on 429 / rate-limit errors.
 *   3. Fallback chain: when a model is rate-limited, try configured fallback models.
 *   4. Integration with QuotaBackoffManager for pipeline-level pause.
 *
 * All application modes (Deepthink, Website, Contextual, Agentic, Adaptive)
 * should call `apiRequestController.request()` instead of `callAI()` directly.
 */

import { GenerateContentResponse, Part } from '@google/genai';
import { callAI, StructuredMessage } from './AIService';
import { ThinkingConfig } from './AIProvider';
import { getQuotaBackoffManager, PipelineQuotaPausedError } from '../Deepthink/QuotaBackoffManager';

// ── Types ──

export interface APIRequestOptions {
    promptOrParts: string | Part[] | StructuredMessage[];
    temperature: number;
    model: string;
    systemInstruction?: string;
    isJsonOutput?: boolean;
    topP?: number;
    thinkingConfig?: ThinkingConfig;
    /** Max retry attempts (default: 3) */
    maxRetries?: number;
    /** Skip fallback chain for this request */
    skipFallback?: boolean;
    /** Abort signal — checked between retries */
    signal?: AbortSignal;
    /** Optional label for logging */
    label?: string;
}

export interface FallbackRule {
    /** Primary model slug */
    primary: string;
    /** Ordered list of fallback model slugs */
    fallbacks: string[];
}

export interface FallbackConfig {
    enabled: boolean;
    rules: FallbackRule[];
}

export interface ProviderRateLimitState {
    /** Consecutive 429 count for this provider */
    consecutive429Count: number;
    /** Timestamp when the provider will be considered available again */
    backoffUntil: number;
    /** Current backoff level (increases with consecutive 429s) */
    backoffLevel: number;
}

// ── Constants ──

/** Minimum milliseconds between requests to the same provider */
const THROTTLE_INTERVAL_MS = 2000;

/** Base delay for 429 backoff (ms). Actual = BASE * 2^level + jitter */
const BACKOFF_BASE_MS = 5000;

/** Maximum backoff delay (ms) — cap at 2 minutes */
const BACKOFF_MAX_MS = 120_000;

/** Default max retries per request */
const DEFAULT_MAX_RETRIES = 3;

/** Jitter range: 0–2000 ms added to each backoff delay */
const JITTER_MAX_MS = 2000;

/** localStorage key for fallback config */
const FALLBACK_STORAGE_KEY = 'api-fallback-config';

// ── Helpers ──

function is429Error(error: any): boolean {
    return (
        error?.status === 429 ||
        error?.error?.type === 'model_cooldown' ||
        /\b429\b|rate.?limit|model_cooldown/i.test(String(error?.message || ''))
    );
}

function jitter(): number {
    return Math.floor(Math.random() * JITTER_MAX_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Aborted'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
        }, { once: true });
    });
}

// ── Controller ──

export class APIRequestController {
    /**
     * Per-provider: timestamp of the last request sent.
     * Used to enforce the 2-second throttle.
     */
    private lastRequestTime: Map<string, number> = new Map();

    /**
     * Per-provider: a promise that resolves when the throttle slot is free.
     * Chaining onto this ensures serial throttle enforcement even when
     * multiple callers queue concurrently.
     */
    private providerQueue: Map<string, Promise<void>> = new Map();

    /** Per-provider rate limit tracking */
    private rateLimitState: Map<string, ProviderRateLimitState> = new Map();

    /** Fallback configuration */
    private fallbackConfig: FallbackConfig;

    /** Callback to resolve model → provider name */
    private modelToProviderResolver: ((modelId: string) => string | null) | null = null;

    constructor() {
        this.fallbackConfig = this.loadFallbackConfig();
    }

    // ── Configuration ──

    setModelToProviderResolver(resolver: (modelId: string) => string | null): void {
        this.modelToProviderResolver = resolver;
    }

    getFallbackConfig(): FallbackConfig {
        return { ...this.fallbackConfig, rules: this.fallbackConfig.rules.map(r => ({ ...r, fallbacks: [...r.fallbacks] })) };
    }

    setFallbackConfig(config: FallbackConfig): void {
        this.fallbackConfig = config;
        this.saveFallbackConfig(config);
    }

    addFallbackRule(rule: FallbackRule): void {
        // Replace existing rule for same primary, or add new
        const idx = this.fallbackConfig.rules.findIndex(r => r.primary === rule.primary);
        if (idx >= 0) {
            this.fallbackConfig.rules[idx] = rule;
        } else {
            this.fallbackConfig.rules.push(rule);
        }
        this.saveFallbackConfig(this.fallbackConfig);
    }

    removeFallbackRule(primaryModel: string): void {
        this.fallbackConfig.rules = this.fallbackConfig.rules.filter(r => r.primary !== primaryModel);
        this.saveFallbackConfig(this.fallbackConfig);
    }

    getFallbacksForModel(modelId: string): string[] {
        if (!this.fallbackConfig.enabled) return [];
        const rule = this.fallbackConfig.rules.find(r => r.primary === modelId);
        return rule ? [...rule.fallbacks] : [];
    }

    // ── Main Request Method ──

    /**
     * Send an API request with throttling, backoff, and fallback.
     *
     * Flow:
     *   1. Determine provider for the model
     *   2. Wait for throttle slot (2s min between requests per provider)
     *   3. If provider is in backoff from a recent 429, wait
     *   4. Send request via callAI()
     *   5. On 429: bump backoff, notify QuotaBackoffManager, try fallback if available
     *   6. On success: reset provider's 429 counter
     */
    async request(opts: APIRequestOptions): Promise<GenerateContentResponse> {
        const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
        const modelsToTry = [opts.model];

        // Build fallback chain
        if (!opts.skipFallback) {
            const fallbacks = this.getFallbacksForModel(opts.model);
            modelsToTry.push(...fallbacks);
        }

        let lastError: any = null;

        for (const modelId of modelsToTry) {
            try {
                const result = await this.requestWithRetries(opts, modelId, maxRetries);
                return result;
            } catch (error: any) {
                lastError = error;

                // Non-retryable errors — propagate immediately
                if (error instanceof PipelineQuotaPausedError) throw error;
                if (error?.message === 'Aborted' || opts.signal?.aborted) throw error;

                // If this was a 429 and we have more fallbacks, continue to next model
                if (is429Error(error) && modelId !== modelsToTry[modelsToTry.length - 1]) {
                    const nextModel = modelsToTry[modelsToTry.indexOf(modelId) + 1];
                    console.warn(
                        `[APIRequestController] ${modelId} rate-limited, falling back to ${nextModel}`
                    );
                    continue;
                }

                // For non-429 errors on non-last model, also try next fallback
                if (modelId !== modelsToTry[modelsToTry.length - 1]) {
                    console.warn(
                        `[APIRequestController] ${modelId} failed (${error?.message}), trying next fallback`
                    );
                    continue;
                }

                // Last model in chain — throw
                throw error;
            }
        }

        // Should not reach here, but safety net
        throw lastError || new Error('All models in fallback chain failed');
    }

    // ── Internal: Retry Loop for a Single Model ──

    private async requestWithRetries(
        opts: APIRequestOptions,
        modelId: string,
        maxRetries: number
    ): Promise<GenerateContentResponse> {
        const providerName = this.resolveProvider(modelId);
        const quotaManager = getQuotaBackoffManager();
        const label = opts.label || modelId;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            // Check abort
            if (opts.signal?.aborted) throw new Error('Aborted');

            // Check quota pause
            if (quotaManager.isPaused()) {
                throw new PipelineQuotaPausedError(`Quota paused before attempt for: ${label}`);
            }

            // Wait for provider-level backoff (from previous 429s)
            await this.waitForProviderBackoff(providerName, opts.signal);

            // Throttle: wait for the per-provider 2s slot
            await this.throttle(providerName, opts.signal);

            try {
                const response = await callAI(
                    opts.promptOrParts,
                    opts.temperature,
                    modelId,
                    opts.systemInstruction,
                    opts.isJsonOutput ?? false,
                    opts.topP,
                    opts.thinkingConfig
                );

                const text = response?.text || '';
                if (!text.trim()) {
                    throw new Error('Empty response from API');
                }

                // Success — reset rate limit state for this provider
                this.resetRateLimitState(providerName);
                quotaManager.recordSuccess();

                return response;
            } catch (error: any) {
                // Non-retryable
                if (error instanceof PipelineQuotaPausedError) throw error;
                if (error?.message === 'Aborted' || opts.signal?.aborted) throw error;

                if (is429Error(error)) {
                    this.recordProviderRateLimit(providerName);
                    console.warn(
                        `[APIRequestController] 429 on ${modelId} (attempt ${attempt + 1}/${maxRetries + 1})`,
                        error?.message
                    );

                    // Notify global quota manager
                    if (quotaManager.recordQuotaError()) {
                        throw new PipelineQuotaPausedError(`Quota exceeded during: ${label}`);
                    }

                    // On 429, propagate up to let the fallback chain try next model
                    // (unless this is the last retry for this model)
                    if (attempt === maxRetries) {
                        throw error;
                    }

                    // Backoff before retry — the waitForProviderBackoff at top of loop handles this
                    continue;
                }

                // Non-429 errors
                if (attempt === maxRetries) {
                    throw error;
                }

                // Generic retry backoff for non-429 errors
                const delay = Math.min(
                    BACKOFF_BASE_MS * Math.pow(2, attempt) + jitter(),
                    BACKOFF_MAX_MS
                );
                console.warn(
                    `[APIRequestController] ${label} attempt ${attempt + 1}/${maxRetries + 1} failed: ${error?.message}. Retrying in ${(delay / 1000).toFixed(1)}s`
                );
                await sleep(delay, opts.signal);
            }
        }

        throw new Error(`All ${maxRetries + 1} attempts failed for ${label}`);
    }

    // ── Throttle ──

    /**
     * Ensures minimum THROTTLE_INTERVAL_MS between requests to the same provider.
     * Uses a promise chain per provider so concurrent callers queue in order.
     */
    private async throttle(providerName: string, signal?: AbortSignal): Promise<void> {
        const previous = this.providerQueue.get(providerName) || Promise.resolve();

        const slot = previous.then(async () => {
            const lastTime = this.lastRequestTime.get(providerName) || 0;
            const elapsed = Date.now() - lastTime;
            const wait = Math.max(0, THROTTLE_INTERVAL_MS - elapsed);

            if (wait > 0) {
                await sleep(wait, signal);
            }

            this.lastRequestTime.set(providerName, Date.now());
        });

        // Store the chained promise so the next caller waits for us
        this.providerQueue.set(providerName, slot.catch(() => {}));
        await slot;
    }

    // ── Per-Provider Rate Limit Backoff ──

    private getOrCreateRateLimitState(providerName: string): ProviderRateLimitState {
        let state = this.rateLimitState.get(providerName);
        if (!state) {
            state = { consecutive429Count: 0, backoffUntil: 0, backoffLevel: 0 };
            this.rateLimitState.set(providerName, state);
        }
        return state;
    }

    private recordProviderRateLimit(providerName: string): void {
        const state = this.getOrCreateRateLimitState(providerName);
        state.consecutive429Count++;
        state.backoffLevel = Math.min(state.backoffLevel + 1, 6); // cap at 2^6 = 64x base

        const delay = Math.min(
            BACKOFF_BASE_MS * Math.pow(2, state.backoffLevel) + jitter(),
            BACKOFF_MAX_MS
        );
        state.backoffUntil = Date.now() + delay;

        console.warn(
            `[APIRequestController] Provider '${providerName}' 429 #${state.consecutive429Count}, ` +
            `backoff ${(delay / 1000).toFixed(1)}s (level ${state.backoffLevel})`
        );
    }

    private resetRateLimitState(providerName: string): void {
        const state = this.rateLimitState.get(providerName);
        if (state) {
            state.consecutive429Count = 0;
            state.backoffLevel = 0;
            state.backoffUntil = 0;
        }
    }

    private async waitForProviderBackoff(providerName: string, signal?: AbortSignal): Promise<void> {
        const state = this.rateLimitState.get(providerName);
        if (!state) return;

        const wait = state.backoffUntil - Date.now();
        if (wait > 0) {
            console.log(
                `[APIRequestController] Waiting ${(wait / 1000).toFixed(1)}s for provider '${providerName}' backoff`
            );
            await sleep(wait, signal);
        }
    }

    // ── Provider Resolution ──

    private resolveProvider(modelId: string): string {
        if (this.modelToProviderResolver) {
            const provider = this.modelToProviderResolver(modelId);
            if (provider) return provider;
        }
        // Heuristic fallback
        if (modelId.includes('gemini')) return 'gemini';
        if (modelId.includes('gpt') || modelId.includes('o3') || modelId.includes('o4')) return 'openai';
        if (modelId.includes('claude')) return 'anthropic';
        if (modelId.includes('/')) return 'openrouter'; // e.g. deepseek/deepseek-chat-v3.1:free
        return 'unknown';
    }

    // ── Persistence ──

    private loadFallbackConfig(): FallbackConfig {
        try {
            const stored = localStorage.getItem(FALLBACK_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed.enabled === 'boolean' && Array.isArray(parsed.rules)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error('[APIRequestController] Failed to load fallback config:', e);
        }
        return { enabled: true, rules: [] };
    }

    private saveFallbackConfig(config: FallbackConfig): void {
        try {
            localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(config));
        } catch (e) {
            console.error('[APIRequestController] Failed to save fallback config:', e);
        }
    }

    // ── Reset ──

    /** Clear all throttle/backoff state (e.g. on new pipeline run) */
    resetAll(): void {
        this.lastRequestTime.clear();
        this.providerQueue.clear();
        this.rateLimitState.clear();
    }

    /** Reset rate limit state only (keeps throttle timing) */
    resetRateLimits(): void {
        this.rateLimitState.clear();
    }
}

// ── Singleton ──

let _instance: APIRequestController | null = null;

export function getAPIRequestController(): APIRequestController {
    if (!_instance) {
        _instance = new APIRequestController();
    }
    return _instance;
}
