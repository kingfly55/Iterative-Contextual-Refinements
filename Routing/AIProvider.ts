/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface StructuredMessage {
    role: 'system' | 'assistant' | 'user';
    content: string | any;  // Can be string or complete Gemini content object with thought signatures
}

export interface ThinkingConfig {
    thinkingBudget?: number;  // -1 for dynamic, 0 to disable, or specific token count
    tools?: any[];  // Function declarations to enable thought signatures
}

export interface AIProvider {
    initialize(apiKey: string): boolean;
    generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput?: boolean,
        topP?: number,
        thinkingConfig?: ThinkingConfig
    ): Promise<GenerateContentResponse>;
    isInitialized(): boolean;
    getProviderName(): string;
}

// Helper to check if input is structured messages
function isStructuredMessages(input: any): input is StructuredMessage[] {
    return Array.isArray(input) && input.length > 0 && 'role' in input[0] && 'content' in input[0];
}

export class GoogleAIProvider implements AIProvider {
    private client: GoogleGenAI | null = null;

    initialize(apiKey: string): boolean {
        try {
            this.client = new GoogleGenAI({ apiKey });
            return true;
        } catch (e) {
            console.error("Failed to initialize Google AI:", e);
            return false;
        }
    }

    async generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput: boolean = false,
        topP?: number,
        thinkingConfig?: ThinkingConfig
    ): Promise<GenerateContentResponse> {
        if (!this.client) throw new Error("Google AI client not initialized.");

        // Handle structured messages properly for Gemini
        let contents: any;
        if (isStructuredMessages(promptOrParts)) {
            // Gemini supports multi-turn conversations via contents array
            // Convert structured messages to Gemini's format
            const geminiContents: any[] = [];

            for (const msg of promptOrParts) {
                // Check if content is already a Gemini content object (preserves thought signatures)
                if (typeof msg.content === 'object' && msg.content.parts) {
                    // Complete content object with thought signatures - preserve as-is
                    geminiContents.push(msg.content);
                } else if (msg.role === 'system') {
                    // System messages go to user role in Gemini
                    geminiContents.push({
                        role: 'user',
                        parts: [{ text: String(msg.content) }]
                    });
                } else if (msg.role === 'assistant') {
                    // Assistant messages go to model role
                    geminiContents.push({
                        role: 'model',
                        parts: [{ text: String(msg.content) }]
                    });
                } else if (msg.role === 'user') {
                    geminiContents.push({
                        role: 'user',
                        parts: [{ text: String(msg.content) }]
                    });
                }
            }

            // Gemini requires alternating user/model messages
            // If we have consecutive messages of same role, combine them
            const normalizedContents: any[] = [];
            for (let i = 0; i < geminiContents.length; i++) {
                const current = geminiContents[i];
                if (normalizedContents.length === 0) {
                    normalizedContents.push(current);
                } else {
                    const last = normalizedContents[normalizedContents.length - 1];
                    if (last.role === current.role) {
                        // Combine consecutive messages of same role
                        last.parts.push(...current.parts);
                    } else {
                        normalizedContents.push(current);
                    }
                }
            }

            contents = normalizedContents;
        } else {
            // Legacy: single message
            contents = [{
                role: 'user',
                parts: typeof promptOrParts === 'string' ? [{ text: promptOrParts }] : promptOrParts
            }];
        }

        const config: any = { temperature };
        if (topP !== undefined) config.topP = topP;
        if (systemInstruction) config.systemInstruction = systemInstruction;
        if (isJsonOutput) config.responseMimeType = "application/json";
        
        // Add thinking configuration for Gemini 2.5 models
        if (thinkingConfig?.thinkingBudget !== undefined) {
            config.thinkingBudget = thinkingConfig.thinkingBudget;
        }

        const requestOptions: any = {
            model: modelToUse,
            contents: contents,
            config: config
        };
        
        // Add tools/function declarations if provided (enables thought signatures)
        if (thinkingConfig?.tools && thinkingConfig.tools.length > 0) {
            requestOptions.tools = thinkingConfig.tools;
        }

        const result = await this.client.models.generateContent(requestOptions);

        // Return the full result to preserve thought signatures in response.candidates[0].content
        // The content object contains parts with thoughtSignature fields that must be preserved
        return result as any;
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    getProviderName(): string {
        return 'gemini';
    }

    getClient(): GoogleGenAI | null {
        return this.client;
    }
}

export class OpenAIProvider implements AIProvider {
    private client: OpenAI | null = null;

    initialize(apiKey: string): boolean {
        try {
            this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
            return true;
        } catch (e) {
            console.error("Failed to initialize OpenAI:", e);
            return false;
        }
    }

