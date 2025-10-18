/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StructuredRepresentation, RewardFunction, EvaluationResult, CapturedInteraction, ApplicationState, DesignSystem } from './GenerativeUICore';

export class GenerativeUIPrompts {
    
    getRequirementSpecPrompt(userQuery: string): string {
        return `
User Query: "${userQuery}"

Based on the user query provided above, generate a detailed requirement specification for a user interface. The specification should be structured as a JSON object including the following sections:
1.  **Main Goal**: A concise summary of the user's primary objective.
2.  **Key Features**: A list of essential features the interface must have to fulfill the user's request.
3.  **UI Components**: A description of the necessary UI elements (e.g., buttons, forms, charts, modals).
4.  **Interaction Styles**: The desired mode of interaction (e.g., informative, exploratory, task-oriented).
5.  **Problem-Solving Strategy**: How the interface should guide the user to their goal.
6.  **Technical Requirements**: Any implied technical needs (e.g., data visualization, real-time feedback).

Output the result as a valid JSON object with these properties:
{
    "mainGoal": "string",
    "keyFeatures": ["string"],
    "uiComponents": ["string"],
    "interactionStyles": ["string"],
    "problemSolvingStrategy": "string",
    "technicalRequirements": ["string"]
}`;
    }
    
    getStructuredRepPrompt(reqSpec: any): string {
        return `
Requirement Specification:
${JSON.stringify(reqSpec, null, 2)}

Based on the requirement specification above, generate a structured interface-specific representation. This representation must operate on two levels:
1.  **Interaction Flows**: Define the high-level user journey as a directed graph G = (V, T), where nodes (V) are interface views or subgoals and edges (T) are user-triggered transitions (e.g., button clicks).
2.  **Finite State Machines (FSMs)**: For each individual UI module, define its behavior using an FSM model M = (S, E, δ, s₀). Explicitly define states, events, transitions, and the initial state.

The final output should be a coherent and formal JSON model that explicitly defines how the interface should behave.

Output format:
{
    "interactionFlows": {
        "nodes": [
            { "id": "string", "description": "string" }
        ],
        "edges": [
            { "from": "string", "to": "string", "trigger": "string" }
        ]
    },
    "finiteStateMachines": [
        {
            "componentId": "string",
            "states": ["string"],
            "initialState": "string",
            "events": ["string"],
            "transitions": [
                { "from": "string", "to": "string", "event": "string" }
            ]
        }
    ]
}`;
    }
    
    getRewardFunctionPrompt(userQuery: string): string {
        return `
User Query: "${userQuery}"

For the user query above, generate a set of fine-grained evaluation metrics to assess the quality of a UI designed to address this query. The output should be a reward function in JSON.
For each metric, define:
- name: A high-level evaluation dimension.
- description: A brief explanation of the metric's purpose.
- criteria: A list of granular, human-interpretable checks.
- weight: The relative importance (all weights must sum to 1.0).

Output format:
{
    "metrics": [
        {
            "name": "string",
            "description": "string",
            "criteria": ["string"],
            "weight": number
        }
    ]
}

Ensure all weights sum to exactly 1.0.`;
    }
    
    getUIGenerationPrompt(
        userQuery: string,
        reqSpec: any,
        structRep: StructuredRepresentation,
        previousCode?: string,
        lastEvaluation?: EvaluationResult
    ): string {
        let prompt = `
Synthesize a complete, single-file, executable HTML user interface.
User Query: "${userQuery}"
Requirement Specification:
\`\`\`json
${JSON.stringify(reqSpec, null, 2)}
\`\`\`
Structured Interface Representation (Interaction Flows and FSMs):
\`\`\`json
${JSON.stringify(structRep, null, 2)}
\`\`\``;

        if (previousCode && lastEvaluation) {
            prompt += `

Previous UI Code:
\`\`\`html
${previousCode}
\`\`\`
Evaluation of Previous Code (Scores out of 100):
\`\`\`json
${JSON.stringify(lastEvaluation, null, 2)}
\`\`\`
Based on the evaluation, regenerate and improve the code to address identified issues and better meet the user's needs.`;
        }

        prompt += `

Instructions:
- Embed all CSS in a <style> tag.
- Embed all JavaScript in a <script> tag.
- Use no external libraries or assets.
- Create a visually appealing, responsive, and accessible UI adhering to the provided structured representation.
- Use modern CSS with gradients, shadows, and smooth transitions for a professional look.
- Ensure the interface is intuitive and user-friendly.
- Output only the raw HTML code without any markdown formatting or backticks.`;

        return prompt;
    }
    
