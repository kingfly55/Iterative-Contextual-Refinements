import { globalState } from '../Core/State';
import { ApplicationMode } from '../Core/Types';

export interface PipelineTabData {
    id: number;
    modelName: string;
    temperature: number;
    status: string;
    isActive: boolean;
}

export interface ModeConfig {
    title: string;
    bodyClass: string;
}

const MODE_CONFIGS: Record<ApplicationMode, ModeConfig> = {
    'website': { title: 'Iterative Studio', bodyClass: 'mode-website' },
    'deepthink': { title: 'Deepthink', bodyClass: 'mode-deepthink' },
    'agentic': { title: 'Agentic Refinements', bodyClass: 'mode-agentic' },
    'contextual': { title: 'Contextual Refinements', bodyClass: 'mode-contextual' },
    'adaptive-deepthink': { title: 'Adaptive Deepthink', bodyClass: 'mode-adaptive-deepthink' }
};

export function getCurrentModeConfig(): ModeConfig {
    return MODE_CONFIGS[globalState.currentMode] || MODE_CONFIGS['website'];
}

export function getModeTitle(mode: ApplicationMode): string {
    return MODE_CONFIGS[mode]?.title || 'Iterative Studio';
}

export function getModeBodyClass(mode: ApplicationMode): string {
    return MODE_CONFIGS[mode]?.bodyClass || 'mode-website';
}

export function getPipelineTabsData(): PipelineTabData[] {
    const { pipelinesState, activePipelineId } = globalState;
    return pipelinesState.map(pipeline => ({
        id: pipeline.id,
        modelName: pipeline.modelName,
        temperature: pipeline.temperature,
        status: pipeline.status,
        isActive: pipeline.id === activePipelineId
    }));
}

export function getActivePipelineId(): number | undefined {
    return globalState.activePipelineId ?? undefined;
}

export function isWebsiteMode(): boolean {
    return globalState.currentMode === 'website';
}

export function getCurrentMode(): ApplicationMode {
    return globalState.currentMode;
}

export function isGenerating(): boolean {
    return globalState.isGenerating;
}

export function getPipelinesCount(): number {
    return globalState.pipelinesState.length;
}

export function getModeRadioValue(): ApplicationMode {
    return globalState.currentMode;
}

export function getHeaderTitleForMode(mode: ApplicationMode): string {
    switch (mode) {
        case 'website': return 'Iterative Studio';
        case 'deepthink': return 'Deepthink';
        case 'agentic': return 'Agentic Refinements';
        case 'contextual': return 'Contextual Refinements';
        case 'adaptive-deepthink': return 'Adaptive Deepthink';
        default: return 'Iterative Studio';
    }
}

export function getControlVisibility(mode: ApplicationMode): {
    website: boolean;
    deepthink: boolean;
    agentic: boolean;
    adaptiveDeepthink: boolean;
} {
    return {
        website: mode === 'website',
        deepthink: mode === 'deepthink',
        agentic: mode === 'agentic',
        adaptiveDeepthink: mode === 'adaptive-deepthink'
    };
}

export function getPipelineStatusForId(pipelineId: number): string {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    return pipeline?.status || 'idle';
}

export function setActivePipelineId(id: number) {
    globalState.activePipelineId = id;
}

export function setCurrentMode(mode: ApplicationMode) {
    globalState.currentMode = mode;
}
