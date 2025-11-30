/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomizablePromptsWebsite } from '../Refine/RefinePrompts';
import { CustomizablePromptsReact } from '../React/ReactPrompts';
import { CustomizablePromptsDeepthink } from '../Deepthink/DeepthinkPrompts';
import { AgenticPromptsManager, AgenticPrompts } from '../Agentic/AgenticPromptsManager';
import { CustomizablePromptsAdaptiveDeepthink } from '../AdaptiveDeepthink/AdaptiveDeepthinkPrompt';
import { AdaptiveDeepthinkPromptsManager } from '../AdaptiveDeepthink/AdaptiveDeepthinkPromptsManager';
import { CustomizablePromptsContextual } from '../Contextual/ContextualPrompts';
import { ContextualPromptsManager } from '../Contextual/ContextualPromptsManager';

export class PromptsManager {
    private websitePromptsRef: { current: CustomizablePromptsWebsite };
    private deepthinkPromptsRef: { current: CustomizablePromptsDeepthink };
    private reactPromptsRef: { current: CustomizablePromptsReact };
    private agenticPromptsRef: { current: AgenticPrompts };
    private adaptiveDeepthinkPromptsRef?: { current: CustomizablePromptsAdaptiveDeepthink };
    private contextualPromptsRef?: { current: CustomizablePromptsContextual };

    private agenticPromptsManager: AgenticPromptsManager;
    private adaptiveDeepthinkPromptsManager?: AdaptiveDeepthinkPromptsManager;
    private contextualPromptsManager?: ContextualPromptsManager;

    constructor(
        websitePromptsRef: { current: CustomizablePromptsWebsite },
        deepthinkPromptsRef: { current: CustomizablePromptsDeepthink },
        reactPromptsRef: { current: CustomizablePromptsReact },
        agenticPromptsRef?: { current: AgenticPrompts },
        adaptiveDeepthinkPromptsRef?: { current: CustomizablePromptsAdaptiveDeepthink },
        contextualPromptsRef?: { current: CustomizablePromptsContextual }
    ) {
        this.websitePromptsRef = websitePromptsRef;
        this.deepthinkPromptsRef = deepthinkPromptsRef;
        this.reactPromptsRef = reactPromptsRef;
        this.agenticPromptsRef = agenticPromptsRef || { current: { systemPrompt: '', verifierPrompt: '' } };
        this.adaptiveDeepthinkPromptsRef = adaptiveDeepthinkPromptsRef;
        this.contextualPromptsRef = contextualPromptsRef;

        this.agenticPromptsManager = new AgenticPromptsManager(this.agenticPromptsRef);
        if (this.adaptiveDeepthinkPromptsRef) {
            this.adaptiveDeepthinkPromptsManager = new AdaptiveDeepthinkPromptsManager(this.adaptiveDeepthinkPromptsRef);
        }
        if (this.contextualPromptsRef) {
            this.contextualPromptsManager = new ContextualPromptsManager(this.contextualPromptsRef);
        }
    }

    public initializeTextareas(): void {
        this.initializeWebsiteTextareas();
        this.initializeDeepthinkTextareas();
        this.initializeReactTextareas();
        this.initializeAgenticTextarea();
        if (this.adaptiveDeepthinkPromptsManager) {
            this.adaptiveDeepthinkPromptsManager.initializeTextareas();
        }
        if (this.contextualPromptsManager) {
            this.contextualPromptsManager.initializeTextareas();
        }
        this.initializeModelSelectors();
    }

    private initializeModelSelectors(): void {
        // Initialize model selectors for website mode
        this.initializeWebsiteModelSelectors();
        this.initializeDeepthinkModelSelectors();
        this.initializeReactModelSelectors();
        this.agenticPromptsManager.initializeModelSelector();
        if (this.adaptiveDeepthinkPromptsManager) {
            this.adaptiveDeepthinkPromptsManager.initializeModelSelectors();
        }
        if (this.contextualPromptsManager) {
            this.contextualPromptsManager.initializeModelSelectors();
        }
    }

