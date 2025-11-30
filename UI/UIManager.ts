
import { globalState } from '../Core/State';
import { updateControlsState } from './Controls';
import { renderReactModePipeline } from '../React/ReactUI';
import { renderDeepthinkConfigPanelInContainer } from '../Deepthink/DeepthinkConfigPanel';
import { renderAgenticMode } from '../Agentic/Agentic';
import { renderGenerativeUIMode } from '../GenerativeUI/GenerativeUI';
import { renderContextualMode } from '../Contextual/Contextual';
import { renderAdaptiveDeepthinkMode } from '../AdaptiveDeepthink';
import { activateTab, clearTabsContainer } from './Tabs';
import { updatePipelineStatusUI, renderIteration, attachIterationEventListeners } from '../Refine/WebsiteUI';

export function updateUIAfterModeChange() {
    const { currentMode } = globalState;

    // Update radio buttons
    const appModeRadios = document.querySelectorAll('input[name="app-mode"]');
    appModeRadios.forEach(radio => {
        if ((radio as HTMLInputElement).value === currentMode) {
            (radio as HTMLInputElement).checked = true;
        }
    });

    // Update body class for mode-specific styling
    document.body.classList.remove('mode-website', 'mode-deepthink', 'mode-react', 'mode-agentic', 'mode-generativeui', 'mode-contextual', 'mode-adaptive-deepthink');
    document.body.classList.add(`mode-${currentMode}`);

    // Update header title
    const headerTitle = document.querySelector('.header-title h1');
    if (headerTitle) {
        switch (currentMode) {
            case 'website': headerTitle.textContent = 'Iterative Studio'; break;
            case 'deepthink': headerTitle.textContent = 'Deepthink'; break;
            case 'react': headerTitle.textContent = 'React Architect'; break;
            case 'agentic': headerTitle.textContent = 'Agentic Refinements'; break;
            case 'generativeui': headerTitle.textContent = 'Generative UI'; break;
            case 'contextual': headerTitle.textContent = 'Contextual Refinements'; break;
            case 'adaptive-deepthink': headerTitle.textContent = 'Adaptive Deepthink'; break;
        }
    }

    // Show/hide mode specific controls
    const websiteControls = document.getElementById('website-mode-controls');
    const deepthinkControls = document.getElementById('deepthink-mode-controls');
    const reactControls = document.getElementById('react-mode-controls');
    const agenticControls = document.getElementById('agentic-mode-controls');
    const generativeUIControls = document.getElementById('generativeui-mode-controls');
    const contextualControls = document.getElementById('contextual-mode-controls');
    const adaptiveDeepthinkControls = document.getElementById('adaptive-deepthink-mode-controls');

    if (websiteControls) websiteControls.style.display = currentMode === 'website' ? 'block' : 'none';
    if (deepthinkControls) deepthinkControls.style.display = currentMode === 'deepthink' ? 'block' : 'none';
    if (reactControls) reactControls.style.display = currentMode === 'react' ? 'block' : 'none';
    if (agenticControls) agenticControls.style.display = currentMode === 'agentic' ? 'block' : 'none';
    if (generativeUIControls) generativeUIControls.style.display = currentMode === 'generativeui' ? 'block' : 'none';
    if (contextualControls) contextualControls.style.display = currentMode === 'contextual' ? 'block' : 'none';
    if (adaptiveDeepthinkControls) adaptiveDeepthinkControls.style.display = currentMode === 'adaptive-deepthink' ? 'block' : 'none';

    // Update main content area
    const pipelinesContentContainer = document.getElementById('pipelines-content-container');
    const tabsNavContainer = document.getElementById('tabs-nav-container');

    if (pipelinesContentContainer && tabsNavContainer) {
        if (currentMode === 'deepthink') {
            renderDeepthinkConfigPanelInContainer();
        } else if (currentMode === 'react') {
            renderReactModePipeline();
        } else if (currentMode === 'agentic') {
            renderAgenticMode();
        } else if (currentMode === 'generativeui') {
            renderGenerativeUIMode();
        } else if (currentMode === 'contextual') {
            renderContextualMode();
        } else if (currentMode === 'adaptive-deepthink') {
            renderAdaptiveDeepthinkMode();
        } else {
            renderPipelines();
        }
    }

    updateControlsState();
}

