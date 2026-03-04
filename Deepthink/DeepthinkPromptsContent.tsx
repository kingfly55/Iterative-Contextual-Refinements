import React, { useEffect, useState } from 'react';
import { DeepthinkPromptsManager } from './DeepthinkPromptsManager';
import { CustomizablePromptsDeepthink } from './DeepthinkPrompts';
import { PromptCard, PromptPane } from '../Styles/Components/PromptCard';

export interface DeepthinkPromptsContentProps {
    promptsManager: DeepthinkPromptsManager;
    availableModels?: string[];
}

/**
 * Deepthink Mode Prompts Content
 * Fully React-controlled — subscribes to DeepthinkPromptsManager for state.
 */
export const DeepthinkPromptsContent: React.FC<DeepthinkPromptsContentProps> = ({
    promptsManager,
    availableModels = []
}) => {
    const [prompts, setPrompts] = useState<CustomizablePromptsDeepthink>(promptsManager.getPrompts());

    useEffect(() => {
        const unsubscribe = promptsManager.subscribe((newPrompts) => {
            setPrompts(newPrompts);
        });
        return unsubscribe;
    }, [promptsManager]);

    const onPromptChange = (key: keyof CustomizablePromptsDeepthink) => (text: string) => {
        promptsManager.updatePrompt(key, text);
    };

    const onModelChange = (key: keyof CustomizablePromptsDeepthink) => (value: string) => {
        promptsManager.updateModel(key, value);
    };

    return (
        <div id="deepthink-prompts-container" className="prompts-mode-container">
            {/* Initial Strategy Generation */}
            <PromptPane promptKey="deepthink-initial-strategy" title="Initial Strategy Generation">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-initial-strategy"
                    agentName="initialStrategy"
                    value={prompts.sys_deepthink_initialStrategy}
                    onChange={onPromptChange('sys_deepthink_initialStrategy')}
                    modelValue={(prompts.model_initialStrategy as string) || ''}
                    onModelChange={onModelChange('model_initialStrategy')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-initial-strategy"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>'
                    value={prompts.user_deepthink_initialStrategy}
                    onChange={onPromptChange('user_deepthink_initialStrategy')}
                />
            </PromptPane>

            {/* Sub-Strategy Generation */}
            <PromptPane promptKey="deepthink-sub-strategy" title="Sub-Strategy Generation">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-sub-strategy"
                    agentName="subStrategy"
                    value={prompts.sys_deepthink_subStrategy}
                    onChange={onPromptChange('sys_deepthink_subStrategy')}
                    modelValue={(prompts.model_subStrategy as string) || ''}
                    onModelChange={onModelChange('model_subStrategy')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-sub-strategy"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentMainStrategy}}</code>, <code>{{otherMainStrategiesStr}}</code>'
                    value={prompts.user_deepthink_subStrategy}
                    onChange={onPromptChange('user_deepthink_subStrategy')}
                />
            </PromptPane>

            {/* Solution Attempt */}
            <PromptPane promptKey="deepthink-solution-attempt" title="Solution Attempt">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-solution-attempt"
                    agentName="solutionAttempt"
                    value={prompts.sys_deepthink_solutionAttempt}
                    onChange={onPromptChange('sys_deepthink_solutionAttempt')}
                    modelValue={(prompts.model_solutionAttempt as string) || ''}
                    onModelChange={onModelChange('model_solutionAttempt')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-solution-attempt"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentSubStrategy}}</code>, <code>{{knowledgePacket}}</code>'
                    value={prompts.user_deepthink_solutionAttempt}
                    onChange={onPromptChange('user_deepthink_solutionAttempt')}
                />
            </PromptPane>

            {/* Solution Critique */}
            <PromptPane promptKey="deepthink-solution-critique" title="Solution Critique">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-solution-critique"
                    agentName="solutionCritique"
                    value={prompts.sys_deepthink_solutionCritique}
                    onChange={onPromptChange('sys_deepthink_solutionCritique')}
                    modelValue={(prompts.model_solutionCritique as string) || ''}
                    onModelChange={onModelChange('model_solutionCritique')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-solution-critique"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentMainStrategy}}</code>, <code>{{allSubStrategiesAndSolutions}}</code>'
                    value={prompts.user_deepthink_solutionCritique}
                    onChange={onPromptChange('user_deepthink_solutionCritique')}
                />
            </PromptPane>

            {/* Dissected Observations Synthesis */}
            <PromptPane promptKey="deepthink-dissected-synthesis" title="Dissected Observations Synthesis">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-dissected-synthesis"
                    agentName="dissectedSynthesis"
                    value={prompts.sys_deepthink_dissectedSynthesis}
                    onChange={onPromptChange('sys_deepthink_dissectedSynthesis')}
                    modelValue={(prompts.model_dissectedSynthesis as string) || ''}
                    onModelChange={onModelChange('model_dissectedSynthesis')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-dissected-synthesis"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{knowledgePacket}}</code>, <code>{{dissectedObservations}}</code>'
                    value={prompts.user_deepthink_dissectedSynthesis}
                    onChange={onPromptChange('user_deepthink_dissectedSynthesis')}
                />
            </PromptPane>

            {/* Self-Improvement */}
            <PromptPane promptKey="deepthink-self-improvement" title="Self-Improvement">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-self-improvement"
                    agentName="selfImprovement"
                    value={prompts.sys_deepthink_selfImprovement}
                    onChange={onPromptChange('sys_deepthink_selfImprovement')}
                    modelValue={(prompts.model_selfImprovement as string) || ''}
                    onModelChange={onModelChange('model_selfImprovement')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-self-improvement"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentSubStrategy}}</code>, <code>{{solutionAttempt}}</code>, <code>{{knowledgePacket}}</code>'
                    value={prompts.user_deepthink_selfImprovement}
                    onChange={onPromptChange('user_deepthink_selfImprovement')}
                />
            </PromptPane>

            {/* Hypothesis Generation */}
            <PromptPane promptKey="deepthink-hypothesis-generation" title="Hypothesis Generation">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-hypothesis-generation"
                    agentName="hypothesisGeneration"
                    value={prompts.sys_deepthink_hypothesisGeneration}
                    onChange={onPromptChange('sys_deepthink_hypothesisGeneration')}
                    modelValue={(prompts.model_hypothesisGeneration as string) || ''}
                    onModelChange={onModelChange('model_hypothesisGeneration')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-hypothesis-generation"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>'
                    value={prompts.user_deepthink_hypothesisGeneration}
                    onChange={onPromptChange('user_deepthink_hypothesisGeneration')}
                />
            </PromptPane>

            {/* Hypothesis Testing */}
            <PromptPane promptKey="deepthink-hypothesis-tester" title="Hypothesis Testing">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-hypothesis-tester"
                    agentName="hypothesisTester"
                    value={prompts.sys_deepthink_hypothesisTester}
                    onChange={onPromptChange('sys_deepthink_hypothesisTester')}
                    modelValue={(prompts.model_hypothesisTester as string) || ''}
                    onModelChange={onModelChange('model_hypothesisTester')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-hypothesis-tester"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{hypothesisText}}</code>'
                    value={prompts.user_deepthink_hypothesisTester}
                    onChange={onPromptChange('user_deepthink_hypothesisTester')}
                />
            </PromptPane>

            {/* Red Team Evaluation */}
            <PromptPane promptKey="deepthink-red-team" title="Red Team Evaluation">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-red-team"
                    agentName="redTeam"
                    value={prompts.sys_deepthink_redTeam}
                    onChange={onPromptChange('sys_deepthink_redTeam')}
                    modelValue={(prompts.model_redTeam as string) || ''}
                    onModelChange={onModelChange('model_redTeam')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-red-team"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{assignedStrategy}}</code>, <code>{{subStrategies}}</code>'
                    value={prompts.user_deepthink_redTeam}
                    onChange={onPromptChange('user_deepthink_redTeam')}
                />
            </PromptPane>

            {/* Post Quality Filter */}
            <PromptPane promptKey="deepthink-post-quality-filter" title="Post Quality Filter">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-post-quality-filter"
                    agentName="postQualityFilter"
                    value={prompts.sys_deepthink_postQualityFilter}
                    onChange={onPromptChange('sys_deepthink_postQualityFilter')}
                    modelValue={(prompts.model_postQualityFilter as string) || ''}
                    onModelChange={onModelChange('model_postQualityFilter')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-post-quality-filter"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{strategiesWithExecutionsAndCritiques}}</code>'
                    value={prompts.user_deepthink_postQualityFilter}
                    onChange={onPromptChange('user_deepthink_postQualityFilter')}
                />
            </PromptPane>

            {/* Judge (Intra-Strategy) */}
            <PromptPane promptKey="deepthink-judge" title="Judge (Intra-Strategy)">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-judge"
                    agentName="judge"
                    value={prompts.sys_deepthink_finalJudge}
                    onChange={onPromptChange('sys_deepthink_finalJudge')}
                />
            </PromptPane>

            {/* Final Judge (Cross-Strategy) */}
            <PromptPane promptKey="deepthink-final-judge" title="Final Judge (Cross-Strategy)">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-final-judge"
                    agentName="finalJudge"
                    value={prompts.sys_deepthink_finalJudge}
                    onChange={onPromptChange('sys_deepthink_finalJudge')}
                    modelValue={(prompts.model_finalJudge as string) || ''}
                    onModelChange={onModelChange('model_finalJudge')}
                    availableModels={availableModels}
                />
            </PromptPane>

            {/* Structured Solution Pool Agent */}
            <PromptPane promptKey="deepthink-structured-solution-pool" title="Structured Solution Pool Agent">
                <PromptCard
                    title="System Instruction"
                    textareaId="sys-deepthink-structured-solution-pool"
                    agentName="structuredSolutionPool"
                    value={prompts.sys_deepthink_structuredSolutionPool}
                    onChange={onPromptChange('sys_deepthink_structuredSolutionPool')}
                    modelValue={(prompts.model_structuredSolutionPool as string) || ''}
                    onModelChange={onModelChange('model_structuredSolutionPool')}
                    availableModels={availableModels}
                />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-structured-solution-pool"
                    rows={4}
                    placeholders='Variables: <code>{{currentPool}}</code>, <code>{{newCritique}}</code>'
                    value={prompts.user_deepthink_structuredSolutionPool}
                    onChange={onPromptChange('user_deepthink_structuredSolutionPool')}
                />
            </PromptPane>
        </div>
    );
};

export default DeepthinkPromptsContent;
