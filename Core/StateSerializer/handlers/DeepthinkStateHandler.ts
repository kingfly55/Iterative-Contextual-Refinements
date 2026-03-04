/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DeepthinkStateHandler - State management handler for Deepthink mode
 */

import type { ModeStateHandler } from '../ModeStateHandler';
import type { DeepthinkPipelineState } from '../../../Deepthink/DeepthinkCore';
import {
    getActiveDeepthinkPipeline,
    setActiveDeepthinkPipelineForImport,
} from '../../../Deepthink/Deepthink';
import {
    getSolutionPoolVersionsForExport,
    restoreSolutionPoolVersions
} from '../../../Deepthink/SolutionPool';
import { renderActiveDeepthinkPipeline } from '../../../Deepthink/Deepthink';
import { activateTab } from '../../AppRouter';

/**
 * Extended state that includes solution pool versions for evolution view.
 */
export interface DeepthinkExportState {
    pipeline: DeepthinkPipelineState | null;
    solutionPoolVersions: Array<{ content: string; title: string; timestamp: number }> | null;
    activeTabId: string;
}

export const deepthinkStateHandler: ModeStateHandler<DeepthinkExportState> = {
    modeName: 'deepthink',

    getFullState(): DeepthinkExportState | null {
        const pipeline = getActiveDeepthinkPipeline();
        if (!pipeline) {
            return null;
        }

        return {
            pipeline,
            solutionPoolVersions: getSolutionPoolVersionsForExport(pipeline.id),
            activeTabId: pipeline.activeTabId || 'strategic-solver',
        };
    },

    restoreState(state: DeepthinkExportState | null): void {
        if (!state || !state.pipeline) {
            setActiveDeepthinkPipelineForImport(null);
            return;
        }

        // Restore the pipeline
        setActiveDeepthinkPipelineForImport(state.pipeline);

        // Restore solution pool versions if available
        if (state.solutionPoolVersions && state.solutionPoolVersions.length > 0) {
            restoreSolutionPoolVersions(state.pipeline.id, state.solutionPoolVersions);
        }
    },

    renderAfterImport(): void {
        const pipeline = getActiveDeepthinkPipeline();
        if (pipeline) {
            renderActiveDeepthinkPipeline();
            if (pipeline.activeTabId) {
                activateTab(pipeline.activeTabId);
            }
        }
    },
};
