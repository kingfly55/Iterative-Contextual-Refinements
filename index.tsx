/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import JSZip from 'jszip';
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import hljs from 'highlight.js';
import { defaultCustomPromptsWebsite, defaultCustomPromptsReact } from './prompts';
import type { CustomizablePromptsWebsite, CustomizablePromptsReact } from './prompts';
import { 
    initializeDeepthinkModule, 
    startDeepthinkAnalysisProcess, 
    activateDeepthinkStrategyTab,
    renderActiveDeepthinkPipeline,
    setActiveDeepthinkPipelineForImport
} from './Deepthink/Deepthink';
import { CustomizablePromptsDeepthink, createDefaultCustomPromptsDeepthink } from './Deepthink/DeepthinkPrompts';

// Helper: safer JSON parsing for AI outputs
function parseJsonSafe(raw: string, context: string): any {
  try {
    // First pass: strip fences/formatting using existing cleaner
    const cleaned = cleanOutputByType(raw, 'json');
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      // Second pass: try to recover common issues
      let text = raw.trim();
      // Remove code fences
      text = text.replace(/^```[\s\S]*?\n/, '').replace(/```\s*$/m, '');
      // Extract first JSON object/array block
      const match = text.match(/([\[{][\s\S]*[\]}])/);
      if (match) text = match[1];
      // Fix trailing commas before ] or }
      text = text.replace(/,\s*(\]|\})/g, '$1');
      // Replace smart quotes
      text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
      return JSON.parse(text);
    } catch (e2) {
      try {
        // Third pass: targeted fixes for common malformed arrays/keys
        let text = raw.trim();
        // Remove fences
        text = text.replace(/^```[\s\S]*?\n/, '').replace(/```\s*$/m, '');
        // If we see an object with possibly unquoted keys (e.g., sub_strategies), quote them
        text = text.replace(/\b(sub_strategies|strategies|hypotheses)\b\s*:/g, '"$1":');
        // Capture inner-most JSON-like block
        const blockMatch = text.match(/([\[{][\s\S]*[\]}])/);
        if (blockMatch) text = blockMatch[1];
        // If array of quoted strings lacks commas, insert commas between adjacent quoted strings
        // Example: ["a" "b" "c"] => ["a", "b", "c"]
        text = text.replace(/"\s+"/g, '", "');
        // Also between "] [" patterns just in case
        text = text.replace(/"\s*\]\s*\[\s*"/g, '"], ["');
        // Fix trailing commas again
        text = text.replace(/,\s*(\]|\})/g, '$1');
        return JSON.parse(text);
      } catch (e3) {
        console.error(`JSON parse failed in ${context}:`, e2);
        throw e3;
      }
    }
  }
}

// Constants for retry logic
const MAX_RETRIES = 3; // Max number of retries for API errors
const INITIAL_DELAY_MS = 2000; // Initial delay in milliseconds
const BACKOFF_FACTOR = 2; // Factor by which delay increases

/**
 * Custom error class to signify that pipeline processing was intentionally
 * stopped by a user request.
 */
class PipelineStopRequestedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PipelineStopRequestedError";
    }
}

type ApplicationMode = 'website' | 'deepthink' | 'react';

interface IterationData {
    iterationNumber: number;
    title: string;
    // Website Mode Specific
    requestPromptHtml_InitialGenerate?: string;
    requestPromptHtml_FeatureImplement?: string;
    requestPromptHtml_BugFix?: string;
    requestPromptFeatures_Suggest?: string;
    generatedHtml?: string;
    generatedRawHtml?: string; // Raw output from Request 1 (before bug fixing)
    suggestedFeatures?: string[]; // Used by Website for general suggestions

    // Diff-format patches provided by model for this iteration's target content (if any)
    providedPatchesJson?: string; // Raw JSON string (array or object with { patches: [...] })
    providedPatchesContentType?: string; // e.g., 'html', 'text', 'markdown', 'python'

    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
}

interface PipelineState {
    id: number;
    originalTemperatureIndex: number;
    temperature: number;
    modelName: string;
    iterations: IterationData[];
    status: 'idle' | 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';
    tabButtonElement?: HTMLButtonElement;
    contentElement?: HTMLElement;
    stopButtonElement?: HTMLButtonElement;
    isStopRequested?: boolean;
}


interface DeepthinkSubStrategyData {
    id: string; // e.g., "main1-sub1"
    subStrategyText: string;
    requestPromptSolutionAttempt?: string;
    solutionAttempt?: string;

    // New fields for self-improvement and refinement
    requestPromptSelfImprovement?: string;
    refinedSolution?: string;
    selfImprovementStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    selfImprovementError?: string;
    selfImprovementRetryAttempt?: number;

    // Red Team evaluation
    isKilledByRedTeam?: boolean; // Whether this sub-strategy was killed by Red Team
    redTeamReason?: string; // Reason provided by Red Team for killing

    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
    subStrategyFormat?: string;
}

// Deepthink Hypothesis Explorer interfaces
interface DeepthinkHypothesisData {
    id: string; // e.g., "hyp1", "hyp2", "hyp3"
    hypothesisText: string;

    // Hypothesis tester agent data
    testerRequestPrompt?: string;
    testerAttempt?: string;
    testerStatus: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    testerError?: string;
    testerRetryAttempt?: number;

    // Final status determination
    finalStatus: 'pending' | 'validated' | 'refuted' | 'unresolved' | 'contradiction' | 'needs_further_analysis';
    isDetailsOpen?: boolean;
}

// Deepthink Red Team Agent Interface
interface DeepthinkRedTeamData {
    id: string; // e.g., "redteam-1", "redteam-2", "redteam-3"
    assignedStrategyId: string; // The main strategy ID this red team agent evaluates
    requestPrompt?: string;
    evaluationResponse?: string;
    killedStrategyIds: string[]; // IDs of strategies killed (main strategy or sub-strategy IDs)
    killedSubStrategyIds: string[]; // IDs of sub-strategies killed
    reasoning?: string; // Red team's reasoning for their decisions
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
}

interface DeepthinkMainStrategyData {
    id: string; // e.g., "main1"
    strategyText: string;
    requestPromptSubStrategyGen?: string;
    subStrategies: DeepthinkSubStrategyData[];
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled'; // for sub-strategy generation
    error?: string; // error during sub-strategy generation for this main strategy
    isDetailsOpen?: boolean;
    retryAttempt?: number; // for sub-strategy generation step

    // Red Team evaluation
    isKilledByRedTeam?: boolean; // Whether this entire strategy was killed by Red Team
    redTeamReason?: string; // Reason provided by Red Team for killing

    // New fields for judging sub-strategies
    judgedBestSubStrategyId?: string;
    judgedBestSolution?: string; // The full text of the best solution with reasoning.
    judgingRequestPrompt?: string;
    judgingResponseText?: string; // The raw response from the judge
    judgingStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    judgingError?: string;
    judgingRetryAttempt?: number;
    strategyFormat?: string;
}

interface DeepthinkPipelineState {
    id: string; // unique ID for this deepthink challenge instance
    challengeText: string;
    challengeImageBase64?: string | null; // Base64 encoded image
    challengeImageMimeType?: string;
    requestPromptInitialStrategyGen?: string;
    initialStrategies: DeepthinkMainStrategyData[];
    status: 'idle' | 'processing' | 'retrying' | 'completed' | 'error' | 'stopping' | 'stopped' | 'cancelled'; // Overall status
    error?: string; // Overall error for the whole process
    isStopRequested?: boolean;
    activeTabId?: string; // e.g., "challenge-details", "strategic-solver", "hypothesis-explorer", "final-result"
    activeStrategyTab?: number;
    retryAttempt?: number; // for initial strategy generation step

    // New fields for Hypothesis Explorer (Track B)
    requestPromptHypothesisGen?: string;
    hypotheses: DeepthinkHypothesisData[];
    hypothesisGenStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    hypothesisGenError?: string;
    hypothesisGenRetryAttempt?: number;

    // Knowledge packet synthesized from hypothesis exploration
    knowledgePacket?: string;

    // Red Team agents for strategy evaluation
    redTeamAgents: DeepthinkRedTeamData[];
    redTeamStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    redTeamError?: string;

    // Synchronization flags
    strategicSolverComplete?: boolean; // Track A completion
    hypothesisExplorerComplete?: boolean; // Track B completion
    redTeamComplete?: boolean; // Red Team evaluation completion

    // New fields for final judging
    finalJudgedBestStrategyId?: string;
    finalJudgedBestSolution?: string;
    finalJudgingRequestPrompt?: string;
    finalJudgingResponseText?: string;
    finalJudgingStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    finalJudgingError?: string;
    finalJudgingRetryAttempt?: number;
    finalJudgingStatusDescription?: string;
}




interface ExportedConfig {
    currentMode: ApplicationMode;
    initialIdea: string;
    selectedModel: string;
    selectedOriginalTemperatureIndices: number[]; // For website
    pipelinesState: PipelineState[]; // For website
    activeDeepthinkPipeline?: DeepthinkPipelineState | null; // For deepthink
    activeReactPipeline: ReactPipelineState | null; // Added for React mode
    activePipelineId: number | null; // For website
    activeDeepthinkProblemTabId?: string; // For deepthink UI
    globalStatusText: string;
    globalStatusClass: string;
    customPromptsWebsite: CustomizablePromptsWebsite;
    customPromptsDeepthink?: CustomizablePromptsDeepthink;
    customPromptsReact: CustomizablePromptsReact; // Added for React mode
    isCustomPromptsOpen?: boolean;
}

// React Mode Specific Interfaces
export interface ReactModeStage { // Exporting for potential use elsewhere, though primarily internal
    id: number; // 0-4 for the 5 worker agents
    title: string; // e.g., "Agent 1: UI Components" - defined by Orchestrator
    systemInstruction?: string; // Generated by Orchestrator for this worker agent
    userPrompt?: string; // Generated by Orchestrator for this worker agent (can be a template)
    renderedUserPrompt?: string; // If the userPrompt is a template
    generatedContent?: string; // Code output from this worker agent
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    isDetailsOpen?: boolean;
    retryAttempt?: number;
}

export interface ReactPipelineState { // Exporting for potential use elsewhere
    id: string; // Unique ID for this React mode process run
    userRequest: string;
    orchestratorSystemInstruction: string; // The system prompt used for the orchestrator
    orchestratorPlan?: string; // plan.txt generated by Orchestrator
    orchestratorRawOutput?: string; // Full raw output from orchestrator (for debugging/inspection)
    stages: ReactModeStage[]; // Array of 5 worker agent stages
    finalAppendedCode?: string; // Combined code from all worker agents
    status: 'idle' | 'orchestrating' | 'processing_workers' | 'completed' | 'error' | 'stopping' | 'stopped' | 'cancelled' | 'orchestrating_retrying' | 'failed';
    error?: string;
    isStopRequested?: boolean;
    activeTabId?: string; // To track which of the 5 worker agent tabs is active in UI, e.g., "worker-0", "worker-1"
    orchestratorRetryAttempt?: number;
}



const NUM_WEBSITE_REFINEMENT_ITERATIONS = 3;
const TOTAL_STEPS_WEBSITE = 1 + NUM_WEBSITE_REFINEMENT_ITERATIONS + 1;



export const NUM_INITIAL_STRATEGIES_DEEPTHINK = 3;
export const NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK = 3;

// Function to get selected model from dropdown
function getSelectedModel(): string {
    return modelSelectElement?.value || 'gemini-2.5-pro';
}

function getSelectedTemperature(): number {
    const temp = parseFloat(temperatureSlider?.value || '0.7');
    return Math.max(0, Math.min(2, temp)); // Clamp between 0 and 2
}

function getSelectedTopP(): number {
    const topP = parseFloat(topPSlider?.value || '0.95');
    return Math.max(0, Math.min(1, topP)); // Clamp between 0 and 1
}

function getSelectedStrategiesCount(): number {
    const strategies = parseInt(strategiesSlider?.value || '3');
    return Math.max(1, Math.min(10, strategies)); // Clamp between 1 and 10
}

function getSelectedSubStrategiesCount(): number {
    return subStrategiesSlider ? parseInt(subStrategiesSlider.value) : 3;
}

// Function to get selected hypothesis count
function getSelectedHypothesisCount(): number {
    return hypothesisSlider ? parseInt(hypothesisSlider.value) : 4;
}

// Function to get selected red team aggressiveness
function getSelectedRedTeamAggressiveness(): string {
    const redTeamButtons = document.querySelectorAll('.red-team-button');
    for (const button of redTeamButtons) {
        if ((button as HTMLElement).classList.contains('active')) {
            return (button as HTMLElement).dataset.value || 'balanced';
        }
    }
    return 'balanced';
}

// Function to get refinement toggle state
function getRefinementEnabled(): boolean {
    return refinementToggle ? refinementToggle.checked : false;
}


const temperatures = [0, 0.7, 1.0, 1.5, 2.0];

let pipelinesState: PipelineState[] = [];
let activeDeepthinkPipeline: DeepthinkPipelineState | null = null; // Added for Deepthink mode
let activeReactPipeline: ReactPipelineState | null = null; // Added for React mode
let ai: GoogleGenAI | null = null;
let activePipelineId: number | null = null;
let isGenerating = false;
let currentMode: ApplicationMode = 'website';
let currentProblemImageBase64: string | null = null;
let currentProblemImageMimeType: string | null = null;
// This variable is no longer used for the modal state but can be kept for config export/import
let isCustomPromptsOpen = false;


let customPromptsWebsiteState: CustomizablePromptsWebsite = JSON.parse(JSON.stringify(defaultCustomPromptsWebsite));
let customPromptsDeepthinkState: CustomizablePromptsDeepthink = createDefaultCustomPromptsDeepthink(NUM_INITIAL_STRATEGIES_DEEPTHINK, NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK);

// Function to update deepthink prompts with current slider values
function updateDeepthinkPromptsState() {
    const currentStrategiesCount = getSelectedStrategiesCount();
    const currentSubStrategiesCount = getSelectedSubStrategiesCount();
    const currentHypothesisCount = getSelectedHypothesisCount();
    const currentRedTeamAggressiveness = getSelectedRedTeamAggressiveness();
    customPromptsDeepthinkState = createDefaultCustomPromptsDeepthink(currentStrategiesCount, currentSubStrategiesCount, currentHypothesisCount, currentRedTeamAggressiveness);
}
let customPromptsReactState: CustomizablePromptsReact = JSON.parse(JSON.stringify(defaultCustomPromptsReact)); // Added for React mode


const apiKeyStatusElement = document.getElementById('api-key-status') as HTMLParagraphElement;
const apiKeyFormContainer = document.getElementById('api-key-form-container') as HTMLElement;
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
const saveApiKeyButton = document.getElementById('save-api-key-button') as HTMLButtonElement;
const clearApiKeyButton = document.getElementById('clear-api-key-button') as HTMLButtonElement;
const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;
const initialIdeaLabel = document.getElementById('initial-idea-label') as HTMLLabelElement;
const modelSelectionContainer = document.getElementById('model-selection-container') as HTMLElement;
const modelSelectElement = document.getElementById('model-select') as HTMLSelectElement;
const modelParametersContainer = document.getElementById('model-parameters-container') as HTMLElement;
const temperatureSlider = document.getElementById('temperature-slider') as HTMLInputElement;
const topPSlider = document.getElementById('top-p-slider') as HTMLInputElement;
const strategiesSlider = document.getElementById('strategies-slider') as HTMLInputElement;
const subStrategiesSlider = document.getElementById('sub-strategies-slider') as HTMLInputElement;
const hypothesisSlider = document.getElementById('hypothesis-slider') as HTMLInputElement;
// Red team slider removed - now using button toggles
const refinementToggle = document.getElementById('refinement-toggle') as HTMLInputElement;
const temperatureValue = document.getElementById('temperature-value') as HTMLSpanElement;
const topPValue = document.getElementById('top-p-value') as HTMLSpanElement;
const strategiesValue = document.getElementById('strategies-value') as HTMLSpanElement;
const subStrategiesValue = document.getElementById('sub-strategies-value') as HTMLSpanElement;
const hypothesisValue = document.getElementById('hypothesis-value') as HTMLSpanElement;
// Red team value span removed - now using button toggles
const temperatureSelectionContainer = document.getElementById('temperature-selection-container') as HTMLElement;

// Add event listeners for sliders to update display values
function initializeSliderEventListeners() {
    if (temperatureSlider && temperatureValue) {
        temperatureSlider.addEventListener('input', () => {
            temperatureValue.textContent = temperatureSlider.value;
        });
    }
    
    if (topPSlider && topPValue) {
        topPSlider.addEventListener('input', () => {
            topPValue.textContent = topPSlider.value;
        });
    }
    
    if (strategiesSlider && strategiesValue) {
        strategiesSlider.addEventListener('input', () => {
            strategiesValue.textContent = strategiesSlider.value;
        });
    }
    
    if (subStrategiesSlider && subStrategiesValue) {
        subStrategiesSlider.addEventListener('input', () => {
            subStrategiesValue.textContent = subStrategiesSlider.value;
        });
    }
    
    if (hypothesisSlider && hypothesisValue) {
        hypothesisSlider.addEventListener('input', () => {
            hypothesisValue.textContent = hypothesisSlider.value;
            // Update deepthink prompts state when slider changes
            updateDeepthinkPromptsState();
        });
    }
    
    // Add event listeners for red team buttons
    const redTeamButtons = document.querySelectorAll('.red-team-button');
    redTeamButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            redTeamButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update deepthink prompts state when selection changes
            updateDeepthinkPromptsState();
        });
    });
}
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const tabsNavContainer = document.getElementById('tabs-nav-container') as HTMLElement;
const pipelinesContentContainer = document.getElementById('pipelines-content-container') as HTMLElement;
const globalStatusDiv = document.getElementById('global-status') as HTMLElement;
const pipelineSelectorsContainer = document.getElementById('pipeline-selectors-container') as HTMLElement;
const appModeSelector = document.getElementById('app-mode-selector') as HTMLElement;


// Custom Prompts Modal Elements
const promptsModalOverlay = document.getElementById('prompts-modal-overlay') as HTMLElement;
const promptsModalCloseButton = document.getElementById('prompts-modal-close-button') as HTMLButtonElement;
const customizePromptsTrigger = document.getElementById('customize-prompts-trigger') as HTMLElement;

// Diff Modal Elements
const diffModalOverlay = document.getElementById('diff-modal-overlay') as HTMLElement;
const diffModalCloseButton = document.getElementById('diff-modal-close-button') as HTMLButtonElement;
const diffSourceLabel = document.getElementById('diff-source-label') as HTMLParagraphElement;
const diffTargetTreeContainer = document.getElementById('diff-target-tree') as HTMLElement;
const diffViewerPanel = document.getElementById('diff-viewer-panel') as HTMLElement;

const exportConfigButton = document.getElementById('export-config-button') as HTMLButtonElement;
const importConfigInput = document.getElementById('import-config-input') as HTMLInputElement;
const importConfigLabel = document.getElementById('import-config-label') as HTMLLabelElement;

const customPromptTextareasWebsite: { [K in keyof CustomizablePromptsWebsite]: HTMLTextAreaElement | null } = {
    sys_initialGen: document.getElementById('sys-initial-gen') as HTMLTextAreaElement,
    user_initialGen: document.getElementById('user-initial-gen') as HTMLTextAreaElement,
    sys_initialBugFix: document.getElementById('sys-initial-bugfix') as HTMLTextAreaElement,
    user_initialBugFix: document.getElementById('user-initial-bugfix') as HTMLTextAreaElement,
    sys_initialFeatureSuggest: document.getElementById('sys-initial-features') as HTMLTextAreaElement,
    user_initialFeatureSuggest: document.getElementById('user-initial-features') as HTMLTextAreaElement,
    sys_refineStabilizeImplement: document.getElementById('sys-refine-implement') as HTMLTextAreaElement,
    user_refineStabilizeImplement: document.getElementById('user-refine-implement') as HTMLTextAreaElement,
    sys_refineBugFix: document.getElementById('sys-refine-bugfix') as HTMLTextAreaElement,
    user_refineBugFix: document.getElementById('user-refine-bugfix') as HTMLTextAreaElement,
    sys_refineFeatureSuggest: document.getElementById('sys-refine-features') as HTMLTextAreaElement,
    user_refineFeatureSuggest: document.getElementById('user-refine-features') as HTMLTextAreaElement,
    sys_finalPolish: document.getElementById('sys-final-polish') as HTMLTextAreaElement,
    user_finalPolish: document.getElementById('user-final-polish') as HTMLTextAreaElement,
};

const customPromptTextareasDeepthink: { [K in keyof CustomizablePromptsDeepthink]: HTMLTextAreaElement | null } = {
    sys_deepthink_initialStrategy: document.getElementById('sys-deepthink-initial-strategy') as HTMLTextAreaElement,
    user_deepthink_initialStrategy: document.getElementById('user-deepthink-initial-strategy') as HTMLTextAreaElement,
    sys_deepthink_subStrategy: document.getElementById('sys-deepthink-sub-strategy') as HTMLTextAreaElement,
    user_deepthink_subStrategy: document.getElementById('user-deepthink-sub-strategy') as HTMLTextAreaElement,
    sys_deepthink_solutionAttempt: document.getElementById('sys-deepthink-solution-attempt') as HTMLTextAreaElement,
    user_deepthink_solutionAttempt: document.getElementById('user-deepthink-solution-attempt') as HTMLTextAreaElement,
    sys_deepthink_selfImprovement: document.getElementById('sys-deepthink-self-improvement') as HTMLTextAreaElement,
    user_deepthink_selfImprovement: document.getElementById('user-deepthink-self-improvement') as HTMLTextAreaElement,
    sys_deepthink_hypothesisGeneration: document.getElementById('sys-deepthink-hypothesis-generation') as HTMLTextAreaElement,
    user_deepthink_hypothesisGeneration: document.getElementById('user-deepthink-hypothesis-generation') as HTMLTextAreaElement,
    sys_deepthink_hypothesisTester: document.getElementById('sys-deepthink-hypothesis-tester') as HTMLTextAreaElement,
    user_deepthink_hypothesisTester: document.getElementById('user-deepthink-hypothesis-tester') as HTMLTextAreaElement,
    sys_deepthink_redTeam: document.getElementById('sys-deepthink-red-team') as HTMLTextAreaElement,
    user_deepthink_redTeam: document.getElementById('user-deepthink-red-team') as HTMLTextAreaElement,
    sys_deepthink_judge: document.getElementById('sys-deepthink-judge') as HTMLTextAreaElement,
    sys_deepthink_finalJudge: document.getElementById('sys-deepthink-final-judge') as HTMLTextAreaElement,
};

