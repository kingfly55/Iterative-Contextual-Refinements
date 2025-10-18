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

export class AgenticPromptsManager {
    private agenticPromptsRef: { current: AgenticPrompts };
    private agenticResults: AgenticResult[] = [];

    constructor(agenticPromptsRef: { current: AgenticPrompts }) {
        this.agenticPromptsRef = agenticPromptsRef;
        // Initialize with default system prompt
        if (!this.agenticPromptsRef.current.systemPrompt) {
            this.agenticPromptsRef.current.systemPrompt = AGENTIC_SYSTEM_PROMPT;
        }
        // Initialize with default verifier prompt
        if (!this.agenticPromptsRef.current.verifierPrompt) {
            this.agenticPromptsRef.current.verifierPrompt = VERIFIER_SYSTEM_PROMPT;
        }
    }

    public initializeTextarea(): void {
        // Initialize main agent textarea
        const textarea = document.getElementById('sys-agentic') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = this.agenticPromptsRef.current.systemPrompt;
            textarea.addEventListener('input', (e) => {
                this.agenticPromptsRef.current.systemPrompt = (e.target as HTMLTextAreaElement).value;
            });
        }
        
        // Initialize verifier agent textarea
        const verifierTextarea = document.getElementById('sys-agentic-verifier') as HTMLTextAreaElement;
        if (verifierTextarea) {
            verifierTextarea.value = this.agenticPromptsRef.current.verifierPrompt;
            verifierTextarea.addEventListener('input', (e) => {
                this.agenticPromptsRef.current.verifierPrompt = (e.target as HTMLTextAreaElement).value;
            });
        }
    }

    public initializeModelSelector(): void {
        // Initialize main agent model selector
        const selector = document.querySelector('[data-agent="agentic"]') as HTMLSelectElement;
        if (selector) {
            const currentValue = this.agenticPromptsRef.current.model;
            selector.value = currentValue || '';

            selector.addEventListener('change', (e) => {
                const selectedValue = (e.target as HTMLSelectElement).value;
                if (selectedValue === '') {
                    delete this.agenticPromptsRef.current.model;
                } else {
                    this.agenticPromptsRef.current.model = selectedValue;
                }
            });
        }
        
        // Initialize verifier model selector
        const verifierSelector = document.querySelector('[data-agent="agentic-verifier"]') as HTMLSelectElement;
        if (verifierSelector) {
            const currentValue = this.agenticPromptsRef.current.verifierModel;
            verifierSelector.value = currentValue || '';

            verifierSelector.addEventListener('change', (e) => {
                const selectedValue = (e.target as HTMLSelectElement).value;
                if (selectedValue === '') {
                    delete this.agenticPromptsRef.current.verifierModel;
                } else {
                    this.agenticPromptsRef.current.verifierModel = selectedValue;
                }
            });
        }
    }

    public updateTextareaFromState(): void {
        const textarea = document.getElementById('sys-agentic') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = this.agenticPromptsRef.current.systemPrompt;
        }
        
        const verifierTextarea = document.getElementById('sys-agentic-verifier') as HTMLTextAreaElement;
        if (verifierTextarea) {
            verifierTextarea.value = this.agenticPromptsRef.current.verifierPrompt;
        }
    }

    public updateModelSelectorFromState(): void {
        const selector = document.querySelector('[data-agent="agentic"]') as HTMLSelectElement;
        if (selector) {
            const currentValue = this.agenticPromptsRef.current.model;
            selector.value = currentValue || '';
        }
        
        const verifierSelector = document.querySelector('[data-agent="agentic-verifier"]') as HTMLSelectElement;
        if (verifierSelector) {
            const currentValue = this.agenticPromptsRef.current.verifierModel;
            verifierSelector.value = currentValue || '';
        }
    }

    public getAgenticPrompts(): AgenticPrompts {
        return this.agenticPromptsRef.current;
    }

    public setAgenticPrompts(prompts: AgenticPrompts): void {
        this.agenticPromptsRef.current = prompts;
    }

    public addResult(result: AgenticResult): void {
        this.agenticResults.push(result);
        // No artificial limits on results
    }

    public getResults(): AgenticResult[] {
        return this.agenticResults;
    }

    public clearResults(): void {
        this.agenticResults = [];
    }

    public exportConfig(): AgenticConfig {
        return {
            prompts: this.agenticPromptsRef.current,
            results: this.agenticResults
        };
    }

    public importConfig(config: AgenticConfig): void {
        if (config.prompts) {
            this.agenticPromptsRef.current = config.prompts;
            this.updateTextareaFromState();
            this.updateModelSelectorFromState();
        }
        if (config.results) {
            this.agenticResults = config.results;
        }
    }

    public resetToDefaults(): void {
        this.agenticPromptsRef.current = {
            systemPrompt: AGENTIC_SYSTEM_PROMPT,
            verifierPrompt: VERIFIER_SYSTEM_PROMPT
        };
        this.updateTextareaFromState();
        this.updateModelSelectorFromState();
    }
}
