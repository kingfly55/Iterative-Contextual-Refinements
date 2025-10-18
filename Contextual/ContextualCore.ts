/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Removed LangChain dependencies - now using custom HistoryMessage interface for thought signature preservation

export interface ContentHistoryEntry {
    content: string;
    title: string;
    timestamp: number;
}

/**
 * Represents a message in conversation history that can contain either:
 * - Plain text (for non-Gemini providers or user messages)
 * - Complete Gemini Content object with thought signatures (for Gemini assistant messages)
 */
export interface HistoryMessage {
    role: 'system' | 'assistant' | 'user';
    content: string | any;  // string for text, or Gemini Content object with parts/thoughtSignature
}

export interface ContextualState {
    id: string;
    initialUserRequest: string;
    initialMainGeneration: string;
    currentBestGeneration: string;
    currentBestSuggestions: string;
    allIterativeSuggestions: string[];
    mainGeneratorHistory: HistoryMessage[];
    iterativeAgentHistory: HistoryMessage[];
    memoryAgentHistory: HistoryMessage[];
    strategicPoolAgentHistory: HistoryMessage[];
    currentMemory: string;
    memorySnapshots: MemorySnapshot[];
    currentStrategicPool: string;
    allStrategicPools: string[];
    iterationCount: number;
    isProcessing: boolean;
    isRunning: boolean;
    messages: ContextualMessage[];
    contentHistory: ContentHistoryEntry[];
}

export type ContextualSystemBlock = 
    | { kind: 'error'; message: string }
    | { kind: 'info'; message: string };

export interface ContextualMessage {
    id: string;
    role: 'main_generator' | 'iterative_agent' | 'memory_agent' | 'strategic_pool_agent' | 'system';
    content: string;
    timestamp: number;
    iterationNumber: number;
    status?: 'success' | 'error' | 'processing';
    blocks?: ContextualSystemBlock[];
}

export interface IterationData {
    iterationNumber: number;
    iterativeCritique: string;
    mainGeneration: string;
}

export interface MemorySnapshot {
    memory: string;
    finalGeneration: string;
    condensePoint: number;
}

/**
 * Manages conversation history for Main Generator Agent
 * Implements smart context condensation after 10 iterations
 * Preserves Gemini thought signatures for continuous reasoning
 */
export class MainGeneratorHistoryManager {
    private conversationHistory: HistoryMessage[];
    private systemPrompt: string;
    private initialUserRequest: string;
    private initialMainGeneration: string;
    private allIterativeSuggestions: string[];
    private turnsSinceLastCondense: number;
    private recentIterations: IterationData[];
    private onMemoryAgentCall: ((recentIterations: IterationData[], currentBestGeneration: string) => Promise<string>) | null;

    constructor(systemPrompt: string, initialUserRequest: string) {
        this.conversationHistory = [];
        this.systemPrompt = systemPrompt;
        this.initialUserRequest = initialUserRequest;
        this.initialMainGeneration = '';
        this.allIterativeSuggestions = [];
        this.turnsSinceLastCondense = 0;
        this.recentIterations = [];
        this.onMemoryAgentCall = null;
    }

    setMemoryAgentCallback(callback: (recentIterations: IterationData[], currentBestGeneration: string) => Promise<string>): void {
        this.onMemoryAgentCall = callback;
    }

    setInitialGeneration(generation: string): void {
        this.initialMainGeneration = generation;
    }

    addIterativeSuggestion(suggestion: string): void {
        this.allIterativeSuggestions.push(suggestion);
    }

    /**
     * Adds a generation to history, preserving Gemini Content object if provided
     * @param generation - Text content of the generation
     * @param iterationNumber - Current iteration number
     * @param geminiContent - Optional: Complete Gemini Content object with thought signatures
     */
    async addGeneration(generation: string, iterationNumber: number, geminiContent?: any): Promise<void> {
        // Store complete Gemini content if available (preserves thought signatures)
        // Otherwise store as plain text
        this.conversationHistory.push({
            role: 'assistant',
            content: geminiContent || generation
        });
        this.turnsSinceLastCondense++;
        
        // Store generation for recent iterations tracking
        if (this.recentIterations.length > 0) {
            const lastIteration = this.recentIterations[this.recentIterations.length - 1];
            if (lastIteration.iterationNumber === iterationNumber) {
                lastIteration.mainGeneration = generation;
            }
        }
    }