const customPromptTextareasReact: { [K in keyof CustomizablePromptsReact]: HTMLTextAreaElement | null } = { // Added for React mode
    sys_orchestrator: document.getElementById('sys-react-orchestrator') as HTMLTextAreaElement,
    user_orchestrator: document.getElementById('user-react-orchestrator') as HTMLTextAreaElement,
};

function initializeApiKey() {
    let statusMessage = "";
    let isKeyAvailable = false;
    let currentApiKey: string | null = null;

    // Hide form elements by default
    apiKeyFormContainer.style.display = 'none';
    saveApiKeyButton.style.display = 'none';
    clearApiKeyButton.style.display = 'none';
    apiKeyInput.style.display = 'none';

    const envKey = process.env.API_KEY;

    if (envKey) {
        statusMessage = "API Key loaded from environment.";
        isKeyAvailable = true;
        currentApiKey = envKey;
        apiKeyStatusElement.className = 'api-key-status-message status-badge status-ok';
    } else {
        apiKeyFormContainer.style.display = 'flex'; // Show the container for input/buttons
        const storedKey = localStorage.getItem('gemini-api-key');
        if (storedKey) {
            statusMessage = "Using API Key from local storage.";
            isKeyAvailable = true;
            currentApiKey = storedKey;
            apiKeyStatusElement.className = 'api-key-status-message status-badge status-ok';
            clearApiKeyButton.style.display = 'inline-flex'; // Show clear button
        } else {
            statusMessage = "API Key not found. Please provide one.";
            isKeyAvailable = false;
            apiKeyStatusElement.className = 'api-key-status-message status-badge status-error';
            apiKeyInput.style.display = 'block'; // Show input field
            saveApiKeyButton.style.display = 'inline-flex'; // Show save button
        }
    }

    if (apiKeyStatusElement) {
        apiKeyStatusElement.textContent = statusMessage;
    }

    if (isKeyAvailable && currentApiKey) {
        try {
            ai = new GoogleGenAI({ apiKey: currentApiKey });
            if (generateButton) generateButton.disabled = isGenerating;
            return true;
        } catch (e: any) {
            console.error("Failed to initialize GoogleGenAI:", e);
            if (apiKeyStatusElement) {
                apiKeyStatusElement.textContent = `API Init Error`;
                apiKeyStatusElement.className = 'api-key-status-message status-badge status-error';
                apiKeyStatusElement.title = `Error: ${e.message}`;
            }
            if (generateButton) generateButton.disabled = true;
            ai = null;
            return false;
        }
    } else {
        if (generateButton) generateButton.disabled = true;
        ai = null;
        return false;
    }
}


function initializeCustomPromptTextareas() {
    // Website Prompts
    for (const key in customPromptTextareasWebsite) {
        const k = key as keyof CustomizablePromptsWebsite;
        const textarea = customPromptTextareasWebsite[k];
        if (textarea) {
            textarea.value = customPromptsWebsiteState[k];
            textarea.addEventListener('input', (e) => {
                customPromptsWebsiteState[k] = (e.target as HTMLTextAreaElement).value;
            });
        }
    }

    // Deepthink Prompts
    for (const key in customPromptTextareasDeepthink) {
        const k = key as keyof CustomizablePromptsDeepthink;
        const textarea = customPromptTextareasDeepthink[k];
        if (textarea) {
            textarea.value = customPromptsDeepthinkState[k];
            textarea.addEventListener('input', (e) => {
                customPromptsDeepthinkState[k] = (e.target as HTMLTextAreaElement).value;
            });
        }
    }
    // React Prompts (for Orchestrator)
    for (const key in customPromptTextareasReact) {
        const k = key as keyof CustomizablePromptsReact;
        const textarea = customPromptTextareasReact[k];
        if (textarea) {
            textarea.value = customPromptsReactState[k];
            textarea.addEventListener('input', (e) => {
                customPromptsReactState[k] = (e.target as HTMLTextAreaElement).value;
            });
        }
    }
}

function updateCustomPromptTextareasFromState() {
    for (const key in customPromptTextareasWebsite) {
        const k = key as keyof CustomizablePromptsWebsite;
        const textarea = customPromptTextareasWebsite[k];
        if (textarea) textarea.value = customPromptsWebsiteState[k];
    }
    for (const key in customPromptTextareasDeepthink) {
        const k = key as keyof CustomizablePromptsDeepthink;
        const textarea = customPromptTextareasDeepthink[k];
        if (textarea) textarea.value = customPromptsDeepthinkState[k];
    }
    for (const key in customPromptTextareasReact) { // Added for React mode
        const k = key as keyof CustomizablePromptsReact;
        const textarea = customPromptTextareasReact[k];
        if (textarea) textarea.value = customPromptsReactState[k];
    }
}

const promptNavStructure = {
    website: [
        { groupTitle: "1. Initial Generation & Analysis", prompts: ["initial-gen", "initial-bugfix", "initial-features"] },
        { groupTitle: "2. Refinement Cycle", prompts: ["refine-implement", "refine-bugfix", "refine-features"] },
        { groupTitle: "3. Final Polish", prompts: ["final-polish"] }
    ],
    deepthink: [
        { groupTitle: "1. Strategic Solver", prompts: ["deepthink-initial-strategy", "deepthink-sub-strategy", "deepthink-solution-attempt", "deepthink-self-improvement"] },
        { groupTitle: "2. Hypothesis Explorer", prompts: ["deepthink-hypothesis-generation", "deepthink-prover", "deepthink-disprover"] },
        { groupTitle: "3. Red Team Evaluator", prompts: ["deepthink-red-team"] }
    ],
    react: [
        { groupTitle: "Orchestrator Agent", prompts: ["react-orchestrator"] }
    ]
};

function initializePromptsModal() {
    const navContainer = document.getElementById('prompts-modal-nav');
    const contentContainer = document.getElementById('prompts-modal-content');
    if (!navContainer || !contentContainer) return;

    // Clear previous state
    navContainer.innerHTML = '';
    contentContainer.querySelectorAll('.prompts-mode-container').forEach(el => el.classList.remove('active'));
    contentContainer.querySelectorAll('.prompt-content-pane').forEach(el => el.classList.remove('active'));

    const activeModeContainer = document.getElementById(`${currentMode}-prompts-container`);
    if (!activeModeContainer) return;

    activeModeContainer.classList.add('active');

    // Display current mode at the top of nav
    const modeTitle = document.createElement('h4');
    modeTitle.className = 'prompts-nav-mode-title';
    modeTitle.textContent = `${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} Mode Prompts`;
    navContainer.appendChild(modeTitle);

    const navStructure = promptNavStructure[currentMode as keyof typeof promptNavStructure];
    if (!navStructure) return;

    let firstNavItem: HTMLElement | null = null;

    navStructure.forEach(group => {
        const groupTitleEl = document.createElement('h5');
        groupTitleEl.className = 'prompts-nav-group-title';
        groupTitleEl.textContent = group.groupTitle;
        navContainer.appendChild(groupTitleEl);

        group.prompts.forEach(promptKey => {
            const pane = activeModeContainer.querySelector<HTMLElement>(`.prompt-content-pane[data-prompt-key="${promptKey}"]`);
            if (!pane) return;

            const titleElement = pane.querySelector<HTMLHeadingElement>('.prompt-pane-title');
            const title = titleElement ? titleElement.textContent : 'Unnamed Section';

            const navItem = document.createElement('div');
            navItem.className = 'prompts-nav-item';
            navItem.textContent = title;
            navItem.dataset.targetPane = promptKey;
            navContainer.appendChild(navItem);

            if (!firstNavItem) {
                firstNavItem = navItem;
            }

            navItem.addEventListener('click', () => {
                // Deactivate all nav items and panes first
                navContainer.querySelectorAll('.prompts-nav-item').forEach(item => item.classList.remove('active'));
                activeModeContainer.querySelectorAll('.prompt-content-pane').forEach(p => p.classList.remove('active'));

                // Activate the clicked one
                navItem.classList.add('active');
                pane.classList.add('active');
            });
        });
    });

    // Activate the first one by default
    if (firstNavItem) {
        firstNavItem.click();
    }
}


function setPromptsModalVisible(visible: boolean) {
    if (promptsModalOverlay) {
        if (visible) {
            initializePromptsModal(); // Re-initialize on open to reflect current mode
            promptsModalOverlay.style.display = 'flex';
            setTimeout(() => {
                promptsModalOverlay.classList.add('is-visible');
            }, 10);
        } else {
            promptsModalOverlay.classList.remove('is-visible');
            promptsModalOverlay.addEventListener('transitionend', () => {
                if (!promptsModalOverlay.classList.contains('is-visible')) {
                    promptsModalOverlay.style.display = 'none';
                }
            }, { once: true });
        }
    }
}

function updateUIAfterModeChange() {
    // Visibility of prompt containers is now handled by CSS classes and initializePromptsModal
    const allPromptContainers = document.querySelectorAll('.prompts-mode-container');
    allPromptContainers.forEach(container => container.classList.remove('active'));
    const activeContainer = document.getElementById(`${currentMode}-prompts-container`);
    if (activeContainer) activeContainer.classList.add('active');
    
    // Reinitialize sidebar controls after mode change
    setTimeout(() => {
        if ((window as any).reinitializeSidebarControls) {
            (window as any).reinitializeSidebarControls();
        }
    }, 100);

    // Default UI states
    if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
    if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
    if (temperatureSelectionContainer) temperatureSelectionContainer.style.display = 'block';

    const generateButtonText = generateButton?.querySelector('.button-text');

    if (currentMode === 'website') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Website Idea:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "A portfolio website for a photographer", "An e-commerce site for handmade crafts"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate Website';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'none';
        if (temperatureSelectionContainer) temperatureSelectionContainer.style.display = 'block';
    } else if (currentMode === 'deepthink') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Core Challenge:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Design a sustainable urban transportation system", "Analyze the impact of remote work on company culture"...';
        if (generateButtonText) generateButtonText.textContent = 'Deepthink';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (temperatureSelectionContainer) temperatureSelectionContainer.style.display = 'none';
    } else if (currentMode === 'react') { // Added for React mode
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'React App Request:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "A simple to-do list app with local storage persistence", "A weather dashboard using OpenWeatherMap API"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate React App';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'none';
        if (temperatureSelectionContainer) temperatureSelectionContainer.style.display = 'block';
    }

    if (!isGenerating) {
        pipelinesState = [];
        activeReactPipeline = null;
        renderPipelines();
        renderReactModePipeline();
    }
    updateControlsState();
}


function renderPrompt(template: string, data: Record<string, string>): string {
    let rendered = template;
    for (const key in data) {
        rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), data[key] || '');
    }
    return rendered;
}
function renderPipelineSelectors() {
    if (!pipelineSelectorsContainer) return;
    pipelineSelectorsContainer.innerHTML = ''; // Clear existing
    temperatures.forEach((temp, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'pipeline-selector-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `pipeline-selector-${index}`;
        checkbox.value = temp.toString();
        checkbox.checked = true; // Default to checked
        checkbox.dataset.temperatureIndex = index.toString();


        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `Variant (T: ${temp.toFixed(1)})`; // Changed label for more generic usage

        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(label);
        pipelineSelectorsContainer.appendChild(itemDiv);

        checkbox.addEventListener('change', () => {
            updateControlsState();
        });
    });
    updateControlsState(); // Initial state
}

function getSelectedTemperatures(): { temp: number, originalIndex: number }[] {
    const selected: { temp: number, originalIndex: number }[] = [];
    if (pipelineSelectorsContainer) {
        const checkboxes = pipelineSelectorsContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            const tempValue = parseFloat(checkbox.value);
            const originalIndex = parseInt(checkbox.dataset.temperatureIndex || "-1", 10);
            if (!isNaN(tempValue) && originalIndex !== -1) {
                selected.push({ temp: tempValue, originalIndex });
            }
        });
    }
    return selected;
}

function updateControlsState() {
    const anyPipelineRunningOrStopping = pipelinesState.some(p => p.status === 'running' || p.status === 'stopping');
    const deepthinkPipelineRunningOrStopping = activeDeepthinkPipeline?.status === 'processing' || activeDeepthinkPipeline?.status === 'stopping';
    const reactPipelineRunningOrStopping = activeReactPipeline?.status === 'orchestrating' || activeReactPipeline?.status === 'processing_workers' || activeReactPipeline?.status === 'stopping'; // Added for React
    isGenerating = anyPipelineRunningOrStopping  || deepthinkPipelineRunningOrStopping || reactPipelineRunningOrStopping;

    const isApiKeyReady = !!ai;

    if (generateButton) {
        let disabled = isGenerating || !isApiKeyReady;
        if (!disabled) {
            if (currentMode === 'deepthink') {
                // Enabled if not generating
            } else if (currentMode === 'react') {
                // Enabled if not generating
            } else if (currentMode === 'website') { // website only
                const selectedTemps = getSelectedTemperatures();
                disabled = selectedTemps.length === 0;
            }
        }
        generateButton.disabled = disabled;
    }

    if (exportConfigButton) exportConfigButton.disabled = isGenerating;
    if (importConfigInput) importConfigInput.disabled = isGenerating;
    if (importConfigLabel) importConfigLabel.classList.toggle('disabled', isGenerating);
    if (initialIdeaInput) initialIdeaInput.disabled = isGenerating;

    if (modelSelectElement) modelSelectElement.disabled = isGenerating;
    if (temperatureSlider) temperatureSlider.disabled = isGenerating;
    if (topPSlider) topPSlider.disabled = isGenerating;
    if (strategiesSlider) strategiesSlider.disabled = isGenerating;
    if (subStrategiesSlider) subStrategiesSlider.disabled = isGenerating;
    if (hypothesisSlider) hypothesisSlider.disabled = isGenerating;
    // Disable red team buttons during generation
    const redTeamButtons = document.querySelectorAll('.red-team-button');
    redTeamButtons.forEach(button => {
        (button as HTMLButtonElement).disabled = isGenerating;
    });
    if (refinementToggle) refinementToggle.disabled = isGenerating;
    if (pipelineSelectorsContainer) {
        const disableSelectors = isGenerating || currentMode === 'deepthink' || currentMode === 'react';
        pipelineSelectorsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb as HTMLInputElement).disabled = disableSelectors);
        const pipelineSelectHeading = document.getElementById('pipeline-select-heading');
        if (pipelineSelectHeading) {
            const parentSection = pipelineSelectHeading.closest('.sidebar-section-content');
            parentSection?.classList.toggle('disabled', disableSelectors);
        }
    }

    // Allow user to select any model for deepthink mode
    // Removed forced model selection override

    // Block ALL sidebar controls during generation in ANY mode
    if (appModeSelector) {
        appModeSelector.querySelectorAll('input[type="radio"]').forEach(rb => (rb as HTMLInputElement).disabled = isGenerating);
        appModeSelector.style.pointerEvents = isGenerating ? 'none' : 'auto';
        appModeSelector.style.opacity = isGenerating ? '0.6' : '1';
    }

    if (customizePromptsTrigger) {
        const parentSection = customizePromptsTrigger.closest('.sidebar-section');
        parentSection?.classList.toggle('disabled', isGenerating);
        customizePromptsTrigger.style.pointerEvents = isGenerating ? 'none' : 'auto';
        customizePromptsTrigger.style.opacity = isGenerating ? '0.6' : '1';
    }

    // Block model selection container
    if (modelSelectionContainer) {
        modelSelectionContainer.style.pointerEvents = isGenerating ? 'none' : 'auto';
        modelSelectionContainer.style.opacity = isGenerating ? '0.6' : '1';
    }

    // Block temperature selection container
    if (temperatureSelectionContainer) {
        temperatureSelectionContainer.style.pointerEvents = isGenerating ? 'none' : 'auto';
        temperatureSelectionContainer.style.opacity = isGenerating ? '0.6' : '1';
    }

    // Block entire sidebar during generation
    const controlsSidebar = document.getElementById('controls-sidebar');
    if (controlsSidebar) {
        controlsSidebar.style.pointerEvents = isGenerating ? 'none' : 'auto';
        controlsSidebar.style.opacity = isGenerating ? '0.6' : '1';
    }
}


function initPipelines() {
    const selectedModel = modelSelectElement.value;
    const selectedTempsWithOriginalIndices = getSelectedTemperatures();
    let totalSteps: number;
    let numRefinementIterations: number;

    switch (currentMode) {
        case 'website':
            totalSteps = TOTAL_STEPS_WEBSITE;
            numRefinementIterations = NUM_WEBSITE_REFINEMENT_ITERATIONS;
            break;
        default:
            return;
    }


    pipelinesState = selectedTempsWithOriginalIndices.map(({ temp, originalIndex }, pipelineIndex) => {
        const iterations: IterationData[] = [];
        for (let i = 0; i < totalSteps; i++) {
            let title = '';
            if (currentMode === 'website') {
                if (i === 0) title = 'Initial Gen, Fix & Suggest';
                else if (i <= numRefinementIterations) title = `Refine ${i}: Stabilize, Implement, Fix & Suggest`;
                else title = 'Final Polish & Fix';
            }
            iterations.push({
                iterationNumber: i,
                title: title,
                status: 'pending',
                isDetailsOpen: true, // Always open with new design
            });
        }
        return {
            id: pipelineIndex,
            originalTemperatureIndex: originalIndex,
            temperature: temp,
            modelName: selectedModel,
            iterations: iterations,
            status: 'idle',
            isStopRequested: false,
        };
    });
    renderPipelines();
    if (pipelinesState.length > 0) {
        activateTab(pipelinesState[0].id);
    } else {
        tabsNavContainer.innerHTML = '<p class="no-pipelines-message">No variants selected to run.</p>';
        pipelinesContentContainer.innerHTML = '';
    }
    updateControlsState();
}


function activateTab(idToActivate: number | string) {
    if (currentMode === 'deepthink' && activeDeepthinkPipeline) {
        activeDeepthinkPipeline.activeTabId = idToActivate as string;
        // Deactivate all deepthink tabs and panes
        document.querySelectorAll('#tabs-nav-container .tab-button.deepthink-mode-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => pane.classList.remove('active'));
        // Activate the correct one
        const tabButton = document.getElementById(`deepthink-tab-${idToActivate}`);
        const contentPane = document.getElementById(`pipeline-content-${idToActivate}`);
        if (tabButton) tabButton.classList.add('active');
        if (contentPane) contentPane.classList.add('active');

        if (idToActivate === 'strategic-solver' && activeDeepthinkPipeline.initialStrategies.length > 0) {
            activateDeepthinkStrategyTab(activeDeepthinkPipeline.activeStrategyTab ?? 0);
        }

    } else if (currentMode === 'react' && activeReactPipeline) {
        activeReactPipeline.activeTabId = idToActivate as string;
        document.querySelectorAll('#tabs-nav-container .tab-button.react-mode-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => pane.classList.remove('active'));

        const tabButton = document.getElementById(`react-tab-${idToActivate}`);
        const contentPane = document.getElementById(`pipeline-content-${idToActivate}`);
        if (tabButton) tabButton.classList.add('active');
        if (contentPane) contentPane.classList.add('active');

    } else if (currentMode !== 'deepthink' && currentMode !== 'react') {
        activePipelineId = idToActivate as number;
        document.querySelectorAll('#tabs-nav-container .tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.id === `pipeline-tab-${activePipelineId}`);
            btn.setAttribute('aria-selected', (btn.id === `pipeline-tab-${activePipelineId}`).toString());
        });
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => {
            pane.classList.toggle('active', pane.id === `pipeline-content-${activePipelineId}`);
        });
    }
}
function renderPipelines() {
    if (currentMode === 'deepthink') {
        // Clear containers first
        tabsNavContainer.innerHTML = '';
        pipelinesContentContainer.innerHTML = '';
        // Render deepthink UI if there's an active pipeline, otherwise show initial state
        if (activeDeepthinkPipeline) {
            renderActiveDeepthinkPipeline();
        } else {
            // Show initial deepthink UI
            tabsNavContainer.innerHTML = '<div class="tab-button deepthink-initial active">Deepthink Analysis</div>';
            pipelinesContentContainer.innerHTML = '<div class="content-pane deepthink-initial active"><div class="status-message">Enter a challenge above and click "Deepthink" to begin analysis.</div></div>';
        }
        return;
    } else if (currentMode === 'react') {
        tabsNavContainer.innerHTML = '';
        pipelinesContentContainer.innerHTML = '';
        return;
    }
    tabsNavContainer.innerHTML = '';
    pipelinesContentContainer.innerHTML = '';

    if (pipelinesState.length === 0) {
        tabsNavContainer.innerHTML = '<p class="no-pipelines-message">No variants selected. Please choose at least one variant or import a configuration.</p>';
        pipelinesContentContainer.innerHTML = '';
        return;
    }

    pipelinesState.forEach(pipeline => {
        const tabButton = document.createElement('button');
        tabButton.className = `tab-button status-${pipeline.status}`;
        tabButton.textContent = `Variant ${pipeline.id + 1} (T: ${pipeline.temperature.toFixed(1)})`;
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-controls', `pipeline-content-${pipeline.id}`);
        tabButton.setAttribute('id', `pipeline-tab-${pipeline.id}`);
        tabButton.addEventListener('click', () => activateTab(pipeline.id));
        tabsNavContainer.appendChild(tabButton);
        pipeline.tabButtonElement = tabButton;

        const pipelineContentDiv = document.createElement('div');
        pipelineContentDiv.className = 'pipeline-content';
        pipelineContentDiv.setAttribute('id', `pipeline-content-${pipeline.id}`);
        pipelineContentDiv.setAttribute('role', 'tabpanel');
        pipelineContentDiv.setAttribute('aria-labelledby', `pipeline-tab-${pipeline.id}`);

        pipelineContentDiv.innerHTML = `
            <ul class="iterations-list" id="iterations-list-${pipeline.id}">
                ${pipeline.iterations.map(iter => renderIteration(pipeline.id, iter)).join('')}
            </ul>
        `;
        pipelinesContentContainer.appendChild(pipelineContentDiv);
        pipeline.contentElement = pipelineContentDiv;

        // Stop button is now part of the iteration card header during processing
        updatePipelineStatusUI(pipeline.id, pipeline.status);

        pipeline.iterations.forEach(iter => {
            attachIterationActionButtons(pipeline.id, iter.iterationNumber);
        });
    });
}

