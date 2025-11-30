/**
 * React Mode Agentic Integration
 * Extends the Agentic mode to support React-specific tools and workflow
 */

// React imports removed - not needed for this file
import {
    createInitialState,
    parseAgentResponseWithSegments,
    AgenticState,
    AgenticMessage,
    ToolCall,
    SystemBlock,
    extractTextFromAny,
    AgenticConversationManager,
    applyDiffCommand,
    DiffCommand
} from '../Agentic/AgenticCoreLangchain';
import { REACT_AGENTIC_SYSTEM_PROMPT } from './EmbeddedAgenticPrompts';
import { renderReactAgenticEmbeddedUI, updateReactAgenticEmbeddedUI, forceReactAgenticUIRender } from './ReactAgenticEmbeddedUI';
import { callAI, getSelectedModel, getSelectedTemperature, getSelectedTopP } from '../Routing';
import { buildReactApp, parseFilesFromConcatenatedCode, createPreviewUrl } from './ReactBuildManager';
import { updateControlsState } from '../UI/Controls';
import { globalState } from '../Core/State';

// Extended state for React mode
interface ReactAgenticState extends AgenticState {
    orchestratorPlan?: string;
    workerPrompts?: Array<{
        title: string;
        system_instruction: string;
        user_prompt_template: string;
    }>;
    workersExecuted?: boolean;
    lastBuildResult?: {
        success: boolean;
        errors: string[];
        warnings: string[];
    };
    userRequest?: string;
    activeReactPipeline?: any;
    customPromptsReactState?: any;
}
// Constants for retry logic
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000;
const BACKOFF_FACTOR = 2;

// Module-level variables
let activeReactAgenticState: ReactAgenticState | null = null;
let reactAgenticUIRoot: any = null;
let reactAgenticUIContainer: HTMLElement | null = null; // Track the container
// isReactAgenticRunning is now in globalState
let abortController: AbortController | null = null;
let conversationManager: AgenticConversationManager | null = null;
let onContentUpdated: ((content: string, isComplete?: boolean) => void) | null = null;
// Helper function for message IDs
function newMsgId(prefix: string = 'msg'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Render prompt template with variables
 */
function renderPrompt(template: string, variables: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        result = result.replace(regex, value);
    }
    return result;
}

/**
 * Execute StartWorkerAgents tool
 */