    getEvaluationPrompt(userQuery: string, rewardFunction: RewardFunction, code: string): string {
        return `
As a UI/UX expert, evaluate the provided HTML code based on the user's query and the adaptive reward function.
User Query: "${userQuery}"
Adaptive Reward Function:
\`\`\`json
${JSON.stringify(rewardFunction, null, 2)}
\`\`\`
UI Code to Evaluate:
\`\`\`html
${code}
\`\`\`
Provide a score (0-100) and justification for each metric, plus a final weighted score. 

Output format:
{
    "metricScores": [
        {
            "name": "string (matching metric name from reward function)",
            "score": number (0-100),
            "justification": "string"
        }
    ],
    "finalScore": number (weighted average based on reward function weights)
}`;
    }

    // ========== CONTEXTUAL/INTERACTIVE MODE PROMPTS ==========

    getContextualRequirementSpecPrompt(
        originalUserIntent: string,
        interactionHistory: CapturedInteraction[],
        latestInteraction: CapturedInteraction,
        currentScreenHtml: string,
        designSystem?: DesignSystem
    ): string {
        const historyText = interactionHistory.map((interaction, idx) => {
            return `${idx + 1}. User ${interaction.type} on "${interaction.element.text || interaction.element.tag}"`;
        }).join(' → ');

        return `
Your are a brain of Generative UI system. Where a initial HTML content is already generated, user clicks something and then you have to decide what's the best possible next logical screen witthin the current screen, the user intent for button clicking, what button was clicked and it's placement etc context in mind.

CRITICAL UNDERSTANDING:
- You have PERFECT MEMORY of all previous screens through conversation history
- Each screen is EPHEMERAL and exists only for the current moment
- You can REGENERATE any previous screen instantly if the user navigates back, thus suggest deleting the old blocks or code from the current HTML while writing the code for the next screen.
- DO NOT preserve unused components/pages "just in case" - they live in your memory and so you can recall that and regenerate it the next time when the user navigates back to or something relevant is related to it.
- Focus ONLY on what's VISIBLE and RELEVANT for the next immediate screen

ENVIRONMENT:
- Original Intent: "${originalUserIntent}"
- Journey So Far: ${historyText}

CURRENT MOMENT:
User just performed: ${latestInteraction.type} on "${latestInteraction.element.text || latestInteraction.element.tag}"
Element: ${latestInteraction.element.tag}${latestInteraction.element.id ? ' #' + latestInteraction.element.id : ''}

WHAT USER SEES NOW (current screen HTML):
\`\`\`html
${currentScreenHtml}
\`\`\`

${designSystem ? `VISUAL IDENTITY (maintain consistency):
Colors: ${designSystem.colorPalette.slice(0, 3).join(', ')}
Typography: ${designSystem.typography.fonts[0]}
Spacing: ${designSystem.spacing} | Corners: ${designSystem.borderRadius}` : ''}

YOUR TASK - Specify the NEXT screen (not pages, not site structure, just the NEXT VIEW):

THINK ABOUT:
1. What does this ${latestInteraction.type} action logically lead to?
2. What should the user SEE immediately after this click?
3. What data from the current screen is relevant to carry forward?
4. Does this advance them toward "${originalUserIntent}"?
5. What's the natural next action for the user?

REQUIREMENTS:
- Specify ONLY what's visible on the next screen
- Remove any components not needed for this specific view
- Focus on aesthetics, layout, and immediate user needs
- Keep it minimal - you can regenerate other screens on demand

Output as JSON:
{
    "mainGoal": "What this next screen should accomplish",
    "keyFeatures": ["List of features for this screen"],
    "uiComponents": ["UI elements needed"],
    "dataToDisplay": {"any": "data from previous state to show"},
    "visualContinuity": "How to maintain design consistency",
    "expectedUserActions": ["What user might do next"],
    "contextualRationale": "Why this screen makes sense given the interaction"
}`;
    }

