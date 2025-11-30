
import { globalState } from '../Core/State';
import { IterationData, PipelineState } from '../Core/Types';
import { renderMathContent } from '../Components/RenderMathMarkdown';
import { openDiffModal } from '../Components/DiffModal/DiffModalController';
import { escapeHtml, isEmptyOrPlaceholderHtml } from '../Utils/DOMHelpers';
import { isHtmlContent } from '../Parsing';
import { updateControlsState } from '../UI/Controls';

const MAX_RETRIES = 3;

import { getEmptyStateMessage } from '../UI/CommonUI';
import { renderActiveDeepthinkPipeline, activateDeepthinkStrategyTab } from '../Deepthink/Deepthink';
import { renderDeepthinkConfigPanelInContainer } from '../Deepthink/DeepthinkConfigPanel';
import { renderAgenticMode } from '../Agentic/Agentic';
import { renderGenerativeUIMode } from '../GenerativeUI/GenerativeUI';
import { renderContextualMode } from '../Contextual/Contextual';
import { renderAdaptiveDeepthinkMode } from '../AdaptiveDeepthink/AdaptiveDeepthinkMode';
import { renderReactModePipeline } from '../React/ReactUI';
import { routingManager } from '../Routing';
import { cleanupAdaptiveDeepthinkMode } from '../AdaptiveDeepthink/AdaptiveDeepthinkMode';
import { cleanupGenerativeUIMode } from '../GenerativeUI/GenerativeUI';
import { cleanupAgenticMode } from '../Agentic/Agentic';
import { stopContextualProcess } from '../Contextual/Contextual';

// DOM Elements Helpers
const getPipelinesContentContainer = () => document.getElementById('pipelines-content-container') as HTMLElement;
const getTabsNavContainer = () => document.getElementById('tabs-nav-container') as HTMLElement;
const getMainHeaderContent = () => document.querySelector('.main-header-content') as HTMLElement;
const getSidebarCollapseButton = () => document.getElementById('sidebar-collapse-button') as HTMLButtonElement;
const getInitialIdeaInput = () => document.getElementById('initial-idea') as HTMLTextAreaElement;
const getAppModeSelector = () => document.getElementById('app-mode-selector') as HTMLElement;
const getInitialIdeaLabel = () => document.querySelector('label[for="initial-idea"]') as HTMLElement;
const getGenerateButton = () => document.getElementById('generate-button') as HTMLButtonElement;
const getModelSelectionContainer = () => document.getElementById('model-selection-container') as HTMLElement;
const getModelParametersContainer = () => document.getElementById('model-parameters-container') as HTMLElement;
const getApiCallIndicator = () => document.querySelector('.api-call-indicator') as HTMLElement;