async function executeStartWorkerAgents(state: ReactAgenticState): Promise<{ result: string; updatedContent?: string }> {
    if (state.workersExecuted) {
        return {
            result: '[SYSTEM_ERROR: Worker agents have already been executed. This tool can only be called once.]'
        };
    }

    if (!state.activeReactPipeline) {
        return {
            result: '[SYSTEM_ERROR: No active React pipeline found. Cannot start worker agents.]'
        };
    }

    if (!state.activeReactPipeline.orchestratorPlan || !state.activeReactPipeline.stages) {
        return {
            result: '[SYSTEM_ERROR: Orchestrator plan or worker prompts not available.]'
        };
    }

    try {
        // CRITICAL: Parse the UPDATED plan.txt and worker_prompts.json from currentContent
        // The agent may have refined them using multi_edit before calling this tool

        // Parse plan.txt file
        const planFileMatch = state.currentContent.match(/\/\*\s*---\s*File:\s*plan\.txt\s*---\s*\*\/\s*([\s\S]*?)(?=\/\*\s*---\s*File:|$)/);
        let updatedPlanUsed = false;

        if (planFileMatch) {
            const updatedPlan = planFileMatch[1].trim();
            if (updatedPlan && updatedPlan !== state.activeReactPipeline.orchestratorPlan) {
                state.activeReactPipeline.orchestratorPlan = updatedPlan;
                updatedPlanUsed = true;
                console.log('[React Agentic] Using UPDATED plan.txt from agent refinements');
            }
        }

        // Parse worker_prompts.json file
        const promptsFileMatch = state.currentContent.match(/\/\*\s*---\s*File:\s*worker_prompts\.json\s*---\s*\*\/\s*([\s\S]*?)(?=\/\*\s*---\s*File:|$)/);
        let updatedPromptsCount = 0;

        if (promptsFileMatch) {
            try {
                const promptsJson = JSON.parse(promptsFileMatch[1].trim());
                if (promptsJson.worker_agents && Array.isArray(promptsJson.worker_agents)) {
                    console.log(`[React Agentic] Parsed ${promptsJson.worker_agents.length} UPDATED worker prompts from agent refinements`);

                    promptsJson.worker_agents.forEach((agent: any, index: number) => {
                        if (state.activeReactPipeline.stages[index]) {
                            state.activeReactPipeline.stages[index].title = agent.title;
                            state.activeReactPipeline.stages[index].systemInstruction = agent.system_instruction;
                            state.activeReactPipeline.stages[index].userPrompt = agent.user_prompt_template;
                            updatedPromptsCount++;
                        }
                    });
                }
            } catch (jsonError) {
                console.warn('[React Agentic] Failed to parse worker_prompts.json, using original prompts:', jsonError);
            }
        }

        // Execute all worker agents in parallel
        const workerPromises = state.activeReactPipeline.stages.map(async (stage: any) => {
            if (!stage.systemInstruction || !stage.userPrompt) {
                stage.status = 'error';
                stage.error = 'Missing system instruction or user prompt';
                return stage;
            }

            stage.status = 'processing';

            // Update pipeline stage status and trigger UI update
            if (state.activeReactPipeline) {
                state.activeReactPipeline.stages[stage.id].status = 'processing';
                // Trigger UI update by calling renderReactModePipeline if available
                if (typeof (window as any).renderReactModePipeline === 'function') {
                    (window as any).renderReactModePipeline();
                }
            }

            // Render the user prompt with the plan
            stage.renderedUserPrompt = renderPrompt(stage.userPrompt, {
                plan_txt: state.activeReactPipeline.orchestratorPlan || '',
                user_request: state.activeReactPipeline.userRequest || ''
            });

            try {
                // Call the AI for this worker
                const workerModel = state.customPromptsReactState?.model_worker || getSelectedModel();
                const response = await callAI(
                    stage.renderedUserPrompt,
                    0.7, // Temperature
                    workerModel,
                    stage.systemInstruction,
                    false, // Not expecting JSON
                    getSelectedTopP()
                );

                const responseText = extractTextFromAny(response);
                stage.generatedContent = responseText;
                stage.status = 'completed';

                // Update pipeline stage status
                if (state.activeReactPipeline) {
                    state.activeReactPipeline.stages[stage.id].status = 'completed';
                    state.activeReactPipeline.stages[stage.id].generatedContent = responseText;
                }

                return stage;
            } catch (error: any) {
                stage.status = 'error';
                stage.error = error.message || 'Worker agent failed';

                // Update pipeline stage status
                if (state.activeReactPipeline) {
                    state.activeReactPipeline.stages[stage.id].status = 'error';
                    state.activeReactPipeline.stages[stage.id].error = stage.error;
                }

                return stage;
            }
        });

        // Wait for all workers to complete
        await Promise.allSettled(workerPromises);

        // Aggregate the outputs
        let combinedCode = `/* --- React Application Code --- */\n`;
        combinedCode += `/* Generated by Iterative Studio */\n`;
        combinedCode += `/* User Request: ${state.activeReactPipeline.userRequest} */\n\n`;
        combinedCode += `/* --- Orchestrator Plan (plan.txt) --- */\n/*\n${state.activeReactPipeline.orchestratorPlan || 'No plan generated.'}\n*/\n\n`;

        state.activeReactPipeline.stages.forEach((stage: any, index: number) => {
            if (stage.status === 'completed' && stage.generatedContent) {
                combinedCode += `/* --- File: ${stage.title || `Agent${index + 1}Output`} --- */\n`;
                combinedCode += `${stage.generatedContent.trim()}\n\n`;
            } else if (stage.status === 'error') {
                combinedCode += `/* --- Agent ${index + 1}: ${stage.title} - FAILED --- */\n`;
                combinedCode += `/* Error: ${stage.error || 'Unknown error'} */\n\n`;
            }
        });

        // Mark workers as executed in both state and pipeline
        state.workersExecuted = true;
        if (state.activeReactPipeline) {
            state.activeReactPipeline.workersExecuted = true;
            // Trigger UI update to show worker tabs
            if (typeof (window as any).renderReactModePipeline === 'function') {
                (window as any).renderReactModePipeline();
            }
        }

        // Store the combined code as current content but don't return it to avoid filling context
        // The agent should use read_current_content to read it when needed
        state.currentContent = combinedCode;

        // Update the conversation manager's content (using module-level variable)
        if (conversationManager) {
            conversationManager.updateCurrentContent(combinedCode);
        }

        // Trigger content update callback to update Monaco editor (using module-level variable)
        if (onContentUpdated) {
            onContentUpdated(combinedCode, false);
        }

        // Count successful and failed workers
        const successCount = state.activeReactPipeline.stages.filter((s: any) => s.status === 'completed').length;
        const errorCount = state.activeReactPipeline.stages.filter((s: any) => s.status === 'error').length;

        // Return a summary without the actual code content
        // This ensures the agent's context isn't immediately filled with the entire codebase
        const planMessage = updatedPlanUsed ? ' (using your refined plan.txt)' : '';
        const promptsMessage = updatedPromptsCount > 0 ? ` (using your refined prompts for ${updatedPromptsCount} agents)` : '';

        return {
            result: `[TOOL_RESULT: All ${state.activeReactPipeline.stages.length} worker agents have completed their task and code generation${planMessage}${promptsMessage}.\n` +
                `✓ Successful: ${successCount}\n` +
                `✗ Failed: ${errorCount}\n\n` +
                `The application codebase has been assembled and is ready for review.\n` +
                `Use the read_current_content() tool to examine the generated code and identify any issues that need fixing.]`
        };

    } catch (error: any) {
        return {
            result: `[SYSTEM_ERROR: Failed to execute worker agents: ${error.message}]`
        };
    }
}

/**
 * Execute CheckBuild tool
 */
