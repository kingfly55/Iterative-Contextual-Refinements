import React, { useState, useEffect } from 'react';
import { globalState } from '../../Core/State';

/**
 * Main content area component
 * Contains tabs navigation and pipeline content container
 */
export const MainContent: React.FC = () => {
    const [currentMode, setCurrentMode] = useState(globalState.currentMode);

    useEffect(() => {
        const handleModeChange = (e: any) => {
            setCurrentMode(e.detail.mode);
        };
        window.addEventListener('appModeChanged', handleModeChange);
        return () => window.removeEventListener('appModeChanged', handleModeChange);
    }, []);

    const isDeepthinkConfig = currentMode === 'deepthink' && !globalState.activeDeepthinkPipeline;
    const isAgentic = currentMode === 'agentic';
    // Deepthink config panel and agentic mode hide the tabs nav
    const showTabs = !isDeepthinkConfig && !isAgentic;

    return (
        <main id="main-content" className="flow-canvas-wrapper" aria-labelledby="main-content-heading">
            <h2 id="main-content-heading" className="sr-only">Generation Pipelines Output</h2>
            <div className="main-header-content" style={{ display: isAgentic ? 'none' : '' }}>
                <button
                    id="sidebar-expand-button"
                    className="sidebar-expand-button"
                    aria-label="Expand Sidebar"
                    title="Expand Sidebar"
                    style={{ display: 'none' }}
                >
                    <span className="material-symbols-outlined">dock_to_left</span>
                </button>
                <div
                    id="tabs-nav-container"
                    className="tabs-container"
                    role="tablist"
                    aria-label="Results"
                    style={{ display: showTabs ? '' : 'none' }}
                >
                    {/* Tabs will be dynamically inserted here */}
                </div>
            </div>
            <div id="pipelines-content-container" className="results-content-area custom-scrollbar">
                {/* Pipeline content will be dynamically inserted here */}
            </div>
        </main>
    );
};

export default MainContent;
