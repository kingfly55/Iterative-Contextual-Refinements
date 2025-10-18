/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelConfigManager } from './ModelConfig';

export class ApiCallEstimator {
    private modelConfig: ModelConfigManager;
    private countElement: HTMLElement | null;
    private warningElement: HTMLElement | null;

    constructor(modelConfig: ModelConfigManager) {
        this.modelConfig = modelConfig;
        this.countElement = document.getElementById('api-call-count');
        this.warningElement = document.getElementById('api-call-warning');
    }

    /**
     * Calculate estimated API calls for Deepthink mode
     */
    public calculateDeepthinkApiCalls(): number {
        const params = this.modelConfig.getParameters();
        
        const strategiesCount = params.strategiesCount;
        const subStrategiesCount = params.subStrategiesCount;
        const hypothesisCount = params.hypothesisCount;
        const skipSubStrategies = params.skipSubStrategies;
        const refinementEnabled = params.refinementEnabled;
        const dissectedObservationsEnabled = params.dissectedObservationsEnabled;
        const iterativeCorrectionsEnabled = params.iterativeCorrectionsEnabled;
        const redTeamEnabled = params.redTeamAggressiveness !== 'off';

        let totalCalls = 0;

        // 1. Initial Strategy Generation (1 call)
        totalCalls += 1;

        // 2. Sub-Strategy Generation (N calls - one per strategy, if not skipped)
        if (!skipSubStrategies) {
            totalCalls += strategiesCount;
        }

        // 3. Solution Attempts
        const solutionCount = skipSubStrategies ? strategiesCount : (strategiesCount * subStrategiesCount);
        totalCalls += solutionCount;

        // 4-5. Hypothesis Track (only if hypothesis count > 0)
        if (hypothesisCount > 0) {
            // 4. Hypothesis Generation (1 call)
            totalCalls += 1;
            
            // 5. Hypothesis Testing (H calls - one per hypothesis)
            totalCalls += hypothesisCount;
            
            // Note: Knowledge Synthesis is done by system, not an API call
        }

        // 7-9. Refinement Track (only if refinement enabled)
        if (refinementEnabled) {
            if (iterativeCorrectionsEnabled) {
                // Iterative Corrections Mode:
                // For each solution: 3 iterations × (1 critique + 1 correction) = 6 calls per solution
                totalCalls += solutionCount * 6;
            } else {
                // Standard Refinement Mode:
                // 7. Solution Critique (N calls - one per main strategy)
                totalCalls += strategiesCount;
                
                // 8. Dissected Observations Synthesis (1 call if enabled)
                if (dissectedObservationsEnabled) {
                    totalCalls += 1;
                }
                
                // 9. Self-Improvement (M calls - one per solution)
                totalCalls += solutionCount;
            }
        }

        // 10. Red Team Evaluation (N calls - one per main strategy, if enabled)
        if (redTeamEnabled) {
            totalCalls += strategiesCount;
        }

        // 11. Final Judging (1 call to select best solution)
        totalCalls += 1;

        return totalCalls;
    }

    /**
     * Update the UI with the estimated API call count
     */
    public updateApiCallDisplay(): void {
        const estimatedCalls = this.calculateDeepthinkApiCalls();
        const redTeamEnabled = this.modelConfig.getParameters().redTeamAggressiveness !== 'off';

        // Update the count display
        if (this.countElement) {
            this.countElement.textContent = `~${estimatedCalls}`;
        }

        // Show/hide the red team warning icon
        if (this.warningElement) {
            if (redTeamEnabled) {
                this.warningElement.style.display = 'block';
            } else {
                this.warningElement.style.display = 'none';
            }
        }
    }

    /**
     * Attach event listeners to update on parameter changes
     */
    public attachListeners(): void {
        // Listen to all parameter changes
        const sliders = [
            'strategies-slider',
            'sub-strategies-slider',
            'hypothesis-slider'
        ];

        sliders.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.updateApiCallDisplay());
            }
        });

        // Listen to toggle changes
        const toggles = [
            'refinement-toggle',
            'skip-sub-strategies-toggle',
            'dissected-observations-toggle',
            'iterative-corrections-toggle',
            'hypothesis-toggle'
        ];

        toggles.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => this.updateApiCallDisplay());
            }
        });

        // Listen to red team button clicks - only update if on/off state changes
        const redTeamButtons = document.querySelectorAll('.red-team-button');
        let previousRedTeamEnabled = this.modelConfig.getParameters().redTeamAggressiveness !== 'off';
        
        redTeamButtons.forEach(button => {
            button.addEventListener('click', () => {
                setTimeout(() => {
                    const currentRedTeamEnabled = this.modelConfig.getParameters().redTeamAggressiveness !== 'off';
                    // Only update if the enabled state changed (off <-> on), not aggressiveness level
                    if (currentRedTeamEnabled !== previousRedTeamEnabled) {
                        previousRedTeamEnabled = currentRedTeamEnabled;
                        this.updateApiCallDisplay();
                    }
                }, 50);
            });
        });

        // Initial update
        this.updateApiCallDisplay();
    }
}
