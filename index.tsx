/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import JSZip from 'jszip';
import { defaultCustomPromptsWebsite, createDefaultCustomPromptsReact, QUALITY_MODE_SYSTEM_PROMPT } from './prompts';
import type { CustomizablePromptsWebsite, CustomizablePromptsReact } from './prompts';
import { initializeDeepthinkModule, renderActiveDeepthinkPipeline, activateDeepthinkStrategyTab, setActiveDeepthinkPipelineForImport, startDeepthinkAnalysisProcess } from './Deepthink/Deepthink.tsx';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { renderMathContent } from './Components/RenderMathMarkdown';
import { CustomizablePromptsDeepthink, createDefaultCustomPromptsDeepthink } from './Deepthink/DeepthinkPrompts';
import { CustomizablePromptsAdaptiveDeepthink, createDefaultCustomPromptsAdaptiveDeepthink } from './AdaptiveDeepthink/AdaptiveDeepthinkPrompt';
import { CustomizablePromptsContextual, createDefaultCustomPromptsContextual } from './Contextual/ContextualPrompts';
import {
    initializeGenerativeUIMode,
    renderGenerativeUIMode,
    startGenerativeUIProcess,
    stopGenerativeUIProcess,
    isGenerativeUIModeActive,
    cleanupGenerativeUIMode,
    getActiveGenerativeUIState,
    setActiveGenerativeUIStateForImport
} from './GenerativeUI/GenerativeUI';
import {
    renderContextualMode,
    startContextualProcess,
    stopContextualProcess,
    getContextualState,
    setContextualContentUpdateCallback,
    setContextualStateForImport
} from './Contextual/Contextual';
import {
    renderAdaptiveDeepthinkMode,
    startAdaptiveDeepthinkProcess,
    stopAdaptiveDeepthinkProcess,
    cleanupAdaptiveDeepthinkMode,
    getAdaptiveDeepthinkState,
    setAdaptiveDeepthinkStateForImport
} from './AdaptiveDeepthink';
import { openDiffModal } from './Components/DiffModal';
import {
    initializeAgenticMode,
    startAgenticProcess,
    startAgenticProcessInContainer,
    renderAgenticMode,
    setAgenticContentUpdateCallback,
    rehydrateAgenticUIInContainer,
    cleanupAgenticMode,
    isAgenticModeActive,
    setAgenticPromptsManager,
    getActiveAgenticState,
    setActiveAgenticStateForImport,
} from './Agentic/Agentic';
import { MonacoFileEditor } from './Components/MonacoFileEditor';
import { AGENTIC_SYSTEM_PROMPT } from './Agentic/AgenticModePrompt';
import {
    routingManager,
    initializeRouting,
    getSelectedModel,
    getSelectedTemperature,
    getSelectedTopP,
    getSelectedRefinementStages,
    getSelectedStrategiesCount,
    getSelectedSubStrategiesCount,
    getSelectedHypothesisCount,
    getSelectedRedTeamAggressiveness,
    getRefinementEnabled,
    getSkipSubStrategies,
    getDissectedObservationsEnabled,
    getIterativeCorrectionsEnabled,
    getProvideAllSolutionsToCorrectors,
    hasValidApiKey,
    callAI
} from './Routing';
import {
    parseJsonSafe,
    cleanJsonOutput,
    cleanHtmlOutput,
    cleanTextOutput,
    cleanOutputByType,
    isHtmlContent,
    parseJsonSuggestions  // Kept only for Deepthink strategies - NOT for features
} from './Parsing';


// Constants for retry logic
const MAX_RETRIES = 3; // Max number of retries for API errors
const INITIAL_DELAY_MS = 20000; // Initial delay in milliseconds
const BACKOFF_FACTOR = 4; // Factor by which delay increases

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

type ApplicationMode = 'website' | 'deepthink' | 'react' | 'agentic' | 'generativeui' | 'contextual' | 'adaptive-deepthink';

// Global variables
let currentMode: 'website' | 'react' | 'deepthink' | 'agentic' | 'generativeui' | 'contextual' | 'adaptive-deepthink' = 'website';
let currentEvolutionMode: 'off' | 'novelty' | 'quality' = 'novelty'; // Default to Novelty mode

interface IterationData {
    iterationNumber: number;
    title: string;
    // Website Mode Specific
    requestPromptContent_InitialGenerate?: string;
    requestPromptContent_FeatureImplement?: string;
    requestPromptContent_BugFix?: string;
    requestPromptFeatures_Suggest?: string;
    generatedContent?: string;
    contentBeforeBugFix?: string; // Content state before bug-fix patches are applied
    suggestedFeaturesContent?: string; // Markdown content from feature suggestion agent

    // Removed diff-format patches - now using full content updates

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


interface DeepthinkSolutionCritiqueData {
    id: string;
    subStrategyId: string;
    mainStrategyId: string;
    requestPrompt?: string;
    critiqueResponse?: string;
    status: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    error?: string;
    retryAttempt?: number;
    isDetailsOpen?: boolean;
}

interface DeepthinkSubStrategyData {
    id: string; // e.g., "main1-sub1"
    subStrategyText: string;
    requestPromptSolutionAttempt?: string;
    solutionAttempt?: string;

    // Solution critique fields
    requestPromptSolutionCritique?: string;
    solutionCritique?: string;
    solutionCritiqueStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    solutionCritiqueError?: string;
    solutionCritiqueRetryAttempt?: number;

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
    status: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
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
    challenge: string;
    challengeText: string;
    challengeImageBase64?: string | null; // Base64 encoded image
    challengeImageMimeType?: string;
    requestPromptInitialStrategyGen?: string;
    initialStrategies: DeepthinkMainStrategyData[];
    status: 'idle' | 'processing' | 'retrying' | 'completed' | 'error' | 'stopping' | 'stopped' | 'cancelled'; // Overall status
    error?: string; // Overall error for the whole process
    isStopRequested?: boolean;
    activeTabId: string; // e.g., "strategic-solver", "hypothesis-explorer", "final-result"
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

