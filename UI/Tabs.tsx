import React from 'react';
import { getCurrentMode, getActivePipelineId, getActiveDeepthinkPipeline } from './Tabs';
import { ApplicationMode } from '../Core/Types';

export interface TabButtonProps {
    id: string | number;
    label: string;
    isActive: boolean;
    onClick: (id: string | number) => void;
    className?: string;
}

export const TabButton: React.FC<TabButtonProps> = ({ id, label, isActive, onClick, className = '' }) => {
    return (
        <button
            className={`tab-button ${isActive ? 'active' : ''} ${className}`}
            onClick={() => onClick(id)}
        >
            {label}
        </button>
    );
};

export interface PipelineTabProps {
    id: number;
    label: string;
    isActive: boolean;
    onClick: (id: number) => void;
}

export const PipelineTabButton: React.FC<PipelineTabProps> = ({ id, label, isActive, onClick }) => {
    return (
        <button
            id={`pipeline-tab-${id}`}
            className={`tab-button ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
            onClick={() => onClick(id)}
        >
            {label}
        </button>
    );
};

export interface PipelineContentPaneProps {
    id: number;
    isActive: boolean;
    children: React.ReactNode;
}

export const PipelineContentPane: React.FC<PipelineContentPaneProps> = ({ id, isActive, children }) => {
    return (
        <div
            id={`pipeline-content-${id}`}
            className={`pipeline-content ${isActive ? 'active' : ''}`}
            role="tabpanel"
            aria-labelledby={`pipeline-tab-${id}`}
        >
            {children}
        </div>
    );
};

export const useCurrentMode = (): ApplicationMode => {
    return getCurrentMode();
};

export const useActivePipelineId = (): number | null => {
    return getActivePipelineId();
};

export const useActiveDeepthinkPipeline = () => {
    return getActiveDeepthinkPipeline();
};
