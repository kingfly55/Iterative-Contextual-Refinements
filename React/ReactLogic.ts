
import { globalState } from '../Core/State';
import JSZip from 'jszip';
import { PipelineStopRequestedError } from '../Core/Types';
import { renderReactModePipeline } from './ReactUI';
import { callAI, getSelectedModel } from '../Routing';
import { renderPrompt } from '../Utils/PromptUtils';
import { cleanOutputByType } from '../Parsing';
import { orchestratorSysPrompt } from './ReactPrompts';
import { updateControlsState } from '../UI/Controls';

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000;
const BACKOFF_FACTOR = 2;

export async function startReactModeProcess(userRequest: string) {
    console.log('[ReactLogic] startReactModeProcess called', { userRequest });
    if (!userRequest) {
        console.warn('[ReactLogic] No user request provided');
        return;
    }

    globalState.isGenerating = true;
    updateControlsState();

    globalState.activeReactPipeline = {
        id: `react-process-${Date.now()}`,
        userRequest: userRequest,
        orchestratorSystemInstruction: orchestratorSysPrompt,
        stages: Array(5).fill(null).map((_, i) => ({
            id: i,
            title: `Worker Agent ${i + 1}`,
            status: 'pending'
        })),
        status: 'orchestrating',
        isStopRequested: false,
        activeTabId: 'orchestrator',
        agenticRefineStarted: false,
    };
    console.log('[ReactLogic] Initialized activeReactPipeline', globalState.activeReactPipeline);
    renderReactModePipeline();

    try {
        const orchestratorUserPrompt = `User Request: ${userRequest}\n\nPlease generate the plan and worker agent prompts.`;
        let orchestratorResponseText = "";

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (globalState.activeReactPipeline?.isStopRequested) {
                throw new PipelineStopRequestedError("Orchestrator stopped by user.");
            }
            if (attempt > 0) await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));

            try {
                globalState.activeReactPipeline.orchestratorRetryAttempt = attempt;
                if (attempt > 0) globalState.activeReactPipeline.status = 'orchestrating_retrying';
                renderReactModePipeline();

                const orchestratorModel = globalState.customPromptsReactState.model_orchestrator || getSelectedModel();
                const apiResponse = await callAI(orchestratorUserPrompt, 0.7, orchestratorModel, orchestratorSysPrompt, true);
                orchestratorResponseText = apiResponse.text || "";
                break;
            } catch (e: any) {
                if (attempt === MAX_RETRIES) throw e;
            }
        }

        globalState.activeReactPipeline.orchestratorRawOutput = orchestratorResponseText;
        console.log('[ReactLogic] Raw Orchestrator Output:', orchestratorResponseText);

        try {
            const parsedOrchestratorOutput = JSON.parse(cleanOutputByType(orchestratorResponseText, 'json'));
            console.log('[ReactLogic] Parsed Orchestrator Output:', parsedOrchestratorOutput);
            globalState.activeReactPipeline.orchestratorPlan = parsedOrchestratorOutput.plan_txt;

            if (parsedOrchestratorOutput.worker_agents_prompts && Array.isArray(parsedOrchestratorOutput.worker_agents_prompts)) {
                parsedOrchestratorOutput.worker_agents_prompts.forEach((agentPromptData: any, index: number) => {
                    if (index < 5 && globalState.activeReactPipeline) {
                        globalState.activeReactPipeline.stages[index].title = agentPromptData.title;
                        globalState.activeReactPipeline.stages[index].systemInstruction = agentPromptData.system_instruction;
                        globalState.activeReactPipeline.stages[index].userPrompt = agentPromptData.user_prompt_template;
                    }
                });
            }

            globalState.activeReactPipeline.status = 'agentic_orchestrating';

            let initialContent = `// --- FILE: Plan.md ---\n${parsedOrchestratorOutput.plan_txt}\n\n`;

            if (!parsedOrchestratorOutput.worker_agents_prompts || !Array.isArray(parsedOrchestratorOutput.worker_agents_prompts)) {
                throw new Error("Orchestrator response missing 'worker_agents_prompts' array.");
            }

            const workerPromptsJson = {
                worker_agents: parsedOrchestratorOutput.worker_agents_prompts.map((agentPromptData: any, index: number) => ({
                    id: index + 1,
                    title: agentPromptData.title,
                    system_instruction: agentPromptData.system_instruction,
                    user_prompt_template: agentPromptData.user_prompt_template
                }))
            };

            initialContent += `// --- FILE: WorkerAgentsPrompts.json ---\n${JSON.stringify(workerPromptsJson, null, 2)}\n\n`;

            globalState.activeReactPipeline.initialAgenticContent = initialContent;
            globalState.activeReactPipeline.workerPromptsData = parsedOrchestratorOutput.worker_agents_prompts;
            renderReactModePipeline();

        } catch (parseError: any) {
            globalState.activeReactPipeline.error = `Failed to parse Orchestrator JSON: ${parseError.message}. Check console for details.`;
            throw new Error(`Orchestrator output parsing error: ${parseError.message}`);
        }

    } catch (error: any) {
        console.error('[ReactLogic] Error in startReactModeProcess:', error);
        if (globalState.activeReactPipeline) {
            if (error instanceof PipelineStopRequestedError) {
                globalState.activeReactPipeline.status = 'stopped';
                globalState.activeReactPipeline.error = error.message;
            } else {
                globalState.activeReactPipeline.status = 'failed';
                if (!globalState.activeReactPipeline.error) globalState.activeReactPipeline.error = error.message || "An unknown error occurred in React Orchestrator.";
            }
        }
    } finally {
        if (globalState.activeReactPipeline && globalState.activeReactPipeline.status !== 'agentic_orchestrating' && globalState.activeReactPipeline.status !== 'orchestrating' && globalState.activeReactPipeline.status !== 'orchestrating_retrying' && globalState.activeReactPipeline.status !== 'stopping') {
            globalState.isGenerating = false;
        }
        updateControlsState();
        renderReactModePipeline();
    }
}

