import React from 'react';

/**
 * Sidebar footer component
 * Contains API call counter and generate button
 */
export const SidebarFooter: React.FC = () => {
    return (
        <footer className="sidebar-footer">
            <div className="api-call-indicator">
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
            </div>
            <button id="generate-button" className="button primary-action" type="button">
                <span className="button-text">Deepthink</span>
            </button>
        </footer>
    );
};

export default SidebarFooter;
