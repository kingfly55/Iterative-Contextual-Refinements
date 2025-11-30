/**
 * DeepthinkConfigPanel.tsx
 * Configuration panel displayed on the right side when Deepthink mode is active and idle
 * EXACT REPLICA of the left panel design
 */

export interface DeepthinkConfigPanelProps {
    strategiesCount: number;
    subStrategiesCount: number;
    hypothesisCount: number;
    skipSubStrategies: boolean;
    hypothesisEnabled: boolean;
    redTeamMode: string;
    postQualityFilterEnabled: boolean;
    refinementEnabled: boolean;
    dissectedObservationsEnabled: boolean;
    iterativeCorrectionsEnabled: boolean;
    provideAllSolutionsEnabled: boolean;
    onStrategiesChange: (value: number) => void;
    onSubStrategiesChange: (value: number) => void;
    onHypothesisChange: (value: number) => void;
    onSkipSubStrategiesToggle: (enabled: boolean) => void;
    onHypothesisToggle: (enabled: boolean) => void;
    onRedTeamModeChange: (mode: string) => void;
    onPostQualityFilterToggle: (enabled: boolean) => void;
    onRefinementToggle: (enabled: boolean) => void;
    onDissectedObservationsToggle: (enabled: boolean) => void;
    onIterativeCorrectionsToggle: (enabled: boolean) => void;
    onProvideAllSolutionsToggle: (enabled: boolean) => void;
}

