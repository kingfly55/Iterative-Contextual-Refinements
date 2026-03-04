/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AgenticStateHandler - State management handler for Agentic mode
 */

import type { ModeStateHandler } from '../ModeStateHandler';
import {
    getActiveAgenticState,
    setActiveAgenticStateForImport,
    renderAgenticMode,
} from '../../../Agentic/AgenticUI_Bridge';
import type { AgenticState } from '../../../Agentic/AgenticCore';

export const agenticStateHandler: ModeStateHandler<AgenticState> = {
    modeName: 'agentic',

    getFullState(): AgenticState | null {
        return getActiveAgenticState();
    },

    restoreState(state: AgenticState | null): void {
        if (state) {
            setActiveAgenticStateForImport(state);
        }
    },

    renderAfterImport(): void {
        renderAgenticMode();
    },
};
