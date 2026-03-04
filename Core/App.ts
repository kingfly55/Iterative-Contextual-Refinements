/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeDeepthinkModule, startDeepthinkAnalysisProcess } from '../Deepthink/Deepthink';
import {
    startContextualProcess
} from '../Contextual/Contextual';
import {
    startAdaptiveDeepthinkProcess
} from '../AdaptiveDeepthink/AdaptiveDeepthinkMode';
import { exportConfiguration, handleImportConfiguration } from './ConfigManager';
import { updateUIAfterModeChange, renderActiveMode } from './AppRouter';
import { initializeEvolutionConvergenceButtons } from '../Styles/Components/Sidebar/ModelParameters';
import { openDiffModal } from '../Styles/Components/DiffModal/DiffModalController';
import {
    initializeAgenticMode,
    startAgenticProcess,
    setAgenticPromptsManager,
} from '../Agentic/AgenticUI_Bridge';

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
    getIterativeDepth,
    getProvideAllSolutionsToCorrectors,
    getPostQualityFilterEnabled,
    hasValidApiKey,
    callAI,
    getProviderForCurrentModel
} from '../Routing';
import { parseJsonSafe } from './JsonParser';
import { globalState } from './State';
import { ApplicationMode } from './Types';
import { updateControlsState } from '../UI/Controls';
import { runPipeline, initPipelines } from '../Refine/WebsiteLogic';
import { LayoutController } from '../UI/LayoutController';
import { GlobalModals } from '../UI/GlobalModals';
import { setupCodeExecutionToggle } from '../UI/setupCodeExecutionToggle';

export class App {
    public static init() {
        this.initializeGlobalFunctions();
        this.initializeCoreLogic();
        LayoutController.initialize();
        GlobalModals.initialize();
    }

    private static initializeGlobalFunctions() {
    }

    private static initializeCoreLogic() {
        // Initialize routing system
        initializeRouting();

        // Refresh providers to update available models
        routingManager.refreshProviders();

        this.initializeCustomPromptTextareas();
        updateUIAfterModeChange(); // Called early to set up initial UI logic based on default mode

        // Initialize Agentic mode
        initializeAgenticMode();

        initializeEvolutionConvergenceButtons();

        // Initialize Gemini code execution toggle for Contextual mode
        setupCodeExecutionToggle();

        // Initialize deepthink module with all required dependencies
        initializeDeepthinkModule({
            getAIProvider: () => routingManager.getAIProvider(),
            callGemini: callAI,
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
            getIterativeDepth,
            getProvideAllSolutionsToCorrectors,
            getPostQualityFilterEnabled,
            getDeepthinkCodeExecutionEnabled: () => routingManager.getDeepthinkConfigController().isCodeExecutionEnabled(),
            getModelProvider: getProviderForCurrentModel,
            cleanTextOutput: (text: string) => text.trim(),
            customPromptsDeepthinkState: globalState.customPromptsDeepthinkState,
            tabsNavContainer: document.getElementById('tabs-nav-container'), // Deprecated UI dependency
            pipelinesContentContainer: document.getElementById('pipelines-content-container'), // Deprecated UI dependency
            setActiveDeepthinkPipeline: (pipeline: any) => {
                globalState.activeDeepthinkPipeline = pipeline as any;
            }
        });
        // Default to first mode if none specifically checked (e.g. after import or on fresh load)
        const appModeRadios = document.querySelectorAll('input[name="app-mode"]');
        let modeIsAlreadySet = false;
        appModeRadios.forEach(radio => {
            if ((radio as HTMLInputElement).checked) {
                globalState.currentMode = (radio as HTMLInputElement).value as ApplicationMode;
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

        // The default mode must be captured at UI level and set via globalState
        updateUIAfterModeChange();
        updateControlsState();

        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.classList.add('hidden');
        }
    }

    public static async handleGenerate(initialIdea: string) {
        console.log('Generate button clicked');
        console.log('Current mode:', globalState.currentMode);

        if (!hasValidApiKey()) {
            alert("No providers are configured. Please configure at least one AI provider using the 'Add Providers' button.");
            return;
        }

        if (!initialIdea) {
            alert("Please enter an idea, premise, or request.");
            return;
        }

        // Validate file compatibility with selected provider in Deepthink modes
        if ((globalState.currentMode === 'deepthink' || globalState.currentMode === 'adaptive-deepthink') &&
            globalState.currentProblemImages.length > 0) {

            const provider = getProviderForCurrentModel();
            const uploadedFiles = globalState.currentProblemImages;

            if (provider === 'openrouter') {
                alert("OpenRouter models do not support file uploads. Please remove all files or select a different provider.");
                return;
            }

            if (provider === 'openai' || provider === 'anthropic') {
                const supportedImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
                const unsupportedFiles = uploadedFiles.filter(f => !supportedImageTypes.includes(f.mimeType));

                if (unsupportedFiles.length > 0) {
                    const unsupportedTypes = [...new Set(unsupportedFiles.map(f => f.mimeType))].join(', ');
                    alert(`${provider.charAt(0).toUpperCase() + provider.slice(1)} only supports images (PNG, JPEG, GIF, WEBP).\n\nUnsupported file types detected: ${unsupportedTypes}\n\nPlease remove unsupported files or switch to Gemini for full file support.`);
                    return;
                }
            }
        }

        if (globalState.currentMode === 'deepthink') {
            console.log('Starting Deepthink process');
            const firstImage = globalState.currentProblemImages.length > 0 ? globalState.currentProblemImages[0] : null;
            await startDeepthinkAnalysisProcess(initialIdea, firstImage?.base64, firstImage?.mimeType);
        } else if (globalState.currentMode === 'agentic') {
            console.log('Starting Agentic process');
            try {
                await startAgenticProcess(initialIdea);
            } catch (e) {
                console.error('Error starting Agentic process:', e);
            }
        } else if (globalState.currentMode === 'contextual') {
            await startContextualProcess(initialIdea, globalState.customPromptsContextualState);
        } else if (globalState.currentMode === 'adaptive-deepthink') {
            await startAdaptiveDeepthinkProcess(initialIdea, globalState.customPromptsAdaptiveDeepthinkState, globalState.currentProblemImages);
        } else { // Website mode
            console.log('Starting Website mode');
            initPipelines();
            renderActiveMode();
            console.log('Pipelines initialized:', globalState.pipelinesState.length);
            const runningPromises = globalState.pipelinesState.map(p => runPipeline(p.id, initialIdea));

            try {
                await Promise.allSettled(runningPromises);
            } finally {
                globalState.isGenerating = false;
                updateControlsState();
            }
        }
    }

    public static handleExportConfig() {
        exportConfiguration();
    }

    public static handleImportConfig(e: Event) {
        handleImportConfiguration(e);
    }

    public static handleDiffModalClick(pipelineId: number, iterationNumber: number, contentType: 'html' | 'text') {
        openDiffModal(pipelineId, iterationNumber, contentType);
    }

    private static initializeCustomPromptTextareas() {
        routingManager.initializePromptsManager(
            { current: globalState.customPromptsWebsiteState },
            { current: globalState.customPromptsDeepthinkState },
            { current: globalState.customPromptsAgenticState },
            { current: globalState.customPromptsAdaptiveDeepthinkState },
            { current: globalState.customPromptsContextualState }
        );

        const agenticPromptsManager = routingManager.getAgenticPromptsManager();
        if (agenticPromptsManager) {
            setAgenticPromptsManager(agenticPromptsManager);
        }
    }
}
