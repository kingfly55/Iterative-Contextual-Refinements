/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Conversation History Managers for Iterative Corrections in Deepthink Mode
 * Uses LangChain for managing conversation state
 */

import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

/**
 * Manages conversation history for Solution Critique Agent in Iterative Mode
 * Receives: System Prompt + Original Problem + Assigned Strategy + Executed Solution
 * Outputs: Solution Critique
 * Then receives corrected solutions and outputs new critiques (3 iterations total)
 */
export class SolutionCritiqueHistoryManager {
    private chatHistory: ChatMessageHistory;
    private systemPrompt: string;
    private originalProblem: string;
    private assignedStrategy: string;
    private initialSolution: string;
    private iterationCount: number;

    constructor(
        systemPrompt: string,
        originalProblem: string,
        assignedStrategy: string,
        initialSolution: string
    ) {
        this.chatHistory = new ChatMessageHistory();
        this.systemPrompt = systemPrompt;
        this.originalProblem = originalProblem;
        this.assignedStrategy = assignedStrategy;
        this.initialSolution = initialSolution;
        this.iterationCount = 0;
    }

    async buildPromptForIteration(
        solutionToAnalyze: string,
        iterationNumber: number
    ): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        this.iterationCount = iterationNumber;

        // First iteration: Initial critique
        if (iterationNumber === 1) {
            const userPrompt = `Core Challenge: ${this.originalProblem}

<INTERPRETIVE FRAMEWORK>
"${this.assignedStrategy}"
</INTERPRETIVE FRAMEWORK>

<SOLUTION TO ANALYZE>
${solutionToAnalyze}
</SOLUTION TO ANALYZE>`;

            return [{ role: 'user', content: userPrompt }];
        }

        // Subsequent iterations: Analyze corrected solution
        const messages = await this.chatHistory.getMessages();
        const result: Array<{ role: 'system' | 'assistant' | 'user'; content: string }> = [];

        // Add initial context
        result.push({
            role: 'user',
            content: `Core Challenge: ${this.originalProblem}\n\n<INTERPRETIVE FRAMEWORK>\n"${this.assignedStrategy}"\n</INTERPRETIVE FRAMEWORK>`
        });

        // Add conversation history
        for (const msg of messages) {
            if (msg instanceof AIMessage) {
                result.push({ role: 'assistant', content: msg.content as string });
            } else if (msg instanceof HumanMessage) {
                result.push({ role: 'user', content: msg.content as string });
            }
        }

        // Add current corrected solution to analyze
        result.push({
            role: 'user',
            content: `<CORRECTED SOLUTION TO ANALYZE - Iteration ${iterationNumber}>\n${solutionToAnalyze}\n</CORRECTED SOLUTION TO ANALYZE>`
        });

        return result;
    }

    async addCritique(critique: string): Promise<void> {
        await this.chatHistory.addMessage(new AIMessage(critique));
    }

    async addCorrectedSolution(correctedSolution: string, iterationNumber: number): Promise<void> {
        await this.chatHistory.addMessage(
            new HumanMessage(`Corrected Solution (Iteration ${iterationNumber}):\n${correctedSolution}`)
        );
    }

    getIterationCount(): number {
        return this.iterationCount;
    }

    async exportState(): Promise<any> {
        const messages = await this.chatHistory.getMessages();
        return {
            systemPrompt: this.systemPrompt,
            originalProblem: this.originalProblem,
            assignedStrategy: this.assignedStrategy,
            initialSolution: this.initialSolution,
            iterationCount: this.iterationCount,
            messages: messages.map(m => ({
                role: m._getType(),
                content: m.content
            }))
        };
    }
}

/**
 * Manages conversation history for Solution Correction Agent in Iterative Mode
 * Receives: System Prompt + Original Problem + Assigned Strategy + Executed Solution + Solution Critique
 * Outputs: Corrected Solution
 * Then receives new critiques and outputs new corrected solutions (3 iterations total)
 */
export class SolutionCorrectionHistoryManager {
    private chatHistory: ChatMessageHistory;
    private systemPrompt: string;
    private originalProblem: string;
    private assignedStrategy: string;
    private initialSolution: string;
    private initialCritique: string;
    private iterationCount: number;
    private subStrategyId: string;
    private otherStrategiesSolutions: string | null;

