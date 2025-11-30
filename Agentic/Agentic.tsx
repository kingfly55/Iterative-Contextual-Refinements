/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    createInitialState,
    parseAgentResponseWithSegments,
    applyDiffCommand,
    executeToolCall,
    AgenticState,
    AgenticMessage,
    DiffCommand,
    ToolCall,
    SystemBlock,
    ResponseSegment,
    extractTextFromAny,
    AgenticConversationManager
} from './AgenticCoreLangchain';
import { AGENTIC_SYSTEM_PROMPT, VERIFIER_SYSTEM_PROMPT } from './AgenticModePrompt';
import type { AgenticPrompts } from './AgenticPromptsManager';
import { AgenticPromptsManager } from './AgenticPromptsManager';
import { renderAgenticUI, updateAgenticUI, forceUIRender } from './AgenticUI';
import { callAI, getSelectedModel, getSelectedTemperature, getSelectedTopP } from '../Routing';
import { globalState } from '../Core/State';

import { updateControlsState } from '../UI/Controls';

// Constants for retry logic (matching index.tsx pattern)
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000; // 20 seconds
const BACKOFF_FACTOR = 2;

// Global state for Agentic mode
let activeAgenticState: (AgenticState & { conversationManager?: AgenticConversationManager }) | null = null;
let agenticUIRoot: any = null;
// isAgenticRunning is now in globalState
let abortController: AbortController | null = null;
let agenticPromptsManager: AgenticPromptsManager | null = null;
let onContentUpdated: ((content: string, isComplete?: boolean) => void) | null = null;
let conversationManager: AgenticConversationManager | null = null;

