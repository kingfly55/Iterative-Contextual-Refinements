import React from 'react';

/**
 * Agentic Mode Prompts Content
 * Prompts for Agentic mode including main agent and verifier
 */
export const AgenticPromptsContent: React.FC = () => {
    return (
        <div id="agentic-prompts-container" className="prompts-mode-container">
            {/* Main Agent Configuration */}
            <div className="prompt-content-pane" data-prompt-key="agentic-system">
                <h4 className="prompt-pane-title">Main Agent Configuration</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Prompt</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="agentic">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-agentic"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Enter the system prompt for Agentic mode..."
                        />
                    </div>
                </div>
            </div>

            {/* Verifier Agent Configuration */}
            <div className="prompt-content-pane" data-prompt-key="agentic-verifier">
                <h4 className="prompt-pane-title">Verifier Agent Configuration</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">Verifier System Prompt</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="agentic-verifier">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-agentic-verifier"
                            className="prompt-textarea"
                            rows={12}
                            placeholder="Enter the system prompt for the Verifier agent..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgenticPromptsContent;