async function executeCheckBuild(state: ReactAgenticState): Promise<{ result: string }> {
    try {
        // Build the current content
        const buildResult = await buildReactApp(state.currentContent);

        // Store the build result
        state.lastBuildResult = buildResult;

        if (buildResult.success) {
            let result = '[BUILD_SUCCESS: Application built successfully!]';
            if (buildResult.warnings.length > 0) {
                result += '\n\nWarnings:\n' + buildResult.warnings.join('\n');
            }

            // Create preview URL if build succeeded
            const files = parseFilesFromConcatenatedCode(state.currentContent);
            const previewUrl = createPreviewUrl(buildResult, files);
            if (previewUrl && state.activeReactPipeline) {
                // Clean up previous blob URL if it exists
                if (state.activeReactPipeline.prevPreviewUrl) {
                    try {
                        URL.revokeObjectURL(state.activeReactPipeline.prevPreviewUrl);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }

                // Store new preview URL and previous URL for future cleanup
                state.activeReactPipeline.prevPreviewUrl = state.activeReactPipeline.previewUrl;
                state.activeReactPipeline.previewUrl = previewUrl;

                // Trigger UI update to create/update preview tab
                if (typeof (window as any).renderReactModePipeline === 'function') {
                    (window as any).renderReactModePipeline();
                }

                // Auto-activate the preview tab after successful build
                setTimeout(() => {
                    const previewTab = document.getElementById('react-tab-preview');
                    if (previewTab) {
                        previewTab.click();
                    }
                }, 100);
            }

            return { result };
        } else {
            let result = '[BUILD_FAILED: Build errors detected]\n\n';
            result += 'Errors:\n' + buildResult.errors.join('\n\n');
            if (buildResult.warnings.length > 0) {
                result += '\n\nWarnings:\n' + buildResult.warnings.join('\n');
            }
            return { result };
        }
    } catch (error: any) {
        return {
            result: `[SYSTEM_ERROR: Build check failed: ${error.message}]`
        };
    }
}

/**
 * Execute React-specific tool calls
 */
async function executeReactToolCall(
    toolCall: ToolCall,
    state: ReactAgenticState
): Promise<{
    result: string;
    updatedContent?: string;
    isComplete?: boolean;
}> {
    // Parse tool name from the tool call
    const toolType = (toolCall as any).type || (toolCall as any).name;

    // Handle React-specific tools
    if (toolType === 'StartWorkerAgents') {
        return await executeStartWorkerAgents(state);
    }

    if (toolType === 'CheckBuild') {
        return await executeCheckBuild(state);
    }

    // Handle Exit tool
    if (toolType === 'Exit') {
        return {
            result: '[Agent exiting. Task completed.]',
            isComplete: true
        };
    }

    // Handle read_current_content
    if (toolType === 'read_current_content') {
        const params = (toolCall as any).params;
        if (params && params.length === 2) {
            // Read specific lines
            const [startLine, endLine] = params;
            const lines = state.currentContent.split('\n');
            const selectedLines = lines.slice(startLine - 1, endLine);
            return {
                result: selectedLines.join('\n')
            };
        } else {
            // Read entire content
            return {
                result: state.currentContent
            };
        }
    }

    // Handle multi_edit (matching main Agentic mode logic)
    if (toolType === 'multi_edit') {
        const ops = (toolCall as any).operations || (toolCall as any).params;

        if (!ops || !Array.isArray(ops) || ops.length === 0) {
            return {
                result: '[TOOL_RESULT:multi_edit]\nMulti-edit finished: 0 OK, 0 FAIL\nNo operations were provided in multi_edit()'
            };
        }

        let updatedContent = state.currentContent;
        const logs: string[] = [];
        const logsForHistory: string[] = [];  // Minimal logs for model context
        let okCount = 0;
        let failCount = 0;

        // Apply all operations inside multi_edit
        for (let i = 0; i < ops.length; i++) {
            const op = ops[i];
            const result = applyDiffCommand(updatedContent, op as DiffCommand);

            if (result.success) {
                updatedContent = result.result;
                // Full details for UI display
                logs.push(`OK ${op.type}(${op.params.map((p: string) => '"' + p + '"').join(', ')})`);
                // Minimal for model context (no parameters)
                logsForHistory.push(`OK ${op.type}`);
                okCount++;
            } else {
                // Full error for UI display
                logs.push(`FAIL ${op.type}: ${result.error}`);
                // Minimal error for model context
                logsForHistory.push(`FAIL ${op.type}: ${result.error}`);
                failCount++;
            }
        }

        const summary = `Multi-edit finished: ${okCount} OK, ${failCount} FAIL`;
        const resultBody = [summary, ...logs].join('\n');

        return {
            result: `[TOOL_RESULT:multi_edit]\n${resultBody}`,
            updatedContent: okCount > 0 ? updatedContent : undefined
        };
    }

    return {
        result: `[SYSTEM_ERROR: Unknown tool: ${toolType}]`
    };
}

/**
 * Parse React tool calls from agent response
 */
function parseReactToolCalls(text: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Check for StartWorkerAgents
    if (text.includes('[TOOL_CALL:StartWorkerAgents()]')) {
        toolCalls.push({ type: 'StartWorkerAgents', params: {} } as any);
    }

    // Check for CheckBuild
    if (text.includes('[TOOL_CALL:CheckBuild()]')) {
        toolCalls.push({ type: 'CheckBuild', params: {} } as any);
    }

    // Check for Exit
    if (text.includes('[TOOL_CALL:Exit()]')) {
        toolCalls.push({ type: 'Exit', params: {} } as any);
    }

    // Parse read_current_content
    const readMatch = text.match(/\[TOOL_CALL:read_current_content\((\d+),\s*(\d+)\)\]/);
    if (readMatch) {
        toolCalls.push({
            type: 'read_current_content',
            params: [parseInt(readMatch[1]), parseInt(readMatch[2])]
        } as any);
    } else if (text.includes('[TOOL_CALL:read_current_content()]')) {
        toolCalls.push({ type: 'read_current_content' } as any);
    }

    // Parse multi_edit - this is more complex as it contains nested commands
    const multiEditMatch = text.match(/\[TOOL_CALL:multi_edit\(([\s\S]*?)\)\]/);
    if (multiEditMatch) {
        // Parse the commands inside multi_edit
        const commandsStr = multiEditMatch[1];
        const commands: DiffCommand[] = [];

        // Parse search_and_replace
        const searchReplaceRegex = /search_and_replace\("([^"]*)",\s*"([^"]*)"\)/g;
        let match;
        while ((match = searchReplaceRegex.exec(commandsStr)) !== null) {
            commands.push({
                type: 'search_and_replace',
                params: [match[1], match[2]]
            });
        }

        // Parse delete
        const deleteRegex = /delete\("([^"]*)"\)/g;
        while ((match = deleteRegex.exec(commandsStr)) !== null) {
            commands.push({
                type: 'delete',
                params: [match[1]]
            });
        }

        // Parse insert_before
        const insertBeforeRegex = /insert_before\("([^"]*)",\s*"([^"]*)"\)/g;
        while ((match = insertBeforeRegex.exec(commandsStr)) !== null) {
            commands.push({
                type: 'insert_before',
                params: [match[1], match[2]]
            });
        }

        // Parse insert_after
        const insertAfterRegex = /insert_after\("([^"]*)",\s*"([^"]*)"\)/g;
        while ((match = insertAfterRegex.exec(commandsStr)) !== null) {
            commands.push({
                type: 'insert_after',
                params: [match[1], match[2]]
            });
        }

        if (commands.length > 0) {
            toolCalls.push({ type: 'multi_edit', params: commands } as any);
        }
    }

    return toolCalls;
}

