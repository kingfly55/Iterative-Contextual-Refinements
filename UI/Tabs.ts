import { globalState } from '../Core/State';
import { ApplicationMode } from '../Core/Types';
import { activateDeepthinkStrategyTab } from '../Deepthink/Deepthink';

export function getTabsNavContainer(): HTMLElement | null {
    return document.getElementById('tabs-nav-container');
}

export function getPipelinesContentContainer(): HTMLElement | null {
    return document.getElementById('pipelines-content-container');
}

export function getDeepthinkTabButton(id: string | number): HTMLElement | null {
    return document.getElementById(`deepthink-tab-${id}`);
}

export function getPipelineTabButton(id: number): HTMLElement | null {
    return document.getElementById(`pipeline-tab-${id}`);
}

export function getPipelineContentPane(id: string | number): HTMLElement | null {
    return document.getElementById(`pipeline-content-${id}`);
}

export function getAllTabButtons(selector: string): NodeListOf<Element> {
    return document.querySelectorAll(selector);
}

export function getAllPipelinePanes(): NodeListOf<Element> {
    return document.querySelectorAll('#pipelines-content-container > .pipeline-content');
}

export function getCurrentMode(): ApplicationMode {
    return globalState.currentMode;
}

export function getActiveDeepthinkPipeline() {
    return globalState.activeDeepthinkPipeline;
}

export function getActivePipelineId(): number | null {
    return globalState.activePipelineId;
}

export function setActivePipelineId(id: number): void {
    globalState.activePipelineId = id;
}

export function setActiveDeepthinkTabId(id: string): void {
    if (globalState.activeDeepthinkPipeline) {
        globalState.activeDeepthinkPipeline.activeTabId = id;
    }
}

export function activateTab(idToActivate: string | number): void {
    const currentMode = getCurrentMode();
    const activeDeepthinkPipeline = getActiveDeepthinkPipeline();

    if (currentMode === 'deepthink' && activeDeepthinkPipeline) {
        setActiveDeepthinkTabId(idToActivate as string);
        
        getAllTabButtons('#tabs-nav-container .tab-button.deepthink-mode-tab').forEach(btn => btn.classList.remove('active'));
        getAllPipelinePanes().forEach(pane => pane.classList.remove('active'));

        const tabButton = getDeepthinkTabButton(idToActivate);
        const contentPane = getPipelineContentPane(idToActivate);
        if (tabButton) tabButton.classList.add('active');
        if (contentPane) contentPane.classList.add('active');

        if (idToActivate === 'strategic-solver' && activeDeepthinkPipeline.initialStrategies.length > 0) {
            activateDeepthinkStrategyTab(activeDeepthinkPipeline.activeStrategyTab ?? 0);
        }

    } else if (currentMode !== 'deepthink') {
        setActivePipelineId(idToActivate as number);
        const activePipelineId = getActivePipelineId();
        
        getAllTabButtons('#tabs-nav-container .tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.id === `pipeline-tab-${activePipelineId}`);
            btn.setAttribute('aria-selected', (btn.id === `pipeline-tab-${activePipelineId}`).toString());
        });
        getAllPipelinePanes().forEach(pane => {
            pane.classList.toggle('active', pane.id === `pipeline-content-${activePipelineId}`);
        });
    }
}

export function clearTabsContainer(): void {
    const tabsNavContainer = getTabsNavContainer();
    if (tabsNavContainer) {
        tabsNavContainer.innerHTML = '';
    }
}
