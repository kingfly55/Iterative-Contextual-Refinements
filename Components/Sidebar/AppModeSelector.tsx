import React from 'react';

/**
 * App Mode Selector component
 * Radio group for selecting application mode (Deepthink, Refine, Agentic, etc.)
 */
export const AppModeSelector: React.FC = () => {
    return (
        <div className="input-group">
            <div id="app-mode-selector" className="radio-group-modern" role="radiogroup" aria-label="Select Application Mode">
                {/* Deepthink Section */}
                <div className="app-mode-section-label">Deepthink</div>
                <div className="radio-group-full-width-row">
                    <label className="radio-label-modern radio-label-half-width">
                        <input type="radio" name="app-mode" value="deepthink" defaultChecked />
                        <span>Deepthink</span>
                    </label>
                    <label className="radio-label-modern radio-label-half-width">
                        <input type="radio" name="app-mode" value="adaptive-deepthink" />
                        <span>Adaptive Deepthink</span>
                    </label>
                </div>

                {/* Iterative Refinements Section */}
                <div className="app-mode-section-label">Iterative Refinements</div>
                <div className="radio-group-full-width-row">
                    <label className="radio-label-modern radio-label-half-width">
                        <input type="radio" name="app-mode" value="website" />
                        <span>Refine</span>
                    </label>
                    <label className="radio-label-modern radio-label-half-width">
                        <input type="radio" name="app-mode" value="agentic" />
                        <span>Agentic Refinements</span>
                    </label>
                </div>
                <div className="radio-group-full-width-row">
                    <label className="radio-label-modern radio-label-full-width">
                        <input type="radio" name="app-mode" value="contextual" />
                        <span>Iterative Corrections (Solution Pool + Memory)</span>
                    </label>
                </div>

                {/* Experimental Section */}
                <div className="app-mode-section-label">Experimental (Not Recommended)</div>
                <div className="radio-group-full-width-row">
                    <label className="radio-label-modern radio-label-half-width">
                        <input type="radio" name="app-mode" value="react" />
                        <span>React</span>
                    </label>
                    <label className="radio-label-modern radio-label-half-width">
                        <input type="radio" name="app-mode" value="generativeui" />
                        <span>Generative UI</span>
                    </label>
                </div>
            </div>
        </div>
    );
};

export default AppModeSelector;
