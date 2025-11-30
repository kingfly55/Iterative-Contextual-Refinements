
import { globalState } from '../Core/State';
import { hasValidApiKey, routingManager } from '../Routing';

export function updateControlsState() {
    const { pipelinesState, activeDeepthinkPipeline, activeReactPipeline, currentMode } = globalState;

    const anyPipelineRunningOrStopping = pipelinesState.some(p => p.status === 'running' || p.status === 'stopping');
    const deepthinkPipelineRunningOrStopping = activeDeepthinkPipeline?.status === 'processing' || activeDeepthinkPipeline?.status === 'stopping';
    const reactPipelineRunningOrStopping = activeReactPipeline?.status === 'orchestrating' || activeReactPipeline?.status === 'agentic_orchestrating' || activeReactPipeline?.status === 'processing_workers' || activeReactPipeline?.status === 'stopping';
    const agenticRunning = globalState.isAgenticRunning;
    const generativeUIRunning = globalState.isGenerativeUIRunning;
    const contextualRunning = globalState.isContextualRunning;
    const adaptiveDeepthinkRunning = globalState.isAdaptiveDeepthinkRunning;

    globalState.isGenerating = anyPipelineRunningOrStopping || deepthinkPipelineRunningOrStopping || reactPipelineRunningOrStopping || agenticRunning || generativeUIRunning || contextualRunning || adaptiveDeepthinkRunning;

    const isApiKeyReady = hasValidApiKey();

    const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
    if (generateButton) {
        let disabled = globalState.isGenerating || !isApiKeyReady;
        if (!disabled) {
            // Mode specific gating if needed
        }
        generateButton.disabled = disabled;
    }

    const exportConfigButton = document.getElementById('export-config-button') as HTMLButtonElement;
    const importConfigInput = document.getElementById('import-config-input') as HTMLInputElement;
    const importConfigLabel = document.getElementById('import-config-label') as HTMLLabelElement;
    const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;

    if (exportConfigButton) exportConfigButton.disabled = globalState.isGenerating;
    if (importConfigInput) importConfigInput.disabled = globalState.isGenerating;
    if (importConfigLabel) importConfigLabel.classList.toggle('disabled', globalState.isGenerating);
    if (initialIdeaInput) initialIdeaInput.disabled = globalState.isGenerating;

    // Model controls are now managed by routing system
    // Disable red team buttons during generation
    const redTeamButtons = document.querySelectorAll('.red-team-button');
    redTeamButtons.forEach(button => {
        (button as HTMLButtonElement).disabled = globalState.isGenerating;
    });

    // Disable sliders during generation
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        (slider as HTMLInputElement).disabled = globalState.isGenerating;
    });

    // Disable toggles during generation
    const toggles = document.querySelectorAll('input[type="checkbox"]:not([id*="pipeline"])');
    toggles.forEach(toggle => {
        (toggle as HTMLInputElement).disabled = globalState.isGenerating;
    });

    // Update prompts modal state through routing system
    routingManager.updatePromptsModalState(globalState.isGenerating);

    // Block sidebar content during generation
    const sidebarContent = document.querySelector('#controls-sidebar .sidebar-content');
    if (sidebarContent) {
        (sidebarContent as HTMLElement).style.pointerEvents = globalState.isGenerating ? 'none' : 'auto';
        (sidebarContent as HTMLElement).style.opacity = globalState.isGenerating ? '0.6' : '1';
    }

    // Disable providers and prompts buttons
    const providersButton = document.getElementById('add-providers-trigger');
    if (providersButton) {
        (providersButton as HTMLButtonElement).disabled = globalState.isGenerating;
    }
    const promptsButton = document.getElementById('prompts-trigger');
    if (promptsButton) {
        (promptsButton as HTMLButtonElement).disabled = globalState.isGenerating;
    }
}
