import React from 'react';

/**
 * Main content area component
 * Contains tabs navigation and pipeline content container
 */
export const MainContent: React.FC = () => {
    return (
        <main id="main-content" className="flow-canvas-wrapper" aria-labelledby="main-content-heading">
            <h2 id="main-content-heading" className="sr-only">Generation Pipelines Output</h2>
            <div className="main-header-content">
                <button
                    id="sidebar-expand-button"
                    className="sidebar-expand-button"
                    aria-label="Expand Sidebar"
                    title="Expand Sidebar"
                    style={{ display: 'none' }}
                >
                    <span className="material-symbols-outlined">dock_to_left</span>
                </button>
                <div id="tabs-nav-container" className="tabs-container" role="tablist" aria-label="Results">
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