function getEmptyStateMessage(status: IterationData['status'], contentType: string): string {
    switch (status) {
        case 'pending': return `${contentType} generation is pending.`;
        case 'processing':
        case 'retrying': return `Generating ${contentType}...`;
        case 'cancelled': return `${contentType} generation was cancelled by the user.`;
        case 'error': return `An error occurred while generating ${contentType}.`;
        default: return `No valid ${contentType} was generated.`;
    }
}

function renderMarkdown(content: string): string {
    if (typeof content !== 'string') return '';
     // For Deepthink mode, use LaTeX rendering
    if (currentMode === 'deepthink') {
        return renderMathContent(content);
    }
    // Use DOMPurify to prevent XSS attacks after rendering markdown.
    // marked.parse is synchronous since the highlighter is synchronous.
    return DOMPurify.sanitize(marked.parse(content));
}

function renderIteration(pipelineId: number, iter: IterationData): string {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return '';

    let displayStatusText: string = iter.status.charAt(0).toUpperCase() + iter.status.slice(1);
    if (iter.status === 'retrying' && iter.retryAttempt !== undefined) {
        displayStatusText = `Retrying (${iter.retryAttempt}/${MAX_RETRIES})...`;
    } else if (iter.status === 'error') displayStatusText = 'Error';
    else if (iter.status === 'cancelled') displayStatusText = 'Cancelled';

    let promptsContent = '';
    if (currentMode === 'website') {
        if (iter.requestPromptHtml_InitialGenerate) promptsContent += `<h6 class="prompt-title">Initial HTML Generation Prompt:</h6><div class="markdown-content">${renderMarkdown(iter.requestPromptHtml_InitialGenerate)}</div>`;
        if (iter.requestPromptHtml_FeatureImplement) promptsContent += `<h6 class="prompt-title">Feature Implementation & Stabilization Prompt:</h6><div class="markdown-content">${renderMarkdown(iter.requestPromptHtml_FeatureImplement)}</div>`;
        if (iter.requestPromptHtml_BugFix) promptsContent += `<h6 class="prompt-title">HTML Bug Fix/Polish & Completion Prompt:</h6><div class="markdown-content">${renderMarkdown(iter.requestPromptHtml_BugFix)}</div>`;
        if (iter.requestPromptFeatures_Suggest) promptsContent += `<h6 class="prompt-title">Feature Suggestion Prompt:</h6><div class="markdown-content">${renderMarkdown(iter.requestPromptFeatures_Suggest)}</div>`;
    }
    const promptsHtml = promptsContent ? `
        <details class="model-detail-section collapsible-section">
            <summary class="model-section-title">Prompts Used</summary>
            <div class="scrollable-content-area custom-scrollbar">${promptsContent}</div>
        </details>
    ` : '';

    let generatedOutputHtml = '';


    if (currentMode === 'website') {
        if (iter.generatedHtml || ['completed', 'error', 'retrying', 'processing', 'pending', 'cancelled'].includes(iter.status)) {
            const hasContent = !!iter.generatedHtml && !isEmptyOrPlaceholderHtml(iter.generatedHtml);
            let htmlContent;
            if (hasContent) {
                const contentToRender = `\`\`\`html\n${iter.generatedHtml!}\n\`\`\``;
                htmlContent = renderMarkdown(contentToRender);
            } else {
                htmlContent = `<div class="empty-state-message">${getEmptyStateMessage(iter.status, 'HTML')}</div>`;
            }

            generatedOutputHtml = `
                <div class="model-detail-section">
                    <div class="code-block-header">
                        <span class="model-section-title">Generated HTML</span>
                        <div class="code-actions">
                             <button class="compare-output-button button" data-pipeline-id="${pipelineId}" data-iteration-number="${iter.iterationNumber}" data-content-type="html" type="button" ${!hasContent ? 'disabled' : ''}><span class="material-symbols-outlined">compare_arrows</span><span class="button-text">Compare</span></button>
                             <button id="copy-html-${pipelineId}-${iter.iterationNumber}" class="button" type="button" ${!hasContent ? 'disabled' : ''}><span class="material-symbols-outlined">content_copy</span><span class="button-text">Copy</span></button>
                             <button id="download-html-${pipelineId}-${iter.iterationNumber}" class="button" type="button" ${!hasContent ? 'disabled' : ''}><span class="material-symbols-outlined">download</span><span class="button-text">Download</span></button>
                        </div>
                    </div>
                    <div class="code-block-wrapper scrollable-content-area custom-scrollbar">${htmlContent}</div>
                </div>`;
        }
    }

    let suggestionsHtml = '';
    const suggestionsToDisplay = iter.suggestedFeatures;
    if (currentMode === 'website' && suggestionsToDisplay && suggestionsToDisplay.length > 0) {
        const title = "Suggested Next Steps";
        suggestionsHtml = `<div class="model-detail-section">
            <h5 class="model-section-title">${title}</h5>
            <ul class="suggestion-list">${suggestionsToDisplay.map(f => `<li><p>${escapeHtml(f)}</p></li>`).join('')}</ul>
        </div>`;
    }

    let previewHtml = '';
    if (currentMode === 'website') {
        const isEmptyGenHtml = isEmptyOrPlaceholderHtml(iter.generatedHtml);
        const previewContainerId = `preview-container-${pipelineId}-${iter.iterationNumber}`;
        const fullscreenButtonId = `fullscreen-btn-${pipelineId}-${iter.iterationNumber}`;
        const hasContentForPreview = iter.generatedHtml && !isEmptyGenHtml;
        let previewContent;
        if (hasContentForPreview) {
            const iframeSandboxOptions = "allow-scripts allow-same-origin allow-forms allow-popups";
            previewContent = `<iframe id="preview-iframe-${pipelineId}-${iter.iterationNumber}" srcdoc="${escapeHtml(iter.generatedHtml!)}" sandbox="${iframeSandboxOptions}" title="HTML Preview for Iteration ${iter.iterationNumber} of Pipeline ${pipelineId + 1}"></iframe>`;
        } else {
            const noPreviewMessage = getEmptyStateMessage(iter.status, 'HTML preview');
            previewContent = `<div class="empty-state-message">${noPreviewMessage}</div>`;
        }

        previewHtml = `
        <div class="model-detail-section preview-section">
            <div class="model-section-header">
                <h5 class="model-section-title">Live Preview</h5>
                <button id="${fullscreenButtonId}" class="button button-icon" type="button" ${!hasContentForPreview ? 'disabled' : ''} title="Toggle Fullscreen Preview" aria-label="Toggle Fullscreen Preview">
                    <span class="icon-fullscreen material-symbols-outlined">fullscreen</span>
                    <span class="icon-exit-fullscreen material-symbols-outlined" style="display:none;">fullscreen_exit</span>
                </button>
            </div>
            <div id="${previewContainerId}" class="html-preview-container">${previewContent}</div>
        </div>`;
    }

    const gridLayoutClass = currentMode === 'website' ? 'iteration-grid-website' : 'iteration-grid-standard';

    return `
    <li id="iteration-${pipelineId}-${iter.iterationNumber}" class="model-detail-card">
        <div class="model-detail-header">
            <div class="model-title-area">
                <h4 class="model-title">${escapeHtml(iter.title)}</h4>
            </div>
            <div class="model-card-actions">
                <span class="status-badge status-${iter.status}">${displayStatusText}</span>
            </div>
        </div>
        <div class="iteration-details ${gridLayoutClass}">
            <div class="info-column">
                ${iter.error ? `<div class="status-message error"><pre>${escapeHtml(iter.error)}</pre></div>` : ''}
                ${generatedOutputHtml}
                ${suggestionsHtml}
                ${promptsHtml}
            </div>
            ${previewHtml ? `<div class="preview-column">${previewHtml}</div>` : ''}
        </div>
    </li>`;
}

// Utility function to render LaTeX math expressions in content
function renderMathContent(content: string): string {
    if (!content) return '';
    
    // Simple regex-based approach that was working before
    let processedContent = content;
    
    // Handle display math $$...$$
    processedContent = processedContent.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: true,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render display math:', mathContent, e);
            return match;
        }
    });
    
    // Handle inline math $...$
    processedContent = processedContent.replace(/\$([^$\n]+?)\$/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: false,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render inline math:', mathContent, e);
            return match;
        }
    });
    
    // Handle LaTeX delimiters \[...\]
    processedContent = processedContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: true,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render LaTeX display math:', mathContent, e);
            return match;
        }
    });
    
    // Handle LaTeX delimiters \(...\)
    processedContent = processedContent.replace(/\\\(([\s\S]*?)\\\)/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: false,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render LaTeX inline math:', mathContent, e);
            return match;
        }
    });
    
    // Now process markdown
    let htmlContent = marked(processedContent);
    htmlContent = DOMPurify.sanitize(htmlContent);
    
    // Wrap code blocks in containers with copy/download functionality
    htmlContent = htmlContent.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_match: any, attributes: any, codeContent: any) => {
        const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
        return `
            <div class="code-block-container expanded">
                <div class="code-block-header" onclick="toggleCodeBlock('${codeId}')">
                    <span class="code-block-title">Code</span>
                    <div class="code-block-actions" onclick="event.stopPropagation()">
                        <button class="code-action-btn copy-code-btn" onclick="copyCodeBlock('${codeId}')" title="Copy code">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                        <button class="code-action-btn download-code-btn" onclick="downloadCodeBlock('${codeId}')" title="Download code">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7,10 12,15 17,10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="code-block-expand-toggle expanded" id="toggle-${codeId}" onclick="toggleCodeBlock('${codeId}')" title="Toggle code visibility">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6,9 12,15 18,9"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="code-block-content expanded" id="${codeId}">
                    <pre><code${attributes}>${codeContent}</code></pre>
                </div>
            </div>
        `;
    });
    
    // Wrap content in a div with proper styling classes
    return `<div class="latex-content-wrapper">${htmlContent}</div>`;
}

// Global functions for code block actions
(window as any).toggleCodeBlock = function(codeId: string) {
    const codeContent = document.getElementById(codeId);
    const toggleBtn = document.getElementById(`toggle-${codeId}`);
    const container = codeContent?.closest('.code-block-container');
    
    if (!codeContent || !toggleBtn || !container) return;
    
    const isExpanded = codeContent.classList.contains('expanded');
    
    if (isExpanded) {
        codeContent.classList.remove('expanded');
        codeContent.classList.add('collapsed');
        toggleBtn.classList.remove('expanded');
        container.classList.remove('expanded');
        container.classList.add('collapsed');
    } else {
        codeContent.classList.remove('collapsed');
        codeContent.classList.add('expanded');
        toggleBtn.classList.add('expanded');
        container.classList.remove('collapsed');
        container.classList.add('expanded');
    }
};

(window as any).copyCodeBlock = async function(codeId: string) {
    try {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;
        
        const codeText = codeElement.textContent || '';
        await navigator.clipboard.writeText(codeText);
        
        // Visual feedback
        const copyBtn = document.querySelector(`[onclick="copyCodeBlock('${codeId}')"]`);
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
            `;
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 1000);
        }
    } catch (err) {
        console.error('Failed to copy code:', err);
    }
};

(window as any).downloadCodeBlock = function(codeId: string) {
    try {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;
        
        const codeText = codeElement.textContent || '';
        const blob = new Blob([codeText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `code-${codeId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Visual feedback
        const downloadBtn = document.querySelector(`[onclick="downloadCodeBlock('${codeId}')"]`);
        if (downloadBtn) {
            const originalText = downloadBtn.innerHTML;
            downloadBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
            `;
            setTimeout(() => {
                downloadBtn.innerHTML = originalText;
            }, 1000);
        }
    } catch (err) {
        console.error('Failed to download code:', err);
    }
};

async function copyToClipboard(text: string, buttonElement: HTMLButtonElement) {
    if (buttonElement.disabled) return;

    const buttonTextElement = buttonElement.querySelector<HTMLSpanElement>('.button-text');
    if (!buttonTextElement) {
        console.error("Button is missing required '.button-text' span for status updates.", buttonElement);
        return;
    }

    const originalText = buttonTextElement.textContent;
    buttonElement.disabled = true;

    try {
        await navigator.clipboard.writeText(text);
        buttonTextElement.textContent = 'Copied!';
        buttonElement.classList.add('copied');
        setTimeout(() => {
            buttonTextElement.textContent = originalText;
            buttonElement.classList.remove('copied');
            buttonElement.disabled = false;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        buttonTextElement.textContent = 'Copy Failed';
        buttonElement.classList.add('copy-failed');
        setTimeout(() => {
            buttonTextElement.textContent = originalText;
            buttonElement.classList.remove('copy-failed');
            buttonElement.disabled = false;
        }, 2000);
    }
}

function attachIterationActionButtons(pipelineId: number, iterationNumber: number) {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const iter = pipeline.iterations.find(it => it.iterationNumber === iterationNumber);
    if (!iter) return;

    if (currentMode === 'website') {
        const canDownloadOrCopyHtml = !!iter.generatedHtml && !isEmptyOrPlaceholderHtml(iter.generatedHtml);

        const downloadButton = document.querySelector<HTMLButtonElement>(`#download-html-${pipelineId}-${iterationNumber}`);
        if (downloadButton) {
            downloadButton.onclick = () => {
                if (iter.generatedHtml) {
                    downloadFile(iter.generatedHtml, `website_pipeline-${pipelineId + 1}_iter-${iter.iterationNumber}_temp-${pipeline.temperature}.html`, 'text/html');
                }
            };
            downloadButton.disabled = !canDownloadOrCopyHtml;
        }

        const copyButton = document.querySelector<HTMLButtonElement>(`#copy-html-${pipelineId}-${iterationNumber}`);
        if (copyButton) {
            copyButton.dataset.hasContent = String(canDownloadOrCopyHtml);
            copyButton.onclick = () => {
                if (iter.generatedHtml) copyToClipboard(iter.generatedHtml, copyButton);
            };
            copyButton.disabled = !canDownloadOrCopyHtml;
        }

        const fullscreenButton = document.querySelector<HTMLButtonElement>(`#fullscreen-btn-${pipelineId}-${iterationNumber}`);
        const previewContainer = document.getElementById(`preview-container-${pipelineId}-${iterationNumber}`);
        if (fullscreenButton && previewContainer) {
            fullscreenButton.onclick = () => {
                if (!document.fullscreenElement) {
                    previewContainer.requestFullscreen().catch(err => console.error(`Error full-screen: ${err.message}`));
                } else if (document.exitFullscreen) document.exitFullscreen();
            };
            fullscreenButton.disabled = !canDownloadOrCopyHtml;
        }
    }
}

function isEmptyOrPlaceholderHtml(html?: string): boolean {
    return !html || html.trim() === '' || html.includes('<!-- No HTML generated yet') || html.includes('<!-- No valid HTML was generated') || html.includes('<!-- HTML generation cancelled. -->');
}


function updateIterationUI(pipelineId: number, iterationNumber: number) {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const iter = pipeline.iterations.find(it => it.iterationNumber === iterationNumber);
    if (!iter) return;

    const iterationElement = document.getElementById(`iteration-${pipelineId}-${iterationNumber}`);
    if (!iterationElement) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = renderIteration(pipelineId, iter);
    const newContentFirstChild = tempDiv.firstElementChild;

    if (newContentFirstChild) {
        iterationElement.replaceWith(newContentFirstChild);
        attachIterationActionButtons(pipelineId, iterationNumber);
    }
}


function updatePipelineStatusUI(pipelineId: number, status: PipelineState['status']) {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.status = status;

    const statusTextElement = document.getElementById(`pipeline-status-text-${pipelineId}`);
    if (statusTextElement) {
        statusTextElement.textContent = status;
        statusTextElement.className = `pipeline-status status-badge status-${status}`;
    }
    if (pipeline.tabButtonElement) {
        pipeline.tabButtonElement.className = `tab-button status-${status}`;
        if (pipeline.id === activePipelineId) pipeline.tabButtonElement.classList.add('active');
    }
    if (pipeline.stopButtonElement) {
        if (status === 'running') {
            pipeline.stopButtonElement.style.display = 'inline-flex';
            const textEl = pipeline.stopButtonElement.querySelector('.button-text');
            if (textEl) textEl.textContent = 'Stop';
            pipeline.stopButtonElement.disabled = false;
        } else if (status === 'stopping') {
            pipeline.stopButtonElement.style.display = 'inline-flex';
            const textEl = pipeline.stopButtonElement.querySelector('.button-text');
            if (textEl) textEl.textContent = 'Stopping...';
            pipeline.stopButtonElement.disabled = true;
        } else {
            pipeline.stopButtonElement.style.display = 'none';
            const textEl = pipeline.stopButtonElement.querySelector('.button-text');
            if (textEl) textEl.textContent = 'Stop';
            pipeline.stopButtonElement.disabled = true;
        }
    }
    updateControlsState();
}

async function callGemini(promptOrParts: string | Part[], temperature: number, modelToUse: string, systemInstruction?: string, isJsonOutput: boolean = false, topP?: number): Promise<GenerateContentResponse> {
    if (!ai) throw new Error("Gemini API client not initialized.");
    const contents: Part[] = typeof promptOrParts === 'string' ? [{ text: promptOrParts }] : promptOrParts;
    const config: any = { temperature };
    if (topP !== undefined) config.topP = topP;
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (isJsonOutput) config.responseMimeType = "application/json";
    const response = await ai.models.generateContent({ model: modelToUse, contents: { parts: contents }, config: config });
    return response;
}

function cleanHtmlOutput(rawHtml: string): string {
    if (typeof rawHtml !== 'string') return '';
    let textToClean = rawHtml.trim();

    // Handle single-line HTML by converting \n to actual newlines
    textToClean = textToClean.replace(/\\n/g, '\n');
    textToClean = textToClean.replace(/\\t/g, '\t');
    textToClean = textToClean.replace(/\\"/g, '"');
    
    // Try to find the start of the HTML document
    const lowerText = textToClean.toLowerCase();
    let startIndex = lowerText.indexOf('<!doctype');
    if (startIndex === -1) {
        startIndex = lowerText.indexOf('<html');
    }

    if (startIndex !== -1) {
        // Try to find the end of the HTML document
        const endIndex = textToClean.lastIndexOf('</html>');
        if (endIndex !== -1 && endIndex + '</html>'.length > startIndex) {
            return textToClean.substring(startIndex, endIndex + '</html>'.length).trim();
        } else {
            const potentialDoc = textToClean.substring(startIndex).trim();
            const isNearBeginning = startIndex < 20 || textToClean.substring(0, startIndex).trim().length < 10;
            if (isNearBeginning && potentialDoc.length > 100 && (potentialDoc.toLowerCase().includes("<body") || potentialDoc.toLowerCase().includes("<head") || potentialDoc.toLowerCase().includes("<div"))) {
                console.warn(`cleanHtmlOutput: HTML document started but '</html>' tag was missing. Returning potentially truncated document starting with '${potentialDoc.substring(0, 30)}...'.`);
                return potentialDoc;
            }
            console.warn(`cleanHtmlOutput: HTML document started but '</html>' tag was missing. Conditions for truncated HTML not met. Falling through to return original de-fenced and trimmed text.`);
        }
    }

    return textToClean;
}

function cleanTextOutput(rawText: string): string {
    if (typeof rawText !== 'string') return '';
    return rawText.trim(); // Already handled by cleanOutputByType
}

function cleanOutputByType(rawOutput: string, type: string = 'text'): string {
    if (typeof rawOutput !== 'string') return '';
    let textToClean = rawOutput.trim();


    const fenceRegex = /^```(\w*)?\s*\n?([\s\S]*?)\n?\s*```$/s;
    const fenceMatch = textToClean.match(fenceRegex);

    if (fenceMatch && fenceMatch[2]) { // fenceMatch[2] is the content inside the fence
        textToClean = fenceMatch[2].trim();
    }
    // After potential fence removal, trim again.
    // This is crucial for JSON.parse and general cleanliness.
    textToClean = textToClean.trim();

    if (type === 'html') {
        // cleanHtmlOutput has specific logic to extract valid HTML structure,
        // potentially discarding preamble/postamble even if no fences were present initially,
        // or if fences were already stripped.
        return cleanHtmlOutput(textToClean); // textToClean here is already fence-stripped and trimmed
    }

    if (type === 'json') {
        // Special handling for JSON to fix newline and special character issues
        return cleanJsonOutput(textToClean);
    }

    // For 'text', 'markdown', 'python', etc., after the above fence removal and trimming,
    // return the result. The caller is responsible for further processing like JSON.parse().
    return textToClean;
}

// New function to properly clean JSON output
function cleanJsonOutput(jsonString: string): string {
    if (!jsonString || typeof jsonString !== 'string') return jsonString;
    
    let cleaned = jsonString.trim();
    
    // Remove markdown code block fences if present
    if (cleaned.startsWith('```json') || cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        // Remove first line (```json or ```)
        lines.shift();
        // Remove last line if it's just ```
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
            lines.pop();
        }
        cleaned = lines.join('\n').trim();
    }
    
    // Handle both JSON objects and arrays
    let jsonStart = -1;
    let jsonEnd = -1;
    
    // Look for array start
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    
    // Look for object start
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');
    
    // Determine which comes first and use appropriate bounds
    if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
        jsonStart = arrayStart;
        jsonEnd = arrayEnd;
    } else if (objectStart !== -1) {
        jsonStart = objectStart;
        jsonEnd = objectEnd;
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    // Try to fix common JSON issues
    try {
        // First, try to parse as-is to see if it's already valid
        JSON.parse(cleaned);
        return cleaned;
    } catch (e) {
        console.warn("JSON parsing failed, attempting to fix common issues:", e);
        
        // More robust string content fixing
        let fixed = cleaned;
        
        // Fix unescaped quotes and newlines within string values
        // This is a more careful approach that preserves JSON structure
        try {
            // More robust approach: fix escaped characters and string content
            fixed = fixed
                // Fix bad escape sequences like \n\n -> \\n
                .replace(/\\([^"\\nrtbfuv/])/g, '\\\\$1')
                // Fix unescaped quotes within strings
                .replace(/"([^"]*?)"([^,}\]\s])/g, '"$1\\"$2')
                // Fix unescaped newlines in string values
                .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"')
                // Fix unescaped carriage returns
                .replace(/"([^"]*?)\r([^"]*?)"/g, '"$1\\r$2"')
                // Fix unescaped tabs
                .replace(/"([^"]*?)\t([^"]*?)"/g, '"$1\\t$2"')
                // Remove trailing commas
                .replace(/,\s*([}\]])/g, '$1')
                // Fix unquoted keys
                .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
            
            // Try parsing the fixed version
            JSON.parse(fixed);
            return fixed;
        } catch (e2) {
            console.warn("Advanced JSON fixing failed, trying aggressive cleanup:", e2);
            
            // Fallback: very aggressive character-by-character fixes
            try {
                let basicFixed = cleaned
                    // Remove any trailing commas
                    .replace(/,\s*([}\]])/g, '$1')
                    // Fix common quote issues
                    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
                    // Escape all backslashes first
                    .replace(/\\/g, '\\\\')
                    // Then fix specific escape sequences
                    .replace(/\\\\n/g, '\\n')
                    .replace(/\\\\r/g, '\\r')
                    .replace(/\\\\t/g, '\\t')
                    // Basic newline escaping - more aggressive
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
                
                JSON.parse(basicFixed);
                return basicFixed;
            } catch (e3) {
                console.warn("All JSON fixing attempts failed, returning cleaned original:", e3);
                return cleaned;
            }
        }
    }
}

