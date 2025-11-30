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
 * NO ACTUAL CHAT HISTORY - just stores context and rebuilds prompt each time
 * All iterations: Challenge + Strategy + CurrentPool + Critique
 * The pool contains all previous corrected solutions and critiques
 */
export class SolutionCorrectionHistoryManager {
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
        _currentCritique: string,
        iterationNumber: number,
        currentFullPool?: string | null
    ): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        this.iterationCount = iterationNumber;

        // All iterations: Challenge + Strategy + CurrentPool (which includes Critique)
        // NO conversation history - the pool contains everything!
        let userPrompt = `Core Challenge: ${this.originalProblem}

<INTERPRETIVE FRAMEWORK>
"${this.assignedStrategy}"
</INTERPRETIVE FRAMEWORK>

<CURRENT FULL STRUCTURED SOLUTION POOL>
This contains ALL solutions, critiques, corrections, and solution pools from ALL strategies.
Your previous corrected solutions (if any) are in the pool below.

${currentFullPool || this.otherStrategiesSolutions || ''}
</CURRENT FULL STRUCTURED SOLUTION POOL>

Your task: Produce a corrected solution that addresses all identified issues in the critique${iterationNumber > 1 ? ' while learning from all previous corrections and solutions in the pool' : ''}.`;

        return [{ role: 'user', content: userPrompt }];
    }

    async addCorrectedSolution(_correctedSolution: string): Promise<void> {
        // No-op: We don't store conversation history
        // The pool itself contains all corrected solutions
    }

    async addNewCritique(_critique: string, _iterationNumber: number): Promise<void> {
        // No-op: We don't store conversation history
        // The pool itself contains all critiques
    }

    getIterationCount(): number {
        return this.iterationCount;
    }

    async exportState(): Promise<any> {
        return {
            systemPrompt: this.systemPrompt,
            originalProblem: this.originalProblem,
            assignedStrategy: this.assignedStrategy,
            initialSolution: this.initialSolution,
            initialCritique: this.initialCritique,
            iterationCount: this.iterationCount,
            subStrategyId: this.subStrategyId,
            otherStrategiesSolutions: this.otherStrategiesSolutions
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
 * Manages conversation history for StructuredSolutionPool Agent in IterativeCorrections Mode
 * NO ACTUAL CHAT HISTORY - just stores context and rebuilds prompt each time
 * Iteration 1: Challenge + Strategy + InitializedPool + FirstCritique
 * Iteration 2+: Challenge + Strategy + FirstCritique + CurrentPool + NewCritique
 * The pool itself contains all history (previous 5-solution outputs in <SolutionPool-N>)
 */
export class StructuredSolutionPoolHistoryManager {
    private systemPrompt: string;
    private originalProblem: string;
    private assignedStrategyId: string;
    private assignedStrategyContent: string;
    private iterationCount: number;

    constructor(
        systemPrompt: string,
        originalProblem: string,
        assignedStrategyId: string,
        assignedStrategyContent: string
    ) {
        this.systemPrompt = systemPrompt;
        this.originalProblem = originalProblem;
        this.assignedStrategyId = assignedStrategyId;
        this.assignedStrategyContent = assignedStrategyContent;
        this.assignedStrategyContent = assignedStrategyContent;
        this.iterationCount = 0;
    }

    async buildPromptForIteration(
        completeStructuredSolutionPool: string,
        _currentSolutionCritique: string,
        iterationNumber: number
    ): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        this.iterationCount = iterationNumber;

        // Iteration 1 & 2+: Challenge + Strategy + CurrentPool (which includes LatestCritique)
        let userPrompt = `Core Challenge: ${this.originalProblem}

<YOUR ASSIGNED MAIN STRATEGY>
Strategy ID: ${this.assignedStrategyId}
Strategy Content: ${this.assignedStrategyContent}
</YOUR ASSIGNED MAIN STRATEGY>

<CURRENT STRUCTURED SOLUTION POOL>
This contains ALL solutions, critiques, corrections, and solution pools from ALL strategies.
Your assigned strategy is identified by the Strategy ID above.
Your previous output (if any) is stored in <SolutionPool-${this.assignedStrategyId}> tags.

${completeStructuredSolutionPool}
</CURRENT STRUCTURED SOLUTION POOL>

<YOUR CRITICAL MISSION>
Generate EXACTLY 5 genuinely diverse, completely orthogonal solutions that:
1. Execute YOUR assigned strategy (${this.assignedStrategyId}) faithfully
2. Are fundamentally different from each other in approach and methodology
3. Learn from ALL critiques and solutions across ALL strategies in the pool
4. Address all issues identified in the latest critique (found in <Corresponding Solution Critique> tags)
5. ${iterationNumber > 1 ? 'Build upon and improve your previous solutions (visible in <SolutionPool-' + this.assignedStrategyId + '> tags)' : 'Explore different corners of your strategy\'s solution space'}

Output ONLY the 5 solutions with separators as specified in your system instructions.
No introduction, no meta-commentary, no suggestions—just 5 complete solution attempts.
</YOUR CRITICAL MISSION>`;

        return [{ role: 'user', content: userPrompt }];
    }

    async addPoolResponse(_poolResponse: string): Promise<void> {
        // No-op: We don't store conversation history
        // The pool itself contains the previous output in <SolutionPool-N> tags
    }

    getIterationCount(): number {
        return this.iterationCount;
    }

    async exportState(): Promise<any> {
        return {
            systemPrompt: this.systemPrompt,
            originalProblem: this.originalProblem,
            assignedStrategyId: this.assignedStrategyId,
            assignedStrategyContent: this.assignedStrategyContent,
            iterationCount: this.iterationCount
        };
    }
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

/**
 * Manages conversation history for PostQualityFilter Agent
 * Iteration 1: Receives all strategies with their full solutions and critiques
 * Iteration 2+: Receives conversation history + new strategies with their executions
 */
export class PostQualityFilterHistoryManager {
    private chatHistory: ChatMessageHistory;
    private systemPrompt: string;
    private originalProblem: string;
    private seenStrategyIds: Set<string>;

    constructor(
        systemPrompt: string,
        originalProblem: string
    ) {
        this.chatHistory = new ChatMessageHistory();
        this.systemPrompt = systemPrompt;
        this.originalProblem = originalProblem;
        this.seenStrategyIds = new Set();
    }

    async buildPromptForIteration(
        strategiesWithExecutions: Array<{
            strategyId: string;
            strategyText: string;
            solutionAttempt: string;
            solutionCritique: string;
        }>,
        iterationNumber: number
    ): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        const result: Array<{ role: 'system' | 'assistant' | 'user'; content: string }> = [];

        // First iteration: Send all strategies with full details
        if (iterationNumber === 1) {
            let userPrompt = `Core Challenge: ${this.originalProblem}\n\n`;
            userPrompt += `<CURRENT ACTIVE STRATEGIES - Iteration ${iterationNumber}>\n`;
            userPrompt += `Evaluate ONLY these ${strategiesWithExecutions.length} strategies listed below.\n`;
            userPrompt += `For each strategy, decide: KEEP (strategy is good, continue as-is) or UPDATE (strategy is flawed, needs replacement).\n\n`;
            userPrompt += `A strategy should be marked UPDATE if:\n`;
            userPrompt += `- The execution shows it's severely flawed or way too complex\n`;
            userPrompt += `- It's completely meaningless or off-topic\n`;
            userPrompt += `- It doesn't fit the problem description\n`;
            userPrompt += `- The critique shows fundamental issues that can't be fixed by execution alone\n\n`;

            strategiesWithExecutions.forEach((strategy) => {
                userPrompt += `\n<Strategy ID: ${strategy.strategyId}>\n`;
                userPrompt += `Strategy: ${strategy.strategyText}\n\n`;
                userPrompt += `Full Solution:\n${strategy.solutionAttempt}\n\n`;
                userPrompt += `Solution Critique:\n${strategy.solutionCritique}\n`;
                userPrompt += `</Strategy ID: ${strategy.strategyId}>\n`;

                // Mark as seen to prevent sending again
                this.seenStrategyIds.add(strategy.strategyId);
            });

            userPrompt += `\n</CURRENT ACTIVE STRATEGIES>\n\n`;
            userPrompt += `**IMPORTANT**: Return decisions ONLY for the ${strategiesWithExecutions.length} strategies listed above.\n`;
            userPrompt += `Strategy IDs to evaluate: ${strategiesWithExecutions.map(s => s.strategyId).join(', ')}\n`;
            userPrompt += `For each strategy, output: \"decision\": \"keep\" or \"decision\": \"update\"`;

            result.push({ role: 'user', content: userPrompt });
            return result;
        }

        // Subsequent iterations: Send conversation history + new strategies only
        const messages = await this.chatHistory.getMessages();

        // Add conversation history
        for (const msg of messages) {
            if (msg instanceof AIMessage) {
                result.push({ role: 'assistant', content: msg.content as string });
            } else if (msg instanceof HumanMessage) {
                result.push({ role: 'user', content: msg.content as string });
            }
        }

        // Filter to ONLY NEW strategies (not seen before)
        const newStrategies = strategiesWithExecutions.filter(s => !this.seenStrategyIds.has(s.strategyId));

        if (newStrategies.length === 0) {
            // All strategies already seen - just send a status update
            let userPrompt = `<ITERATION ${iterationNumber} - NO NEW STRATEGIES>\n`;
            userPrompt += `All ${strategiesWithExecutions.length} current active strategies were already evaluated in previous iterations.\n`;
            userPrompt += `Active strategies: ${strategiesWithExecutions.map(s => s.strategyId).join(', ')}\n`;
            userPrompt += `Do NOT re-evaluate these. They are already marked as KEEP.\n`;
            userPrompt += `</ITERATION ${iterationNumber}>`;
            result.push({ role: 'user', content: userPrompt });
            return result;
        }

        // Build list of ALL current active strategies (for context)
        const allActiveIds = strategiesWithExecutions.map(s => s.strategyId);
        const keptFromBefore = strategiesWithExecutions.filter(s => this.seenStrategyIds.has(s.strategyId)).map(s => s.strategyId);

        // Add ONLY new strategies with their executions
        let userPrompt = `<CURRENT ACTIVE STRATEGIES - Iteration ${iterationNumber}>\n`;
        userPrompt += `Total active strategies: ${allActiveIds.length}\n`;
        userPrompt += `- Already evaluated (KEPT from before): ${keptFromBefore.join(', ')}\n`;
        userPrompt += `- UPDATED strategies to evaluate now: ${newStrategies.map(s => s.strategyId).join(', ')}\n\n`;

        userPrompt += `**YOUR TASK**: Evaluate ONLY the ${newStrategies.length} UPDATED strategies listed below.\n`;
        userPrompt += `These strategies were updated based on previous feedback. Decide if they should be KEPT or need another UPDATE.\n`;
        userPrompt += `Do NOT re-evaluate or mention the already-kept strategies in your decision output.\n\n`;

        newStrategies.forEach((strategy) => {
            userPrompt += `\n<Strategy ID: ${strategy.strategyId}>\n`;
            userPrompt += `Strategy: ${strategy.strategyText}\n\n`;
            userPrompt += `Full Solution:\n${strategy.solutionAttempt}\n\n`;
            userPrompt += `Solution Critique:\n${strategy.solutionCritique}\n`;
            userPrompt += `</Strategy ID: ${strategy.strategyId}>\n`;

            // Mark as seen
            this.seenStrategyIds.add(strategy.strategyId);
        });

        userPrompt += `\n</CURRENT ACTIVE STRATEGIES>\n\n`;
        userPrompt += `**CRITICAL**: Return decisions ONLY for these ${newStrategies.length} UPDATED strategies: ${newStrategies.map(s => s.strategyId).join(', ')}\n`;
        userPrompt += `Do NOT include decisions for already-kept strategies: ${keptFromBefore.join(', ')}\n`;
        userPrompt += `For each strategy, output: \"decision\": \"keep\" or \"decision\": \"update\"`;

        result.push({ role: 'user', content: userPrompt });

        return result;
    }

    async addFilterDecision(filterResponse: string, userPrompt: string): Promise<void> {
        // Add the user prompt first (the strategies we sent)
        await this.chatHistory.addMessage(new HumanMessage(userPrompt));
        // Then add the AI's filtering decision
        await this.chatHistory.addMessage(new AIMessage(filterResponse));
    }

    markStrategiesAsUpdated(strategyIds: string[]): void {
        // Remove updated strategies from seen set so they're re-evaluated in next iteration
        strategyIds.forEach(id => {
            const cleanId = String(id).trim().toLowerCase();
            this.seenStrategyIds.delete(cleanId);
        });
    }

    async exportState(): Promise<any> {
        const messages = await this.chatHistory.getMessages();
        return {
            systemPrompt: this.systemPrompt,
            originalProblem: this.originalProblem,
            messages: messages.map(m => ({
                role: m._getType(),
                content: m.content
            }))
        };
    }
}

/**
 * Manages conversation history for Strategies Generator Agent
 * Maintains history of what strategies were pruned/continued
 */
export class StrategiesGeneratorHistoryManager {
    private chatHistory: ChatMessageHistory;
    private systemPrompt: string;
    private originalProblem: string;

    constructor(
        systemPrompt: string,
        originalProblem: string
    ) {
        this.chatHistory = new ChatMessageHistory();
        this.systemPrompt = systemPrompt;
        this.originalProblem = originalProblem;
    }

    async buildPromptForGeneration(
        numStrategiesToGenerate: number,
        prunedStrategyIds: string[],
        continuedStrategyIds: string[],
        iterationNumber: number
    ): Promise<Array<{ role: 'system' | 'assistant' | 'user'; content: string }>> {
        const result: Array<{ role: 'system' | 'assistant' | 'user'; content: string }> = [];

        // Add conversation history
        const messages = await this.chatHistory.getMessages();
        for (const msg of messages) {
            if (msg instanceof AIMessage) {
                result.push({ role: 'assistant', content: msg.content as string });
            } else if (msg instanceof HumanMessage) {
                result.push({ role: 'user', content: msg.content as string });
            }
        }

        // Build new prompt
        let userPrompt = `Core Challenge: ${this.originalProblem}\n\n`;
        userPrompt += `<FEEDBACK FROM POST QUALITY FILTER - Iteration ${iterationNumber}>\n`;
        userPrompt += `The PostQualityFilter agent has evaluated your strategies based on their execution and critique.\n\n`;

        if (prunedStrategyIds.length > 0) {
            userPrompt += `Strategies that need UPDATE (flawed execution): ${prunedStrategyIds.join(', ')}\n`;
            userPrompt += `These strategies have been executed and critiqued, but they show fundamental issues:\n`;
            userPrompt += `- Severely flawed or way too complex to execute properly\n`;
            userPrompt += `- Completely meaningless or off-topic\n`;
            userPrompt += `- Don't fit the problem description\n`;
            userPrompt += `- Have issues that can't be fixed by execution alone\n\n`;
        }

        if (continuedStrategyIds.length > 0) {
            userPrompt += `Strategies that are KEPT (working well): ${continuedStrategyIds.join(', ')}\n`;
        }

        userPrompt += `\n</FEEDBACK FROM POST QUALITY FILTER>\n\n`;
        userPrompt += `<YOUR TASK>\n`;
        userPrompt += `UPDATE the ${numStrategiesToGenerate} flawed ${numStrategiesToGenerate === 1 ? 'strategy' : 'strategies'} listed above (${prunedStrategyIds.join(', ')}).\n`;
        userPrompt += `For each strategy ID that needs update, provide a REPLACEMENT strategy that:\n`;
        userPrompt += `- Fixes the fundamental flaws identified in the execution/critique\n`;
        userPrompt += `- Takes a completely different approach if the original was off-topic or meaningless\n`;
        userPrompt += `- Simplifies if the original was too complex\n`;
        userPrompt += `- Better fits the problem description\n\n`;

        userPrompt += `**CRITICAL**: Your updated strategies will REPLACE the old ones under the SAME IDs.\n`;
        userPrompt += `Output the updated strategies using the EXACT SAME IDs: ${prunedStrategyIds.join(', ')}\n`;
        userPrompt += `Do NOT create new IDs. Keep the same IDs so the strategies update in-place.\n`;
        userPrompt += `</YOUR TASK>`;

        result.push({ role: 'user', content: userPrompt });
        return result;
    }

    async addGeneratedStrategies(strategiesResponse: string, userPrompt: string): Promise<void> {
        // Add user prompt first, then AI response (proper conversation flow)
        await this.chatHistory.addMessage(new HumanMessage(userPrompt));
        await this.chatHistory.addMessage(new AIMessage(strategiesResponse));
    }

    async exportState(): Promise<any> {
        const messages = await this.chatHistory.getMessages();
        return {
            systemPrompt: this.systemPrompt,
            originalProblem: this.originalProblem,
            messages: messages.map(m => ({
                role: m._getType(),
                content: m.content
            }))
        };
    }
}
