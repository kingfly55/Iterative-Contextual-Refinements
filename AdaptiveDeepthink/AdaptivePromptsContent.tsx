import React from 'react';

/**
 * Adaptive Deepthink Mode Prompts Content
 * Prompts for Adaptive Deepthink mode
 */
export const AdaptivePromptsContent: React.FC = () => {
    return (
        <div id="adaptiveDeepthink-prompts-container" className="prompts-mode-container">
            {/* Main Orchestrator */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-main">
                <h4 className="prompt-pane-title">Main Orchestrator</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-main">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-main"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Main Adaptive Deepthink orchestrator system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Strategy Generation */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-strategy-gen">
                <h4 className="prompt-pane-title">Strategy Generation</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-strategy-gen">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-strategy-gen"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Strategy generation agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Hypothesis Generation */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-hypothesis-gen">
                <h4 className="prompt-pane-title">Hypothesis Generation</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-hypothesis-gen">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-hypothesis-gen"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Hypothesis generation agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Hypothesis Testing */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-hypothesis-test">
                <h4 className="prompt-pane-title">Hypothesis Testing</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-hypothesis-test">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-hypothesis-test"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Hypothesis testing agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Execution Agent */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-execution">
                <h4 className="prompt-pane-title">Execution Agent</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-execution">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-execution"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Execution agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Solution Critique */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-critique">
                <h4 className="prompt-pane-title">Solution Critique</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-critique">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-critique"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Solution critique agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Corrector Agent */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-corrector">
                <h4 className="prompt-pane-title">Corrector Agent</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-corrector">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-corrector"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Corrector agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Final Judge */}
            <div className="prompt-content-pane" data-prompt-key="adaptive-judge">
                <h4 className="prompt-pane-title">Final Judge</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="adaptive-judge">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-adaptive-judge"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="Final judge agent system prompt..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdaptivePromptsContent;
