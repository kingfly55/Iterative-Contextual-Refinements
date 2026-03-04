import React, { useState, useEffect, useCallback } from 'react';
import { globalState } from '../../../Core/State';
import { EvolutionMode, ApplicationMode } from '../../../Core/Types';
import { EVOLUTION_OPTIONS, getEvolutionModeDescriptionText, handleEvolutionModeSelection } from './ModelParametersLogic';

export const ModelParameters: React.FC = () => {
    const [currentMode, setCurrentMode] = useState<ApplicationMode>(globalState.currentMode as ApplicationMode);

    useEffect(() => {
        const handleModeChange = () => {
            setCurrentMode(globalState.currentMode as ApplicationMode);
        };
        window.addEventListener('appModeChanged', handleModeChange);
        return () => window.removeEventListener('appModeChanged', handleModeChange);
    }, []);
    return (
        <details className="sidebar-section" open>
            <summary className="sidebar-section-header">Model & Parameters</summary>
            <div className="sidebar-section-content">
                <div id="model-selection-container" className="input-group-tight">
                    <select id="model-select" className="input-base" aria-label="Select AI Model">
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
                    <div className="input-group-tight" style={{ display: currentMode === 'website' ? '' : 'none' }}>
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

                    <div className="evolution-convergence-container" style={{ display: currentMode === 'website' ? '' : 'none' }}>
                        <div className="evolution-convergence-header">
                            <span className="material-symbols-outlined evolution-convergence-icon">manage_search</span>
                            <span className="evolution-convergence-title">Iterative Evolutions Convergence</span>
                        </div>
                        <EvolutionModeSelector />
                    </div>

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

                    <div id="contextual-mode-controls" style={{ display: currentMode === 'contextual' ? '' : 'none' }}>
                        <div className="code-execution-container">
                            <div className="code-execution-header">
                                <span className="material-symbols-outlined">code</span>
                                <span className="code-execution-title">Gemini Code Execution</span>
                            </div>
                            <div className="code-execution-toggle-row">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        id="gemini-code-execution-toggle"
                                        aria-label="Enable Gemini Code Execution"
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                                <span className="toggle-label">Enable Python Code Execution</span>
                            </div>
                            <div className="code-execution-description">
                                Allow agents to execute Python code for calculations, data analysis, and verification.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </details>
    );
};

export default ModelParameters;

const EvolutionModeSelector: React.FC = () => {
    const [mode, setMode] = useState<EvolutionMode>(globalState.currentEvolutionMode);

    const handleSelect = useCallback((selected: EvolutionMode) => {
        setMode(selected);
        handleEvolutionModeSelection(selected);
    }, []);

    return (
        <div className="evolution-convergence-buttons-wrapper">
            <div className="evolution-convergence-buttons">
                {EVOLUTION_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        type="button"
                        className={`evolution-convergence-button${mode === opt.value ? ' active' : ''}`}
                        data-value={opt.value}
                        onClick={() => handleSelect(opt.value)}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            <div className="evolution-convergence-description" id="evolution-mode-description">
                {getEvolutionModeDescriptionText(mode)}
            </div>
        </div>
    );
};

export function initializeEvolutionConvergenceButtons(): void {
}
