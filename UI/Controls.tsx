import React from 'react';
import { ControlsDisabledState, computeControlsDisabledState } from './Controls';

export interface ControlsStateDisplayProps {
    state: ControlsDisabledState;
}

export const GenerateButton: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return <button id="generate-button" disabled={disabled} className="button generate-button">Generate</button>;
};

export const ExportConfigButton: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return <button id="export-config-button" disabled={disabled} className="button">Export Config</button>;
};

export const ImportConfigInput: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return <input id="import-config-input" type="file" disabled={disabled} accept=".json" />;
};

export const InitialIdeaTextarea: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return <textarea id="initial-idea" disabled={disabled} placeholder="Enter your idea..." />;
};

export const ProvidersButton: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return <button id="add-providers-trigger" disabled={disabled}>Add Providers</button>;
};

export const PromptsButton: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return <button id="prompts-trigger" disabled={disabled}>Prompts</button>;
};

export const SidebarContentOverlay: React.FC<{ disabled: boolean }> = ({ disabled }) => {
    return (
        <div 
            className="sidebar-content" 
            style={{ 
                pointerEvents: disabled ? 'none' : 'auto',
                opacity: disabled ? 0.6 : 1
            }}
        />
    );
};

export const useControlsState = () => {
    return computeControlsDisabledState();
};
