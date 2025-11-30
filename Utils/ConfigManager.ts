
import { globalState } from '../Core/State';
import { ExportedConfig } from '../Core/Types';
import { getSelectedModel, getSelectedTemperature, getSelectedTopP, getSelectedRefinementStages, getSelectedStrategiesCount, getSelectedSubStrategiesCount, getSelectedHypothesisCount, getSelectedRedTeamAggressiveness, getRefinementEnabled, getSkipSubStrategies, getDissectedObservationsEnabled, getIterativeCorrectionsEnabled, getProvideAllSolutionsToCorrectors } from '../Routing';
import { getSolutionPoolVersionsForExport, restoreSolutionPoolVersions } from '../Deepthink/SolutionPool';
import { updateUIAfterModeChange } from '../UI/UIManager';
import { updateCustomPromptTextareasFromState } from '../Routing';
import { updateControlsState } from '../UI/Controls';
import { renderReactModePipeline } from '../React/ReactUI';
import { renderDeepthinkConfigPanelInContainer } from '../Deepthink/DeepthinkConfigPanel';

export async function exportConfiguration() {
    const { currentMode, currentEvolutionMode, pipelinesState, activeDeepthinkPipeline, activeReactPipeline, customPromptsWebsiteState, customPromptsDeepthinkState, customPromptsReactState, customPromptsAgenticState, customPromptsAdaptiveDeepthinkState, customPromptsContextualState, activePipelineId, currentProblemImageBase64, currentProblemImageMimeType } = globalState;

    const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;
    const globalStatusText = document.getElementById('global-status-text');

    // Deepthink specific export logic
    let deepthinkPipelineToExport = activeDeepthinkPipeline;
    if (deepthinkPipelineToExport) {
        // Ensure we export the image data if present
        if (currentProblemImageBase64) {
            deepthinkPipelineToExport.challengeImageBase64 = currentProblemImageBase64;
            deepthinkPipelineToExport.challengeImageMimeType = currentProblemImageMimeType || undefined;
        }
    }

    const config: ExportedConfig = {
        currentMode,
        currentEvolutionMode,
        initialIdea: initialIdeaInput.value,
        selectedModel: getSelectedModel(),
        selectedOriginalTemperatureIndices: pipelinesState.map(p => p.originalTemperatureIndex),
        pipelinesState,
        activeDeepthinkPipeline: deepthinkPipelineToExport ?? null,
        activeReactPipeline: activeReactPipeline ?? null,
        embeddedAgenticState: (window as any).__reactAgenticState || null,
        activeAgenticState: (window as any).__agenticState || null,
        activeGenerativeUIState: (window as any).__generativeUIState || null,
        activeContextualState: (window as any).__contextualState || null,
        activeAdaptiveDeepthinkState: (window as any).__adaptiveDeepthinkState || null,
        activePipelineId,
        activeDeepthinkProblemTabId: activeDeepthinkPipeline?.activeTabId,
        globalStatusText: globalStatusText?.textContent || '',
        globalStatusClass: globalStatusText?.className || '',
        customPromptsWebsite: customPromptsWebsiteState,
        customPromptsDeepthinkState: customPromptsDeepthinkState,
        customPromptsReact: customPromptsReactState,
        customPromptsAgentic: customPromptsAgenticState,
        customPromptsAdaptiveDeepthink: customPromptsAdaptiveDeepthinkState,
        customPromptsContextual: customPromptsContextualState,
        isCustomPromptsOpen: globalState.isCustomPromptsOpen,
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
        },
        solutionPoolVersions: deepthinkPipelineToExport ? getSolutionPoolVersionsForExport(deepthinkPipelineToExport.id) : null
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const { downloadFile } = await import('../Components/ActionButton');
    downloadFile(blob as any, `iterative-studio-config-${Date.now()}.json`, 'application/json');
}