export async function runReactWorkerAgents() {
    if (!globalState.activeReactPipeline || globalState.activeReactPipeline.status !== 'processing_workers') {
        return;
    }
    renderReactModePipeline();

    const workerPromises = globalState.activeReactPipeline.stages.map(async (stage) => {
        if (!globalState.activeReactPipeline || globalState.activeReactPipeline.isStopRequested) {
            stage.status = 'cancelled';
            stage.error = "Process stopped by user.";
            renderReactModePipeline();
            return stage;
        }
        if (!stage.systemInstruction || !stage.userPrompt) {
            stage.status = 'error';
            stage.error = "Missing system instruction or user prompt template from Orchestrator.";
            renderReactModePipeline();
            return stage;
        }

        stage.status = 'processing';
        stage.retryAttempt = 0;
        renderReactModePipeline();

        // Use orchestrator-provided prompts, or fallback to defaults
        const systemInstruction = stage.systemInstruction || globalState.customPromptsReactState.sys_worker || "You are a React development specialist agent. Execute your assigned task as detailed in the development plan.";
        const userPromptTemplate = stage.userPrompt || globalState.customPromptsReactState.user_worker || "Development Plan: {{plan_txt}}\n\nUser's original request: {{user_request}}\n\nExecute your assigned tasks from the plan.";

        stage.renderedUserPrompt = renderPrompt(userPromptTemplate, {
            plan_txt: globalState.activeReactPipeline.orchestratorPlan || "",
            user_request: globalState.activeReactPipeline.userRequest || ""
        });

        let stageResponseText = "";
        try {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (!globalState.activeReactPipeline || globalState.activeReactPipeline.isStopRequested) {
                    throw new PipelineStopRequestedError(`Worker Agent ${stage.id} execution stopped by user.`);
                }
                stage.retryAttempt = attempt;
                stage.status = attempt > 0 ? 'retrying' : 'processing';

                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));
                }
                renderReactModePipeline();

                try {
                    const workerModel: string = globalState.customPromptsReactState.model_worker || getSelectedModel();
                    const workerTemp = 0.7;

                    const apiResponse = await callAI(stage.renderedUserPrompt, workerTemp, workerModel, systemInstruction, false);
                    stageResponseText = apiResponse.text || "";
                    stage.generatedContent = cleanOutputByType(stageResponseText, 'text');
                    stage.status = 'completed';
                    stage.error = undefined;
                    renderReactModePipeline();
                    break;
                } catch (e: any) {
                    stage.error = `Attempt ${attempt + 1} failed: ${e.message || 'Unknown API error'}`;
                    if (attempt === MAX_RETRIES) {
                        renderReactModePipeline();
                        throw e;
                    }
                }
            }
        } catch (error: any) {
            stage.status = 'error';
            if (!stage.error) stage.error = error.message || `Worker Agent ${stage.id} failed.`;
            if (error instanceof PipelineStopRequestedError) {
                stage.status = 'cancelled';
                stage.error = error.message;
            }
        }
        renderReactModePipeline();
        return stage;
    });

    await Promise.allSettled(workerPromises);

    if (globalState.activeReactPipeline) {
        const anyAgentFailed = globalState.activeReactPipeline.stages.some(s => s.status === 'error');
        const allCancelled = globalState.activeReactPipeline.stages.every(s => s.status === 'cancelled');

        if (globalState.activeReactPipeline.isStopRequested || allCancelled) {
            globalState.activeReactPipeline.status = 'stopped';
        } else if (anyAgentFailed) {
            globalState.activeReactPipeline.status = 'failed';
        } else {
            aggregateReactOutputs();
        }
    }

    globalState.isGenerating = false;
    updateControlsState();
    renderReactModePipeline();
}

