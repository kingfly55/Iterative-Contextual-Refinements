import React from 'react';

/**
 * Sidebar header component
 * Contains provider management button, theme toggle, and collapse controls
 */
export const SidebarHeader: React.FC = () => {
    return (
        <header className="sidebar-header">
            <div className="sidebar-header-content">
                <div className="api-key-status-container">
                    {/* Provider management button will be inserted here by ProviderManagementUI */}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        id="theme-toggle-button"
                        className="theme-toggle-button"
                        aria-label="Toggle Theme"
                        title="Toggle Light/Dark Mode"
                    >
                        <span className="material-symbols-outlined">light_mode</span>
                    </button>
                    <button
                        id="sidebar-collapse-button"
                        className="sidebar-collapse-button"
                        aria-label="Collapse Sidebar"
                        title="Collapse Sidebar"
                    >
                        <span className="material-symbols-outlined">dock_to_right</span>
                    </button>
                </div>
            </div>
        </header>
    );
};

export default SidebarHeader;
