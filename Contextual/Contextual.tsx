/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ContextualState,
    MainGeneratorHistoryManager,
    IterativeAgentHistoryManager,
    MemoryAgentHistoryManager,
    StrategicPoolAgentHistoryManager,
    createInitialContextualState,
    newMessageId,
    ContextualMessage,
    IterationData,
    ContextualSystemBlock
} from './ContextualCore';
import { CustomizablePromptsContextual } from './ContextualPrompts';
import { renderContextualUI, updateContextualUI } from './ContextualUI';
import { callAI, getSelectedModel, getSelectedTemperature, getSelectedTopP } from '../Routing';
import { updateControlsState } from '../index';

// Global state
let activeContextualState: ContextualState | null = null;
let contextualUIRoot: any = null;
let isContextualRunning = false;
let abortController: AbortController | null = null;
let mainGeneratorManager: MainGeneratorHistoryManager | null = null;
let iterativeAgentManager: IterativeAgentHistoryManager | null = null;
let memoryAgentManager: MemoryAgentHistoryManager | null = null;
let strategicPoolAgentManager: StrategicPoolAgentHistoryManager | null = null;
let contextualCustomPrompts: CustomizablePromptsContextual | null = null;
let onContentUpdated: ((content: string) => void) | null = null;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 20000;
const BACKOFF_FACTOR = 4;

// Thinking configuration with dummy tool to enable thought signatures
// This tool is never actually called - it just enables Gemini to generate thought signatures
const THINKING_CONFIG = {
    thinkingBudget: -1,  // Dynamic thinking - model adjusts based on complexity
    tools: [{
        functionDeclarations: [{
            name: "internal_reasoning_continuation",
            description: "Internal marker for reasoning continuation across conversation turns",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }]
    }]
};

export function setContextualContentUpdateCallback(cb: ((content: string) => void) | null) {
    onContentUpdated = cb;
}

export function renderContextualMode() {
    const container = document.getElementById('pipelines-content-container');
    const tabsContainer = document.getElementById('tabs-nav-container');
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;

    if (!container || !tabsContainer) return;

    // Clear both containers
    tabsContainer.innerHTML = '';
    container.innerHTML = '';

    // Hide entire header section for Contextual mode (no tabs/header needed)
    if (mainHeaderContent) {
        mainHeaderContent.style.display = 'none';
    }

    const contextualContainer = document.createElement('div');
    contextualContainer.id = 'contextual-container';
    contextualContainer.className = 'pipeline-content active';
    contextualContainer.style.height = '100%';
    container.appendChild(contextualContainer);

    if (!activeContextualState) {
        contextualContainer.innerHTML = '';
        return;
    }

    if (!contextualUIRoot) {
        contextualUIRoot = renderContextualUI(contextualContainer, activeContextualState, stopContextualProcess);
    } else {
        updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
    }
}

export async function startContextualProcess(initialUserRequest: string, customPrompts: CustomizablePromptsContextual) {
    if (!initialUserRequest || isContextualRunning) return;

    // Store custom prompts for use in helper functions
    contextualCustomPrompts = customPrompts;

    activeContextualState = createInitialContextualState(initialUserRequest);
    activeContextualState.isRunning = true;
    isContextualRunning = true;
    updateControlsState();
    abortController = new AbortController();

    mainGeneratorManager = new MainGeneratorHistoryManager(
        contextualCustomPrompts.sys_contextual_mainGenerator,
        initialUserRequest
    );

    // Set up memory agent callback for main generator
    mainGeneratorManager.setMemoryAgentCallback(callMemoryAgentForCondense);

    renderContextualMode();

    await runContextualLoop();
}

export function stopContextualProcess() {
    if (abortController) {
        abortController.abort();
    }
    isContextualRunning = false;
    if (activeContextualState) {
        activeContextualState.isRunning = false;
        activeContextualState.isProcessing = false;
    }
    updateControlsState();
    if (contextualUIRoot && activeContextualState) {
        updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
    }
}

export function getContextualState(): ContextualState | null {
    return activeContextualState;
}

export function setContextualStateForImport(state: ContextualState | null) {
    activeContextualState = state;
    if (state) {
        state.isRunning = false;
        state.isProcessing = false;
    }
    isContextualRunning = false;
    contextualUIRoot = null;
}