/**
 * Start React Agentic process in a container
 */
export async function startReactAgenticProcess(
    container: HTMLElement,
    initialContent: string,
    pipeline: any,
    customPrompts: any,
    contentUpdateCallback?: (content: string, isComplete?: boolean) => void
) {
    if (globalState.isReactAgenticRunning) return;

    // Set callback
    onContentUpdated = contentUpdateCallback || null;

    // Initialize conversation manager with React-specific prompt
    const systemPrompt = REACT_AGENTIC_SYSTEM_PROMPT;
    conversationManager = new AgenticConversationManager(
        initialContent,
        systemPrompt,
        '' // No verifier for React mode
    );

    // Initialize state
    activeReactAgenticState = {
        ...createInitialState(initialContent),
        orchestratorPlan: pipeline.orchestratorPlan,
        workerPrompts: pipeline.workerPromptsData,
        userRequest: pipeline.userRequest,
        activeReactPipeline: pipeline,
        customPromptsReactState: customPrompts,
        workersExecuted: false,
        conversationManager
    } as ReactAgenticState;

    globalState.isReactAgenticRunning = true;
    updateControlsState();
    abortController = new AbortController();

    // Mount UI with embedded file manager
    reactAgenticUIContainer = container;

    // Create download handler
    const handleDownload = async () => {
        if (activeReactAgenticState && activeReactAgenticState.currentContent) {
            // Import createAndDownloadReactProjectZip from index.tsx
            if (typeof (window as any).createAndDownloadReactProjectZip === 'function') {
                await (window as any).createAndDownloadReactProjectZip();
            }
        }
    };

    // Create view evolutions handler - shows content history modal
    const handleViewEvolutions = async () => {
        if (activeReactAgenticState && activeReactAgenticState.contentHistory && activeReactAgenticState.contentHistory.length > 0) {
            const { openEvolutionViewerFromHistory } = await import('../Components/DiffModal/EvolutionViewer');
            const sessionId = `react-agentic-${activeReactAgenticState.activeReactPipeline?.id || 'session'}`;
            openEvolutionViewerFromHistory(activeReactAgenticState.contentHistory, sessionId);
        } else {
            alert('No content evolution history available yet.');
        }
    };

    reactAgenticUIRoot = renderReactAgenticEmbeddedUI(
        container,
        activeReactAgenticState,
        stopReactAgenticProcess,
        activeReactAgenticState.currentContent,
        (newContent: string) => {
            if (activeReactAgenticState) {
                activeReactAgenticState.currentContent = newContent;
                conversationManager!.updateCurrentContent(newContent);
                if (onContentUpdated) {
                    onContentUpdated(newContent, false);
                }
            }
        },
        handleDownload,
        handleViewEvolutions
    );

    // Run the agent loop
    await runReactAgentLoop();
}

/**
 * Stop the React Agentic process
 */
