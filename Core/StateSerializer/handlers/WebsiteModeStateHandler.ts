/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WebsiteModeStateHandler - State management handler for Website mode
 */

import type { ModeStateHandler } from '../ModeStateHandler';
import type { PipelineState } from '../../Types';
import { globalState } from '../../State';
import { renderActiveMode } from '../../AppRouter';

/**
 * Website mode state includes multiple pipelines.
 */
export interface WebsiteModeExportState {
    pipelines: PipelineState[];
    activePipelineId: number | null;
}

export const websiteModeStateHandler: ModeStateHandler<WebsiteModeExportState> = {
    modeName: 'website',

    getFullState(): WebsiteModeExportState | null {
        return {
            pipelines: globalState.pipelinesState,
            activePipelineId: globalState.activePipelineId,
        };
    },

    restoreState(state: WebsiteModeExportState | null): void {
        if (!state) {
            globalState.pipelinesState = [];
            globalState.activePipelineId = null;
            return;
        }

        globalState.pipelinesState = state.pipelines || [];
        globalState.activePipelineId = state.activePipelineId;
    },

    renderAfterImport(): void {
        renderActiveMode();
    },
};
