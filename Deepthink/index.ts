/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Deepthink - Main exports
 */

// Export all agents for reuse
export {
    generateStrategiesAgent,
    generateHypothesesAgent,
    testHypothesesAgent,
    executeStrategiesAgent,
    solutionCritiqueAgent,
    correctedSolutionsAgent,
    selectBestSolutionAgent,
    AgentExecutionContext,
    AgentResponse
} from './DeepthinkAgents';

// Export prompts
export {
    CustomizablePromptsDeepthink,
    createDefaultCustomPromptsDeepthink,
    RED_TEAM_AGGRESSIVENESS_LEVELS
} from './DeepthinkPrompts';

// Export types and interfaces
export type {
    DeepthinkSolutionCritiqueData,
    DeepthinkSubStrategyData,
    DeepthinkHypothesisData,
    DeepthinkRedTeamData,
    DeepthinkMainStrategyData,
    DeepthinkPipelineState
} from './Deepthink';

// Export main functions
export {
    initializeDeepthinkModule,
    activateDeepthinkStrategyTab,
    runDeepthinkRedTeamEvaluation,
    openDeepthinkSolutionModal,
    closeSolutionModal,
    parseKnowledgePacketForStyling,
    startDeepthinkAnalysisProcess,
    getActiveDeepthinkPipeline,
    setActiveDeepthinkPipelineForImport,
    renderActiveDeepthinkPipeline
} from './Deepthink';
