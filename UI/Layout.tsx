import React from 'react';

/**
 * Main application layout component
 * Provides the foundational structure for the entire application
 */
export const Layout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    return (
        <>
            <div id="preloader">
                <div className="spinner"></div>
            </div>
            <div className="background-container">
                <div className="background-gradient"></div>
                <div className="background-noise"></div>
            </div>

            <div id="root">
                <div id="app-container">
                    {children}
                </div>
            </div>
        </>
    );
};

export default Layout;
