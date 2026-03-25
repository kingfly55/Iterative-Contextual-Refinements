import { globalState } from '../Core/State';
import { PipelineStopRequestedError } from '../Core/Types';
import { updatePipelineStatusUI, notifyIterationUpdated } from './WebsiteUI';
import { getSelectedRefinementStages, getSelectedTopP, getSelectedModel, getSelectedTemperature, getAPIRequestController } from '../Routing';
import { QUALITY_MODE_SYSTEM_PROMPT } from './RefinePrompts';

function renderPrompt(template: string, data: Record<string, string>): string {
    let rendered = template;
    for (const key in data) {
        rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), data[key] || '');
    }
    return rendered;
}

const MAX_RETRIES = 3;

export async function runPipeline(pipelineId: number, initialRequest: string) {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.isStopRequested = false;
    updatePipelineStatusUI(pipelineId, 'running');

    let currentContent = '';
    let currentSuggestions = '';

    const numMainRefinementLoops = globalState.currentMode === 'website' ? getSelectedRefinementStages() : 0;
    const totalPipelineSteps = globalState.currentMode === 'website' ? 1 + numMainRefinementLoops + 1 : 0;

    for (let i = 0; i < totalPipelineSteps; i++) {
        const iteration = pipeline.iterations[i];

        if (pipeline.isStopRequested) {
            iteration.status = 'cancelled';
            iteration.error = 'Process execution was stopped by the user.';
            notifyIterationUpdated(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                pipeline.iterations[j].status = 'cancelled';
                pipeline.iterations[j].error = 'Process execution was stopped by user.';
                notifyIterationUpdated(pipelineId, j);
            }
            updatePipelineStatusUI(pipelineId, 'stopped');
            return;
        }

        iteration.requestPromptContent_InitialGenerate = undefined;
        iteration.requestPromptContent_FeatureImplement = undefined;
        iteration.requestPromptContent_BugFix = undefined;
        iteration.requestPromptFeatures_Suggest = undefined;
        iteration.contentBeforeBugFix = undefined;
        iteration.error = undefined;

        try {
            const getAgentModel = (agentKey: string): string | undefined => {
                if (globalState.currentMode === 'website') {
                    const modelField = `model_${agentKey}` as keyof typeof globalState.customPromptsWebsiteState;
                    return globalState.customPromptsWebsiteState[modelField] as string | undefined;
                } else if (globalState.currentMode === 'deepthink') {
                    const modelField = `model_${agentKey}` as keyof typeof globalState.customPromptsDeepthinkState;
                    return globalState.customPromptsDeepthinkState[modelField] as string | undefined;
                }
                return undefined;
            };

            const makeApiCall = async (
                userPrompt: string,
                systemInstruction: string,
                isJson: boolean,
                stepDesc: string,
                agentKey?: string
            ): Promise<string> => {
                if (!pipeline) throw new Error('Pipeline context lost');
                if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDesc}`);

                const customModel = agentKey ? getAgentModel(agentKey) : undefined;
                const modelToUse: string = customModel ?? pipeline.modelName;
                if (!modelToUse) {
                    throw new Error(`No model specified for ${stepDesc}. Please select a model for this agent or set a global model.`);
                }

                iteration.retryAttempt = 0;
                iteration.status = 'processing';
                notifyIterationUpdated(pipelineId, i);

                const controller = getAPIRequestController();
                const apiResponse = await controller.request({
                    promptOrParts: userPrompt,
                    temperature: pipeline.temperature,
                    model: modelToUse,
                    systemInstruction,
                    isJsonOutput: isJson,
                    topP: getSelectedTopP(),
                    maxRetries: MAX_RETRIES,
                    label: stepDesc,
                });

                iteration.status = 'processing';
                notifyIterationUpdated(pipelineId, i);
                return apiResponse.text || '';
            };

            if (globalState.currentMode === 'website') {
                const placeholderContent = '<!-- No content provided by previous step. Please generate foundational structure based on the original idea. -->';

                if (i === 0) {
                    const userPromptInitialGen = renderPrompt(globalState.customPromptsWebsiteState.user_initialGen, {
                        initialIdea: initialRequest,
                        currentContent,
                    });
                    iteration.requestPromptContent_InitialGenerate = userPromptInitialGen;

                    const initialGenResponse = await makeApiCall(userPromptInitialGen, globalState.customPromptsWebsiteState.sys_initialGen, false, 'Initial HTML Generation', 'initialGen');
                    currentContent = initialGenResponse;
                    iteration.contentBeforeBugFix = currentContent;

                    let bugFixSystemPrompt = globalState.customPromptsWebsiteState.sys_initialBugFix;
                    if (globalState.currentEvolutionMode === 'quality') {
                        bugFixSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${bugFixSystemPrompt}`;
                    }

                    const userPromptInitialBugFix = renderPrompt(globalState.customPromptsWebsiteState.user_initialBugFix, {
                        initialIdea: initialRequest,
                        currentContent: currentContent || placeholderContent,
                    });
                    iteration.requestPromptContent_BugFix = userPromptInitialBugFix;
                    currentContent = await makeApiCall(userPromptInitialBugFix, bugFixSystemPrompt, false, 'Initial Bug Fix & Polish - Full Content', 'initialBugFix');
                    iteration.generatedContent = currentContent;

                    if (globalState.currentEvolutionMode !== 'off') {
                        let featureSuggestSystemPrompt = globalState.customPromptsWebsiteState.sys_initialFeatureSuggest;
                        if (globalState.currentEvolutionMode === 'quality') {
                            featureSuggestSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${featureSuggestSystemPrompt}`;
                        }

                        const userPromptInitialFeatures = renderPrompt(globalState.customPromptsWebsiteState.user_initialFeatureSuggest, {
                            initialIdea: initialRequest,
                            currentContent: currentContent || placeholderContent,
                        });
                        iteration.requestPromptFeatures_Suggest = userPromptInitialFeatures;

                        const featuresModel = getAgentModel('initialFeatures') || pipeline.modelName;
                        if (!featuresModel) {
                            throw new Error('No model specified for initial feature suggestions. Please select a model for this agent or set a global model.');
                        }
                        const featuresResponse = await getAPIRequestController().request({
                            promptOrParts: userPromptInitialFeatures,
                            temperature: pipeline.temperature,
                            model: featuresModel,
                            systemInstruction: featureSuggestSystemPrompt,
                            topP: getSelectedTopP(),
                            label: 'Initial feature suggestions',
                        });
                        iteration.suggestedFeaturesContent = featuresResponse.text || '';
                        currentSuggestions = iteration.suggestedFeaturesContent;
                    } else {
                        iteration.suggestedFeaturesContent = '';
                        currentSuggestions = '';
                    }
                } else if (i <= numMainRefinementLoops) {
                    if (globalState.currentEvolutionMode !== 'off') {
                        let refineImplementSystemPrompt = globalState.customPromptsWebsiteState.sys_refineStabilizeImplement;
                        if (globalState.currentEvolutionMode === 'quality') {
                            refineImplementSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineImplementSystemPrompt}`;
                        }

                        const userPromptRefineImplement = renderPrompt(globalState.customPromptsWebsiteState.user_refineStabilizeImplement, {
                            currentContent: currentContent || placeholderContent,
                            featuresToImplementStr: currentSuggestions,
                        });
                        iteration.requestPromptContent_FeatureImplement = userPromptRefineImplement;
                        currentContent = await makeApiCall(userPromptRefineImplement, refineImplementSystemPrompt, false, `Stabilization & Feature Impl (Iter ${i}) - Full Content`, 'refineStabilizeImplement');
                        iteration.contentBeforeBugFix = currentContent;
                    } else {
                        iteration.requestPromptContent_FeatureImplement = 'Skipped (Evolution Mode: Off)';
                    }

                    let refineBugFixSystemPrompt = globalState.customPromptsWebsiteState.sys_refineBugFix;
                    if (globalState.currentEvolutionMode === 'quality') {
                        refineBugFixSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineBugFixSystemPrompt}`;
                    }

                    const userPromptRefineBugFix = renderPrompt(globalState.customPromptsWebsiteState.user_refineBugFix, {
                        initialIdea: initialRequest,
                        currentContent: currentContent || placeholderContent,
                    });
                    iteration.requestPromptContent_BugFix = userPromptRefineBugFix;
                    currentContent = await makeApiCall(userPromptRefineBugFix, refineBugFixSystemPrompt, false, `Bug Fix & Completion (Iter ${i}) - Full Content`, 'refineBugFix');
                    iteration.generatedContent = currentContent;

                    if (globalState.currentEvolutionMode !== 'off') {
                        let refineFeatureSuggestSystemPrompt = globalState.customPromptsWebsiteState.sys_refineFeatureSuggest;
                        if (globalState.currentEvolutionMode === 'quality') {
                            refineFeatureSuggestSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineFeatureSuggestSystemPrompt}`;
                        }

                        const userPromptRefineFeatures = renderPrompt(globalState.customPromptsWebsiteState.user_refineFeatureSuggest, {
                            initialIdea: initialRequest,
                            currentContent: currentContent || placeholderContent,
                        });
                        iteration.requestPromptFeatures_Suggest = userPromptRefineFeatures;

                        const refineFeatureModel = getAgentModel('refineFeatures') || pipeline.modelName;
                        if (!refineFeatureModel) {
                            throw new Error('No model specified for refine feature suggestions. Please select a model for this agent or set a global model.');
                        }
                        const featuresResponse = await getAPIRequestController().request({
                            promptOrParts: userPromptRefineFeatures,
                            temperature: pipeline.temperature,
                            model: refineFeatureModel,
                            systemInstruction: refineFeatureSuggestSystemPrompt,
                            topP: getSelectedTopP(),
                            label: 'Refine feature suggestions',
                        });
                        iteration.suggestedFeaturesContent = featuresResponse.text || '';
                        currentSuggestions = iteration.suggestedFeaturesContent;
                    } else {
                        iteration.suggestedFeaturesContent = '';
                        currentSuggestions = '';
                    }
                } else {
                    let finalPolishSystemPrompt = globalState.customPromptsWebsiteState.sys_finalPolish;
                    if (globalState.currentEvolutionMode === 'quality') {
                        finalPolishSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${finalPolishSystemPrompt}`;
                    }

                    const userPromptFinalPolish = renderPrompt(globalState.customPromptsWebsiteState.user_finalPolish, {
                        initialIdea: initialRequest,
                        currentContent: currentContent || placeholderContent,
                    });
                    iteration.requestPromptContent_BugFix = userPromptFinalPolish;
                    currentContent = await makeApiCall(userPromptFinalPolish, finalPolishSystemPrompt, false, 'Final Polish - Full Content', 'finalPolish');
                    iteration.generatedContent = currentContent;
                    iteration.suggestedFeaturesContent = '';
                }
            }

            iteration.status = iteration.error ? 'error' : 'completed';
        } catch (error: any) {
            if (error instanceof PipelineStopRequestedError) {
                iteration.status = 'cancelled';
                iteration.error = 'Process execution was stopped by the user.';
                updatePipelineStatusUI(pipelineId, 'stopped');
            } else {
                if (!iteration.error) iteration.error = error.message || 'An unknown operational error occurred.';
                iteration.status = 'error';
                updatePipelineStatusUI(pipelineId, 'failed');
            }
            notifyIterationUpdated(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                if (pipeline.iterations[j].status !== 'cancelled') {
                    pipeline.iterations[j].status = 'cancelled';
                    pipeline.iterations[j].error = (error instanceof PipelineStopRequestedError)
                        ? 'Process stopped by user.'
                        : 'Halted due to prior error.';
                    notifyIterationUpdated(pipelineId, j);
                }
            }
            return;
        }

        notifyIterationUpdated(pipelineId, i);
    }

    if (pipeline && !pipeline.isStopRequested && pipeline.status !== 'failed') {
        updatePipelineStatusUI(pipelineId, 'completed');
    }
}

export function initPipelines() {
    globalState.pipelinesState = [];

    const selectedTemp = getSelectedTemperature();
    const selectedModel = getSelectedModel();

    globalState.pipelinesState.push({
        id: 0,
        originalTemperatureIndex: 0,
        temperature: selectedTemp,
        modelName: selectedModel,
        iterations: Array.from({ length: 10 }, (_, idx) => ({
            iterationNumber: idx + 1,
            title: idx === 0 ? 'Initial Generation' : `Refinement ${idx}`,
            status: 'pending' as const,
        })),
        status: 'idle',
    });
}