export function aggregateReactOutputs() {
    if (!globalState.activeReactPipeline) {
        return;
    }

    let combinedCode = `/* --- React Application Code --- */\n/* Generated by Iterative Studio */\n/* User Request: ${globalState.activeReactPipeline.userRequest} */\n\n`;
    combinedCode += `/* --- Orchestrator Plan (plan.txt) --- */\n/*\n${globalState.activeReactPipeline.orchestratorPlan || "No plan generated."}\n*/\n\n`;

    globalState.activeReactPipeline.stages.forEach(stage => {
        if (stage.status === 'completed' && stage.generatedContent) {
            combinedCode += `/* --- Code from Agent ${stage.id + 1}: ${stage.title} --- */\n`;
            combinedCode += `${stage.generatedContent.trim()}\n\n`;
        } else if (stage.status === 'error') {
            combinedCode += `/* --- Agent ${stage.id + 1}: ${stage.title} - FAILED --- */\n`;
            combinedCode += `/* Error: ${stage.error || "Unknown error"} */\n\n`;
        } else if (stage.status === 'cancelled') {
            combinedCode += `/* --- Agent ${stage.id + 1}: ${stage.title} - CANCELLED --- */\n\n`;
        }
    });
    globalState.activeReactPipeline.finalAppendedCode = combinedCode;
}

export async function createAndDownloadReactProjectZip() {
    const activeReactPipeline = globalState.activeReactPipeline;
    if (!activeReactPipeline || !activeReactPipeline.finalAppendedCode) {
        alert("No React project code available to download.");
        return;
    }

    const zip = new JSZip();
    const finalCode = activeReactPipeline.finalAppendedCode;
    const fileMarkerRegex = /^\/\/\s*---\s*FILE:\s*(.*?)\s*---\s*$/m;
    const files: { path: string, content: string }[] = [];

    const parts = finalCode.split(fileMarkerRegex);

    if (parts.length > 1) {
        for (let i = 1; i < parts.length; i += 2) {
            const path = parts[i].trim();
            const content = (parts[i + 1] || '').trim();
            if (path && content) {
                files.push({ path, content });
            }
        }
    }

    if (files.length === 0 && finalCode.length > 0) {
        files.push({ path: "src/App.tsx", content: finalCode });
    }

    files.forEach(file => {
        const correctedPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
        zip.file(correctedPath, file.content);
    });

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const { downloadFile } = await import('../Components/ActionButton');
        downloadFile(zipBlob as any, `react-app-${activeReactPipeline.id}.zip`, 'application/zip');
    } catch (error) {
        alert("Failed to generate zip file. See console for details.");
    }
}
