import React from 'react';

/**
 * Contextual Mode Prompts Content
 * Prompts for Contextual/Iterative Corrections mode
 */
export const ContextualPromptsContent: React.FC = () => {
    return (
        <div id="contextual-prompts-container" className="prompts-mode-container">
            {/* Main Generation Agent */}
            <div className="prompt-content-pane" data-prompt-key="contextual-main-generator">
                <h4 className="prompt-pane-title">Main Generation Agent</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="contextual-main-generator">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-contextual-main-generator"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Main generation agent (self-corrector) system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Iterative Agent */}
            <div className="prompt-content-pane" data-prompt-key="contextual-iterative-agent">
                <h4 className="prompt-pane-title">Iterative Agent</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="contextual-iterative-agent">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-contextual-iterative-agent"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Iterative agent (solution critique) system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Solution Pool Agent */}
            <div className="prompt-content-pane" data-prompt-key="contextual-solution-pool">
                <h4 className="prompt-pane-title">Solution Pool Agent</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="contextual-solution-pool">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-contextual-solution-pool"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Solution pool / strategy pool agent system prompt..."
                        />
                    </div>
                </div>
            </div>

            {/* Memory Agent */}
            <div className="prompt-content-pane" data-prompt-key="contextual-memory">
                <h4 className="prompt-pane-title">Memory Agent</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="contextual-memory">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-contextual-memory"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Memory agent system prompt..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContextualPromptsContent;
