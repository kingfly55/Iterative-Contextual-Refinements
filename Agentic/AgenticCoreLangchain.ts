/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { callAI } from '../Routing';
import { VERIFIER_SYSTEM_PROMPT } from './AgenticModePrompt';
import { searchArxiv, formatPaperForDisplay, fetchPaperPDF } from './ArxivAPI';

// Re-export types from original AgenticCore for compatibility
export type {
    DiffCommand,
    ToolCall,
    ResponseSegment,
    SystemBlock,
    AgenticMessage,
    AgenticState,
    ParsedResponse,
    ResponseActionWithPos
} from './AgenticCore';

// Import parsing and execution functions from original core
import {
    parseAgentResponseWithSegments,
    applyDiffCommand,
    extractTextFromAny,
    type ToolCall,
    type AgenticState
} from './AgenticCore';

// Re-export for compatibility
export { parseAgentResponseWithSegments, applyDiffCommand, extractTextFromAny };

/**
 * Langchain-based conversation manager for Agentic mode
 * Handles context, history, and memory management
 */
export class AgenticConversationManager {
    private chatHistory: ChatMessageHistory;
    private verifierHistory: ChatMessageHistory;
    private systemPrompt: string;
    private verifierPrompt: string;
    private originalContent: string;
    private currentContent: string;

    constructor(
        originalContent: string,
        systemPrompt: string,
        verifierPrompt: string = VERIFIER_SYSTEM_PROMPT
    ) {
        this.originalContent = originalContent;
        this.currentContent = originalContent;
        this.systemPrompt = systemPrompt;
        this.verifierPrompt = verifierPrompt;

        // Initialize Langchain chat history for main agent
        this.chatHistory = new ChatMessageHistory();

        // Initialize separate chat history for verifier agent
        this.verifierHistory = new ChatMessageHistory();
    }

    /**
     * Get initial context message (only used on first turn)
     */
    private getInitialContextMessage(): { role: 'system' | 'assistant' | 'user'; content: string } {
        return {
            role: 'system',
            content: `Initial content to refine:\n${this.originalContent}`
        };
    }

