
import { globalState } from '../Core/State';
import { PipelineStopRequestedError } from '../Core/Types';
import { updatePipelineStatusUI, updateIterationUI } from './WebsiteUI';
import { getSelectedRefinementStages, getSelectedTopP, callAI, getSelectedModel } from '../Routing';
import { renderPrompt } from '../Utils/PromptUtils';
import { cleanHtmlOutput, isHtmlContent } from '../Parsing';
import { QUALITY_MODE_SYSTEM_PROMPT } from './RefinePrompts';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000;
const BACKOFF_FACTOR = 2;

export async function runPipeline(pipelineId: number, initialRequest: string) {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.isStopRequested = false;
    updatePipelineStatusUI(pipelineId, 'running');

    let currentContent = "";
    let currentSuggestions: string = '';

    const numMainRefinementLoops = globalState.currentMode === 'website' ? getSelectedRefinementStages() : 0;
    const totalPipelineSteps = globalState.currentMode === 'website' ? 1 + numMainRefinementLoops + 1 : 0;

    for (let i = 0; i < totalPipelineSteps; i++) {
        const iteration = pipeline.iterations[i];
        if (pipeline.isStopRequested) {
            iteration.status = 'cancelled';
            iteration.error = 'Process execution was stopped by the user.';
            updateIterationUI(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                pipeline.iterations[j].status = 'cancelled';
                pipeline.iterations[j].error = 'Process execution was stopped by user.';
                updateIterationUI(pipelineId, j);
            }
            updatePipelineStatusUI(pipelineId, 'stopped');
            return;
        }

        // Reset prompts and outputs for current iteration (website mode only)
        iteration.requestPromptContent_InitialGenerate = iteration.requestPromptContent_FeatureImplement = iteration.requestPromptContent_BugFix = iteration.requestPromptFeatures_Suggest = undefined;
        iteration.contentBeforeBugFix = undefined;
        iteration.error = undefined;

        try {
            const getAgentModel = (agentKey: string): string | undefined => {
                if (globalState.currentMode === 'website') {
                    const modelField = `model_${agentKey}` as keyof typeof globalState.customPromptsWebsiteState;
                    const selectedModel = globalState.customPromptsWebsiteState[modelField] as string | undefined;
                    return selectedModel;
                } else if (globalState.currentMode === 'deepthink') {
                    const modelField = `model_${agentKey}` as keyof typeof globalState.customPromptsDeepthinkState;
                    const selectedModel = globalState.customPromptsDeepthinkState[modelField] as string | undefined;
                    return selectedModel;
                } else if (globalState.currentMode === 'react') {
                    const modelField = `model_${agentKey}` as keyof typeof globalState.customPromptsReactState;
                    const selectedModel = globalState.customPromptsReactState[modelField] as string | undefined;
                    return selectedModel;
                }
                return undefined;
            };

            const makeApiCall = async (userPrompt: string, systemInstruction: string, isJson: boolean, stepDesc: string, agentKey?: string): Promise<string> => {
                if (!pipeline) throw new Error("Pipeline context lost");
                if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDesc}`);
                let responseText = "";
                const customModel = agentKey ? getAgentModel(agentKey) : undefined;
                const modelToUse: string = customModel ?? pipeline.modelName;
                if (!modelToUse) {
                    throw new Error(`No model specified for ${stepDesc}. Please select a model for this agent or set a global model.`);
                }
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDesc}`);
                    iteration.retryAttempt = attempt;
                    iteration.status = attempt > 0 ? 'retrying' : 'processing';
                    updateIterationUI(pipelineId, i);
                    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));

                    try {
                        const apiResponse = await callAI(userPrompt, pipeline.temperature, modelToUse, systemInstruction, isJson, getSelectedTopP());
                        responseText = apiResponse.text || "";
                        iteration.status = 'processing';
                        updateIterationUI(pipelineId, i);
                        return responseText;
                    } catch (e: any) {
                        iteration.error = `Attempt ${attempt + 1} for ${stepDesc} failed: ${e.message || 'Unknown API error'}`;
                        if (e.details) iteration.error += `\nDetails: ${JSON.stringify(e.details)}`;
                        if (e.status) iteration.error += `\nStatus: ${e.status}`;
                        updateIterationUI(pipelineId, i);
                        if (attempt === MAX_RETRIES) {
                            iteration.error = `Failed ${stepDesc} after ${MAX_RETRIES + 1} attempts: ${e.message || 'Unknown API error'}`;
                            throw e;
                        }
                    }
                }
                throw new Error(`API call for ${stepDesc} failed all retries.`);
            };

            if (globalState.currentMode === 'website') {
                const placeholderContent = '<!-- No content provided by previous step. Please generate foundational structure based on the original idea. -->';

                if (i === 0) {
                    const userPromptInitialGen = renderPrompt(globalState.customPromptsWebsiteState.user_initialGen, { initialIdea: initialRequest, currentContent: currentContent });
                    iteration.requestPromptContent_InitialGenerate = userPromptInitialGen;
                    {
                        const initialGenResponse = await makeApiCall(userPromptInitialGen, globalState.customPromptsWebsiteState.sys_initialGen, false, "Initial HTML Generation", "initialGen");
                        currentContent = initialGenResponse;
                        iteration.contentBeforeBugFix = currentContent;
                    }

                    let bugFixSystemPrompt = globalState.customPromptsWebsiteState.sys_initialBugFix;
                    if (globalState.currentEvolutionMode === 'quality') {
                        bugFixSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${bugFixSystemPrompt}`;
                    }

                    const userPromptInitialBugFix = renderPrompt(globalState.customPromptsWebsiteState.user_initialBugFix, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                    iteration.requestPromptContent_BugFix = userPromptInitialBugFix;
                    {
                        const bugfixResponse = await makeApiCall(userPromptInitialBugFix, bugFixSystemPrompt, false, "Initial Bug Fix & Polish - Full Content", "initialBugFix");
                        currentContent = bugfixResponse;
                        iteration.generatedContent = isHtmlContent(currentContent) ? cleanHtmlOutput(currentContent) : currentContent;
                    }

                    if (globalState.currentEvolutionMode !== 'off') {
                        let featureSuggestSystemPrompt = globalState.customPromptsWebsiteState.sys_initialFeatureSuggest;
                        if (globalState.currentEvolutionMode === 'quality') {
                            featureSuggestSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${featureSuggestSystemPrompt}`;
                        }

                        const userPromptInitialFeatures = renderPrompt(globalState.customPromptsWebsiteState.user_initialFeatureSuggest, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                        iteration.requestPromptFeatures_Suggest = userPromptInitialFeatures;
                        const featuresModel = getAgentModel("initialFeatures") || pipeline.modelName;
                        if (!featuresModel) {
                            throw new Error("No model specified for initial feature suggestions. Please select a model for this agent or set a global model.");
                        }
                        const featuresContent = await callAI(userPromptInitialFeatures, pipeline.temperature, featuresModel, featureSuggestSystemPrompt, false, getSelectedTopP()).then((response: any) => response.text);
                        iteration.suggestedFeaturesContent = featuresContent;
                        currentSuggestions = featuresContent || '';
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

                        const userPromptRefineImplement = renderPrompt(globalState.customPromptsWebsiteState.user_refineStabilizeImplement, { currentContent: currentContent || placeholderContent, featuresToImplementStr: currentSuggestions });
                        iteration.requestPromptContent_FeatureImplement = userPromptRefineImplement;
                        {
                            const refineImplementResponse = await makeApiCall(userPromptRefineImplement, refineImplementSystemPrompt, false, `Stabilization & Feature Impl (Iter ${i}) - Full Content`, "refineStabilizeImplement");
                            currentContent = refineImplementResponse;
                            iteration.contentBeforeBugFix = currentContent;
                        }
                    } else {
                        iteration.requestPromptContent_FeatureImplement = 'Skipped (Evolution Mode: Off)';
                    }

                    let refineBugFixSystemPrompt = globalState.customPromptsWebsiteState.sys_refineBugFix;
                    if (globalState.currentEvolutionMode === 'quality') {
                        refineBugFixSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineBugFixSystemPrompt}`;
                    }

                    const userPromptRefineBugFix = renderPrompt(globalState.customPromptsWebsiteState.user_refineBugFix, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                    iteration.requestPromptContent_BugFix = userPromptRefineBugFix;
                    {
                        const bugfixResponse = await makeApiCall(userPromptRefineBugFix, refineBugFixSystemPrompt, false, `Bug Fix & Completion (Iter ${i}) - Full Content`, "refineBugFix");
                        currentContent = bugfixResponse;
                        iteration.generatedContent = isHtmlContent(currentContent) ? cleanHtmlOutput(currentContent) : currentContent;
                    }

                    if (globalState.currentEvolutionMode !== 'off') {
                        let refineFeatureSuggestSystemPrompt = globalState.customPromptsWebsiteState.sys_refineFeatureSuggest;
                        if (globalState.currentEvolutionMode === 'quality') {
                            refineFeatureSuggestSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineFeatureSuggestSystemPrompt}`;
                        }

                        const userPromptRefineFeatures = renderPrompt(globalState.customPromptsWebsiteState.user_refineFeatureSuggest, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                        iteration.requestPromptFeatures_Suggest = userPromptRefineFeatures;
                        const refineFeatureModel = getAgentModel("refineFeatures") || pipeline.modelName;
                        if (!refineFeatureModel) {
                            throw new Error("No model specified for refine feature suggestions. Please select a model for this agent or set a global model.");
                        }
                        const featuresContent = await callAI(userPromptRefineFeatures, pipeline.temperature, refineFeatureModel, refineFeatureSuggestSystemPrompt, false, getSelectedTopP()).then((response: any) => response.text);
                        iteration.suggestedFeaturesContent = featuresContent;
                        currentSuggestions = featuresContent || '';
                    } else {
                        iteration.suggestedFeaturesContent = '';
                        currentSuggestions = '';
                    }
                } else {
                    let finalPolishSystemPrompt = globalState.customPromptsWebsiteState.sys_finalPolish;
                    if (globalState.currentEvolutionMode === 'quality') {
                        finalPolishSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${finalPolishSystemPrompt}`;
                    }

                    const userPromptFinalPolish = renderPrompt(globalState.customPromptsWebsiteState.user_finalPolish, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                    iteration.requestPromptContent_BugFix = userPromptFinalPolish;
                    {
                        const finalPolishResponse = await makeApiCall(userPromptFinalPolish, finalPolishSystemPrompt, false, "Final Polish - Full Content", "finalPolish");
                        currentContent = finalPolishResponse;
                        iteration.generatedContent = isHtmlContent(currentContent) ? cleanHtmlOutput(currentContent) : currentContent;
                    }
                    iteration.suggestedFeaturesContent = "";
                }
            }
            if (!iteration.error) {
                iteration.status = 'completed';
            } else {
                iteration.status = 'error';
            }
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
            updateIterationUI(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                if (pipeline.iterations[j].status !== 'cancelled') {
                    pipeline.iterations[j].status = 'cancelled';
                    pipeline.iterations[j].error = (error instanceof PipelineStopRequestedError) ? 'Process stopped by user.' : 'Halted due to prior error.';
                    updateIterationUI(pipelineId, j);
                }
            }
            return;
        }
        updateIterationUI(pipelineId, i);
    }

    if (pipeline && !pipeline.isStopRequested && pipeline.status !== 'failed') {
        updatePipelineStatusUI(pipelineId, 'completed');
    }
}

export function initPipelines() {
    globalState.pipelinesState = [];

    const tempSlider = document.getElementById('temperature-slider') as HTMLInputElement;
    const selectedTemp = tempSlider ? parseFloat(tempSlider.value) : 0.7;
    console.log('[Website] Selected temperature from slider:', selectedTemp);

    const selectedModel = getSelectedModel();

    // Create a single pipeline with the selected temperature
    globalState.pipelinesState.push({
        id: 0,
        originalTemperatureIndex: 0, // Not really used with slider
        temperature: selectedTemp,
        modelName: selectedModel,
        iterations: Array(10).fill(null).map((_, idx) => ({
            iterationNumber: idx + 1,
            title: idx === 0 ? "Initial Generation" : `Refinement ${idx}`,
            status: 'pending'
        })),
        status: 'idle'
    });

    console.log('[Website] Created', globalState.pipelinesState.length, 'pipelines');

    if (globalState.pipelinesState.length === 0) {
        console.warn('[Website] WARNING: No pipelines created!');
    }
}
