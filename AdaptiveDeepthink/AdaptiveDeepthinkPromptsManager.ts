/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomizablePromptsAdaptiveDeepthink, createDefaultCustomPromptsAdaptiveDeepthink } from './AdaptiveDeepthinkPrompt';

// A simple subscription-based state manager for purely functional React consumption
export class AdaptiveDeepthinkPromptsManager {
    private state: CustomizablePromptsAdaptiveDeepthink;
    private listeners: Set<(state: CustomizablePromptsAdaptiveDeepthink) => void>;
    private ref?: { current: CustomizablePromptsAdaptiveDeepthink };

    constructor(initialRef?: { current: CustomizablePromptsAdaptiveDeepthink }) {
        this.ref = initialRef;
        this.state = initialRef?.current || createDefaultCustomPromptsAdaptiveDeepthink();
        this.listeners = new Set();
    }



    public getPrompts(): CustomizablePromptsAdaptiveDeepthink {
        return this.state;
    }

    public setPrompts(prompts: CustomizablePromptsAdaptiveDeepthink): void {
        this.state = { ...prompts };
        if (this.ref) {
            this.ref.current = this.state;
        }
        this.notifyListeners();
    }

    public updatePrompt(key: keyof CustomizablePromptsAdaptiveDeepthink, value: string | undefined): void {
        if (value === undefined || value === '') {
            const newState = { ...this.state };
            delete newState[key];
            this.state = newState;
        } else {
            this.state = {
                ...this.state,
                [key]: value
            };
        }
        if (this.ref) {
            this.ref.current = this.state;
        }
        this.notifyListeners();
    }

    public resetToDefaults(): void {
        this.state = createDefaultCustomPromptsAdaptiveDeepthink();
        this.notifyListeners();
    }

    public subscribe(listener: (state: CustomizablePromptsAdaptiveDeepthink) => void): () => void {
        this.listeners.add(listener);
        // Immediately notify with current state
        listener(this.state);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}

// Global instance to replace imperative references
export const globalAdaptiveDeepthinkPromptsManager = new AdaptiveDeepthinkPromptsManager();