// ---------- HTML PATCHING (Website mode) ----------

type HtmlPatchOperation = {
    operation: 'replace' | 'insert_after' | 'insert_before' | 'delete';
    search_block: string;
    replace_with?: string;
    new_content?: string;
};

function escapeRegExp(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFlexibleWhitespaceRegex(block: string): RegExp {
    // Escape regex chars, then normalize any run of whitespace in the block to match any whitespace run in the source
    const escaped = escapeRegExp(block)
        .replace(/\s+/g, '\\s+')
        .replace(/\\n/g, '\\s*\\n\\s*'); // Handle newlines more flexibly
    // Use multiline and dotall flags for better matching
    return new RegExp(escaped, 'ms');
}

function countOccurrences(haystack: string, needle: string): number {
    if (!needle) return 0;
    let count = 0;
    let idx = 0;
    while (true) {
        idx = haystack.indexOf(needle, idx);
        if (idx === -1) break;
        count++;
        idx += Math.max(1, needle.length);
    }
    return count;
}

function replaceOnceExact(haystack: string, needle: string, replacement: string): { result: string, applied: boolean, multiple: boolean } {
    if (!needle || typeof needle !== 'string' || typeof haystack !== 'string') {
        return { result: haystack, applied: false, multiple: false };
    }
    
    // First try exact match - this is critical for simple cases like "<body>"
    const occurrences = countOccurrences(haystack, needle);
    if (occurrences > 0) {
        const idx = haystack.indexOf(needle);
        const result = haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
        return { result, applied: true, multiple: occurrences > 1 };
    }
    
    // Only try flexible matching for multi-line blocks or complex content
    if (needle.includes('\n') || needle.length > 50) {
        const regex = buildFlexibleWhitespaceRegex(needle);
        const match = haystack.match(regex);
        if (match && match.index !== undefined) {
            const result = haystack.slice(0, match.index) + replacement + haystack.slice(match.index + match[0].length);
            return { result, applied: true, multiple: false };
        }
    }
    
    return { result: haystack, applied: false, multiple: false };
}

function applyPatches(currentHtml: string, patches: HtmlPatchOperation[]): string {
    let modifiedHtml = currentHtml ?? '';
    if (!Array.isArray(patches) || patches.length === 0) {
        console.log('applyPatches: No valid patches to apply');
        return modifiedHtml;
    }

    console.log(`applyPatches: Applying ${patches.length} patches to HTML (${modifiedHtml.length} chars)`);
    
    for (let i = 0; i < patches.length; i++) {
        const rawPatch = patches[i];
        if (!rawPatch || typeof rawPatch !== 'object') {
            console.warn(`applyPatches: Patch ${i + 1}: Skipping invalid patch (not an object):`, rawPatch);
            continue;
        }

        const op = String((rawPatch as any).operation || '').toLowerCase() as HtmlPatchOperation['operation'];
        const searchBlock = (rawPatch as any).search_block ?? '';
        const replaceWith = (rawPatch as any).replace_with ?? '';
        const newContent = (rawPatch as any).new_content ?? '';

        if (!op || !searchBlock || typeof searchBlock !== 'string') {
            console.warn(`applyPatches: Patch ${i + 1}: Skipping patch with missing/invalid operation or search_block:`, rawPatch);
            continue;
        }

        console.log(`applyPatches: Patch ${i + 1}: ${op} operation on block: "${searchBlock.substring(0, 60)}${searchBlock.length > 60 ? '...' : ''}"`);        
        
        try {
            const beforeLength = modifiedHtml.length;
            
            if (op === 'replace') {
                let { result, applied, multiple } = replaceOnceExact(modifiedHtml, searchBlock, replaceWith);
                if (!applied) {
                    console.warn(`applyPatches: Patch ${i + 1}: replace - search_block not found. Patch skipped. Block: "${searchBlock.substring(0, 120)}${searchBlock.length > 120 ? '...' : ''}"`);                    
                } else {
                    if (multiple) {
                        console.warn(`applyPatches: Patch ${i + 1}: replace - multiple matches found. Only first occurrence was replaced.`);
                    }
                    console.log(`applyPatches: Patch ${i + 1}: Successfully applied replace (${beforeLength} -> ${result.length} chars)`);
                }
                modifiedHtml = result;
            } else if (op === 'insert_after') {
                let { result, applied, multiple } = replaceOnceExact(modifiedHtml, searchBlock, searchBlock + newContent);
                if (!applied) {
                    console.warn(`applyPatches: Patch ${i + 1}: insert_after - search_block not found. Patch skipped. Block: "${searchBlock.substring(0, 120)}${searchBlock.length > 120 ? '...' : ''}"`);                    
                } else {
                    if (multiple) {
                        console.warn(`applyPatches: Patch ${i + 1}: insert_after - multiple matches found. Only first occurrence was used.`);
                    }
                    console.log(`applyPatches: Patch ${i + 1}: Successfully applied insert_after (${beforeLength} -> ${result.length} chars)`);
                }
                modifiedHtml = result;
            } else if (op === 'insert_before') {
                let { result, applied, multiple } = replaceOnceExact(modifiedHtml, searchBlock, newContent + searchBlock);
                if (!applied) {
                    console.warn(`applyPatches: Patch ${i + 1}: insert_before - search_block not found. Patch skipped. Block: "${searchBlock.substring(0, 120)}${searchBlock.length > 120 ? '...' : ''}"`);                    
                } else {
                    if (multiple) {
                        console.warn(`applyPatches: Patch ${i + 1}: insert_before - multiple matches found. Only first occurrence was used.`);
                    }
                    console.log(`applyPatches: Patch ${i + 1}: Successfully applied insert_before (${beforeLength} -> ${result.length} chars)`);
                }
                modifiedHtml = result;
            } else if (op === 'delete') {
                let { result, applied, multiple } = replaceOnceExact(modifiedHtml, searchBlock, '');
                if (!applied) {
                    console.warn(`applyPatches: Patch ${i + 1}: delete - search_block not found. Patch skipped. Block: "${searchBlock.substring(0, 120)}${searchBlock.length > 120 ? '...' : ''}"`);                    
                } else {
                    if (multiple) {
                        console.warn(`applyPatches: Patch ${i + 1}: delete - multiple matches found. Only first occurrence was deleted.`);
                    }
                    console.log(`applyPatches: Patch ${i + 1}: Successfully applied delete (${beforeLength} -> ${result.length} chars)`);
                }
                modifiedHtml = result;
            } else {
                console.warn(`applyPatches: Patch ${i + 1}: Unsupported operation '${op}'. Skipping.`, rawPatch);
            }
        } catch (e) {
            console.warn(`applyPatches: Patch ${i + 1}: Error applying patch. Skipping this patch.`, e, rawPatch);
        }
    }
    
    console.log(`applyPatches: Completed. Final HTML length: ${modifiedHtml.length} chars`);
    return modifiedHtml;
}

function parsePatchesFromJson(rawJsonString: string): HtmlPatchOperation[] | null {
    const cleaned = cleanOutputByType(rawJsonString, 'json');
    try {
        const parsedAny = JSON.parse(cleaned);
        const maybeArray = Array.isArray(parsedAny) ? parsedAny : (parsedAny && typeof parsedAny === 'object' && Array.isArray(parsedAny.patches) ? parsedAny.patches : null);
        if (!maybeArray) return null;
        const normalized: HtmlPatchOperation[] = [];
        for (const item of maybeArray) {
            if (!item || typeof item !== 'object') continue;
            const op = String((item as any).operation || '').toLowerCase();
            const searchBlock = (item as any).search_block;
            const replaceWith = (item as any).replace_with;
            const newContent = (item as any).new_content;
            if (!op || typeof searchBlock !== 'string') continue;
            if (op === 'replace' && typeof replaceWith !== 'string') continue;
            if ((op === 'insert_after' || op === 'insert_before') && typeof newContent !== 'string') continue;
            if (op !== 'replace' && op !== 'insert_after' && op !== 'insert_before' && op !== 'delete') continue;
            normalized.push({ operation: op as any, search_block: searchBlock, replace_with: replaceWith, new_content: newContent });
        }
        return normalized;
    } catch (e) {
        console.warn('parsePatchesFromJson: Failed to parse JSON patches. Raw (first 300 chars):', rawJsonString.substring(0, 300), e);
        return null;
    }
}


function generateFallbackFeaturesFromString(text: string): string[] {
    const listItemsRegex = /(?:^\s*[-*+]|\d+\.)\s+(.*)/gm;
    let matches;
    const features: string[] = [];
    if (typeof text === 'string') {
        while ((matches = listItemsRegex.exec(text)) !== null) {
            features.push(matches[1].trim());
            if (features.length >= 2) break;
        }
    }
    if (features.length > 0) return features.slice(0, 2);
    console.warn("generateFallbackFeaturesFromString: Could not extract 2 features from string, using generic fallbacks.");
    return ["Add a clear call to action", "Improve visual hierarchy"].slice(0, 2);
}

function generateFallbackCritiqueFromString(text: string, count: number = 3): string[] {
    const listItemsRegex = /(?:^\s*[-*+]|\d+\.)\s+(.*)/gm;
    let matches;
    const critique: string[] = [];
    if (typeof text === 'string') {
        while ((matches = listItemsRegex.exec(text)) !== null) {
            critique.push(matches[1].trim());
            if (critique.length >= count) break;
        }
    }
    if (critique.length > 0) return critique.slice(0, count);
    console.warn(`generateFallbackCritiqueFromString: Could not extract ${count} critique points. Using generic fallbacks.`);
    const fallbacks = ["Consider developing the main character's motivation further.", "Explore adding more sensory details to the descriptions.", "Check the pacing of the current section; it might be too fast or too slow."];
    return fallbacks.slice(0, count);
}

function generateFallbackStrategies(text: string, count: number): string[] {
    const listItemsRegex = /(?:^\s*[-*+]|\d+\.)\s+(.*)/gm;
    let matches;
    const strategies: string[] = [];

    while ((matches = listItemsRegex.exec(text)) !== null && strategies.length < count) {
        strategies.push(matches[1].trim());
    }

    if (strategies.length > 0 && strategies.length <= count) return strategies;
    if (strategies.length > count) return strategies.slice(0, count);

    console.warn(`generateFallbackStrategies: Could not extract ${count} strategies. Using generic fallbacks.`);
    const fallbacks = [
        "Try to simplify the problem statement or break it into smaller parts.",
        "Identify relevant formulas or theorems.",
        "Work through the problem step by step.",
        "Check for any given constraints or conditions.",
        "Consider alternative approaches or methods."
    ];
    return fallbacks.slice(0, count);
}


function parseJsonSuggestions(rawJsonString: string, suggestionKey: 'features' | 'suggestions' | 'strategies' | 'sub_strategies' = 'features', expectedCount: number = 2): string[] {
    if (typeof rawJsonString !== 'string' || !rawJsonString.trim()) {
        console.warn(`parseJsonSuggestions: Input string is empty or not a string. Using fallback for ${suggestionKey}.`);
        if (suggestionKey === 'features') return generateFallbackFeaturesFromString('');
        if (suggestionKey === 'strategies' || suggestionKey === 'sub_strategies') return generateFallbackStrategies('', expectedCount);
        return generateFallbackCritiqueFromString('', expectedCount);
    }

    const cleanedJsonString = cleanOutputByType(rawJsonString, 'json');

    try {
        const parsed = JSON.parse(cleanedJsonString);
        let items: string[] = [];

        // Standard case: {"suggestionKey": ["item1", "item2"]}
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed[suggestionKey]) && parsed[suggestionKey].every((f: any) => typeof f === 'string')) {
            items = parsed[suggestionKey];
        }
        // Handles cases where the JSON is just an array of strings: ["item1", "item2"]
        else if (Array.isArray(parsed) && parsed.every((item: any) => typeof item === 'string')) {
            items = parsed;
        }
        // Fallback for less structured JSON: if the primary key is different but it contains an array of strings
        else if (typeof parsed === 'object' && parsed !== null) {
            for (const key in parsed) {
                if (Array.isArray(parsed[key]) && parsed[key].every((s: any) => typeof s === 'string')) {
                    items = parsed[key];
                    console.warn(`parseJsonSuggestions: Used fallback key "${key}" for suggestions as primary key "${suggestionKey}" was not found or malformed. Parsed object had keys: ${Object.keys(parsed).join(', ')}`);
                    break;
                }
            }
        }

        if (items.length > 0) {
            if (items.length < expectedCount) {
                console.warn(`parseJsonSuggestions: Parsed ${items.length} ${suggestionKey}, expected ${expectedCount}. Padding with fallbacks.`);
                const fallbacks = (suggestionKey === 'features') ? generateFallbackFeaturesFromString('') :
                    (suggestionKey === 'strategies' || suggestionKey === 'sub_strategies') ? generateFallbackStrategies('', expectedCount - items.length) :
                        generateFallbackCritiqueFromString('', expectedCount - items.length);
                return items.concat(fallbacks.slice(0, expectedCount - items.length));
            }
            return items.slice(0, expectedCount); // Ensure we don't return more than expected
        }

        // If no items found via expected structures, attempt generic string list extraction from original raw string
        console.warn(`parseJsonSuggestions: Parsed JSON for ${suggestionKey} is not in the expected format or empty. Attempting string fallback from original content. Parsed object:`, parsed, "Cleaned string for parsing:", cleanedJsonString, "Original string (first 300 chars):", rawJsonString.substring(0, 300));
        if (suggestionKey === 'features') return generateFallbackFeaturesFromString(rawJsonString);
        if (suggestionKey === 'strategies' || suggestionKey === 'sub_strategies') return generateFallbackStrategies(rawJsonString, expectedCount);
        return generateFallbackCritiqueFromString(rawJsonString, expectedCount);

    } catch (e) {
        console.error(`parseJsonSuggestions: Failed to parse JSON for ${suggestionKey}:`, e, "Cleaned string for parsing:", cleanedJsonString, "Original string (first 300 chars):", rawJsonString.substring(0, 300));
        // Fallback to extracting from the original raw string if JSON parsing fails completely
        if (suggestionKey === 'features') return generateFallbackFeaturesFromString(rawJsonString);
        if (suggestionKey === 'strategies' || suggestionKey === 'sub_strategies') return generateFallbackStrategies(rawJsonString, expectedCount);
        return generateFallbackCritiqueFromString(rawJsonString, expectedCount);
    }
}


async function runPipeline(pipelineId: number, initialRequest: string) {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.isStopRequested = false;
    updatePipelineStatusUI(pipelineId, 'running');

    let currentHtmlContent = "";
    let currentTextContent = "";
    let currentSuggestions: string[] = [];


    const totalPipelineSteps = currentMode === 'website' ? TOTAL_STEPS_WEBSITE : 0;
    const numMainRefinementLoops = currentMode === 'website' ? NUM_WEBSITE_REFINEMENT_ITERATIONS : 0;

    for (let i = 0; i < totalPipelineSteps; i++) {
        const iteration = pipeline.iterations[i];
        if (pipeline.isStopRequested) {
            iteration.status = 'cancelled';
            iteration.error = 'Process execution was stopped by the user.';
            updateIterationUI(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                pipeline.iterations[j].status = 'cancelled';
                pipeline.iterations[j].error = 'Process execution was stopped by the user.';
                updateIterationUI(pipelineId, j);
            }
            updatePipelineStatusUI(pipelineId, 'stopped');
            return;
        }

        // Reset prompts and outputs for current iteration (website mode only)
        iteration.requestPromptHtml_InitialGenerate = iteration.requestPromptHtml_FeatureImplement = iteration.requestPromptHtml_BugFix = iteration.requestPromptFeatures_Suggest = undefined;
        iteration.generatedRawHtml = undefined; // Clear raw HTML output
        iteration.error = undefined;
        // Website-only fields are managed; non-website fields no longer exist

        try {
            const makeApiCall = async (userPrompt: string, systemInstruction: string, isJson: boolean, stepDesc: string): Promise<string> => {
                if (!pipeline) throw new Error("Pipeline context lost");
                if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDesc}`);
                let responseText = "";
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDesc}`);
                    iteration.retryAttempt = attempt;
                    iteration.status = attempt > 0 ? 'retrying' : 'processing';
                    updateIterationUI(pipelineId, i);
                    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));

                    try {
                        const apiResponse = await callGemini(userPrompt, pipeline.temperature, pipeline.modelName, systemInstruction, isJson);
                        responseText = apiResponse.text;
                        iteration.status = 'processing';
                        updateIterationUI(pipelineId, i);
                        return responseText;
                    } catch (e: any) {
                        console.warn(`Pipeline ${pipelineId}, Iter ${i} (${stepDesc}), Attempt ${attempt + 1} failed: ${e.message}`);
                        iteration.error = `Attempt ${attempt + 1} for ${stepDesc} failed: ${e.message || 'Unknown API error'}`;
                        if (e.details) iteration.error += `\nDetails: ${JSON.stringify(e.details)}`;
                        if (e.status) iteration.error += `\nStatus: ${e.status}`;
                        updateIterationUI(pipelineId, i);
                        if (attempt === MAX_RETRIES) {
                            iteration.error = `Failed ${stepDesc} after ${MAX_RETRIES + 1} attempts: ${e.message || 'Unknown API error'}`;
                            throw e;
                        }
                    }
                }
                throw new Error(`API call for ${stepDesc} failed all retries.`);
            };

            if (currentMode === 'website') {
                let rawHtmlAfterGenOrImpl = "";
                const placeholderRawHtml = '<!-- No HTML provided by previous step. Please generate foundational structure based on the original idea. -->';
                const placeholderCurrentHtml = "<!-- No significant HTML content available. Base suggestions on the original idea or propose foundational elements. -->";

                if (i === 0) {
                    const userPromptInitialGen = renderPrompt(customPromptsWebsiteState.user_initialGen, { initialIdea: initialRequest, currentHtml: currentHtmlContent });
                    iteration.requestPromptHtml_InitialGenerate = userPromptInitialGen;
                    {
                        const initialGenResponse = await makeApiCall(userPromptInitialGen, customPromptsWebsiteState.sys_initialGen, true, "Initial HTML Generation");
                        // Check if response is JSON patches or full HTML
                        if (currentHtmlContent && currentHtmlContent.trim().length > 0) {
                            // We have existing HTML, expect JSON patches
                            const patches = parsePatchesFromJson(initialGenResponse);
                            if (patches && patches.length > 0) {
                                rawHtmlAfterGenOrImpl = applyPatches(currentHtmlContent, patches);
                                iteration.providedPatchesJson = cleanOutputByType(initialGenResponse, 'json');
                                iteration.providedPatchesContentType = 'html';
                            } else {
                                // Fallback: treat as full HTML
                                const fallbackHtml = cleanOutputByType(initialGenResponse, 'html');
                                rawHtmlAfterGenOrImpl = fallbackHtml && fallbackHtml.length > 0 ? cleanHtmlOutput(fallbackHtml) : "";
                            }
                        } else {
                            // No existing HTML, expect full HTML output
                            rawHtmlAfterGenOrImpl = cleanHtmlOutput(initialGenResponse);
                        }
                        iteration.generatedRawHtml = rawHtmlAfterGenOrImpl; // Store raw output from Request 1
                    }

                    const userPromptInitialBugFix = renderPrompt(customPromptsWebsiteState.user_initialBugFix, { initialIdea: initialRequest, rawHtml: rawHtmlAfterGenOrImpl || placeholderRawHtml });
                    iteration.requestPromptHtml_BugFix = userPromptInitialBugFix;
                    {
                        const bugfixResponse = await makeApiCall(userPromptInitialBugFix, customPromptsWebsiteState.sys_initialBugFix, true, "Initial HTML Bug Fix (JSON Patches)");
                        const patches = parsePatchesFromJson(bugfixResponse);
                        if (patches && patches.length > 0) {
                            const patched = applyPatches(rawHtmlAfterGenOrImpl || "", patches);
                            iteration.generatedHtml = cleanHtmlOutput(patched);
                            iteration.providedPatchesJson = cleanOutputByType(bugfixResponse, 'json');
                            iteration.providedPatchesContentType = 'html';
                        } else {
                            // Fallback: treat response as full HTML if JSON invalid or empty
                            const fallbackHtml = cleanOutputByType(bugfixResponse, 'html');
                            iteration.generatedHtml = fallbackHtml && fallbackHtml.length > 0 ? cleanHtmlOutput(fallbackHtml) : (rawHtmlAfterGenOrImpl || "");
                        }
                    }
                    currentHtmlContent = iteration.generatedHtml || "";

                    const userPromptInitialFeatures = renderPrompt(customPromptsWebsiteState.user_initialFeatureSuggest, { initialIdea: initialRequest, currentHtml: currentHtmlContent || placeholderCurrentHtml });
                    iteration.requestPromptFeatures_Suggest = userPromptInitialFeatures;
                    // Use the selected model for feature suggestions
                    const featuresJsonString = await callGemini(userPromptInitialFeatures, pipeline.temperature, pipeline.modelName, customPromptsWebsiteState.sys_initialFeatureSuggest, true).then(response => response.text);
                    iteration.suggestedFeatures = parseJsonSuggestions(featuresJsonString, 'features', 5);
                    currentSuggestions = iteration.suggestedFeatures;
                } else if (i <= numMainRefinementLoops) {
                    const featuresToImplementStr = currentSuggestions.join('; ');
                    const userPromptRefineImplement = renderPrompt(customPromptsWebsiteState.user_refineStabilizeImplement, { currentHtml: currentHtmlContent || placeholderRawHtml, featuresToImplementStr });
                    iteration.requestPromptHtml_FeatureImplement = userPromptRefineImplement;
                    {
                        const refineImplementResponse = await makeApiCall(userPromptRefineImplement, customPromptsWebsiteState.sys_refineStabilizeImplement, true, `Stabilization & Feature Impl (Iter ${i}) - JSON Patches`);
                        const patches = parsePatchesFromJson(refineImplementResponse);
                        if (patches && patches.length > 0) {
                            rawHtmlAfterGenOrImpl = applyPatches(currentHtmlContent || "", patches);
                            iteration.providedPatchesJson = cleanOutputByType(refineImplementResponse, 'json');
                            iteration.providedPatchesContentType = 'html';
                        } else {
                            // Fallback: treat response as full HTML if JSON invalid or empty
                            const fallbackHtml = cleanOutputByType(refineImplementResponse, 'html');
                            rawHtmlAfterGenOrImpl = fallbackHtml && fallbackHtml.length > 0 ? cleanHtmlOutput(fallbackHtml) : (currentHtmlContent || "");
                        }
                        iteration.generatedRawHtml = rawHtmlAfterGenOrImpl; // Store raw output from Request 1
                    }

                    const userPromptRefineBugFix = renderPrompt(customPromptsWebsiteState.user_refineBugFix, { rawHtml: rawHtmlAfterGenOrImpl || placeholderRawHtml });
                    iteration.requestPromptHtml_BugFix = userPromptRefineBugFix;
                    {
                        const bugfixResponse = await makeApiCall(userPromptRefineBugFix, customPromptsWebsiteState.sys_refineBugFix, true, `Bug Fix & Completion (Iter ${i}) - JSON Patches`);
                        const patches = parsePatchesFromJson(bugfixResponse);
                        if (patches && patches.length > 0) {
                            const patched = applyPatches(rawHtmlAfterGenOrImpl || "", patches);
                            iteration.generatedHtml = cleanHtmlOutput(patched);
                            iteration.providedPatchesJson = cleanOutputByType(bugfixResponse, 'json');
                            iteration.providedPatchesContentType = 'html';
                        } else {
                            // Fallback: treat response as full HTML if JSON invalid or empty
                            const fallbackHtml = cleanOutputByType(bugfixResponse, 'html');
                            iteration.generatedHtml = fallbackHtml && fallbackHtml.length > 0 ? cleanHtmlOutput(fallbackHtml) : (rawHtmlAfterGenOrImpl || "");
                        }
                    }
                    currentHtmlContent = iteration.generatedHtml || "";

                    const userPromptRefineFeatures = renderPrompt(customPromptsWebsiteState.user_refineFeatureSuggest, { initialIdea: initialRequest, currentHtml: currentHtmlContent || placeholderCurrentHtml });
                    iteration.requestPromptFeatures_Suggest = userPromptRefineFeatures;
                    // Use the selected model for feature suggestions
                    const featuresJsonString = await callGemini(userPromptRefineFeatures, pipeline.temperature, pipeline.modelName, customPromptsWebsiteState.sys_refineFeatureSuggest, true).then(response => response.text);
                    iteration.suggestedFeatures = parseJsonSuggestions(featuresJsonString, 'features', 5);
                    currentSuggestions = iteration.suggestedFeatures;
                } else {
                    const userPromptFinalPolish = renderPrompt(customPromptsWebsiteState.user_finalPolish, { currentHtml: currentHtmlContent || placeholderRawHtml });
                    iteration.requestPromptHtml_BugFix = userPromptFinalPolish; // Re-using bugfix field for UI display of final polish prompt
                    {
                        const finalPolishResponse = await makeApiCall(userPromptFinalPolish, customPromptsWebsiteState.sys_finalPolish, true, "Final Polish - JSON Patches");
                        const patches = parsePatchesFromJson(finalPolishResponse);
                        if (patches && patches.length > 0) {
                            const patched = applyPatches(currentHtmlContent || "", patches);
                            iteration.generatedHtml = cleanHtmlOutput(patched);
                            iteration.providedPatchesJson = cleanOutputByType(finalPolishResponse, 'json');
                            iteration.providedPatchesContentType = 'html';
                        } else {
                            // Fallback: treat response as full HTML if JSON invalid or empty
                            const fallbackHtml = cleanOutputByType(finalPolishResponse, 'html');
                            iteration.generatedHtml = fallbackHtml && fallbackHtml.length > 0 ? cleanHtmlOutput(fallbackHtml) : (currentHtmlContent || "");
                        }
                        currentHtmlContent = iteration.generatedHtml || "";
                    }
                    iteration.suggestedFeatures = [];
                }
            }
            // If an error occurred within a try-catch inside the agent logic (e.g. JSON parse error),
            // it would set iteration.error. We should check that before setting status to 'completed'.
            if (!iteration.error) {
                iteration.status = 'completed';
            } else {
                iteration.status = 'error'; // Keep error status if already set
            }
        } catch (error: any) {
            if (error instanceof PipelineStopRequestedError) {
                iteration.status = 'cancelled';
                iteration.error = 'Process execution was stopped by the user.';
                updatePipelineStatusUI(pipelineId, 'stopped');
            } else {
                if (!iteration.error) iteration.error = error.message || 'An unknown operational error occurred.';
                iteration.status = 'error';
                updatePipelineStatusUI(pipelineId, 'failed');
            }
            updateIterationUI(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                if (pipeline.iterations[j].status !== 'cancelled') {
                    pipeline.iterations[j].status = 'cancelled';
                    pipeline.iterations[j].error = (error instanceof PipelineStopRequestedError) ? 'Process stopped by user.' : 'Halted due to prior error.';
                    updateIterationUI(pipelineId, j);
                }
            }
            return;
        }
        updateIterationUI(pipelineId, i);
    }

    if (pipeline && !pipeline.isStopRequested && pipeline.status !== 'failed') {
        updatePipelineStatusUI(pipelineId, 'completed');
    } else if (pipeline && pipeline.status === 'failed') {
        // Status already set to failed, do nothing more here for global status.
    }
}