export function renderDeepthinkConfigPanel(container: HTMLElement, props: DeepthinkConfigPanelProps): void {
    container.innerHTML = `
        <div class="deepthink-config-panel">
            <div class="deepthink-config-scroll-container">
                
                <!-- Top Row Container: Strategy Execution + Red Team -->
                <div class="config-row-container">
                    <div class="config-row-inner">
                    <!-- Strategy Execution Options Container -->
                <div class="strategy-execution-container">
                    <div class="strategy-execution-header">
                        <span class="material-symbols-outlined">account_tree</span>
                        <span>Strategy Execution</span>
                    </div>
                    
                    <div class="strategy-execution-card">
                        <!-- Primary Strategy Count -->
                        <div class="strategy-execution-section">
                            <div class="input-group-tight">
                                <label for="dt-strategies-slider" class="input-label">Strategies: <span id="dt-strategies-value">${props.strategiesCount}</span></label>
                                <input type="range" id="dt-strategies-slider" class="slider" min="1" max="10" step="1" value="${props.strategiesCount}">
                            </div>
                        </div>
                        
                        <!-- Sub-Strategies Slider with Dots -->
                        <div class="strategy-execution-divider"></div>
                        
                        <div class="strategy-execution-section ${props.subStrategiesCount === 0 ? 'dimmed' : ''}">
                            <div class="input-group-tight">
                                <label for="dt-sub-strategies-slider" class="input-label">Sub-strategies: <span id="dt-sub-strategies-value">${props.subStrategiesCount}</span> ${props.subStrategiesCount === 0 ? '<span class="disabled-label">(Disabled)</span>' : ''}</label>
                                <div class="slider-with-dots">
                                    <input type="range" id="dt-sub-strategies-slider" class="slider dots-slider" min="0" max="10" step="1" value="${props.subStrategiesCount}" ${props.iterativeCorrectionsEnabled ? 'disabled' : ''}>
                                    <div class="slider-dots">
                                        ${Array.from({ length: 11 }, (_, i) => `<span class="slider-dot" data-value="${i}">${i}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    </div>
                    
                    <!-- Red Team Options Container -->
                <div class="red-team-options-container">
                    <div class="red-team-options-header">
                        <span class="material-symbols-outlined">security</span>
                        <span>Red Team Evaluation</span>
                    </div>
                    <div class="red-team-toggle-wrapper">
                        <div class="red-team-buttons">
                            <button type="button" class="red-team-button ${props.redTeamMode === 'off' ? 'active' : ''}" data-value="off">Off</button>
                            <button type="button" class="red-team-button ${props.redTeamMode === 'balanced' ? 'active' : ''}" data-value="balanced">Balanced</button>
                            <button type="button" class="red-team-button ${props.redTeamMode === 'very_aggressive' ? 'active' : ''}" data-value="very_aggressive">Aggressive</button>
                        </div>
                    </div>
                    
                    <!-- Post Quality Filter Card -->
                    <div class="post-quality-filter-card-wrapper">
                        <div class="refinement-method-card post-quality-filter-card ${!props.iterativeCorrectionsEnabled ? 'disabled' : ''}" data-method="postqualityfilter">
                            <div class="method-card-header">
                                <div class="method-card-selector">
                                    <input type="checkbox" id="dt-post-quality-filter-toggle" class="method-checkbox" ${props.postQualityFilterEnabled ? 'checked' : ''} ${!props.iterativeCorrectionsEnabled ? 'disabled' : ''}>
                                    <label for="dt-post-quality-filter-toggle" class="method-checkbox-label">
                                        <div class="method-checkbox-custom"></div>
                                    </label>
                                </div>
                                <div class="method-card-title">
                                    <div class="method-name">Post Quality Filter</div>
                                    <div class="method-type">Strategy Evolution</div>
                                </div>
                            </div>
                            <div class="method-card-description">
                                Requires Iterative Corrections enabled. Iteratively refines strategies based on execution quality.
                            </div>
                        </div>
                    </div>
                    </div>
                    </div>
                </div>
                
                <!-- Bottom Row Container: Information Packet + Refinement -->
                <div class="config-row-container">
                    <div class="config-row-inner">
                    <!-- Information Packet Options Container -->
                <div class="information-packet-container">
                    <div class="information-packet-window" id="dt-information-packet-window">
                        <div class="window-header">
                            <div class="window-left">
                                <label class="window-toggle-label">
                                    <input type="checkbox" id="dt-hypothesis-toggle" class="window-toggle-input" ${props.hypothesisEnabled ? 'checked' : ''}>
                                    <span class="window-toggle-slider"></span>
                                </label>
                                <div class="window-title">Information Packet</div>
                            </div>
                            <div class="window-right">
                                <div class="window-controls">
                                    <div class="window-button close"></div>
                                    <div class="window-button minimize"></div>
                                    <div class="window-button maximize"></div>
                                </div>
                            </div>
                        </div>
                        <div class="window-content" id="dt-information-packet-content">
                            <div class="loading-info">
                                <div class="loading-line" style="width: 85%;"></div>
                                <div class="loading-line" style="width: 92%;"></div>
                                <div class="loading-line" style="width: 78%;"></div>
                                <div class="loading-line" style="width: 95%;"></div>
                                <div class="loading-line" style="width: 68%;"></div>
                                <div class="loading-line" style="width: 88%;"></div>
                                <div class="loading-line" style="width: 90%;"></div>
                                <div class="loading-line" style="width: 75%;"></div>
                                <div class="loading-line" style="width: 93%;"></div>
                                <div class="loading-line" style="width: 82%;"></div>
                                <div class="loading-line" style="width: 87%;"></div>
                                <div class="loading-line" style="width: 79%;"></div>
                                <div class="loading-line" style="width: 91%;"></div>
                                <div class="loading-line" style="width: 84%;"></div>
                                <div class="loading-line" style="width: 77%;"></div>
                                <div class="loading-line" style="width: 89%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="execution-agents-visualization" id="dt-execution-agents-visualization">
                        <div class="connection-nodes">
                            <svg class="connection-svg" viewBox="0 0 400 40">
                                <defs>
                                    <linearGradient id="dtBlueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" style="stop-color:var(--accent-blue);stop-opacity:0.9" />
                                        <stop offset="100%" style="stop-color:var(--accent-blue);stop-opacity:0.3" />
                                    </linearGradient>
                                </defs>
                                <circle cx="200" cy="0" r="4" fill="var(--accent-blue)" opacity="1"/>
                                <line x1="200" y1="0" x2="60" y2="40" stroke="url(#dtBlueGradient)" stroke-width="2" opacity="0.8"/>
                                <line x1="200" y1="0" x2="120" y2="40" stroke="url(#dtBlueGradient)" stroke-width="2" opacity="0.7"/>
                                <line x1="200" y1="0" x2="180" y2="40" stroke="url(#dtBlueGradient)" stroke-width="2" opacity="0.8"/>
                                <line x1="200" y1="0" x2="220" y2="40" stroke="url(#dtBlueGradient)" stroke-width="2" opacity="0.6"/>
                                <line x1="200" y1="0" x2="280" y2="40" stroke="url(#dtBlueGradient)" stroke-width="2" opacity="0.7"/>
                                <line x1="200" y1="0" x2="340" y2="40" stroke="url(#dtBlueGradient)" stroke-width="2" opacity="0.8"/>
                                <circle cx="60" cy="40" r="3" fill="var(--accent-blue)" opacity="0.6"/>
                                <circle cx="120" cy="40" r="3" fill="var(--accent-blue)" opacity="0.5"/>
                                <circle cx="180" cy="40" r="3" fill="var(--accent-blue)" opacity="0.6"/>
                                <circle cx="220" cy="40" r="3" fill="var(--accent-blue)" opacity="0.4"/>
                                <circle cx="280" cy="40" r="3" fill="var(--accent-blue)" opacity="0.5"/>
                                <circle cx="340" cy="40" r="3" fill="var(--accent-blue)" opacity="0.6"/>
                            </svg>
                        </div>
                        <div class="execution-agents-wrapper">
                            <div class="execution-agents-text">
                                Execution & Refinement Agents
                            </div>
                        </div>
                    </div>
                    <!-- Hypothesis Slider Card -->
                    <div class="hypothesis-slider-card">
                        <div class="hypothesis-slider-container" id="dt-hypothesis-slider-container">
                            <div class="input-group-tight">
                                <label for="dt-hypothesis-slider" class="input-label">Hypothesis Count: <span id="dt-hypothesis-value">${props.hypothesisCount}</span></label>
                                <input type="range" id="dt-hypothesis-slider" class="slider" min="1" max="6" step="1" value="${props.hypothesisCount}" ${!props.hypothesisEnabled ? 'disabled' : ''}>
                            </div>
                        </div>
                    </div>
                    </div>
                    
                    <!-- Refinement Options Container -->
                <div class="refinement-options-container">
                    <div class="refinement-options-header">
                        <span class="material-symbols-outlined">auto_fix_high</span>
                        <span>Solution Refinement</span>
                    </div>
                    
                    <!-- Master Control -->
                    <div class="refinement-master-control">
                        <label class="toggle-label">
                            <input type="checkbox" id="dt-refinement-toggle" class="toggle-input" ${props.refinementEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <div class="refinement-master-info">
                            <div class="refinement-master-title">Enable Refinements</div>
                            <div class="refinement-master-description">Generates critique for each solution & attempts to correct it</div>
                        </div>
                    </div>

                    <!-- Refinement Methods -->
                    <div class="refinement-methods">
                        <div class="refinement-methods-label">Select Refinement Strategy</div>
                        
                        <!-- Row 1: Synthesis + Full Context side by side -->
                        <div class="refinement-methods-row">
                            <!-- Method 1: Synthesis -->
                            <div class="refinement-method-card ${!props.refinementEnabled || props.iterativeCorrectionsEnabled ? 'disabled' : ''}" data-method="synthesis">
                                <div class="method-card-header">
                                    <div class="method-card-selector">
                                        <input type="checkbox" id="dt-dissected-observations-toggle" class="method-checkbox" ${props.dissectedObservationsEnabled ? 'checked' : ''} ${!props.refinementEnabled || props.iterativeCorrectionsEnabled ? 'disabled' : ''}>
                                        <label for="dt-dissected-observations-toggle" class="method-checkbox-label">
                                            <div class="method-checkbox-custom"></div>
                                        </label>
                                    </div>
                                    <div class="method-card-title">
                                        <div class="method-name">Critique Synthesis</div>
                                        <div class="method-type">Single Pass</div>
                                    </div>
                                </div>
                                <div class="method-card-description">
                                    Synthesizes all solution critiques. Cannot use with Iterative Corrections.
                                </div>
                            </div>

                            <!-- Method 3: Full Context -->
                            <div class="refinement-method-card ${!props.refinementEnabled || props.iterativeCorrectionsEnabled ? 'disabled' : ''}" data-method="fullcontext">
                                <div class="method-card-header">
                                    <div class="method-card-selector">
                                        <input type="checkbox" id="dt-provide-all-solutions-toggle" class="method-checkbox" ${props.provideAllSolutionsEnabled ? 'checked' : ''} ${!props.refinementEnabled || props.iterativeCorrectionsEnabled ? 'disabled' : ''}>
                                        <label for="dt-provide-all-solutions-toggle" class="method-checkbox-label">
                                            <div class="method-checkbox-custom"></div>
                                        </label>
                                    </div>
                                    <div class="method-card-title">
                                        <div class="method-name">Full Solution Context</div>
                                        <div class="method-type">Static Solution Pool</div>
                                    </div>
                                </div>
                                <div class="method-card-description">
                                    Provides all solutions to correctors. Cannot use with Iterative Corrections.
                                </div>
                            </div>
                        </div>

                        <!-- Row 2: Iterative full width -->
                        <div class="refinement-method-card ${!props.refinementEnabled ? 'disabled' : ''}" data-method="iterative">
                            <div class="method-card-header">
                                <div class="method-card-selector">
                                    <input type="checkbox" id="dt-iterative-corrections-toggle" class="method-checkbox" ${props.iterativeCorrectionsEnabled ? 'checked' : ''} ${props.refinementEnabled ? '' : 'disabled'}>
                                    <label for="dt-iterative-corrections-toggle" class="method-checkbox-label">
                                        <div class="method-checkbox-custom"></div>
                                    </label>
                                </div>
                                <div class="method-card-title">
                                    <div class="method-name">Iterative Corrections</div>
                                    <div class="method-type">3 Refinement Loops</div>
                                </div>
                            </div>
                            <div class="method-card-description">
                                Iterative loop of Corrector & Critique. Disables Synthesis & Full Context options.
                            </div>
                        </div>
                    </div>
                    </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Add event listeners
    attachConfigPanelEventListeners(container, props);
}

function attachConfigPanelEventListeners(container: HTMLElement, props: DeepthinkConfigPanelProps): void {
    // Strategies slider
    const strategiesSlider = container.querySelector('#dt-strategies-slider') as HTMLInputElement;
    const strategiesValue = container.querySelector('#dt-strategies-value') as HTMLElement;
    if (strategiesSlider && strategiesValue) {
        // Initialize fill (use current max attribute)
        const initValue = parseInt(strategiesSlider.value);
        const initMax = parseInt(strategiesSlider.max);
        const initPercentage = ((initValue - 1) / (initMax - 1)) * 100;
        strategiesSlider.style.background = `linear-gradient(to right, #e86b6b 0%, #e86b6b ${initPercentage}%, rgba(255, 255, 255, 0.1) ${initPercentage}%, rgba(255, 255, 255, 0.1) 100%)`;

        strategiesSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            strategiesValue.textContent = value.toString();

            // Update slider fill (use current max attribute)
            const max = parseInt(strategiesSlider.max);
            const percentage = ((value - 1) / (max - 1)) * 100;
            strategiesSlider.style.background = `linear-gradient(to right, #e86b6b 0%, #e86b6b ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`;

            props.onStrategiesChange(value);
        });
    }

    // Sub-strategies slider (now includes 0 = disabled)
    const subStrategiesSlider = container.querySelector('#dt-sub-strategies-slider') as HTMLInputElement;
    const subStrategiesValue = container.querySelector('#dt-sub-strategies-value') as HTMLElement;
    const subStrategiesSection = subStrategiesSlider?.closest('.strategy-execution-section') as HTMLElement;
    if (subStrategiesSlider && subStrategiesValue && subStrategiesSection) {
        subStrategiesSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);

            // Force update the display value
            if (subStrategiesValue) {
                subStrategiesValue.textContent = value.toString();
            }

            // Update dots visual
            const dots = container.querySelectorAll('.slider-dot');
            dots.forEach((dot, index) => {
                if (index <= value) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });

            // Update dimmed class and disabled label
            if (value === 0) {
                subStrategiesSection.classList.add('dimmed');
                const label = subStrategiesSection.querySelector('.input-label');
                const existingDisabledLabel = label?.querySelector('.disabled-label');
                if (label && !existingDisabledLabel) {
                    const disabledSpan = document.createElement('span');
                    disabledSpan.className = 'disabled-label';
                    disabledSpan.textContent = '(Disabled)';
                    label.appendChild(disabledSpan);
                }
            } else {
                subStrategiesSection.classList.remove('dimmed');
                const disabledLabel = subStrategiesSection.querySelector('.disabled-label');
                if (disabledLabel) {
                    disabledLabel.remove();
                }
            }

            // Update slider fill
            const percentage = (value / 10) * 100;
            subStrategiesSlider.style.background = `linear-gradient(to right, #e86b6b 0%, #e86b6b ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`;

            // When value is 0, disable sub-strategies
            props.onSkipSubStrategiesToggle(value === 0);
            props.onSubStrategiesChange(value); // Always update, backend handles 0 case
        });

        // Initialize dots and fill
        const initialValue = parseInt(subStrategiesSlider.value);
        const dots = container.querySelectorAll('.slider-dot');
        dots.forEach((dot, index) => {
            if (index <= initialValue) {
                dot.classList.add('active');
            }
        });

        // Initialize fill
        const initPercentage = (initialValue / 10) * 100;
        subStrategiesSlider.style.background = `linear-gradient(to right, #e86b6b 0%, #e86b6b ${initPercentage}%, rgba(255, 255, 255, 0.1) ${initPercentage}%, rgba(255, 255, 255, 0.1) 100%)`;
    }

    // Hypothesis toggle with collapse/expand
    const hypothesisToggle = container.querySelector('#dt-hypothesis-toggle') as HTMLInputElement;
    const infoPacketWindow = container.querySelector('#dt-information-packet-window') as HTMLElement;
    if (hypothesisToggle && infoPacketWindow) {
        hypothesisToggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;

            // Update the main toggle first
            props.onHypothesisToggle(checked);

            // Collapse/expand the window
            if (checked) {
                infoPacketWindow.classList.remove('collapsed');
            } else {
                infoPacketWindow.classList.add('collapsed');
            }

            // Update disabled state
            const hypothesisSlider = container.querySelector('#dt-hypothesis-slider') as HTMLInputElement;
            if (hypothesisSlider) {
                hypothesisSlider.disabled = !checked;
            }

            // Explicitly update the hypothesis count to ensure it's 0 when disabled
            // This ensures the information packet is actually disabled during the run
            if (!checked) {
                props.onHypothesisChange(0);
            }
        });

        // Initialize collapsed state
        if (!hypothesisToggle.checked) {
            infoPacketWindow.classList.add('collapsed');
        }
    }

    // Hypothesis slider
    const hypothesisSlider = container.querySelector('#dt-hypothesis-slider') as HTMLInputElement;
    const hypothesisValue = container.querySelector('#dt-hypothesis-value') as HTMLElement;
    if (hypothesisSlider && hypothesisValue) {
        // Initialize fill
        const initValue = parseInt(hypothesisSlider.value);
        const initPercentage = ((initValue - 1) / 5) * 100; // min=1, max=6, range=5
        hypothesisSlider.style.background = `linear-gradient(to right, var(--accent-blue) 0%, var(--accent-blue) ${initPercentage}%, rgba(66, 133, 244, 0.1) ${initPercentage}%, rgba(66, 133, 244, 0.1) 100%)`;

        hypothesisSlider.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            hypothesisValue.textContent = value.toString();

            // Update slider fill
            const percentage = ((value - 1) / 5) * 100;
            hypothesisSlider.style.background = `linear-gradient(to right, var(--accent-blue) 0%, var(--accent-blue) ${percentage}%, rgba(66, 133, 244, 0.1) ${percentage}%, rgba(66, 133, 244, 0.1) 100%)`;

            props.onHypothesisChange(value);
        });
    }

    // Red team buttons
    const redTeamButtons = container.querySelectorAll('.red-team-button[data-value]');
    redTeamButtons.forEach(button => {
        button.addEventListener('click', () => {
            const value = (button as HTMLElement).dataset.value;
            if (value) {
                redTeamButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                props.onRedTeamModeChange(value);
            }
        });
    });

    // Post quality filter
    const postQualityFilterToggle = container.querySelector('#dt-post-quality-filter-toggle') as HTMLInputElement;
    if (postQualityFilterToggle) {
        postQualityFilterToggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onPostQualityFilterToggle(checked);
        });
    }

    // Refinement toggle
    const refinementToggle = container.querySelector('#dt-refinement-toggle') as HTMLInputElement;
    if (refinementToggle) {
        refinementToggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onRefinementToggle(checked);

            // Update disabled state for all refinement method checkboxes and cards
            const synthesisToggle = container.querySelector('#dt-dissected-observations-toggle') as HTMLInputElement;
            const fullContextToggle = container.querySelector('#dt-provide-all-solutions-toggle') as HTMLInputElement;
            const iterativeToggle = container.querySelector('#dt-iterative-corrections-toggle') as HTMLInputElement;
            const postQualityFilter = container.querySelector('#dt-post-quality-filter-toggle') as HTMLInputElement;

            const synthesisCard = container.querySelector('[data-method="synthesis"]') as HTMLElement;
            const fullContextCard = container.querySelector('[data-method="fullcontext"]') as HTMLElement;
            const iterativeCard = container.querySelector('[data-method="iterative"]') as HTMLElement;
            const postQualityCard = container.querySelector('.post-quality-filter-card') as HTMLElement;

            if (checked) {
                // Enable all method cards (respecting iterative corrections rules)
                const iterativeIsOn = iterativeToggle && iterativeToggle.checked;
                if (synthesisToggle) synthesisToggle.disabled = iterativeIsOn;
                if (fullContextToggle) fullContextToggle.disabled = iterativeIsOn;
                if (iterativeToggle) iterativeToggle.disabled = false;
                if (postQualityFilter) postQualityFilter.disabled = !iterativeIsOn; // Only enabled if iterative is on

                // Remove disabled class from cards
                if (synthesisCard) synthesisCard.classList.toggle('disabled', iterativeIsOn);
                if (fullContextCard) fullContextCard.classList.toggle('disabled', iterativeIsOn);
                if (iterativeCard) iterativeCard.classList.remove('disabled');
                if (postQualityCard) postQualityCard.classList.toggle('disabled', !iterativeIsOn);
            } else {
                // Disable and uncheck all method cards when refinement is disabled
                if (synthesisToggle) {
                    synthesisToggle.checked = false;
                    synthesisToggle.disabled = true;
                    props.onDissectedObservationsToggle(false);
                }
                if (fullContextToggle) {
                    fullContextToggle.checked = false;
                    fullContextToggle.disabled = true;
                    props.onProvideAllSolutionsToggle(false);
                }
                if (iterativeToggle) {
                    iterativeToggle.checked = false;
                    iterativeToggle.disabled = true;
                    props.onIterativeCorrectionsToggle(false);
                }
                if (postQualityFilter) {
                    postQualityFilter.checked = false;
                    postQualityFilter.disabled = true;
                    props.onPostQualityFilterToggle(false);
                }

                // Restore strategies max to 10 (since iterative corrections is being disabled)
                const strategiesSlider = container.querySelector('#dt-strategies-slider') as HTMLInputElement;
                if (strategiesSlider) {
                    strategiesSlider.max = '10';
                }

                // Re-enable sub-strategies slider (since iterative corrections is being disabled)
                const subStrategiesSlider = container.querySelector('#dt-sub-strategies-slider') as HTMLInputElement;
                if (subStrategiesSlider) {
                    subStrategiesSlider.disabled = false;

                    // Remove dimmed state if value > 0
                    const currentValue = parseInt(subStrategiesSlider.value);
                    if (currentValue > 0) {
                        const subStrategiesSection = subStrategiesSlider.closest('.strategy-execution-section') as HTMLElement;
                        if (subStrategiesSection) {
                            subStrategiesSection.classList.remove('dimmed');
                            const disabledLabel = subStrategiesSection.querySelector('.disabled-label');
                            if (disabledLabel) {
                                disabledLabel.remove();
                            }
                        }
                    }
                }

                // Add disabled class to all cards
                if (synthesisCard) synthesisCard.classList.add('disabled');
                if (fullContextCard) fullContextCard.classList.add('disabled');
                if (iterativeCard) iterativeCard.classList.add('disabled');
                if (postQualityCard) postQualityCard.classList.add('disabled');
            }
        });
    }

    // Dissected observations
    const dissectedObservationsToggle = container.querySelector('#dt-dissected-observations-toggle') as HTMLInputElement;
    if (dissectedObservationsToggle) {
        dissectedObservationsToggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onDissectedObservationsToggle(checked);
        });
    }

    // Iterative corrections (with special logic)
    const iterativeCorrectionsToggle = container.querySelector('#dt-iterative-corrections-toggle') as HTMLInputElement;
    if (iterativeCorrectionsToggle) {
        iterativeCorrectionsToggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onIterativeCorrectionsToggle(checked);

            if (checked) {
                // When iterative corrections is ON:
                // 0. Limit strategies to max 5
                const strategiesSlider = container.querySelector('#dt-strategies-slider') as HTMLInputElement;
                const strategiesValue = container.querySelector('#dt-strategies-value') as HTMLElement;
                if (strategiesSlider && strategiesValue) {
                    const currentStrategies = parseInt(strategiesSlider.value);
                    strategiesSlider.max = '5';

                    // If current value > 5, set it to 5
                    if (currentStrategies > 5) {
                        strategiesSlider.value = '5';
                        strategiesValue.textContent = '5';
                        props.onStrategiesChange(5);

                        // Update slider fill
                        const percentage = ((5 - 1) / 4) * 100; // min=1, max=5, range=4
                        strategiesSlider.style.background = `linear-gradient(to right, #e86b6b 0%, #e86b6b ${percentage}%, rgba(255, 255, 255, 0.1) ${percentage}%, rgba(255, 255, 255, 0.1) 100%)`;
                    }
                }

                // 1. Disable synthesis and full context
                const synthesisToggle = container.querySelector('#dt-dissected-observations-toggle') as HTMLInputElement;
                const fullContextToggle = container.querySelector('#dt-provide-all-solutions-toggle') as HTMLInputElement;
                const synthesisCard = container.querySelector('[data-method="synthesis"]') as HTMLElement;
                const fullContextCard = container.querySelector('[data-method="fullcontext"]') as HTMLElement;

                if (synthesisToggle) {
                    synthesisToggle.checked = false;
                    synthesisToggle.disabled = true;
                    props.onDissectedObservationsToggle(false);
                }
                if (fullContextToggle) {
                    fullContextToggle.checked = false;
                    fullContextToggle.disabled = true;
                    props.onProvideAllSolutionsToggle(false);
                }
                if (synthesisCard) synthesisCard.classList.add('disabled');
                if (fullContextCard) fullContextCard.classList.add('disabled');

                // 2. Set sub-strategies to 0 (disable)
                const subStrategiesSlider = container.querySelector('#dt-sub-strategies-slider') as HTMLInputElement;
                if (subStrategiesSlider) {
                    subStrategiesSlider.value = '0';
                    subStrategiesSlider.disabled = true;
                    const subStrategiesValue = container.querySelector('#dt-sub-strategies-value') as HTMLElement;
                    if (subStrategiesValue) {
                        subStrategiesValue.textContent = '0';
                    }
                    props.onSkipSubStrategiesToggle(true);

                    // Update dots visual
                    const dots = container.querySelectorAll('.slider-dot');
                    dots.forEach(dot => dot.classList.remove('active'));

                    // Add dimmed class and disabled label
                    const subStrategiesSection = subStrategiesSlider.closest('.strategy-execution-section') as HTMLElement;
                    if (subStrategiesSection) {
                        subStrategiesSection.classList.add('dimmed');
                        const label = subStrategiesSection.querySelector('.input-label');
                        const existingDisabledLabel = label?.querySelector('.disabled-label');
                        if (label && !existingDisabledLabel) {
                            const disabledSpan = document.createElement('span');
                            disabledSpan.className = 'disabled-label';
                            disabledSpan.textContent = ' (Disabled)';
                            label.appendChild(disabledSpan);
                        }
                    }
                }

                // 3. Enable post quality filter
                const postQualityFilter = container.querySelector('#dt-post-quality-filter-toggle') as HTMLInputElement;
                const postQualityCard = container.querySelector('.post-quality-filter-card') as HTMLElement;
                if (postQualityFilter) {
                    postQualityFilter.disabled = false;
                }
                if (postQualityCard) {
                    postQualityCard.classList.remove('disabled');
                }
            } else {
                // When iterative corrections is OFF:
                // 0. Restore strategies max to 10
                const strategiesSlider = container.querySelector('#dt-strategies-slider') as HTMLInputElement;
                if (strategiesSlider) {
                    strategiesSlider.max = '10';
                }

                // 1. Enable synthesis and full context
                const synthesisToggle = container.querySelector('#dt-dissected-observations-toggle') as HTMLInputElement;
                const fullContextToggle = container.querySelector('#dt-provide-all-solutions-toggle') as HTMLInputElement;
                const synthesisCard = container.querySelector('[data-method="synthesis"]') as HTMLElement;
                const fullContextCard = container.querySelector('[data-method="fullcontext"]') as HTMLElement;

                if (synthesisToggle) synthesisToggle.disabled = false;
                if (fullContextToggle) fullContextToggle.disabled = false;
                if (synthesisCard) synthesisCard.classList.remove('disabled');
                if (fullContextCard) fullContextCard.classList.remove('disabled');

                // 2. Enable sub-strategies slider and remove dimmed state if needed
                const subStrategiesSlider = container.querySelector('#dt-sub-strategies-slider') as HTMLInputElement;
                if (subStrategiesSlider) {
                    subStrategiesSlider.disabled = false;

                    // If it was set to 0, user can now adjust it
                    const currentValue = parseInt(subStrategiesSlider.value);
                    if (currentValue > 0) {
                        const subStrategiesSection = subStrategiesSlider.closest('.strategy-execution-section') as HTMLElement;
                        if (subStrategiesSection) {
                            subStrategiesSection.classList.remove('dimmed');
                            const disabledLabel = subStrategiesSection.querySelector('.disabled-label');
                            if (disabledLabel) {
                                disabledLabel.remove();
                            }
                        }
                    }
                }

                // 3. Disable and uncheck post quality filter
                const postQualityFilter = container.querySelector('#dt-post-quality-filter-toggle') as HTMLInputElement;
                const postQualityCard = container.querySelector('.post-quality-filter-card') as HTMLElement;
                if (postQualityFilter) {
                    postQualityFilter.checked = false;
                    postQualityFilter.disabled = true;
                    props.onPostQualityFilterToggle(false);
                }
                if (postQualityCard) {
                    postQualityCard.classList.add('disabled');
                }
            }
        });
    }

    // Provide all solutions
    const provideAllSolutionsToggle = container.querySelector('#dt-provide-all-solutions-toggle') as HTMLInputElement;
    if (provideAllSolutionsToggle) {
        provideAllSolutionsToggle.addEventListener('change', (e) => {
            const checked = (e.target as HTMLInputElement).checked;
            props.onProvideAllSolutionsToggle(checked);
        });
    }
}