    constructor(
        systemPrompt: string,
        originalProblem: string,
        assignedStrategy: string,
        initialSolution: string,
        initialCritique: string,
        subStrategyId: string = '',
        otherStrategiesSolutions: string | null = null
    ) {
        this.chatHistory = new ChatMessageHistory();
        this.systemPrompt = systemPrompt;
        this.originalProblem = originalProblem;
        this.assignedStrategy = assignedStrategy;
        this.initialSolution = initialSolution;
        this.initialCritique = initialCritique;
        this.iterationCount = 0;
        this.subStrategyId = subStrategyId;
        this.otherStrategiesSolutions = otherStrategiesSolutions;
    }

    async buildPromptForIteration(
        currentCritique: string,
        iterationNumber: number
    ): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        this.iterationCount = iterationNumber;

        // First iteration: Initial correction
        if (iterationNumber === 1) {
            let userPrompt = `Core Challenge: ${this.originalProblem}

<INTERPRETIVE FRAMEWORK>
"${this.assignedStrategy}"
</INTERPRETIVE FRAMEWORK>`;

            // Add other strategies' solutions if provided
            if (this.otherStrategiesSolutions) {
                userPrompt += `\n\n${this.otherStrategiesSolutions}`;
            }

            userPrompt += `

<EXECUTED SOLUTION>
${this.initialSolution}
</EXECUTED SOLUTION>

<SOLUTION CRITIQUE>
${currentCritique}
</SOLUTION CRITIQUE>

Your task: Produce a corrected solution that addresses all identified issues in the critique.`;

            return [{ role: 'user', content: userPrompt }];
        }

        // Subsequent iterations: Correct based on new critique
        const messages = await this.chatHistory.getMessages();
        const result: Array<{ role: 'system' | 'assistant' | 'user'; content: string }> = [];

        // Add initial context
        let initialContext = `Core Challenge: ${this.originalProblem}\n\n<INTERPRETIVE FRAMEWORK>\n"${this.assignedStrategy}"\n</INTERPRETIVE FRAMEWORK>`;
        
        // Add other strategies' solutions if provided (only on first message in history)
        if (this.otherStrategiesSolutions) {
            initialContext += `\n\n${this.otherStrategiesSolutions}`;
        }
        
        result.push({
            role: 'user',
            content: initialContext
        });

        // Add conversation history
        for (const msg of messages) {
            if (msg instanceof AIMessage) {
                result.push({ role: 'assistant', content: msg.content as string });
            } else if (msg instanceof HumanMessage) {
                result.push({ role: 'user', content: msg.content as string });
            }
        }

        // Add new critique
        result.push({
            role: 'user',
            content: `<NEW SOLUTION CRITIQUE - Iteration ${iterationNumber}>\n${currentCritique}\n</NEW SOLUTION CRITIQUE>\n\nYour task: Produce a corrected solution that addresses all identified issues in this new critique.`
        });

        return result;
    }

    async addCorrectedSolution(correctedSolution: string): Promise<void> {
        await this.chatHistory.addMessage(new AIMessage(correctedSolution));
    }

    async addNewCritique(critique: string, iterationNumber: number): Promise<void> {
        await this.chatHistory.addMessage(
            new HumanMessage(`New Critique (Iteration ${iterationNumber}):\n${critique}`)
        );
    }

    getIterationCount(): number {
        return this.iterationCount;
    }

    async exportState(): Promise<any> {
        const messages = await this.chatHistory.getMessages();
        return {
            systemPrompt: this.systemPrompt,
            originalProblem: this.originalProblem,
            assignedStrategy: this.assignedStrategy,
            initialSolution: this.initialSolution,
            initialCritique: this.initialCritique,
            iterationCount: this.iterationCount,
            subStrategyId: this.subStrategyId,
            otherStrategiesSolutions: this.otherStrategiesSolutions,
            messages: messages.map(m => ({
                role: m._getType(),
                content: m.content
            }))
        };
    }
}

/**
 * Stores iteration data for UI display
 */
export interface IterativeCorrectionIteration {
    iterationNumber: number;
    critique: string;
    correctedSolution: string;
    timestamp: number;
}

/**
 * Stores the complete state for a strategy's iterative correction process
 */
export interface IterativeCorrectionState {
    strategyId: string;
    subStrategyId: string;
    originalProblem: string;
    assignedStrategy: string;
    initialSolution: string;
    iterations: IterativeCorrectionIteration[];
    critiqueManager: SolutionCritiqueHistoryManager | null;
    correctionManager: SolutionCorrectionHistoryManager | null;
    status: 'idle' | 'processing' | 'completed' | 'error';
    error?: string;
}
