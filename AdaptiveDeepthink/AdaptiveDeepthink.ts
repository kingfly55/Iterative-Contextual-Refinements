/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Adaptive Deepthink - Main orchestration logic
 */

import { Part, GenerateContentResponse } from "@google/genai";
import {
    AdaptiveDeepthinkConversationManager,
    AdaptiveDeepthinkState,
    createAdaptiveDeepthinkState,
    parseAdaptiveDeepthinkResponse,
    executeAdaptiveDeepthinkTool
} from './AdaptiveDeepthinkCore';
import { ADAPTIVE_DEEPTHINK_SYSTEM_PROMPT } from './AdaptiveDeepthinkPrompt';
import { AgentExecutionContext } from '../Deepthink/DeepthinkAgents';
import { createDefaultCustomPromptsDeepthink } from '../Deepthink/DeepthinkPrompts';

// Global state
let activeAdaptiveDeepthinkSession: {
    state: AdaptiveDeepthinkState;
    conversationManager: AdaptiveDeepthinkConversationManager;
    imageBase64?: string | null;
    imageMimeType?: string | null;
} | null = null;

// Dependencies
let agentContext: AgentExecutionContext | null = null;
let callAI: ((parts: Part[], temperature: number, modelToUse: string, systemInstruction?: string, isJson?: boolean, topP?: number) => Promise<GenerateContentResponse>) | null = null;

/**
 * Initialize the Adaptive Deepthink module with dependencies
 */
export function initializeAdaptiveDeepthinkModule(dependencies: {
    callAI: (parts: Part[], temperature: number, modelToUse: string, systemInstruction?: string, isJson?: boolean, topP?: number) => Promise<GenerateContentResponse>;
    cleanOutputByType: (rawOutput: string, type?: string) => string;
    parseJsonSafe: (raw: string, context: string) => any;
    getSelectedTemperature: () => number;
    getSelectedModel: () => string;
    getSelectedTopP: () => number;
}) {
    callAI = dependencies.callAI;
    agentContext = {
        callAI: dependencies.callAI,
        cleanOutputByType: dependencies.cleanOutputByType,
        parseJsonSafe: dependencies.parseJsonSafe,
        getSelectedTemperature: dependencies.getSelectedTemperature,
        getSelectedModel: dependencies.getSelectedModel,
        getSelectedTopP: dependencies.getSelectedTopP
    };
}

/**
 * Start a new Adaptive Deepthink session
 */
export async function startAdaptiveDeepthinkSession(
    question: string,
    imageBase64?: string | null,
    imageMimeType?: string | null
): Promise<void> {
    if (!agentContext || !callAI) {
        throw new Error('Adaptive Deepthink module not initialized');
    }

    // Create new session
    const state = createAdaptiveDeepthinkState(question);
    const conversationManager = new AdaptiveDeepthinkConversationManager(
        question,
        ADAPTIVE_DEEPTHINK_SYSTEM_PROMPT
    );

    activeAdaptiveDeepthinkSession = {
        state,
        conversationManager,
        imageBase64,
        imageMimeType
    };

    state.status = 'processing';

    // Start the orchestration loop
    await runOrchestrationTurn();
}

/**
 * Run a single orchestration turn
 */
async function runOrchestrationTurn(): Promise<void> {
    if (!activeAdaptiveDeepthinkSession || !agentContext || !callAI) {
        return;
    }

    const { state, conversationManager, imageBase64, imageMimeType } = activeAdaptiveDeepthinkSession;

    try {
        // Build prompt with conversation history
        const prompt = await conversationManager.buildPrompt();
        const systemPrompt = conversationManager.getSystemPrompt();

        // Call the orchestrator agent
        const promptParts: Part[] = [{ text: prompt }];
        if (imageBase64 && imageMimeType) {
            promptParts.unshift({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        }

        const response = await callAI(
            promptParts,
            agentContext.getSelectedTemperature(),
            agentContext.getSelectedModel(),
            systemPrompt,
            false,
            agentContext.getSelectedTopP()
        );

        const responseText = agentContext.cleanOutputByType((response as any).response?.text() || '');

        // Add agent response to history
        await conversationManager.addAgentMessage(responseText);

        // Parse response for tool calls
        const parsed = parseAdaptiveDeepthinkResponse(responseText);

        // If no tool calls, session is complete
        if (parsed.toolCalls.length === 0) {
            state.status = 'completed';
            return;
        }

        // Execute the first tool call (only one per turn)
        const toolCall = parsed.toolCalls[0];
        
        // Get Deepthink prompts
        const deepthinkPrompts = createDefaultCustomPromptsDeepthink();

        // Execute tool
        const toolResult = await executeAdaptiveDeepthinkTool(
            toolCall,
            state,
            agentContext,
            deepthinkPrompts,
            imageBase64,
            imageMimeType
        );

        // Add tool result to conversation history
        await conversationManager.addSystemMessage(toolResult);

        // Continue to next turn
        await runOrchestrationTurn();

    } catch (error) {
        state.status = 'error';
        state.error = error instanceof Error ? error.message : 'Unknown error';
    }
}

/**
 * Get the active session
 */
export function getActiveAdaptiveDeepthinkSession() {
    return activeAdaptiveDeepthinkSession;
}

/**
 * Stop the active session
 */
export function stopAdaptiveDeepthinkSession(): void {
    if (activeAdaptiveDeepthinkSession) {
        activeAdaptiveDeepthinkSession.state.status = 'completed';
    }
}

/**
 * Clear the active session
 */
export function clearAdaptiveDeepthinkSession(): void {
    activeAdaptiveDeepthinkSession = null;
}