import {
    getSelectedStrategiesCount,
    getSelectedSubStrategiesCount,
    getSelectedHypothesisCount,
    getSkipSubStrategies,
    getSelectedRedTeamAggressiveness,
    getPostQualityFilterEnabled,
    getRefinementEnabled,
    getDissectedObservationsEnabled,
    getIterativeCorrectionsEnabled,
    getProvideAllSolutionsToCorrectors,
    routingManager
} from '../Routing';

export function renderDeepthinkConfigPanelInContainer(pipelinesContentContainer: HTMLElement | null) {
    if (!pipelinesContentContainer) return;

    // Hide main header for edge-to-edge config panel
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;
    if (mainHeaderContent) {
        mainHeaderContent.style.display = 'none';
    }

    // Disable sidebar collapse button when config panel is shown
    const sidebarCollapseButton = document.getElementById('sidebar-collapse-button') as HTMLButtonElement;
    if (sidebarCollapseButton) {
        sidebarCollapseButton.disabled = true;
        sidebarCollapseButton.style.opacity = '0.3';
        sidebarCollapseButton.style.cursor = 'not-allowed';
        sidebarCollapseButton.title = 'Sidebar collapse disabled in config view';
    }

    // Get hypothesis enabled state from checkbox
    const hypothesisToggle = document.getElementById('hypothesis-toggle') as HTMLInputElement;
    const hypothesisEnabled = hypothesisToggle ? hypothesisToggle.checked : true;

    // Clear any existing listeners
    const existingPanel = pipelinesContentContainer.querySelector('.deepthink-config-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

    renderDeepthinkConfigPanel(pipelinesContentContainer, {
        strategiesCount: getSelectedStrategiesCount(),
        subStrategiesCount: getSelectedSubStrategiesCount(),
        hypothesisCount: getSelectedHypothesisCount(),
        skipSubStrategies: getSkipSubStrategies(),
        hypothesisEnabled: hypothesisEnabled,
        redTeamMode: getSelectedRedTeamAggressiveness(),
        postQualityFilterEnabled: getPostQualityFilterEnabled(),
        refinementEnabled: getRefinementEnabled(),
        dissectedObservationsEnabled: getDissectedObservationsEnabled(),
        iterativeCorrectionsEnabled: getIterativeCorrectionsEnabled(),
        provideAllSolutionsEnabled: getProvideAllSolutionsToCorrectors(),
        onStrategiesChange: (value) => {
            const slider = document.getElementById('strategies-slider') as HTMLInputElement;
            if (slider) {
                slider.value = value.toString();
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
        },
        onSubStrategiesChange: (value) => {
            const slider = document.getElementById('sub-strategies-slider') as HTMLInputElement;
            if (slider) {
                slider.value = value.toString();
                slider.dispatchEvent(new Event('input', { bubbles: true }));
            }
        },
        onHypothesisChange: (value) => {
            // Special handling for 0 (disabled state)
            if (value === 0) {
                // Directly update the model config parameter instead of the slider
                // since the slider has min="1" and can't be set to 0
                const modelConfig = routingManager.getModelConfigManager();
                if (modelConfig) {
                    modelConfig.updateParameter('hypothesisCount', 0);
                }
            } else {
                const slider = document.getElementById('hypothesis-slider') as HTMLInputElement;
                if (slider) {
                    slider.value = value.toString();
                    slider.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        },
        onSkipSubStrategiesToggle: (enabled) => {
            const toggle = document.getElementById('skip-sub-strategies-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = !enabled; // Inverted logic
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        },
        onHypothesisToggle: (enabled) => {
            const toggle = document.getElementById('hypothesis-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = enabled;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        },
        onRedTeamModeChange: (mode) => {
            const buttons = document.querySelectorAll('.red-team-button');
            buttons.forEach(btn => {
                btn.classList.remove('active');
                if ((btn as HTMLElement).dataset.value === mode) {
                    btn.classList.add('active');
                }
            });
            // Trigger the change through the original button click
            const targetButton = document.querySelector(`.red-team-button[data-value="${mode}"]`) as HTMLElement;
            if (targetButton) {
                targetButton.click();
            }
        },
        onPostQualityFilterToggle: (enabled) => {
            const toggle = document.getElementById('post-quality-filter-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = enabled;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        },
        onRefinementToggle: (enabled) => {
            const toggle = document.getElementById('refinement-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = enabled;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        },
        onDissectedObservationsToggle: (enabled) => {
            const toggle = document.getElementById('dissected-observations-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = enabled;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        },
        onIterativeCorrectionsToggle: (enabled) => {
            const toggle = document.getElementById('iterative-corrections-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = enabled;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        },
        onProvideAllSolutionsToggle: (enabled) => {
            const toggle = document.getElementById('provide-all-solutions-toggle') as HTMLInputElement;
            if (toggle) {
                toggle.checked = enabled;
                toggle.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
}
