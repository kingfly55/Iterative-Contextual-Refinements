/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ModelOption {
    value: string;
    label: string;
    description?: string;
    provider?: string;
}

export interface ModelParameters {
    temperature: number;
    topP: number;
    refinementStages: number;
    strategiesCount: number;
    subStrategiesCount: number;
    hypothesisCount: number;
    redTeamAggressiveness: string;
    refinementEnabled: boolean;
    skipSubStrategies: boolean;
    dissectedObservationsEnabled: boolean;
    iterativeCorrectionsEnabled: boolean;
    iterativeDepth: number;
    provideAllSolutionsToCorrectors: boolean;
    postQualityFilterEnabled: boolean;
    deepthinkCodeExecutionEnabled: boolean;
    quotaBackoffDurationHours: number;
    quotaCyclicResetEnabled: boolean;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;
    quotaMaxCyclesPerSession: number;
}

export const AVAILABLE_MODELS: ModelOption[] = [
    // Default models - will be populated dynamically by ProviderManager
];

export const DEFAULT_TEMPERATURES = [0, 0.7, 1.0, 1.5, 2.0];

export const DEFAULT_MODEL_PARAMETERS: ModelParameters = {
    temperature: 1.0,
    topP: 0.95,
    refinementStages: 3,
    strategiesCount: 3,
    subStrategiesCount: 3,
    hypothesisCount: 4,
    redTeamAggressiveness: 'balanced',
    refinementEnabled: false,
    skipSubStrategies: false,
    dissectedObservationsEnabled: false,
    iterativeCorrectionsEnabled: false,
    iterativeDepth: 3,
    provideAllSolutionsToCorrectors: false,
    postQualityFilterEnabled: false,
    deepthinkCodeExecutionEnabled: false,
    quotaBackoffDurationHours: 0,
    quotaCyclicResetEnabled: true,
    quotaConsecutive429Threshold: 2,
    quotaAutoResumeEnabled: true,
    quotaMaxCyclesPerSession: 5
};

export class ModelConfigManager {
    private parameters: ModelParameters;
    private selectedModel: string;
    private availableModels: ModelOption[] = [];

    constructor() {
        this.parameters = { ...DEFAULT_MODEL_PARAMETERS };
        this.selectedModel = 'gemini-2.5-pro';
    }

    public getSelectedModel(): string {
        return this.selectedModel;
    }

    public setSelectedModel(model: string): void {
        this.selectedModel = model;
    }

    public getParameters(): ModelParameters {
        return { ...this.parameters };
    }

    public updateParameter<K extends keyof ModelParameters>(
        key: K,
        value: ModelParameters[K]
    ): void {
        this.parameters[key] = value;
    }

    public getTemperature(): number {
        return Math.max(0, Math.min(2, this.parameters.temperature));
    }

    public getTopP(): number {
        return Math.max(0, Math.min(1, this.parameters.topP));
    }

    public getRefinementStages(): number {
        return Math.max(1, Math.min(5, this.parameters.refinementStages));
    }

    public getStrategiesCount(): number {
        return Math.max(1, Math.min(10, this.parameters.strategiesCount));
    }

    public getSubStrategiesCount(): number {
        return Math.max(1, Math.min(10, this.parameters.subStrategiesCount));
    }

    public getHypothesisCount(): number {
        return Math.max(0, Math.min(6, this.parameters.hypothesisCount));
    }

    public getRedTeamAggressiveness(): string {
        return this.parameters.redTeamAggressiveness;
    }

    public isRefinementEnabled(): boolean {
        return this.parameters.refinementEnabled;
    }

    public isSkipSubStrategies(): boolean {
        return this.parameters.skipSubStrategies;
    }

    public isDissectedObservationsEnabled(): boolean {
        // Dissected observations can only be enabled if refinement is enabled
        return this.parameters.refinementEnabled && this.parameters.dissectedObservationsEnabled;
    }

    public isIterativeCorrectionsEnabled(): boolean {
        // Iterative corrections can only be enabled if refinement is enabled
        return this.parameters.refinementEnabled && this.parameters.iterativeCorrectionsEnabled;
    }

    public getIterativeDepth(): number {
        return Math.max(1, Math.min(10, this.parameters.iterativeDepth));
    }

    public isProvideAllSolutionsToCorrectors(): boolean {
        // Can only be enabled if refinement is enabled
        return this.parameters.refinementEnabled && this.parameters.provideAllSolutionsToCorrectors;
    }

    public isPostQualityFilterEnabled(): boolean {
        return this.parameters.postQualityFilterEnabled;
    }

    public isDeepthinkCodeExecutionEnabled(): boolean {
        return this.parameters.deepthinkCodeExecutionEnabled;
    }

    public getModelProvider(modelValue?: string): string {
        // Use instance's availableModels (dynamically populated), not the empty AVAILABLE_MODELS constant
        const model = this.availableModels.find(m => m.value === (modelValue || this.selectedModel));
        return model?.provider || 'google';
    }

    public getModelsByProvider(provider: string): ModelOption[] {
        return this.availableModels.filter(m => m.provider === provider);
    }

    public setAvailableModels(models: ModelOption[]): void {
        this.availableModels = models;
        // If current selected model is not available, select the first available model
        if (!models.some(m => m.value === this.selectedModel) && models.length > 0) {
            this.selectedModel = models[0].value;
        }
    }

    public getAvailableModels(): ModelOption[] {
        return [...this.availableModels];
    }

    /**
     * Resolve a model ID to its provider name.
     * Used by APIRequestController for per-provider throttling.
     */
    public resolveModelProvider(modelId: string): string | null {
        const model = this.availableModels.find(m => m.value === modelId);
        return model?.provider || null;
    }
}