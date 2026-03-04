/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agentic UI Component Bridge
 * This is the Agentic UI component bridge that provides  imperative APIs.
 * It can be mounted anywhere in the application as needed to render the pure React <AgenticMode />.
 */

// Removed unused React import
import ReactDOM from 'react-dom/client';
import { AgenticMode } from './Agentic';
import { AgenticState } from './AgenticCore';
import type { AgenticPromptsManager } from './AgenticPromptsManager';

// --- Legacy Bridge State ---
let globalPromptsManager: AgenticPromptsManager | null = null;
let currentContentToProcess: string = '';
let latestState: AgenticState | null = null;
let uiRoot: ReactDOM.Root | null = null;
let contentUpdateCallback: ((content: string, isComplete?: boolean) => void) | null = null;

export function initializeAgenticMode(manager?: AgenticPromptsManager) {
    if (manager) {
        globalPromptsManager = manager;
    }
}

export function setAgenticPromptsManager(manager: AgenticPromptsManager) {
    globalPromptsManager = manager;
}

export function setAgenticContentUpdateCallback(cb: ((content: string, isComplete?: boolean) => void) | null) {
    contentUpdateCallback = cb;
}

export function setActiveAgenticStateForImport(state: AgenticState) {
    latestState = state;
    if (uiRoot && globalPromptsManager) {
        uiRoot.render(
            <AgenticMode
                initialContent={state.originalContent}
                promptsManager={globalPromptsManager}
                onContentUpdated={contentUpdateCallback ?? undefined}
                isActive={true}
            // Add key to force remount with new state if needed, though state is managed internally in AgenticMode.
            // Since this is a legacy bridge, we might just let it render. The new AgenticMode creates a new AgenticEngine.
            // To support full resume, AgenticEngine would need to accept the state, which we enabled.
            />
        );
    }
}

export function getActiveAgenticState(): AgenticState | null {
    return latestState;
}

export async function startAgenticProcess(initialContent: string) {
    currentContentToProcess = initialContent;
    renderAgenticMode();
}

export function renderAgenticMode() {
    const container = document.getElementById('pipelines-content-container');
    const tabsContainer = document.getElementById('tabs-nav-container');
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;

    if (!container || !tabsContainer) return;

    // Clear and hide tabs, mimicking contextual mode
    tabsContainer.innerHTML = '';
    tabsContainer.style.display = 'none';

    // Hide entire header section (no tabs/header needed)
    if (mainHeaderContent) {
        mainHeaderContent.style.display = 'none';
    }

    // Instead of wiping the entire container and recreating the div every time (which kills the React root),
    // we should reuse the existing agentic-container if we're just re-rendering,
    // or wipe and create ONLY if it doesn't exist yet (e.g., coming from another mode).
    let agenticContainer = document.getElementById('agentic-container');

    if (!agenticContainer) {
        container.innerHTML = ''; // Wipe whatever other mode was there
        agenticContainer = document.createElement('div');
        agenticContainer.id = 'agentic-container';
        agenticContainer.className = 'pipeline-content active';
        agenticContainer.style.height = '100%';
        container.appendChild(agenticContainer);

        // Only create a new root if we just made a new DOM element
        if (uiRoot) {
            // Failsafe: if we had a dangling root but the DOM element was deleted by another mode
            try { uiRoot.unmount(); } catch (e) { }
        }
        uiRoot = ReactDOM.createRoot(agenticContainer);
    } else {
        // Just make sure it's active
        agenticContainer.className = 'pipeline-content active';
        // If the container exists but we lost the root somehow, recreate it
        if (!uiRoot) {
            uiRoot = ReactDOM.createRoot(agenticContainer);
        }
    }

    if (!globalPromptsManager) {
        throw new Error('AgenticPromptsManager not initialized in AgenticUI_Bridge');
    }

    uiRoot.render(
        <AgenticMode
            initialContent={currentContentToProcess}
            promptsManager={globalPromptsManager}
            onContentUpdated={contentUpdateCallback ?? undefined}
            isActive={true}
        />
    );
}

export function cleanupAgenticMode() {
    if (uiRoot) {
        uiRoot.unmount();
        uiRoot = null;
    }
    latestState = null;
}
