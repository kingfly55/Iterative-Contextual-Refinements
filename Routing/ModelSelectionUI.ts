/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelConfigManager, AVAILABLE_MODELS } from './ModelConfig';
import { ApiCallEstimator } from './ApiCallEstimator';

export class ModelSelectionUI {
    private modelConfig: ModelConfigManager;
    private apiCallEstimator: ApiCallEstimator | null = null;
    private elements: {
        modelSelect: HTMLSelectElement | null;
        temperatureSlider: HTMLInputElement | null;
        topPSlider: HTMLInputElement | null;
        refinementStagesSlider: HTMLInputElement | null;
        strategiesSlider: HTMLInputElement | null;
        subStrategiesSlider: HTMLInputElement | null;
        hypothesisSlider: HTMLInputElement | null;
        refinementToggle: HTMLInputElement | null;
        skipSubStrategiesToggle: HTMLInputElement | null;
        dissectedObservationsToggle: HTMLInputElement | null;
        iterativeCorrectionsToggle: HTMLInputElement | null;
        provideAllSolutionsToggle: HTMLInputElement | null;
        postQualityFilterToggle: HTMLInputElement | null;
        temperatureValue: HTMLSpanElement | null;
        topPValue: HTMLSpanElement | null;
        refinementStagesValue: HTMLSpanElement | null;
        strategiesValue: HTMLSpanElement | null;
        subStrategiesValue: HTMLSpanElement | null;
        hypothesisValue: HTMLSpanElement | null;
    };

    constructor(modelConfig: ModelConfigManager) {
        this.modelConfig = modelConfig;
        this.elements = {
            modelSelect: null,
            temperatureSlider: null,
            topPSlider: null,
            refinementStagesSlider: null,
            strategiesSlider: null,
            subStrategiesSlider: null,
            hypothesisSlider: null,
            refinementToggle: null,
            skipSubStrategiesToggle: null,
            dissectedObservationsToggle: null,
            iterativeCorrectionsToggle: null,
            provideAllSolutionsToggle: null,
            postQualityFilterToggle: null,
            temperatureValue: null,
            topPValue: null,
            refinementStagesValue: null,
            strategiesValue: null,
            subStrategiesValue: null,
            hypothesisValue: null
        };
    }

    private initializeElements(): void {
        this.elements = {
            modelSelect: document.getElementById('model-select') as HTMLSelectElement,
            temperatureSlider: document.getElementById('temperature-slider') as HTMLInputElement,
            topPSlider: document.getElementById('top-p-slider') as HTMLInputElement,
            refinementStagesSlider: document.getElementById('refinement-stages-slider') as HTMLInputElement,
            strategiesSlider: document.getElementById('strategies-slider') as HTMLInputElement,
            subStrategiesSlider: document.getElementById('sub-strategies-slider') as HTMLInputElement,
            hypothesisSlider: document.getElementById('hypothesis-slider') as HTMLInputElement,
            refinementToggle: document.getElementById('refinement-toggle') as HTMLInputElement,
            skipSubStrategiesToggle: document.getElementById('skip-sub-strategies-toggle') as HTMLInputElement,
            dissectedObservationsToggle: document.getElementById('dissected-observations-toggle') as HTMLInputElement,
            iterativeCorrectionsToggle: document.getElementById('iterative-corrections-toggle') as HTMLInputElement,
            provideAllSolutionsToggle: document.getElementById('provide-all-solutions-toggle') as HTMLInputElement,
            postQualityFilterToggle: document.getElementById('post-quality-filter-toggle') as HTMLInputElement,
            temperatureValue: document.getElementById('temperature-value') as HTMLSpanElement,
            topPValue: document.getElementById('top-p-value') as HTMLSpanElement,
            refinementStagesValue: document.getElementById('refinement-stages-value') as HTMLSpanElement,
            strategiesValue: document.getElementById('strategies-value') as HTMLSpanElement,
            subStrategiesValue: document.getElementById('sub-strategies-value') as HTMLSpanElement,
            hypothesisValue: document.getElementById('hypothesis-value') as HTMLSpanElement
        };

        this.createCustomModelSelect();
        this.initializeModelOptions();
        this.initializeEventListeners();
        this.updateUI();
        this.initializeRefinementState();
        this.initializeApiCallEstimator();
    }

