import React, { useEffect, useRef } from 'react';
import { routingManager } from '../../Routing';

/**
 * Sidebar header component
 * Contains provider management button, theme toggle, and collapse controls
 */
export const SidebarHeader: React.FC = () => {
    const buttonsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mountButtons = () => {
            const providerUI = routingManager.getProviderManagementUI();
            if (providerUI && buttonsContainerRef.current) {
                providerUI.mountButtons(buttonsContainerRef.current);
            }
        };

        // Try to mount immediately
        mountButtons();

        // Also set up a polling interval to check for initialization (fallback)
        // This handles the case where SidebarHeader mounts before App.init completes
        const intervalId = setInterval(() => {
            const providerUI = routingManager.getProviderManagementUI();
            if (providerUI && buttonsContainerRef.current) {
                // Check if already mounted to avoid unnecessary re-renders/flickers if possible,
                // but mountButtons clears innerHTML so it's safe.
                // However, we don't want to clear it if it's already there and working.
                // Simple check: if empty, mount.
                if (buttonsContainerRef.current.children.length === 0) {
                    providerUI.mountButtons(buttonsContainerRef.current);
                }
            }
        }, 100);

        return () => clearInterval(intervalId);
    }, []);

    return (
        <header className="sidebar-header">
            <div className="sidebar-header-content">
                <div
                    id="provider-buttons-mount-point"
                    className="api-key-status-container"
                    ref={buttonsContainerRef}
                >
                    {/* Provider management buttons will be inserted here */}
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