function escapeHtml(unsafe: string): string {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function downloadFile(content: string | Blob, fileName: string, contentType: string) {
    const a = document.createElement("a");
    const file = (content instanceof Blob) ? content : new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
}
async function createAndDownloadReactProjectZip() {
    if (!activeReactPipeline || !activeReactPipeline.finalAppendedCode) {
        alert("No React project code available to download.");
        return;
    }

    const zip = new JSZip();
    const finalCode = activeReactPipeline.finalAppendedCode;
    const fileMarkerRegex = /^\/\/\s*---\s*FILE:\s*(.*?)\s*---\s*$/m;
    const files: { path: string, content: string }[] = [];

    // Split the code by the file marker. This is a robust way to parse the aggregated string.
    const parts = finalCode.split(fileMarkerRegex);

    if (parts.length > 1) {
        // The first part is any text before the first marker. We start from the first captured path.
        // We iterate in pairs: path (at odd indices), then content (at even indices).
        for (let i = 1; i < parts.length; i += 2) {
            const path = parts[i].trim();
            const content = (parts[i + 1] || '').trim(); // Get the content for this path.
            if (path && content) { // Ensure both path and content are not empty
                files.push({ path, content });
            }
        }
    }


    if (files.length === 0 && finalCode.length > 0) {
        // Fallback for cases where no markers are present in the output.
        console.warn("No file markers found in the aggregated code. Assuming single file 'src/App.tsx'.");
        files.push({ path: "src/App.tsx", content: finalCode });
    }

    files.forEach(file => {
        // Ensure paths are relative and don't start with /
        const correctedPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
        zip.file(correctedPath, file.content);
    });

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadFile(zipBlob, `react-app-${activeReactPipeline.id}.zip`, 'application/zip');
    } catch (error) {
        console.error("Error generating React project zip:", error);
        alert("Failed to generate zip file. See console for details.");
    }
}


function handleGlobalFullscreenChange() {
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    document.querySelectorAll('.fullscreen-toggle-button').forEach(button => {
        const btn = button as HTMLButtonElement;
        const iconFullscreen = btn.querySelector('.icon-fullscreen') as HTMLElement;
        const iconExitFullscreen = btn.querySelector('.icon-exit-fullscreen') as HTMLElement;
        const previewContainerId = btn.id.replace('fullscreen-btn-', 'preview-container-');
        const associatedPreviewContainer = document.getElementById(previewContainerId);

        if (isCurrentlyFullscreen && document.fullscreenElement === associatedPreviewContainer) {
            if (iconFullscreen) iconFullscreen.style.display = 'none';
            if (iconExitFullscreen) iconExitFullscreen.style.display = 'inline-block';
            btn.title = "Exit Fullscreen Preview";
            btn.setAttribute('aria-label', "Exit Fullscreen Preview");
        } else {
            if (iconFullscreen) iconFullscreen.style.display = 'inline-block';
            if (iconExitFullscreen) iconExitFullscreen.style.display = 'none';
            btn.title = "Toggle Fullscreen Preview";
            btn.setAttribute('aria-label', "Toggle Fullscreen Preview");
        }
    });
}
document.addEventListener('fullscreenchange', handleGlobalFullscreenChange);

function exportConfiguration() {
    if (isGenerating) {
        alert("Cannot export configuration while generation is in progress.");
        return;
    }
    const selectedOriginalIndices: number[] = [];
    if (currentMode === 'website') { // Website only
        pipelineSelectorsContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked').forEach(checkbox => {
            selectedOriginalIndices.push(parseInt(checkbox.dataset.temperatureIndex || "-1", 10));
        });
    }

    const config: ExportedConfig = {
        currentMode: currentMode,
        initialIdea: initialIdeaInput.value,
        selectedModel: modelSelectElement.value,
        selectedOriginalTemperatureIndices: selectedOriginalIndices,
        pipelinesState: JSON.parse(JSON.stringify(pipelinesState.map(p => {
            const { tabButtonElement, contentElement, stopButtonElement, ...rest } = p;
            return rest;
        }))),
        activeDeepthinkPipeline: currentMode === 'deepthink' ? JSON.parse(JSON.stringify(activeDeepthinkPipeline)) : null,
        activeReactPipeline: currentMode === 'react' ? JSON.parse(JSON.stringify(activeReactPipeline)) : null,
        activePipelineId: (currentMode !== 'deepthink' && currentMode !== 'react') ? activePipelineId : null,
        activeDeepthinkProblemTabId: (currentMode === 'deepthink' && activeDeepthinkPipeline) ? activeDeepthinkPipeline.activeTabId : undefined,
        // activeReactProblemTabId: (currentMode === 'react' && activeReactPipeline) ? activeReactPipeline.activeTabId : undefined, // For React worker tabs
        globalStatusText: "Ready.",
        globalStatusClass: "status-idle",
        customPromptsWebsite: customPromptsWebsiteState,
        customPromptsDeepthink: customPromptsDeepthinkState,
        customPromptsReact: customPromptsReactState, // Added for React
        isCustomPromptsOpen: isCustomPromptsOpen,
    };
    const configJson = JSON.stringify(config, null, 2);
    downloadFile(configJson, `iterative_studio_config_${currentMode}.json`, 'application/json');
}
function handleImportConfiguration(event: Event) {
    if (isGenerating) {
        alert("Cannot import configuration while generation is in progress.");
        return;
    }
    const fileInputTarget = event.target as HTMLInputElement;
    if (!fileInputTarget.files || fileInputTarget.files.length === 0) return;
    const file = fileInputTarget.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const result = e.target?.result as string;
            const importedConfig = JSON.parse(result) as ExportedConfig;

            const criticalFields: { key: keyof ExportedConfig; type: string }[] = [
                { key: 'currentMode', type: 'string' },
                { key: 'initialIdea', type: 'string' },
                { key: 'selectedModel', type: 'string' },
                { key: 'customPromptsWebsite', type: 'object' },
                { key: 'customPromptsReact', type: 'object' }, // Added for React
            ];

            if (!importedConfig) {
                throw new Error("Invalid configuration: Root object is missing or not valid JSON.");
            }

            for (const field of criticalFields) {
                if (!(field.key in importedConfig) || typeof importedConfig[field.key] !== field.type) {
                    // Allow customPrompts to be potentially undefined if not present, will use defaults
                    if (field.type === 'object' && importedConfig[field.key] === undefined) {
                        console.warn(`Configuration field '${field.key}' is missing, will use defaults.`);
                    } else {
                        throw new Error(`Invalid configuration: Missing or malformed critical field '${field.key}'. Expected type '${field.type}', got '${typeof importedConfig[field.key]}'.`);
                    }
                }
            }

            currentMode = importedConfig.currentMode;
            (document.querySelector(`input[name="appMode"][value="${currentMode}"]`) as HTMLInputElement).checked = true;

            initialIdeaInput.value = importedConfig.initialIdea;
            if (currentMode === 'deepthink') {
                // Deepthink mode specific initialization
            } else {
                currentProblemImageBase64 = null;
                currentProblemImageMimeType = null;
            }
            updateUIAfterModeChange();

            // Reinitialize sidebar controls after import
            if ((window as any).reinitializeSidebarControls) {
                (window as any).reinitializeSidebarControls();
            }

            if (currentMode === 'deepthink') {
                const importedPipeline = importedConfig.activeDeepthinkPipeline;
                activeDeepthinkPipeline = importedPipeline ? {
                    ...importedPipeline,
                    isStopRequested: false,
                    status: (importedPipeline.status === 'processing' || importedPipeline.status === 'stopping') ? 'idle' : importedPipeline.status,
                    activeTabId: importedConfig.activeDeepthinkProblemTabId || 'challenge-details',
                    // Preserve judge results but reset processing states
                    initialStrategies: importedPipeline.initialStrategies?.map(strategy => ({
                        ...strategy,
                        // Reset processing states but preserve completed judge results
                        judgingStatus: strategy.judgingStatus === 'processing' || strategy.judgingStatus === 'retrying' ? 'pending' : strategy.judgingStatus,
                        // Explicitly preserve judge data
                        judgedBestSolution: strategy.judgedBestSolution,
                        judgedBestSubStrategyId: strategy.judgedBestSubStrategyId,
                        judgingRequestPrompt: strategy.judgingRequestPrompt,
                        judgingResponseText: strategy.judgingResponseText,
                        judgingError: strategy.judgingError,
                    })) || [],
                    finalJudgedBestSolution: importedPipeline.finalJudgedBestSolution,
                    finalJudgedBestStrategyId: importedPipeline.finalJudgedBestStrategyId,
                    finalJudgingRequestPrompt: importedPipeline.finalJudgingRequestPrompt,
                    finalJudgingResponseText: importedPipeline.finalJudgingResponseText,
                    finalJudgingError: importedPipeline.finalJudgingError,
                } : null;
                activePipelineId = null;
                
                // Sync the imported pipeline with the Deepthink module
                setActiveDeepthinkPipelineForImport(activeDeepthinkPipeline);
                
                renderActiveDeepthinkPipeline();
                if (activeDeepthinkPipeline && activeDeepthinkPipeline.activeTabId) {
                    activateTab(activeDeepthinkPipeline.activeTabId);
                }
            } else if (currentMode === 'react') {
                activeReactPipeline = importedConfig.activeReactPipeline ? {
                    ...importedConfig.activeReactPipeline,
                    isStopRequested: false,
                    status: (importedConfig.activeReactPipeline.status === 'orchestrating' || importedConfig.activeReactPipeline.status === 'processing_workers' || importedConfig.activeReactPipeline.status === 'stopping') ? 'idle' : importedConfig.activeReactPipeline.status,
                } : null;
                activePipelineId = null;
            }


            customPromptsWebsiteState = importedConfig.customPromptsWebsite ? JSON.parse(JSON.stringify(importedConfig.customPromptsWebsite)) : JSON.parse(JSON.stringify(defaultCustomPromptsWebsite));

            const importedDeepthinkPrompts = importedConfig.customPromptsDeepthink || createDefaultCustomPromptsDeepthink(NUM_INITIAL_STRATEGIES_DEEPTHINK, NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK);
            customPromptsDeepthinkState = JSON.parse(JSON.stringify(importedDeepthinkPrompts));

            const importedReactPrompts = importedConfig.customPromptsReact || defaultCustomPromptsReact; // Using defaultCustomPromptsReact directly
            customPromptsReactState = JSON.parse(JSON.stringify(importedReactPrompts));

            updateCustomPromptTextareasFromState();

            updateControlsState();
        } catch (error: any) {
            console.error("Error importing configuration:", error);
        } finally {
            if (fileInputTarget) fileInputTarget.value = '';
        }
    };
    reader.onerror = () => {
        if (fileInputTarget) fileInputTarget.value = '';
    };
    reader.readAsText(file);
}




// ---------- REACT MODE SPECIFIC FUNCTIONS ----------