    /**
     * Adds iterative agent's critique to history, preserving Gemini Content if provided
     * @param response - Text content of the critique
     * @param iterationNumber - Current iteration number
     * @param geminiContent - Optional: Complete Gemini Content object with thought signatures
     */
    async addIterativeResponse(response: string, iterationNumber: number, geminiContent?: any): Promise<void> {
        this.conversationHistory.push({
            role: 'user',
            content: geminiContent || response
        });
        
        // Track this iteration's critique
        this.recentIterations.push({
            iterationNumber: iterationNumber + 1,
            iterativeCritique: response,
            mainGeneration: '' // Will be filled when next generation is added
        });
    }

    async buildPrompt(currentBestGeneration: string, currentBestSuggestions: string, currentMemory: string = ''): Promise<HistoryMessage[]> {
        // First iteration: Just Initial User Request (system prompt passed separately to callAI)
        if (this.conversationHistory.length === 0) {
            return [
                { role: 'user', content: this.initialUserRequest }
            ];
        }

        // Check if we need to condense (after 10 turns)
        if (this.turnsSinceLastCondense >= 10) {
            // Call Memory Agent if callback is set
            if (this.onMemoryAgentCall && this.recentIterations.length > 0) {
                // Filter out incomplete iterations (those without main generation)
                const completeIterations = this.recentIterations.filter(iter => iter.mainGeneration !== '');
                if (completeIterations.length > 0) {
                    const memory = await this.onMemoryAgentCall(completeIterations, currentBestGeneration);
                    await this.condenseHistory(currentBestGeneration, currentBestSuggestions, memory);
                } else {
                    await this.condenseHistory(currentBestGeneration, currentBestSuggestions, currentMemory);
                }
            } else {
                await this.condenseHistory(currentBestGeneration, currentBestSuggestions, currentMemory);
            }
        }

        // Build from current history - preserves Gemini Content objects with thought signatures
        const result: HistoryMessage[] = [
            { role: 'user', content: this.initialUserRequest }
        ];

        // Add all conversation history (preserves thought signatures)
        result.push(...this.conversationHistory);

        return result;
    }

    private async condenseHistory(currentBestGeneration: string, currentBestSuggestions: string, currentMemory: string): Promise<void> {
        // Clear current history (thought signatures are lost during condensation - this is intentional)
        this.conversationHistory = [];

        // Build condensed context with memory instead of raw suggestions
        const condensedContext = [
            `Initial User Request: ${this.initialUserRequest}`,
            '',
            `Your Initial Main Generation: ${this.initialMainGeneration}`,
            '',
            'Memory Summary (What worked and what didn\'t):',
            currentMemory,
            '',
            `Your Current Best Generation: ${currentBestGeneration}`,
            '',
            `Iterative agent's next suggestions: ${currentBestSuggestions}`
        ].join('\n');

        // Add as single context message (plain text - condensation resets thought context)
        this.conversationHistory.push({
            role: 'user',
            content: condensedContext
        });

        // Clear recent iterations for next phase
        this.recentIterations = [];

        // Reset counter
        this.turnsSinceLastCondense = 0;
    }

    async exportState(): Promise<any> {
        return {
            systemPrompt: this.systemPrompt,
            initialUserRequest: this.initialUserRequest,
            initialMainGeneration: this.initialMainGeneration,
            allIterativeSuggestions: [...this.allIterativeSuggestions],
            turnsSinceLastCondense: this.turnsSinceLastCondense,
            messages: this.conversationHistory.map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : '[Gemini Content with Thought Signatures]'
            }))
        };
    }
}

/**
 * Manages conversation history for Iterative Agent (Suggestion & Alignment Agent)
 * Implements smart context condensation after 10 iterations
 * Preserves Gemini thought signatures for continuous reasoning
 */
export class IterativeAgentHistoryManager {
    private conversationHistory: HistoryMessage[];
    private systemPrompt: string;
    private initialUserRequest: string;
    private initialMainGeneration: string;
    private allIterativeSuggestions: string[];
    private turnsSinceLastCondense: number;
    private recentIterations: IterationData[];
    private onMemoryAgentCall: ((recentIterations: IterationData[], currentBestGeneration: string) => Promise<string>) | null;

