
import { globalState } from '../Core/State';
import { activateDeepthinkStrategyTab } from '../Deepthink/Deepthink';

export function activateTab(idToActivate: string | number) {
    const { currentMode, activeDeepthinkPipeline, activeReactPipeline } = globalState;

    if (currentMode === 'deepthink' && activeDeepthinkPipeline) {
        activeDeepthinkPipeline.activeTabId = idToActivate as string;
        document.querySelectorAll('#tabs-nav-container .tab-button.deepthink-mode-tab').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#pipelines-content-container > .pipeline-content').forEach(pane => pane.classList.remove('active'));

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

        if (idToActivate === 'agentic-refinements' && contentPane) {
            import('../React/ReactAgenticIntegration').then(({ rehydrateReactAgenticUI, setActiveReactAgenticStateForImport }) => {
                if ((window as any).__importedReactAgenticState) {
                    setActiveReactAgenticStateForImport((window as any).__importedReactAgenticState);
                    (window as any).__importedReactAgenticState = null;
                }
                const agenticContainer = contentPane.querySelector('#agentic-refinements-container') as HTMLElement;
                if (agenticContainer) {
                    rehydrateReactAgenticUI(agenticContainer);
                }
            }).catch(err => {
                console.error('Failed to rehydrate React agentic UI:', err);
            });
        }
    } else if (currentMode !== 'deepthink' && currentMode !== 'react') {
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

export function clearTabsContainer() {
    const tabsNavContainer = document.getElementById('tabs-nav-container');
    if (tabsNavContainer) {
        tabsNavContainer.innerHTML = '';
    }
}
