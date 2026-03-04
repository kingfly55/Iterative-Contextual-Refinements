
import React, { useEffect, useState } from 'react';
import { WebsitePromptsManager } from './WebsitePromptsManager';
import { CustomizablePromptsWebsite } from './RefinePrompts';
import { PromptStylingEditor } from '../Styles/Components/PromptStyling';

export interface RefinePromptsContentProps {
    promptsManager: WebsitePromptsManager;
    availableModels?: string[];
}

/**
 * Refine/Website Mode Prompts Content
 * Fully React-controlled — subscribes to WebsitePromptsManager for state.
 */
export const RefinePromptsContent: React.FC<RefinePromptsContentProps> = ({
    promptsManager,
    availableModels = []
}) => {
    const [prompts, setPrompts] = useState<CustomizablePromptsWebsite>(promptsManager.getPrompts());

    useEffect(() => {
        const unsubscribe = promptsManager.subscribe((newPrompts) => {
            setPrompts(newPrompts);
        });
        return unsubscribe;
    }, [promptsManager]);

    const onPromptChange = (key: keyof CustomizablePromptsWebsite) => (text: string) => {
        promptsManager.updatePrompt(key, text);
    };

    const onModelChange = (key: keyof CustomizablePromptsWebsite) => (value: string) => {
        promptsManager.updateModel(key, value);
    };

    return (
        <div id="website-prompts-container" className="prompts-mode-container">
            {/* Initial Generation */}
            <div className="prompt-content-pane" data-prompt-key="initial-gen">
                <h4 className="prompt-pane-title">Initial Generation</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="initialGen"
                                value={(prompts.model_initialGen as string) || ''}
                                onChange={(e) => onModelChange('model_initialGen')(e.target.value)}
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
                            id="sys-initial-gen"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_initialGen}
                            onChange={onPromptChange('sys_initialGen')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-initial-gen"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_initialGen}
                            onChange={onPromptChange('user_initialGen')}
                        />
                    </div>
                </div>
            </div>

            {/* Initial Bug Fix & Polish */}
            <div className="prompt-content-pane" data-prompt-key="initial-bugfix">
                <h4 className="prompt-pane-title">Initial Bug Fix &amp; Polish</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="initialBugFix"
                                value={(prompts.model_initialBugFix as string) || ''}
                                onChange={(e) => onModelChange('model_initialBugFix')(e.target.value)}
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
                            id="sys-initial-bugfix"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_initialBugFix}
                            onChange={onPromptChange('sys_initialBugFix')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code>, <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-initial-bugfix"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_initialBugFix}
                            onChange={onPromptChange('user_initialBugFix')}
                        />
                    </div>
                </div>
            </div>

            {/* Initial Feature Suggestion */}
            <div className="prompt-content-pane" data-prompt-key="initial-features">
                <h4 className="prompt-pane-title">Initial Feature Suggestion</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="initialFeatureSuggest"
                                value={(prompts.model_initialFeatureSuggest as string) || ''}
                                onChange={(e) => onModelChange('model_initialFeatureSuggest')(e.target.value)}
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
                            id="sys-initial-features"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_initialFeatureSuggest}
                            onChange={onPromptChange('sys_initialFeatureSuggest')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code>, <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-initial-features"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_initialFeatureSuggest}
                            onChange={onPromptChange('user_initialFeatureSuggest')}
                        />
                    </div>
                </div>
            </div>

            {/* Refinement - Stabilize & Implement */}
            <div className="prompt-content-pane" data-prompt-key="refine-implement">
                <h4 className="prompt-pane-title">Refinement - Stabilize &amp; Implement</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="refineStabilizeImplement"
                                value={(prompts.model_refineStabilizeImplement as string) || ''}
                                onChange={(e) => onModelChange('model_refineStabilizeImplement')(e.target.value)}
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
                            id="sys-refine-implement"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_refineStabilizeImplement}
                            onChange={onPromptChange('sys_refineStabilizeImplement')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{currentContent}}`}</code>, <code>{`{{featuresToImplementStr}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-refine-implement"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_refineStabilizeImplement}
                            onChange={onPromptChange('user_refineStabilizeImplement')}
                        />
                    </div>
                </div>
            </div>

            {/* Refinement - Bug Fix & Completion */}
            <div className="prompt-content-pane" data-prompt-key="refine-bugfix">
                <h4 className="prompt-pane-title">Refinement - Bug Fix &amp; Completion</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="refineBugFix"
                                value={(prompts.model_refineBugFix as string) || ''}
                                onChange={(e) => onModelChange('model_refineBugFix')(e.target.value)}
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
                            id="sys-refine-bugfix"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_refineBugFix}
                            onChange={onPromptChange('sys_refineBugFix')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-refine-bugfix"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_refineBugFix}
                            onChange={onPromptChange('user_refineBugFix')}
                        />
                    </div>
                </div>
            </div>

            {/* Refinement - Feature Suggestion */}
            <div className="prompt-content-pane" data-prompt-key="refine-features">
                <h4 className="prompt-pane-title">Refinement - Feature Suggestion</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="refineFeatureSuggest"
                                value={(prompts.model_refineFeatureSuggest as string) || ''}
                                onChange={(e) => onModelChange('model_refineFeatureSuggest')(e.target.value)}
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
                            id="sys-refine-features"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_refineFeatureSuggest}
                            onChange={onPromptChange('sys_refineFeatureSuggest')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code>, <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-refine-features"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_refineFeatureSuggest}
                            onChange={onPromptChange('user_refineFeatureSuggest')}
                        />
                    </div>
                </div>
            </div>

            {/* Final Polish */}
            <div className="prompt-content-pane" data-prompt-key="final-polish">
                <h4 className="prompt-pane-title">Final Polish</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select
                                className="prompt-model-select"
                                data-agent="finalPolish"
                                value={(prompts.model_finalPolish as string) || ''}
                                onChange={(e) => onModelChange('model_finalPolish')(e.target.value)}
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
                            id="sys-final-polish"
                            className="prompt-textarea"
                            rows={8}
                            value={prompts.sys_finalPolish}
                            onChange={onPromptChange('sys_finalPolish')}
                        />
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <PromptStylingEditor
                            id="user-final-polish"
                            className="prompt-textarea"
                            rows={4}
                            value={prompts.user_finalPolish}
                            onChange={onPromptChange('user_finalPolish')}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RefinePromptsContent;
