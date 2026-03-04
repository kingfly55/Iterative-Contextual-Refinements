import React, { useEffect, useRef } from 'react';
import { mountProviderButtons, createPollingInterval } from './SidebarHeaderLogic';

export const SidebarHeader: React.FC = () => {
    const buttonsContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const attemptMount = () => {
            mountProviderButtons(buttonsContainerRef);
        };

        attemptMount();

        const intervalId = createPollingInterval(buttonsContainerRef, attemptMount);

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
