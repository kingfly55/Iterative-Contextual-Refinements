import React from 'react';
import { isSidebarCollapsed, getExpandButton, getCollapseButton } from './Sidebar';

export const SidebarExpandButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const isCollapsed = isSidebarCollapsed();
    return (
        <button 
            id="sidebar-expand-button" 
            className="sidebar-expand-button"
            style={{ display: isCollapsed ? 'flex' : 'none' }}
            onClick={onClick}
        >
            <span className="material-symbols-outlined">chevron_right</span>
        </button>
    );
};

export const SidebarCollapseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    return (
        <button 
            id="sidebar-collapse-button" 
            className="sidebar-collapse-button"
            onClick={onClick}
        >
            <span className="material-symbols-outlined">chevron_left</span>
        </button>
    );
};

export const useSidebarState = () => {
    return {
        isCollapsed: isSidebarCollapsed(),
        hasExpandButton: !!getExpandButton(),
        hasCollapseButton: !!getCollapseButton()
    };
};
