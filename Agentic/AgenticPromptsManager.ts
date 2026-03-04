/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AGENTIC_SYSTEM_PROMPT, VERIFIER_SYSTEM_PROMPT } from './AgenticModePrompt';

export interface AgenticPrompts {
    systemPrompt: string;
    verifierPrompt: string;
    model?: string;
    verifierModel?: string;
}

export interface AgenticConfig {
    prompts: AgenticPrompts;
    results?: AgenticResult[];
}

export interface AgenticResult {
    timestamp: string;
    originalContent: string;
    finalContent: string;
    iterations: number;
    model: string;
}

export type AgenticPromptsObserver = (prompts: AgenticPrompts) => void;

export class AgenticPromptsManager {
    private currentPrompts: AgenticPrompts;
    private agenticResults: AgenticResult[] = [];
    private observers: Set<AgenticPromptsObserver> = new Set();

    constructor(initialPrompts?: Partial<AgenticPrompts>) {
        this.currentPrompts = {
            systemPrompt: initialPrompts?.systemPrompt ?? AGENTIC_SYSTEM_PROMPT,
            verifierPrompt: initialPrompts?.verifierPrompt ?? VERIFIER_SYSTEM_PROMPT,
            model: initialPrompts?.model,
            verifierModel: initialPrompts?.verifierModel,
        };
    }

    public subscribe(observer: AgenticPromptsObserver): () => void {
        this.observers.add(observer);
        observer(this.currentPrompts); // immediately invoke with current state
        return () => this.observers.delete(observer);
    }

    private notifyObservers(): void {
        for (const observer of this.observers) {
            observer(this.currentPrompts);
        }
    }

    public updateSystemPrompt(prompt: string): void {
        this.currentPrompts = { ...this.currentPrompts, systemPrompt: prompt };
        this.notifyObservers();
    }

    public updateVerifierPrompt(prompt: string): void {
        this.currentPrompts = { ...this.currentPrompts, verifierPrompt: prompt };
        this.notifyObservers();
    }

    public updateModel(model: string | undefined): void {
        this.currentPrompts = { ...this.currentPrompts, model };
        if (!model) {
            delete this.currentPrompts.model;
        }
        this.notifyObservers();
    }

    public updateVerifierModel(model: string | undefined): void {
        this.currentPrompts = { ...this.currentPrompts, verifierModel: model };
        if (!model) {
            delete this.currentPrompts.verifierModel;
        }
        this.notifyObservers();
    }

    public getAgenticPrompts(): AgenticPrompts {
        return this.currentPrompts;
    }

    public setAgenticPrompts(prompts: AgenticPrompts): void {
        this.currentPrompts = { ...prompts };
        this.notifyObservers();
    }

    public addResult(result: AgenticResult): void {
        this.agenticResults.push(result);
    }

    public getResults(): AgenticResult[] {
        return this.agenticResults;
    }

    public clearResults(): void {
        this.agenticResults = [];
    }

    public exportConfig(): AgenticConfig {
        return {
            prompts: { ...this.currentPrompts },
            results: [...this.agenticResults]
        };
    }

    public importConfig(config: AgenticConfig): void {
        if (config.prompts) {
            this.currentPrompts = { ...config.prompts };
            this.notifyObservers();
        }
        if (config.results) {
            this.agenticResults = [...config.results];
        }
    }

    public resetToDefaults(): void {
        this.currentPrompts = {
            systemPrompt: AGENTIC_SYSTEM_PROMPT,
            verifierPrompt: VERIFIER_SYSTEM_PROMPT
        };
        this.notifyObservers();
    }
}
