
import { ApplicationMode, PipelineState, DeepthinkPipelineState, ReactPipelineState } from './Types';
import { defaultCustomPromptsWebsite } from '../Refine/RefinePrompts';
import { createDefaultCustomPromptsReact } from '../React/ReactPrompts';
import { createDefaultCustomPromptsDeepthink } from '../Deepthink/DeepthinkPrompts';
import { createDefaultCustomPromptsAdaptiveDeepthink } from '../AdaptiveDeepthink/AdaptiveDeepthinkPrompt';
import { createDefaultCustomPromptsContextual } from '../Contextual/ContextualPrompts';
import { AGENTIC_SYSTEM_PROMPT } from '../Agentic/AgenticModePrompt';

export const NUM_INITIAL_STRATEGIES_DEEPTHINK = 3;
export const NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK = 3;

class GlobalStateManager {
    currentMode: ApplicationMode = 'deepthink';
    currentEvolutionMode: 'off' | 'novelty' | 'quality' = 'novelty';
    pipelinesState: PipelineState[] = [];
    activeDeepthinkPipeline: DeepthinkPipelineState | null = null;
    activeReactPipeline: ReactPipelineState | null = null;
    activePipelineId: number | null = null;
    isGenerating: boolean = false;
    currentProblemImageBase64: string | null = null;
    currentProblemImageMimeType: string | null = null;
    isCustomPromptsOpen: boolean = false;

    // Mode running states
    isAgenticRunning: boolean = false;
    isGenerativeUIRunning: boolean = false;
    isContextualRunning: boolean = false;
    isAdaptiveDeepthinkRunning: boolean = false;
    isReactAgenticRunning: boolean = false;

    customPromptsWebsiteState = defaultCustomPromptsWebsite;
    customPromptsDeepthinkState = createDefaultCustomPromptsDeepthink(NUM_INITIAL_STRATEGIES_DEEPTHINK, NUM_SUB_STRATEGIES_PER_MAIN_DEEPTHINK);
    customPromptsReactState = createDefaultCustomPromptsReact();
    customPromptsAgenticState = { systemPrompt: AGENTIC_SYSTEM_PROMPT };
    customPromptsAdaptiveDeepthinkState = createDefaultCustomPromptsAdaptiveDeepthink();
    customPromptsContextualState = createDefaultCustomPromptsContextual();
}

export const globalState = new GlobalStateManager();