async function startReactModeProcess(userRequest: string) {
    if (!ai) {
        return;
    }
    isGenerating = true;
    updateControlsState();

    const orchestratorSysPrompt = customPromptsReactState.sys_orchestrator;
    const orchestratorUserPrompt = renderPrompt(customPromptsReactState.user_orchestrator, { user_request: userRequest });

    activeReactPipeline = {
        id: `react-process-${Date.now()}`,
        userRequest: userRequest,
        orchestratorSystemInstruction: orchestratorSysPrompt,
        stages: Array(5).fill(null).map((_, i) => ({ // Initialize 5 stages
            id: i,
            title: `Worker Agent ${i + 1}`, // Placeholder title
            status: 'pending',
            isDetailsOpen: i === 0, // Open first by default
        })),
        status: 'orchestrating',
        isStopRequested: false,
        activeTabId: 'orchestrator', // Default to orchestrator tab
    };
    renderReactModePipeline();

    try {
        activeReactPipeline.orchestratorRetryAttempt = 0;

        let orchestratorResponseText = "";
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (activeReactPipeline.isStopRequested) throw new PipelineStopRequestedError("React Orchestration stopped by user.");
            activeReactPipeline.orchestratorRetryAttempt = attempt;
            activeReactPipeline.status = attempt > 0 ? 'orchestrating_retrying' : 'orchestrating'; // More specific status
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));
            }
            renderReactModePipeline(); // Update UI to show retrying or initial processing state

            try {
                const selectedModel = modelSelectElement.value || "gemini-2.5-pro"; // Fallback if not selected

                const apiResponse = await callGemini(orchestratorUserPrompt, getSelectedTemperature(), selectedModel, orchestratorSysPrompt, true, getSelectedTopP()); // Expecting JSON output
                orchestratorResponseText = apiResponse.text;
                break;
            } catch (e: any) {
                console.warn(`React Orchestrator, Attempt ${attempt + 1} failed: ${e.message}`);
                activeReactPipeline.error = `Orchestrator Attempt ${attempt + 1} failed: ${e.message || 'Unknown API error'}`;
                if (attempt === MAX_RETRIES) {
                    throw e; // Rethrow after max retries
                }
            }
        }

        activeReactPipeline.orchestratorRawOutput = orchestratorResponseText;
        const orchestratorJson = cleanOutputByType(orchestratorResponseText, 'json');

        try {
            const parsedOrchestratorOutput = JSON.parse(orchestratorJson);
            if (!parsedOrchestratorOutput.plan_txt || !Array.isArray(parsedOrchestratorOutput.worker_agents_prompts) || parsedOrchestratorOutput.worker_agents_prompts.length !== 5) {
                throw new Error("Orchestrator output is missing plan_txt or worker_agents_prompts (must be an array of 5).");
            }

            activeReactPipeline.orchestratorPlan = parsedOrchestratorOutput.plan_txt;

            parsedOrchestratorOutput.worker_agents_prompts.forEach((agentPromptData: any, index: number) => {
                if (index < 5 && activeReactPipeline && activeReactPipeline.stages[index]) {
                    const stage = activeReactPipeline.stages[index];
                    stage.title = agentPromptData.title || `Worker Agent ${index + 1}`;
                    stage.systemInstruction = agentPromptData.system_instruction;
                    stage.userPrompt = agentPromptData.user_prompt_template;
                }
            });

            activeReactPipeline.status = 'processing_workers'; // Next status
            renderReactModePipeline();

            // Kick off worker agents in parallel
            await runReactWorkerAgents();

        } catch (parseError: any) {
            console.error("Failed to parse Orchestrator JSON response:", parseError, "Cleaned JSON string:", orchestratorJson, "Raw response:", orchestratorResponseText);
            activeReactPipeline.error = `Failed to parse Orchestrator JSON: ${parseError.message}. Check console for details.`;
            throw new Error(`Orchestrator output parsing error: ${parseError.message}`);
        }

    } catch (error: any) {
        if (activeReactPipeline) {
            if (error instanceof PipelineStopRequestedError) {
                activeReactPipeline.status = 'stopped';
                activeReactPipeline.error = error.message;
            } else {
                activeReactPipeline.status = 'failed';
                if (!activeReactPipeline.error) activeReactPipeline.error = error.message || "An unknown error occurred in React Orchestrator.";
            }
        }
        console.error("Error in React Mode Orchestration process:", error);
    } finally {
        if (activeReactPipeline && activeReactPipeline.status !== 'processing_workers' && activeReactPipeline.status !== 'orchestrating' && activeReactPipeline.status !== 'orchestrating_retrying' && activeReactPipeline.status !== 'stopping') {
            isGenerating = false;
        }
        updateControlsState();
        renderReactModePipeline();
    }
}
function renderReactModePipeline() {
    if (currentMode !== 'react' || !tabsNavContainer || !pipelinesContentContainer) {
        if (currentMode !== 'react' && tabsNavContainer && pipelinesContentContainer) {
            tabsNavContainer.innerHTML = '';
            pipelinesContentContainer.innerHTML = '';
        }
        return;
    }

    if (!activeReactPipeline) {
        pipelinesContentContainer.innerHTML = '';
        return;
    }

    const pipeline = activeReactPipeline;

    tabsNavContainer.innerHTML = '';
    pipelinesContentContainer.innerHTML = '';

    // Orchestrator Tab
    const orchestratorTab = document.createElement('button');
    orchestratorTab.id = 'react-tab-orchestrator';
    orchestratorTab.className = 'tab-button react-mode-tab';
    orchestratorTab.textContent = 'Orchestrator';
    orchestratorTab.setAttribute('role', 'tab');
    orchestratorTab.setAttribute('aria-controls', 'pipeline-content-orchestrator');
    orchestratorTab.addEventListener('click', () => activateTab('orchestrator'));
    tabsNavContainer.appendChild(orchestratorTab);

    // Orchestrator Pane
    const orchestratorPane = document.createElement('div');
    orchestratorPane.id = 'pipeline-content-orchestrator';
    orchestratorPane.className = 'pipeline-content';
    let orchestratorHtml = `<div class="react-orchestrator-pane model-detail-card">
        <div class="model-detail-header">
             <div class="model-title-area">
                <h4 class="model-title">React App Orchestration</h4>
             </div>
             <div class="model-card-actions">
                <span class="status-badge status-${pipeline.status}" id="react-orchestrator-status-text">${pipeline.status.replace(/_/g, ' ')}</span>
                <button class="button" id="stop-react-pipeline-btn" title="Stop React App Generation" aria-label="Stop React App Generation" style="display: ${pipeline.status === 'orchestrating' || pipeline.status === 'processing_workers' ? 'inline-flex' : 'none'};">
                    <span class="material-symbols-outlined">stop_circle</span><span class="button-text">${pipeline.status === 'stopping' ? 'Stopping...' : 'Stop'}</span>
                </button>
            </div>
        </div>
        <div class="model-detail-section">
            <h5 class="model-section-title">User Request</h5>
            <p><strong>Request:</strong> ${escapeHtml(pipeline.userRequest)}</p>
        </div>`;
    if (pipeline.error && (pipeline.status === 'failed' || (pipeline.status === 'error' && pipeline.stages.every(s => s.status === 'pending')))) {
        orchestratorHtml += `<div class="status-message error"><pre>${escapeHtml(pipeline.error)}</pre></div>`;
    }
    if (pipeline.orchestratorPlan) {
        orchestratorHtml += `<details class="model-detail-section collapsible-section" open>
            <summary class="model-section-title">Orchestrator's Plan (plan.txt)</summary>
            <div class="scrollable-content-area custom-scrollbar"><pre>${escapeHtml(pipeline.orchestratorPlan)}</pre></div>
        </details>`;
    }
    if (pipeline.orchestratorRawOutput) {
        orchestratorHtml += `<details class="model-detail-section collapsible-section">
            <summary class="model-section-title">Orchestrator Raw Output (Debug)</summary>
            <div class="scrollable-content-area custom-scrollbar"><pre>${escapeHtml(pipeline.orchestratorRawOutput)}</pre></div>
        </details>`;
    }
    orchestratorHtml += `</div>`;
    orchestratorPane.innerHTML = orchestratorHtml;
    pipelinesContentContainer.appendChild(orchestratorPane);

    const stopReactButton = document.getElementById('stop-react-pipeline-btn');
    if (stopReactButton) {
        stopReactButton.onclick = () => {
            if (activeReactPipeline && (activeReactPipeline.status === 'orchestrating' || activeReactPipeline.status === 'processing_workers')) {
                activeReactPipeline.isStopRequested = true;
                activeReactPipeline.status = 'stopping';
                renderReactModePipeline();
            }
        };
        (stopReactButton as HTMLButtonElement).disabled = pipeline.status === 'stopping' || pipeline.status === 'stopped' || pipeline.status === 'failed' || pipeline.status === 'completed';
    }


    pipeline.stages.forEach(stage => {
        const tabButtonId = `react-tab-worker-${stage.id}`;
        const contentPaneId = `pipeline-content-worker-${stage.id}`;

        const tabButton = document.createElement('button');
        tabButton.id = tabButtonId;
        tabButton.className = `tab-button react-mode-tab status-${stage.status}`;
        tabButton.textContent = stage.title || `Agent ${stage.id + 1}`;
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-controls', contentPaneId);
        tabButton.addEventListener('click', () => activateTab(`worker-${stage.id}`));
        tabsNavContainer.appendChild(tabButton);

        const workerContentPane = document.createElement('div');
        workerContentPane.id = contentPaneId;
        workerContentPane.className = 'pipeline-content';

        let displayStatusText = stage.status.charAt(0).toUpperCase() + stage.status.slice(1);
        if (stage.status === 'retrying' && stage.retryAttempt !== undefined) {
            displayStatusText = `Retrying (${stage.retryAttempt}/${MAX_RETRIES})...`;
        }

        const hasContent = !!stage.generatedContent;
        let contentBlock;
        if (hasContent) {
            const contentToRender = `\`\`\`tsx\n${stage.generatedContent!}\n\`\`\``;
            contentBlock = renderMarkdown(contentToRender);
        } else {
            contentBlock = `<div class="empty-state-message">${getEmptyStateMessage(stage.status, 'code')}</div>`;
        }

        let workerDetailsHtml = `
            <div class="react-worker-content-pane model-detail-card">
                 <div class="model-detail-header">
                    <div class="model-title-area">
                        <h4 class="model-title">${escapeHtml(stage.title)}</h4>
                    </div>
                    <div class="model-card-actions">
                        <span class="status-badge status-${stage.status}">${displayStatusText}</span>
                    </div>
                </div>
                <div class="worker-details-grid">
                    <div class="info-column">
                        ${stage.error ? `<div class="status-message error"><pre>${escapeHtml(stage.error)}</pre></div>` : ''}
                        <details class="model-detail-section collapsible-section" open>
                            <summary class="model-section-title">System Instruction</summary>
                            <div class="scrollable-content-area custom-scrollbar"><pre>${escapeHtml(stage.systemInstruction || "Not available.")}</pre></div>
                        </details>
                        <details class="model-detail-section collapsible-section">
                            <summary class="model-section-title">Rendered User Prompt</summary>
                            <div class="scrollable-content-area custom-scrollbar"><pre>${escapeHtml(stage.renderedUserPrompt || stage.userPrompt || "Not available.")}</pre></div>
                        </details>
                    </div>
                    <div class="code-column">
                        <div class="model-detail-section">
                            <div class="code-block-header">
                                <span class="model-section-title">Generated Code/Content</span>
                                <div class="code-actions">
                                    <button class="button copy-react-worker-code-btn" data-worker-id="${stage.id}" title="Copy Code Snippet" ${!hasContent ? 'disabled' : ''}><span class="material-symbols-outlined">content_copy</span><span class="button-text">Copy</span></button>
                                    <button class="button download-react-worker-code-btn" data-worker-id="${stage.id}" title="Download Code Snippet" ${!hasContent ? 'disabled' : ''}><span class="material-symbols-outlined">download</span><span class="button-text">Download</span></button>
                                </div>
                            </div>
                            <div class="code-block-wrapper scrollable-content-area custom-scrollbar">${contentBlock}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        workerContentPane.innerHTML = workerDetailsHtml;
        pipelinesContentContainer.appendChild(workerContentPane);

        const copyBtn = workerContentPane.querySelector('.copy-react-worker-code-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', (e) => {
                const workerId = parseInt((e.currentTarget as HTMLElement).dataset.workerId || "-1", 10);
                const contentToCopy = activeReactPipeline?.stages.find(s => s.id === workerId)?.generatedContent;
                if (contentToCopy) {
                    copyToClipboard(contentToCopy, e.currentTarget as HTMLButtonElement);
                }
            });
        }

        const downloadBtn = workerContentPane.querySelector('.download-react-worker-code-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', (e) => {
                const workerId = parseInt((e.currentTarget as HTMLElement).dataset.workerId || "-1", 10);
                const stage = activeReactPipeline?.stages.find(s => s.id === workerId);
                if (stage?.generatedContent) {
                    const safeTitle = stage.title.replace(/[\s&/\\?#]+/g, '_').toLowerCase();
                    downloadFile(stage.generatedContent, `react_worker_${stage.id}_${safeTitle}.txt`, 'text/plain');
                }
            });
        }
    });

    if (pipeline.finalAppendedCode) {
        const finalOutputPane = document.createElement('div');
        const finalCodeHtml = renderMarkdown(`\`\`\`tsx\n${pipeline.finalAppendedCode}\n\`\`\``);

        finalOutputPane.innerHTML = `
            <div class="react-final-output-pane model-detail-card">
                <div class="model-detail-header">
                    <h4 class="model-title">Final Aggregated Application Code</h4>
                    <div class="model-card-actions">
                        <button id="download-react-runnable-project" class="button" type="button"><span class="material-symbols-outlined">archive</span><span class="button-text">Download Project (.zip)</span></button>
                    </div>
                </div>
                <p>The following is a concatenation of outputs from successful worker agents. File markers (e.g., // --- FILE: src/App.tsx ---) should indicate intended file paths.</p>
                <div class="code-block-wrapper scrollable-content-area custom-scrollbar" style="max-height: 60vh;">${finalCodeHtml}</div>
            </div>
        `;
        // Find the orchestrator pane and insert this after it.
        const orchestratorDiv = document.getElementById('pipeline-content-orchestrator');
        orchestratorDiv?.appendChild(finalOutputPane);

        const downloadRunnableProjectButton = document.getElementById('download-react-runnable-project');
        if (downloadRunnableProjectButton && pipeline.finalAppendedCode) {
            downloadRunnableProjectButton.addEventListener('click', createAndDownloadReactProjectZip);
        }
    }

    if (pipeline.activeTabId) {
        activateTab(pipeline.activeTabId);
    } else {
        activateTab(`orchestrator`);
    }
    updateControlsState();
}


async function runReactWorkerAgents() {
    if (!activeReactPipeline || activeReactPipeline.status !== 'processing_workers') {
        console.error("RunReactWorkerAgents called in an invalid state.");
        return;
    }
    renderReactModePipeline(); // Update UI to show workers starting

    const workerPromises = activeReactPipeline.stages.map(async (stage) => {
        if (!activeReactPipeline || activeReactPipeline.isStopRequested) {
            stage.status = 'cancelled';
            stage.error = "Process stopped by user.";
            renderReactModePipeline();
            return stage;
        }
        if (!stage.systemInstruction || !stage.userPrompt) {
            stage.status = 'error';
            stage.error = "Missing system instruction or user prompt template from Orchestrator.";
            console.error(`Worker Agent ${stage.id} missing prompts.`);
            renderReactModePipeline();
            return stage;
        }

        stage.status = 'processing';
        stage.retryAttempt = 0;
        renderReactModePipeline();

        stage.renderedUserPrompt = renderPrompt(stage.userPrompt, {
            plan_txt: activeReactPipeline.orchestratorPlan || "",
            user_request: activeReactPipeline.userRequest || ""
        });

        let stageResponseText = "";
        try {
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                if (!activeReactPipeline || activeReactPipeline.isStopRequested) {
                    throw new PipelineStopRequestedError(`Worker Agent ${stage.id} execution stopped by user.`);
                }
                stage.retryAttempt = attempt;
                stage.status = attempt > 0 ? 'retrying' : 'processing';

                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));
                }
                renderReactModePipeline();

                try {
                    const selectedModel = modelSelectElement.value || "gemini-2.5-pro";
                    const workerTemp = 0.7; // Moderate temperature for workers

                    const apiResponse = await callGemini(stage.renderedUserPrompt, workerTemp, selectedModel, stage.systemInstruction, false);
                    stageResponseText = apiResponse.text;
                    stage.generatedContent = cleanOutputByType(stageResponseText, 'text'); // Assuming text/code output
                    stage.status = 'completed';
                    stage.error = undefined;
                    renderReactModePipeline();
                    break; // Exit retry loop on success
                } catch (e: any) {
                    console.warn(`Worker Agent ${stage.id}, Attempt ${attempt + 1} failed: ${e.message}`);
                    stage.error = `Attempt ${attempt + 1} failed: ${e.message || 'Unknown API error'}`;
                    if (attempt === MAX_RETRIES) {
                        renderReactModePipeline();
                        throw e; // Rethrow after final attempt fails
                    }
                }
            }
        } catch (error: any) {
            console.error(`Worker Agent ${stage.id} failed all retries:`, error);
            stage.status = 'error';
            if (!stage.error) stage.error = error.message || `Worker Agent ${stage.id} failed.`;
            if (error instanceof PipelineStopRequestedError) {
                stage.status = 'cancelled';
                stage.error = error.message;
            }
        }
        renderReactModePipeline();
        return stage;
    });

    await Promise.allSettled(workerPromises);

    if (activeReactPipeline) {
        const anyAgentFailed = activeReactPipeline.stages.some(s => s.status === 'error');
        const allCancelled = activeReactPipeline.stages.every(s => s.status === 'cancelled');

        if (activeReactPipeline.isStopRequested || allCancelled) {
            activeReactPipeline.status = 'stopped';
        } else if (anyAgentFailed) {
            activeReactPipeline.status = 'failed';
        } else {
            activeReactPipeline.status = 'completed';
            aggregateReactOutputs();
        }
    }

    isGenerating = false;
    updateControlsState();
    renderReactModePipeline();
}

function aggregateReactOutputs() {
    if (!activeReactPipeline || activeReactPipeline.status !== 'completed') {
        console.warn("aggregateReactOutputs called when pipeline not completed or pipeline doesn't exist.");
        if (activeReactPipeline) activeReactPipeline.finalAppendedCode = "Error: Could not aggregate outputs due to pipeline status.";
        return;
    }

    let combinedCode = `/* --- React Application Code --- */\n/* Generated by Gemini Iterative Studio */\n/* User Request: ${activeReactPipeline.userRequest} */\n\n`;
    combinedCode += `/* --- Orchestrator Plan (plan.txt) --- */\n/*\n${activeReactPipeline.orchestratorPlan || "No plan generated."}\n*/\n\n`;

    activeReactPipeline.stages.forEach(stage => {
        if (stage.status === 'completed' && stage.generatedContent) {
            combinedCode += `/* --- Code from Agent ${stage.id + 1}: ${stage.title} --- */\n`;
            combinedCode += `${stage.generatedContent.trim()}\n\n`;
        } else if (stage.status === 'error') {
            combinedCode += `/* --- Agent ${stage.id + 1}: ${stage.title} - FAILED --- */\n`;
            combinedCode += `/* Error: ${stage.error || "Unknown error"} */\n\n`;
        } else if (stage.status === 'cancelled') {
            combinedCode += `/* --- Agent ${stage.id + 1}: ${stage.title} - CANCELLED --- */\n\n`;
        }
    });
    activeReactPipeline.finalAppendedCode = combinedCode;
}
// ----- END REACT MODE SPECIFIC FUNCTIONS -----


function initializeUI() {
    initializeApiKey();

    marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: (code, lang) => {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
    } as any);

    renderPipelineSelectors();
    initializeCustomPromptTextareas();
    updateUIAfterModeChange(); // Called early to set up initial UI based on default mode

    if (generateButton) {
        generateButton.addEventListener('click', async () => {
            if (!ai) { // Double check if API client is not initialized
                alert("API Key is not configured. Please ensure the process.env.API_KEY is set or provide one manually.");
                initializeApiKey(); // Try to re-initialize
                return;
            }
            const initialIdea = initialIdeaInput.value.trim();
            if (!initialIdea) {
                alert("Please enter an idea, premise, or request.");
                return;
            }

            if (currentMode === 'deepthink') {
                await startDeepthinkAnalysisProcess(initialIdea, currentProblemImageBase64, currentProblemImageMimeType);
            } else if (currentMode === 'react') {
                await startReactModeProcess(initialIdea);
            } else { // Website mode
                initPipelines();
                if (pipelinesState.length === 0) {
                    alert("Please select at least one variant (temperature) to run.");
                    return;
                }

                const runningPromises = pipelinesState.map(p => runPipeline(p.id, initialIdea));

                try {
                    await Promise.allSettled(runningPromises);
                } finally {
                    isGenerating = false;
                    updateControlsState();
                }
            }
        });
    }

    if (appModeSelector) {
        appModeSelector.querySelectorAll('input[name="appMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentMode = (e.target as HTMLInputElement).value as ApplicationMode;
                updateUIAfterModeChange();
            });
        });
    }


    if (exportConfigButton) {
        exportConfigButton.addEventListener('click', exportConfiguration);
    }
    if (importConfigInput) {
        importConfigInput.addEventListener('change', handleImportConfiguration);
    }

    // Prompts Modal Listeners
    if (customizePromptsTrigger) {
        customizePromptsTrigger.addEventListener('click', () => setPromptsModalVisible(true));
    }
    if (promptsModalCloseButton) {
        promptsModalCloseButton.addEventListener('click', () => setPromptsModalVisible(false));
    }
    if (promptsModalOverlay) {
        promptsModalOverlay.addEventListener('click', (e) => {
            if (e.target === promptsModalOverlay) {
                setPromptsModalVisible(false);
            }
        });
    }

    // Diff Modal Listeners
    if (diffModalCloseButton) {
        diffModalCloseButton.addEventListener('click', closeDiffModal);
    }
    if (diffModalOverlay) {
        diffModalOverlay.addEventListener('click', (e) => {
            if (e.target === diffModalOverlay) {
                closeDiffModal();
            }
        });
    }
    
    // Diff Mode Button Listeners
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('#instant-fixes-button')) {
            activateDiffMode('instant-fixes');
        } else if (target.closest('#global-compare-button')) {
            activateDiffMode('global-compare');
        } else if (target.closest('#diff-analysis-view-button')) {
            const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
            if (diffAnalysisButton && !diffAnalysisButton.classList.contains('active')) {
                activateInstantFixesView('diff-analysis');
            } else {
                activateInstantFixesView('side-by-side');
            }
        } else if (target.closest('#preview-button')) {
            const previewButton = document.getElementById('preview-button');
            if (previewButton && !previewButton.classList.contains('active')) {
                activateInstantFixesView('preview');
            } else {
                activateInstantFixesView('side-by-side');
            }
        } else if (target.closest('#diff-view-toggle-button')) {
            toggleDiffViewDropdown();
        } else if (target.closest('.diff-view-option')) {
            const option = target.closest('.diff-view-option') as HTMLElement;
            const view = option.dataset.view as 'unified' | 'split';
            if (view) {
                activateDiffViewMode(view);
                hideDiffViewDropdown();
            }
        } else if (target.closest('#copy-source-button')) {
            copyPreviewContent('source');
        } else if (target.closest('#copy-target-button')) {
            copyPreviewContent('target');
        } else if (target.closest('#download-source-button')) {
            downloadPreviewContent('source');
        } else if (target.closest('#download-target-button')) {
            downloadPreviewContent('target');
        } else if (target.closest('#fullscreen-source-button')) {
            openPreviewFullscreen('source');
        } else if (target.closest('#fullscreen-target-button')) {
            openPreviewFullscreen('target');
        } else if (target.closest('#view-provided-patches-button')) {
            openPatchesModal();
        } else {
            // Close diff view dropdown if clicking outside
            if (!target.closest('#diff-view-toggle')) {
                hideDiffViewDropdown();
            }
        }
    });
    // Event delegation for dynamically created "Compare" buttons and "View The Argument" buttons
    if (pipelinesContentContainer) {
        pipelinesContentContainer.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('compare-output-button')) {
                const pipelineId = parseInt(target.dataset.pipelineId || "-1", 10);
                const iterationNumber = parseInt(target.dataset.iterationNumber || "-1", 10);
                const contentType = target.dataset.contentType as ('html' | 'text');
                if (pipelineId !== -1 && iterationNumber !== -1 && (contentType === 'html' || contentType === 'text')) {
                    openDiffModal(pipelineId, iterationNumber, contentType);
                }
            } else if (target.closest('#view-provided-patches-button')) {
                openPatchesModal();
            }
        });
    }

    // API Key Listeners
    saveApiKeyButton.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini-api-key', key);
            apiKeyInput.value = ''; // Clear input after save
            initializeApiKey(); // Re-initialize
            updateControlsState(); // Update button states
        } else {
            alert("Please enter a valid API Key.");
        }
    });

    clearApiKeyButton.addEventListener('click', () => {
        localStorage.removeItem('gemini-api-key');
        initializeApiKey(); // Re-initialize
        updateControlsState(); // Update button states
    });

    updateControlsState();

    // Patches modal controls
    const patchesCloseBtn = document.getElementById('patches-modal-close-button');
    const patchesOverlay = document.getElementById('patches-modal-overlay');
    if (patchesCloseBtn && patchesOverlay) {
        patchesCloseBtn.addEventListener('click', () => {
            patchesOverlay.classList.remove('is-visible');
            setTimeout(() => { (patchesOverlay as HTMLElement).style.display = 'none'; }, 150);
        });
        patchesOverlay.addEventListener('click', (e) => {
            if (e.target === patchesOverlay) {
                patchesOverlay.classList.remove('is-visible');
                setTimeout(() => { (patchesOverlay as HTMLElement).style.display = 'none'; }, 150);
            }
        });
    }
}

// ---------- DIFF MODAL FUNCTIONS ----------

let diffSourceData: { pipelineId: number, iterationNumber: number, contentType: 'html' | 'text', content: string, title: string } | null = null;
let currentDiffViewMode: 'unified' | 'split' = 'split';
let currentSourceContent: string = '';
let currentTargetContent: string = '';
let currentProvidedPatchesJson: string | null = null;

