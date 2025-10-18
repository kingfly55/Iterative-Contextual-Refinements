/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomizablePromptsAdaptiveDeepthink, createDefaultCustomPromptsAdaptiveDeepthink } from './AdaptiveDeepthinkPrompt';

export class AdaptiveDeepthinkPromptsManager {
    private promptsRef: { current: CustomizablePromptsAdaptiveDeepthink };

    constructor(promptsRef: { current: CustomizablePromptsAdaptiveDeepthink }) {
        this.promptsRef = promptsRef;
        // Initialize with defaults if needed
        if (!this.promptsRef.current.sys_adaptiveDeepthink_main) {
            const defaults = createDefaultCustomPromptsAdaptiveDeepthink();
            this.promptsRef.current = defaults;
        }
    }

    public initializeTextareas(): void {
        const textareaMap: { [key: string]: keyof CustomizablePromptsAdaptiveDeepthink } = {
            'sys-adaptive-main': 'sys_adaptiveDeepthink_main',
            'sys-adaptive-strategy-gen': 'sys_adaptiveDeepthink_strategyGeneration',
            'sys-adaptive-hypothesis-gen': 'sys_adaptiveDeepthink_hypothesisGeneration',
            'sys-adaptive-hypothesis-test': 'sys_adaptiveDeepthink_hypothesisTesting',
            'sys-adaptive-execution': 'sys_adaptiveDeepthink_execution',
            'sys-adaptive-critique': 'sys_adaptiveDeepthink_solutionCritique',
            'sys-adaptive-corrector': 'sys_adaptiveDeepthink_corrector',
            'sys-adaptive-judge': 'sys_adaptiveDeepthink_finalJudge'
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
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsAdaptiveDeepthink } = {
            'adaptive-main': 'model_main',
            'adaptive-strategy-gen': 'model_strategyGeneration',
            'adaptive-hypothesis-gen': 'model_hypothesisGeneration',
            'adaptive-hypothesis-test': 'model_hypothesisTesting',
            'adaptive-execution': 'model_execution',
            'adaptive-critique': 'model_solutionCritique',
            'adaptive-corrector': 'model_corrector',
            'adaptive-judge': 'model_finalJudge'
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
        const textareaMap: { [key: string]: keyof CustomizablePromptsAdaptiveDeepthink } = {
            'sys-adaptive-main': 'sys_adaptiveDeepthink_main',
            'sys-adaptive-strategy-gen': 'sys_adaptiveDeepthink_strategyGeneration',
            'sys-adaptive-hypothesis-gen': 'sys_adaptiveDeepthink_hypothesisGeneration',
            'sys-adaptive-hypothesis-test': 'sys_adaptiveDeepthink_hypothesisTesting',
            'sys-adaptive-execution': 'sys_adaptiveDeepthink_execution',
            'sys-adaptive-critique': 'sys_adaptiveDeepthink_solutionCritique',
            'sys-adaptive-corrector': 'sys_adaptiveDeepthink_corrector',
            'sys-adaptive-judge': 'sys_adaptiveDeepthink_finalJudge'
        };

        for (const [elementId, promptKey] of Object.entries(textareaMap)) {
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = this.promptsRef.current[promptKey] || '';
            }
        }
    }

    public updateModelSelectorsFromState(): void {
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsAdaptiveDeepthink } = {
            'adaptive-main': 'model_main',
            'adaptive-strategy-gen': 'model_strategyGeneration',
            'adaptive-hypothesis-gen': 'model_hypothesisGeneration',
            'adaptive-hypothesis-test': 'model_hypothesisTesting',
            'adaptive-execution': 'model_execution',
            'adaptive-critique': 'model_solutionCritique',
            'adaptive-corrector': 'model_corrector',
            'adaptive-judge': 'model_finalJudge'
        };

        for (const [agentKey, modelField] of Object.entries(modelSelectorMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.promptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';
            }
        }
    }

    public getPrompts(): CustomizablePromptsAdaptiveDeepthink {
        return this.promptsRef.current;
    }

    public setPrompts(prompts: CustomizablePromptsAdaptiveDeepthink): void {
        this.promptsRef.current = prompts;
    }

    public resetToDefaults(): void {
        this.promptsRef.current = createDefaultCustomPromptsAdaptiveDeepthink();
        this.updateTextareasFromState();
        this.updateModelSelectorsFromState();
    }
}