export function stopReactAgenticProcess() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    globalState.isReactAgenticRunning = false;

    // Update the UI to reflect stopped state
    if (activeReactAgenticState && reactAgenticUIRoot) {
        activeReactAgenticState.isProcessing = false;
        activeReactAgenticState.isComplete = true;

        // Add a system message indicating the process was stopped
        activeReactAgenticState.messages.push({
            id: `msg-${Date.now()}`,
            role: 'system',
            content: 'Process stopped by user.',
            timestamp: Date.now(),
            status: 'success'
        });

        // Update UI
        const handleDownload = async () => {
            if (typeof (window as any).createAndDownloadReactProjectZip === 'function') {
                await (window as any).createAndDownloadReactProjectZip();
            }
        };

        const handleViewEvolutions = async () => {
            if (activeReactAgenticState?.contentHistory && activeReactAgenticState.contentHistory.length > 0) {
                const { openEvolutionViewerFromHistory } = await import('../Components/DiffModal/EvolutionViewer');
                const sessionId = `react-agentic-${activeReactAgenticState.activeReactPipeline?.id || 'session'}`;
                openEvolutionViewerFromHistory(activeReactAgenticState.contentHistory, sessionId);
            }
        };

        updateReactAgenticEmbeddedUI(
            reactAgenticUIRoot,
            activeReactAgenticState,
            stopReactAgenticProcess,
            activeReactAgenticState.currentContent,
            (newContent: string) => {
                if (activeReactAgenticState) {
                    activeReactAgenticState.currentContent = newContent;
                }
            },
            handleDownload,
            handleViewEvolutions
        );
    }

    updateControlsState();
}

/**
 * Run the React agent loop
 */
