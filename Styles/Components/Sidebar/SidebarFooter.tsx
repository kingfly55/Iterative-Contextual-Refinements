import React from 'react';
import { ApplicationMode } from '../../../Core/Types';
import { App } from '../../../Core/App';
import { loadAndRestoreSessionFromFile } from '../../../Deepthink/Deepthink';

interface SidebarFooterProps {
    currentMode: ApplicationMode;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({ currentMode }) => {

    const handleGenerateClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const initialIdeaInput = document.getElementById('initial-idea') as HTMLTextAreaElement;
        const initialIdea = initialIdeaInput?.value?.trim() || '';
        App.handleGenerate(initialIdea);
    };

    const getButtonText = () => {
        switch (currentMode) {
            case 'website': return 'Generate & Refine';
            case 'deepthink': return 'Deepthink';
            case 'agentic': return 'Generate & Refine';
            case 'contextual': return 'Start Contextual Refinement';
            case 'adaptive-deepthink': return 'Adaptive Deepthink';
            default: return 'Generate & Refine';
        }
    };

    return (
        <footer className="sidebar-footer">
            <div className="api-call-indicator" style={{ display: currentMode === 'deepthink' ? 'flex' : 'none' }}>
                <div className="api-call-info">
                    <span className="api-call-count" id="api-call-count">~0</span>
                    <span className="api-call-label">API Calls</span>
                </div>
                <span
                    className="api-call-warning material-symbols-outlined"
                    id="api-call-warning"
                    style={{ display: 'none' }}
                    title="Red Team enabled - may reduce calls"
                >
                    info
                </span>
                <span
                    className="api-call-warning material-symbols-outlined"
                    id="api-call-pqf-warning"
                    style={{ display: 'none', marginLeft: '4px' }}
                    title="PQF Enabled - avg run to worst case"
                >
                    info
                </span>
            </div>
            <div className="sidebar-footer-actions">
                {(currentMode === 'deepthink' || currentMode === 'adaptive-deepthink') && (
                    <button
                        className="button session-load-btn"
                        type="button"
                        title="Load saved session"
                        onClick={(e) => { e.preventDefault(); loadAndRestoreSessionFromFile(); }}
                    >
                        <span className="material-symbols-outlined">upload_file</span>
                    </button>
                )}
                <button
                    id="generate-button"
                    className="button primary-action"
                    type="button"
                    onClick={handleGenerateClick}
                >
                    <span className="button-text" id="generate-button-text">{getButtonText()}</span>
                </button>
            </div>
        </footer>
    );
};

export default SidebarFooter;
