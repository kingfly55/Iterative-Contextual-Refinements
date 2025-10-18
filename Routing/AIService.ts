/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateContentResponse, Part } from "@google/genai";
import { ApiKeyManager } from './ApiConfig';
import { ThinkingConfig } from './AIProvider';

let apiKeyManager: ApiKeyManager | null = null;

export function setApiKeyManager(manager: ApiKeyManager) {
    apiKeyManager = manager;
}

export interface StructuredMessage {
    role: 'system' | 'assistant' | 'user';
    content: string;
}

export async function callAI(
    promptOrParts: string | Part[] | StructuredMessage[], 
    temperature: number, 
    modelToUse: string, 
    systemInstruction?: string, 
    isJsonOutput: boolean = false, 
    topP?: number,
    thinkingConfig?: ThinkingConfig
): Promise<GenerateContentResponse> {
    if (!apiKeyManager) throw new Error("API key manager not initialized.");
    
    const providerManager = apiKeyManager.getProviderManager();
    const aiProvider = providerManager.getProviderForModel(modelToUse);
    
    if (!aiProvider) {
        throw new Error(`No configured provider found for model: ${modelToUse}`);
    }
    
    // Only pass thinking config to Gemini provider (others don't support it)
    const finalThinkingConfig = aiProvider.getProviderName() === 'gemini' ? thinkingConfig : undefined;
    
    return await aiProvider.generateContent(
        promptOrParts, 
        temperature, 
        modelToUse, 
        systemInstruction, 
        isJsonOutput, 
        topP,
        finalThinkingConfig
    );
}

// Backward compatibility alias
export const callGemini = callAI;