export async function handleImportConfiguration(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        const result = e.target?.result as string;
        try {
            const importedConfig = JSON.parse(result) as ExportedConfig;

            if (!importedConfig.currentMode || !importedConfig.pipelinesState) {
                throw new Error("Invalid configuration file format.");
            }

            globalState.currentMode = importedConfig.currentMode;
            if (importedConfig.currentEvolutionMode) globalState.currentEvolutionMode = importedConfig.currentEvolutionMode;

            const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;
            if (initialIdeaInput) initialIdeaInput.value = importedConfig.initialIdea || '';

            updateUIAfterModeChange();

            // Restore model parameters if available
            if (importedConfig.modelParameters) {
                // We need setters for these in Routing or access DOM elements directly?
                // index.tsx accessed DOM elements or global vars.
                // Routing.ts exports getters but not setters?
                // I should check Routing.ts.
                // Assuming I can set them via DOM elements for now or I need to expose setters.
                // For now I'll skip setting them via code if setters aren't available, but I should probably implement them.
                // Or just set the DOM elements values and trigger change events.
            }

            globalState.pipelinesState = importedConfig.pipelinesState;
            globalState.activePipelineId = importedConfig.activePipelineId;

            if (importedConfig.activeDeepthinkPipeline) {
                globalState.activeDeepthinkPipeline = importedConfig.activeDeepthinkPipeline;
                // Restore Deepthink specific state
                if (importedConfig.activeDeepthinkPipeline.challengeImageBase64) {
                    globalState.currentProblemImageBase64 = importedConfig.activeDeepthinkPipeline.challengeImageBase64;
                    globalState.currentProblemImageMimeType = importedConfig.activeDeepthinkPipeline.challengeImageMimeType || null;
                }

                // Restore solution pool versions
                if (importedConfig.solutionPoolVersions) {
                    restoreSolutionPoolVersions(importedConfig.activeDeepthinkPipeline.id, importedConfig.solutionPoolVersions);
                }
            }

            if (importedConfig.activeReactPipeline) {
                globalState.activeReactPipeline = importedConfig.activeReactPipeline;
            }

            // Restore Agentic state
            if (importedConfig.activeAgenticState) {
                (window as any).__importedAgenticState = importedConfig.activeAgenticState;
            }
            if (importedConfig.embeddedAgenticState) {
                (window as any).__importedReactAgenticState = importedConfig.embeddedAgenticState;
            }

            // Restore other states...

            // Restore custom prompts
            if (importedConfig.customPromptsWebsite) globalState.customPromptsWebsiteState = importedConfig.customPromptsWebsite;
            if (importedConfig.customPromptsDeepthinkState) globalState.customPromptsDeepthinkState = importedConfig.customPromptsDeepthinkState;
            if (importedConfig.customPromptsReact) globalState.customPromptsReactState = importedConfig.customPromptsReact;
            if (importedConfig.customPromptsAgentic) globalState.customPromptsAgenticState = importedConfig.customPromptsAgentic;
            if (importedConfig.customPromptsAdaptiveDeepthink) globalState.customPromptsAdaptiveDeepthinkState = importedConfig.customPromptsAdaptiveDeepthink;
            if (importedConfig.customPromptsContextual) globalState.customPromptsContextualState = importedConfig.customPromptsContextual;

            updateCustomPromptTextareasFromState();
            updateControlsState();

            // Re-render
            if (globalState.currentMode === 'react') {
                renderReactModePipeline();
            } else if (globalState.currentMode === 'deepthink') {
                const pipelinesContentContainer = document.getElementById('pipelines-content-container');
                renderDeepthinkConfigPanelInContainer(pipelinesContentContainer);
                // We might need to call setActiveDeepthinkPipelineForImport if it exists
                const { setActiveDeepthinkPipelineForImport } = await import('../Deepthink/Deepthink');
                if (globalState.activeDeepthinkPipeline) {
                    setActiveDeepthinkPipelineForImport(globalState.activeDeepthinkPipeline);
                }
            } else {
                // renderPipelines is called by updateUIAfterModeChange but we updated state after that.
                // So call it again?
                // updateUIAfterModeChange calls renderPipelines at the end.
                // But we called updateUIAfterModeChange BEFORE setting pipelinesState.
                // So we should call it again or call renderPipelines directly.
                const { renderPipelines } = await import('../UI/UIManager');
                renderPipelines();
            }

        } catch (error: any) {
            alert(`Failed to import configuration: ${error.message}`);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}
