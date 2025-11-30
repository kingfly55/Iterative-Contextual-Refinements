import React from 'react';

/**
 * Model Parameters component
 * Contains model selection, sliders for temperature/top-p/refinement stages,
 * evolution convergence controls, and hidden Deepthink sync controls
 */
export const ModelParameters: React.FC = () => {
    return (
        <details className="sidebar-section" open>
            <summary className="sidebar-section-header">Model & Parameters</summary>
            <div className="sidebar-section-content">
                <div id="model-selection-container" className="input-group-tight">
                    <label htmlFor="model-select" className="input-label">Model:</label>
                    <select id="model-select" className="input-base" aria-label="Select AI Model">
                        {/* Options populated dynamically by routing system */}
                    </select>
                </div>

                <div id="model-parameters-container" className="input-group-tight">
                    <div className="input-group-tight">
                        <label htmlFor="temperature-slider" className="input-label">
                            Temperature: <span id="temperature-value">1.0</span>
                        </label>
                        <input
                            type="range"
                            id="temperature-slider"
                            className="slider"
                            min="0"
                            max="2"
                            step="0.1"
                            defaultValue="1.0"
                            aria-label="Temperature slider"
                        />
                    </div>
                    <div className="input-group-tight">
                        <label htmlFor="top-p-slider" className="input-label">
                            Top P: <span id="top-p-value">0.95</span>
                        </label>
                        <input
                            type="range"
                            id="top-p-slider"
                            className="slider"
                            min="0"
                            max="1"
                            step="0.05"
                            defaultValue="0.95"
                            aria-label="Top P slider"
                        />
                    </div>
                    <div className="input-group-tight">
                        <label htmlFor="refinement-stages-slider" className="input-label">
                            Refinement Stages: <span id="refinement-stages-value">3</span>
                        </label>
                        <input
                            type="range"
                            id="refinement-stages-slider"
                            className="slider"
                            min="1"
                            max="5"
                            step="1"
                            defaultValue="3"
                            aria-label="Number of refinement stages slider"
                        />
                    </div>

                    {/* Iterative Evolutions Convergence Container */}
                    <div className="evolution-convergence-container">
                        <div className="evolution-convergence-header">
                            <span className="material-symbols-outlined evolution-convergence-icon">manage_search</span>
                            <span className="evolution-convergence-title">Iterative Evolutions Convergence</span>
                        </div>
                        <div className="evolution-convergence-buttons-wrapper">
                            <div className="evolution-convergence-buttons">
                                <button type="button" className="evolution-convergence-button" data-value="off">Off</button>
                                <button type="button" className="evolution-convergence-button active" data-value="novelty">Novelty</button>
                                <button type="button" className="evolution-convergence-button" data-value="quality">Quality</button>
                            </div>
                            <div className="evolution-convergence-description" id="evolution-convergence-description">
                                <span className="evolution-mode-text">Default mode with all agents active for balanced innovation and quality.</span>
                            </div>
                        </div>
                    </div>

                    {/* Hidden Deepthink Controls (synced with right panel) */}
                    <div style={{ display: 'none' }}>
                        <span id="strategies-value">3</span>
                        <input type="range" id="strategies-slider" min="1" max="10" step="1" defaultValue="3" />
                        <span id="sub-strategies-value">3</span>
                        <input type="range" id="sub-strategies-slider" min="0" max="10" step="1" defaultValue="3" />
                        <input type="checkbox" id="skip-sub-strategies-toggle" />
                        <input type="checkbox" id="hypothesis-toggle" defaultChecked />
                        <span id="hypothesis-value">4</span>
                        <input type="range" id="hypothesis-slider" min="1" max="6" step="1" defaultValue="4" />
                        <button type="button" className="red-team-button" data-value="off"></button>
                        <button type="button" className="red-team-button active" data-value="balanced"></button>
                        <button type="button" className="red-team-button" data-value="very_aggressive"></button>
                        <input type="checkbox" id="post-quality-filter-toggle" />
                        <input type="checkbox" id="refinement-toggle" />
                        <input type="checkbox" id="dissected-observations-toggle" />
                        <input type="checkbox" id="iterative-corrections-toggle" />
                        <input type="checkbox" id="provide-all-solutions-toggle" />
                    </div>
                </div>
            </div>
        </details>
    );
};

export default ModelParameters;