async function runReactAgentLoop() {
    if (!activeReactAgenticState || !globalState.isReactAgenticRunning) return;

    let iterations = 0;
    let consecutiveNoToolCalls = 0;
    const MAX_CONSECUTIVE_NO_TOOL_CALLS = 3;
    let lastLoopError: Error | null = null; // Track consecutive errors

    // Create download handler once for the entire loop
    const handleDownload = async () => {
        if (activeReactAgenticState && activeReactAgenticState.currentContent) {
            if (typeof (window as any).createAndDownloadReactProjectZip === 'function') {
                await (window as any).createAndDownloadReactProjectZip();
            }
        }
    };

    // Create view evolutions handler
    const handleViewEvolutions = async () => {
        if (activeReactAgenticState && activeReactAgenticState.contentHistory && activeReactAgenticState.contentHistory.length > 0) {
            const { openEvolutionViewerFromHistory } = await import('../Components/DiffModal/EvolutionViewer');
            const sessionId = `react-agentic-${activeReactAgenticState.activeReactPipeline?.id || 'session'}`;
            openEvolutionViewerFromHistory(activeReactAgenticState.contentHistory, sessionId);
        } else {
            alert('No content evolution history available yet.');
        }
    };

    // Create content change handler once for the entire loop
    const handleContentChange = (newContent: string) => {
        if (activeReactAgenticState) {
            activeReactAgenticState.currentContent = newContent;
            conversationManager!.updateCurrentContent(newContent);
            if (onContentUpdated) {
                onContentUpdated(newContent, false);
            }
        }
    };

    while (globalState.isReactAgenticRunning && !activeReactAgenticState.isComplete) {
        iterations++;

        try {
            // Update state to show processing
            activeReactAgenticState.isProcessing = true;
            updateReactAgenticEmbeddedUI(
                reactAgenticUIRoot,
                activeReactAgenticState,
                stopReactAgenticProcess,
                activeReactAgenticState.currentContent,
                handleContentChange,
                handleDownload,
                handleViewEvolutions
            );

            // Add placeholder message
            const placeholderIndex = activeReactAgenticState.messages.length;
            activeReactAgenticState.messages.push({
                id: newMsgId('agent'),
                role: 'agent',
                content: '',
                timestamp: Date.now(),
                status: 'processing'
            });
            updateReactAgenticEmbeddedUI(
                reactAgenticUIRoot,
                activeReactAgenticState,
                stopReactAgenticProcess,
                activeReactAgenticState.currentContent,
                handleContentChange,
                handleDownload,
                handleViewEvolutions
            );
            await forceReactAgenticUIRender();

            // Get AI response
            const modelName = activeReactAgenticState.customPromptsReactState?.model_agentic_embedded || getSelectedModel();
            const temperature = getSelectedTemperature();
            const topP = getSelectedTopP();

            const structuredMessages = await conversationManager!.buildStructuredPrompt();
            const systemPrompt = conversationManager!.getSystemPrompt();

            let responseText = '';
            let lastError: Error | null = null;

            // Retry logic
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (abortController?.signal.aborted) {
                    throw new Error('Process stopped by user');
                }

                try {
                    if (attempt > 0) {
                        const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                    const response = await callAI(
                        structuredMessages,
                        temperature,
                        modelName,
                        systemPrompt,
                        false,
                        topP
                    );

                    responseText = extractTextFromAny(response);
                    if (responseText) break;

                    throw new Error('Provider returned empty response');
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    if (attempt === MAX_RETRIES) break;
                }
            }

            if (!responseText) {
                const errMsg = lastError
                    ? `AI call failed: ${lastError.message}`
                    : 'Provider returned an empty response.';

                // Remove placeholder
                activeReactAgenticState.messages.splice(placeholderIndex, 1);

                // Add error message
                activeReactAgenticState.messages.push({
                    id: newMsgId('system'),
                    role: 'system',
                    content: errMsg,
                    timestamp: Date.now(),
                    status: 'error',
                    blocks: [{ kind: 'error', message: errMsg } as SystemBlock]
                });

                activeReactAgenticState.isProcessing = false;
                updateReactAgenticEmbeddedUI(
                    reactAgenticUIRoot,
                    activeReactAgenticState,
                    stopReactAgenticProcess,
                    activeReactAgenticState.currentContent,
                    handleContentChange,
                    handleDownload,
                    handleViewEvolutions
                );
                await forceReactAgenticUIRender();
                continue;
            }

            // Parse response and extract tool calls using the same logic as main Agentic mode
            const parsedResponse = parseAgentResponseWithSegments(responseText);
            const { actions, segments } = parsedResponse;

            // Filter for React-specific tools and standard agentic tools
            const reactSpecificTools = ['StartWorkerAgents', 'CheckBuild'];
            const allActions = actions.filter((action: any) => {
                const actionType = action.type;
                // Allow React-specific tools
                if (reactSpecificTools.includes(actionType)) return true;
                // Allow standard agentic tools
                if (['read_current_content', 'multi_edit', 'Exit'].includes(actionType)) return true;
                return false;
            });

            // Also check for React-specific tools using legacy parsing
            const legacyReactTools = parseReactToolCalls(responseText);
            const reactOnlyTools = legacyReactTools.filter((t: any) => reactSpecificTools.includes(t.type));

            // Combine: React-specific from legacy + standard from main parser
            const combinedActions = [...reactOnlyTools, ...allActions.filter((a: any) => !reactSpecificTools.includes(a.type))];

            // Update placeholder with actual message (using segments from parser)
            activeReactAgenticState.messages[placeholderIndex] = {
                id: newMsgId('agent'),
                role: 'agent',
                content: responseText,
                timestamp: Date.now(),
                status: 'success' as const,
                segments: segments || [],
                toolCalls: combinedActions.length > 0 ? (combinedActions as any) : undefined
            };

            // Add to conversation history
            await conversationManager!.addAgentMessage(responseText);

            // Execute tool calls
            if (combinedActions.length === 0) {
                // No tools executed - warn the agent
                consecutiveNoToolCalls++;

                if (consecutiveNoToolCalls >= MAX_CONSECUTIVE_NO_TOOL_CALLS) {
                    const loopErrorContent = `Agent is stuck in a loop (${consecutiveNoToolCalls} consecutive turns without tool calls). Stopping.`;
                    const loopErrorMsg: AgenticMessage = {
                        id: newMsgId('system'),
                        role: 'system',
                        content: loopErrorContent,
                        timestamp: Date.now(),
                        status: 'error',
                        blocks: [{ kind: 'error', message: loopErrorContent } as SystemBlock]
                    };
                    activeReactAgenticState.messages.push(loopErrorMsg);
                    activeReactAgenticState.isComplete = true;

                    updateReactAgenticEmbeddedUI(
                        reactAgenticUIRoot,
                        activeReactAgenticState,
                        stopReactAgenticProcess,
                        activeReactAgenticState.currentContent,
                        handleContentChange,
                        handleDownload,
                        handleViewEvolutions
                    );
                    await forceReactAgenticUIRender();
                    break;
                }

                const noToolContent = `No tool was executed (attempt ${consecutiveNoToolCalls}/${MAX_CONSECUTIVE_NO_TOOL_CALLS}). You MUST output a tool call. Use: [TOOL_CALL:toolname(...)]`;
                const noToolMsg: AgenticMessage = {
                    id: newMsgId('system'),
                    role: 'system',
                    content: noToolContent,
                    timestamp: Date.now(),
                    status: 'error',
                    blocks: [{ kind: 'error', message: 'No tool was executed. Please use proper tool call syntax.' } as SystemBlock]
                };
                activeReactAgenticState.messages.push(noToolMsg);

                await conversationManager!.addSystemMessage(noToolContent);

                updateReactAgenticEmbeddedUI(
                    reactAgenticUIRoot,
                    activeReactAgenticState,
                    stopReactAgenticProcess,
                    activeReactAgenticState.currentContent,
                    handleContentChange,
                    handleDownload,
                    handleViewEvolutions
                );
                await forceReactAgenticUIRender();
            } else {
                consecutiveNoToolCalls = 0;

                // Execute ONLY the first action (single-tool-per-turn enforcement)
                const toolCall = combinedActions[0] as any;
                let result;
                try {
                    result = await executeReactToolCall(toolCall, activeReactAgenticState);
                } catch (toolError) {
                    const errorMsg = toolError instanceof Error ? toolError.message : String(toolError);
                    console.error('Tool execution error:', toolError);

                    // Add error result as system message
                    const toolErrorMsg: AgenticMessage = {
                        id: newMsgId('system'),
                        role: 'system',
                        content: `[SYSTEM_ERROR: Tool execution failed: ${errorMsg}]`,
                        timestamp: Date.now(),
                        status: 'error',
                        blocks: [{ kind: 'error', message: `Tool execution failed: ${errorMsg}` } as SystemBlock]
                    };
                    activeReactAgenticState.messages.push(toolErrorMsg);

                    // Update UI to show error
                    updateReactAgenticEmbeddedUI(
                        reactAgenticUIRoot,
                        activeReactAgenticState,
                        stopReactAgenticProcess,
                        activeReactAgenticState.currentContent,
                        handleContentChange,
                        handleDownload,
                        handleViewEvolutions
                    );
                    await forceReactAgenticUIRender();

                    // Continue to next iteration to let agent see the error
                    continue;
                }

                // Update content if changed
                if (result.updatedContent) {
                    activeReactAgenticState.currentContent = result.updatedContent;
                    conversationManager!.updateCurrentContent(result.updatedContent);

                    // Add to content history for "View Evolution" tracking
                    // Extract edit count from result message (e.g., "Multi-edit finished: 3 OK, 1 FAIL")
                    const okMatch = result.result.match(/(\d+)\s+OK/);
                    const okCount = okMatch ? parseInt(okMatch[1]) : 1;

                    if (okCount > 0) {
                        activeReactAgenticState.contentHistory = [
                            ...activeReactAgenticState.contentHistory,
                            {
                                content: result.updatedContent,
                                title: `After ${okCount} successful edit${okCount > 1 ? 's' : ''}`,
                                timestamp: Date.now()
                            }
                        ];

                        // Update UI immediately to show new history entry in "View Evolution"
                        updateReactAgenticEmbeddedUI(
                            reactAgenticUIRoot,
                            activeReactAgenticState,
                            stopReactAgenticProcess,
                            activeReactAgenticState.currentContent,
                            handleContentChange,
                            handleDownload,
                            handleViewEvolutions
                        );
                    }

                    // Parse the updated concatenated code back into individual files
                    // and update the worker stages so changes persist
                    try {
                        const updatedFiles = parseFilesFromConcatenatedCode(result.updatedContent);
                        if (activeReactAgenticState.activeReactPipeline && updatedFiles.size > 0) {
                            console.log('[React Agentic] Parsed', updatedFiles.size, 'files from updated content');

                            // Update each stage with its corresponding file content
                            activeReactAgenticState.activeReactPipeline.stages.forEach((stage: any) => {
                                const fileName = stage.title || `Agent${stage.id + 1}Output`;
                                // Try to find matching file in updated content
                                for (const [filePath, fileContent] of updatedFiles.entries()) {
                                    if (filePath.includes(fileName) || fileName.includes(filePath)) {
                                        console.log('[React Agentic] Updated stage:', fileName, 'with file:', filePath);
                                        stage.generatedContent = fileContent;
                                        break;
                                    }
                                }
                            });

                            // Trigger React pipeline UI update to reflect changes in worker tabs
                            if (typeof (window as any).renderReactModePipeline === 'function') {
                                (window as any).renderReactModePipeline();
                            }
                        }
                    } catch (parseError) {
                        console.warn('Could not parse updated content back into files:', parseError);
                        // Continue anyway - the concatenated content is still updated
                    }

                    if (onContentUpdated) {
                        onContentUpdated(result.updatedContent, result.isComplete);
                    }
                }

                // Determine status based on result content
                const hasError = result.result.includes('[SYSTEM_ERROR') || result.result.includes('[BUILD_FAILED');
                const toolStatus: 'success' | 'error' = hasError ? 'error' : 'success';

                // Determine tool name for display
                const toolName = toolCall.type || 'unknown';

                // Add tool result as system message with proper blocks
                const toolResultMsg: AgenticMessage = {
                    id: newMsgId('system'),
                    role: 'system',
                    content: result.result,
                    timestamp: Date.now(),
                    status: toolStatus,
                    blocks: [{
                        kind: hasError ? 'error' : 'tool_result',
                        tool: toolName,
                        result: result.result,
                        message: hasError ? result.result : undefined
                    } as SystemBlock]
                };
                activeReactAgenticState.messages.push(toolResultMsg);

                // Add to conversation history
                await conversationManager!.addSystemMessage(result.result);

                // Update UI after tool execution
                updateReactAgenticEmbeddedUI(
                    reactAgenticUIRoot,
                    activeReactAgenticState,
                    stopReactAgenticProcess,
                    activeReactAgenticState.currentContent,
                    handleContentChange,
                    handleDownload,
                    handleViewEvolutions
                );
                await forceReactAgenticUIRender();

                // Check if complete
                if (result.isComplete) {
                    activeReactAgenticState.isComplete = true;
                    break;
                }
            }

            activeReactAgenticState.isProcessing = false;
            updateReactAgenticEmbeddedUI(
                reactAgenticUIRoot,
                activeReactAgenticState,
                stopReactAgenticProcess,
                activeReactAgenticState.currentContent,
                handleContentChange,
                handleDownload,
                handleViewEvolutions
            );
            await forceReactAgenticUIRender();

        } catch (error) {
            console.error('React agent loop error:', error);
            activeReactAgenticState.isProcessing = false;

            // Add error message with detailed info
            const errorMsg = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error);
            activeReactAgenticState.messages.push({
                id: newMsgId('system'),
                role: 'system',
                content: `[SYSTEM_ERROR: Agent loop encountered an error]\n${errorMsg}`,
                timestamp: Date.now(),
                status: 'error',
                blocks: [{ kind: 'error', message: errorMsg } as SystemBlock]
            });

            const handleDownload = async () => {
                if (activeReactAgenticState && activeReactAgenticState.currentContent) {
                    if (typeof (window as any).createAndDownloadReactProjectZip === 'function') {
                        await (window as any).createAndDownloadReactProjectZip();
                    }
                }
            };

            const handleViewEvolutions = async () => {
                if (activeReactAgenticState && activeReactAgenticState.contentHistory && activeReactAgenticState.contentHistory.length > 0) {
                    const { openEvolutionViewerFromHistory } = await import('../Components/DiffModal/EvolutionViewer');
                    const sessionId = `react-agentic-${activeReactAgenticState.activeReactPipeline?.id || 'session'}`;
                    openEvolutionViewerFromHistory(activeReactAgenticState.contentHistory, sessionId);
                } else {
                    alert('No content evolution history available yet.');
                }
            };

            updateReactAgenticEmbeddedUI(
                reactAgenticUIRoot,
                activeReactAgenticState,
                stopReactAgenticProcess,
                activeReactAgenticState.currentContent,
                (newContent: string) => {
                    if (activeReactAgenticState) {
                        activeReactAgenticState.currentContent = newContent;
                        conversationManager!.updateCurrentContent(newContent);
                        if (onContentUpdated) {
                            onContentUpdated(newContent, false);
                        }
                    }
                },
                handleDownload,
                handleViewEvolutions
            );
            await forceReactAgenticUIRender();

            // Don't break immediately - let the user see the error
            // Only break if we get another error in the next iteration
            if (lastLoopError && lastLoopError.message === errorMsg) {
                break; // Same error twice in a row, stop
            }
            lastLoopError = error instanceof Error ? error : new Error(errorMsg);
        }
    }

    // Cleanup
    isReactAgenticRunning = false;
    updateControlsState();
    if (onContentUpdated && activeReactAgenticState) {
        onContentUpdated(activeReactAgenticState.currentContent, true);
    }
}

