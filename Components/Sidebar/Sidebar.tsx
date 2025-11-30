import React from 'react';
import SidebarHeader from './SidebarHeader';
import AppModeSelector from './AppModeSelector';
import ModelParameters from './ModelParameters';
import SidebarFooter from './SidebarFooter';

/**
 * Main Sidebar component
 * Orchestrates all sidebar sub-components
 */
export const Sidebar: React.FC = () => {
    return (
        <aside id="controls-sidebar" className="inspector-panel custom-scrollbar" aria-labelledby="controls-sidebar-heading">
            <SidebarHeader />

            <div className="sidebar-content">
                <div className="input-group">
                    <label htmlFor="initial-idea" id="initial-idea-label" className="input-label">
                        Your Request:
                    </label>
                    <textarea
                        id="initial-idea"
                        className="input-base"
                        placeholder="E.g., a personal blog about cooking..."
                        rows={5}
                    />
                </div>

                <AppModeSelector />

                <ModelParameters />

                <details className="sidebar-section" open>
                    <summary className="sidebar-section-header">Configuration</summary>
                    <div className="sidebar-section-content">
                        <div className="config-buttons-container" style={{ display: 'flex', gap: '1rem' }}>
                            <button id="export-config-button" className="button" type="button">
                                <span className="material-symbols-outlined">upload</span>
                                <span className="button-text">Export</span>
                            </button>
                            <input type="file" id="import-config-input" className="sr-only" accept=".json" />
                            <label htmlFor="import-config-input" id="import-config-label" className="button" role="button" tabIndex={0}>
                                <span className="material-symbols-outlined">download</span>
                                <span className="button-text">Import</span>
                            </label>
                        </div>
                    </div>
                </details>
            </div>

            <SidebarFooter />
        </aside>
    );
};

export default Sidebar;