    async generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput: boolean = false,
        topP?: number,
        thinkingConfig?: ThinkingConfig  // Not used by OpenAI but maintained for interface consistency
    ): Promise<GenerateContentResponse> {
        if (!this.client) throw new Error("OpenAI client not initialized.");

        const messages: any[] = [];

        // Handle structured messages properly
        if (isStructuredMessages(promptOrParts)) {
            // Add system instruction FIRST (the main AGENTIC_SYSTEM_PROMPT)
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            // Then add all structured messages (conversation history)
            for (const msg of promptOrParts) {
                messages.push({ role: msg.role, content: msg.content });
            }
        } else {
            // Legacy behavior: system instruction + single user message
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            const userContent = typeof promptOrParts === 'string' ? promptOrParts : promptOrParts.map(p => p.text).join('\n');
            messages.push({ role: 'user', content: userContent });
        }

        const requestOptions: any = {
            model: modelToUse,
            messages,
            temperature,
        };

        if (topP !== undefined) requestOptions.top_p = topP;
        if (isJsonOutput) requestOptions.response_format = { type: "json_object" };

        const response = await this.client.chat.completions.create(requestOptions);

        const content = response.choices[0]?.message?.content || '';

        // Convert OpenAI response to Gemini-like format - create a proper mock
        const mockResponse = {
            text: content,  // Direct property access for compatibility
            response: {
                text: () => content,
                candidates: [{
                    content: {
                        parts: [{ text: content }]
                    }
                }]
            }
        };

        return mockResponse as any;
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    getProviderName(): string {
        return 'openai';
    }
}

export class OpenRouterProvider implements AIProvider {
    private client: OpenAI | null = null;

    initialize(apiKey: string): boolean {
        try {
            this.client = new OpenAI({
                apiKey,
                baseURL: "https://openrouter.ai/api/v1",
                dangerouslyAllowBrowser: true
            });
            return true;
        } catch (e) {
            console.error("Failed to initialize OpenRouter:", e);
            return false;
        }
    }

    async generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput: boolean = false,
        topP?: number,
        thinkingConfig?: ThinkingConfig
    ): Promise<GenerateContentResponse> {
        if (!this.client) throw new Error("OpenRouter client not initialized.");

        const messages: any[] = [];

        // Handle structured messages properly
        if (isStructuredMessages(promptOrParts)) {
            // Add system instruction FIRST (the main AGENTIC_SYSTEM_PROMPT)
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            // Then add all structured messages (conversation history)
            for (const msg of promptOrParts) {
                messages.push({ role: msg.role, content: msg.content });
            }
        } else {
            // Legacy behavior: system instruction + single user message
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            const userContent = typeof promptOrParts === 'string' ? promptOrParts : promptOrParts.map(p => p.text).join('\n');
            messages.push({ role: 'user', content: userContent });
        }

        const requestOptions: any = {
            model: modelToUse,
            messages,
            temperature,
        };

        if (topP !== undefined) requestOptions.top_p = topP;
        if (isJsonOutput) requestOptions.response_format = { type: "json_object" };

        const response = await this.client.chat.completions.create(requestOptions);

        const content = response.choices[0]?.message?.content || '';

        // Convert OpenRouter response to Gemini-like format - create a proper mock
        const mockResponse = {
            text: content,  // Direct property access for compatibility
            response: {
                text: () => content,
                candidates: [{
                    content: {
                        parts: [{ text: content }]
                    }
                }]
            }
        };

        return mockResponse as any;
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    getProviderName(): string {
        return 'openrouter';
    }
}

export class AnthropicProvider implements AIProvider {
    private client: Anthropic | null = null;

    initialize(apiKey: string): boolean {
        try {
            this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
            return true;
        } catch (e) {
            console.error("Failed to initialize Anthropic:", e);
            return false;
        }
    }