/**
 * Re-hydrate UI in a container (reuses existing root if same container)
 */
export function rehydrateReactAgenticUI(container: HTMLElement) {
    console.log('[ReactAgentic] rehydrateReactAgenticUI called', {
        hasState: !!activeReactAgenticState,
        hasContainer: !!container,
        containerId: container?.id
    });
    if (!activeReactAgenticState) {
        console.warn('[ReactAgentic] No active state, skipping rehydration');
        return;
    }

    // Create download handler
    const handleDownload = async () => {
        if (activeReactAgenticState && activeReactAgenticState.currentContent) {
            if (typeof (window as any).createAndDownloadReactProjectZip === 'function') {
                await (window as any).createAndDownloadReactProjectZip();
            }
        }
    };

    // Create view evolutions handler
    const handleViewEvolutions = async () => {
        if (activeReactAgenticState && activeReactAgenticState.contentHistory && activeReactAgenticState.contentHistory.length > 0) {
            const { openEvolutionViewerFromHistory } = await import('../Components/DiffModal/EvolutionViewer');
            const sessionId = `react-agentic-${activeReactAgenticState.activeReactPipeline?.id || 'session'}`;
            openEvolutionViewerFromHistory(activeReactAgenticState.contentHistory, sessionId);
        } else {
            alert('No content evolution history available yet.');
        }
    };

    // If we already have a root for this container, just update it
    if (reactAgenticUIRoot && reactAgenticUIContainer === container) {
        updateReactAgenticEmbeddedUI(
            reactAgenticUIRoot,
            activeReactAgenticState,
            stopReactAgenticProcess,
            activeReactAgenticState.currentContent,
            (newContent: string) => {
                if (activeReactAgenticState) {
                    activeReactAgenticState.currentContent = newContent;
                    if (conversationManager) {
                        conversationManager.updateCurrentContent(newContent);
                    }
                    if (onContentUpdated) {
                        onContentUpdated(newContent, false);
                    }
                }
            },
            handleDownload,
            handleViewEvolutions
        );
    } else {
        // New container or first render - create new root
        reactAgenticUIContainer = container;
        reactAgenticUIRoot = renderReactAgenticEmbeddedUI(
            container,
            activeReactAgenticState,
            stopReactAgenticProcess,
            activeReactAgenticState.currentContent,
            (newContent: string) => {
                if (activeReactAgenticState) {
                    activeReactAgenticState.currentContent = newContent;
                    if (conversationManager) {
                        conversationManager.updateCurrentContent(newContent);
                    }
                    if (onContentUpdated) {
                        onContentUpdated(newContent, false);
                    }
                }
            },
            handleDownload,
            handleViewEvolutions
        );
    }
}

/**
 * Set active state for import
 */
export function setActiveReactAgenticStateForImport(state: ReactAgenticState) {
    console.log('[ReactAgentic] setActiveReactAgenticStateForImport called', {
        hasMessages: !!state.messages,
        messageCount: state.messages?.length,
        hasCurrentContent: !!state.currentContent
    });
    activeReactAgenticState = state;
    // Re-initialize conversation manager with imported messages
    if (state.messages) {
        conversationManager = new AgenticConversationManager(
            state.originalContent || state.currentContent || '',
            REACT_AGENTIC_SYSTEM_PROMPT
        );
        // We might need to manually restore messages if the manager doesn't accept them in constructor
        // But for now, just ensuring the state variable is set is the critical part
    }
}

/**
 * Get active state for export
 */
export function getActiveReactAgenticState(): ReactAgenticState | null {
    return activeReactAgenticState;
}