    constructor(systemPrompt: string, initialUserRequest: string, initialMainGeneration: string) {
        this.conversationHistory = [];
        this.systemPrompt = systemPrompt;
        this.initialUserRequest = initialUserRequest;
        this.initialMainGeneration = initialMainGeneration;
        this.allIterativeSuggestions = [];
        this.turnsSinceLastCondense = 0;
        this.recentIterations = [];
        this.onMemoryAgentCall = null;
    }

    setMemoryAgentCallback(callback: (recentIterations: IterationData[], currentBestGeneration: string) => Promise<string>): void {
        this.onMemoryAgentCall = callback;
    }

    addIterativeSuggestion(suggestion: string): void {
        this.allIterativeSuggestions.push(suggestion);
    }

    /**
     * Adds a suggestion/critique to history, preserving Gemini Content if provided
     * @param suggestion - Text content of the suggestion
     * @param iterationNumber - Current iteration number
     * @param geminiContent - Optional: Complete Gemini Content object with thought signatures
     */
    async addSuggestion(suggestion: string, iterationNumber: number, geminiContent?: any): Promise<void> {
        this.conversationHistory.push({
            role: 'assistant',
            content: geminiContent || suggestion
        });
        this.turnsSinceLastCondense++;
        
        // Track this iteration's critique
        this.recentIterations.push({  
            iterationNumber,
            iterativeCritique: suggestion,
            mainGeneration: '' // Will be filled when generation is added
        });
    }

    /**
     * Adds main generator's response to history, preserving Gemini Content if provided
     * @param generation - Text content of the generation
     * @param iterationNumber - Current iteration number
     * @param geminiContent - Optional: Complete Gemini Content object with thought signatures
     */
    async addFixedGeneration(generation: string, iterationNumber: number, geminiContent?: any): Promise<void> {
        this.conversationHistory.push({
            role: 'user',
            content: geminiContent || generation
        });
        
        // Update the generation for the last iteration
        if (this.recentIterations.length > 0) {
            const lastIteration = this.recentIterations[this.recentIterations.length - 1];
            if (lastIteration.iterationNumber === iterationNumber) {
                lastIteration.mainGeneration = generation;
            }
        }
    }

    async buildPrompt(currentBestGeneration: string, currentMemory: string = ''): Promise<HistoryMessage[]> {
        // First iteration: Just Initial User Request + Initial Main Generation (system prompt passed separately)
        if (this.conversationHistory.length === 0) {
            return [
                { role: 'user', content: `${this.initialUserRequest}\n\nInitial Main Generation:\n${this.initialMainGeneration}` }
            ];
        }

        // Check if we need to condense (after 10 turns)
        if (this.turnsSinceLastCondense >= 10) {
            // Call Memory Agent if callback is set
            if (this.onMemoryAgentCall && this.recentIterations.length > 0) {
                // Filter out incomplete iterations
                const completeIterations = this.recentIterations.filter(iter => iter.mainGeneration !== '');
                if (completeIterations.length > 0) {
                    const memory = await this.onMemoryAgentCall(completeIterations, currentBestGeneration);
                    await this.condenseHistory(currentBestGeneration, memory);
                } else {
                    await this.condenseHistory(currentBestGeneration, currentMemory);
                }
            } else {
                await this.condenseHistory(currentBestGeneration, currentMemory);
            }
        }

        // Build from current history - preserves Gemini Content objects with thought signatures
        const result: HistoryMessage[] = [
            { role: 'user', content: this.initialUserRequest }
        ];

        // Add all conversation history (preserves thought signatures)
        result.push(...this.conversationHistory);

        // Add the current generation for analysis
        result.push({ role: 'user', content: `Current Generation to Analyze:\n${currentBestGeneration}` });

        return result;
    }

    private async condenseHistory(currentBestGeneration: string, currentMemory: string): Promise<void> {
        // Clear current history (thought signatures are lost during condensation - this is intentional)
        this.conversationHistory = [];

        // Build condensed context with memory instead of raw suggestions
        const condensedContext = [
            `Initial User Request: ${this.initialUserRequest}`,
            '',
            `Initial Main Generation: ${this.initialMainGeneration}`,
            '',
            'Memory Summary (What worked and what didn\'t):',
            currentMemory,
            '',
            `Current Best Generation: ${currentBestGeneration}`
        ].join('\n');

        // Add as single context message (plain text - condensation resets thought context)
        this.conversationHistory.push({
            role: 'user',
            content: condensedContext
        });

        // Clear recent iterations for next phase
        this.recentIterations = [];

        // Reset counter
        this.turnsSinceLastCondense = 0;
    }

