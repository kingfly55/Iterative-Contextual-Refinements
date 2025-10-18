/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomizablePromptsContextual, createDefaultCustomPromptsContextual } from './ContextualPrompts';

export class ContextualPromptsManager {
    private promptsRef: { current: CustomizablePromptsContextual };

    constructor(promptsRef: { current: CustomizablePromptsContextual }) {
        this.promptsRef = promptsRef;
        // Initialize with defaults if needed
        if (!this.promptsRef.current.sys_contextual_mainGenerator) {
            const defaults = createDefaultCustomPromptsContextual();
            this.promptsRef.current = defaults;
        }
    }

    public initializeTextareas(): void {
        const textareaMap: { [key: string]: keyof CustomizablePromptsContextual } = {
            'sys-contextual-main-generator': 'sys_contextual_mainGenerator',
            'sys-contextual-iterative-agent': 'sys_contextual_iterativeAgent',
            'sys-contextual-solution-pool': 'sys_contextual_solutionPoolAgent',
            'sys-contextual-memory': 'sys_contextual_memoryAgent'
        };

        for (const [elementId, promptKey] of Object.entries(textareaMap)) {
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = this.promptsRef.current[promptKey] || '';
                textarea.addEventListener('input', (e) => {
                    this.promptsRef.current[promptKey] = (e.target as HTMLTextAreaElement).value;
                });
            }
        }
    }

    public initializeModelSelectors(): void {
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsContextual } = {
            'contextual-main-generator': 'model_mainGenerator',
            'contextual-iterative-agent': 'model_iterativeAgent',
            'contextual-solution-pool': 'model_solutionPoolAgent',
            'contextual-memory': 'model_memoryAgent'
        };

        for (const [agentKey, modelField] of Object.entries(modelSelectorMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.promptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';

                selector.addEventListener('change', (e) => {
                    const selectedValue = (e.target as HTMLSelectElement).value;
                    if (selectedValue === '') {
                        delete this.promptsRef.current[modelField];
                    } else {
                        (this.promptsRef.current as any)[modelField] = selectedValue;
                    }
                });
            }
        }
    }

    public updateTextareasFromState(): void {
        const textareaMap: { [key: string]: keyof CustomizablePromptsContextual } = {
            'sys-contextual-main-generator': 'sys_contextual_mainGenerator',
            'sys-contextual-iterative-agent': 'sys_contextual_iterativeAgent',
            'sys-contextual-solution-pool': 'sys_contextual_solutionPoolAgent',
            'sys-contextual-memory': 'sys_contextual_memoryAgent'
        };

        for (const [elementId, promptKey] of Object.entries(textareaMap)) {
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = this.promptsRef.current[promptKey] || '';
            }
        }
    }

    public updateModelSelectorsFromState(): void {
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsContextual } = {
            'contextual-main-generator': 'model_mainGenerator',
            'contextual-iterative-agent': 'model_iterativeAgent',
            'contextual-solution-pool': 'model_solutionPoolAgent',
            'contextual-memory': 'model_memoryAgent'
        };

        for (const [agentKey, modelField] of Object.entries(modelSelectorMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.promptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';
            }
        }
    }

    public getPrompts(): CustomizablePromptsContextual {
        return this.promptsRef.current;
    }

    public setPrompts(prompts: CustomizablePromptsContextual): void {
        this.promptsRef.current = prompts;
    }

    public resetToDefaults(): void {
        this.promptsRef.current = createDefaultCustomPromptsContextual();
        this.updateTextareasFromState();
        this.updateModelSelectorsFromState();
    }
}