async function runContextualLoop() {
    if (!activeContextualState || !isContextualRunning || !mainGeneratorManager) return;

    while (isContextualRunning && activeContextualState) {
        try {
            // Check if we should stop before starting new iteration
            if (!isContextualRunning || abortController?.signal.aborted) {
                break;
            }

            activeContextualState.isProcessing = true;
            activeContextualState.iterationCount++;
            updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);

            // Step 1: Main Generator Agent generates
            const mainGenerationResult = await callMainGeneratorAgent();

            if (!mainGenerationResult || abortController?.signal.aborted || !isContextualRunning) {
                break;
            }

            const mainGeneration = mainGenerationResult.text;
            const mainGenGeminiContent = mainGenerationResult.geminiContent;

            // Store initial generation if this is the first iteration
            if (activeContextualState.iterationCount === 1) {
                activeContextualState.initialMainGeneration = mainGeneration;
                mainGeneratorManager.setInitialGeneration(mainGeneration);

                // Initialize iterative agent manager after first generation
                iterativeAgentManager = new IterativeAgentHistoryManager(
                    contextualCustomPrompts!.sys_contextual_iterativeAgent,
                    activeContextualState.initialUserRequest,
                    mainGeneration
                );

                // Set up memory agent callback for iterative agent
                iterativeAgentManager.setMemoryAgentCallback(callMemoryAgentForCondense);

                // Initialize memory agent manager
                memoryAgentManager = new MemoryAgentHistoryManager(
                    contextualCustomPrompts!.sys_contextual_memoryAgent,
                    activeContextualState.initialUserRequest,
                    mainGeneration
                );

                // Initialize strategic pool agent manager
                strategicPoolAgentManager = new StrategicPoolAgentHistoryManager(
                    contextualCustomPrompts!.sys_contextual_solutionPoolAgent,
                    activeContextualState.initialUserRequest,
                    mainGeneration
                );
            }

            // Update current best generation
            activeContextualState.currentBestGeneration = mainGeneration;

            // Add to content history
            activeContextualState.contentHistory.push({
                content: mainGeneration,
                title: `Iteration ${activeContextualState.iterationCount} - Main Generation`,
                timestamp: Date.now()
            });

            // Add main generator message
            const mainMsg: ContextualMessage = {
                id: newMessageId('main'),
                role: 'main_generator',
                content: mainGeneration,
                timestamp: Date.now(),
                iterationNumber: activeContextualState.iterationCount
            };
            activeContextualState.messages.push(mainMsg);

            // Add to history with Gemini content for thought signature preservation
            await mainGeneratorManager.addGeneration(mainGeneration, activeContextualState.iterationCount, mainGenGeminiContent);

            if (onContentUpdated) {
                try { onContentUpdated(mainGeneration); } catch { }
            }

            updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);

            if (abortController?.signal.aborted || !isContextualRunning) break;

            // Step 2: Iterative Agent provides suggestions
            if (!iterativeAgentManager) {
                throw new Error('Iterative agent manager not initialized');
            }

            const suggestionsResult = await callIterativeAgent(mainGeneration);

            if (!suggestionsResult || abortController?.signal.aborted || !isContextualRunning) {
                break;
            }

            const suggestions = suggestionsResult.text;
            const suggestionsGeminiContent = suggestionsResult.geminiContent;

            // Store suggestions (critique)
            activeContextualState.currentBestSuggestions = suggestions;
            activeContextualState.allIterativeSuggestions.push(suggestions);

            // Add iterative agent message
            const iterMsg: ContextualMessage = {
                id: newMessageId('iter'),
                role: 'iterative_agent',
                content: suggestions,
                timestamp: Date.now(),
                iterationNumber: activeContextualState.iterationCount
            };
            activeContextualState.messages.push(iterMsg);

            updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);

            if (abortController?.signal.aborted || !isContextualRunning) break;

            // Step 3: Strategic Pool Agent generates strategies (after first iteration)
            if (!strategicPoolAgentManager) {
                throw new Error('Strategic pool agent manager not initialized');
            }

            const strategicPoolResult = await callStrategicPoolAgent(mainGeneration, suggestions);

            if (!strategicPoolResult || abortController?.signal.aborted || !isContextualRunning) {
                break;
            }

            const strategicPool = strategicPoolResult.text;
            const strategicPoolGeminiContent = strategicPoolResult.geminiContent;

            // Check for exit signal from Strategic Pool Agent
            if (strategicPool.trim() === '<<<Exit>>>') {
                // Add exit message
                const exitMsg: ContextualMessage = {
                    id: newMessageId('system'),
                    role: 'system',
                    content: 'Strategic Pool Agent has detected that the Solution Critique found no flaws 3 times consecutively. Process completed successfully.',
                    timestamp: Date.now(),
                    iterationNumber: activeContextualState.iterationCount,
                    status: 'success',
                    blocks: [{ kind: 'info', message: 'Process completed: Solution Critique found no flaws 3 times consecutively.' }]
                };
                activeContextualState.messages.push(exitMsg);
                activeContextualState.isProcessing = false;
                updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
                stopContextualProcess();
                break;
            }

            // Store strategic pool
            activeContextualState.currentStrategicPool = strategicPool;
            activeContextualState.allStrategicPools.push(strategicPool);

            // Add strategic pool agent message
            const stratMsg: ContextualMessage = {
                id: newMessageId('strat'),
                role: 'strategic_pool_agent',
                content: strategicPool,
                timestamp: Date.now(),
                iterationNumber: activeContextualState.iterationCount
            };
            activeContextualState.messages.push(stratMsg);

            // Add to strategic pool history with Gemini content for thought signature preservation
            await strategicPoolAgentManager.addStrategicPool(strategicPool, strategicPoolGeminiContent);

            // Now format the combined critique + strategic pool for main generator
            const combinedCritique = [
                suggestions,
                '',
                '---',
                '',
                '## Strategic Pool',
                'The following 5 strategies have been generated to expand your solution exploration:',
                '',
                strategicPool
            ].join('\n');

            // Add to histories with Gemini content for thought signature preservation
            await mainGeneratorManager.addIterativeResponse(combinedCritique, activeContextualState.iterationCount);
            await mainGeneratorManager.addIterativeSuggestion(combinedCritique);
            await iterativeAgentManager.addFixedGeneration(mainGeneration, activeContextualState.iterationCount, mainGenGeminiContent);
            await iterativeAgentManager.addSuggestion(suggestions, activeContextualState.iterationCount, suggestionsGeminiContent);
            await iterativeAgentManager.addIterativeSuggestion(suggestions);

            activeContextualState.isProcessing = false;
            updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);

            if (abortController?.signal.aborted || !isContextualRunning) break;

            // Small delay before next iteration (check for abort during delay)
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(resolve, 1000);
                if (abortController) {
                    abortController.signal.addEventListener('abort', () => {
                        clearTimeout(timeout);
                        reject(new Error('Process stopped by user'));
                    });
                }
            }).catch(() => {
                // Abort during delay
                return;
            });

            if (!isContextualRunning) break;

        } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            const errorMsg: ContextualMessage = {
                id: newMessageId('system'),
                role: 'system',
                content: `Error: ${errMsg}`,
                timestamp: Date.now(),
                iterationNumber: activeContextualState.iterationCount,
                status: 'error',
                blocks: [{ kind: 'error', message: errMsg }]
            };
            activeContextualState.messages.push(errorMsg);
            activeContextualState.isProcessing = false;
            updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
            break;
        }
    }
}