    /**
     * Add an agent response to history
     */
    async addAgentMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new AIMessage(content));
    }

    /**
     * Add a system feedback message to history
     */
    async addSystemMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new SystemMessage(content));
    }

    /**
     * Add a user message to history (for future interactive features)
     */
    async addUserMessage(content: string): Promise<void> {
        await this.chatHistory.addMessage(new HumanMessage(content));
    }

    /**
     * Get the full conversation history as a formatted string (legacy)
     * Used for providers that don't support structured messages
     */
    async getConversationHistory(): Promise<string> {
        const messages = await this.chatHistory.getMessages();
        const formattedMessages: string[] = [];

        for (const msg of messages) {
            if (msg instanceof SystemMessage) {
                // Extract only relevant system messages, skip tool syntax
                const cleaned = this.stripToolSyntax(msg.content as string);
                if (cleaned.trim()) {
                    formattedMessages.push(`[System]: ${cleaned}`);
                }
            } else if (msg instanceof AIMessage) {
                // Extract only narrative from agent messages
                const cleaned = this.stripToolSyntax(msg.content as string);
                if (cleaned.trim()) {
                    formattedMessages.push(`${cleaned}`);
                }
            } else if (msg instanceof HumanMessage) {
                formattedMessages.push(`[User]: ${msg.content}`);
            }
        }

        return formattedMessages.join('\n\n');
    }

    /**
     * Get structured conversation messages for providers that support it
     * Returns array of messages with proper roles
     */
    async getStructuredMessages(): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        const messages = await this.chatHistory.getMessages();
        const structuredMessages: Array<{ role: 'system' | 'assistant' | 'user'; content: string }> = [];

        for (const msg of messages) {
            if (msg instanceof SystemMessage) {
                // Keep system messages as-is, but strip tool syntax
                const cleaned = this.stripToolSyntax(msg.content as string);
                if (cleaned.trim()) {
                    structuredMessages.push({
                        role: 'system',
                        content: cleaned
                    });
                }
            } else if (msg instanceof AIMessage) {
                // Agent messages become assistant messages
                const cleaned = this.stripToolSyntax(msg.content as string);
                if (cleaned.trim()) {
                    structuredMessages.push({
                        role: 'assistant',
                        content: cleaned
                    });
                }
            } else if (msg instanceof HumanMessage) {
                // User messages
                structuredMessages.push({
                    role: 'user',
                    content: msg.content as string
                });
            }
        }

        return structuredMessages;
    }

    /**
     * Build the complete prompt for the AI including history
     * Note: Current content is only included on first turn.
     * After that, agent can use read_current_content() tool if needed.
     */
    async buildPrompt(): Promise<string> {
        const history = await this.getConversationHistory();
        
        // On first turn (empty history), include initial content
        if (!history || history.trim().length === 0) {
            return this.getInitialContextMessage().content;
        }
        
        return history;
    }

    /**
     * Build structured messages for the AI
     * Returns structured conversation history for providers that support it
     */
    async buildStructuredPrompt(): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        const messages = await this.getStructuredMessages();
        
        // On first turn (no messages yet), include initial content
        if (messages.length === 0) {
            return [this.getInitialContextMessage()];
        }
        
        return messages;
    }

    /**
     * Update the current content state
     */
    updateCurrentContent(newContent: string): void {
        this.currentContent = newContent;
    }

    /**
     * Get the current content
     */
    getCurrentContent(): string {
        return this.currentContent;
    }

    /**
     * Get the original content
     */
    getOriginalContent(): string {
        return this.originalContent;
    }

    /**
     * Get the system prompt
     */
    getSystemPrompt(): string {
        return this.systemPrompt;
    }

    /**
     * Get the verifier prompt
     */
    getVerifierPrompt(): string {
        return this.verifierPrompt;
    }

    /**
     * Clear conversation history (useful for reset)
     */
    async clearHistory(): Promise<void> {
        await this.chatHistory.clear();
    }

    /**
     * Get message count for monitoring
     */
    async getMessageCount(): Promise<number> {
        const messages = await this.chatHistory.getMessages();
        return messages.length;
    }

    /**
     * Add verifier interaction to history
     * NOTE: We DON'T store the full content to save context!
     * We only store the report so verifier can see what it said before
     */
    async addVerifierInteraction(contentAnalyzed: string, report: string): Promise<void> {
        // Store only a reference to the verification, not the full content
        const lineCount = contentAnalyzed.split('\n').length;
        await this.verifierHistory.addMessage(new HumanMessage(`Verification request (${lineCount} lines)`));
        // Store the verifier's report
        await this.verifierHistory.addMessage(new AIMessage(report));
    }

    /**
     * Build verifier prompt with conversation history
     * We only include previous REPORTS, not previous content (saves massive context)
     */
    async buildVerifierPrompt(currentContent: string): Promise<string> {
        const verifierMessages = await this.verifierHistory.getMessages();
        
        let fullPrompt = '';
        
        // Add conversation history if it exists
        if (verifierMessages.length > 0) {
            fullPrompt += '<conversation_history>\n';
            fullPrompt += 'You have previously analyzed content in this session. Here are your previous reports:\n\n';
            
            let turnNumber = 1;
            for (let i = 0; i < verifierMessages.length; i += 2) {
                const reportMsg = verifierMessages[i + 1];
                
                if (reportMsg) {
                    fullPrompt += `[Verification Turn ${turnNumber}]\n`;
                    fullPrompt += '<your_previous_report>\n';
                    fullPrompt += `${reportMsg.content}\n`;
                    fullPrompt += '</your_previous_report>\n\n';
                    turnNumber++;
                }
            }
            
            fullPrompt += '</conversation_history>\n\n';
            fullPrompt += 'Now analyze the following current content. Consider what improvements have been made since your last report and identify any remaining or new issues:\n\n';
        }
        
        // Add the current content to analyze
        fullPrompt += `<current_content>\n${currentContent}\n</current_content>`;
        
        return fullPrompt;
    }

    /**
     * Clear verifier history
     */
    async clearVerifierHistory(): Promise<void> {
        await this.verifierHistory.clear();
    }

    /**
     * Get verifier message count
     */
    async getVerifierMessageCount(): Promise<number> {
        const messages = await this.verifierHistory.getMessages();
        return messages.length;
    }

    /**
     * Strip problematic syntax from text for clean history
     * We KEEP proper tool syntax [TOOL_CALL:...] so agent learns from its own behavior
     * We REMOVE code blocks and malformed syntax that could confuse the model
     */
    private stripToolSyntax(text: string): string {
        return text
            // Remove code blocks (these can confuse the model)
            .replace(/```[\s\S]*?```/g, '')
            .replace(/'''[\s\S]*?'''/g, '')
            
            // Remove tool result markers (these are for UI only, but keep the content)
            // Simply remove the opening bracket tags, preserve all content after the colon
            .replace(/\[TOOL_RESULT:\s*/g, '')
            .replace(/\[SYSTEM_ERROR:\s*/g, '')
            .replace(/\[VERIFIER_ERROR:\s*/g, '')
            .replace(/\[BUILD_SUCCESS:\s*/g, '')
            .replace(/\[BUILD_FAILED:\s*/g, '')
            .replace(/\[EDIT_RESULT:\s*/g, '')
            // Remove any standalone closing brackets that might be left (like "fixing.]" -> "fixing.")
            
            // Remove tool-related headers
            .replace(/^\s*Tools? called:.*$/gmi, '')
            .replace(/^\s*Commands? executed:.*$/gmi, '')
            
            // Clean up whitespace
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    /**
     * Export conversation state for persistence
     */
    async exportState(): Promise<{
        originalContent: string;
        currentContent: string;
        messages: Array<{ role: string; content: string }>;
    }> {
        const messages = await this.chatHistory.getMessages();
        return {
            originalContent: this.originalContent,
            currentContent: this.currentContent,
            messages: messages.map(msg => ({
                role: msg._getType(),
                content: msg.content as string
            }))
        };
    }

    /**
     * Import conversation state from persistence
     */
    async importState(state: {
        originalContent: string;
        currentContent: string;
        messages: Array<{ role: string; content: string }>;
    }): Promise<void> {
        this.originalContent = state.originalContent;
        this.currentContent = state.currentContent;

        await this.chatHistory.clear();

        for (const msg of state.messages) {
            if (msg.role === 'system') {
                await this.chatHistory.addMessage(new SystemMessage(msg.content));
            } else if (msg.role === 'ai') {
                await this.chatHistory.addMessage(new AIMessage(msg.content));
            } else if (msg.role === 'human') {
                await this.chatHistory.addMessage(new HumanMessage(msg.content));
            }
        }
    }
}

/**
 * Create initial state with Langchain conversation manager
 */
export function createInitialState(initialContent: string): AgenticState & { conversationManager?: AgenticConversationManager } {
    const state: AgenticState & { conversationManager?: AgenticConversationManager } = {
        id: `agentic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        originalContent: initialContent,
        currentContent: initialContent,
        messages: [],
        isProcessing: false,
        isComplete: false,
        streamBuffer: '',
        contentHistory: [
            {
                content: initialContent,
                title: 'Initial Content',
                timestamp: Date.now()
            }
        ]
    };

    return state;
}

/**
 * Execute a tool call using Langchain context
 */
export async function executeToolCall(
    currentContent: string,
    toolCall: ToolCall,
    modelName: string,
    conversationManager: AgenticConversationManager
): Promise<string> {
    try {
        switch (toolCall.type) {
            case 'read_current_content': {
                if (toolCall.params && toolCall.params.length === 2) {
                    const [startLine, endLine] = toolCall.params;
                    const lines = currentContent.split('\n');
                    const selectedLines = lines.slice(startLine - 1, endLine);
                    return selectedLines.join('\n');
                }
                return currentContent;
            }

            case 'verify_current_content': {
                const verifierPrompt = conversationManager.getVerifierPrompt();
                
                try {
                    // Build verifier prompt with conversation history
                    const verifierInput = await conversationManager.buildVerifierPrompt(currentContent);

                    const response = await callAI(
                        verifierInput,
                        0.2,  // Lower temperature for more consistent verification
                        modelName,
                        verifierPrompt,
                        false,
                        0.95
                    );

                    const verifierReport = extractTextFromAny(response);

                    if (!verifierReport || verifierReport.trim().length === 0) {
                        return '[VERIFIER_ERROR: Verifier returned empty response]';
                    }

                    // Store this verification interaction in history
                    await conversationManager.addVerifierInteraction(currentContent, verifierReport);

                    return verifierReport;
                } catch (error) {
                    return `[VERIFIER_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}]`;
                }
            }

            case 'searchacademia': {
                if (!toolCall.query) {
                    return '[TOOL_ERROR: searchacademia requires a query parameter]';
                }

                try {
                    const papers = await searchArxiv({
                        searchType: 'simple',
                        query: toolCall.query,
                        maxResults: 10
                    });

                    if (papers.length === 0) {
                        return `No papers found for query: "${toolCall.query}"`;
                    }

                    const results = [`Found ${papers.length} papers for query: "${toolCall.query}"\n`];
                    
                    for (let index = 0; index < papers.length; index++) {
                        const paper = papers[index];
                        results.push(`[Paper ${index + 1}]`);
                        results.push(formatPaperForDisplay(paper));
                        
                        // Fetch and include full PDF text
                        try {
                            results.push('\nFull Paper Text:');
                            const pdfText = await fetchPaperPDF(paper.pdfUrl);
                            results.push(pdfText);
                        } catch (pdfError) {
                            results.push(`\n[PDF extraction failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}]`);
                        }
                        
                        results.push('='.repeat(80));
                    }

                    return results.join('\n');
                } catch (error) {
                    return `[TOOL_ERROR: searchacademia failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
                }
            }

            case 'searchacademia_and': {
                if (!toolCall.terms || toolCall.terms.length === 0) {
                    return '[TOOL_ERROR: searchacademia_and requires at least one term]';
                }

                try {
                    const papers = await searchArxiv({
                        searchType: 'and_terms',
                        terms: toolCall.terms,
                        maxResults: 10
                    });

                    if (papers.length === 0) {
                        return `No papers found matching all terms: ${toolCall.terms.join(', ')}`;
                    }

                    const results = [`Found ${papers.length} papers matching all terms: ${toolCall.terms.join(', ')}\n`];
                    
                    for (let index = 0; index < papers.length; index++) {
                        const paper = papers[index];
                        results.push(`[Paper ${index + 1}]`);
                        results.push(formatPaperForDisplay(paper));
                        
                        // Fetch and include full PDF text
                        try {
                            results.push('\nFull Paper Text:');
                            const pdfText = await fetchPaperPDF(paper.pdfUrl);
                            results.push(pdfText);
                        } catch (pdfError) {
                            results.push(`\n[PDF extraction failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}]`);
                        }
                        
                        results.push('='.repeat(80));
                    }

                    return results.join('\n');
                } catch (error) {
                    return `[TOOL_ERROR: searchacademia_and failed: ${error instanceof Error ? error.message : 'Unknown error'}]`;
                }
            }

            default:
                return `[TOOL_ERROR: Unknown tool type: ${(toolCall as any).type}]`;
        }
    } catch (error) {
        return `[TOOL_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
}
