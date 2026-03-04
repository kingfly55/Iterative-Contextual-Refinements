import React from 'react';
import { isLightMode, getSavedTheme, ThemeMode } from './Theme';

export const ThemeToggleButton: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
    const isLight = isLightMode();
    return (
        <button 
            id="theme-toggle-button" 
            className="theme-toggle-button"
            onClick={onToggle}
            title="Toggle theme"
        >
            <span className="material-symbols-outlined">
                {isLight ? 'dark_mode' : 'light_mode'}
            </span>
        </button>
    );
};

export const useThemeState = (): { savedTheme: ThemeMode; isLightMode: boolean } => {
    return {
        savedTheme: getSavedTheme(),
        isLightMode: isLightMode()
    };
};