// Helper function to extract HTML from old format request prompts
function extractHtmlFromRequestPrompt(requestPrompt: string): string | null {
    if (!requestPrompt) return null;
    
    // Look for HTML code blocks in the request prompt
    const htmlMatch = requestPrompt.match(/```html\n([\s\S]*?)\n```/);
    if (htmlMatch && htmlMatch[1]) {
        return htmlMatch[1].trim();
    }
    
    // Alternative pattern without language specifier
    const altMatch = requestPrompt.match(/```\n(<!DOCTYPE html[\s\S]*?)\n```/);
    if (altMatch && altMatch[1]) {
        return altMatch[1].trim();
    }
    
    return null;
}
function renderDiff(sourceText: string, targetText: string) {
    // Store content in global variables for toggle functionality
    currentSourceContent = sourceText;
    currentTargetContent = targetText;
    
    if (!diffViewerPanel) return;
    // Ensure parent containers can scroll in unified view (disable split lock on both containers)
    const unifiedGlobalContainer = document.getElementById('diff-viewer-panel');
    const unifiedInstantContainer = document.getElementById('instant-fixes-diff-viewer');
    unifiedGlobalContainer?.classList.remove('diff-side-by-side-active');
    unifiedInstantContainer?.classList.remove('diff-side-by-side-active');
    const differences = Diff.diffLines(sourceText, targetText, { newlineIsToken: true });
    
    // Calculate diff statistics
    let addedLines = 0;
    let removedLines = 0;
    let totalChanges = 0;
    
    differences.forEach(part => {
        const lines = part.value.split('\n').filter(line => line !== '' || part.value.endsWith('\n'));
        if (part.added) {
            addedLines += lines.length;
            totalChanges += lines.length;
        } else if (part.removed) {
            removedLines += lines.length;
            totalChanges += lines.length;
        }
    });
    
    // Update header diff stats
    updateHeaderDiffStats(sourceText, targetText);
    
    // Create diff content HTML
    let diffHtml = '<div class="diff-view-fullscreen">';
    let lineNumber = 1;
    
    differences.forEach(part => {
        const lines = part.value.split('\n');
        lines.forEach((line, index) => {
            if (index === lines.length - 1 && line === '') return; // Skip empty last line
            
            const colorClass = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-neutral';
            const prefix = part.added ? '+' : part.removed ? '-' : ' ';
            
            diffHtml += `<div class="diff-line ${colorClass}">
                <span class="diff-line-number">${lineNumber}</span>
                <span class="diff-line-prefix">${prefix}</span>
                <span class="diff-line-content">${escapeHtml(line)}</span>
            </div>`;
            
            if (!part.removed) lineNumber++;
        });
    });
    
    diffHtml += '</div>';
    
    // Only show diff content (stats are in header now)
    diffViewerPanel.innerHTML = diffHtml;
}

function renderSideBySideComparison(sourceText: string, targetText: string, sourceTitle: string, targetTitle: string) {
    // Store content in global variables for preview controls
    currentSourceContent = sourceText;
    currentTargetContent = targetText;
    
    const diffSourceContent = document.getElementById('diff-source-content');
    const diffTargetContent = document.getElementById('diff-target-content');
    const diffSourceTitleElement = document.getElementById('diff-source-title');
    const diffTargetTitleElement = document.getElementById('diff-target-title');
    
    if (!diffSourceContent || !diffTargetContent || !diffSourceTitleElement || !diffTargetTitleElement) return;
    
    // Update titles
    diffSourceTitleElement.textContent = sourceTitle;
    diffTargetTitleElement.textContent = targetTitle;
    
    // Update preview titles
    const previewSourceTitle = document.getElementById('preview-source-title');
    const previewTargetTitle = document.getElementById('preview-target-title');
    if (previewSourceTitle) previewSourceTitle.textContent = sourceTitle;
    if (previewTargetTitle) previewTargetTitle.textContent = targetTitle;
    
    // Calculate and update header diff stats
    updateHeaderDiffStats(sourceText, targetText);
    
    // Render content with syntax highlighting
    const renderContent = (text: string) => {
        if (diffSourceData?.contentType === 'html') {
            return `<pre><code class="language-html">${escapeHtml(text)}</code></pre>`;
        } else {
            return `<pre><code class="language-text">${escapeHtml(text)}</code></pre>`;
        }
    };
    
    diffSourceContent.innerHTML = renderContent(sourceText);
    diffTargetContent.innerHTML = renderContent(targetText);
    
    // Update preview frames if content is HTML
    if (diffSourceData && diffSourceData.contentType === 'html') {
        const previewSourceFrame = document.getElementById('preview-source-frame') as HTMLIFrameElement;
        const previewTargetFrame = document.getElementById('preview-target-frame') as HTMLIFrameElement;
        
        if (previewSourceFrame) {
            const sourceBlob = new Blob([sourceText], { type: 'text/html' });
            previewSourceFrame.src = URL.createObjectURL(sourceBlob);
        }
        
        if (previewTargetFrame) {
            const targetBlob = new Blob([targetText], { type: 'text/html' });
            previewTargetFrame.src = URL.createObjectURL(targetBlob);
        }
    }
    
    // Apply syntax highlighting
    if (typeof hljs !== 'undefined') {
        diffSourceContent.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block as HTMLElement));
        diffTargetContent.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block as HTMLElement));
    }
}

function populateDiffTargetTree() {
    if (!diffTargetTreeContainer || !diffSourceData) return;
    diffTargetTreeContainer.innerHTML = ''; // Clear previous tree

    pipelinesState.forEach(pipeline => {
        const pipelineTitle = document.createElement('h5');
        pipelineTitle.textContent = `Variant ${pipeline.id + 1} (T: ${pipeline.temperature.toFixed(1)})`;
        diffTargetTreeContainer.appendChild(pipelineTitle);

        pipeline.iterations.forEach(iter => {
            const isSource = pipeline.id === diffSourceData!.pipelineId && iter.iterationNumber === diffSourceData!.iterationNumber;
            let targetContent: string | undefined = undefined;
            if (diffSourceData!.contentType === 'html') {
                targetContent = iter.generatedHtml;
            } else { // text
                targetContent = iter.generatedOrRevisedText || iter.generatedMainContent;
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = 'tree-item';
            itemDiv.textContent = iter.title;
            if (isSource || !targetContent) {
                itemDiv.classList.add('disabled');
                if (isSource) itemDiv.textContent += ' (Source A)';
                else itemDiv.textContent += ' (No content)';
            } else {
                itemDiv.addEventListener('click', () => {
                    if (targetContent) { // Should always be true if not disabled
                        // Store the current content for toggle functionality
                        currentSourceContent = diffSourceData!.content;
                        currentTargetContent = targetContent;
                        
                        // Render based on current diff view mode
                        if (currentDiffViewMode === 'unified') {
                            renderDiff(diffSourceData!.content, targetContent);
                        } else {
                            renderDiffSideBySide(diffSourceData!.content, targetContent);
                        }
                        
                        // Optionally highlight selected target
                        diffTargetTreeContainer.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
                        itemDiv.classList.add('selected');
                    }
                });
            }
            diffTargetTreeContainer.appendChild(itemDiv);
        });
    });
}


function openDiffModal(pipelineId: number, iterationNumber: number, contentType: 'html' | 'text') {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;
    const iteration = pipeline.iterations.find(iter => iter.iterationNumber === iterationNumber);
    if (!iteration) return;

    let sourceContent: string | undefined;
    let targetContent: string | undefined;
    let sourceTitle: string;
    let targetTitle: string;

    if (contentType === 'html') {
        // For HTML mode, compare Request 1 (raw) vs Request 2 (bug fixed) within the same iteration
        // Handle both old and new JSON formats
        
        if (iteration.generatedRawHtml) {
            // New format with separate raw and fixed versions
            sourceContent = iteration.generatedRawHtml;
            targetContent = iteration.generatedHtml;
            
            if (iteration.title.includes('Initial')) {
                sourceTitle = "Initial Generation (Request 1)";
                targetTitle = "Initial Bug Fix (Request 2)";
            } else if (iteration.title.includes('Refinement') || iteration.title.includes('Stabilization') || iteration.title.includes('Feature')) {
                sourceTitle = "Feature Implementation (Request 1)";
                targetTitle = "Bug Fix & Completion (Request 2)";
            } else {
                sourceTitle = "Before Fixing";
                targetTitle = "After Fixing";
            }
            currentProvidedPatchesJson = iteration.providedPatchesJson || null;
        } else {
            // Old format: extract raw HTML from request prompt
            const rawHtmlFromPrompt = extractHtmlFromRequestPrompt(iteration.requestPromptHtml_BugFix);
            
            if (rawHtmlFromPrompt) {
                sourceContent = rawHtmlFromPrompt;
                targetContent = iteration.generatedHtml;
                sourceTitle = "Before Bug Fix";
                targetTitle = "After Bug Fix";
                currentProvidedPatchesJson = iteration.providedPatchesJson || null;
            } else {
                // Fallback: compare with previous iteration if available
                if (iteration.iterationNumber > 0) {
                    const prevIteration = pipeline.iterations.find(iter => iter.iterationNumber === iteration.iterationNumber - 1);
                    if (prevIteration?.generatedHtml) {
                        sourceContent = prevIteration.generatedHtml;
                        targetContent = iteration.generatedHtml;
                        sourceTitle = `Previous: ${prevIteration.title}`;
                        targetTitle = `Current: ${iteration.title}`;
                    } else {
                        sourceContent = iteration.generatedHtml;
                        targetContent = iteration.generatedHtml;
                        sourceTitle = iteration.title;
                        targetTitle = iteration.title;
                    }
                } else {
                    sourceContent = iteration.generatedHtml;
                    targetContent = iteration.generatedHtml;
                    sourceTitle = iteration.title;
                    targetTitle = iteration.title;
                }
            }
        }
    } else { // text mode
        sourceContent = iteration.generatedOrRevisedText || iteration.generatedMainContent;
        targetContent = sourceContent; // For non-HTML modes, we don't have the raw vs fixed distinction yet
        sourceTitle = iteration.title;
        targetTitle = iteration.title;
    }

    if (!sourceContent) {
        alert("Source content is not available for comparison.");
        return;
    }

    if (!targetContent) {
        alert("Target content is not available for comparison.");
        return;
    }

    diffSourceData = { pipelineId, iterationNumber, contentType, content: sourceContent, title: sourceTitle };

    // Set up the modal for instant fixes mode by default
    activateDiffMode('instant-fixes');
    
    // Show side-by-side comparison by default
    renderSideBySideComparison(sourceContent, targetContent, sourceTitle, targetTitle);
    
    // Store content globally for diff view switching
    currentSourceContent = sourceContent;
    currentTargetContent = targetContent;
    
    // Initialize the diff view toggle button
    updateDiffViewToggleButton(currentDiffViewMode);

    // Set up global compare mode
    if (diffSourceLabel) diffSourceLabel.textContent = `Variant ${pipelineId + 1} - ${iteration.title}`;
    if (diffViewerPanel) {
        // Show initial message for global compare
        diffViewerPanel.innerHTML = '<div class="diff-no-selection empty-state-message"><p>Select a target (B) from the list to view differences.</p></div>';
    }
    populateDiffTargetTree();

    if (diffModalOverlay) {
        diffModalOverlay.style.display = 'flex';
        setTimeout(() => diffModalOverlay.classList.add('is-visible'), 10);
    }
}

function activateDiffMode(mode: 'instant-fixes' | 'global-compare') {
    const instantFixesButton = document.getElementById('instant-fixes-button');
    const globalCompareButton = document.getElementById('global-compare-button');
    const instantFixesPanel = document.getElementById('instant-fixes-panel');
    const globalComparePanel = document.getElementById('global-compare-panel');
    const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
    const previewButton = document.getElementById('preview-button');
    
    if (!instantFixesButton || !globalCompareButton || !instantFixesPanel || !globalComparePanel || !diffAnalysisButton || !previewButton) return;
    
    // Update button states
    instantFixesButton.classList.toggle('active', mode === 'instant-fixes');
    globalCompareButton.classList.toggle('active', mode === 'global-compare');
    
    // Update panel visibility
    instantFixesPanel.classList.toggle('active', mode === 'instant-fixes');
    globalComparePanel.classList.toggle('active', mode === 'global-compare');
    
    // Show/hide and enable/disable view mode buttons based on mode
    if (mode === 'instant-fixes') {
        diffAnalysisButton.style.display = 'flex';
        previewButton.style.display = 'flex';
        // Reset to side-by-side view when switching to instant fixes
        activateInstantFixesView('side-by-side');
        hideDiffViewToggle(); // Hide toggle for side-by-side view
    } else {
        diffAnalysisButton.style.display = 'none';
        previewButton.style.display = 'none';
        // Reset button states when hiding
        diffAnalysisButton.classList.remove('active');
        previewButton.classList.remove('active');
        showDiffViewToggle(); // Show toggle for global compare mode
        
        // If we have content available, render it in the current mode
        if (currentSourceContent && currentTargetContent) {
            if (currentDiffViewMode === 'unified') {
                renderDiff(currentSourceContent, currentTargetContent);
            } else {
                renderDiffSideBySide(currentSourceContent, currentTargetContent);
            }
        }
    }
    
    // Check if we have the necessary data and next iteration
    if (diffSourceData) {
        const pipeline = pipelinesState.find(p => p.id === diffSourceData.pipelineId);
        const nextIteration = pipeline?.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber + 1);
        const hasNextIteration = !!nextIteration;
        const isHtmlContent = diffSourceData.contentType === 'html';
        
        // Handle instant fixes mode
        if (mode === 'instant-fixes') {
            // For HTML mode, compare Request 1 vs Request 2 within the same iteration
            let targetContent: string | undefined;
            let targetTitle: string;
            
            if (diffSourceData.contentType === 'html') {
                const sourceIteration = pipeline.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
                if (sourceIteration) {
                    if (sourceIteration.generatedRawHtml) {
                        // New format: compare raw vs fixed within same iteration
                        targetContent = sourceIteration.generatedHtml; // Request 2 output
                        currentProvidedPatchesJson = sourceIteration.providedPatchesJson || null;
                        
                        if (sourceIteration.title.includes('Initial')) {
                            targetTitle = "Initial Bug Fix (Request 2)";
                        } else if (sourceIteration.title.includes('Refinement') || sourceIteration.title.includes('Stabilization') || sourceIteration.title.includes('Feature')) {
                            targetTitle = "Bug Fix & Completion (Request 2)";
                        } else {
                            targetTitle = "After Fixing";
                        }
                    } else {
                        // Old format: check if we can extract raw HTML from request prompt
                        const rawHtmlFromPrompt = extractHtmlFromRequestPrompt(sourceIteration.requestPromptHtml_BugFix);
                        
                        if (rawHtmlFromPrompt) {
                            targetContent = sourceIteration.generatedHtml;
                            targetTitle = "After Bug Fix";
                            currentProvidedPatchesJson = sourceIteration.providedPatchesJson || null;
                        } else {
                            // Fallback: compare with previous iteration if available
                            if (diffSourceData.iterationNumber > 0) {
                                const prevIteration = pipeline.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber - 1);
                                if (prevIteration?.generatedHtml) {
                                    targetContent = sourceIteration.generatedHtml;
                                    targetTitle = `Current: ${sourceIteration.title}`;
                                }
                            }
                            
                            if (!targetContent) {
                                // Fallback: show same content
                                targetContent = sourceIteration.generatedHtml;
                                targetTitle = sourceIteration.title;
                            }
                        }
                    }
                }
            } else {
                // For non-HTML modes, we don't have separate raw vs fixed versions yet
                const sourceIteration = pipeline.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
                // Fallback to generatedHtml if present; otherwise leave undefined (no instant fixes for non-HTML)
                targetContent = sourceIteration?.generatedHtml;
                targetTitle = sourceIteration?.title || "Target";
            }
            
            if (targetContent) {
                renderSideBySideComparison(diffSourceData.content, targetContent, diffSourceData.title, targetTitle);
            }
        }
        
        // Check if we have both raw and bug-fix versions within the same iteration
        let hasBugFixVersion = false;
        if (diffSourceData.contentType === 'html') {
            const sourceIteration = pipeline.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
            // New format: check for both generatedRawHtml and generatedHtml
            // Old format: check if we can extract raw HTML from request prompt, or have a previous iteration
            hasBugFixVersion = !!(sourceIteration?.generatedRawHtml && sourceIteration?.generatedHtml) ||
                              (!sourceIteration?.generatedRawHtml && (
                                  extractHtmlFromRequestPrompt(sourceIteration?.requestPromptHtml_BugFix || '') ||
                                  (diffSourceData.iterationNumber > 0 && 
                                   pipeline.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber - 1)?.generatedHtml)
                              ));
        } else {
            // For non-HTML modes, we don't have separate raw vs fixed versions yet
            hasBugFixVersion = !!pipeline.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
        }
        
        // Update button availability
        instantFixesButton.disabled = !hasBugFixVersion;
        diffAnalysisButton.disabled = !hasBugFixVersion || mode !== 'instant-fixes';
        previewButton.disabled = !hasBugFixVersion || mode !== 'instant-fixes' || !isHtmlContent;
        
        if (!hasBugFixVersion) {
            instantFixesButton.title = "No corresponding bug fixed/polished version available";
            diffAnalysisButton.title = "No corresponding bug fixed/polished version available";
            previewButton.title = "No corresponding bug fixed/polished version available";
        } else if (!isHtmlContent) {
            previewButton.title = "Preview only available for HTML content";
            diffAnalysisButton.title = mode === 'instant-fixes' ? "" : "Only available in Instant Fixes mode";
            instantFixesButton.title = "";
        } else {
            instantFixesButton.title = "";
            diffAnalysisButton.title = mode === 'instant-fixes' ? "" : "Only available in Instant Fixes mode";
            previewButton.title = mode === 'instant-fixes' ? "" : "Only available in Instant Fixes mode";
        }
    }
}
function renderDiffSideBySide(sourceText: string, targetText: string) {
    // Store content in global variables for toggle functionality
    currentSourceContent = sourceText;
    currentTargetContent = targetText;

    // Choose the correct container based on the active panel.
    // When in Global Compare, we must render into 'diff-viewer-panel'.
    // When in Instant Fixes, render into 'instant-fixes-diff-viewer'.
    const globalComparePanel = document.getElementById('global-compare-panel');
    const instantFixesPanel = document.getElementById('instant-fixes-panel');
    let container: HTMLElement | null = null;

    if (globalComparePanel && globalComparePanel.classList.contains('active')) {
        container = document.getElementById('diff-viewer-panel');
    } else if (instantFixesPanel && instantFixesPanel.classList.contains('active')) {
        container = document.getElementById('instant-fixes-diff-viewer');
    } else {
        // Fallback: try global compare container first, then instant fixes
        container = document.getElementById('diff-viewer-panel') || document.getElementById('instant-fixes-diff-viewer');
    }
    if (!container) return;
    // Only the active split container should suppress its own scrolling
    const globalContainer = document.getElementById('diff-viewer-panel');
    const instantContainer = document.getElementById('instant-fixes-diff-viewer');
    globalContainer?.classList.remove('diff-side-by-side-active');
    instantContainer?.classList.remove('diff-side-by-side-active');
    // Prevent parent container from scrolling; let panes handle scroll (for proper sync)
    container.classList.add('diff-side-by-side-active');

    // Calculate and update header diff stats
    updateHeaderDiffStats(sourceText, targetText);

    // Create side-by-side diff HTML
    const diff = Diff.diffLines(sourceText, targetText, { newlineIsToken: true });
    let leftPaneHtml = '';
    let rightPaneHtml = '';
    let leftLineNum = 1;
    let rightLineNum = 1;

    diff.forEach(part => {
        const lines = part.value.split('\n').filter(l => l.length > 0);
        if (part.added) {
            lines.forEach(line => {
                rightPaneHtml += `<div class="diff-line diff-added"><span class="diff-line-number">${rightLineNum++}</span><span class="diff-line-prefix">+</span><span class="diff-line-content">${escapeHtml(line)}</span></div>`;
                leftPaneHtml += `<div class="diff-line diff-placeholder"></div>`;
            });
        } else if (part.removed) {
            lines.forEach(line => {
                leftPaneHtml += `<div class="diff-line diff-removed"><span class="diff-line-number">${leftLineNum++}</span><span class="diff-line-prefix">-</span><span class="diff-line-content">${escapeHtml(line)}</span></div>`;
                rightPaneHtml += `<div class="diff-line diff-placeholder"></div>`;
            });
        } else {
            lines.forEach(line => {
                leftPaneHtml += `<div class="diff-line diff-neutral"><span class="diff-line-number">${leftLineNum++}</span><span class="diff-line-prefix"> </span><span class="diff-line-content">${escapeHtml(line)}</span></div>`;
                rightPaneHtml += `<div class="diff-line diff-neutral"><span class="diff-line-number">${rightLineNum++}</span><span class="diff-line-prefix"> </span><span class="diff-line-content">${escapeHtml(line)}</span></div>`;
            });
        }
    });

    const diffHtml = `
        <div class="diff-view-side-by-side">
            <div id="diff-pane-left" class="diff-pane custom-scrollbar">
                <pre style="font-family: var(--font-family)"><code>${leftPaneHtml}</code></pre>
            </div>
            <div id="diff-pane-right" class="diff-pane custom-scrollbar">
                <pre style="font-family: var(--font-family)"><code>${rightPaneHtml}</code></pre>
            </div>
        </div>
    `;

    container.innerHTML = diffHtml;

    // IMPORTANT: scope queries to the active container to avoid duplicate ID conflicts
    const leftPane = container.querySelector('#diff-pane-left') as HTMLElement | null;
    const rightPane = container.querySelector('#diff-pane-right') as HTMLElement | null;

    if (leftPane && rightPane) {
        let isSyncing = false;

        const syncScroll = (source: HTMLElement, target: HTMLElement) => {
            if (isSyncing) return;
            isSyncing = true;

            // Proportional vertical sync to handle minor height differences
            const sMax = Math.max(1, source.scrollHeight - source.clientHeight);
            const tMax = Math.max(1, target.scrollHeight - target.clientHeight);
            const ratio = source.scrollTop / sMax;
            target.scrollTop = Math.round(ratio * tMax);

            // Direct horizontal sync
            target.scrollLeft = source.scrollLeft;

            requestAnimationFrame(() => { isSyncing = false; });
        };

        const onLeftScroll = () => syncScroll(leftPane, rightPane);
        const onRightScroll = () => syncScroll(rightPane, leftPane);

        // Scroll events (keyboard, programmatic, touchpad)
        leftPane.addEventListener('scroll', onLeftScroll, { passive: true });
        rightPane.addEventListener('scroll', onRightScroll, { passive: true });

        // Wheel events for horizontal Shift+scroll
        leftPane.addEventListener('wheel', (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                leftPane.scrollLeft += e.deltaY;
                rightPane.scrollLeft = leftPane.scrollLeft;
            }
        }, { passive: false });

        rightPane.addEventListener('wheel', (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                rightPane.scrollLeft += e.deltaY;
                leftPane.scrollLeft = rightPane.scrollLeft;
            }
        }, { passive: false });

        // Resize observer to keep proportional mapping accurate
        const ro = new ResizeObserver(() => {
            // Trigger a sync from the currently scrolled pane
            if (leftPane.scrollTop >= rightPane.scrollTop) {
                onLeftScroll();
            } else {
                onRightScroll();
            }
        });
        ro.observe(leftPane);
        ro.observe(rightPane);
    }
}
function activateInstantFixesView(view: 'side-by-side' | 'diff-analysis' | 'preview') {
    const diffAnalysisButton = document.getElementById('diff-analysis-view-button');
    const previewButton = document.getElementById('preview-button');
    const sideBySideView = document.getElementById('side-by-side-view');
    const diffAnalysisView = document.getElementById('diff-analysis-view');
    const previewView = document.getElementById('preview-view');
    
    if (!diffAnalysisButton || !previewButton || !sideBySideView || !diffAnalysisView || !previewView) return;
    
    // Update button states
    diffAnalysisButton.classList.toggle('active', view === 'diff-analysis');
    previewButton.classList.toggle('active', view === 'preview');
    
    // Update view visibility
    sideBySideView.classList.toggle('active', view === 'side-by-side');
    diffAnalysisView.classList.toggle('active', view === 'diff-analysis');
    previewView.classList.toggle('active', view === 'preview');
    
    // Show/hide diff view toggle based on view
    if (view === 'diff-analysis') {
        showDiffViewToggle();
        // Get target content properly for diff analysis
        if (diffSourceData) {
            const pipeline = pipelinesState.find(p => p.id === diffSourceData.pipelineId);
            let analysisTargetContent: string | undefined;
            
            if (diffSourceData.contentType === 'html') {
                const sourceIteration = pipeline?.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
                analysisTargetContent = sourceIteration?.generatedHtml;
                currentProvidedPatchesJson = sourceIteration?.providedPatchesJson || null;
            } else {
                const sourceIteration = pipeline?.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
                analysisTargetContent = sourceIteration?.generatedOrRevisedText || sourceIteration?.generatedMainContent;
            }
            
            if (analysisTargetContent) {
                // Store current content for toggle functionality
                currentSourceContent = diffSourceData.content;
                currentTargetContent = analysisTargetContent;
                
                // Immediately render the diff analysis based on current mode
                if (currentDiffViewMode === 'unified') {
                    renderInstantFixesDiff(diffSourceData.content, analysisTargetContent);
                } else {
                    renderDiffSideBySide(diffSourceData.content, analysisTargetContent);
                }
            }
        }
    } else {
        hideDiffViewToggle();
    }
    
    // Handle different views
    if (diffSourceData) {
        const pipeline = pipelinesState.find(p => p.id === diffSourceData.pipelineId);
        
        // For HTML mode, compare Request 1 vs Request 2 within the same iteration
        let targetContent: string | undefined;
        let targetTitle: string;
        
        if (diffSourceData.contentType === 'html') {
            const sourceIteration = pipeline?.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
            if (sourceIteration) {
                targetContent = sourceIteration.generatedHtml; // Request 2 output
                currentProvidedPatchesJson = sourceIteration.providedPatchesJson || null;
                
                if (sourceIteration.title.includes('Initial')) {
                    targetTitle = "Initial Bug Fix (Request 2)";
                } else if (sourceIteration.title.includes('Refinement') || sourceIteration.title.includes('Stabilization') || sourceIteration.title.includes('Feature')) {
                    targetTitle = "Bug Fix & Completion (Request 2)";
                } else {
                    targetTitle = "After Fixing";
                }
            }
        } else {
            // For non-HTML modes, we don't have separate raw vs fixed versions yet
            const sourceIteration = pipeline?.iterations.find(iter => iter.iterationNumber === diffSourceData.iterationNumber);
            targetContent = sourceIteration?.generatedOrRevisedText || sourceIteration?.generatedMainContent;
            targetTitle = sourceIteration?.title || "Target";
        }
        
        if (targetContent) {
            if (view === 'diff-analysis') {
                // Store current content for toggle functionality
                currentSourceContent = diffSourceData.content;
                currentTargetContent = targetContent;
                
                // Render based on current diff view mode
                if (currentDiffViewMode === 'unified') {
                    renderInstantFixesDiff(diffSourceData.content, targetContent);
                } else {
                    renderDiffSideBySide(diffSourceData.content, targetContent);
                }
            } else if (view === 'preview' && diffSourceData.contentType === 'html') {
                renderHtmlPreview(diffSourceData.content, targetContent, diffSourceData.title, targetTitle);
            } else if (view === 'side-by-side') {
                renderSideBySideComparison(diffSourceData.content, targetContent, diffSourceData.title, targetTitle);
            }
        }
    }
}



