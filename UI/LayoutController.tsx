import React from 'react';
import { 
    getSidebarCollapsed, 
    getExpandButton, 
    getCollapseButton,
    expandSidebar,
    collapseSidebar,
    getSavedTheme,
    isLightMode 
} from './LayoutController';

export const SidebarExpandButton: React.FC = () => {
    const isCollapsed = getSidebarCollapsed();
    return (
        <button 
            id="sidebar-expand-button" 
            className="sidebar-expand-button"
            style={{ display: isCollapsed ? 'flex' : 'none' }}
            onClick={expandSidebar}
        >
            <span className="material-symbols-outlined">chevron_right</span>
        </button>
    );
};

export const SidebarCollapseButton: React.FC = () => {
    return (
        <button 
            id="sidebar-collapse-button" 
            className="sidebar-collapse-button"
        >
            <span className="material-symbols-outlined">chevron_left</span>
        </button>
    );
};

export const ThemeToggleButton: React.FC = () => {
    const isLight = isLightMode();
    return (
        <button id="theme-toggle-button" className="theme-toggle-button" title="Toggle theme">
            <span className="material-symbols-outlined">
                {isLight ? 'dark_mode' : 'light_mode'}
            </span>
        </button>
    );
};

export const FullscreenToggleButton: React.FC<{ previewContainerId: string }> = ({ previewContainerId }) => {
    return (
        <button 
            id={`fullscreen-btn-${previewContainerId.replace('preview-container-', '')}`}
            className="fullscreen-toggle-button"
            title="Toggle Fullscreen Preview"
        >
            <span className="icon-fullscreen material-symbols-outlined">fullscreen</span>
            <span className="icon-exit-fullscreen material-symbols-outlined" style={{ display: 'none' }}>fullscreen_exit</span>
        </button>
    );
};

export const useSidebarState = () => {
    return {
        isCollapsed: getSidebarCollapsed(),
        hasExpandButton: !!getExpandButton(),
        hasCollapseButton: !!getCollapseButton()
    };
};

export const useThemeState = () => {
    return {
        savedTheme: getSavedTheme(),
        isLightMode: isLightMode()
    };
};