    async exportState(): Promise<any> {
        return {
            systemPrompt: this.systemPrompt,
            initialUserRequest: this.initialUserRequest,
            initialMainGeneration: this.initialMainGeneration,
            allIterativeSuggestions: [...this.allIterativeSuggestions],
            turnsSinceLastCondense: this.turnsSinceLastCondense,
            messages: this.conversationHistory.map((m: HistoryMessage) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : '[Gemini Content with Thought Signatures]'
            }))
        };
    }
}

/**
 * Manages conversation history for Memory Agent
 * Creates evolving memory summaries at each condense point
 */
export class MemoryAgentHistoryManager {
    private systemPrompt: string;
    private initialUserRequest: string;
    private initialMainGeneration: string;
    private memorySnapshots: MemorySnapshot[];
    private condenseCount: number;

    constructor(systemPrompt: string, initialUserRequest: string, initialMainGeneration: string) {
        this.systemPrompt = systemPrompt;
        this.initialUserRequest = initialUserRequest;
        this.initialMainGeneration = initialMainGeneration;
        this.memorySnapshots = [];
        this.condenseCount = 0;
    }

    async buildPrompt(recentIterations: IterationData[], _currentBestGeneration: string): Promise<HistoryMessage[]> {
        this.condenseCount++;

        // No system message in array - it's passed separately to callAI
        const result: HistoryMessage[] = [];

        // Build the user prompt based on condense count
        if (this.condenseCount === 1) {
            // First condense - initial memory creation
            const userPrompt = [
                `Initial User Request:\n${this.initialUserRequest}`,
                '',
                `Initial Main Generation:\n${this.initialMainGeneration}`,
                '',
                'Recent Iterations to Analyze:',
                ...recentIterations.map(iter => 
                    `[Iteration ${iter.iterationNumber}]\n- Iterative Agent Critique: ${iter.iterativeCritique}\n- Main Generator Response: ${iter.mainGeneration}`
                ),
                '',
                'Task: Create the initial memory document summarizing what worked and what didn\'t.'
            ].join('\n');

            result.push({ role: 'user', content: userPrompt });
        } else {
            // Subsequent condenses - memory evolution
            const userPrompt = [
                `Initial User Request:\n${this.initialUserRequest}`,
                '',
                `Initial Main Generation:\n${this.initialMainGeneration}`,
                '',
                ...this.memorySnapshots.map((snapshot, idx) => {
                    if (idx === 0) {
                        return `Memory V${idx + 1} You Wrote:\n${snapshot.memory}\n\nFinal Main Generation after Memory V${idx + 1}:\n${snapshot.finalGeneration}`;
                    } else {
                        return `\nMemory V${idx + 1} You Wrote (Previous Memory):\n${snapshot.memory}\n\nFinal Main Generation after Memory V${idx + 1}:\n${snapshot.finalGeneration}`;
                    }
                }),
                '',
                `Recent Iterations to Analyze (these iterations had the previous memory injected in their context):`,
                ...recentIterations.map(iter => 
                    `[Iteration ${iter.iterationNumber}]\n- Iterative Agent Critique: ${iter.iterativeCritique}\n- Main Generator Response: ${iter.mainGeneration}`
                ),
                '',
                'Task: Update the previous memory document summarizing what worked and what didn\'t. This will be the memory used in the next iteration phase.'
            ].join('\n');

            result.push({ role: 'user', content: userPrompt });
        }

        return result;
    }

    addMemorySnapshot(memory: string, finalGeneration: string, condensePoint: number): void {
        this.memorySnapshots.push({
            memory,
            finalGeneration,
            condensePoint
        });
    }

    async exportState(): Promise<any> {
        return {
            systemPrompt: this.systemPrompt,
            initialUserRequest: this.initialUserRequest,
            initialMainGeneration: this.initialMainGeneration,
            memorySnapshots: [...this.memorySnapshots],
            condenseCount: this.condenseCount
        };
    }
}

/**
 * Manages conversation history for Strategic Pool Agent
 * Generates novel cross-domain strategies by observing main generation and critique
 * Preserves Gemini thought signatures for continuous reasoning
 */
export class StrategicPoolAgentHistoryManager {
    private conversationHistory: HistoryMessage[];
    private systemPrompt: string;
    private initialUserRequest: string;
    private initialMainGeneration: string;
    private allStrategicPools: string[];