    getContextualUIGenerationPrompt(
        originalUserIntent: string,
        contextualSpec: any,
        currentScreenHtml: string,
        latestInteraction: CapturedInteraction,
        designSystem?: DesignSystem
    ): string {
        return `
You are the SYNTHESIZER in a STATEFUL, MEMORY-BASED web application. Generate the NEXT screen HTML.
Your are literally Generative UI agent. Generating next logical screens based on what user clicks.
Where a initial HTML content is already generated, user clicks something and then you have to decide what's the best possible next logical screen witthin the current screen, the user intent for button clicking, what button was clicked and it's placement etc context in mind.
Thankfully, all those context-aware, user-intent analysis have been done already so now all you have to do is just generate a HTML for the next screen.

ENVIRONMENT FACTS:
• You have PERFECT MEMORY through conversation history
• Previous screens are NOT lost - you can regenerate them instantly from memory.
• Each HTML output is EPHEMERAL - exists only for this moment
• Target: 200-300 lines of HTML (not 1000+ lines with all pages)
• Even if initial generation was 1000+ lines, you must delete the unncessary code for the next screen and focus fully on the next stage

Critical: Make sure to fully follow the received spec (the brain of the Generative UI system). Make sure the UI you generate is consistent with the original system theme, design, color philosophy and everything.

CONTEXT:
Original Intent: "${originalUserIntent}"
User's Action: ${latestInteraction.type} on "${latestInteraction.element.text || latestInteraction.element.tag}"

CURRENT SCREEN (analyze for style, state, context):
\`\`\`html
${currentScreenHtml}
\`\`\`

SPEC (what the brain decided):
\`\`\`json
${JSON.stringify(contextualSpec, null, 2)}
\`\`\`

${designSystem ? `VISUAL DNA (copy these exactly):
Primary Color: ${designSystem.colorPalette[0]}
Accent: ${designSystem.colorPalette[1] || designSystem.colorPalette[0]}
Font: ${designSystem.typography.fonts[0]}
Spacing: ${designSystem.spacing} | Radius: ${designSystem.borderRadius}` : ''}

YOUR GENERATION PHILOSOPHY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. WHAT'S VISIBLE NOW?
   Generate ONLY what the user should see after this ${latestInteraction.type}.
   Not homepage + about + contact. Just THIS screen.

2. REMOVE UNUSED COMPONENTS
   Login form not visible? Don't include it.
   Modal closed? Don't write modal HTML.
   Hidden sections? Skip them entirely.
   
3. EXTRACT & REUSE STYLES
   Study current screen HTML carefully.
   Copy exact colors, fonts, spacing, shadows, transitions.
   Don't invent new styles - REUSE what exists.

4. SMART ABOUT STATE
   If user filled form data, use it in next screen.
   If clicked "Recipe X", show Recipe X details.
   Context flows naturally, not randomly.

5. NAVIGATION IS MEMORY-BASED
   If user clicks "Back", you'll regenerate previous screen.
   Don't pre-write all nav destinations "just in case".
   Generate on-demand when clicked.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TECHNICAL REQUIREMENTS:
✓ Complete, self-contained HTML file
✓ Embedded CSS (in <style> tag)
✓ Embedded JavaScript if needed (in <script> tag)
✓ Modern, responsive design
✓ Smooth transitions and animations
✓ NO external libraries or CDN links
✓ Target ~200-300 lines (focus beats bloat)
✓ Output raw HTML only (no markdown, no backticks, no explanations)

AESTHETIC GOALS:
• Pixel-perfect visual consistency with current screen
• Beautiful, modern UI that feels professional
• Intuitive UX - user knows what to do next
• Delightful interactions and micro-animations

NOW GENERATE THE NEXT SCREEN HTML:`;
    }
}
