/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface StructuredMessage {
    role: 'system' | 'assistant' | 'user';
    content: string;  // Plain text only (thought signatures disabled for Gemini)
}

export interface ThinkingConfig {
    thinkingBudget?: number;  // -1 for dynamic, 0 to disable, or specific token count
    thinkingLevel?: 'low' | 'medium' | 'high' | 'minimal';  // Gemini 3 thinking level control
    tools?: any[];  // Function declarations to enable thought signatures
    codeExecution?: boolean;  // Enable Gemini native code execution tool
}

// Models that require mandatory high thinking level
const GEMINI_3_MODELS = [
    'gemini-3-pro-preview',
    'gemini-3-flash-preview'
];

export interface AIProvider {
    initialize(apiKey: string): boolean;
    generateContent(
        promptOrParts: string | Part[] | StructuredMessage[],
        temperature: number,
        modelToUse: string,
        systemInstruction?: string,
        isJsonOutput?: boolean,
        topP?: number,
        thinkingConfig?: any
    ): Promise<GenerateContentResponse>;
    isInitialized(): boolean;
    getProviderName(): string;
}

// Helper to check if input is structured messages
function isStructuredMessages(input: any): input is StructuredMessage[] {
    return Array.isArray(input) && input.length > 0 && 'role' in input[0] && 'content' in input[0];
}

// Supported image MIME types for vision APIs (OpenAI and Anthropic)
const VISION_SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Helper to check if a Part contains inline image data
function hasInlineData(part: any): part is { inlineData: { mimeType: string; data: string } } {
    return part && part.inlineData && part.inlineData.mimeType && part.inlineData.data;
}

// Helper to check if a Part contains text
function hasText(part: any): part is { text: string } {
    return part && typeof part.text === 'string';
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
        thinkingConfig?: any
    ): Promise<GenerateContentResponse> {
        if (!this.client) throw new Error("Google AI client not initialized.");

        // Handle structured messages properly for Gemini
        let contents: any;
        if (isStructuredMessages(promptOrParts)) {
            // Gemini supports multi-turn conversations via contents array
            // Convert structured messages to Gemini's format
            const geminiContents: any[] = [];

            for (const msg of promptOrParts) {
                // Convert all messages to plain text (thought signatures disabled)
                if (msg.role === 'system') {
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

        // Check if this is a Gemini 3 model that requires high thinking level
        const isGemini3Model = GEMINI_3_MODELS.some(m => modelToUse.includes(m));

        // Add thinking configuration
        if (isGemini3Model) {
            // Gemini 3 models: Use thinkingLevel (mandatory high) instead of thinkingBudget
            // Per Gemini 3 API docs: thinking_level is required instead of thinking_budget
            config.thinkingConfig = {
                thinkingLevel: 'high'  // Mandatory high thinking for Gemini 3 models
            };
            console.log('🧠 Gemini 3 Model Detected: Enforcing thinkingLevel=high');
        } else if (thinkingConfig?.thinkingLevel) {
            // Gemini 3 with explicit thinkingLevel (though we enforce high for Gemini 3)
            config.thinkingConfig = {
                thinkingLevel: thinkingConfig.thinkingLevel
            };
        } else if (thinkingConfig?.thinkingBudget !== undefined) {
            // Legacy: Gemini 2.5 models use thinkingBudget
            config.thinkingBudget = thinkingConfig.thinkingBudget;
        }

        // Tools must be inside config, not at requestOptions level!
        // Per official docs: config: { tools: [{ codeExecution: {} }] }

        // IMPORTANT: codeExecution and functionDeclarations are MUTUALLY EXCLUSIVE!
        // When code execution is enabled, we CANNOT use function declarations.
        // Code execution takes priority when enabled.

        if (thinkingConfig?.codeExecution) {
            // Code execution mode - ONLY add codeExecution, no function declarations
            config.tools = [{ codeExecution: {} }];
            console.log('🔧 CODE EXECUTION TOOL ENABLED (function calling disabled)');
        } else if (thinkingConfig?.tools && thinkingConfig.tools.length > 0) {
            // Function calling mode - only when code execution is disabled
            config.tools = [...thinkingConfig.tools];
        }

        const requestOptions: any = {
            model: modelToUse,
            contents: contents,
            config: config
        };

        // DEBUG: Log the full request to verify code execution is included
        console.group('🚀 GEMINI API REQUEST DEBUG');
        console.log('Model:', modelToUse);
        console.log('Config.tools:', JSON.stringify(config.tools, null, 2));
        console.log('codeExecution enabled?', thinkingConfig?.codeExecution);
        console.groupEnd();

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
        thinkingConfig?: any  // Not used by OpenAI but maintained for interface consistency
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
        } else if (Array.isArray(promptOrParts) && promptOrParts.length > 0 && !isStructuredMessages(promptOrParts)) {
            // Handle Part[] with potential images (vision support)
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            // Build multipart content array for OpenAI vision format
            const contentParts: any[] = [];

            for (const part of promptOrParts) {
                if (hasText(part)) {
                    contentParts.push({ type: 'text', text: part.text });
                } else if (hasInlineData(part)) {
                    // Check if this is a supported image type
                    if (VISION_SUPPORTED_MIME_TYPES.includes(part.inlineData.mimeType)) {
                        contentParts.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                            }
                        });
                    }
                    // Note: Unsupported file types are blocked by App.ts validation before reaching here
                }
            }

            // If we have multipart content, use the array format
            if (contentParts.length > 0) {
                messages.push({ role: 'user', content: contentParts });
            }
        } else {
            // Legacy behavior: simple string
            if (systemInstruction) {
                messages.push({ role: 'system', content: systemInstruction });
            }

            const userContent = typeof promptOrParts === 'string' ? promptOrParts : String(promptOrParts);
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
        thinkingConfig?: any
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
        thinkingConfig?: any
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
        } else if (Array.isArray(promptOrParts) && promptOrParts.length > 0 && !isStructuredMessages(promptOrParts)) {
            // Handle Part[] with potential images (vision support)
            // Build multipart content array for Anthropic vision format
            const contentParts: any[] = [];

            for (const part of promptOrParts) {
                if (hasText(part)) {
                    contentParts.push({ type: 'text', text: part.text });
                } else if (hasInlineData(part)) {
                    // Check if this is a supported image type
                    if (VISION_SUPPORTED_MIME_TYPES.includes(part.inlineData.mimeType)) {
                        contentParts.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: part.inlineData.mimeType,
                                data: part.inlineData.data
                            }
                        });
                    }
                    // Note: Unsupported file types are blocked by App.ts validation before reaching here
                }
            }

            // If we have multipart content, use the array format
            if (contentParts.length > 0) {
                messages = [{ role: 'user', content: contentParts }];
            }
        } else {
            // Legacy behavior: single user message (string)
            const userContent = typeof promptOrParts === 'string' ? promptOrParts : String(promptOrParts);
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
        thinkingConfig?: any
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