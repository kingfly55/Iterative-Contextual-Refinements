/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeDeepthinkModule, startDeepthinkAnalysisProcess } from '../Deepthink/Deepthink';
import {
    initializeGenerativeUIMode,
    startGenerativeUIProcess
} from '../GenerativeUI/GenerativeUI';
import {
    startContextualProcess
} from '../Contextual/Contextual';
import {
    startAdaptiveDeepthinkProcess
} from '../AdaptiveDeepthink/AdaptiveDeepthinkMode';
import { exportConfiguration, handleImportConfiguration } from './ConfigManager';
import {
    updateUIAfterModeChange,
    initializeEvolutionConvergenceButtons
} from '../Refine/WebsiteUI';
import { openDiffModal } from '../Components/DiffModal/DiffModalController';
import {
    initializeAgenticMode,
    startAgenticProcess,
    setAgenticPromptsManager,
} from '../Agentic/Agentic';

import {
    routingManager,
    initializeRouting,
    getSelectedModel,
    getSelectedTemperature,
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
    getPostQualityFilterEnabled,
    hasValidApiKey,
    callAI
} from '../Routing';
import {
    parseJsonSafe,
    cleanTextOutput,
    cleanOutputByType,
    parseJsonSuggestions
} from '../Parsing';
import { globalState } from './State';
import { ApplicationMode } from './Types';
import { updateControlsState } from '../UI/Controls';
import { startReactModeProcess, createAndDownloadReactProjectZip } from '../React/ReactLogic';
import { renderReactModePipeline } from '../React/ReactUI';
import { runPipeline, initPipelines } from '../Refine/WebsiteLogic';
import { renderPipelines } from '../Refine/WebsiteUI';
import { LayoutController } from '../UI/LayoutController';
import { GlobalModals } from '../UI/GlobalModals';

export class App {
    public static init() {
        this.initializeGlobalFunctions();
        this.initializeUI();
        this.initializeEventListeners();
        LayoutController.initialize();
        GlobalModals.initialize();
    }

    private static initializeGlobalFunctions() {
        // Make function globally accessible for ReactAgenticIntegration
        (window as any).createAndDownloadReactProjectZip = createAndDownloadReactProjectZip;
        (window as any).renderReactModePipeline = renderReactModePipeline;
    }

    private static initializeUI() {
        // Initialize routing system
        initializeRouting();

        // Refresh providers to update available models
        routingManager.refreshProviders();

        this.initializeCustomPromptTextareas();
        updateUIAfterModeChange(); // Called early to set up initial UI based on default mode

        // Initialize Agentic mode
        initializeAgenticMode();
        // Initialize GenerativeUI mode
        initializeGenerativeUIMode();

        initializeEvolutionConvergenceButtons();

        // Initialize deepthink module with all required dependencies
        initializeDeepthinkModule({
            getAIProvider: () => routingManager.getAIProvider(),
            callGemini: callAI,
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
            getPostQualityFilterEnabled,
            cleanTextOutput,
            customPromptsDeepthinkState: globalState.customPromptsDeepthinkState,
            tabsNavContainer: document.getElementById('tabs-nav-container'),
            pipelinesContentContainer: document.getElementById('pipelines-content-container'),
            setActiveDeepthinkPipeline: (pipeline: any) => {
                globalState.activeDeepthinkPipeline = pipeline as any;
            }
        });

        // Default to first mode if none specifically checked (e.g. after import or on fresh load)
        const appModeRadios = document.querySelectorAll('input[name="appMode"]');
        let modeIsAlreadySet = false;
        appModeRadios.forEach(radio => {
            if ((radio as HTMLInputElement).checked) {
                globalState.currentMode = (radio as HTMLInputElement).value as ApplicationMode; // Ensure currentMode reflects HTML state
                modeIsAlreadySet = true;
            }
        });

        if (!modeIsAlreadySet && appModeRadios.length > 0) {
            const firstModeRadio = appModeRadios[0] as HTMLInputElement;
            if (firstModeRadio) {
                firstModeRadio.checked = true;
                globalState.currentMode = firstModeRadio.value as ApplicationMode;
            }
        }
        updateUIAfterModeChange();

        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.classList.add('hidden');
        }