function renderHtmlPreview(sourceHtml: string, targetHtml: string, sourceTitle: string, targetTitle: string) {
    const previewSourceFrame = document.getElementById('preview-source-frame') as HTMLIFrameElement;
    const previewTargetFrame = document.getElementById('preview-target-frame') as HTMLIFrameElement;
    const previewSourceTitleElement = document.getElementById('preview-source-title');
    const previewTargetTitleElement = document.getElementById('preview-target-title');
    
    if (!previewSourceFrame || !previewTargetFrame || !previewSourceTitleElement || !previewTargetTitleElement) return;
    
    // Update titles
    previewSourceTitleElement.textContent = sourceTitle;
    previewTargetTitleElement.textContent = targetTitle;
    
    // Calculate and update header diff stats
    updateHeaderDiffStats(sourceHtml, targetHtml);
    
    // Load HTML content into iframes
    previewSourceFrame.srcdoc = sourceHtml;
    previewTargetFrame.srcdoc = targetHtml;
}

function renderInstantFixesDiff(sourceText: string, targetText: string) {
    const diffViewer = document.getElementById('instant-fixes-diff-viewer');
    if (!diffViewer) return;
    
    const differences = Diff.diffLines(sourceText, targetText, { newlineIsToken: true });
    
    // Calculate diff statistics
    let addedLines = 0;
    let removedLines = 0;
    let totalChanges = 0;
    
    differences.forEach(part => {
        const lines = part.value.split('\n').filter(line => line !== '' || part.value.endsWith('\n'));
        if (part.added) {
            addedLines += lines.length;
            totalChanges += lines.length;
        } else if (part.removed) {
            removedLines += lines.length;
            totalChanges += lines.length;
        }
    });
    
    // Update header diff stats
    updateHeaderDiffStats(sourceText, targetText);
    
    // Create diff content HTML
    let diffHtml = '<div class="diff-view-fullscreen">';
    let lineNumber = 1;
    
    differences.forEach(part => {
        const lines = part.value.split('\n');
        lines.forEach((line, index) => {
            if (index === lines.length - 1 && line === '') return; // Skip empty last line
            
            const colorClass = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-neutral';
            const prefix = part.added ? '+' : part.removed ? '-' : ' ';
            
            diffHtml += `<div class="diff-line ${colorClass}">
                <span class="diff-line-number">${lineNumber}</span>
                <span class="diff-line-prefix">${prefix}</span>
                <span class="diff-line-content">${escapeHtml(line)}</span>
            </div>`;
            
            if (!part.removed) lineNumber++;
        });
    });
    
    diffHtml += '</div>';
    
    // Only show diff content (stats are in header now)
    diffViewer.innerHTML = diffHtml;
}

function updateHeaderDiffStats(sourceText: string, targetText: string) {
    const headerDiffStats = document.getElementById('header-diff-stats');
    const additionsCount = document.getElementById('header-additions-count');
    const deletionsCount = document.getElementById('header-deletions-count');
    const totalCount = document.getElementById('header-total-count');
    
    if (!headerDiffStats || !additionsCount || !deletionsCount || !totalCount) return;
    
    const differences = Diff.diffLines(sourceText, targetText, { newlineIsToken: true });
    
    let addedLines = 0;
    let removedLines = 0;
    let totalChanges = 0;
    
    differences.forEach(part => {
        const lines = part.value.split('\n').filter(line => line !== '' || part.value.endsWith('\n'));
        if (part.added) {
            addedLines += lines.length;
            totalChanges += lines.length;
        } else if (part.removed) {
            removedLines += lines.length;
            totalChanges += lines.length;
        }
    });
    
    // Update the header stats
    additionsCount.textContent = `+${addedLines} lines`;
    deletionsCount.textContent = `-${removedLines} lines`;
    totalCount.textContent = `${totalChanges} changes`;
    
    // Show the stats with animation
    headerDiffStats.classList.add('visible');
}

function hideHeaderDiffStats() {
    const headerDiffStats = document.getElementById('header-diff-stats');
    if (headerDiffStats) {
        headerDiffStats.classList.remove('visible');
    }
}

// Missing diff view toggle functions
function toggleDiffViewDropdown() {
    const dropdown = document.getElementById('diff-view-dropdown');
    if (!dropdown) return;
    
    if (dropdown.classList.contains('visible')) {
        hideDiffViewDropdown();
    } else {
        showDiffViewDropdown();
    }
}

function showDiffViewDropdown() {
    const dropdown = document.getElementById('diff-view-dropdown');
    if (dropdown) {
        dropdown.classList.add('visible');
    }
}

function hideDiffViewDropdown() {
    const dropdown = document.getElementById('diff-view-dropdown');
    if (dropdown) {
        dropdown.classList.remove('visible');
    }
}

function showDiffViewToggle() {
    const toggle = document.getElementById('diff-view-toggle');
    if (toggle) {
        toggle.classList.add('visible');
    }
}

function hideDiffViewToggle() {
    const toggle = document.getElementById('diff-view-toggle');
    if (toggle) {
        toggle.classList.remove('visible');
    }
}

function updateDiffViewToggleButton(mode: 'unified' | 'split') {
    const toggleButton = document.getElementById('diff-view-toggle-button');
    const buttonText = toggleButton?.querySelector('.button-text');
    const buttonIcon = toggleButton?.querySelector('.material-symbols-outlined');
    
    if (!toggleButton || !buttonText || !buttonIcon) return;
    
    if (mode === 'split') {
        buttonText.textContent = 'Split View';
        buttonIcon.textContent = 'view_column';
    } else {
        buttonText.textContent = 'Unified View';
        buttonIcon.textContent = 'view_agenda';
    }
    
    // Update dropdown options
    const options = document.querySelectorAll('.diff-view-option');
    options.forEach(option => {
        const optionElement = option as HTMLElement;
        if (optionElement.dataset.view === mode) {
            optionElement.classList.add('active');
        } else {
            optionElement.classList.remove('active');
        }
    });
}


function activateDiffViewMode(mode: 'unified' | 'split') {
    currentDiffViewMode = mode;
    updateDiffViewToggleButton(mode);
    
    // Re-render the current diff with the new view mode
    if (diffSourceData && currentSourceContent && currentTargetContent) {
        const diffAnalysisView = document.getElementById('diff-analysis-view');
        const globalComparePanel = document.getElementById('global-compare-panel');
        const instantFixesPanel = document.getElementById('instant-fixes-panel');
        
        // For instant fixes mode - diff analysis view
        if (instantFixesPanel && instantFixesPanel.classList.contains('active') && 
            diffAnalysisView && diffAnalysisView.classList.contains('active')) {
            if (mode === 'unified') {
                renderInstantFixesDiff(currentSourceContent, currentTargetContent);
            } else {
                renderDiffSideBySide(currentSourceContent, currentTargetContent);
            }
        }
        
        // For global compare mode
        if (globalComparePanel && globalComparePanel.classList.contains('active')) {
            if (mode === 'unified') {
                renderDiff(currentSourceContent, currentTargetContent);
            } else {
                renderDiffSideBySide(currentSourceContent, currentTargetContent);
            }
        }
    }
}


function copyPreviewContent(type: 'source' | 'target') {
    const content = type === 'source' ? currentSourceContent : currentTargetContent;
    if (content) {
        navigator.clipboard.writeText(content).then(() => {
            // Show a brief success indication
            const button = document.getElementById(`copy-${type}-button`);
            if (button) {
                const originalIcon = button.querySelector('.material-symbols-outlined');
                if (originalIcon) {
                    originalIcon.textContent = 'check';
                    setTimeout(() => {
                        originalIcon.textContent = 'content_copy';
                    }, 1500);
                }
            }
        }).catch(err => {
            console.error('Failed to copy content:', err);
            alert('Failed to copy content to clipboard');
        });
    }
}

function downloadPreviewContent(type: 'source' | 'target') {
    const content = type === 'source' ? currentSourceContent : currentTargetContent;
    const title = type === 'source' ? 'source' : 'target';
    
    if (content) {
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

function openPreviewFullscreen(type: 'source' | 'target') {
    const content = type === 'source' ? currentSourceContent : currentTargetContent;
    if (content) {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            // Add escape key listener to close the window
            const fullscreenContent = `
                ${content}
                <script>
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape') {
                            window.close();
                        }
                    });
                    
                    // Add visual indicator that escape closes the window
                    const indicator = document.createElement('div');
                    indicator.style.cssText = \`
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        background: rgba(0,0,0,0.8);
                        color: white;
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-family: system-ui, sans-serif;
                        font-size: 12px;
                        z-index: 10000;
                        opacity: 0.7;
                        pointer-events: none;
                    \`;
                    indicator.textContent = 'Press ESC to close';
                    document.body.appendChild(indicator);
                    
                    // Hide indicator after 3 seconds
                    setTimeout(() => {
                        if (indicator.parentNode) {
                            indicator.style.opacity = '0';
                            setTimeout(() => indicator.remove(), 300);
                        }
                    }, 3000);
                </script>
            `;
            
            newWindow.document.write(fullscreenContent);
            newWindow.document.close();
        }
    }
}

function closeDiffModal() {
    if (diffModalOverlay) {
        diffModalOverlay.classList.remove('is-visible');
        diffModalOverlay.addEventListener('transitionend', () => {
            if (!diffModalOverlay.classList.contains('is-visible')) {
                diffModalOverlay.style.display = 'none';
            }
        }, { once: true });
    }
    
    // Clear diff source data and content
    diffSourceData = null;
    currentSourceContent = '';
    currentTargetContent = '';
    
    // Clear content and reset state
    const diffSourceContent = document.getElementById('diff-source-content');
    const diffTargetContent = document.getElementById('diff-target-content');
    const instantFixesDiffViewer = document.getElementById('instant-fixes-diff-viewer');
    
    if (diffSourceContent) diffSourceContent.innerHTML = '';
    if (diffTargetContent) diffTargetContent.innerHTML = '';
    if (instantFixesDiffViewer) instantFixesDiffViewer.innerHTML = '<div class="empty-state-message"><p>Click "Diff Analysis" to see detailed line-by-line changes</p></div>';
    if (diffViewerPanel) diffViewerPanel.innerHTML = '<div class="diff-no-selection empty-state-message"><p>Select a target (B) from the list to view differences.</p></div>';
    
    // Clear preview frames
    const previewSourceFrame = document.getElementById('preview-source-frame') as HTMLIFrameElement;
    const previewTargetFrame = document.getElementById('preview-target-frame') as HTMLIFrameElement;
    if (previewSourceFrame) previewSourceFrame.src = 'about:blank';
    if (previewTargetFrame) previewTargetFrame.src = 'about:blank';
    
    // Reset button states
    const unifiedButton = document.getElementById('unified-view-button');
    const splitButton = document.getElementById('split-view-button');
    if (unifiedButton) unifiedButton.classList.remove('active');
    if (splitButton) splitButton.classList.add('active');
    currentDiffViewMode = 'split';
    
    // Hide header diff stats
    hideHeaderDiffStats();
}

// ---------- END DIFF MODAL FUNCTIONS ----------

// Red Team reasoning functions
(window as any).toggleRedTeamReasoning = function(agentId: string) {
    const content = document.getElementById(`red-team-reasoning-${agentId}`);
    if (content) {
        if (content.classList.contains('expanded')) {
            // Hide content
            content.classList.remove('expanded');
        } else {
            // Show content
            content.classList.add('expanded');
        }
    }
};

(window as any).showFullRedTeamReasoning = function(agentId: string, fullContent: string) {
    const modal = document.getElementById('red-team-full-modal');
    const modalContent = document.getElementById('red-team-modal-content');
    if (modal && modalContent) {
        modalContent.innerHTML = `<pre>${fullContent}</pre>`;
        modal.classList.add('active');
    }
};

(window as any).closeRedTeamModal = function() {
    const modal = document.getElementById('red-team-full-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

// Deepthink Red Team reasoning functions
(window as any).toggleDeepthinkRedTeamReasoning = function(agentId: string) {
    const content = document.getElementById(`deepthink-red-team-reasoning-${agentId}`);
    if (content) {
        if (content.classList.contains('expanded')) {
            // Hide content
            content.classList.remove('expanded');
        } else {
            // Show content
            content.classList.add('expanded');
        }
    }
};

(window as any).showFullDeepthinkRedTeamReasoning = function(agentId: string, fullContent: string) {
    const modal = document.getElementById('deepthink-red-team-full-modal');
    const modalContent = document.getElementById('deepthink-red-team-modal-content');
    if (modal && modalContent) {
        modalContent.innerHTML = `<pre>${fullContent}</pre>`;
        modal.classList.add('active');
    }
};

(window as any).closeDeepthinkRedTeamModal = function() {
    const modal = document.getElementById('deepthink-red-team-full-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    initializeSliderEventListeners();
    
    // Initialize deepthink module with all required dependencies
    initializeDeepthinkModule({
        ai,
        callGemini,
        cleanOutputByType,
        parseJsonSuggestions: parseJsonSuggestions as any,
        parseJsonSafe,
        updateControlsState,
        escapeHtml: (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        renderMarkdown,
        renderMathContent,
        getSelectedTemperature,
        getSelectedModel,
        getSelectedTopP,
        getSelectedStrategiesCount,
        getSelectedSubStrategiesCount,
        getSelectedHypothesisCount,
        getSelectedRedTeamAggressiveness,
        getRefinementEnabled,
        cleanTextOutput,
        customPromptsDeepthinkState,
        tabsNavContainer: document.getElementById('tabs-nav-container'),
        pipelinesContentContainer: document.getElementById('pipelines-content-container'),
        setActiveDeepthinkPipeline: (pipeline: DeepthinkPipelineState | null) => {
            activeDeepthinkPipeline = pipeline;
        }
    });

    // Default to first mode if none specifically checked (e.g. after import or on fresh load)
    const appModeRadios = document.querySelectorAll('input[name="appMode"]');
    let modeIsAlreadySet = false;
    appModeRadios.forEach(radio => {
        if ((radio as HTMLInputElement).checked) {
            currentMode = (radio as HTMLInputElement).value as ApplicationMode; // Ensure currentMode reflects HTML state
            modeIsAlreadySet = true;
        }
    });

    if (!modeIsAlreadySet && appModeRadios.length > 0) {
        const firstModeRadio = appModeRadios[0] as HTMLInputElement;
        if (firstModeRadio) {
            firstModeRadio.checked = true;
            currentMode = firstModeRadio.value as ApplicationMode;
        }
    }
    updateUIAfterModeChange();

    const preloader = document.getElementById('preloader');
    const sidebar = document.getElementById('controls-sidebar');
    const mainContent = document.getElementById('main-content');

    if (preloader) {
        preloader.classList.add('hidden');
    }

    // Sidebar collapse/expand functionality
    let sidebarIsCollapsed = false;
    
    function ensureExpandButton() {
        const tabsContainer = document.getElementById('tabs-nav-container');
        let expandButton = document.getElementById('sidebar-expand-button');
        
        if (!expandButton && tabsContainer) {
            expandButton = document.createElement('button');
            expandButton.id = 'sidebar-expand-button';
            expandButton.className = 'sidebar-expand-button';
            expandButton.setAttribute('aria-label', 'Expand Sidebar');
            expandButton.setAttribute('title', 'Expand Sidebar');
            expandButton.style.display = sidebarIsCollapsed ? 'flex' : 'none';
            expandButton.innerHTML = '<span class="material-symbols-outlined">dock_to_left</span>';
            
            // Insert as first child of tabs container
            tabsContainer.insertBefore(expandButton, tabsContainer.firstChild);
            
            // Add click listener
            expandButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const controlsSidebar = document.getElementById('controls-sidebar');
                const mainContent = document.getElementById('main-content');
                
                if (controlsSidebar) {
                    // Force layout recalculation before transition
                    controlsSidebar.offsetHeight;
                    
                    // Add transition and expand
                    controlsSidebar.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
                    controlsSidebar.classList.remove('collapsed');
                    expandButton.style.display = 'none';
                    sidebarIsCollapsed = false;
                    
                    // Force repaint to ensure smooth transition
                    requestAnimationFrame(() => {
                        // Trigger layout recalculation for main content
                        if (mainContent) {
                            mainContent.style.transform = 'translateZ(0)';
                            setTimeout(() => {
                                mainContent.style.transform = '';
                            }, 300);
                        }
                    });
                }
            });
        }
        
        return expandButton;
    }

    function initializeSidebarControls() {
        const sidebarCollapseButton = document.getElementById('sidebar-collapse-button');
        const controlsSidebar = document.getElementById('controls-sidebar');
        const mainContent = document.getElementById('main-content');
        
        // Ensure expand button exists
        ensureExpandButton();

        if (sidebarCollapseButton && controlsSidebar) {
            // Remove existing listeners to avoid duplicates
            const newCollapseButton = sidebarCollapseButton.cloneNode(true) as HTMLElement;
            sidebarCollapseButton.replaceWith(newCollapseButton);
            
            newCollapseButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Force layout recalculation before transition
                controlsSidebar.offsetHeight;
                
                // Add transition class and collapse
                controlsSidebar.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
                controlsSidebar.classList.add('collapsed');
                sidebarIsCollapsed = true;
                
                // Force repaint to ensure smooth transition
                requestAnimationFrame(() => {
                    // Ensure expand button exists and is visible
                    const expandButton = ensureExpandButton();
                    if (expandButton) {
                        expandButton.style.display = 'flex';
                    }
                    
                    // Trigger layout recalculation for main content
                    if (mainContent) {
                        mainContent.style.transform = 'translateZ(0)';
                        setTimeout(() => {
                            mainContent.style.transform = '';
                        }, 300);
                    }
                });
            });
            
        }
    }

    // Global function to reinitialize sidebar controls (called from other functions)
    (window as any).reinitializeSidebarControls = initializeSidebarControls;

    // Initialize sidebar controls
    initializeSidebarControls();
    
    // Re-initialize sidebar controls whenever tabs are updated
    const observer = new MutationObserver(() => {
        if (sidebarIsCollapsed) {
            ensureExpandButton();
        }
    });
    
    const tabsContainer = document.getElementById('tabs-nav-container');
    if (tabsContainer) {
        observer.observe(tabsContainer, { childList: true, subtree: true });
    }
});

// Missing Deepthink functions moved to Deepthink.tsx module

// runDeepthinkRedTeamEvaluation moved to Deepthink.tsx module

// openDeepthinkSolutionModal moved to Deepthink.tsx module

// closeSolutionModal moved to Deepthink.tsx module