    public initialize(): void {
        if (!this.elements.modelSelect) {
            this.initializeElements();
        }
    }

    private initializeApiCallEstimator(): void {
        this.apiCallEstimator = new ApiCallEstimator(this.modelConfig);
        this.apiCallEstimator.attachListeners();
    }

    private initializeModelOptions(): void {
        if (!this.elements.modelSelect) return;

        // Clear existing options
        this.elements.modelSelect.innerHTML = '';

        // Add model options from the model config manager
        const availableModels = this.modelConfig.getAvailableModels();
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.value;
            option.textContent = model.label || model.value;
            if (model.description) {
                option.title = model.description;
            }
            this.elements.modelSelect!.appendChild(option);
        });

        // Set default selection
        this.elements.modelSelect.value = this.modelConfig.getSelectedModel();

        // Update custom select options
        this.updateCustomSelectOptions();
    }

    public updateModelOptions(): void {
        this.initializeModelOptions();
    }

    private createCustomModelSelect(): void {
        if (!this.elements.modelSelect) return;

        const container = this.elements.modelSelect.parentElement;
        if (!container) return;

        // Create custom dropdown structure
        const customSelect = document.createElement('div');
        customSelect.className = 'custom-model-select';
        customSelect.innerHTML = `
            <div class="custom-model-select-trigger" id="custom-model-select-trigger">
                <span class="custom-model-select-text" id="custom-model-select-text">Select a model...</span>
                <span class="custom-model-select-arrow material-symbols-outlined">expand_more</span>
            </div>
            <div class="custom-model-select-dropdown" id="custom-model-select-dropdown">
                <!-- Options will be populated here -->
            </div>
        `;

        // Insert custom select after the original select
        container.insertBefore(customSelect, this.elements.modelSelect.nextSibling);

        // Add event listeners for custom select
        this.initializeCustomSelectListeners();
    }

    private initializeCustomSelectListeners(): void {
        const trigger = document.getElementById('custom-model-select-trigger');
        const dropdown = document.getElementById('custom-model-select-dropdown');

        if (!trigger || !dropdown) return;

        // Toggle dropdown
        trigger.addEventListener('click', () => {
            const isOpen = trigger.classList.contains('open');
            if (isOpen) {
                this.closeCustomSelect();
            } else {
                this.openCustomSelect();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!trigger.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                this.closeCustomSelect();
            }
        });

        // Close dropdown on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeCustomSelect();
            }
        });
    }

    private openCustomSelect(): void {
        const trigger = document.getElementById('custom-model-select-trigger');
        const dropdown = document.getElementById('custom-model-select-dropdown');

        if (trigger && dropdown) {
            trigger.classList.add('open');
            dropdown.classList.add('open');
        }
    }

    private closeCustomSelect(): void {
        const trigger = document.getElementById('custom-model-select-trigger');
        const dropdown = document.getElementById('custom-model-select-dropdown');

        if (trigger && dropdown) {
            trigger.classList.remove('open');
            dropdown.classList.remove('open');
        }
    }

    private updateCustomSelectOptions(): void {
        const dropdown = document.getElementById('custom-model-select-dropdown');
        const textElement = document.getElementById('custom-model-select-text');
        
        if (!dropdown || !textElement) return;

        const availableModels = this.modelConfig.getAvailableModels();
        const selectedModel = this.modelConfig.getSelectedModel();

        // Clear existing options
        dropdown.innerHTML = '';

        // Group models by provider
        const modelsByProvider: Record<string, typeof availableModels> = {};
        availableModels.forEach(model => {
            if (!modelsByProvider[model.provider!]) {
                modelsByProvider[model.provider!] = [];
            }
            modelsByProvider[model.provider!].push(model);
        });

        // Provider configuration with icons and colors
        const providerConfig: Record<string, { icon: string; class: string }> = {
            'openai': { icon: 'O', class: 'openai' },
            'anthropic': { icon: 'A', class: 'anthropic' },
            'google': { icon: 'G', class: 'google' },
            'gemini': { icon: 'G', class: 'google' },
            'openrouter': { icon: 'R', class: 'openrouter' },
            'meta': { icon: 'M', class: 'meta' },
            'mistral': { icon: 'M', class: 'mistral' }
        };

        // Sort providers for consistent ordering
        const sortedProviders = Object.keys(modelsByProvider).sort((a, b) => {
            const order = ['openai', 'anthropic', 'google', 'gemini', 'meta', 'mistral'];
            const aIndex = order.indexOf(a.toLowerCase());
            const bIndex = order.indexOf(b.toLowerCase());
            if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });

        // Add provider groups
        sortedProviders.forEach(provider => {
            const models = modelsByProvider[provider];
            const config = providerConfig[provider.toLowerCase()] || { icon: provider.charAt(0).toUpperCase(), class: 'default' };
            
            // Create provider section container
            const providerSection = document.createElement('div');
            providerSection.className = `custom-model-select-provider-section ${config.class}`;
            
            // Add provider header
            const providerHeader = document.createElement('div');
            providerHeader.className = `custom-model-select-provider-header ${config.class}`;
            providerHeader.innerHTML = `
                <span>${provider.charAt(0).toUpperCase() + provider.slice(1)}</span>
            `;
            providerSection.appendChild(providerHeader);

            // Sort models within provider
            const sortedModels = models.sort((a, b) => a.value.localeCompare(b.value));

            // Add models for this provider
            sortedModels.forEach(model => {
                const option = document.createElement('div');
                option.className = 'custom-model-select-option';
                option.dataset.value = model.value;
                if (model.value === selectedModel) {
                    option.classList.add('selected');
                }
                
                option.innerHTML = `
                    <span class="custom-model-select-option-text">${model.value}</span>
                `;

                option.addEventListener('click', () => {
                    this.selectCustomOption(model.value, model.label || model.value);
                });

                providerSection.appendChild(option);
            });

            dropdown.appendChild(providerSection);
        });

        // Update selected text
        const selectedModelOption = availableModels.find(m => m.value === selectedModel);
        if (selectedModelOption) {
            textElement.textContent = selectedModelOption.value;
        }
    }

    private selectCustomOption(value: string, label: string): void {
        const textElement = document.getElementById('custom-model-select-text');
        const dropdown = document.getElementById('custom-model-select-dropdown');

        if (textElement) {
            textElement.textContent = value;
        }

        // Update the hidden select
        if (this.elements.modelSelect) {
            this.elements.modelSelect.value = value;
        }

        // Update model config
        this.modelConfig.setSelectedModel(value);

        // Update selected state in dropdown
        if (dropdown) {
            dropdown.querySelectorAll('.custom-model-select-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            dropdown.querySelector(`[data-value="${value}"]`)?.classList.add('selected');
        }

        this.closeCustomSelect();
    }   
 private initializeEventListeners(): void {
        // Model selection
        if (this.elements.modelSelect) {
            this.elements.modelSelect.addEventListener('change', () => {
                this.modelConfig.setSelectedModel(this.elements.modelSelect!.value);
            });
        }

        // Temperature slider
        if (this.elements.temperatureSlider && this.elements.temperatureValue) {
            this.elements.temperatureSlider.addEventListener('input', () => {
                const value = parseFloat(this.elements.temperatureSlider!.value);
                this.modelConfig.updateParameter('temperature', value);
                this.elements.temperatureValue!.textContent = value.toString();
            });
        }

        // Top P slider
        if (this.elements.topPSlider && this.elements.topPValue) {
            this.elements.topPSlider.addEventListener('input', () => {
                const value = parseFloat(this.elements.topPSlider!.value);
                this.modelConfig.updateParameter('topP', value);
                this.elements.topPValue!.textContent = value.toString();
            });
        }

        // Refinement stages slider
        if (this.elements.refinementStagesSlider && this.elements.refinementStagesValue) {
            this.elements.refinementStagesSlider.addEventListener('input', () => {
                const value = parseInt(this.elements.refinementStagesSlider!.value);
                this.modelConfig.updateParameter('refinementStages', value);
                this.elements.refinementStagesValue!.textContent = value.toString();
            });
        }

        // Strategies slider
        if (this.elements.strategiesSlider && this.elements.strategiesValue) {
            this.elements.strategiesSlider.addEventListener('input', () => {
                let value = parseInt(this.elements.strategiesSlider!.value);
                
                // Enforce max 5 strategies when iterative corrections is enabled
                const iterativeEnabled = this.elements.iterativeCorrectionsToggle?.checked || false;
                if (iterativeEnabled && value > 5) {
                    value = 5;
                    this.elements.strategiesSlider!.value = '5';
                }
                
                this.modelConfig.updateParameter('strategiesCount', value);
                this.elements.strategiesValue!.textContent = value.toString();
            });
        }

        // Sub-strategies slider
        if (this.elements.subStrategiesSlider && this.elements.subStrategiesValue) {
            this.elements.subStrategiesSlider.addEventListener('input', () => {
                const value = parseInt(this.elements.subStrategiesSlider!.value);
                this.modelConfig.updateParameter('subStrategiesCount', value);
                this.elements.subStrategiesValue!.textContent = value.toString();
            });
        }

        // Hypothesis slider
        if (this.elements.hypothesisSlider && this.elements.hypothesisValue) {
            this.elements.hypothesisSlider.addEventListener('input', () => {
                const value = parseInt(this.elements.hypothesisSlider!.value);
                this.modelConfig.updateParameter('hypothesisCount', value);
                this.elements.hypothesisValue!.textContent = value.toString();
            });
        }

        // Refinement toggle (master control for refinement features)
        if (this.elements.refinementToggle) {
            this.elements.refinementToggle.addEventListener('change', () => {
                const isRefinementEnabled = this.elements.refinementToggle!.checked;
                this.modelConfig.updateParameter('refinementEnabled', isRefinementEnabled);
                
                // Control availability of sub-refinement options
                if (isRefinementEnabled) {
                    // Enable dissected observations toggle (unless iterative corrections is on)
                    if (this.elements.dissectedObservationsToggle) {
                        const iterativeEnabled = this.elements.iterativeCorrectionsToggle?.checked || false;
                        this.elements.dissectedObservationsToggle.disabled = iterativeEnabled;
                        if (!iterativeEnabled) {
                            this.elements.dissectedObservationsToggle.checked = true;
                            this.modelConfig.updateParameter('dissectedObservationsEnabled', true);
                        }
                    }
                    
                    // Enable iterative corrections toggle
                    if (this.elements.iterativeCorrectionsToggle) {
                        this.elements.iterativeCorrectionsToggle.disabled = false;
                    }
                } else {
                    // Disable and turn off both dissected observations and iterative corrections
                    if (this.elements.dissectedObservationsToggle) {
                        this.elements.dissectedObservationsToggle.disabled = true;
                        this.elements.dissectedObservationsToggle.checked = false;
                        this.modelConfig.updateParameter('dissectedObservationsEnabled', false);
                    }
                    
                    if (this.elements.iterativeCorrectionsToggle) {
                        this.elements.iterativeCorrectionsToggle.disabled = true;
                        this.elements.iterativeCorrectionsToggle.checked = false;
                        this.modelConfig.updateParameter('iterativeCorrectionsEnabled', false);
                        
                        // Re-enable sub-strategies toggle when iterative corrections is turned off
                        if (this.elements.skipSubStrategiesToggle) {
                            this.elements.skipSubStrategiesToggle.disabled = false;
                        }
                    }
                }
            });
        }

        // Sub-strategies toggle
        if (this.elements.skipSubStrategiesToggle) {
            this.elements.skipSubStrategiesToggle.addEventListener('change', () => {
                const isEnabled = this.elements.skipSubStrategiesToggle!.checked;
                this.modelConfig.updateParameter('skipSubStrategies', !isEnabled);
                
                // Disable/enable sub-strategies slider based on toggle state
                if (this.elements.subStrategiesSlider) {
                    this.elements.subStrategiesSlider.disabled = !isEnabled;
                    const sliderContainer = this.elements.subStrategiesSlider.closest('.input-group-tight');
                    if (sliderContainer) {
                        if (!isEnabled) {
                            sliderContainer.classList.add('disabled');
                        } else {
                            sliderContainer.classList.remove('disabled');
                        }
                    }
                }
            });
        }

        // Dissected observations toggle
        if (this.elements.dissectedObservationsToggle) {
            this.elements.dissectedObservationsToggle.addEventListener('change', () => {
                // Safety check: dissected observations requires refinement to be enabled
                const isRefinementEnabled = this.elements.refinementToggle?.checked || false;
                if (!isRefinementEnabled) {
                    this.elements.dissectedObservationsToggle!.checked = false;
                    return;
                }
                
                this.modelConfig.updateParameter('dissectedObservationsEnabled', this.elements.dissectedObservationsToggle!.checked);
            });
        }

        // Iterative corrections toggle
        if (this.elements.iterativeCorrectionsToggle) {
            this.elements.iterativeCorrectionsToggle.addEventListener('change', () => {
                // Safety check: iterative corrections requires refinement to be enabled
                const isRefinementEnabled = this.elements.refinementToggle?.checked || false;
                if (!isRefinementEnabled) {
                    this.elements.iterativeCorrectionsToggle!.checked = false;
                    return;
                }
                
                const isEnabled = this.elements.iterativeCorrectionsToggle!.checked;
                this.modelConfig.updateParameter('iterativeCorrectionsEnabled', isEnabled);
                
                // When iterative corrections is enabled:
                // 1. Disable dissected observations synthesis
                // 2. Disable sub-strategies and disable the toggle
                // 3. Limit strategies to max 5 for efficient context management
                if (isEnabled) {
                    // Disable dissected observations
                    if (this.elements.dissectedObservationsToggle) {
                        this.elements.dissectedObservationsToggle.checked = false;
                        this.elements.dissectedObservationsToggle.disabled = true;
                        this.modelConfig.updateParameter('dissectedObservationsEnabled', false);
                    }
                    
                    // Force disable sub-strategies and disable the toggle
                    if (this.elements.skipSubStrategiesToggle) {
                        this.elements.skipSubStrategiesToggle.checked = false;
                        this.elements.skipSubStrategiesToggle.disabled = true;
                        this.modelConfig.updateParameter('skipSubStrategies', true);
                        
                        // Disable sub-strategies slider
                        if (this.elements.subStrategiesSlider) {
                            this.elements.subStrategiesSlider.disabled = true;
                            const sliderContainer = this.elements.subStrategiesSlider.closest('.input-group-tight');
                            if (sliderContainer) {
                                sliderContainer.classList.add('disabled');
                            }
                        }
                    }
                    
                    // Limit strategies to max 5 for StructuredSolutionPool context management
                    if (this.elements.strategiesSlider && this.elements.strategiesValue) {
                        const currentStrategies = parseInt(this.elements.strategiesSlider.value);
                        if (currentStrategies > 5) {
                            this.elements.strategiesSlider.value = '5';
                            this.elements.strategiesValue.textContent = '5';
                            this.modelConfig.updateParameter('strategiesCount', 5);
                            console.log('[ModelSelectionUI] Limited strategies to 5 for IterativeCorrections mode');
                        }
                    }
                } else {
                    // Re-enable dissected observations when turning off iterative corrections
                    // (only if refinement is still enabled)
                    const isRefinementEnabled = this.elements.refinementToggle?.checked || false;
                    
                    if (this.elements.dissectedObservationsToggle && isRefinementEnabled) {
                        this.elements.dissectedObservationsToggle.disabled = false;
                        this.elements.dissectedObservationsToggle.checked = true;
                        this.modelConfig.updateParameter('dissectedObservationsEnabled', true);
                    }
                    
                    // Re-enable sub-strategies toggle
                    if (this.elements.skipSubStrategiesToggle) {
                        this.elements.skipSubStrategiesToggle.disabled = false;
                        // Don't auto-change the checked state, let user control it
                    }
                }
            });
        }

        // Provide all solutions to correctors toggle
        if (this.elements.provideAllSolutionsToggle) {
            this.elements.provideAllSolutionsToggle.addEventListener('change', () => {
                // Safety check: requires refinement to be enabled
                const isRefinementEnabled = this.elements.refinementToggle?.checked || false;
                if (!isRefinementEnabled) {
                    this.elements.provideAllSolutionsToggle!.checked = false;
                    return;
                }
                
                this.modelConfig.updateParameter('provideAllSolutionsToCorrectors', this.elements.provideAllSolutionsToggle!.checked);
            });
        }

        // Post Quality Filter toggle
        if (this.elements.postQualityFilterToggle) {
            this.elements.postQualityFilterToggle.addEventListener('change', () => {
                this.modelConfig.updateParameter('postQualityFilterEnabled', this.elements.postQualityFilterToggle!.checked);
            });
        }

        // Red team buttons
        this.initializeRedTeamButtons();

        // Hypothesis toggle
        this.initializeHypothesisToggle();
    } 
   private initializeRedTeamButtons(): void {
        const redTeamButtons = document.querySelectorAll('.red-team-button');
        redTeamButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons
                redTeamButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                button.classList.add('active');
                // Update model config
                const value = (button as HTMLElement).dataset.value || 'balanced';
                this.modelConfig.updateParameter('redTeamAggressiveness', value);
            });
        });
    }

    private initializeHypothesisToggle(): void {
        const hypothesisToggle = document.getElementById('hypothesis-toggle') as HTMLInputElement;
        const hypothesisSliderContainer = document.getElementById('hypothesis-slider-container');
        const windowHeader = document.querySelector('.information-packet-window .window-header');
        
        const togglePacket = () => {
            const informationPacketContent = document.getElementById('information-packet-content');
            const executionAgentsVisualization = document.getElementById('execution-agents-visualization');
            const hypothesisSlider = document.getElementById('hypothesis-slider') as HTMLInputElement;
            
            if (hypothesisToggle.checked) {
                if (hypothesisSliderContainer) hypothesisSliderContainer.classList.remove('hidden');
                if (informationPacketContent) informationPacketContent.classList.remove('hidden');
                if (executionAgentsVisualization) executionAgentsVisualization.classList.remove('hidden');
                
                // Restore the slider value to the parameter
                if (hypothesisSlider) {
                    const sliderValue = parseInt(hypothesisSlider.value, 10);
                    this.modelConfig.updateParameter('hypothesisCount', sliderValue);
                }
            } else {
                if (hypothesisSliderContainer) hypothesisSliderContainer.classList.add('hidden');
                if (informationPacketContent) informationPacketContent.classList.add('hidden');
                if (executionAgentsVisualization) executionAgentsVisualization.classList.add('hidden');
                this.modelConfig.updateParameter('hypothesisCount', 0);
            }
            
            // Trigger API call estimator update
            if (this.apiCallEstimator) {
                this.apiCallEstimator.updateApiCallDisplay();
            }
        };
        
        if (hypothesisToggle && hypothesisSliderContainer) {
            hypothesisToggle.addEventListener('change', togglePacket);
            
            // Make the entire window header clickable to toggle the packet
            if (windowHeader) {
                windowHeader.addEventListener('click', (e) => {
                    // Don't toggle if clicking directly on the toggle input itself
                    if (e.target !== hypothesisToggle) {
                        hypothesisToggle.checked = !hypothesisToggle.checked;
                        togglePacket();
                    }
                });
                
                // Add cursor pointer to indicate clickability
                (windowHeader as HTMLElement).style.cursor = 'pointer';
            }
        }
    }

    private updateUI(): void {
        const params = this.modelConfig.getParameters();

        // Update slider values
        if (this.elements.temperatureSlider) {
            this.elements.temperatureSlider.value = params.temperature.toString();
        }
        if (this.elements.temperatureValue) {
            this.elements.temperatureValue.textContent = params.temperature.toString();
        }

        if (this.elements.topPSlider) {
            this.elements.topPSlider.value = params.topP.toString();
        }
        if (this.elements.topPValue) {
            this.elements.topPValue.textContent = params.topP.toString();
        }

        if (this.elements.refinementStagesSlider) {
            this.elements.refinementStagesSlider.value = params.refinementStages.toString();
        }
        if (this.elements.refinementStagesValue) {
            this.elements.refinementStagesValue.textContent = params.refinementStages.toString();
        }

        if (this.elements.strategiesSlider) {
            this.elements.strategiesSlider.value = params.strategiesCount.toString();
        }
        if (this.elements.strategiesValue) {
            this.elements.strategiesValue.textContent = params.strategiesCount.toString();
        }

        if (this.elements.subStrategiesSlider) {
            this.elements.subStrategiesSlider.value = params.subStrategiesCount.toString();
        }
        if (this.elements.subStrategiesValue) {
            this.elements.subStrategiesValue.textContent = params.subStrategiesCount.toString();
        }

        if (this.elements.hypothesisSlider) {
            this.elements.hypothesisSlider.value = params.hypothesisCount.toString();
        }
        if (this.elements.hypothesisValue) {
            this.elements.hypothesisValue.textContent = params.hypothesisCount.toString();
        }

        if (this.elements.refinementToggle) {
            this.elements.refinementToggle.checked = params.refinementEnabled;
        }

        if (this.elements.skipSubStrategiesToggle) {
            this.elements.skipSubStrategiesToggle.checked = !params.skipSubStrategies;
            
            // Update sub-strategies slider state based on toggle
            if (this.elements.subStrategiesSlider) {
                this.elements.subStrategiesSlider.disabled = params.skipSubStrategies;
                const sliderContainer = this.elements.subStrategiesSlider.closest('.input-group-tight');
                if (sliderContainer) {
                    if (params.skipSubStrategies) {
                        sliderContainer.classList.add('disabled');
                    } else {
                        sliderContainer.classList.remove('disabled');
                    }
                }
            }
        }

        // Update red team buttons
        const redTeamButtons = document.querySelectorAll('.red-team-button');
        redTeamButtons.forEach(button => {
            const buttonValue = (button as HTMLElement).dataset.value;
            if (buttonValue === params.redTeamAggressiveness) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
    }

    public getModelConfig(): ModelConfigManager {
        return this.modelConfig;
    }

    /**
     * Public method to sync UI with current model parameters
     * Useful after importing configuration
     */
    public syncUIWithParameters(): void {
        this.updateUI();
        this.initializeRefinementState();
        // Update API call estimator to reflect imported parameters
        if (this.apiCallEstimator) {
            this.apiCallEstimator.updateApiCallDisplay();
        }
    }

    /**
     * Initialize the state of refinement-related toggles based on master refinement toggle
     */
    private initializeRefinementState(): void {
        const params = this.modelConfig.getParameters();
        const isRefinementEnabled = params.refinementEnabled;
        
        // Set initial state of dissected observations and iterative corrections toggles
        if (this.elements.dissectedObservationsToggle) {
            this.elements.dissectedObservationsToggle.checked = params.dissectedObservationsEnabled;
            // Disable if refinement is off OR if iterative corrections is on
            this.elements.dissectedObservationsToggle.disabled = !isRefinementEnabled || params.iterativeCorrectionsEnabled;
        }
        
        if (this.elements.iterativeCorrectionsToggle) {
            this.elements.iterativeCorrectionsToggle.checked = params.iterativeCorrectionsEnabled;
            // Disable if refinement is off
            this.elements.iterativeCorrectionsToggle.disabled = !isRefinementEnabled;
        }
        
        if (this.elements.provideAllSolutionsToggle) {
            this.elements.provideAllSolutionsToggle.checked = params.provideAllSolutionsToCorrectors;
            // Disable if refinement is off
            this.elements.provideAllSolutionsToggle.disabled = !isRefinementEnabled;
        }
        
        // If iterative corrections is enabled, ensure sub-strategies is forced off and disabled
        if (params.iterativeCorrectionsEnabled && this.elements.skipSubStrategiesToggle) {
            this.elements.skipSubStrategiesToggle.checked = false;
            this.elements.skipSubStrategiesToggle.disabled = true;
        }
    }
}