    // Solution critique and synthesis fields
    solutionCritiques: DeepthinkSolutionCritiqueData[];
    solutionCritiquesStatus?: 'pending' | 'processing' | 'completed' | 'error' | 'cancelled';
    solutionCritiquesError?: string;
    dissectedObservationsSynthesis?: string;
    dissectedSynthesisRequestPrompt?: string;
    dissectedSynthesisStatus?: 'pending' | 'processing' | 'retrying' | 'completed' | 'error' | 'cancelled';
    dissectedSynthesisError?: string;
    dissectedSynthesisRetryAttempt?: number;

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
    currentEvolutionMode?: 'off' | 'novelty' | 'quality'; // Evolution convergence mode
    initialIdea: string;
    selectedModel: string;
    selectedOriginalTemperatureIndices: number[]; // For website
    pipelinesState: PipelineState[]; // For website
    activeDeepthinkPipeline?: DeepthinkPipelineState | null; // For deepthink
    activeReactPipeline: ReactPipelineState | null; // Added for React mode
    embeddedAgenticState?: any | null; // For agentic state embedded in React mode
    activeAgenticState?: any | null; // For agentic mode
    activeGenerativeUIState?: any | null; // For generative UI mode
    activeContextualState?: any | null; // For contextual mode
    activeAdaptiveDeepthinkState?: any | null; // For adaptive deepthink mode
    activePipelineId: number | null; // For website
    activeDeepthinkProblemTabId?: string; // For deepthink UI
    globalStatusText: string;
    globalStatusClass: string;
    customPromptsWebsite: CustomizablePromptsWebsite;
    customPromptsDeepthink?: CustomizablePromptsDeepthink;
    customPromptsReact: CustomizablePromptsReact; // Added for React mode
    customPromptsAgentic: { systemPrompt: string }; // Added for Agentic mode
    customPromptsAdaptiveDeepthink?: CustomizablePromptsAdaptiveDeepthink; // Added for Adaptive Deepthink mode
    customPromptsContextual?: CustomizablePromptsContextual; // Added for Contextual mode
    isCustomPromptsOpen?: boolean;
    // Model parameters for Deepthink modes
    modelParameters?: {
        temperature: number;
        topP: number;
        refinementStages: number;
        strategiesCount: number;
        subStrategiesCount: number;
        hypothesisCount: number;
        redTeamAggressiveness: string;
        refinementEnabled: boolean;
        skipSubStrategies: boolean;
        dissectedObservationsEnabled: boolean;
        iterativeCorrectionsEnabled: boolean;
    };
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
    status: 'idle' | 'orchestrating' | 'processing_workers' | 'completed' | 'error' | 'stopping' | 'stopped' | 'cancelled' | 'orchestrating_retrying' | 'failed' | 'agentic_orchestrating';
    error?: string;
    isStopRequested?: boolean;
    activeTabId?: string; // To track which of the 5 worker agent tabs is active in UI, e.g., "worker-0", "worker-1"
    orchestratorRetryAttempt?: number;
    agenticRefineStarted?: boolean; // Embedded Agentic refinement has started inside React mode
    initialAgenticContent?: string; // Initial content for the embedded agentic agent
    workerPromptsData?: any[]; // Worker prompts data for the embedded agent
    workersExecuted?: boolean; // Whether worker agents have been executed
    previewUrl?: string; // Preview URL for the built application
    prevPreviewUrl?: string; // Previous preview URL for cleanup
}



// Website refinement steps now depend on the Refinement Stages slider (Routing)



export const NUM_INITIAL_STRATEGIES_DEEPTHINK = 3;
export const NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK = 3;

// Functions now handled by routing system - keeping for backward compatibility
// These are now imported from ./Routing


let pipelinesState: PipelineState[] = [];
let activeDeepthinkPipeline: DeepthinkPipelineState | null = null; // Added for Deepthink mode
let activeReactPipeline: ReactPipelineState | null = null; // Added for React mode
let activePipelineId: number | null = null;
let isGenerating = false;
// currentMode already declared above with currentEvolutionMode
let currentProblemImageBase64: string | null = null;
let currentProblemImageMimeType: string | null = null;
// This variable is no longer used for the modal state but can be kept for config export/import
let isCustomPromptsOpen = false;

// Global state variables
let customPromptsWebsiteState = defaultCustomPromptsWebsite;
let customPromptsDeepthinkState = createDefaultCustomPromptsDeepthink();
let customPromptsReactState = createDefaultCustomPromptsReact();
let customPromptsAgenticState = { systemPrompt: AGENTIC_SYSTEM_PROMPT }; // Added for Agentic mode
let customPromptsAdaptiveDeepthinkState = createDefaultCustomPromptsAdaptiveDeepthink();
let customPromptsContextualState = createDefaultCustomPromptsContextual();

// Core UI elements (not routing-related)
const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;
const initialIdeaLabel = document.getElementById('initial-idea-label') as HTMLLabelElement;
const modelSelectionContainer = document.getElementById('model-selection-container') as HTMLElement;
const modelParametersContainer = document.getElementById('model-parameters-container') as HTMLElement;
// Slider event listeners now handled by routing system
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const tabsNavContainer = document.getElementById('tabs-nav-container') as HTMLElement;
const pipelinesContentContainer = document.getElementById('pipelines-content-container') as HTMLElement;
const appModeSelector = document.getElementById('app-mode-selector') as HTMLElement;

// Helper function to clear tabs (button is now outside tabs container, so just clear)
function clearTabsContainer() {
    tabsNavContainer.innerHTML = '';
}


// Custom Prompts Modal Elements - Now managed by routing system

const exportConfigButton = document.getElementById('export-config-button') as HTMLButtonElement;
const importConfigInput = document.getElementById('import-config-input') as HTMLInputElement;
const importConfigLabel = document.getElementById('import-config-label') as HTMLLabelElement;



function initializeCustomPromptTextareas() {
    // Initialize prompts manager in routing system with references to global variables
    routingManager.initializePromptsManager(
        { current: customPromptsWebsiteState },
        { current: customPromptsDeepthinkState },
        { current: customPromptsReactState },
        { current: customPromptsAgenticState },
        { current: customPromptsAdaptiveDeepthinkState },
        { current: customPromptsContextualState }
    );

    // Set up Agentic mode with prompts manager
    const agenticPromptsManager = routingManager.getAgenticPromptsManager();
    if (agenticPromptsManager) {
        setAgenticPromptsManager(agenticPromptsManager);
    }
}

function updateCustomPromptTextareasFromState() {
    const promptsManager = routingManager.getPromptsManager();
    if (promptsManager) {
        promptsManager.updateTextareasFromState();
    }
}

function updateUIAfterModeChange() {
    // Update prompts modal mode through routing system
    routingManager.setCurrentMode(currentMode);

    // Visibility of prompt containers is now handled by routing system
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

    const generateButtonText = generateButton?.querySelector('.button-text');
    const apiCallIndicator = document.querySelector('.api-call-indicator') as HTMLElement;

    if (currentMode === 'website') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Iteratively Refine:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Python Code For Array Sorting Using Cross Products", "An e-commerce site for handmade crafts"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate & Refine';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(true);
    } else if (currentMode === 'deepthink') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Core Challenge:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Design a sustainable urban transportation system", "Analyze the impact of remote work on company culture"...';
        if (generateButtonText) generateButtonText.textContent = 'Deepthink';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'flex';
        setDeepthinkControlsVisible(true);
        setRefineControlsVisible(false);
    } else if (currentMode === 'react') { // Added for React mode
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'React App Request:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "A simple to-do list app with local storage persistence", "A weather dashboard using OpenWeatherMap API"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate React App';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (currentMode === 'agentic') { // Added for Agentic mode
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Content to Refine:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'Enter text, code, data report, or any content you want the agent to iteratively refine...';
        if (generateButtonText) generateButtonText.textContent = 'Generate & Refine';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (currentMode === 'generativeui') { // Added for GenerativeUI mode
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'UI Query:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Create a dashboard to track my project tasks with statuses for to-do, in-progress, and done"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate Interface';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (currentMode === 'contextual') { // Added for Contextual mode
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Initial User Request:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Write a comprehensive guide on machine learning basics", "Create a detailed business plan for a coffee shop"...';
        if (generateButtonText) generateButtonText.textContent = 'Start Contextual Refinement';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (currentMode === 'adaptive-deepthink') { // Added for Adaptive Deepthink mode
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Core Challenge:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Solve this mathematical problem", "Design a scalable database architecture", "Analyze this complex scenario"...';
        if (generateButtonText) generateButtonText.textContent = 'Adaptive Deepthink';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false); // Adaptive Deepthink is agentic - no manual config
        setRefineControlsVisible(false);
    }

    if (!isGenerating) {
        pipelinesState = [];
        activeReactPipeline = null;
        if (currentMode === 'agentic') {
            cleanupAgenticMode();
        } else if (currentMode === 'generativeui') {
            cleanupGenerativeUIMode();
        } else if (currentMode === 'contextual') {
            stopContextualProcess();
        } else if (currentMode === 'adaptive-deepthink') {
            cleanupAdaptiveDeepthinkMode();
        }
        renderPipelines();
        if (currentMode === 'react') {
            renderReactModePipeline();
        }
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
// Variants removed: selectors no longer exist

// Show/Hide Deepthink-only controls in the sidebar
function setDeepthinkControlsVisible(visible: boolean) {
    const display = visible ? '' : 'none';
    const strategiesGroup = document.getElementById('strategies-slider')?.closest('.input-group-tight') as HTMLElement | null;
    const strategyExecutionContainer = document.querySelector('.strategy-execution-container') as HTMLElement | null;
    const infoPacketContainer = document.getElementById('information-packet-window')?.closest('.information-packet-container') as HTMLElement | null;
    const execAgents = document.getElementById('execution-agents-visualization') as HTMLElement | null;
    const hypothesisGroup = document.getElementById('hypothesis-slider-container') as HTMLElement | null;
    const redTeam = document.querySelector('.red-team-options-container') as HTMLElement | null;
    const refinementOptions = document.querySelector('.refinement-options-container') as HTMLElement | null;

    if (strategiesGroup) strategiesGroup.style.display = display;
    if (strategyExecutionContainer) strategyExecutionContainer.style.display = display;
    if (infoPacketContainer) infoPacketContainer.style.display = display;
    if (execAgents) execAgents.style.display = display;
    if (hypothesisGroup) hypothesisGroup.style.display = display;
    if (redTeam) redTeam.style.display = display;
    if (refinementOptions) refinementOptions.style.display = display;
}

// Show/Hide Refine-only controls in the sidebar
function setRefineControlsVisible(visible: boolean) {
    const display = visible ? '' : 'none';
    const refineStagesGroup = document.getElementById('refinement-stages-slider')?.closest('.input-group-tight') as HTMLElement | null;
    const evolutionConvergenceContainer = document.querySelector('.evolution-convergence-container') as HTMLElement | null;

    if (refineStagesGroup) refineStagesGroup.style.display = display;
    if (evolutionConvergenceContainer) evolutionConvergenceContainer.style.display = display;
}

// Initialize Evolution Convergence buttons
function initializeEvolutionConvergenceButtons() {
    const evolutionButtons = document.querySelectorAll('.evolution-convergence-button');
    
    // Set initial active state based on currentEvolutionMode
    evolutionButtons.forEach(button => {
        const buttonValue = (button as HTMLElement).dataset.value as 'off' | 'novelty' | 'quality';
        if (buttonValue === currentEvolutionMode) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
    
    // Update initial description
    updateEvolutionModeDescription(currentEvolutionMode);
    
    // Add click handlers
    evolutionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const value = (button as HTMLElement).dataset.value as 'off' | 'novelty' | 'quality';

            // Update active state
            evolutionButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');

            // Update current mode
            currentEvolutionMode = value;

            // Update description text
            updateEvolutionModeDescription(value);
        });
    });
}

function updateEvolutionModeDescription(mode: 'off' | 'novelty' | 'quality') {
    const descriptionElement = document.getElementById('evolution-convergence-description');
    if (!descriptionElement) return;

    let descriptionText = '';
    switch (mode) {
        case 'off':
            descriptionText = `
                <span class="evolution-mode-text">Feature suggestions disabled. Flow: Initial Generation → Initial Bug Fix & Polish → Refinement Bug Fix & Polish (Loop N times) → Final Polish</span>
            `;
            break;
        case 'novelty':
            descriptionText = `
                <span class="evolution-mode-text">Default mode with all agents active for balanced innovation and quality.</span>
            `;
            break;
        case 'quality':
            descriptionText = `
                <span class="evolution-mode-text">All agents focus on high quality improvements. No new features, only refinement of existing content.</span>
            `;
            break;
    }

    descriptionElement.innerHTML = descriptionText;
}

export function updateControlsState() {
    const anyPipelineRunningOrStopping = pipelinesState.some(p => p.status === 'running' || p.status === 'stopping');
    const deepthinkPipelineRunningOrStopping = activeDeepthinkPipeline?.status === 'processing' || activeDeepthinkPipeline?.status === 'stopping';
    const reactPipelineRunningOrStopping = activeReactPipeline?.status === 'orchestrating' || activeReactPipeline?.status === 'agentic_orchestrating' || activeReactPipeline?.status === 'processing_workers' || activeReactPipeline?.status === 'stopping'; // Added for React
    const agenticRunning = isAgenticModeActive();
    const generativeUIRunning = isGenerativeUIModeActive();
    const contextualRunning = getContextualState()?.isRunning || false;
    const adaptiveDeepthinkRunning = getAdaptiveDeepthinkState()?.isProcessing || false;
    isGenerating = anyPipelineRunningOrStopping || deepthinkPipelineRunningOrStopping || reactPipelineRunningOrStopping || agenticRunning || generativeUIRunning || contextualRunning || adaptiveDeepthinkRunning;

    const isApiKeyReady = hasValidApiKey();

    if (generateButton) {
        let disabled = isGenerating || !isApiKeyReady;
        if (!disabled) {
            if (currentMode === 'deepthink') {
                // Enabled if not generating
            } else if (currentMode === 'react') {
                // Enabled if not generating
            } else if (currentMode === 'agentic') {
                // Enabled if not generating
            } else if (currentMode === 'generativeui') {
                // Enabled if not generating
            } else if (currentMode === 'contextual') {
                // Enabled if not generating
            } else if (currentMode === 'adaptive-deepthink') {
                // Enabled if not generating
            } else if (currentMode === 'website') { // website only
                // No additional gating
            }
        }
        generateButton.disabled = disabled;
    }

    if (exportConfigButton) exportConfigButton.disabled = isGenerating;
    if (importConfigInput) importConfigInput.disabled = isGenerating;
    if (importConfigLabel) importConfigLabel.classList.toggle('disabled', isGenerating);
    if (initialIdeaInput) initialIdeaInput.disabled = isGenerating;

    // Model controls are now managed by routing system
    // Disable red team buttons during generation
    const redTeamButtons = document.querySelectorAll('.red-team-button');
    redTeamButtons.forEach(button => {
        (button as HTMLButtonElement).disabled = isGenerating;
    });

    // Disable sliders during generation
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        (slider as HTMLInputElement).disabled = isGenerating;
    });

    // Disable toggles during generation
    const toggles = document.querySelectorAll('input[type="checkbox"]:not([id*="pipeline"])');
    toggles.forEach(toggle => {
        (toggle as HTMLInputElement).disabled = isGenerating;
    });
    // Variants UI removed

    // Allow user to select any model for deepthink mode
    // Removed forced model selection override



    // Update prompts modal state through routing system
    routingManager.updatePromptsModalState(isGenerating);





    // Block sidebar content during generation
    const sidebarContent = document.querySelector('#controls-sidebar .sidebar-content');
    if (sidebarContent) {
        (sidebarContent as HTMLElement).style.pointerEvents = isGenerating ? 'none' : 'auto';
        (sidebarContent as HTMLElement).style.opacity = isGenerating ? '0.6' : '1';
    }

    // Disable providers and prompts buttons
    const providersButton = document.getElementById('add-providers-trigger');
    if (providersButton) {
        (providersButton as HTMLButtonElement).disabled = isGenerating;
    }
    const promptsButton = document.getElementById('prompts-trigger');
    if (promptsButton) {
        (promptsButton as HTMLButtonElement).disabled = isGenerating;
    }
}