export function renderIteration(pipelineId: number, iter: IterationData): string {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return '';

    let displayStatusText: string = iter.status.charAt(0).toUpperCase() + iter.status.slice(1);
    if (iter.status === 'retrying' && iter.retryAttempt !== undefined) {
        displayStatusText = `Retrying (${iter.retryAttempt}/${MAX_RETRIES})...`;
    } else if (iter.status === 'error') displayStatusText = 'Error';
    else if (iter.status === 'cancelled') displayStatusText = 'Cancelled';

    let promptsContent = '';
    if (globalState.currentMode === 'website') {
        if (iter.requestPromptContent_InitialGenerate) promptsContent += `<h6 class="prompt-title">Initial Generation Prompt:</h6>${renderMathContent(iter.requestPromptContent_InitialGenerate)}`;
        if (iter.requestPromptContent_FeatureImplement) promptsContent += `<h6 class="prompt-title">Feature Implementation & Stabilization Prompt:</h6>${renderMathContent(iter.requestPromptContent_FeatureImplement)}`;
        if (iter.requestPromptContent_BugFix) promptsContent += `<h6 class="prompt-title">HTML Bug Fix/Polish & Completion Prompt:</h6>${renderMathContent(iter.requestPromptContent_BugFix)}`;
        if (iter.requestPromptFeatures_Suggest) promptsContent += `<h6 class="prompt-title">Feature Suggestion Prompt:</h6>${renderMathContent(iter.requestPromptFeatures_Suggest)}`;
    }
    const promptsHtml = ''; // For refine mode (website mode), don't show the "Used Prompts" toggle

    let generatedOutputHtml = '';

    if (globalState.currentMode === 'website') {
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
    if (globalState.currentMode === 'website' && suggestionsToDisplay && suggestionsToDisplay.trim() !== '') {
        const title = "Feature Suggestions";
        suggestionsHtml = `<div class="model-detail-section">
            <h5 class="model-section-title">${title}</h5>
            <div class="feature-suggestions-container">
                ${renderMathContent(suggestionsToDisplay)}
            </div>
        </div>`;
    }

    let previewHtml = '';
    if (globalState.currentMode === 'website') {
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
                    const blob = new Blob([iter.generatedContent], { type: 'text/html' });
                    const blobUrl = URL.createObjectURL(blob);
                    iframe.src = blobUrl;
                    iframe.addEventListener('load', () => {
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                    });
                }
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

    const gridLayoutClass = globalState.currentMode === 'website' ? 'iteration-grid-website' : 'iteration-grid-standard';

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

export function attachIterationEventListeners(pipelineId: number, iterationNumber: number) {
    setTimeout(() => {
        const fullscreenBtn = document.getElementById(`fullscreen-btn-${pipelineId}-${iterationNumber}`);
        if (fullscreenBtn && !fullscreenBtn.hasAttribute('data-listener-attached')) {
            fullscreenBtn.setAttribute('data-listener-attached', 'true');
            fullscreenBtn.onclick = async () => {
                const { openLivePreviewFullscreen } = await import('../Components/ActionButton');
                const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
                const iter = pipeline?.iterations.find(it => it.iterationNumber === iterationNumber);
                const html = iter?.generatedContent;
                if (html) {
                    openLivePreviewFullscreen(html);
                }
            };
        }

        const compareBtn = document.querySelector(`[data-pipeline-id="${pipelineId}"][data-iteration-number="${iterationNumber}"]`) as HTMLButtonElement;
        if (compareBtn && !compareBtn.hasAttribute('data-listener-attached')) {
            compareBtn.setAttribute('data-listener-attached', 'true');
            compareBtn.onclick = () => {
                openDiffModal(pipelineId, iterationNumber, 'html');
            };
        }
    }, 0);
}

export function updateIterationUI(pipelineId: number, iterationIndex: number) {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline || !pipeline.iterations[iterationIndex]) return;

    const iter = pipeline.iterations[iterationIndex];
    const iterationElement = document.getElementById(`iteration-${pipelineId}-${iter.iterationNumber}`);

    if (iterationElement) {
        const newHtml = renderIteration(pipelineId, iter);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const newElement = tempDiv.firstElementChild;

        if (newElement && iterationElement.parentNode) {
            iterationElement.parentNode.replaceChild(newElement, iterationElement);
            attachIterationEventListeners(pipelineId, iter.iterationNumber);
        }
    }
}

export function updatePipelineStatusUI(pipelineId: number, status: PipelineState['status']) {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.status = status;

    const statusTextElement = document.getElementById(`pipeline-status-text-${pipelineId}`);
    if (statusTextElement) {
        statusTextElement.textContent = status;
        statusTextElement.className = `pipeline-status status-badge status-${status}`;
    }
    if (pipeline.tabButtonElement) {
        pipeline.tabButtonElement.className = `tab-button status-${status}`;
        if (pipeline.id === globalState.activePipelineId) pipeline.tabButtonElement.classList.add('active');
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

export function clearTabsContainer() {
    const tabsNavContainer = getTabsNavContainer();
    if (tabsNavContainer) tabsNavContainer.innerHTML = '';
}

export function setDeepthinkControlsVisible(visible: boolean) {
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

export function setRefineControlsVisible(visible: boolean) {
    const display = visible ? '' : 'none';
    const refineStagesGroup = document.getElementById('refinement-stages-slider')?.closest('.input-group-tight') as HTMLElement | null;
    const evolutionConvergenceContainer = document.querySelector('.evolution-convergence-container') as HTMLElement | null;

    if (refineStagesGroup) refineStagesGroup.style.display = display;
    if (evolutionConvergenceContainer) evolutionConvergenceContainer.style.display = display;
}

export function initializeEvolutionConvergenceButtons() {
    const buttons = document.querySelectorAll('.evolution-convergence-button');
    buttons.forEach(button => {
        button.addEventListener('click', (e) => {
            const target = e.currentTarget as HTMLElement;
            const value = target.dataset.value as 'off' | 'novelty' | 'quality';

            // Update state
            globalState.currentEvolutionMode = value;

            // Update UI
            buttons.forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');

            // Update description
            updateEvolutionModeDescription(value);
        });
    });

    // Initialize description
    updateEvolutionModeDescription(globalState.currentEvolutionMode);
}

export function updateEvolutionModeDescription(mode: 'off' | 'novelty' | 'quality') {
    const descriptionElement = document.getElementById('evolution-mode-description');
    if (!descriptionElement) return;

    let descriptionText = '';
    switch (mode) {
        case 'off':
            descriptionText = 'Standard refinement. Each iteration builds directly on the previous one.';
            break;
        case 'novelty':
            descriptionText = 'Explores different approaches. If an iteration is too similar to previous ones, it retries with higher temperature.';
            break;
        case 'quality':
            descriptionText = 'Ensures improvement. If an iteration doesn\'t improve the score, it retries with higher temperature.';
            break;
    }

    descriptionElement.innerHTML = descriptionText;
}

export function activateTab(idToActivate: string | number) {
    if (globalState.currentMode === 'deepthink' && globalState.activeDeepthinkPipeline) {
        globalState.activeDeepthinkPipeline.activeTabId = idToActivate as string;
        // Deactivate all deepthink tabs and panes
        document.querySelectorAll('#tabs-nav-container .tab-button.deepthink-mode-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => pane.classList.remove('active'));

        // Activate the correct one
        const tabButton = document.getElementById(`deepthink-tab-${idToActivate}`);
        const contentPane = document.getElementById(`pipeline-content-${idToActivate}`);
        if (tabButton) tabButton.classList.add('active');
        if (contentPane) contentPane.classList.add('active');

        if (idToActivate === 'strategic-solver' && globalState.activeDeepthinkPipeline.initialStrategies.length > 0) {
            activateDeepthinkStrategyTab(globalState.activeDeepthinkPipeline.activeStrategyTab ?? 0);
        }

    } else if (globalState.currentMode === 'react' && globalState.activeReactPipeline) {
        globalState.activeReactPipeline.activeTabId = idToActivate as string;
        document.querySelectorAll('#tabs-nav-container .tab-button.react-mode-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => pane.classList.remove('active'));

        const tabButton = document.getElementById(`react-tab-${idToActivate}`);
        const contentPane = document.getElementById(`pipeline-content-${idToActivate}`);
        if (tabButton) tabButton.classList.add('active');
        if (contentPane) contentPane.classList.add('active');

        // Rehydrate the agentic UI if switching to agentic-refinements tab
        if (idToActivate === 'agentic-refinements' && contentPane) {
            import('../React/ReactAgenticIntegration').then(({ rehydrateReactAgenticUI, setActiveReactAgenticStateForImport }) => {
                // If we have imported state, restore it first
                if ((window as any).__importedReactAgenticState) {
                    setActiveReactAgenticStateForImport((window as any).__importedReactAgenticState);
                    (window as any).__importedReactAgenticState = null;
                }
                const agenticContainer = contentPane.querySelector('#agentic-refinements-container') as HTMLElement;
                if (agenticContainer) {
                    rehydrateReactAgenticUI(agenticContainer);
                }
            }).catch(() => {
                // Removed console.error
            });
        }
    } else if (globalState.currentMode !== 'deepthink' && globalState.currentMode !== 'react') {
        globalState.activePipelineId = idToActivate as number;
        document.querySelectorAll('#tabs-nav-container .tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.id === `pipeline-tab-${globalState.activePipelineId}`);
            btn.setAttribute('aria-selected', (btn.id === `pipeline-tab-${globalState.activePipelineId}`).toString());
        });
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => {
            pane.classList.toggle('active', pane.id === `pipeline-content-${globalState.activePipelineId}`);
        });
    }
}

export function renderPipelines() {
    (window as any).pipelinesState = globalState.pipelinesState;

    const mainHeaderContent = getMainHeaderContent();
    const sidebarCollapseButton = getSidebarCollapseButton();
    const tabsNavContainer = getTabsNavContainer();
    const pipelinesContentContainer = getPipelinesContentContainer();

    if (globalState.currentMode === 'agentic') {
        // Show header and tabs for agentic mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        if (tabsNavContainer) tabsNavContainer.style.display = '';

        // Re-enable sidebar collapse
        if (sidebarCollapseButton) {
            sidebarCollapseButton.disabled = false;
            sidebarCollapseButton.style.opacity = '';
            sidebarCollapseButton.style.cursor = '';
            sidebarCollapseButton.title = 'Collapse Sidebar';
        }

        renderAgenticMode();
        return;
    } else if (globalState.currentMode === 'generativeui') {
        // Show header and tabs for generativeui mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        if (tabsNavContainer) tabsNavContainer.style.display = '';

        // Re-enable sidebar collapse
        if (sidebarCollapseButton) {
            sidebarCollapseButton.disabled = false;
            sidebarCollapseButton.style.opacity = '';
            sidebarCollapseButton.style.cursor = '';
            sidebarCollapseButton.title = 'Collapse Sidebar';
        }

        renderGenerativeUIMode();
        return;
    } else if (globalState.currentMode === 'contextual') {
        // Contextual mode doesn't use header/tabs - they're hidden in renderContextualMode

        // Re-enable sidebar collapse
        if (sidebarCollapseButton) {
            sidebarCollapseButton.disabled = false;
            sidebarCollapseButton.style.opacity = '';
            sidebarCollapseButton.style.cursor = '';
            sidebarCollapseButton.title = 'Collapse Sidebar';
        }

        renderContextualMode();
        return;
    } else if (globalState.currentMode === 'adaptive-deepthink') {
        // Adaptive Deepthink mode doesn't use header/tabs - they're hidden in renderAdaptiveDeepthinkMode

        // Re-enable sidebar collapse
        if (sidebarCollapseButton) {
            sidebarCollapseButton.disabled = false;
            sidebarCollapseButton.style.opacity = '';
            sidebarCollapseButton.style.cursor = '';
            sidebarCollapseButton.title = 'Collapse Sidebar';
        }

        renderAdaptiveDeepthinkMode();
        return;
    } else if (globalState.currentMode === 'deepthink') {
        // Clear containers first
        clearTabsContainer();
        if (pipelinesContentContainer) pipelinesContentContainer.innerHTML = '';
        // Render deepthink UI if there's an active pipeline, otherwise show config panel
        if (globalState.activeDeepthinkPipeline) {
            // Show header and tabs when there's an active pipeline
            if (mainHeaderContent) mainHeaderContent.style.display = '';
            if (tabsNavContainer) tabsNavContainer.style.display = '';

            // Re-enable sidebar collapse button
            if (sidebarCollapseButton) {
                sidebarCollapseButton.disabled = false;
                sidebarCollapseButton.style.opacity = '';
                sidebarCollapseButton.style.cursor = '';
                sidebarCollapseButton.title = 'Collapse Sidebar';
            }

            renderActiveDeepthinkPipeline();
        } else {
            // Hide header for config panel (done inside renderDeepthinkConfigPanelInContainer)
            // Hide tabs for config panel
            if (tabsNavContainer) tabsNavContainer.style.display = 'none';
            if (pipelinesContentContainer) renderDeepthinkConfigPanelInContainer(pipelinesContentContainer);
        }
        return;
    } else if (globalState.currentMode === 'react') {
        // Show header for react mode
        if (mainHeaderContent) mainHeaderContent.style.display = '';
        if (tabsNavContainer) tabsNavContainer.style.display = ''; // Ensure tabs are visible

        // Re-enable sidebar collapse
        if (sidebarCollapseButton) {
            sidebarCollapseButton.disabled = false;
            sidebarCollapseButton.style.opacity = '';
            sidebarCollapseButton.style.cursor = '';
            sidebarCollapseButton.title = 'Collapse Sidebar';
        }

        clearTabsContainer();
        if (pipelinesContentContainer) pipelinesContentContainer.innerHTML = '';
        return;
    }

    // Show header and tabs container for other modes (website, etc.)
    if (mainHeaderContent) mainHeaderContent.style.display = '';
    if (tabsNavContainer) tabsNavContainer.style.display = '';

    // Re-enable sidebar collapse for website/refine mode
    if (sidebarCollapseButton) {
        sidebarCollapseButton.disabled = false;
        sidebarCollapseButton.style.opacity = '';
        sidebarCollapseButton.style.cursor = '';
        sidebarCollapseButton.title = 'Collapse Sidebar';
    }

    clearTabsContainer();
    if (pipelinesContentContainer) pipelinesContentContainer.innerHTML = '';


    // Check if there are any pipelines
    globalState.pipelinesState.forEach((pipeline, index) => {
        const tabButton = document.createElement('button');
        tabButton.className = 'tab-button';
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-selected', (pipeline.id === globalState.activePipelineId).toString());
        tabButton.textContent = `Pipeline ${index + 1}`;
        tabButton.setAttribute('id', `pipeline-tab-${pipeline.id}`);
        tabButton.addEventListener('click', () => activateTab(pipeline.id));
        if (tabsNavContainer) tabsNavContainer.appendChild(tabButton);
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
        if (pipelinesContentContainer) pipelinesContentContainer.appendChild(pipelineContentDiv);
        pipeline.contentElement = pipelineContentDiv;

        // Stop button is now part of the iteration card header during processing
        updatePipelineStatusUI(pipeline.id, pipeline.status);


    });

    // Add View Evolution button at the absolute right
    // Always show button if there are pipelines (even during processing)
    if (globalState.pipelinesState.length > 0 && tabsNavContainer) {
        const resolvePipelineForEvolution = () => {
            const activePipeline = globalState.activePipelineId
                ? globalState.pipelinesState.find((p) => p.id === globalState.activePipelineId)
                : null;
            if (activePipeline) return activePipeline;

            const firstWithIterations = globalState.pipelinesState.find((p) => p.iterations && p.iterations.length > 0);
            return firstWithIterations ?? globalState.pipelinesState[0];
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
            const { openEvolutionViewer } = await import('../Components/DiffModal/EvolutionViewer');
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

export function updateUIAfterModeChange() {
    // Update prompts modal mode through routing system
    routingManager.setCurrentMode(globalState.currentMode);

    // Visibility of prompt containers is now handled by routing system
    const allPromptContainers = document.querySelectorAll('.prompts-mode-container');
    allPromptContainers.forEach(container => container.classList.remove('active'));
    const activeContainer = document.getElementById(`${globalState.currentMode}-prompts-container`);
    if (activeContainer) activeContainer.classList.add('active');

    // Reinitialize sidebar controls after mode change
    setTimeout(() => {
        if ((window as any).reinitializeSidebarControls) {
            (window as any).reinitializeSidebarControls();
        }
    }, 100);

    const modelSelectionContainer = getModelSelectionContainer();
    const modelParametersContainer = getModelParametersContainer();
    const apiCallIndicator = getApiCallIndicator();
    const initialIdeaLabel = getInitialIdeaLabel();
    const initialIdeaInput = getInitialIdeaInput();
    const generateButton = getGenerateButton();
    const generateButtonText = generateButton?.querySelector('.button-text');

    // Default UI states
    if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
    if (modelParametersContainer) modelParametersContainer.style.display = 'flex';

    if (globalState.currentMode === 'website') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Iteratively Refine:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Python Code For Array Sorting Using Cross Products", "An e-commerce site for handmade crafts"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate & Refine';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(true);
    } else if (globalState.currentMode === 'deepthink') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Core Challenge:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Design a sustainable urban transportation system", "Analyze the impact of remote work on company culture"...';
        if (generateButtonText) generateButtonText.textContent = 'Deepthink';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'flex';
        setDeepthinkControlsVisible(true);
        setRefineControlsVisible(false);
    } else if (globalState.currentMode === 'react') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'React App Request:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "A simple to-do list app with local storage persistence", "A weather dashboard using OpenWeatherMap API"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate React App';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (globalState.currentMode === 'agentic') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Content to Refine:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'Enter text, code, data report, or any content you want the agent to iteratively refine...';
        if (generateButtonText) generateButtonText.textContent = 'Generate & Refine';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (globalState.currentMode === 'generativeui') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'UI Query:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Create a dashboard to track my project tasks with statuses for to-do, in-progress, and done"...';
        if (generateButtonText) generateButtonText.textContent = 'Generate Interface';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (globalState.currentMode === 'contextual') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Initial User Request:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Write a comprehensive guide on machine learning basics", "Create a detailed business plan for a coffee shop"...';
        if (generateButtonText) generateButtonText.textContent = 'Start Contextual Refinement';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    } else if (globalState.currentMode === 'adaptive-deepthink') {
        if (initialIdeaLabel) initialIdeaLabel.textContent = 'Core Challenge:';
        if (initialIdeaInput) initialIdeaInput.placeholder = 'E.g., "Solve this mathematical problem", "Design a scalable database architecture", "Analyze this complex scenario"...';
        if (generateButtonText) generateButtonText.textContent = 'Adaptive Deepthink';
        if (modelSelectionContainer) modelSelectionContainer.style.display = 'flex';
        if (modelParametersContainer) modelParametersContainer.style.display = 'flex';
        if (apiCallIndicator) apiCallIndicator.style.display = 'none';
        setDeepthinkControlsVisible(false);
        setRefineControlsVisible(false);
    }

    // Update mode selector UI
    const appModeSelector = getAppModeSelector();
    if (appModeSelector) {
        appModeSelector.querySelectorAll('.mode-option').forEach(option => {
            if (option.getAttribute('data-value') === globalState.currentMode) {
                option.classList.add('active');
            } else {
                option.classList.remove('active');
            }
        });
    }

    // Update Evolution Convergence description if in website mode
    if (globalState.currentMode === 'website') {
        updateEvolutionModeDescription(globalState.currentEvolutionMode);
    }

    // Handle mode-specific cleanup/initialization
    if (!globalState.isGenerating) {
        globalState.pipelinesState = [];
        globalState.activeReactPipeline = null;
        if (globalState.currentMode === 'agentic') {
            cleanupAgenticMode();
        } else if (globalState.currentMode === 'generativeui') {
            cleanupGenerativeUIMode();
        } else if (globalState.currentMode === 'contextual') {
            stopContextualProcess();
        } else if (globalState.currentMode === 'adaptive-deepthink') {
            cleanupAdaptiveDeepthinkMode();
        }
    }

    // Render pipelines or appropriate UI for the mode
    renderPipelines();

    // If in React mode, also render the React pipeline if it exists
    if (globalState.currentMode === 'react' && globalState.activeReactPipeline) {
        renderReactModePipeline();
    }
}
