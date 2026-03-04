/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomizablePromptsContextual, createDefaultCustomPromptsContextual } from './ContextualPrompts';

export class ContextualPromptsManager {
    private promptsRef: { current: CustomizablePromptsContextual };
    private onPromptsChange?: (prompts: CustomizablePromptsContextual) => void;

    constructor(promptsRef: { current: CustomizablePromptsContextual }) {
        this.promptsRef = promptsRef;
        // Initialize with defaults if needed
        if (!this.promptsRef.current.sys_contextual_mainGenerator) {
            const defaults = createDefaultCustomPromptsContextual();
            this.promptsRef.current = defaults;
        }
    }

    public subscribe(callback: (prompts: CustomizablePromptsContextual) => void): () => void {
        this.onPromptsChange = callback;
        return () => {
            if (this.onPromptsChange === callback) {
                this.onPromptsChange = undefined;
            }
        };
    }

    private notifyChange() {
        if (this.onPromptsChange) {
            this.onPromptsChange({ ...this.promptsRef.current });
        }
    }

    public updatePrompt(key: keyof CustomizablePromptsContextual, value: string): void {
        (this.promptsRef.current as any)[key] = value;
        this.notifyChange();
    }

    public updateModel(key: keyof CustomizablePromptsContextual, value: string): void {
        if (value === '') {
            delete this.promptsRef.current[key];
        } else {
            (this.promptsRef.current as any)[key] = value;
        }
        this.notifyChange();
    }

    public getPrompts(): CustomizablePromptsContextual {
        return this.promptsRef.current;
    }

    public setPrompts(prompts: CustomizablePromptsContextual): void {
        this.promptsRef.current = prompts;
        this.notifyChange();
    }

    public resetToDefaults(): void {
        this.promptsRef.current = createDefaultCustomPromptsContextual();
        this.notifyChange();
    }
}