export function renderPipelines() {
    const { currentMode, pipelinesState, activePipelineId } = globalState;
    const tabsNavContainer = document.getElementById('tabs-nav-container');
    const pipelinesContentContainer = document.getElementById('pipelines-content-container');

    if (currentMode !== 'website' || !tabsNavContainer || !pipelinesContentContainer) {
        if (currentMode !== 'website' && tabsNavContainer && pipelinesContentContainer) {
            clearTabsContainer();
            pipelinesContentContainer.innerHTML = '';
        }
        return;
    }

    clearTabsContainer();
    pipelinesContentContainer.innerHTML = '';

    if (pipelinesState.length === 0) {
        pipelinesContentContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><span class="material-symbols-outlined">lightbulb</span></div>
                <h3>Ready to Create</h3>
                <p>Enter your idea above and click "Generate" to start the iterative refinement process.</p>
            </div>
        `;
        return;
    }

    pipelinesState.forEach(pipeline => {
        const tabButton = document.createElement('button');
        tabButton.id = `pipeline-tab-${pipeline.id}`;
        tabButton.className = `tab-button status-${pipeline.status}`;
        tabButton.innerHTML = `<span class="tab-label">Pipeline ${pipeline.id + 1}</span><span class="tab-model-badge">${pipeline.modelName}</span>`;
        if (pipeline.id === activePipelineId) tabButton.classList.add('active');
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-controls', `pipeline-content-${pipeline.id}`);
        tabButton.setAttribute('aria-selected', (pipeline.id === activePipelineId).toString());
        tabButton.addEventListener('click', () => activateTab(pipeline.id));
        tabsNavContainer.appendChild(tabButton);
        pipeline.tabButtonElement = tabButton;

        const contentPane = document.createElement('div');
        contentPane.id = `pipeline-content-${pipeline.id}`;
        contentPane.className = `pipeline-content ${pipeline.id === activePipelineId ? 'active' : ''}`;
        contentPane.setAttribute('role', 'tabpanel');
        contentPane.setAttribute('aria-labelledby', `pipeline-tab-${pipeline.id}`);

        const header = document.createElement('div');
        header.className = 'pipeline-header';
        header.innerHTML = `
            <div class="pipeline-info">
                <h3>Pipeline ${pipeline.id + 1}</h3>
                <span class="pipeline-meta">Model: ${pipeline.modelName} • Temp: ${pipeline.temperature}</span>
            </div>
            <div class="pipeline-actions">
                <span id="pipeline-status-text-${pipeline.id}" class="pipeline-status status-badge status-${pipeline.status}">${pipeline.status}</span>
                <button id="stop-btn-${pipeline.id}" class="button stop-button" style="display: none;">
                    <span class="material-symbols-outlined">stop_circle</span>
                    <span class="button-text">Stop</span>
                </button>
            </div>
        `;
        contentPane.appendChild(header);

        const stopBtn = header.querySelector(`#stop-btn-${pipeline.id}`) as HTMLButtonElement;
        if (stopBtn) {
            pipeline.stopButtonElement = stopBtn;
            stopBtn.addEventListener('click', () => {
                if (pipeline.status === 'running') {
                    pipeline.isStopRequested = true;
                    pipeline.status = 'stopping';
                    updatePipelineStatusUI(pipeline.id, 'stopping');
                }
            });
        }

        const iterationsList = document.createElement('ul');
        iterationsList.className = 'iterations-list';
        iterationsList.id = `iterations-list-${pipeline.id}`;
        contentPane.appendChild(iterationsList);

        pipeline.iterations.forEach(iter => {
            const iterHtml = renderIteration(pipeline.id, iter);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = iterHtml;
            if (tempDiv.firstElementChild) {
                iterationsList.appendChild(tempDiv.firstElementChild);
                attachIterationEventListeners(pipeline.id, iter.iterationNumber);
            }
        });

        pipelinesContentContainer.appendChild(contentPane);
        pipeline.contentElement = contentPane;
    });

    updatePipelineStatusUI(globalState.activePipelineId || 0, pipelinesState.find(p => p.id === globalState.activePipelineId)?.status || 'idle');
}
