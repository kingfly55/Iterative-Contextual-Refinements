/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { globalState } from './State';
import { routingManager } from '../Routing';
import {
    renderActiveDeepthinkPipeline,
    activateDeepthinkStrategyTab,
    cleanupQuotaBackoff
} from '../Deepthink/Deepthink';
import { renderDeepthinkConfigPanelInContainer } from '../Deepthink/DeepthinkConfigPanel';
import { renderAgenticMode, cleanupAgenticMode } from '../Agentic/AgenticUI_Bridge';
import { renderContextualMode, stopContextualProcess } from '../Contextual/Contextual';
import { renderAdaptiveDeepthinkMode, cleanupAdaptiveDeepthinkMode } from '../AdaptiveDeepthink/AdaptiveDeepthinkMode';
import { updateEvolutionModeDescription } from '../UI/CommonUI';
import { renderWebsiteMode } from '../Refine/WebsiteUI.tsx';

export function activateTab(idToActivate: string | number) {
    if (globalState.currentMode === 'deepthink' && globalState.activeDeepthinkPipeline) {
        globalState.activeDeepthinkPipeline.activeTabId = idToActivate as string;

        // Dispatch event for UI to update tab styles
        window.dispatchEvent(new CustomEvent('updateDeepthinkTabUI', { detail: { id: idToActivate } }));

        if (idToActivate === 'strategic-solver' && globalState.activeDeepthinkPipeline.initialStrategies.length > 0) {
            activateDeepthinkStrategyTab(globalState.activeDeepthinkPipeline.activeStrategyTab ?? 0);
        }

    } else if (globalState.currentMode !== 'deepthink') {
        globalState.activePipelineId = idToActivate as number;

        // Dispatch event for UI to update tab styles
        window.dispatchEvent(new CustomEvent('updatePipelineTabUI', { detail: { id: idToActivate } }));
    }
}

export function renderActiveMode() {
    (window as any).pipelinesState = globalState.pipelinesState;

    // Dispatch event to allow UI components (like MainContent) to manage their visibility state
    window.dispatchEvent(new CustomEvent('beforeRenderActiveMode', { detail: { mode: globalState.currentMode } }));

    if (globalState.currentMode === 'agentic') {
        renderAgenticMode();
        return;
    } else if (globalState.currentMode === 'contextual') {
        renderContextualMode();
        return;
    } else if (globalState.currentMode === 'adaptive-deepthink') {
        renderAdaptiveDeepthinkMode();
        return;
    } else if (globalState.currentMode === 'deepthink') {
        if (globalState.activeDeepthinkPipeline) {
            renderActiveDeepthinkPipeline();
        } else {
            // Note: UI logic for rendering config panel should find its own container
            // We pass null here, or let the bridge grab the right element if it needs to.
            // Since it's a TSX function, we just call it.
            // The signature of renderDeepthinkConfigPanelInContainer in TS expects an HTMLElement.
            // We should let the MainContent or a controller call it, but if we must call it here:
            const pipelinesContentContainer = document.getElementById('pipelines-content-container');
            if (pipelinesContentContainer) {
                renderDeepthinkConfigPanelInContainer(pipelinesContentContainer);
            }
        }
        return;
    }

    // Default: Website / Refine Mode
    const tabsNavContainer = document.getElementById('tabs-nav-container');
    const pipelinesContentContainer = document.getElementById('pipelines-content-container');

    // As part of moving towards pure logic, we should ideally not pass DOM elements if the bridge can fetch them, 
    // but WebsiteMode currently requires them as arguments.
    // In a fully pure TS file, we'd fire an event to trigger renderWebsiteMode, but for now we supply the DOM elements.
    if (tabsNavContainer && pipelinesContentContainer) {
        tabsNavContainer.innerHTML = '';
        pipelinesContentContainer.innerHTML = '';
        renderWebsiteMode(tabsNavContainer, pipelinesContentContainer);
    }
}

export function updateUIAfterModeChange() {
    routingManager.setCurrentMode(globalState.currentMode);

    // Notify UI components of mode change
    window.dispatchEvent(new CustomEvent('appModeChanged', { detail: { mode: globalState.currentMode } }));

    setTimeout(() => {
        if ((window as any).reinitializeSidebarControls) {
            (window as any).reinitializeSidebarControls();
        }
    }, 100);

    if (globalState.currentMode === 'website') {
        updateEvolutionModeDescription(globalState.currentEvolutionMode);
    }

    if (!globalState.isGenerating) {
        globalState.pipelinesState = [];
        if (globalState.currentMode === 'agentic') {
            cleanupAgenticMode();
        } else if (globalState.currentMode === 'contextual') {
            stopContextualProcess();
        } else if (globalState.currentMode === 'adaptive-deepthink') {
            cleanupAdaptiveDeepthinkMode();
        }
    }

    // Clean up quota backoff resources when navigating away from Deepthink
    if (globalState.currentMode !== 'deepthink') {
        cleanupQuotaBackoff();
    }

    renderActiveMode();
}