    async generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput: boolean = false,
        topP?: number,
        thinkingConfig?: ThinkingConfig
    ): Promise<GenerateContentResponse> {
        if (!this.client) throw new Error("Anthropic client not initialized.");

        let messages: any[] = [];
        let systemPrompt = systemInstruction;

        // Handle structured messages properly
        if (isStructuredMessages(promptOrParts)) {
            // Anthropic requires alternating user/assistant messages
            // System messages need to be combined into the system prompt
            const systemMessages: string[] = [];

            // Add main system instruction first if provided
            if (systemInstruction) {
                systemMessages.push(systemInstruction);
            }

            for (const msg of promptOrParts) {
                if (msg.role === 'system') {
                    systemMessages.push(msg.content);
                } else {
                    messages.push({ role: msg.role, content: msg.content });
                }
            }

            // Combine all system messages
            if (systemMessages.length > 0) {
                systemPrompt = systemMessages.join('\n\n');
            }
        } else {
            // Legacy behavior: single user message
            const userContent = typeof promptOrParts === 'string' ? promptOrParts : promptOrParts.map(p => p.text).join('\n');
            messages = [{ role: 'user', content: userContent }];
        }

        const requestOptions: any = {
            model: modelToUse,
            max_tokens: 4096,
            temperature,
            messages
        };

        if (systemPrompt) requestOptions.system = systemPrompt;
        if (topP !== undefined) requestOptions.top_p = topP;

        // Anthropic JSON mode: Add JSON instruction to system prompt
        if (isJsonOutput && systemPrompt) {
            requestOptions.system = `${systemPrompt}\n\nYou must respond with valid JSON only. Do not include any text outside the JSON structure.`;
        } else if (isJsonOutput) {
            requestOptions.system = 'You must respond with valid JSON only. Do not include any text outside the JSON structure.';
        }

        const response = await this.client.messages.create(requestOptions);

        // Convert Anthropic response to Gemini-like format
        const textContent = (response.content.find((c: any) => c.type === 'text') as any)?.text || '';

        const mockResponse = {
            text: textContent,  // Direct property access for compatibility
            response: {
                text: () => textContent,
                candidates: [{
                    content: {
                        parts: [{ text: textContent }]
                    }
                }]
            }
        };

        return mockResponse as any;
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    getProviderName(): string {
        return 'anthropic';
    }
}

export class LocalModelsProvider implements AIProvider {
    private client: OpenAI | null = null;
    private endpointUrl: string = '';

    initialize(configString: string): boolean {
        try {
            // Parse the config string which contains endpoint URL
            // Format: "endpoint_url|model1,model2,model3"
            const [endpoint] = configString.split('|');

            // Ensure the endpoint has the /v1 suffix for OpenAI compatibility
            // LM Studio and similar tools expect this format
            this.endpointUrl = endpoint.endsWith('/v1')
                ? endpoint
                : endpoint.endsWith('/')
                    ? endpoint + 'v1'
                    : endpoint + '/v1';

            this.client = new OpenAI({
                apiKey: 'not-needed', // Local models typically don't need API keys
                baseURL: this.endpointUrl,
                dangerouslyAllowBrowser: true
            });
            return true;
        } catch (e) {
            console.error("Failed to initialize Local Models:", e);
            return false;
        }
    }

    async generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput: boolean = false,
        topP?: number,
        thinkingConfig?: ThinkingConfig
    ): Promise<GenerateContentResponse> {
        if (!this.client) throw new Error("Local Models client not initialized.");

        const messages: any[] = [];

        // Handle structured messages properly
        if (isStructuredMessages(promptOrParts)) {
            // Add system instruction FIRST (the main AGENTIC_SYSTEM_PROMPT)
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            // Then add all structured messages (conversation history)
            for (const msg of promptOrParts) {
                messages.push({ role: msg.role, content: msg.content });
            }
        } else {
            // Legacy behavior: system instruction + single user message
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            const userContent = typeof promptOrParts === 'string' ? promptOrParts : promptOrParts.map(p => p.text).join('\n');

            // For JSON output with local models, add instruction to the prompt
            if (isJsonOutput) {
                messages.push({
                    role: 'user',
                    content: userContent + '\n\nIMPORTANT: You must respond with valid JSON only, no other text.'
                });
            } else {
                messages.push({ role: 'user', content: userContent });
            }
        }

        const requestOptions: any = {
            model: modelToUse,
            messages,
            temperature,
        };

        if (topP !== undefined) requestOptions.top_p = topP;
        // Don't use response_format for local models as many don't support it
        // Instead rely on prompt instruction for JSON output

        const response = await this.client.chat.completions.create(requestOptions);

        const content = response.choices[0]?.message?.content || '';

        // Convert response to Gemini-like format
        const mockResponse = {
            text: content,
            response: {
                text: () => content,
                candidates: [{
                    content: {
                        parts: [{ text: content }]
                    }
                }]
            }
        };

        return mockResponse as any;
    }

    isInitialized(): boolean {
        return this.client !== null;
    }

    getProviderName(): string {
        return 'local';
    }
}

// Factory function to create providers
export function createAIProvider(provider: string): AIProvider {
    switch (provider) {
        case 'gemini':
        case 'google':
            return new GoogleAIProvider();
        case 'openai':
            return new OpenAIProvider();
        case 'openrouter':
            return new OpenRouterProvider();
        case 'anthropic':
            return new AnthropicProvider();
        case 'local':
            return new LocalModelsProvider();
        default:
            return new GoogleAIProvider();
    }
}