        updateControlsState();
    }

    private static initializeEventListeners() {
        const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
        const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;
        const appModeSelector = document.getElementById('app-mode-selector') as HTMLElement;
        const exportConfigButton = document.getElementById('export-config-button') as HTMLButtonElement;
        const importConfigInput = document.getElementById('import-config-input') as HTMLInputElement;

        if (generateButton) {
            generateButton.addEventListener('click', async () => {
                console.log('Generate button clicked');
                console.log('Current mode:', globalState.currentMode);
                if (!hasValidApiKey()) { // Double check if any provider is configured
                    alert("No providers are configured. Please configure at least one AI provider using the 'Add Providers' button.");
                    return;
                }
                const initialIdea = initialIdeaInput.value.trim();
                if (!initialIdea) {
                    alert("Please enter an idea, premise, or request.");
                    return;
                }

                if (globalState.currentMode === 'deepthink') {
                    console.log('Starting Deepthink process');
                    await startDeepthinkAnalysisProcess(initialIdea, globalState.currentProblemImageBase64, globalState.currentProblemImageMimeType);
                } else if (globalState.currentMode === 'react') {
                    console.log('Starting React process');
                    try {
                        await startReactModeProcess(initialIdea);
                    } catch (e) {
                        console.error('Error starting React process:', e);
                    }
                } else if (globalState.currentMode === 'agentic') {
                    console.log('Starting Agentic process');
                    try {
                        await startAgenticProcess(initialIdea);
                    } catch (e) {
                        console.error('Error starting Agentic process:', e);
                    }
                } else if (globalState.currentMode === 'generativeui') {
                    await startGenerativeUIProcess(initialIdea);
                } else if (globalState.currentMode === 'contextual') {
                    await startContextualProcess(initialIdea, globalState.customPromptsContextualState);
                } else if (globalState.currentMode === 'adaptive-deepthink') {
                    await startAdaptiveDeepthinkProcess(initialIdea, globalState.customPromptsAdaptiveDeepthinkState, globalState.currentProblemImageBase64, globalState.currentProblemImageMimeType);
                } else { // Website mode
                    console.log('Starting Website mode');
                    initPipelines();
                    renderPipelines(); // Fix: Render the pipelines UI before running them
                    console.log('Pipelines initialized:', globalState.pipelinesState.length);
                    const runningPromises = globalState.pipelinesState.map(p => runPipeline(p.id, initialIdea));

                    try {
                        await Promise.allSettled(runningPromises);
                    } finally {
                        globalState.isGenerating = false;
                        updateControlsState();
                    }
                }
            });
        }

        if (appModeSelector) {
            appModeSelector.querySelectorAll('input[name="app-mode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    globalState.currentMode = (e.target as HTMLInputElement).value as ApplicationMode;
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

        // Event delegation for dynamically created "Compare" buttons and "View The Argument" buttons
        const pipelinesContentContainer = document.getElementById('pipelines-content-container');
        if (pipelinesContentContainer) {
            pipelinesContentContainer.addEventListener('click', (event: Event) => {
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
    }

    private static initializeCustomPromptTextareas() {
        // Initialize prompts manager in routing system with references to global variables
        routingManager.initializePromptsManager(
            { current: globalState.customPromptsWebsiteState },
            { current: globalState.customPromptsDeepthinkState },
            { current: globalState.customPromptsReactState },
            { current: globalState.customPromptsAgenticState },
            { current: globalState.customPromptsAdaptiveDeepthinkState },
            { current: globalState.customPromptsContextualState }
        );

        // Set up Agentic mode with prompts manager
        const agenticPromptsManager = routingManager.getAgenticPromptsManager();
        if (agenticPromptsManager) {
            setAgenticPromptsManager(agenticPromptsManager);
        }
    }
}