async function callMainGeneratorAgent(): Promise<{ text: string; geminiContent?: any } | null> {
    if (!activeContextualState || !mainGeneratorManager) return null;

    const modelName = getSelectedModel();
    const temperature = getSelectedTemperature();
    const topP = getSelectedTopP();

    const prompt = await mainGeneratorManager.buildPrompt(
        activeContextualState.currentBestGeneration,
        activeContextualState.currentBestSuggestions,
        activeContextualState.currentMemory
    );

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (abortController?.signal.aborted || !isContextualRunning) {
            throw new Error('Process stopped by user');
        }

        try {
            if (attempt > 0) {
                const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(resolve, delay);
                    if (abortController) {
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timeout);
                            reject(new Error('Process stopped by user'));
                        });
                    }
                }).catch(() => {
                    throw new Error('Process stopped by user');
                });
            }

            if (!isContextualRunning) {
                throw new Error('Process stopped by user');
            }

            const response = await callAI(
                prompt,
                temperature,
                modelName,
                contextualCustomPrompts!.sys_contextual_mainGenerator,
                false,
                topP,
                THINKING_CONFIG
            );

            const text = extractTextFromResponse(response);

            if (text) {
                // Return both text and complete Gemini content for thought signature preservation
                return { text, geminiContent: response.candidates?.[0]?.content };
            }

            throw new Error('Provider returned empty response');

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`Main Generator call attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);

            // Show retry message in UI if not the last attempt
            if (attempt < MAX_RETRIES && activeContextualState) {
                const retryMsg: ContextualMessage = {
                    id: newMessageId('system'),
                    role: 'system',
                    content: `Main Generator call failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}. Retrying in ${INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt) / 1000}s...`,
                    timestamp: Date.now(),
                    iterationNumber: activeContextualState.iterationCount,
                    status: 'error',
                    blocks: [{ kind: 'error', message: `Retry ${attempt + 1}/${MAX_RETRIES + 1}: ${lastError.message}` }]
                };
                activeContextualState.messages.push(retryMsg);
                updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
            }

            if (attempt === MAX_RETRIES) {
                break;
            }
        }
    }

    throw lastError || new Error('Failed to get response from Main Generator Agent');
}

async function callIterativeAgent(currentGeneration: string): Promise<{ text: string; geminiContent?: any } | null> {
    if (!activeContextualState || !iterativeAgentManager) return null;

    const modelName = getSelectedModel();
    const temperature = getSelectedTemperature();
    const topP = getSelectedTopP();

    // Build prompt with current generation
    const prompt = await iterativeAgentManager.buildPrompt(currentGeneration, activeContextualState?.currentMemory || '');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (abortController?.signal.aborted || !isContextualRunning) {
            throw new Error('Process stopped by user');
        }

        try {
            if (attempt > 0) {
                const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(resolve, delay);
                    if (abortController) {
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timeout);
                            reject(new Error('Process stopped by user'));
                        });
                    }
                }).catch(() => {
                    throw new Error('Process stopped by user');
                });
            }

            if (!isContextualRunning) {
                throw new Error('Process stopped by user');
            }

            const response = await callAI(
                prompt,
                temperature,
                modelName,
                contextualCustomPrompts!.sys_contextual_iterativeAgent,
                false,
                topP,
                THINKING_CONFIG
            );

            const text = extractTextFromResponse(response);

            if (text) {
                // Return both text and complete Gemini content for thought signature preservation
                return { text, geminiContent: response.candidates?.[0]?.content };
            }

            throw new Error('Provider returned empty response');

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`Iterative Agent call attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);

            // Show retry message in UI if not the last attempt
            if (attempt < MAX_RETRIES && activeContextualState) {
                const retryMsg: ContextualMessage = {
                    id: newMessageId('system'),
                    role: 'system',
                    content: `Iterative Agent call failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}. Retrying in ${INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt) / 1000}s...`,
                    timestamp: Date.now(),
                    iterationNumber: activeContextualState.iterationCount,
                    status: 'error',
                    blocks: [{ kind: 'error', message: `Retry ${attempt + 1}/${MAX_RETRIES + 1}: ${lastError.message}` }]
                };
                activeContextualState.messages.push(retryMsg);
                updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
            }

            if (attempt === MAX_RETRIES) {
                break;
            }
        }
    }

    throw lastError || new Error('Failed to get response from Iterative Agent');
}

