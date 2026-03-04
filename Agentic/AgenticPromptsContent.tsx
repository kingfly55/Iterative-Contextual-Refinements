import React, { useEffect, useState } from 'react';
import { AgenticPromptsManager, AgenticPrompts } from './AgenticPromptsManager';
import { PromptStylingEditor } from '../Styles/Components/PromptStyling';

export interface AgenticPromptsContentProps {
    promptsManager: AgenticPromptsManager;
    availableModels?: string[]; // E.g., dynamic model list from the application router config
}

/**
 * Agentic Mode Prompts Content
 * Rendered strictly through React using props and state.
 * Depends purely on the AgenticPromptsManager for its data.
 */
export const AgenticPromptsContent: React.FC<AgenticPromptsContentProps> = ({
    promptsManager,
    availableModels = [] // Provide empty default to prevent crashes if undefined
}) => {
    const [prompts, setPrompts] = useState<AgenticPrompts>(promptsManager.getAgenticPrompts());

    useEffect(() => {
        // Subscribe to changes from the manager (importing configs, resets, programmatic updates)
        const unsubscribe = promptsManager.subscribe((newPrompts) => {
            setPrompts(newPrompts);
        });
        return unsubscribe;
    }, [promptsManager]);

    return (
        <div id="agentic-prompts-container" className="prompts-mode-container">
            {/* Main Agent Configuration */}
            <div className="prompt-content-pane" data-prompt-key="agentic-system">
                <h4 className="prompt-pane-title">Main Agent Configuration</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Prompt</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="agentic"
                                value={prompts.model || ''}
                                onChange={(e) => promptsManager.updateModel(e.target.value)}
                            >
                                <option value="">Use Global Model</option>
                                {availableModels.map(model => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="sys-agentic"
                            className="prompt-textarea"
                            rows={12}
                            value={prompts.systemPrompt}
                            onChange={(text) => promptsManager.updateSystemPrompt(text)}
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
                            <select
                                className="prompt-model-select"
                                data-agent="agentic-verifier"
                                value={prompts.verifierModel || ''}
                                onChange={(e) => promptsManager.updateVerifierModel(e.target.value)}
                            >
                                <option value="">Use Global Model</option>
                                {availableModels.map(model => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="sys-agentic-verifier"
                            className="prompt-textarea"
                            rows={12}
                            value={prompts.verifierPrompt}
                            onChange={(text) => promptsManager.updateVerifierPrompt(text)}
                            placeholder="Enter the system prompt for the Verifier agent..."
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgenticPromptsContent;