    private initializeWebsiteModelSelectors(): void {
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsWebsite } = {
            'initialGen': 'model_initialGen',
            'initialBugFix': 'model_initialBugFix',
            'initialFeatures': 'model_initialFeatureSuggest',
            'refineStabilizeImplement': 'model_refineStabilizeImplement',
            'refineBugFix': 'model_refineBugFix',
            'refineFeatures': 'model_refineFeatureSuggest',
            'finalPolish': 'model_finalPolish'
        };

        for (const [agentKey, modelField] of Object.entries(modelSelectorMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                // Set initial value from state
                const currentValue = this.websitePromptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';

                // Add event listener to save changes
                selector.addEventListener('change', (e) => {
                    const selectedValue = (e.target as HTMLSelectElement).value;
                    if (selectedValue === '') {
                        // Remove custom model selection (use global)
                        delete this.websitePromptsRef.current[modelField];
                    } else {
                        (this.websitePromptsRef.current as any)[modelField] = selectedValue;
                    }
                });
            }
        }
    }

    private initializeDeepthinkModelSelectors(): void {
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsDeepthink } = {
            'initialStrategy': 'model_initialStrategy',
            'subStrategy': 'model_subStrategy',
            'solutionAttempt': 'model_solutionAttempt',
            'solutionCritique': 'model_solutionCritique',
            'dissectedSynthesis': 'model_dissectedSynthesis',
            'selfImprovement': 'model_selfImprovement',
            'hypothesisGeneration': 'model_hypothesisGeneration',
            'hypothesisTester': 'model_hypothesisTester',
            'redTeam': 'model_redTeam',
            'postQualityFilter': 'model_postQualityFilter',
            'finalJudge': 'model_finalJudge',
            'structuredSolutionPool': 'model_structuredSolutionPool'
        };

        for (const [agentKey, modelField] of Object.entries(modelSelectorMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.deepthinkPromptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';

                selector.addEventListener('change', (e) => {
                    const selectedValue = (e.target as HTMLSelectElement).value;
                    if (selectedValue === '') {
                        delete this.deepthinkPromptsRef.current[modelField];
                    } else {
                        (this.deepthinkPromptsRef.current as any)[modelField] = selectedValue;
                    }
                });
            }
        }
    }

    private initializeReactModelSelectors(): void {
        const modelSelectorMap: { [key: string]: keyof CustomizablePromptsReact } = {
            'orchestrator': 'model_orchestrator',
            'worker': 'model_worker',
            'agentic-embedded': 'model_agentic_embedded',
            'agentic-verifier-embedded': 'model_agentic_verifier_embedded'
        };

        for (const [agentKey, modelField] of Object.entries(modelSelectorMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.reactPromptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';

                selector.addEventListener('change', (e) => {
                    const selectedValue = (e.target as HTMLSelectElement).value;
                    if (selectedValue === '') {
                        delete this.reactPromptsRef.current[modelField];
                    } else {
                        (this.reactPromptsRef.current as any)[modelField] = selectedValue;
                    }
                });
            }
        }
    }

    private initializeWebsiteTextareas(): void {
        const textareaMap: { [K in keyof CustomizablePromptsWebsite]: string } = {
            sys_initialGen: 'sys-initial-gen',
            user_initialGen: 'user-initial-gen',
            sys_initialBugFix: 'sys-initial-bugfix',
            user_initialBugFix: 'user-initial-bugfix',
            sys_newFeature: 'sys-new-feature',
            user_newFeature: 'user-new-feature',
            sys_initialFeatureSuggest: 'sys-initial-features',
            user_initialFeatureSuggest: 'user-initial-features',
            sys_refineStabilizeImplement: 'sys-refine-implement',
            user_refineStabilizeImplement: 'user-refine-implement',
            sys_refineBugFix: 'sys-refine-bugfix',
            user_refineBugFix: 'user-refine-bugfix',
            sys_refineFeatureSuggest: 'sys-refine-features',
            user_refineFeatureSuggest: 'user-refine-features',
            sys_finalPolish: 'sys-final-polish',
            user_finalPolish: 'user-final-polish',
            sys_bugFixer: 'sys-bug-fixer',
            user_bugFixer: 'user-bug-fixer',
            sys_suggestImprovements: 'sys-suggest-improvements',
            user_suggestImprovements: 'user-suggest-improvements',
            sys_codeOptimizer: 'sys-code-optimizer',
            user_codeOptimizer: 'user-code-optimizer'
        };

        for (const [key, elementId] of Object.entries(textareaMap)) {
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                const promptKey = key as keyof CustomizablePromptsWebsite;
                textarea.value = this.websitePromptsRef.current[promptKey] || '';
                textarea.addEventListener('input', (e) => {
                    this.websitePromptsRef.current[promptKey] = (e.target as HTMLTextAreaElement).value;
                });
            }
        }
    }

    private initializeDeepthinkTextareas(): void {
        const textareaMap: { [K in keyof CustomizablePromptsDeepthink]: string } = {
            sys_deepthink_initialStrategy: 'sys-deepthink-initial-strategy',
            user_deepthink_initialStrategy: 'user-deepthink-initial-strategy',
            sys_deepthink_subStrategy: 'sys-deepthink-sub-strategy',
            user_deepthink_subStrategy: 'user-deepthink-sub-strategy',
            sys_deepthink_solutionAttempt: 'sys-deepthink-solution-attempt',
            user_deepthink_solutionAttempt: 'user-deepthink-solution-attempt',
            sys_deepthink_solutionCritique: 'sys-deepthink-solution-critique',
            user_deepthink_solutionCritique: 'user-deepthink-solution-critique',
            sys_deepthink_dissectedSynthesis: 'sys-deepthink-dissected-synthesis',
            user_deepthink_dissectedSynthesis: 'user-deepthink-dissected-synthesis',
            sys_deepthink_selfImprovement: 'sys-deepthink-self-improvement',
            user_deepthink_selfImprovement: 'user-deepthink-self-improvement',
            sys_deepthink_hypothesisGeneration: 'sys-deepthink-hypothesis-generation',
            user_deepthink_hypothesisGeneration: 'user-deepthink-hypothesis-generation',
            sys_deepthink_hypothesisTester: 'sys-deepthink-hypothesis-tester',
            user_deepthink_hypothesisTester: 'user-deepthink-hypothesis-tester',
            sys_deepthink_redTeam: 'sys-deepthink-red-team',
            user_deepthink_redTeam: 'user-deepthink-red-team',
            sys_deepthink_postQualityFilter: 'sys-deepthink-post-quality-filter',
            user_deepthink_postQualityFilter: 'user-deepthink-post-quality-filter',
            sys_deepthink_finalJudge: 'sys-deepthink-final-judge',
            sys_deepthink_structuredSolutionPool: 'sys-deepthink-structured-solution-pool',
            user_deepthink_structuredSolutionPool: 'user-deepthink-structured-solution-pool',
            model_initialStrategy: '',
            model_subStrategy: '',
            model_solutionAttempt: '',
            model_solutionCritique: '',
            model_dissectedSynthesis: '',
            model_selfImprovement: '',
            model_hypothesisGeneration: '',
            model_hypothesisTester: '',
            model_redTeam: '',
            model_postQualityFilter: '',
            model_finalJudge: '',
            model_structuredSolutionPool: ''
        };

        for (const [key, elementId] of Object.entries(textareaMap)) {
            // Skip entries with empty element IDs (e.g., model_* fields)
            if (!elementId) continue;

            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                const promptKey = key as keyof CustomizablePromptsDeepthink;
                textarea.value = this.deepthinkPromptsRef.current[promptKey] || '';
                textarea.addEventListener('input', (e) => {
                    this.deepthinkPromptsRef.current[promptKey] = (e.target as HTMLTextAreaElement).value;
                });
            }
        }
    }

    private initializeAgenticTextarea(): void {
        this.agenticPromptsManager.initializeTextarea();
    }

    private initializeReactTextareas(): void {
        const textareaMap: { [K in keyof CustomizablePromptsReact]: string } = {
            sys_orchestrator: 'sys-react-orchestrator',
            user_orchestrator: 'user-react-orchestrator',
            sys_worker: 'sys-react-worker',
            user_worker: 'user-react-worker',
            sys_agentic_embedded: 'sys-react-agentic-embedded',
            sys_agentic_verifier_embedded: 'sys-react-agentic-verifier-embedded',
            model_orchestrator: '',
            model_worker: '',
            model_agentic_embedded: '',
            model_agentic_verifier_embedded: ''
        } as any;

        for (const [key, elementId] of Object.entries(textareaMap)) {
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                const promptKey = key as keyof CustomizablePromptsReact;
                textarea.value = this.reactPromptsRef.current[promptKey] || '';
                textarea.addEventListener('input', (e) => {
                    this.reactPromptsRef.current[promptKey] = (e.target as HTMLTextAreaElement).value;
                });
            }
        }
    }

    public updateTextareasFromState(): void {
        // Website prompts
        for (const key in this.websitePromptsRef.current) {
            const promptKey = key as keyof CustomizablePromptsWebsite;
            const elementId = this.getWebsiteElementId(promptKey);
            if (!elementId) continue; // Skip model_* fields with no element IDs
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = this.websitePromptsRef.current[promptKey] || '';
            }
        }

        // Deepthink prompts
        for (const key in this.deepthinkPromptsRef.current) {
            const promptKey = key as keyof CustomizablePromptsDeepthink;
            const elementId = this.getDeepthinkElementId(promptKey);
            if (!elementId) continue; // Skip model_* fields with no element IDs
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = this.deepthinkPromptsRef.current[promptKey] || '';
            }
        }

        // React prompts
        for (const key in this.reactPromptsRef.current) {
            const promptKey = key as keyof CustomizablePromptsReact;
            const elementId = this.getReactElementId(promptKey);
            if (!elementId) continue; // Skip model_* fields with no element IDs
            const textarea = document.getElementById(elementId) as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = this.reactPromptsRef.current[promptKey] || '';
            }
        }

        // Agentic prompts
        this.agenticPromptsManager.updateTextareaFromState();

        // Adaptive Deepthink prompts
        if (this.adaptiveDeepthinkPromptsManager) {
            this.adaptiveDeepthinkPromptsManager.updateTextareasFromState();
        }

        // Contextual prompts
        if (this.contextualPromptsManager) {
            this.contextualPromptsManager.updateTextareasFromState();
        }

        // Update model selectors from state
        this.updateModelSelectorsFromState();
    }

    public updateModelSelectorsFromState(): void {
        // Website model selectors
        const websiteModelMap: { [key: string]: keyof CustomizablePromptsWebsite } = {
            'initialGen': 'model_initialGen',
            'initialBugFix': 'model_initialBugFix',
            'initialFeatures': 'model_initialFeatureSuggest',
            'refineStabilizeImplement': 'model_refineStabilizeImplement',
            'refineBugFix': 'model_refineBugFix',
            'refineFeatures': 'model_refineFeatureSuggest',
            'finalPolish': 'model_finalPolish'
        };

        for (const [agentKey, modelField] of Object.entries(websiteModelMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.websitePromptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';
            }
        }

        // Deepthink model selectors
        const deepthinkModelMap: { [key: string]: keyof CustomizablePromptsDeepthink } = {
            'initialStrategy': 'model_initialStrategy',
            'subStrategy': 'model_subStrategy',
            'solutionAttempt': 'model_solutionAttempt',
            'solutionCritique': 'model_solutionCritique',
            'dissectedSynthesis': 'model_dissectedSynthesis',
            'selfImprovement': 'model_selfImprovement',
            'hypothesisGeneration': 'model_hypothesisGeneration',
            'hypothesisTester': 'model_hypothesisTester',
            'redTeam': 'model_redTeam',
            'finalJudge': 'model_finalJudge'
        };

        for (const [agentKey, modelField] of Object.entries(deepthinkModelMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.deepthinkPromptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';
            }
        }

        // React model selectors
        const reactModelMap: { [key: string]: keyof CustomizablePromptsReact } = {
            'orchestrator': 'model_orchestrator',
            'worker': 'model_worker',
            'agentic-embedded': 'model_agentic_embedded',
            'agentic-verifier-embedded': 'model_agentic_verifier_embedded'
        };

        for (const [agentKey, modelField] of Object.entries(reactModelMap)) {
            const selector = document.querySelector(`[data-agent="${agentKey}"]`) as HTMLSelectElement;
            if (selector) {
                const currentValue = this.reactPromptsRef.current[modelField] as string | undefined;
                selector.value = currentValue || '';
            }
        }

        // Adaptive Deepthink model selectors
        if (this.adaptiveDeepthinkPromptsManager) {
            this.adaptiveDeepthinkPromptsManager.updateModelSelectorsFromState();
        }

        // Contextual model selectors
        if (this.contextualPromptsManager) {
            this.contextualPromptsManager.updateModelSelectorsFromState();
        }

        // Agentic model selector
        this.agenticPromptsManager.updateModelSelectorFromState();
    }

    private getWebsiteElementId(key: keyof CustomizablePromptsWebsite): string {
        const map: { [K in keyof CustomizablePromptsWebsite]: string } = {
            sys_initialGen: 'sys-initial-gen',
            user_initialGen: 'user-initial-gen',
            sys_initialBugFix: 'sys-initial-bugfix',
            user_initialBugFix: 'user-initial-bugfix',
            sys_newFeature: 'sys-new-feature',
            user_newFeature: 'user-new-feature',
            sys_initialFeatureSuggest: 'sys-initial-features',
            user_initialFeatureSuggest: 'user-initial-features',
            sys_refineStabilizeImplement: 'sys-refine-implement',
            user_refineStabilizeImplement: 'user-refine-implement',
            sys_refineBugFix: 'sys-refine-bugfix',
            user_refineBugFix: 'user-refine-bugfix',
            sys_refineFeatureSuggest: 'sys-refine-features',
            user_refineFeatureSuggest: 'user-refine-features',
            sys_finalPolish: 'sys-final-polish',
            user_finalPolish: 'user-final-polish',
            sys_bugFixer: 'sys-bug-fixer',
            user_bugFixer: 'user-bug-fixer',
            sys_suggestImprovements: 'sys-suggest-improvements',
            user_suggestImprovements: 'user-suggest-improvements',
            sys_codeOptimizer: 'sys-code-optimizer',
            user_codeOptimizer: 'user-code-optimizer',
            model_initialGen: '',
            model_initialBugFix: '',
            model_initialFeatureSuggest: '',
            model_refineStabilizeImplement: '',
            model_refineBugFix: '',
            model_refineFeatureSuggest: '',
            model_finalPolish: ''
        };
        return map[key] || '';
    }

    private getDeepthinkElementId(key: keyof CustomizablePromptsDeepthink): string {
        const map: { [K in keyof CustomizablePromptsDeepthink]: string } = {
            sys_deepthink_initialStrategy: 'sys-deepthink-initial-strategy',
            user_deepthink_initialStrategy: 'user-deepthink-initial-strategy',
            sys_deepthink_subStrategy: 'sys-deepthink-sub-strategy',
            user_deepthink_subStrategy: 'user-deepthink-sub-strategy',
            sys_deepthink_solutionAttempt: 'sys-deepthink-solution-attempt',
            user_deepthink_solutionAttempt: 'user-deepthink-solution-attempt',
            sys_deepthink_solutionCritique: 'sys-deepthink-solution-critique',
            user_deepthink_solutionCritique: 'user-deepthink-solution-critique',
            sys_deepthink_dissectedSynthesis: 'sys-deepthink-dissected-synthesis',
            user_deepthink_dissectedSynthesis: 'user-deepthink-dissected-synthesis',
            sys_deepthink_selfImprovement: 'sys-deepthink-self-improvement',
            user_deepthink_selfImprovement: 'user-deepthink-self-improvement',
            sys_deepthink_hypothesisGeneration: 'sys-deepthink-hypothesis-generation',
            user_deepthink_hypothesisGeneration: 'user-deepthink-hypothesis-generation',
            sys_deepthink_hypothesisTester: 'sys-deepthink-hypothesis-tester',
            user_deepthink_hypothesisTester: 'user-deepthink-hypothesis-tester',
            sys_deepthink_redTeam: 'sys-deepthink-red-team',
            user_deepthink_redTeam: 'user-deepthink-red-team',
            sys_deepthink_postQualityFilter: 'sys-deepthink-post-quality-filter',
            user_deepthink_postQualityFilter: 'user-deepthink-post-quality-filter',
            sys_deepthink_finalJudge: 'sys-deepthink-final-judge',
            sys_deepthink_structuredSolutionPool: 'sys-deepthink-structured-solution-pool',
            user_deepthink_structuredSolutionPool: 'user-deepthink-structured-solution-pool',
            model_initialStrategy: '',
            model_subStrategy: '',
            model_solutionAttempt: '',
            model_solutionCritique: '',
            model_dissectedSynthesis: '',
            model_selfImprovement: '',
            model_hypothesisGeneration: '',
            model_hypothesisTester: '',
            model_redTeam: '',
            model_postQualityFilter: '',
            model_finalJudge: '',
            model_structuredSolutionPool: ''
        };
        return map[key] || '';
    }

    private getReactElementId(key: keyof CustomizablePromptsReact): string {
        const map: { [K in keyof CustomizablePromptsReact]: string } = {
            sys_orchestrator: 'sys-react-orchestrator',
            user_orchestrator: 'user-react-orchestrator',
            sys_worker: 'sys-react-worker',
            user_worker: 'user-react-worker',
            sys_agentic_embedded: 'sys-react-agentic-embedded',
            sys_agentic_verifier_embedded: 'sys-react-agentic-verifier-embedded',
            model_orchestrator: '',
            model_worker: '',
            model_agentic_embedded: '',
            model_agentic_verifier_embedded: ''
        } as any;
        return map[key] || '';
    }

    // Getters for the prompt states
    public getWebsitePrompts(): CustomizablePromptsWebsite {
        return this.websitePromptsRef.current;
    }

    public getDeepthinkPrompts(): CustomizablePromptsDeepthink {
        return this.deepthinkPromptsRef.current;
    }

    public getReactPrompts(): CustomizablePromptsReact {
        return this.reactPromptsRef.current;
    }

    // Setters for updating prompt states
    public setWebsitePrompts(prompts: CustomizablePromptsWebsite): void {
        this.websitePromptsRef.current = prompts;
    }

    public setDeepthinkPrompts(prompts: CustomizablePromptsDeepthink): void {
        this.deepthinkPromptsRef.current = prompts;
    }

    public setReactPrompts(prompts: CustomizablePromptsReact): void {
        this.reactPromptsRef.current = prompts;
    }

    public getAgenticPromptsManager(): AgenticPromptsManager {
        return this.agenticPromptsManager;
    }

    public getAgenticPrompts(): AgenticPrompts {
        return this.agenticPromptsManager.getAgenticPrompts();
    }

    public setAgenticPrompts(prompts: AgenticPrompts): void {
        this.agenticPromptsManager.setAgenticPrompts(prompts);
    }

    // Adaptive Deepthink prompts getters and setters
    public getAdaptiveDeepthinkPromptsManager(): AdaptiveDeepthinkPromptsManager | undefined {
        return this.adaptiveDeepthinkPromptsManager;
    }

    public getAdaptiveDeepthinkPrompts(): CustomizablePromptsAdaptiveDeepthink | undefined {
        return this.adaptiveDeepthinkPromptsManager?.getPrompts();
    }

    public setAdaptiveDeepthinkPrompts(prompts: CustomizablePromptsAdaptiveDeepthink): void {
        this.adaptiveDeepthinkPromptsManager?.setPrompts(prompts);
    }

    // Contextual prompts getters and setters
    public getContextualPromptsManager(): ContextualPromptsManager | undefined {
        return this.contextualPromptsManager;
    }

    public getContextualPrompts(): CustomizablePromptsContextual | undefined {
        return this.contextualPromptsManager?.getPrompts();
    }

    public setContextualPrompts(prompts: CustomizablePromptsContextual): void {
        this.contextualPromptsManager?.setPrompts(prompts);
    }
}