async function callStrategicPoolAgent(currentGeneration: string, currentCritique: string): Promise<{ text: string; geminiContent?: any } | null> {
    if (!activeContextualState || !strategicPoolAgentManager) return null;

    const modelName = getSelectedModel();
    const temperature = getSelectedTemperature();
    const topP = getSelectedTopP();

    // Build prompt with current generation and critique
    const prompt = await strategicPoolAgentManager.buildPrompt(
        currentGeneration,
        currentCritique,
        activeContextualState.currentStrategicPool
    );

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (abortController?.signal.aborted || !isContextualRunning) {
            throw new Error('Process stopped by user');
        }

        try {
            if (attempt > 0) {
                const delay = INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(resolve, delay);
                    if (abortController) {
                        abortController.signal.addEventListener('abort', () => {
                            clearTimeout(timeout);
                            reject(new Error('Process stopped by user'));
                        });
                    }
                }).catch(() => {
                    throw new Error('Process stopped by user');
                });
            }

            if (!isContextualRunning) {
                throw new Error('Process stopped by user');
            }

            const response = await callAI(
                prompt,
                temperature,
                modelName,
                contextualCustomPrompts!.sys_contextual_solutionPoolAgent,
                false,
                topP,
                THINKING_CONFIG
            );

            const text = extractTextFromResponse(response);

            if (text) {
                // Return both text and complete Gemini content for thought signature preservation
                return { text, geminiContent: response.candidates?.[0]?.content };
            }

            throw new Error('Provider returned empty response');

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.warn(`Strategic Pool Agent call attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`, lastError.message);

            // Show retry message in UI if not the last attempt
            if (attempt < MAX_RETRIES && activeContextualState) {
                const retryMsg: ContextualMessage = {
                    id: newMessageId('system'),
                    role: 'system',
                    content: `Strategic Pool Agent call failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}. Retrying in ${INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt) / 1000}s...`,
                    timestamp: Date.now(),
                    iterationNumber: activeContextualState.iterationCount,
                    status: 'error',
                    blocks: [{ kind: 'error', message: `Retry ${attempt + 1}/${MAX_RETRIES + 1}: ${lastError.message}` }]
                };
                activeContextualState.messages.push(retryMsg);
                updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
            }

            if (attempt === MAX_RETRIES) {
                break;
            }
        }
    }

    throw lastError || new Error('Failed to get response from Strategic Pool Agent');
}