    constructor(systemPrompt: string, initialUserRequest: string, initialMainGeneration: string) {
        this.conversationHistory = [];
        this.systemPrompt = systemPrompt;
        this.initialUserRequest = initialUserRequest;
        this.initialMainGeneration = initialMainGeneration;
        this.allStrategicPools = [];
    }

    async buildPrompt(currentGeneration: string, currentCritique: string, previousStrategicPool: string = ''): Promise<HistoryMessage[]> {
        // First call - no previous strategic pool
        if (this.conversationHistory.length === 0) {
            const userPrompt = [
                `Initial User Request:\n${this.initialUserRequest}`,
                '',
                `Initial Main Generation:\n${this.initialMainGeneration}`,
                '',
                `Current Main Generation:\n${currentGeneration}`,
                '',
                `Solution Critique:\n${currentCritique}`,
                '',
                'Task: Generate N completely new independent strategies that explore the solution space broadly through visual reasoning, spatial thinking, and cross-domain synthesis.'
            ].join('\n');

            return [{ role: 'user', content: userPrompt }];
        }

        // Subsequent calls - build context with conversation history (preserves thought signatures)
        const result: HistoryMessage[] = [...this.conversationHistory];

        // Add current observation with deep analysis prompt
        const userPrompt = [
            `## Observation: Current Main Generation`,
            currentGeneration,
            '',
            `## Observation: Solution Critique`,
            currentCritique,
            '',
            `## Your Previous Strategic Pool`,
            previousStrategicPool || 'N/A',
            '',
            '## Deep Analysis Task',
            'Study the Main Generator\'s solution carefully:',
            '- Did they attempt any strategies from your previous pool? Which ones?',
            '- If they attempted a strategy, how did they execute it? Was it superficial or deep?',
            '- What strategic direction did they take? Are they stuck in a local approach?',
            '- What does the critique reveal about their blind spots or fixations?',
            '- What unexplored strategic territories remain?',
            '',
            '## Strategic Pool Evolution Task',
            'Based on your deep observation, UPDATE and EVOLVE your strategic pool with N strategies:',
            '- If a strategy was well-explored, replace it with something more orthogonal',
            '- If a strategy was ignored or poorly attempted, keep it but reframe more compellingly',
            '- If they\'re fixated on one approach, propose radical departures',
            '- Progressively expand into more unexpected domains with each iteration',
            '- Focus on what they HAVEN\'T tried, not what they have',
            '',
            'Generate N evolved strategies that push exploration further.'
        ].join('\n');

        result.push({ role: 'user', content: userPrompt });

        return result;
    }

    /**
     * Adds strategic pool to history, preserving Gemini Content if provided
     * @param strategicPool - Text content of the strategic pool
     * @param geminiContent - Optional: Complete Gemini Content object with thought signatures
     */
    async addStrategicPool(strategicPool: string, geminiContent?: any): Promise<void> {
        this.conversationHistory.push({
            role: 'assistant',
            content: geminiContent || strategicPool
        });
        this.allStrategicPools.push(strategicPool);
    }

    // Note: Observations are handled implicitly in buildPrompt by passing current generation and critique
    // No separate tracking needed as context is built fresh each call

    async exportState(): Promise<any> {
        return {
            systemPrompt: this.systemPrompt,
            initialUserRequest: this.initialUserRequest,
            initialMainGeneration: this.initialMainGeneration,
            allStrategicPools: [...this.allStrategicPools],
            messages: this.conversationHistory.map((m: HistoryMessage) => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : '[Gemini Content with Thought Signatures]'
            }))
        };
    }
}

export function createInitialContextualState(initialUserRequest: string): ContextualState {
    return {
        id: `contextual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        initialUserRequest,
        initialMainGeneration: '',
        currentBestGeneration: '',
        currentBestSuggestions: '',
        allIterativeSuggestions: [],
        mainGeneratorHistory: [],
        iterativeAgentHistory: [],
        memoryAgentHistory: [],
        strategicPoolAgentHistory: [],
        currentMemory: '',
        memorySnapshots: [],
        currentStrategicPool: '',
        allStrategicPools: [],
        iterationCount: 0,
        isProcessing: false,
        isRunning: false,
        messages: [],
        contentHistory: []
    };
}

export function newMessageId(prefix: string = 'msg'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
