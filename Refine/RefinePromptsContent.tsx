import React from 'react';

/**
 * Refine/Website Mode Prompts Content
 * All prompts for the Refine mode including initial generation,
 * bug fixes, features, refinement stages, and final polish
 */
export const RefinePromptsContent: React.FC = () => {
    return (
        <div id="website-prompts-container" className="prompts-mode-container">
            {/* Initial Generation */}
            <div className="prompt-content-pane" data-prompt-key="initial-gen">
                <h4 className="prompt-pane-title">Initial Generation</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="initialGen">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-initial-gen" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-initial-gen" className="prompt-textarea" rows={4}></textarea>
                    </div>
                </div>
            </div>

            {/* Initial Bug Fix & Polish */}
            <div className="prompt-content-pane" data-prompt-key="initial-bugfix">
                <h4 className="prompt-pane-title">Initial Bug Fix & Polish</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="initialBugFix">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-initial-bugfix" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code>, <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-initial-bugfix" className="prompt-textarea" rows={4}></textarea>
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
                            <select className="prompt-model-select" data-agent="initialFeatureSuggest">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-initial-features" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code>, <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-initial-features" className="prompt-textarea" rows={4}></textarea>
                    </div>
                </div>
            </div>

            {/* Refinement - Stabilize & Implement */}
            <div className="prompt-content-pane" data-prompt-key="refine-implement">
                <h4 className="prompt-pane-title">Refinement - Stabilize & Implement</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="refineStabilizeImplement">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-refine-implement" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{currentContent}}`}</code>, <code>{`{{featuresToImplementStr}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-refine-implement" className="prompt-textarea" rows={4}></textarea>
                    </div>
                </div>
            </div>

            {/* Refinement - Bug Fix & Completion */}
            <div className="prompt-content-pane" data-prompt-key="refine-bugfix">
                <h4 className="prompt-pane-title">Refinement - Bug Fix & Completion</h4>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">System Instruction</span>
                        <div className="prompt-model-selector">
                            <select className="prompt-model-select" data-agent="refineBugFix">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-refine-bugfix" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-refine-bugfix" className="prompt-textarea" rows={4}></textarea>
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
                            <select className="prompt-model-select" data-agent="refineFeatureSuggest">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-refine-features" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{initialIdea}}`}</code>, <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-refine-features" className="prompt-textarea" rows={4}></textarea>
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
                            <select className="prompt-model-select" data-agent="finalPolish">
                                <option value="">Use Global Model</option>
                            </select>
                        </div>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="sys-final-polish" className="prompt-textarea" rows={8}></textarea>
                    </div>
                </div>
                <div className="prompt-card">
                    <div className="prompt-card-header">
                        <span className="prompt-card-title">User Prompt Template</span>
                        <span className="prompt-placeholders">Variables: <code>{`{{currentContent}}`}</code></span>
                    </div>
                    <div className="prompt-card-body">
                        <textarea id="user-final-polish" className="prompt-textarea" rows={4}></textarea>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RefinePromptsContent;
