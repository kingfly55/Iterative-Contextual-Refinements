import React from 'react';
import { PromptCard, PromptPane } from '../Components/PromptCard';

/**
 * Deepthink Mode Prompts Content
 * All prompts for Deepthink mode including strategies, hypotheses, red team, etc.
 */
export const DeepthinkPromptsContent: React.FC = () => {
    return (
        <div id="deepthink-prompts-container" className="prompts-mode-container">
            {/* Initial Strategy Generation */}
            <PromptPane promptKey="deepthink-initial-strategy" title="Initial Strategy Generation">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-initial-strategy" agentName="initialStrategy" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-initial-strategy"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>'
                />
            </PromptPane>

            {/* Sub-Strategy Generation */}
            <PromptPane promptKey="deepthink-sub-strategy" title="Sub-Strategy Generation">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-sub-strategy" agentName="subStrategy" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-sub-strategy"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentMainStrategy}}</code>, <code>{{otherMainStrategiesStr}}</code>'
                />
            </PromptPane>

            {/* Solution Attempt */}
            <PromptPane promptKey="deepthink-solution-attempt" title="Solution Attempt">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-solution-attempt" agentName="solutionAttempt" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-solution-attempt"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentSubStrategy}}</code>, <code>{{knowledgePacket}}</code>'
                />
            </PromptPane>

            {/* Solution Critique */}
            <PromptPane promptKey="deepthink-solution-critique" title="Solution Critique">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-solution-critique" agentName="solutionCritique" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-solution-critique"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentMainStrategy}}</code>, <code>{{allSubStrategiesAndSolutions}}</code>'
                />
            </PromptPane>

            {/* Dissected Observations Synthesis */}
            <PromptPane promptKey="deepthink-dissected-synthesis" title="Dissected Observations Synthesis">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-dissected-synthesis" agentName="dissectedSynthesis" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-dissected-synthesis"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{knowledgePacket}}</code>, <code>{{dissectedObservations}}</code>'
                />
            </PromptPane>

            {/* Self-Improvement */}
            <PromptPane promptKey="deepthink-self-improvement" title="Self-Improvement">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-self-improvement" agentName="selfImprovement" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-self-improvement"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{currentSubStrategy}}</code>, <code>{{solutionAttempt}}</code>, <code>{{knowledgePacket}}</code>'
                />
            </PromptPane>

            {/* Hypothesis Generation */}
            <PromptPane promptKey="deepthink-hypothesis-generation" title="Hypothesis Generation">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-hypothesis-generation" agentName="hypothesisGeneration" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-hypothesis-generation"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>'
                />
            </PromptPane>

            {/* Hypothesis Testing */}
            <PromptPane promptKey="deepthink-hypothesis-tester" title="Hypothesis Testing">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-hypothesis-tester" agentName="hypothesisTester" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-hypothesis-tester"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{hypothesisText}}</code>'
                />
            </PromptPane>

            {/* Red Team Evaluation */}
            <PromptPane promptKey="deepthink-red-team" title="Red Team Evaluation">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-red-team" agentName="redTeam" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-red-team"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{assignedStrategy}}</code>, <code>{{subStrategies}}</code>'
                />
            </PromptPane>

            {/* Post Quality Filter */}
            <PromptPane promptKey="deepthink-post-quality-filter" title="Post Quality Filter">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-post-quality-filter" agentName="postQualityFilter" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-post-quality-filter"
                    rows={4}
                    placeholders='Variables: <code>{{originalProblemText}}</code>, <code>{{strategiesWithExecutionsAndCritiques}}</code>'
                />
            </PromptPane>

            {/* Judge (Intra-Strategy) */}
            <PromptPane promptKey="deepthink-judge" title="Judge (Intra-Strategy)">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-judge" agentName="judge" />
            </PromptPane>

            {/* Final Judge (Cross-Strategy) */}
            <PromptPane promptKey="deepthink-final-judge" title="Final Judge (Cross-Strategy)">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-final-judge" agentName="finalJudge" />
            </PromptPane>

            {/* Structured Solution Pool Agent */}
            <PromptPane promptKey="deepthink-structured-solution-pool" title="Structured Solution Pool Agent">
                <PromptCard title="System Instruction" textareaId="sys-deepthink-structured-solution-pool" agentName="structuredSolutionPool" />
                <PromptCard
                    title="User Prompt Template"
                    textareaId="user-deepthink-structured-solution-pool"
                    rows={4}
                    placeholders='Variables: <code>{{currentPool}}</code>, <code>{{newCritique}}</code>'
                />
            </PromptPane>
        </div>
    );
};

export default DeepthinkPromptsContent;