function initPipelines() {
    const selectedModel = getSelectedModel();
    const temp = getSelectedTemperature();
    const numRefinementIterations = getSelectedRefinementStages();
    const totalSteps = 1 + numRefinementIterations + 1;

    const iterations: IterationData[] = [];
    for (let i = 0; i < totalSteps; i++) {
        let title = '';
        if (i === 0) title = 'Initial Gen, Fix & Suggest';
        else if (i <= numRefinementIterations) title = `Refine ${i}: Stabilize, Implement, Fix & Suggest`;
        else title = 'Final Polish & Fix';
        iterations.push({
            iterationNumber: i,
            title: title,
            status: 'pending',
            isDetailsOpen: true,
        });
    }

    pipelinesState = [{
        id: 0,
        originalTemperatureIndex: 0,
        temperature: temp,
        modelName: selectedModel,
        iterations: iterations,
        status: 'idle',
        isStopRequested: false,
    }];

    renderPipelines();
    if (pipelinesState.length > 0) {
        activateTab(pipelinesState[0].id);
    } else {
        clearTabsContainer();
        tabsNavContainer.innerHTML += '<p class="no-pipelines-message">Nothing to show yet.</p>';
        pipelinesContentContainer.innerHTML = '';
    }
    updateControlsState();
}

function activateTab(idToActivate: string | number) {
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
        
        // Rehydrate the agentic UI if switching to agentic-refinements tab
        if (idToActivate === 'agentic-refinements' && contentPane) {
            import('./React/ReactAgenticIntegration').then(({ rehydrateReactAgenticUI }) => {
                rehydrateReactAgenticUI(contentPane);
            }).catch(err => {
                console.error('Failed to rehydrate React agentic UI:', err);
            });
        }

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
    (window as any).pipelinesState = pipelinesState;
    
    // Get main header element
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;
    
    if (currentMode === 'agentic') {
        // Show header and tabs for agentic mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        if (tabsNavContainer) tabsNavContainer.style.display = '';
        renderAgenticMode();
        return;
    } else if (currentMode === 'generativeui') {
        // Show header and tabs for generativeui mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        if (tabsNavContainer) tabsNavContainer.style.display = '';
        renderGenerativeUIMode();
        return;
    } else if (currentMode === 'contextual') {
        // Contextual mode doesn't use header/tabs - they're hidden in renderContextualMode
        renderContextualMode();
        return;
    } else if (currentMode === 'adaptive-deepthink') {
        // Adaptive Deepthink mode doesn't use header/tabs - they're hidden in renderAdaptiveDeepthinkMode
        renderAdaptiveDeepthinkMode();
        return;
    } else if (currentMode === 'deepthink') {
        // Show header and tabs for deepthink mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        if (tabsNavContainer) tabsNavContainer.style.display = '';
        // Clear containers first
        clearTabsContainer();
        pipelinesContentContainer.innerHTML = '';
        // Render deepthink UI if there's an active pipeline, otherwise show initial state
        if (activeDeepthinkPipeline) {
            renderActiveDeepthinkPipeline();
        }
        return;
    } else if (currentMode === 'react') {
        // Show header for react mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        clearTabsContainer();
        pipelinesContentContainer.innerHTML = '';
        return;
    }

    // Show header and tabs container for other modes (website, etc.)
    if (mainHeaderContent) mainHeaderContent.style.display = '';
    if (tabsNavContainer) tabsNavContainer.style.display = '';
    clearTabsContainer();
    pipelinesContentContainer.innerHTML = '';


    // Check if there are any pipelines
    pipelinesState.forEach((pipeline, index) => {
        const tabButton = document.createElement('button');
        tabButton.className = 'tab-button';
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', (pipeline.id === activePipelineId).toString());
        tabButton.textContent = `Pipeline ${index + 1}`;
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


    });

    // Add View Evolution button at the absolute right
    // Always show button if there are pipelines (even during processing)
    if (pipelinesState.length > 0) {
        const resolvePipelineForEvolution = () => {
            const activePipeline = activePipelineId
                ? pipelinesState.find((p) => p.id === activePipelineId)
                : null;
            if (activePipeline) return activePipeline;

            const firstWithIterations = pipelinesState.find((p) => p.iterations && p.iterations.length > 0);
            return firstWithIterations ?? pipelinesState[0];
        };

        const viewEvolutionBtn = document.createElement('button');
        viewEvolutionBtn.id = 'main-view-evolution-button';
        viewEvolutionBtn.className = 'main-view-evolution-button';

        const initialPipeline = resolvePipelineForEvolution();
        const hasIterations = initialPipeline?.iterations && initialPipeline.iterations.length > 0;
        const isProcessing = initialPipeline?.status === 'running';

        if (!hasIterations && !isProcessing) {
            viewEvolutionBtn.setAttribute('title', 'No iterations generated yet. A placeholder view will open.');
        } else if (isProcessing && !hasIterations) {
            viewEvolutionBtn.setAttribute('title', 'Experiment in progress – latest evolution will appear as iterations generate.');
        } else {
            viewEvolutionBtn.setAttribute('title', 'View content evolution timeline');
        }

        viewEvolutionBtn.innerHTML = `
            <span class="material-symbols-outlined">movie</span>
            <span class="button-text">View Evolution</span>
        `;

        viewEvolutionBtn.addEventListener('click', async () => {
            const { openEvolutionViewer } = await import('./Components/DiffModal');
            const targetPipeline = resolvePipelineForEvolution();

            if (!targetPipeline) {
                // Removed console.warn
                return;
            }

            openEvolutionViewer(targetPipeline.id);
        });

        tabsNavContainer.appendChild(viewEvolutionBtn);
    }
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
        if (iter.requestPromptContent_InitialGenerate) promptsContent += `<h6 class="prompt-title">Initial Generation Prompt:</h6>${renderMathContent(iter.requestPromptContent_InitialGenerate)}`;
        if (iter.requestPromptContent_FeatureImplement) promptsContent += `<h6 class="prompt-title">Feature Implementation & Stabilization Prompt:</h6>${renderMathContent(iter.requestPromptContent_FeatureImplement)}`;
        if (iter.requestPromptContent_BugFix) promptsContent += `<h6 class="prompt-title">HTML Bug Fix/Polish & Completion Prompt:</h6>${renderMathContent(iter.requestPromptContent_BugFix)}`;
        if (iter.requestPromptFeatures_Suggest) promptsContent += `<h6 class="prompt-title">Feature Suggestion Prompt:</h6>${renderMathContent(iter.requestPromptFeatures_Suggest)}`;
    }
    // For refine mode (website mode), don't show the "Used Prompts" toggle
    const promptsHtml = '';

    let generatedOutputHtml = '';


    if (currentMode === 'website') {
        if (iter.generatedContent || ['completed', 'error', 'retrying', 'processing', 'pending', 'cancelled'].includes(iter.status)) {
            const hasContent = !!iter.generatedContent && !isEmptyOrPlaceholderHtml(iter.generatedContent);
            let htmlContent;
            if (hasContent) {
                htmlContent = renderMathContent(iter.generatedContent!);
            } else {
                htmlContent = `<div class="empty-state-message">${getEmptyStateMessage(iter.status, 'Content')}</div>`;
            }

            generatedOutputHtml = `
                <div class="model-detail-section">
                    <div class="model-section-header">
                        <span class="model-section-title">Generated Content</span>
                        <div class="code-actions">
                             <button class="compare-output-button button" data-pipeline-id="${pipelineId}" data-iteration-number="${iter.iterationNumber}" data-content-type="html" type="button" ${!hasContent ? 'disabled' : ''}><span class="material-symbols-outlined">compare_arrows</span><span class="button-text">Compare</span></button>
                        </div>
                    </div>
                    <div class="scrollable-content-area custom-scrollbar">${htmlContent}</div>
                </div>`;
        }
    }

    let suggestionsHtml = '';
    const suggestionsToDisplay = iter.suggestedFeaturesContent;
    if (currentMode === 'website' && suggestionsToDisplay && suggestionsToDisplay.trim() !== '') {
        const title = "Feature Suggestions";
        suggestionsHtml = `<div class="model-detail-section">
            <h5 class="model-section-title">${title}</h5>
            <div class="feature-suggestions-container">
                ${renderMathContent(suggestionsToDisplay)}
            </div>
        </div>`;
    }

    let previewHtml = '';
    if (currentMode === 'website') {
        const isEmptyGenContent = isEmptyOrPlaceholderHtml(iter.generatedContent);
        const fullscreenButtonId = `fullscreen-btn-${pipelineId}-${iter.iterationNumber}`;
        const hasContentForPreview = iter.generatedContent && !isEmptyGenContent && isHtmlContent(iter.generatedContent);
        let previewContent;
        if (hasContentForPreview) {
            const iframeSandboxOptions = "allow-scripts allow-forms allow-popups allow-modals";
            const previewFrameId = `preview-iframe-${pipelineId}-${iter.iterationNumber}`;
            previewContent = `<iframe id="${previewFrameId}" sandbox="${iframeSandboxOptions}" title="Content Preview for Iteration ${iter.iterationNumber} of Pipeline ${pipelineId + 1}" style="width: 100%; height: 100%; border: none;"></iframe>`;

            // Use blob URL for better isolation than srcdoc
            setTimeout(() => {
                const iframe = document.getElementById(previewFrameId) as HTMLIFrameElement;
                if (iframe && iter.generatedContent) {
                    // Create a blob URL for complete isolation
                    const blob = new Blob([iter.generatedContent], { type: 'text/html' });
                    const blobUrl = URL.createObjectURL(blob);

                    // Set the iframe src to the blob URL
                    iframe.src = blobUrl;

                    // Clean up blob URL when iframe is removed or page unloads
                    iframe.addEventListener('load', () => {
                        // Revoke after a delay to ensure content is loaded
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                    });
                }
                // Attach event listeners after iframe is set up
                attachIterationEventListeners(pipelineId, iter.iterationNumber);
            }, 0);
        } else {
            const noPreviewMessage = getEmptyStateMessage(iter.status, 'Preview');
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
            <div class="preview-container diff-preview-container">
                ${previewContent}
            </div>
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



// Helper function to attach event listeners to iteration elements
function attachIterationEventListeners(pipelineId: number, iterationNumber: number) {
    // Use setTimeout to ensure DOM elements are ready
    setTimeout(() => {
        // Attach fullscreen button listener
        const fullscreenBtn = document.getElementById(`fullscreen-btn-${pipelineId}-${iterationNumber}`);
        if (fullscreenBtn && !fullscreenBtn.hasAttribute('data-listener-attached')) {
            fullscreenBtn.setAttribute('data-listener-attached', 'true');
            fullscreenBtn.onclick = async () => {
                // Reuse the same fullscreen preview helper as DiffModal
                const { openLivePreviewFullscreen } = await import('./Components/ActionButton');
                const pipeline = pipelinesState.find(p => p.id === pipelineId);
                const iter = pipeline?.iterations.find(it => it.iterationNumber === iterationNumber);
                const html = iter?.generatedContent;
                if (html) {
                    openLivePreviewFullscreen(html);
                }
            };
        }

        // Attach compare button listener
        const compareBtn = document.querySelector(`[data-pipeline-id="${pipelineId}"][data-iteration-number="${iterationNumber}"]`) as HTMLButtonElement;
        if (compareBtn && !compareBtn.hasAttribute('data-listener-attached')) {
            compareBtn.setAttribute('data-listener-attached', 'true');
            compareBtn.onclick = () => {
                openDiffModal(pipelineId, iterationNumber, 'html');
            };
        }
    }, 0);
}


// Global functions for code block actions
(window as any).toggleCodeBlock = function (codeId: string) {
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

// Copy code block with green feedback
(window as any).copyCodeBlock = async function (codeId: string) {
    try {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;

        const codeText = codeElement.textContent || '';
        await navigator.clipboard.writeText(codeText);

        const copyBtn = document.querySelector(`.copy-code-btn[data-code-id="${codeId}"]`) as HTMLElement | null;
        if (copyBtn) {
            const isLightMode = document.body.classList.contains('light-mode');
            const accentColor = isLightMode ? '#2E7D32' : '#00C853';
            const accentBg = isLightMode ? 'rgba(46, 125, 50, 0.2)' : 'rgba(0, 200, 83, 0.25)';
            const accentBorder = isLightMode ? 'rgba(46, 125, 50, 0.35)' : 'rgba(0, 200, 83, 0.4)';

            // Store original styles
            const originalStyle = copyBtn.getAttribute('style') || '';

            // Force inline styles with setAttribute (highest priority)
            copyBtn.setAttribute('style', `
                color: ${accentColor} !important;
                background: ${accentBg} !important;
                background-color: ${accentBg} !important;
                border: 2px solid ${accentBorder} !important;
                box-shadow: 0 0 12px ${accentBorder} !important;
                opacity: 1 !important;
                transform: scale(1) !important;
                filter: none !important;
            `);

            copyBtn.classList.add('copied');

            // Force SVG color change directly
            const svg = copyBtn.querySelector('svg');
            if (svg) {
                svg.querySelectorAll('rect, path, polyline, line, circle').forEach((shape) => {
                    shape.setAttribute('stroke', accentColor);
                    shape.setAttribute('fill', 'none');
                });
            }

            // Remove after delay
            setTimeout(() => {
                copyBtn.setAttribute('style', originalStyle);

                // Reset SVG to currentColor
                if (svg) {
                    svg.querySelectorAll('rect, path, polyline, line, circle').forEach((shape) => {
                        shape.setAttribute('stroke', 'currentColor');
                    });
                }
            }, 1200);
        }
    } catch (err) {
        // Removed console.error
    }
};


async function copyToClipboard(text: string, buttonElement: HTMLButtonElement) {
    if (buttonElement.disabled) return;

    const buttonTextElement = buttonElement.querySelector<HTMLSpanElement>('.button-text');
    if (!buttonTextElement) {
        // Removed console.error
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
        // Removed console.error
        buttonTextElement.textContent = 'Copy Failed';
        buttonElement.classList.add('copy-failed');
        setTimeout(() => {
            buttonTextElement.textContent = originalText;
            buttonElement.classList.remove('copy-failed');
            buttonElement.disabled = false;
        }, 2000);
    }
}



function isEmptyOrPlaceholderHtml(html?: string): boolean {
    return !html || html.trim() === '' || html.includes('<!-- No HTML generated yet') || html.includes('<!-- No valid HTML was generated') || html.includes('<!-- HTML generation cancelled. -->');
}







function updateIterationUI(pipelineId: number, iterationIndex: number) {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline || !pipeline.iterations[iterationIndex]) return;

    const iter = pipeline.iterations[iterationIndex];
    const iterationElement = document.getElementById(`iteration-${pipelineId}-${iter.iterationNumber}`);

    if (iterationElement) {
        // Re-render the entire iteration element
        const newHtml = renderIteration(pipelineId, iter);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const newElement = tempDiv.firstElementChild;

        if (newElement && iterationElement.parentNode) {
            iterationElement.parentNode.replaceChild(newElement, iterationElement);

            // Re-attach event listeners for buttons
            attachIterationEventListeners(pipelineId, iter.iterationNumber);
        }
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

// AI service function now handled by routing system
const callGemini = callAI;








async function runPipeline(pipelineId: number, initialRequest: string) {
    const pipeline = pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.isStopRequested = false;
    updatePipelineStatusUI(pipelineId, 'running');

    let currentContent = "";
    let currentSuggestions: string = ''; // Changed from array to string for markdown content


    const numMainRefinementLoops = currentMode === 'website' ? getSelectedRefinementStages() : 0;
    const totalPipelineSteps = currentMode === 'website' ? 1 + numMainRefinementLoops + 1 : 0;

    for (let i = 0; i < totalPipelineSteps; i++) {
        const iteration = pipeline.iterations[i];
        if (pipeline.isStopRequested) {
            iteration.status = 'cancelled';
            iteration.error = 'Process execution was stopped by the user.';
            updateIterationUI(pipelineId, i);
            for (let j = i + 1; j < pipeline.iterations.length; j++) {
                pipeline.iterations[j].status = 'cancelled';
                pipeline.iterations[j].error = 'Process execution was stopped by user.';
                updateIterationUI(pipelineId, j);
            }
            updatePipelineStatusUI(pipelineId, 'stopped');
            return;
        }

        // Reset prompts and outputs for current iteration (website mode only)
        iteration.requestPromptContent_InitialGenerate = iteration.requestPromptContent_FeatureImplement = iteration.requestPromptContent_BugFix = iteration.requestPromptFeatures_Suggest = undefined;
        iteration.contentBeforeBugFix = undefined; // Clear content before bug fix
        iteration.error = undefined;
        // Website-only fields are managed; non-website fields no longer exist

        try {
            // Helper function to get custom model for an agent
            const getAgentModel = (agentKey: string): string | undefined => {
                if (currentMode === 'website') {
                    const modelField = `model_${agentKey}` as keyof typeof customPromptsWebsiteState;
                    const selectedModel = customPromptsWebsiteState[modelField] as string | undefined;
                    return selectedModel;
                } else if (currentMode === 'deepthink') {
                    const modelField = `model_${agentKey}` as keyof typeof customPromptsDeepthinkState;
                    const selectedModel = customPromptsDeepthinkState[modelField] as string | undefined;
                    return selectedModel;
                } else if (currentMode === 'react') {
                    const modelField = `model_${agentKey}` as keyof typeof customPromptsReactState;
                    const selectedModel = customPromptsReactState[modelField] as string | undefined;
                    return selectedModel;
                }
                return undefined;
            };

            const makeApiCall = async (userPrompt: string, systemInstruction: string, isJson: boolean, stepDesc: string, agentKey?: string): Promise<string> => {
                if (!pipeline) throw new Error("Pipeline context lost");
                if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested before API call: ${stepDesc}`);
                let responseText = "";
                const customModel = agentKey ? getAgentModel(agentKey) : undefined;
                const modelToUse: string = customModel ?? pipeline.modelName;
                if (!modelToUse) {
                    throw new Error(`No model specified for ${stepDesc}. Please select a model for this agent or set a global model.`);
                }
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    if (pipeline.isStopRequested) throw new PipelineStopRequestedError(`Stop requested during retry for: ${stepDesc}`);
                    iteration.retryAttempt = attempt;
                    iteration.status = attempt > 0 ? 'retrying' : 'processing';
                    updateIterationUI(pipelineId, i);
                    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt)));

                    try {
                        const apiResponse = await callGemini(userPrompt, pipeline.temperature, modelToUse, systemInstruction, isJson, getSelectedTopP());
                        responseText = apiResponse.text;
                        iteration.status = 'processing';
                        updateIterationUI(pipelineId, i);
                        return responseText;
                    } catch (e: any) {
                        // Removed console.warn
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
                const placeholderContent = '<!-- No content provided by previous step. Please generate foundational structure based on the original idea. -->';

                if (i === 0) {
                    const userPromptInitialGen = renderPrompt(customPromptsWebsiteState.user_initialGen, { initialIdea: initialRequest, currentContent: currentContent });
                    iteration.requestPromptContent_InitialGenerate = userPromptInitialGen;
                    {
                        const initialGenResponse = await makeApiCall(userPromptInitialGen, customPromptsWebsiteState.sys_initialGen, false, "Initial HTML Generation", "initialGen");
                        // For initial generation, expect full content output
                        currentContent = initialGenResponse;
                        iteration.contentBeforeBugFix = currentContent; // Store initial generation before bug fix
                    }

                    // Apply quality mode system prompt if enabled
                    let bugFixSystemPrompt = customPromptsWebsiteState.sys_initialBugFix;
                    if (currentEvolutionMode === 'quality') {
                        bugFixSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${bugFixSystemPrompt}`;
                    }

                    const userPromptInitialBugFix = renderPrompt(customPromptsWebsiteState.user_initialBugFix, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                    iteration.requestPromptContent_BugFix = userPromptInitialBugFix;
                    {
                        const bugfixResponse = await makeApiCall(userPromptInitialBugFix, bugFixSystemPrompt, false, "Initial Bug Fix & Polish - Full Content", "initialBugFix");
                        // Now expecting full updated content directly
                        currentContent = bugfixResponse;
                        iteration.generatedContent = isHtmlContent(currentContent) ? cleanHtmlOutput(currentContent) : currentContent;
                    }

                    // Only run feature suggestions if not in 'off' mode
                    if (currentEvolutionMode !== 'off') {
                        // Apply quality mode system prompt if enabled
                        let featureSuggestSystemPrompt = customPromptsWebsiteState.sys_initialFeatureSuggest;
                        if (currentEvolutionMode === 'quality') {
                            featureSuggestSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${featureSuggestSystemPrompt}`;
                        }

                        const userPromptInitialFeatures = renderPrompt(customPromptsWebsiteState.user_initialFeatureSuggest, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                        iteration.requestPromptFeatures_Suggest = userPromptInitialFeatures;
                        // Use the selected model for feature suggestions
                        const featuresModel = getAgentModel("initialFeatures") || pipeline.modelName;
                        if (!featuresModel) {
                            throw new Error("No model specified for initial feature suggestions. Please select a model for this agent or set a global model.");
                        }
                        const featuresContent = await callGemini(userPromptInitialFeatures, pipeline.temperature, featuresModel, featureSuggestSystemPrompt, false, getSelectedTopP()).then((response: any) => response.text);
                        iteration.suggestedFeaturesContent = featuresContent;
                        currentSuggestions = featuresContent || ''; // Store as markdown string instead of array
                    } else {
                        // In 'off' mode, skip feature suggestions
                        iteration.suggestedFeaturesContent = '';
                        currentSuggestions = '';
                    }
                } else if (i <= numMainRefinementLoops) {
                    // Skip refine stabilize & implement agent if in 'off' mode
                    if (currentEvolutionMode !== 'off') {
                        // Apply quality mode system prompt if enabled
                        let refineImplementSystemPrompt = customPromptsWebsiteState.sys_refineStabilizeImplement;
                        if (currentEvolutionMode === 'quality') {
                            refineImplementSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineImplementSystemPrompt}`;
                        }

                        const userPromptRefineImplement = renderPrompt(customPromptsWebsiteState.user_refineStabilizeImplement, { currentContent: currentContent || placeholderContent, featuresToImplementStr: currentSuggestions });
                        iteration.requestPromptContent_FeatureImplement = userPromptRefineImplement;
                        {
                            const refineImplementResponse = await makeApiCall(userPromptRefineImplement, refineImplementSystemPrompt, false, `Stabilization & Feature Impl (Iter ${i}) - Full Content`, "refineStabilizeImplement");
                            // Now expecting full updated content directly
                            currentContent = refineImplementResponse;
                            iteration.contentBeforeBugFix = currentContent; // Store content before bug fix (after feature implementation)
                        }
                    } else {
                        // In 'off' mode, skip the refine stabilize & implement step
                        iteration.requestPromptContent_FeatureImplement = 'Skipped (Evolution Mode: Off)';
                    }

                    // Apply quality mode system prompt if enabled
                    let refineBugFixSystemPrompt = customPromptsWebsiteState.sys_refineBugFix;
                    if (currentEvolutionMode === 'quality') {
                        refineBugFixSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineBugFixSystemPrompt}`;
                    }

                    const userPromptRefineBugFix = renderPrompt(customPromptsWebsiteState.user_refineBugFix, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                    iteration.requestPromptContent_BugFix = userPromptRefineBugFix;
                    {
                        const bugfixResponse = await makeApiCall(userPromptRefineBugFix, refineBugFixSystemPrompt, false, `Bug Fix & Completion (Iter ${i}) - Full Content`, "refineBugFix");
                        // Now expecting full updated content directly
                        currentContent = bugfixResponse;
                        iteration.generatedContent = isHtmlContent(currentContent) ? cleanHtmlOutput(currentContent) : currentContent;
                    }

                    // Only run feature suggestions if not in 'off' mode
                    if (currentEvolutionMode !== 'off') {
                        // Apply quality mode system prompt if enabled
                        let refineFeatureSuggestSystemPrompt = customPromptsWebsiteState.sys_refineFeatureSuggest;
                        if (currentEvolutionMode === 'quality') {
                            refineFeatureSuggestSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${refineFeatureSuggestSystemPrompt}`;
                        }

                        const userPromptRefineFeatures = renderPrompt(customPromptsWebsiteState.user_refineFeatureSuggest, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                        iteration.requestPromptFeatures_Suggest = userPromptRefineFeatures;
                        // Use the selected model for feature suggestions
                        const refineFeatureModel = getAgentModel("refineFeatures") || pipeline.modelName;
                        if (!refineFeatureModel) {
                            throw new Error("No model specified for refine feature suggestions. Please select a model for this agent or set a global model.");
                        }
                        const featuresContent = await callGemini(userPromptRefineFeatures, pipeline.temperature, refineFeatureModel, refineFeatureSuggestSystemPrompt, false, getSelectedTopP()).then((response: any) => response.text);
                        iteration.suggestedFeaturesContent = featuresContent;
                        currentSuggestions = featuresContent || ''; // Store as markdown string instead of array
                    } else {
                        // In 'off' mode, skip feature suggestions
                        iteration.suggestedFeaturesContent = '';
                        currentSuggestions = '';
                    }
                } else {
                    // Apply quality mode system prompt if enabled
                    let finalPolishSystemPrompt = customPromptsWebsiteState.sys_finalPolish;
                    if (currentEvolutionMode === 'quality') {
                        finalPolishSystemPrompt = `${QUALITY_MODE_SYSTEM_PROMPT}\n\n${finalPolishSystemPrompt}`;
                    }

                    const userPromptFinalPolish = renderPrompt(customPromptsWebsiteState.user_finalPolish, { initialIdea: initialRequest, currentContent: currentContent || placeholderContent });
                    iteration.requestPromptContent_BugFix = userPromptFinalPolish; // Re-using bugfix field for UI display of final polish prompt
                    {
                        const finalPolishResponse = await makeApiCall(userPromptFinalPolish, finalPolishSystemPrompt, false, "Final Polish - Full Content", "finalPolish");
                        // Now expecting full updated content directly
                        currentContent = finalPolishResponse;
                        iteration.generatedContent = isHtmlContent(currentContent) ? cleanHtmlOutput(currentContent) : currentContent;
                    }
                    iteration.suggestedFeaturesContent = "";
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

// Removed duplicate downloadFile function - using modular ActionButton system
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
        // Removed console.warn
        files.push({ path: "src/App.tsx", content: finalCode });
    }

    files.forEach(file => {
        // Ensure paths are relative and don't start with /
        const correctedPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
        zip.file(correctedPath, file.content);
    });

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const { downloadFile } = await import('./Components/ActionButton');
        downloadFile(zipBlob as any, `react-app-${activeReactPipeline.id}.zip`, 'application/zip');
    } catch (error) {
        // Removed console.error
        alert("Failed to generate zip file. See console for details.");
    }
}
// Make function globally accessible for ReactAgenticIntegration
(window as any).createAndDownloadReactProjectZip = createAndDownloadReactProjectZip;


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

async function exportConfiguration() {
    const config: ExportedConfig = {
        currentMode,
        currentEvolutionMode,
        initialIdea: initialIdeaInput.value,
        selectedModel: getSelectedModel(),
        selectedOriginalTemperatureIndices: [],
        pipelinesState,
        activeDeepthinkPipeline: activeDeepthinkPipeline ?? null,
        activeReactPipeline: activeReactPipeline ?? null,
        embeddedAgenticState: activeReactPipeline ? getActiveAgenticState() : null,
        activeAgenticState: currentMode === 'agentic' ? getActiveAgenticState() : null,
        activeGenerativeUIState: currentMode === 'generativeui' ? getActiveGenerativeUIState() : null,
        activeContextualState: currentMode === 'contextual' ? getContextualState() : null,
        activeAdaptiveDeepthinkState: currentMode === 'adaptive-deepthink' ? getAdaptiveDeepthinkState() : null,
        activePipelineId,
        activeDeepthinkProblemTabId: activeDeepthinkPipeline?.activeTabId ?? '',
        globalStatusText: '',
        globalStatusClass: '',
        customPromptsWebsite: customPromptsWebsiteState,
        customPromptsDeepthink: customPromptsDeepthinkState,
        customPromptsReact: customPromptsReactState,
        customPromptsAgentic: customPromptsAgenticState,
        customPromptsAdaptiveDeepthink: customPromptsAdaptiveDeepthinkState,
        customPromptsContextual: customPromptsContextualState,
        isCustomPromptsOpen: false,
        // Export all model parameters
        modelParameters: {
            temperature: getSelectedTemperature(),
            topP: getSelectedTopP(),
            refinementStages: getSelectedRefinementStages(),
            strategiesCount: getSelectedStrategiesCount(),
            subStrategiesCount: getSelectedSubStrategiesCount(),
            hypothesisCount: getSelectedHypothesisCount(),
            redTeamAggressiveness: getSelectedRedTeamAggressiveness(),
            refinementEnabled: getRefinementEnabled(),
            skipSubStrategies: getSkipSubStrategies(),
            dissectedObservationsEnabled: getDissectedObservationsEnabled(),
            iterativeCorrectionsEnabled: getIterativeCorrectionsEnabled(),
            provideAllSolutionsToCorrectors: getProvideAllSolutionsToCorrectors()
        }
    };

    const configString = JSON.stringify(config, null, 2);
    const blob = new Blob([configString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
    a.download = `iterative-studio-config-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function handleImportConfiguration(event: Event) {
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
                        // Removed console.warn
                    } else {
                        throw new Error(`Invalid configuration: Missing or malformed critical field '${field.key}'. Expected type '${field.type}', got '${typeof importedConfig[field.key]}'.`);
                    }
                }
            }

            currentMode = importedConfig.currentMode;
            const modeRadio = document.querySelector(`input[name="app-mode"][value="${currentMode}"]`) as HTMLInputElement;
            if (modeRadio) {
                modeRadio.checked = true;
            }

            // Restore evolution convergence mode
            if (importedConfig.currentEvolutionMode !== undefined) {
                currentEvolutionMode = importedConfig.currentEvolutionMode;
                // Update button states
                const evolutionButtons = document.querySelectorAll('.evolution-convergence-button');
                evolutionButtons.forEach(button => {
                    const buttonValue = (button as HTMLElement).dataset.value;
                    if (buttonValue === currentEvolutionMode) {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                });
                // Update description
                updateEvolutionModeDescription(currentEvolutionMode);
            }

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

            // Restore model parameters AFTER sidebar controls are initialized
            // Use setTimeout to ensure UI elements are fully ready
            if (importedConfig.modelParameters) {
                const params = importedConfig.modelParameters;
                setTimeout(() => {
                    const modelConfig = routingManager.getModelConfigManager();
                    
                    // Update all parameters
                    if (params.temperature !== undefined) modelConfig.updateParameter('temperature', params.temperature);
                    if (params.topP !== undefined) modelConfig.updateParameter('topP', params.topP);
                    if (params.refinementStages !== undefined) modelConfig.updateParameter('refinementStages', params.refinementStages);
                    if (params.strategiesCount !== undefined) modelConfig.updateParameter('strategiesCount', params.strategiesCount);
                    if (params.subStrategiesCount !== undefined) modelConfig.updateParameter('subStrategiesCount', params.subStrategiesCount);
                    if (params.hypothesisCount !== undefined) modelConfig.updateParameter('hypothesisCount', params.hypothesisCount);
                    if (params.redTeamAggressiveness !== undefined) modelConfig.updateParameter('redTeamAggressiveness', params.redTeamAggressiveness);
                    if (params.refinementEnabled !== undefined) modelConfig.updateParameter('refinementEnabled', params.refinementEnabled);
                    if (params.skipSubStrategies !== undefined) modelConfig.updateParameter('skipSubStrategies', params.skipSubStrategies);
                    if (params.dissectedObservationsEnabled !== undefined) modelConfig.updateParameter('dissectedObservationsEnabled', params.dissectedObservationsEnabled);
                    if (params.iterativeCorrectionsEnabled !== undefined) modelConfig.updateParameter('iterativeCorrectionsEnabled', params.iterativeCorrectionsEnabled);
                    
                    // Sync UI with the restored parameters
                    const modelSelectionUI = routingManager.getModelSelectionUI();
                    if (modelSelectionUI) {
                        modelSelectionUI.syncUIWithParameters();
                    }

                    // Re-render mode-specific UI so imported parameters influence the layout
                    if (currentMode === 'deepthink' && activeDeepthinkPipeline) {
                        renderActiveDeepthinkPipeline();
                        if (activeDeepthinkPipeline.activeTabId) {
                            activateTab(activeDeepthinkPipeline.activeTabId);
                        }
                    } else if (currentMode === 'react') {
                        renderReactModePipeline();
                        if (activeReactPipeline && activeReactPipeline.activeTabId) {
                            activateTab(activeReactPipeline.activeTabId);
                        }
                    }
                }, 150); // Slightly longer delay to ensure sidebar controls are ready
            }

            if (currentMode === 'deepthink') {
                const importedPipeline = importedConfig.activeDeepthinkPipeline;
                activeDeepthinkPipeline = importedPipeline ? {
                    ...importedPipeline,
                    isStopRequested: false,
                    status: (importedPipeline.status === 'processing' || importedPipeline.status === 'stopping') ? 'idle' : importedPipeline.status,
                    activeTabId: importedConfig.activeDeepthinkProblemTabId || 'strategic-solver',
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
                        // Preserve sub-strategy data including critique fields
                        subStrategies: strategy.subStrategies?.map(subStrategy => ({
                            ...subStrategy,
                            // Reset processing states but preserve completed data
                            selfImprovementStatus: subStrategy.selfImprovementStatus === 'processing' || subStrategy.selfImprovementStatus === 'retrying' ? 'pending' : subStrategy.selfImprovementStatus,
                            solutionCritiqueStatus: subStrategy.solutionCritiqueStatus === 'processing' || subStrategy.solutionCritiqueStatus === 'retrying' ? 'pending' : subStrategy.solutionCritiqueStatus,
                        })) || []
                    })) || [],
                    // Preserve solution critiques and dissected observations synthesis
                    solutionCritiques: Array.isArray(importedPipeline.solutionCritiques) ? importedPipeline.solutionCritiques : [],
                    solutionCritiquesStatus: importedPipeline.solutionCritiquesStatus === 'processing' ? 'pending' : importedPipeline.solutionCritiquesStatus,
                    solutionCritiquesError: importedPipeline.solutionCritiquesError,
                    dissectedObservationsSynthesis: importedPipeline.dissectedObservationsSynthesis,
                    dissectedSynthesisRequestPrompt: importedPipeline.dissectedSynthesisRequestPrompt,
                    dissectedSynthesisStatus: importedPipeline.dissectedSynthesisStatus === 'processing' || importedPipeline.dissectedSynthesisStatus === 'retrying' ? 'pending' : importedPipeline.dissectedSynthesisStatus,
                    dissectedSynthesisError: importedPipeline.dissectedSynthesisError,
                    dissectedSynthesisRetryAttempt: importedPipeline.dissectedSynthesisRetryAttempt,
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
                    status: (importedConfig.activeReactPipeline.status === 'orchestrating' || importedConfig.activeReactPipeline.status === 'agentic_orchestrating' || importedConfig.activeReactPipeline.status === 'processing_workers' || importedConfig.activeReactPipeline.status === 'stopping') ? 'idle' : importedConfig.activeReactPipeline.status,
                } : null;
                activePipelineId = null;

                // Restore embedded agentic state if available
                if (importedConfig.embeddedAgenticState) {
                    setActiveAgenticStateForImport(importedConfig.embeddedAgenticState);
                }

                // Re-render the React mode pipeline UI
                renderReactModePipeline();

                // Restore the active tab if available
                if (activeReactPipeline && activeReactPipeline.activeTabId) {
                    activateTab(activeReactPipeline.activeTabId);
                }
            } else if (currentMode === 'agentic') {
                // Clear other mode states for Agentic mode
                pipelinesState = [];
                activeDeepthinkPipeline = null;
                activeReactPipeline = null;
                activePipelineId = null;

                // Restore Agentic state first if available
                if (importedConfig.activeAgenticState) {
                    setActiveAgenticStateForImport(importedConfig.activeAgenticState);
                }

                // Render Agentic mode UI (after state is restored)
                renderAgenticMode();
            } else if (currentMode === 'generativeui') {
                // Import GenerativeUI state
                if (importedConfig.activeGenerativeUIState) {
                    setActiveGenerativeUIStateForImport(importedConfig.activeGenerativeUIState);
                }
                renderGenerativeUIMode();
            } else if (currentMode === 'contextual') {
                // Import Contextual state
                pipelinesState = [];
                activeReactPipeline = null;
                activeDeepthinkPipeline = null;
                activePipelineId = null;
                
                // Restore Contextual state if available
                if (importedConfig.activeContextualState) {
                    setContextualStateForImport(importedConfig.activeContextualState);
                }
                
                renderContextualMode();
            } else if (currentMode === 'adaptive-deepthink') {
                // Import Adaptive Deepthink state
                pipelinesState = [];
                activeReactPipeline = null;
                activeDeepthinkPipeline = null;
                activePipelineId = null;
                
                // Restore Adaptive Deepthink state if available
                if (importedConfig.activeAdaptiveDeepthinkState) {
                    setAdaptiveDeepthinkStateForImport(importedConfig.activeAdaptiveDeepthinkState);
                }
                
                renderAdaptiveDeepthinkMode();
            } else { // Website mode               
                // Restore website mode pipelines state
                pipelinesState = importedConfig.pipelinesState ? importedConfig.pipelinesState.map(pipeline => ({
                    ...pipeline,
                    isStopRequested: false,
                    status: (pipeline.status === 'running' || pipeline.status === 'stopping') ? 'stopped' : pipeline.status,
                    iterations: pipeline.iterations.map(iteration => ({
                        ...iteration,
                        status: (iteration.status === 'processing' || iteration.status === 'retrying') ? 'completed' : iteration.status,
                    }))
                })) : [];
                activePipelineId = importedConfig.activePipelineId;

                // Re-render the pipelines UI
                renderPipelines();
            }


            customPromptsWebsiteState = importedConfig.customPromptsWebsite ? JSON.parse(JSON.stringify(importedConfig.customPromptsWebsite)) : JSON.parse(JSON.stringify(defaultCustomPromptsWebsite));

            const importedDeepthinkPrompts = importedConfig.customPromptsDeepthink || createDefaultCustomPromptsDeepthink(NUM_INITIAL_STRATEGIES_DEEPTHINK, NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK);
            customPromptsDeepthinkState = JSON.parse(JSON.stringify(importedDeepthinkPrompts));

            const importedReactPrompts = importedConfig.customPromptsReact || createDefaultCustomPromptsReact();
            customPromptsReactState = JSON.parse(JSON.stringify(importedReactPrompts));

            const importedAgenticPrompts = importedConfig.customPromptsAgentic || { systemPrompt: AGENTIC_SYSTEM_PROMPT };
            customPromptsAgenticState = JSON.parse(JSON.stringify(importedAgenticPrompts));

            const importedAdaptiveDeepthinkPrompts = importedConfig.customPromptsAdaptiveDeepthink || createDefaultCustomPromptsAdaptiveDeepthink();
            customPromptsAdaptiveDeepthinkState = JSON.parse(JSON.stringify(importedAdaptiveDeepthinkPrompts));

            const importedContextualPrompts = importedConfig.customPromptsContextual || createDefaultCustomPromptsContextual();
            customPromptsContextualState = JSON.parse(JSON.stringify(importedContextualPrompts));

            updateCustomPromptTextareasFromState();

            updateControlsState();
        } catch (error: any) {
            // Removed console.error
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
    if (!hasValidApiKey()) {
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
        agenticRefineStarted: false,
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
                const orchestratorModel: string = customPromptsReactState.model_orchestrator || getSelectedModel();

                const apiResponse = await callGemini(orchestratorUserPrompt, getSelectedTemperature(), orchestratorModel, orchestratorSysPrompt, true, getSelectedTopP()); // Expecting JSON output
                orchestratorResponseText = apiResponse.text;
                break;
            } catch (e: any) {
                // Removed console.warn
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

            // NEW ARCHITECTURE: Don't run workers immediately
            // Instead, prepare the initial content for the embedded agentic agent
            activeReactPipeline.status = 'agentic_orchestrating';
            
            // Prepare initial content as proper files for the agentic agent
            // File 1: Plan.md - Using FILE marker format for consistency
            let initialContent = `// --- FILE: Plan.md ---
${parsedOrchestratorOutput.plan_txt}

`;
            
            // File 2: WorkerAgentsPrompts.json - structured format for easy parsing
            const workerPromptsJson = {
                worker_agents: parsedOrchestratorOutput.worker_agents_prompts.map((agentPromptData: any, index: number) => ({
                    id: index + 1,
                    title: agentPromptData.title,
                    system_instruction: agentPromptData.system_instruction,
                    user_prompt_template: agentPromptData.user_prompt_template
                }))
            };
            
            initialContent += `// --- FILE: WorkerAgentsPrompts.json ---
${JSON.stringify(workerPromptsJson, null, 2)}

`;
            
            activeReactPipeline.initialAgenticContent = initialContent;
            activeReactPipeline.workerPromptsData = parsedOrchestratorOutput.worker_agents_prompts;
            renderReactModePipeline();

        } catch (parseError: any) {
            // Removed console.error
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
        // Removed console.error
    } finally {
        if (activeReactPipeline && activeReactPipeline.status !== 'agentic_orchestrating' && activeReactPipeline.status !== 'orchestrating' && activeReactPipeline.status !== 'orchestrating_retrying' && activeReactPipeline.status !== 'stopping') {
            isGenerating = false;
        }
        updateControlsState();
        renderReactModePipeline();
    }
}
// Make renderReactModePipeline globally accessible for ReactAgenticIntegration
function renderReactModePipeline() {
    if (currentMode !== 'react' || !tabsNavContainer || !pipelinesContentContainer) {
        if (currentMode !== 'react' && tabsNavContainer && pipelinesContentContainer) {
            clearTabsContainer();
            pipelinesContentContainer.innerHTML = '';
        }
        return;
    }

    if (!activeReactPipeline) {
        pipelinesContentContainer.innerHTML = '';
        return;
    }

    const pipeline = activeReactPipeline;

    clearTabsContainer();
    pipelinesContentContainer.innerHTML = '';

    // NO LONGER SHOWING ORCHESTRATOR TAB - Agentic Refinements is the default view
    // Preview tab will be created after first successful build

    // ALWAYS SHOW Agentic Refinements tab (regardless of status)
    // Create Agentic Refinements tab (now the default and primary tab)
    const agenticTab = document.createElement('button');
    agenticTab.id = 'react-tab-agentic-refinements';
    agenticTab.className = 'tab-button react-mode-tab';
    agenticTab.textContent = 'Agentic Refinements';
    agenticTab.setAttribute('role', 'tab');
    agenticTab.setAttribute('aria-controls', 'pipeline-content-agentic-refinements');
    agenticTab.addEventListener('click', () => activateTab('agentic-refinements'));
    (agenticTab.style as any).whiteSpace = 'nowrap';
    // Insert as first tab
    tabsNavContainer.appendChild(agenticTab);
    
    // Ensure Agentic Pane exists and is mounted
    if (!document.getElementById('pipeline-content-agentic-refinements')) {
        const agenticPane = document.createElement('div');
        agenticPane.id = 'pipeline-content-agentic-refinements';
        agenticPane.className = 'pipeline-content pipeline-fade-in';
        agenticPane.style.padding = '0';
        agenticPane.style.height = '100%';

        const agenticContainer = document.createElement('div');
        agenticContainer.id = 'agentic-refinements-container';
        agenticContainer.style.height = '100vh';
        agenticContainer.style.minHeight = '500px';
        agenticContainer.style.width = '100%';
        agenticPane.appendChild(agenticContainer);
        pipelinesContentContainer.appendChild(agenticPane);

        // Start or rehydrate Agentic inside this pane
        if (pipeline.initialAgenticContent && !pipeline.agenticRefineStarted) {
            pipeline.agenticRefineStarted = true;
            // Start React-specific Agentic process
            import('./React/ReactAgenticIntegration').then(({ startReactAgenticProcess }) => {
                startReactAgenticProcess(
                    agenticContainer,
                    pipeline.initialAgenticContent || '',
                    pipeline,
                    customPromptsReactState,
                    (content: string, isComplete?: boolean) => {
                        if (activeReactPipeline) {
                            activeReactPipeline.finalAppendedCode = content;
                            // Update Monaco editor if it exists
                            const monacoRoot = (window as any).__monacoEditorRoot;
                            if (monacoRoot) {
                                monacoRoot.render(
                                    React.createElement(MonacoFileEditor, {
                                        content: content,
                                        onContentChange: (newContent: string) => {
                                            if (activeReactPipeline) {
                                                activeReactPipeline.finalAppendedCode = newContent;
                                            }
                                        },
                                        onDownload: createAndDownloadReactProjectZip,
                                        readOnly: true,
                                        forceDarkTheme: false
                                    })
                                );
                            }
                            // Mark as completed when agentic agent exits
                            if (isComplete && activeReactPipeline && activeReactPipeline.status !== 'completed') {
                                activeReactPipeline.status = 'completed';
                                renderReactModePipeline();
                            }
                        }
                    }
                );
            });
        } else if (pipeline.agenticRefineStarted) {
            import('./React/ReactAgenticIntegration').then(({ rehydrateReactAgenticUI }) => {
                rehydrateReactAgenticUI(agenticContainer);
            });
        } else {
            // Show loading state when content is not ready yet
            agenticContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-secondary);">
                    <div class="spinner" style="width: 40px; height: 40px; border: 3px solid var(--border-color); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="font-size: 0.875rem;">Preparing React application files...</p>
                    <p style="font-size: 0.75rem; opacity: 0.7;">Plan.md and WorkerAgentsPrompts.json will load shortly</p>
                </div>
            `;
        }

        const dlAgentic = document.getElementById('download-react-runnable-project-agentic');
        if (dlAgentic) dlAgentic.addEventListener('click', createAndDownloadReactProjectZip);
    }

    // Show errors if any (without creating orchestrator pane)
    if (pipeline.error && (pipeline.status === 'failed' || (pipeline.status === 'error' && pipeline.stages.every(s => s.status === 'pending')))) {
        const errorPane = document.createElement('div');
        errorPane.className = 'pipeline-content';
        errorPane.innerHTML = `<div class="status-message error"><pre>${escapeHtml(pipeline.error)}</pre></div>`;
        pipelinesContentContainer.appendChild(errorPane);
    }

    const stopReactButton = document.getElementById('stop-react-pipeline-btn');
    if (stopReactButton) {
        stopReactButton.onclick = () => {
            if (activeReactPipeline && (activeReactPipeline.status === 'orchestrating' || activeReactPipeline.status === 'agentic_orchestrating' || activeReactPipeline.status === 'processing_workers')) {
                activeReactPipeline.isStopRequested = true;
                activeReactPipeline.status = 'stopping';
                renderReactModePipeline();
            }
        };
        (stopReactButton as HTMLButtonElement).disabled = pipeline.status === 'stopping' || pipeline.status === 'stopped' || pipeline.status === 'failed' || pipeline.status === 'completed';
    }


    // Worker tabs are now hidden until workers actually execute
    // They will be updated when StartWorkerAgents() completes
    if (pipeline.workersExecuted) {
        pipeline.stages.forEach(stage => {
            const tabButtonId = `react-tab-worker-${stage.id}`;
            const contentPaneId = `pipeline-content-worker-${stage.id}`;

            const tabButton = document.createElement('button');
            tabButton.id = tabButtonId;
            tabButton.className = `tab-button react-mode-tab status-${stage.status}`;
            // Clean title: remove any leading 'Agent N:' and keep full title (scroll header instead of truncating)
            const cleanTitle = (stage.title || `Worker ${stage.id + 1}`).replace(/^Agent\s*\d+\s*:\s*/i, '').trim();
            tabButton.textContent = cleanTitle;
            (tabButton.style as any).whiteSpace = 'nowrap';
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
            contentBlock = renderMathContent(contentToRender);
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
            downloadBtn.addEventListener('click', async (e) => {
                const workerId = parseInt((e.currentTarget as HTMLElement).dataset.workerId || "-1", 10);
                const stage = activeReactPipeline?.stages.find(s => s.id === workerId);
                if (stage?.generatedContent) {
                    const safeTitle = stage.title.replace(/[\s&/\\?#]+/g, '_').toLowerCase();
                    const { downloadFile } = await import('./Components/ActionButton');
                    downloadFile(stage.generatedContent, `react_worker_${stage.id}_${safeTitle}.txt`, 'text/plain');
                }
            });
        }
    });
    }

    if (pipeline.finalAppendedCode) {
        const finalOutputPane = document.createElement('div');
        finalOutputPane.className = 'react-final-output-pane';
        // Make the explorer take full available space inside the tab
        finalOutputPane.innerHTML = `
            <div id="monaco-editor-mount" style="height: calc(100vh - 12rem); min-height: 500px; margin-top: 0;"></div>
        `;
        // Find the orchestrator pane and insert this after it.
        const orchestratorDiv = document.getElementById('pipeline-content-orchestrator');
        orchestratorDiv?.appendChild(finalOutputPane);

        // Mount the Monaco editor component
        const mountPoint = document.getElementById('monaco-editor-mount');
        if (mountPoint && pipeline.finalAppendedCode) {
            // Check if root already exists, otherwise create a new one
            let root = (window as any).__monacoEditorRoot;
            if (!root) {
                root = ReactDOM.createRoot(mountPoint);
                (window as any).__monacoEditorRoot = root;
            }

            const handleContentChange = (newContent: string) => {
                if (activeReactPipeline) {
                    activeReactPipeline.finalAppendedCode = newContent;
                }
            };

            root.render(
                React.createElement(MonacoFileEditor, {
                    content: pipeline.finalAppendedCode,
                    onContentChange: handleContentChange,
                    onDownload: createAndDownloadReactProjectZip,
                    readOnly: false,
                    forceDarkTheme: false
                })
            );
        }

        // If late-rendered and Agentic tab not created yet (safety), create it here
        if (!document.getElementById('react-tab-agentic-refinements') && pipeline.finalAppendedCode) {
            const agenticTabLate = document.createElement('button');
            agenticTabLate.id = 'react-tab-agentic-refinements';
            agenticTabLate.className = 'tab-button react-mode-tab';
            agenticTabLate.textContent = 'Agentic Refinements';
            agenticTabLate.setAttribute('role', 'tab');
            agenticTabLate.setAttribute('aria-controls', 'pipeline-content-agentic-refinements');
            agenticTabLate.addEventListener('click', () => activateTab('agentic-refinements'));
            // Insert as first tab (no orchestrator tab anymore)
            if (tabsNavContainer.firstChild) {
                tabsNavContainer.insertBefore(agenticTabLate, tabsNavContainer.firstChild);
            } else {
                tabsNavContainer.appendChild(agenticTabLate);
            }
        }
    }

    // Create Preview Pane only if we have a preview URL
    if (pipeline.previewUrl) {
        // Create preview tab if it doesn't exist
        if (!document.getElementById('react-tab-preview')) {
            const previewTab = document.createElement('button');
            previewTab.id = 'react-tab-preview';
            previewTab.className = 'tab-button react-mode-tab';
            previewTab.textContent = 'Preview';
            previewTab.setAttribute('role', 'tab');
            previewTab.setAttribute('aria-controls', 'pipeline-content-preview');
            previewTab.addEventListener('click', () => activateTab('preview'));
            
            // Insert preview tab after agentic refinements tab
            const agenticTab = document.getElementById('react-tab-agentic-refinements');
            if (agenticTab && agenticTab.nextSibling) {
                tabsNavContainer.insertBefore(previewTab, agenticTab.nextSibling);
            } else {
                tabsNavContainer.appendChild(previewTab);
            }
        }
        
        const previewPane = document.createElement('div');
        previewPane.id = 'pipeline-content-preview';
        previewPane.className = 'pipeline-content';
        previewPane.style.height = '100%';
        previewPane.style.position = 'relative';
        previewPane.style.display = 'flex';
        previewPane.style.flexDirection = 'column';
        
        previewPane.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color); background: var(--card-bg-color);">
                <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-color);">Live Preview</h3>
                <button 
                    id="react-preview-open-new-tab" 
                    class="button primary-action"
                    style="display: flex; align-items: center; gap: 6px; padding: 0.5rem 1rem;"
                    title="Open preview in new browser tab"
                >
                    <span class="material-symbols-outlined" style="font-size: 18px;">open_in_new</span>
                    <span>Open in New Tab</span>
                </button>
            </div>
            <div style="flex: 1; position: relative; overflow: hidden;">
                <iframe 
                    src="${pipeline.previewUrl}" 
                    style="width: 100%; height: 100%; border: none; background: white;"
                    sandbox="allow-scripts allow-same-origin"
                ></iframe>
            </div>
        `;
        pipelinesContentContainer.appendChild(previewPane);
        
        // Add event listener for "Open in New Tab" button
        setTimeout(() => {
            const openNewTabBtn = document.getElementById('react-preview-open-new-tab');
            if (openNewTabBtn && pipeline.previewUrl) {
                openNewTabBtn.addEventListener('click', () => {
                    window.open(pipeline.previewUrl, '_blank');
                });
            }
        }, 0);
    }
    
    // Ensure the tab list starts scrolled to the beginning
    const tabsNavContainerEl = document.getElementById('tabs-nav-container');
    if (tabsNavContainerEl) (tabsNavContainerEl as HTMLElement).scrollLeft = 0;

    if (pipeline.activeTabId) {
        activateTab(pipeline.activeTabId);
    } else {
        activateTab('agentic-refinements'); // Default to Agentic Refinements tab
    }
    updateControlsState();
}
// Assign to window for global access from ReactAgenticIntegration
(window as any).renderReactModePipeline = renderReactModePipeline;

async function runReactWorkerAgents() {
    if (!activeReactPipeline || activeReactPipeline.status !== 'processing_workers') {
        // Removed console.error
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
            // Removed console.error
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
                    const workerModel: string = customPromptsReactState.model_worker || getSelectedModel();
                    const workerTemp = 0.7; // Moderate temperature for workers

                    const apiResponse = await callGemini(stage.renderedUserPrompt, workerTemp, workerModel, stage.systemInstruction, false);
                    stageResponseText = apiResponse.text;
                    stage.generatedContent = cleanOutputByType(stageResponseText, 'text'); // Assuming text/code output
                    stage.status = 'completed';
                    stage.error = undefined;
                    renderReactModePipeline();
                    break; // Exit retry loop on success
                } catch (e: any) {
                    // Removed console.warn
                    stage.error = `Attempt ${attempt + 1} failed: ${e.message || 'Unknown API error'}`;
                    if (attempt === MAX_RETRIES) {
                        renderReactModePipeline();
                        throw e; // Rethrow after final attempt fails
                    }
                }
            }
        } catch (error: any) {
            // Removed console.error
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
            // Don't mark as completed yet - wait for agentic agent to exit
            aggregateReactOutputs();
            // Status remains 'processing_workers' until agentic agent exits
        }
    }

    isGenerating = false;
    updateControlsState();
    renderReactModePipeline();
}

function aggregateReactOutputs() {
    if (!activeReactPipeline) {
        // Removed console.warn
        return;
    }

    let combinedCode = `/* --- React Application Code --- */\n/* Generated by Iterative Studio */\n/* User Request: ${activeReactPipeline.userRequest} */\n\n`;
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
    // Initialize routing system
    initializeRouting();

    // Refresh providers to update available models
    routingManager.refreshProviders();

    // Variants removed: no pipeline selector rendering
    initializeCustomPromptTextareas();
    updateUIAfterModeChange(); // Called early to set up initial UI based on default mode

    if (generateButton) {
        generateButton.addEventListener('click', async () => {
            if (!hasValidApiKey()) { // Double check if any provider is configured
                alert("No providers are configured. Please configure at least one AI provider using the 'Add Providers' button.");
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
            } else if (currentMode === 'agentic') {
                await startAgenticProcess(initialIdea);
            } else if (currentMode === 'generativeui') {
                await startGenerativeUIProcess(initialIdea);
            } else if (currentMode === 'contextual') {
                await startContextualProcess(initialIdea, customPromptsContextualState);
            } else if (currentMode === 'adaptive-deepthink') {
                await startAdaptiveDeepthinkProcess(initialIdea, customPromptsAdaptiveDeepthinkState, currentProblemImageBase64, currentProblemImageMimeType);
            } else { // Website mode
                initPipelines();
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
        appModeSelector.querySelectorAll('input[name="app-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentMode = (e.target as HTMLInputElement).value as ApplicationMode;
                updateUIAfterModeChange();
            });
        });
    }

    // Initialize Agentic mode
    initializeAgenticMode();
    // Initialize GenerativeUI mode
    initializeGenerativeUIMode();


    if (exportConfigButton) {
        exportConfigButton.addEventListener('click', exportConfiguration);
    }
    if (importConfigInput) {
        importConfigInput.addEventListener('change', handleImportConfiguration);
    }

    // Prompts Modal Listeners - Now handled by routing system

    // API Key Listeners are now handled by the routing system

    updateControlsState();

    // Event delegation for dynamically created "Compare" buttons and "View The Argument" buttons
    if (pipelinesContentContainer) {
        pipelinesContentContainer.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const button = target.closest('.compare-output-button') as HTMLElement | null;
            if (button) {
                const pipelineId = parseInt(button.dataset.pipelineId || "-1", 10);
                const iterationNumber = parseInt(button.dataset.iterationNumber || "-1", 10);
                const contentType = button.dataset.contentType as ('html' | 'text');
                if (pipelineId !== -1 && iterationNumber !== -1 && (contentType === 'html' || contentType === 'text')) {
                    openDiffModal(pipelineId, iterationNumber, contentType);
                }
            }
        });
    }

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


(window as any).toggleRedTeamReasoning = function (agentId: string) {
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

(window as any).showFullRedTeamReasoning = function (agentId: string, fullContent: string) {
    const modal = document.getElementById('red-team-full-modal');
    const modalContent = document.getElementById('red-team-modal-content');
    if (modal && modalContent) {
        modalContent.innerHTML = `<pre>${fullContent}</pre>`;
        modal.classList.add('active');
    }
};

(window as any).closeRedTeamModal = function () {
    const modal = document.getElementById('red-team-full-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

// Deepthink Red Team reasoning functions
(window as any).toggleDeepthinkRedTeamReasoning = function (agentId: string) {
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

(window as any).showFullDeepthinkRedTeamReasoning = function (_agentId: string, fullContent: string) {
    const modal = document.getElementById('deepthink-red-team-full-modal');
    const modalContent = document.getElementById('deepthink-red-team-modal-content');
    if (modal && modalContent) {
        modalContent.innerHTML = `<pre>${fullContent}</pre>`;
        modal.classList.add('active');
    }
};

(window as any).closeDeepthinkRedTeamModal = function () {
    const modal = document.getElementById('deepthink-red-team-full-modal');
    if (modal) {
        modal.classList.remove('active');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();

    // Initialize deepthink module with all required dependencies
    initializeDeepthinkModule({
        getAIProvider: () => routingManager.getAIProvider(),
        callGemini,
        cleanOutputByType,
        parseJsonSuggestions: parseJsonSuggestions as any, // Only for Deepthink strategies
        parseJsonSafe,
        updateControlsState,
        escapeHtml: (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        getSelectedTemperature,
        getSelectedModel,
        getSelectedTopP,
        getSelectedStrategiesCount,
        getSelectedSubStrategiesCount,
        getSelectedHypothesisCount,
        getSelectedRedTeamAggressiveness,
        getRefinementEnabled,
        getSkipSubStrategies,
        getDissectedObservationsEnabled,
        getIterativeCorrectionsEnabled,
        getProvideAllSolutionsToCorrectors,
        cleanTextOutput,
        customPromptsDeepthinkState,
        tabsNavContainer: document.getElementById('tabs-nav-container'),
        pipelinesContentContainer: document.getElementById('pipelines-content-container'),
        setActiveDeepthinkPipeline: (pipeline: any) => {
            activeDeepthinkPipeline = pipeline as any;
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
    // Sidebar and main content elements handled by specific functions

    if (preloader) {
        preloader.classList.add('hidden');
    }

    // Sidebar collapse/expand functionality
    let sidebarIsCollapsed = false;

    function ensureExpandButton() {
        // Button now exists in HTML, just show/hide it
        const expandButton = document.getElementById('sidebar-expand-button');
        if (expandButton) {
            expandButton.style.display = sidebarIsCollapsed ? 'flex' : 'none';
        }
    }

    function initializeSidebarControls() {
        const sidebarCollapseButton = document.getElementById('sidebar-collapse-button');
        const controlsSidebar = document.getElementById('controls-sidebar');
        const mainContent = document.getElementById('main-content');
        const expandButton = document.getElementById('sidebar-expand-button');

        // Initialize expand button visibility based on current state
        if (controlsSidebar && controlsSidebar.classList.contains('collapsed')) {
            sidebarIsCollapsed = true;
            if (expandButton) {
                expandButton.style.display = 'flex';
            }
        }

        // Attach expand button handler (button exists in HTML)
        if (expandButton) {
            expandButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (controlsSidebar) {
                    controlsSidebar.classList.remove('collapsed');
                    sidebarIsCollapsed = false;
                    expandButton.style.display = 'none';
                }
            });
        }

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
                    // Show expand button
                    const expandBtn = document.getElementById('sidebar-expand-button');
                    if (expandBtn) {
                        expandBtn.style.display = 'flex';
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

    // Theme Toggle Functionality
    function initializeThemeToggle() {
        // Load saved theme preference or default to dark mode
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            const themeToggleButton = document.getElementById('theme-toggle-button');
            const themeIcon = themeToggleButton?.querySelector('.material-symbols-outlined');
            if (themeIcon) themeIcon.textContent = 'dark_mode';
        }

        // Use event delegation on document to ensure it always works
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const themeToggleButton = target.closest('#theme-toggle-button');

            if (themeToggleButton) {
                e.preventDefault();
                e.stopPropagation();

                const isLightMode = document.body.classList.toggle('light-mode');

                // Query for icon each time to avoid stale references
                const themeIcon = themeToggleButton.querySelector('.material-symbols-outlined');
                if (themeIcon) {
                    themeIcon.textContent = isLightMode ? 'dark_mode' : 'light_mode';
                }

                // Save preference
                localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
            }
        }, true); // Use capture phase to ensure we catch it first
    }

    // Global function to reinitialize sidebar controls (called from other functions)
    (window as any).pipelinesState = pipelinesState;

    // Initialize sidebar controls and theme toggle
    initializeSidebarControls();
    initializeThemeToggle();
    initializeEvolutionConvergenceButtons();

    // Re-initialize sidebar controls whenever tabs are updated
    const observer = new MutationObserver(() => {
        // Call ensureExpandButton to maintain button after tab changes
        ensureExpandButton();
    });

    const tabsContainer = document.getElementById('tabs-nav-container');
    if (tabsContainer) {
        observer.observe(tabsContainer, { childList: true, subtree: true });
    }
});