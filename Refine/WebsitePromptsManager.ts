/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomizablePromptsWebsite, defaultCustomPromptsWebsite } from './RefinePrompts';

export class WebsitePromptsManager {
    private promptsRef: { current: CustomizablePromptsWebsite };
    private listeners: Set<(state: CustomizablePromptsWebsite) => void>;

    constructor(promptsRef: { current: CustomizablePromptsWebsite }) {
        this.promptsRef = promptsRef;
        this.listeners = new Set();
    }

    public subscribe(listener: (state: CustomizablePromptsWebsite) => void): () => void {
        this.listeners.add(listener);
        listener(this.promptsRef.current);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyListeners(): void {
        const snapshot = { ...this.promptsRef.current };
        this.listeners.forEach(listener => listener(snapshot));
    }

    public updatePrompt(key: keyof CustomizablePromptsWebsite, value: string): void {
        (this.promptsRef.current as any)[key] = value;
        this.notifyListeners();
    }

    public updateModel(key: keyof CustomizablePromptsWebsite, value: string): void {
        if (value === '') {
            delete this.promptsRef.current[key];
        } else {
            (this.promptsRef.current as any)[key] = value;
        }
        this.notifyListeners();
    }

    public getPrompts(): CustomizablePromptsWebsite {
        return this.promptsRef.current;
    }

    public setPrompts(prompts: CustomizablePromptsWebsite): void {
        this.promptsRef.current = prompts;
        this.notifyListeners();
    }

    public resetToDefaults(): void {
        this.promptsRef.current = { ...defaultCustomPromptsWebsite };
        this.notifyListeners();
    }
}
