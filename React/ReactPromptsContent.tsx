import React from 'react';
import { PromptCard, PromptPane } from '../Components/PromptCard';

/**
 * React Mode Prompts Content
 * Prompts for React mode including orchestrator and embedded agentic
 */
export const ReactPromptsContent: React.FC = () => {
    return (
        <div id="react-prompts-container" className="prompts-mode-container">
            {/* Orchestrator Agent Config */}
            <PromptPane promptKey="react-orchestrator" title="React: Orchestrator Agent Config">
                <PromptCard
                    title="System Instruction (for Orchestrator)"
                    textareaId="sys-react-orchestrator"
                    rows={10}
                    agentName="orchestrator"
                />
                <PromptCard
                    title="User Prompt Template (for Orchestrator)"
                    textareaId="user-react-orchestrator"
                    rows={4}
                />
            </PromptPane>

            {/* React Embedded Agentic Prompts */}
            <PromptPane promptKey="react-agentic-embedded" title="React: Embedded Agentic Refinement">
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">Agentic System Prompt (Embedded)</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="agentic-embedded">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-react-agentic-embedded"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="System prompt used by Agentic refinement inside React mode"
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">Verifier System Prompt (Embedded)</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="agentic-verifier-embedded">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea
                            id="sys-react-agentic-verifier-embedded"
                            className="prompt-textarea"
                            rows={10}
                            placeholder="System prompt for the embedded Verifier agent"
                        />
                    </div>
                </div>
            </PromptPane>
        </div>
    );
};

export default ReactPromptsContent;
