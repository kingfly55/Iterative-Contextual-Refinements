/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Adaptive Deepthink - Main exports
 */

// Core functionality
export {
    AdaptiveDeepthinkConversationManager,
    createAdaptiveDeepthinkState,
    parseAdaptiveDeepthinkResponse,
    executeAdaptiveDeepthinkTool
} from './AdaptiveDeepthinkCore';

export type {
    AdaptiveDeepthinkState,
    AdaptiveDeepthinkToolCall
} from './AdaptiveDeepthinkCore';

// System prompt
export { ADAPTIVE_DEEPTHINK_SYSTEM_PROMPT } from './AdaptiveDeepthinkPrompt';

// Main orchestration
export {
    initializeAdaptiveDeepthinkModule,
    startAdaptiveDeepthinkSession,
    getActiveAdaptiveDeepthinkSession,
    stopAdaptiveDeepthinkSession,
    clearAdaptiveDeepthinkSession
} from './AdaptiveDeepthink';

// UI integration
export {
    renderAdaptiveDeepthinkMode,
    startAdaptiveDeepthinkProcess,
    stopAdaptiveDeepthinkProcess,
    cleanupAdaptiveDeepthinkMode,
    getAdaptiveDeepthinkState,
    setAdaptiveDeepthinkStateForImport
} from './AdaptiveDeepthinkMode';