// Stable ID generator for messages
function newMsgId(prefix: string = 'msg'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Initialize Agentic mode
export function initializeAgenticMode(promptsManager?: AgenticPromptsManager) {
    // Agentic mode option is now directly in HTML
    // This function can be used for any additional initialization if needed
    if (promptsManager) {
        agenticPromptsManager = promptsManager;
    }
}

// Allow host to receive updates whenever currentContent changes
export function setAgenticContentUpdateCallback(cb: ((content: string, isComplete?: boolean) => void) | null) {
    onContentUpdated = cb;
}

// Render Agentic mode UI
export function renderAgenticMode() {
    const container = document.getElementById('pipelines-content-container');
    const tabsContainer = document.getElementById('tabs-nav-container');

    if (!container || !tabsContainer) return;

    // Clear existing content and hide tabs for Agentic mode
    tabsContainer.innerHTML = '';
    container.innerHTML = '';

    // Add Agentic tab
    tabsContainer.innerHTML = `
        <div class="tab-button agentic-mode-tab active">
            Agentic Refinement
        </div>
    `;


    // Create container for Agentic UI
    const agenticContainer = document.createElement('div');
    agenticContainer.id = 'agentic-container';
    agenticContainer.className = 'pipeline-content active';
    agenticContainer.style.height = '100%';
    container.appendChild(agenticContainer);

    // If there's no active state, show empty container
    if (!activeAgenticState) {
        agenticContainer.innerHTML = '';
        return;
    }

    // Render the Agentic UI
    if (!agenticUIRoot) {
        agenticUIRoot = renderAgenticUI(agenticContainer, activeAgenticState as AgenticState, stopAgenticProcess);
    } else {
        updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
    }
}

// Start Agentic process
export async function startAgenticProcess(initialContent: string) {
    console.log('[Agentic] startAgenticProcess called', { initialContentLength: initialContent?.length, isAgenticRunning: globalState.isAgenticRunning });
    if (!initialContent || globalState.isAgenticRunning) {
        console.warn('[Agentic] startAgenticProcess aborted: missing content or already running');
        return;
    }

    // Get system prompt
    let systemPrompt = AGENTIC_SYSTEM_PROMPT;
    if (agenticPromptsManager) {
        const agenticPrompts = agenticPromptsManager.getAgenticPrompts();
        if (agenticPrompts.systemPrompt) {
            systemPrompt = agenticPrompts.systemPrompt;
        }
    }

    // Create Langchain conversation manager
    conversationManager = new AgenticConversationManager(
        initialContent,
        systemPrompt,
        VERIFIER_SYSTEM_PROMPT
    );

    // Create initial state
    activeAgenticState = createInitialState(initialContent);
    activeAgenticState.conversationManager = conversationManager;

    if (onContentUpdated) {
        try { onContentUpdated(activeAgenticState.currentContent); } catch { /* no-op */ }
    }
    globalState.isAgenticRunning = true;
    globalState.isGenerating = true; // Fix: Ensure UI knows we are generating
    updateControlsState();
    abortController = new AbortController();

    // Render initial UI
    renderAgenticMode();

    // Start the agent loop
    await runAgentLoop();
}

// Start Agentic process inside a provided container (embedded usage in other modes)
export async function startAgenticProcessInContainer(container: HTMLElement, initialContent: string, promptsOverride?: AgenticPrompts) {
    if (!initialContent || globalState.isAgenticRunning) return;

    // Always reinitialize prompts manager for embedded mode to ensure correct parsing
    agenticPromptsManager = new AgenticPromptsManager({
        current: promptsOverride ? { ...promptsOverride } : {
            systemPrompt: AGENTIC_SYSTEM_PROMPT,
            verifierPrompt: VERIFIER_SYSTEM_PROMPT
        }
    });

    // Get system prompt
    const systemPrompt = promptsOverride?.systemPrompt || AGENTIC_SYSTEM_PROMPT;
    const verifierPrompt = promptsOverride?.verifierPrompt || VERIFIER_SYSTEM_PROMPT;

    // Create Langchain conversation manager
    conversationManager = new AgenticConversationManager(
        initialContent,
        systemPrompt,
        verifierPrompt
    );

    // Initialize state
    activeAgenticState = createInitialState(initialContent);
    activeAgenticState.conversationManager = conversationManager;

    if (onContentUpdated) {
        try { onContentUpdated(activeAgenticState.currentContent); } catch { /* no-op */ }
    }
    globalState.isAgenticRunning = true;
    updateControlsState();
    abortController = new AbortController();

    // Mount Agentic UI into the provided container and run
    agenticUIRoot = renderAgenticUI(container, activeAgenticState as AgenticState, stopAgenticProcess);
    await runAgentLoop();
}

// Re-mount Agentic UI into a new container without restarting the loop/state
export function rehydrateAgenticUIInContainer(container: HTMLElement) {
    if (!activeAgenticState) return;
    agenticUIRoot = renderAgenticUI(container, activeAgenticState as AgenticState, stopAgenticProcess);
    updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
}

// Run the agent loop
async function runAgentLoop() {
    if (!activeAgenticState || !globalState.isAgenticRunning) return;

    // No artificial iteration limits - let the agent work
    let iterations = 0;
    let consecutiveNoToolCalls = 0;  // Track consecutive failures to detect loops
    const MAX_CONSECUTIVE_NO_TOOL_CALLS = 3;  // Stop after 3 consecutive failures

    // Force a paint break to ensure UI updates are visible
    const flushUI = async () => {
        // updateAgenticUI uses flushSync. We follow up with two
        // requestAnimationFrames to ensure the browser has painted the changes.
        await forceUIRender();
    };

    while (globalState.isAgenticRunning && !(activeAgenticState as AgenticState).isComplete) {
        iterations++;

        try {
            // Update state to show processing
            activeAgenticState = {
                ...(activeAgenticState as AgenticState),
                isProcessing: true
            };
            updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);

            // Insert a lightweight placeholder agent message to reserve layout and
            // avoid a large UI flush when the real response arrives (handles slow/fast models uniformly)
            const placeholderIndex = (activeAgenticState as AgenticState).messages.length;
            activeAgenticState = {
                ...(activeAgenticState as AgenticState),
                messages: [
                    ...(activeAgenticState as AgenticState).messages,
                    {
                        id: newMsgId('agent'),
                        role: 'agent' as const,
                        content: '',
                        timestamp: Date.now(),
                        status: 'processing' as const
                    }
                ]
            };
            updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
            await flushUI();

            // No timers - let the actual content show immediately

            // Get model settings (use global sliders for Agentic mode)
            let modelName = getSelectedModel();
            let temperature = getSelectedTemperature();
            const topP = getSelectedTopP();

            // Get custom model if available
            if (agenticPromptsManager) {
                const agenticPrompts = agenticPromptsManager.getAgenticPrompts();
                if (agenticPrompts.model) {
                    modelName = agenticPrompts.model;
                }
            }

            // Build conversation history using Langchain manager
            if (!conversationManager) {
                throw new Error('Conversation manager not initialized');
            }

            const systemPrompt = conversationManager.getSystemPrompt();
            const structuredMessages = await conversationManager.buildStructuredPrompt();

            // Call AI with retry logic (matching index.tsx pattern)
            let response: any = null;
            let responseText = '';
            let lastError: Error | null = null;

            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (abortController?.signal.aborted) {
                    throw new Error('Process stopped by user');
                }

                try {
                    // Add exponential backoff delay for retries
                    if (attempt > 0) {
                        const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }

                    // For structured messages, pass systemPrompt so providers can handle it appropriately
                    // Providers will decide whether to add it separately or combine with structured messages
                    response = await callAI(
                        structuredMessages,
                        temperature,
                        modelName,
                        systemPrompt,
                        false,
                        topP
                    );

                    responseText = extractTextFromAny(response);

                    // Success - break out of retry loop
                    if (responseText) {
                        break;
                    }

                    // Empty response - treat as error for retry
                    throw new Error('Provider returned empty response');

                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`Agentic AI call attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);

                    // If this was the last attempt, we'll handle it below
                    if (attempt === MAX_RETRIES) {
                        break;
                    }
                }
            }
            // Handle failure after all retries
            if (!responseText) {
                const errMsg = lastError
                    ? `AI call failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`
                    : 'Provider returned an empty response after all retries.';

                // Remove placeholder if it's still present
                {
                    const st = activeAgenticState as AgenticState;
                    const msgs: AgenticMessage[] = [...st.messages];
                    const idx = Math.min(placeholderIndex, msgs.length - 1);
                    const ph = msgs[idx];
                    if (ph && ph.role === 'agent' && ph.status === 'processing' && (!ph.segments || ph.segments.length === 0)) {
                        msgs.splice(idx, 1);
                        activeAgenticState = { ...(st), messages: msgs };
                    }
                }
                activeAgenticState = {
                    ...(activeAgenticState as AgenticState),
                    isProcessing: false,
                    messages: [...(activeAgenticState as AgenticState).messages, {
                        id: newMsgId('system'),
                        role: 'system',
                        content: errMsg,
                        timestamp: Date.now(),
                        status: 'error',
                        blocks: [{ kind: 'error', message: errMsg } as SystemBlock]
                    }]
                };
                updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
                await flushUI();
                continue;
            }

            // Parse actions from raw response with segments for efficient UI rendering
            let actions: Array<DiffCommand | ToolCall> = [];
            let segments: ResponseSegment[] = [];
            try {
                const parsedResponse = parseAgentResponseWithSegments(responseText);
                actions = parsedResponse.actions;
                segments = parsedResponse.segments;
            } catch (parseErr) {
                // Fallback: treat entire response as a single text segment to avoid any UI parsing issues
                actions = [];
                segments = [{ kind: 'text', text: responseText }];
            }
            // Sanitize: allow at most one tool call. Drop subsequent tool segments to avoid duplicate counting.
            {
                let toolSeen = false;
                const isDiffType = (t: any) => t === 'search_and_replace' || t === 'delete' || t === 'insert_before' || t === 'insert_after';
                const sanitizedActions: Array<DiffCommand | ToolCall> = [];
                for (const a of actions) {
                    const t = (a as any).type;
                    const isDiff = isDiffType(t);
                    if (isDiff) {
                        sanitizedActions.push(a);
                    } else if (!toolSeen) {
                        sanitizedActions.push(a);
                        toolSeen = true;
                    }
                }
                let segToolSeen = false;
                const sanitizedSegments: ResponseSegment[] = [];
                for (const s of segments) {
                    if (s.kind !== 'tool') {
                        sanitizedSegments.push(s);
                    } else if (!segToolSeen) {
                        sanitizedSegments.push(s);
                        segToolSeen = true;
                    }
                }
                actions = sanitizedActions;
                segments = sanitizedSegments;
            }
            const commands: DiffCommand[] = actions.filter(a => 'params' in a && (a.type === 'search_and_replace' || a.type === 'delete' || a.type === 'insert_before' || a.type === 'insert_after')) as DiffCommand[];
            const toolCalls: ToolCall[] = actions.filter(a =>
                a.type === 'read_current_content' ||
                a.type === 'verify_current_content' ||
                a.type === 'Exit' ||
                a.type === 'multi_edit'
            ) as ToolCall[];

            // Add agent message to Langchain history
            // CRITICAL: We MUST include the full response with tool syntax!
            // The agent needs to see its own tool calls to learn the pattern
            if (conversationManager) {
                await conversationManager.addAgentMessage(responseText);
            }

            // Replace the placeholder agent message with the parsed response,
            // avoiding an additional append/flush and preventing legacy fallbacks
            {
                // Extract narrative text for UI display (no tool syntax)
                const narrativeText = segments
                    .filter(seg => seg.kind === 'text')
                    .map(seg => (seg as any).text)
                    .join('\n')
                    .trim();

                const msgs: AgenticMessage[] = [...(activeAgenticState as AgenticState).messages];
                const idx = Math.min(placeholderIndex, msgs.length - 1);
                const last = msgs[idx];
                if (last && last.role === 'agent' && last.status === 'processing' && !last.segments) {
                    msgs[idx] = {
                        id: last.id,
                        role: 'agent',
                        content: narrativeText || responseText,  // Use narrative, fallback to full if empty
                        timestamp: last.timestamp,
                        status: 'processing',
                        commands: commands.length ? commands : undefined,
                        toolCalls: toolCalls.length ? toolCalls : undefined,
                        segments: segments.length > 0 ? segments : undefined  // Only set if we have segments
                    };
                } else {
                    // Fallback: append if placeholder was not found as expected
                    msgs.push({
                        id: newMsgId('agent'),
                        role: 'agent',
                        content: narrativeText || responseText,  // Use narrative, fallback to full if empty
                        timestamp: Date.now(),
                        status: 'processing',
                        commands: commands.length ? commands : undefined,
                        toolCalls: toolCalls.length ? toolCalls : undefined,
                        segments: segments.length > 0 ? segments : undefined  // Only set if we have segments
                    });
                }
                activeAgenticState = { ...(activeAgenticState as AgenticState), messages: msgs };
            }
            updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
            await flushUI();

            // No timers to clear

            // Execute first action only (single-tool-per-turn enforcement)
            if (actions.length === 0) {
                // CRITICAL: Model generated response with NO tool calls
                consecutiveNoToolCalls++;

                // Check if we're in an infinite loop
                if (consecutiveNoToolCalls >= MAX_CONSECUTIVE_NO_TOOL_CALLS) {
                    const loopErrorContent = `Agent is stuck in a loop (${consecutiveNoToolCalls} consecutive turns without tool calls). Stopping to prevent infinite loop. The agent may be confused or context window may be full.`;
                    const loopErrorMsg: AgenticMessage = {
                        id: newMsgId('system'),
                        role: 'system',
                        content: loopErrorContent,
                        timestamp: Date.now(),
                        status: 'error',
                        blocks: [{ kind: 'error', message: loopErrorContent }]
                    };
                    activeAgenticState = {
                        ...(activeAgenticState as AgenticState),
                        messages: [...(activeAgenticState as AgenticState).messages, loopErrorMsg],
                        isComplete: true,
                        isProcessing: false
                    };
                    updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
                    await flushUI();
                    break;  // Exit the loop
                }

                const noToolContent = `No tool was executed (attempt ${consecutiveNoToolCalls}/${MAX_CONSECUTIVE_NO_TOOL_CALLS}). You MUST output a tool call on the final line. Use: [TOOL_CALL:toolname(...)]`;
                const noToolMsg: AgenticMessage = {
                    id: newMsgId('system'),
                    role: 'system',
                    content: noToolContent,
                    timestamp: Date.now(),
                    status: 'error',
                    blocks: [{ kind: 'error', message: 'No tool was executed. Please use proper tool call syntax.' }]
                };
                activeAgenticState = {
                    ...(activeAgenticState as AgenticState),
                    messages: [...(activeAgenticState as AgenticState).messages, noToolMsg]
                };

                // Add to Langchain history
                if (conversationManager) {
                    await conversationManager.addSystemMessage(noToolContent);
                }
            } else {
                // Reset counter on successful tool call
                consecutiveNoToolCalls = 0;
                // Execute ONLY the first action
                const action = actions[0];
                const toolCall = action as ToolCall;

                // Handle multi_edit tool
                if ((toolCall as any).type === 'multi_edit') {
                    const ops = ((toolCall as any).operations as DiffCommand[]) || [];

                    if (!ops.length) {
                        const resultText = 'Multi-edit finished: 0 OK, 0 FAIL\nNo operations were provided in multi_edit()';
                        const systemMsg: AgenticMessage = {
                            id: newMsgId('system'),
                            role: 'system',
                            content: `[TOOL_RESULT:multi_edit]\n${resultText}`,
                            timestamp: Date.now(),
                            status: 'error',
                            blocks: [{ kind: 'tool_result', tool: 'multi_edit', result: resultText }]
                        };
                        activeAgenticState = {
                            ...(activeAgenticState as AgenticState),
                            messages: [...(activeAgenticState as AgenticState).messages, systemMsg]
                        };

                        // Add to Langchain history
                        if (conversationManager) {
                            await conversationManager.addSystemMessage(resultText);
                        }
                    } else {
                        const logs: string[] = [];
                        const logsForHistory: string[] = [];  // Minimal logs for model context
                        let okCount = 0;
                        let failCount = 0;

                        // Apply all operations inside multi_edit
                        for (let i = 0; i < ops.length; i++) {
                            const op = ops[i];
                            const res = applyDiffCommand((activeAgenticState as AgenticState).currentContent, op);
                            activeAgenticState = {
                                ...(activeAgenticState as AgenticState),
                                currentContent: res.result
                            };

                            // Update Langchain conversation manager with new content
                            if (conversationManager) {
                                conversationManager.updateCurrentContent(res.result);
                            }

                            if (onContentUpdated) {
                                try { onContentUpdated((activeAgenticState as AgenticState).currentContent); } catch { /* no-op */ }
                            }
                            if (res.success) {
                                // Full details for UI display
                                logs.push(`OK ${op.type}(${op.params.map(p => '"' + p + '"').join(', ')})`);
                                // Minimal for model context (no parameters)
                                logsForHistory.push(`OK ${op.type}`);
                                okCount++;
                            } else {
                                // Full error for UI display
                                logs.push(`FAIL ${op.type}: ${res.error}`);
                                // Minimal error for model context
                                logsForHistory.push(`FAIL ${op.type}: ${res.error}`);
                                failCount++;
                            }
                        }

                        // Add to content history after multi_edit completes (if there were successful edits)
                        if (okCount > 0) {
                            activeAgenticState = {
                                ...(activeAgenticState as AgenticState),
                                contentHistory: [
                                    ...(activeAgenticState as AgenticState).contentHistory,
                                    {
                                        content: (activeAgenticState as AgenticState).currentContent,
                                        title: `After ${okCount} successful edit${okCount > 1 ? 's' : ''}`,
                                        timestamp: Date.now()
                                    }
                                ]
                            };
                        }

                        const summary = `Multi-edit finished: ${okCount} OK, ${failCount} FAIL`;
                        const resultBody = [summary, ...logs].join('\n');
                        const resultBodyForHistory = [summary, ...logsForHistory].join('\n');

                        const systemMsg: AgenticMessage = {
                            id: newMsgId('system'),
                            role: 'system',
                            content: `[TOOL_RESULT:multi_edit]\n${resultBody}`,
                            timestamp: Date.now(),
                            status: failCount > 0 ? 'error' : 'success',
                            blocks: [{ kind: 'tool_result', tool: 'multi_edit', result: resultBody }]
                        };
                        activeAgenticState = {
                            ...(activeAgenticState as AgenticState),
                            messages: [...(activeAgenticState as AgenticState).messages, systemMsg]
                        };

                        // Add MINIMAL version to Langchain history (saves context)
                        if (conversationManager) {
                            await conversationManager.addSystemMessage(resultBodyForHistory);
                        }
                    }
                }
                // Handle Exit tool
                else if ((toolCall as any).type === 'Exit') {
                    activeAgenticState = {
                        ...(activeAgenticState as AgenticState),
                        isComplete: true
                    };
                    const exitMessage = 'Agent has completed the refinement process.';
                    const systemMsg: AgenticMessage = {
                        id: newMsgId('system'),
                        role: 'system',
                        content: exitMessage,
                        timestamp: Date.now(),
                        status: 'success',
                        blocks: [{ kind: 'tool_result', tool: 'Exit', result: exitMessage }]
                    };
                    activeAgenticState = {
                        ...(activeAgenticState as AgenticState),
                        messages: [...(activeAgenticState as AgenticState).messages, systemMsg]
                    };

                    // Add to Langchain history
                    if (conversationManager) {
                        await conversationManager.addSystemMessage(exitMessage);
                    }

                    if (onContentUpdated) {
                        try { onContentUpdated((activeAgenticState as AgenticState).currentContent, true); } catch { /* no-op */ }
                    }
                }
                // Handle other tools (read_current_content, verify_current_content, etc.)
                else {
                    if (!conversationManager) {
                        throw new Error('Conversation manager not initialized');
                    }

                    const result = await executeToolCall(
                        (activeAgenticState as AgenticState).currentContent,
                        toolCall as any,
                        modelName,
                        conversationManager
                    );

                    const toolType = (toolCall as any).type;
                    const isError = result.startsWith('[TOOL_ERROR:') || result.startsWith('[VERIFIER_ERROR:');
                    const systemContent = isError ? `Your tool call failed. Reason: ${result}` : result;
                    const systemMsg: AgenticMessage = {
                        id: newMsgId('system'),
                        role: 'system',
                        content: isError ? systemContent : `[TOOL_RESULT:${toolType}]\n${result}`,
                        timestamp: Date.now(),
                        status: isError ? 'error' : 'success',
                        blocks: [isError ? { kind: 'error', message: result } : { kind: 'tool_result', tool: toolType, result, toolCall: toolCall as any }]
                    };
                    activeAgenticState = {
                        ...(activeAgenticState as AgenticState),
                        messages: [...(activeAgenticState as AgenticState).messages, systemMsg]
                    };

                    // Add to Langchain history
                    if (conversationManager) {
                        await conversationManager.addSystemMessage(systemContent);
                    }
                }

                // Add warning if multiple tools were detected
                if (actions.length > 1) {
                    const firstToolName = (actions[0] as any).type;
                    const warningContent = `First tool executed: ${firstToolName}. All other tools were ignored. Only one tool use is allowed per single response.`;
                    const warningMsg: AgenticMessage = {
                        id: newMsgId('system'),
                        role: 'system',
                        content: warningContent,
                        timestamp: Date.now(),
                        status: 'success',
                        blocks: [{ kind: 'error', message: `Only the first tool (${firstToolName}) was executed. ${actions.length - 1} other tool(s) were ignored.` }]
                    };
                    activeAgenticState = {
                        ...(activeAgenticState as AgenticState),
                        messages: [...(activeAgenticState as AgenticState).messages, warningMsg]
                    };

                    // Add to Langchain history
                    if (conversationManager) {
                        await conversationManager.addSystemMessage(warningContent);
                    }
                }
            }

            // Mark as not processing after all actions complete
            activeAgenticState = {
                ...(activeAgenticState as AgenticState),
                isProcessing: false
            };

            // Single final UI update for this iteration with all changes
            updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
            await flushUI();

            // No artificial delay - let the agent work at natural pace

        } catch (error) {
            console.error('Agent loop error:', error);

            // Remove placeholder if present before showing error
            const st = activeAgenticState as AgenticState;
            const msgs = [...st.messages];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === 'agent' && lastMsg.status === 'processing' && !lastMsg.segments) {
                msgs.pop();
            }

            activeAgenticState = {
                ...(activeAgenticState as AgenticState),
                messages: msgs,
                isProcessing: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
            updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
            await flushUI();
        }

        // Check abort signal
        if (abortController?.signal.aborted) {
            break;
        }
    }
    // No iteration limit to check

    globalState.isAgenticRunning = false;
    globalState.isGenerating = false; // Fix: Reset generating state
    updateControlsState();
}

// Note: buildConversationHistory is now handled by AgenticConversationManager from Langchain

// Stop the Agentic process
export function stopAgenticProcess() {
    console.log('[Agentic] stopAgenticProcess called');
    globalState.isAgenticRunning = false;
    globalState.isGenerating = false; // Fix: Reset generating state
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    updateControlsState();

    if (activeAgenticState) {
        activeAgenticState = {
            ...activeAgenticState,
            isProcessing: false,
            isComplete: true
        };
        updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
    }
}

// Clean up Agentic mode
export function cleanupAgenticMode() {
    stopAgenticProcess();
    activeAgenticState = null;
    agenticUIRoot = null;
    conversationManager = null;
}

// Export state getter for integration
export function getActiveAgenticState(): AgenticState | null {
    return activeAgenticState;
}

// Check if Agentic mode is active
export function isAgenticModeActive(): boolean {
    return globalState.isAgenticRunning;
}

// Set the prompts manager
export function setAgenticPromptsManager(manager: AgenticPromptsManager): void {
    agenticPromptsManager = manager;
}

// Set active state for import
export function setActiveAgenticStateForImport(state: AgenticState): void {
    activeAgenticState = {
        ...state,
        isProcessing: false
    };

    // Re-render the UI with the imported state
    if (agenticUIRoot && activeAgenticState) {
        updateAgenticUI(agenticUIRoot, activeAgenticState as AgenticState, stopAgenticProcess);
    }
}