async function callMemoryAgentForCondense(recentIterations: IterationData[], currentBestGeneration: string): Promise<string> {
    if (!activeContextualState || !memoryAgentManager) return '';

    const modelName = getSelectedModel();
    const temperature = getSelectedTemperature();
    const topP = getSelectedTopP();

    // Build prompt for memory agent
    const prompt = await memoryAgentManager.buildPrompt(recentIterations, currentBestGeneration);

    // Add memory agent message (processing) to UI
    const memoryMsg: ContextualMessage = {
        id: newMessageId('memory'),
        role: 'memory_agent',
        content: 'Analyzing iterations and updating memory...',
        timestamp: Date.now(),
        iterationNumber: activeContextualState.iterationCount
    };
    activeContextualState.messages.push(memoryMsg);
    updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);

    try {
        const response = await callAI(
            prompt,
            temperature,
            modelName,
            contextualCustomPrompts!.sys_contextual_memoryAgent,
            false,
            topP,
            THINKING_CONFIG
        );

        const memory = extractTextFromResponse(response);

        if (memory) {
            // Update the memory message with actual content
            memoryMsg.content = memory;

            // Store in state
            activeContextualState.currentMemory = memory;

            // Add to memory snapshots
            if (memoryAgentManager) {
                memoryAgentManager.addMemorySnapshot(
                    memory,
                    currentBestGeneration,
                    activeContextualState.iterationCount
                );
            }

            activeContextualState.memorySnapshots.push({
                memory,
                finalGeneration: currentBestGeneration,
                condensePoint: activeContextualState.iterationCount
            });

            updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);

            return memory;
        }

        throw new Error('Memory Agent returned empty response');

    } catch (error) {
        console.error('Memory Agent call failed:', error);
        memoryMsg.content = `Error: Failed to generate memory - ${error instanceof Error ? error.message : 'Unknown error'}`;
        updateContextualUI(contextualUIRoot, activeContextualState, stopContextualProcess);
        return activeContextualState.currentMemory; // Return existing memory on error
    }
}

function extractTextFromResponse(response: any): string {
    if (typeof response === 'string') {
        return response.trim();
    }
    if (response && typeof response === 'object') {
        // Handle Gemini API response format with thinking
        if (response.candidates && response.candidates[0]) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts) {
                // Filter out thought signatures and extract text parts only
                const textParts = candidate.content.parts
                    .filter((part: any) => part.text)
                    .map((part: any) => part.text);
                return textParts.join('\n').trim();
            }
        }
        // Fallback to legacy extraction
        if (response.text) {
            if (typeof response.text === 'function') {
                return String(response.text()).trim();
            }
            return String(response.text).trim();
        }
        if (response.content) return String(response.content).trim();
        if (response.message) return String(response.message).trim();
    }
    return '';
}
