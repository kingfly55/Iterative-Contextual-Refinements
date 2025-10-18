/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApiKeyManager, ApiKeyStatus } from './ApiConfig';

export class ApiKeyUI {
    private apiKeyManager: ApiKeyManager;
    private elements: {
        statusElement: HTMLParagraphElement | null;
        formContainer: HTMLElement | null;
        input: HTMLInputElement | null;
        saveButton: HTMLButtonElement | null;
        clearButton: HTMLButtonElement | null;
        generateButton: HTMLButtonElement | null;
    };

    constructor(apiKeyManager: ApiKeyManager) {
        this.apiKeyManager = apiKeyManager;
        this.elements = {
            statusElement: null,
            formContainer: null,
            input: null,
            saveButton: null,
            clearButton: null,
            generateButton: null
        };
    }

    private initializeElements(): void {
        this.elements = {
            statusElement: document.getElementById('api-key-status') as HTMLParagraphElement,
            formContainer: document.getElementById('api-key-form-container') as HTMLElement,
            input: document.getElementById('api-key-input') as HTMLInputElement,
            saveButton: document.getElementById('save-api-key-button') as HTMLButtonElement,
            clearButton: document.getElementById('clear-api-key-button') as HTMLButtonElement,
            generateButton: document.getElementById('generate-button') as HTMLButtonElement
        };

        this.initializeEventListeners();
        this.updateUI();
    }

    private initializeEventListeners(): void {
        if (this.elements.saveButton) {
            this.elements.saveButton.addEventListener('click', () => this.handleSaveApiKey());
        }

        if (this.elements.clearButton) {
            this.elements.clearButton.addEventListener('click', () => this.handleClearApiKey());
        }

        if (this.elements.input) {
            this.elements.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSaveApiKey();
                }
            });
        }
    }

    private handleSaveApiKey(): void {
        const apiKey = this.elements.input?.value?.trim();
        if (!apiKey) {
            this.showError('Please enter a valid API key');
            return;
        }

        const success = this.apiKeyManager.saveApiKey(apiKey);
        if (success) {
            this.updateUI();
            if (this.elements.input) {
                this.elements.input.value = '';
            }
        } else {
            this.showError('Failed to save API key');
        }
    }

    private handleClearApiKey(): void {
        this.apiKeyManager.clearApiKey();
        this.updateUI();
    }

    private showError(message: string): void {
        if (this.elements.statusElement) {
            this.elements.statusElement.textContent = message;
            this.elements.statusElement.className = 'api-key-status-message status-badge status-error';
        }
    }

    public updateUI(): void {
        // Initialize DOM elements if not already done
        if (!this.elements.statusElement) {
            this.initializeElements();
        }
        
        const status = this.apiKeyManager.initializeApiKey();
        this.updateStatusDisplay(status);
        this.updateFormVisibility(status);
        this.updateGenerateButton(status.isAvailable);
    }

    private updateStatusDisplay(status: ApiKeyStatus): void {
        if (this.elements.statusElement) {
            this.elements.statusElement.textContent = status.message;
            this.elements.statusElement.className = status.className;
        }
    }

    private updateFormVisibility(status: ApiKeyStatus): void {
        // Hide form elements by default
        if (this.elements.formContainer) {
            this.elements.formContainer.style.display = 'none';
        }
        if (this.elements.saveButton) {
            this.elements.saveButton.style.display = 'none';
        }
        if (this.elements.clearButton) {
            this.elements.clearButton.style.display = 'none';
        }
        if (this.elements.input) {
            this.elements.input.style.display = 'none';
        }

        if (status.source === 'environment') {
            // Environment key - no form needed
            return;
        } else if (status.source === 'localStorage') {
            // Show form container and clear button
            if (this.elements.formContainer) {
                this.elements.formContainer.style.display = 'flex';
            }
            if (this.elements.clearButton) {
                this.elements.clearButton.style.display = 'inline-flex';
            }
        } else {
            // No key - show form container, input, and save button
            if (this.elements.formContainer) {
                this.elements.formContainer.style.display = 'flex';
            }
            if (this.elements.input) {
                this.elements.input.style.display = 'block';
            }
            if (this.elements.saveButton) {
                this.elements.saveButton.style.display = 'inline-flex';
            }
        }
    }

    private updateGenerateButton(isKeyAvailable: boolean): void {
        if (this.elements.generateButton) {
            this.elements.generateButton.disabled = !isKeyAvailable;
        }
    }

    public getApiKeyManager(): ApiKeyManager {
        return this.apiKeyManager;
    }
}