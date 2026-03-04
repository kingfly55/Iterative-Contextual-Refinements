import React from 'react';
import { PipelineTabData, getPipelineTabsData, getCurrentMode, getModeTitle, getActivePipelineId, isWebsiteMode, isGenerating, getPipelinesCount } from './UIManager';
import { updatePipelineStatusUI } from '../Refine/WebsiteUI';
import { activateTab } from './Tabs';
import { globalState } from '../Core/State';

export const ModeHeaderTitle: React.FC = () => {
    const mode = getCurrentMode();
    return <>{getModeTitle(mode)}</>;
};

export const EmptyState: React.FC = () => {
    return (
        <div className="empty-state">
            <div className="empty-state-icon"><span className="material-symbols-outlined">lightbulb</span></div>
            <h3>Ready to Create</h3>
            <p>Enter your idea above and click "Generate" to start the iterative refinement process.</p>
        </div>
    );
};

export interface PipelineTabProps {
    pipeline: PipelineTabData;
    onStop: (pipelineId: number) => void;
}

export const PipelineTab: React.FC<PipelineTabProps> = ({ pipeline, onStop }) => {
    const showStopButton = pipeline.status === 'running';
    
    return (
        <div className={`pipeline-content ${pipeline.isActive ? 'active' : ''}`} 
             role="tabpanel" 
             aria-labelledby={`pipeline-tab-${pipeline.id}`}
             id={`pipeline-content-${pipeline.id}`}>
            <div className="pipeline-header">
                <div className="pipeline-info">
                    <h3>Pipeline {pipeline.id + 1}</h3>
                    <span className="pipeline-meta">Model: {pipeline.modelName} • Temp: {pipeline.temperature}</span>
                </div>
                <div className="pipeline-actions">
                    <span id={`pipeline-status-text-${pipeline.id}`} className={`pipeline-status status-badge status-${pipeline.status}`}>
                        {pipeline.status}
                    </span>
                    <button 
                        id={`stop-btn-${pipeline.id}`} 
                        className="button stop-button" 
                        style={{ display: showStopButton ? 'none' : 'none' }}
                        onClick={() => onStop(pipeline.id)}>
                        <span className="material-symbols-outlined">stop_circle</span>
                        <span className="button-text">Stop</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export interface PipelineTabsContainerProps {
    onTabClick: (id: number) => void;
    onStopPipeline: (id: number) => void;
}

export const PipelineTabsContainer: React.FC<PipelineTabsContainerProps> = ({ onTabClick, onStopPipeline }) => {
    const pipelines = getPipelineTabsData();
    const activeId = getActivePipelineId();

    if (pipelines.length === 0) {
        return <EmptyState />;
    }

    return (
        <>
            {pipelines.map(pipeline => (
                <React.Fragment key={pipeline.id}>
                    <button
                        id={`pipeline-tab-${pipeline.id}`}
                        className={`tab-button status-${pipeline.status} ${pipeline.id === activeId ? 'active' : ''}`}
                        role="tab"
                        aria-controls={`pipeline-content-${pipeline.id}`}
                        aria-selected={pipeline.id === activeId}
                        onClick={() => onTabClick(pipeline.id)}>
                        <span className="tab-label">Pipeline {pipeline.id + 1}</span>
                        <span className="tab-model-badge">{pipeline.modelName}</span>
                    </button>
                    <PipelineTab pipeline={pipeline} onStop={onStopPipeline} />
                </React.Fragment>
            ))}
        </>
    );
};

export const isPipelineStatusRunning = (status: string): boolean => status === 'running';

export const handlePipelineStop = (pipelineId: number) => {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (pipeline && pipeline.status === 'running') {
        pipeline.isStopRequested = true;
        pipeline.status = 'stopping';
        updatePipelineStatusUI(pipeline.id, 'stopping');
    }
};

export const renderPipelinesContainer = (): { tabs: PipelineTabData[]; activeId: number | undefined } => {
    return {
        tabs: getPipelineTabsData(),
        activeId: getActivePipelineId()
    };
};

export const shouldShowEmptyState = (): boolean => {
    return getPipelinesCount() === 0;
};

export const shouldRenderPipelines = (): boolean => {
    return isWebsiteMode();
};
