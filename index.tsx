/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './Core/App';
import Sidebar from './Components/Sidebar/Sidebar';
import MainContent from './Components/MainContent';
import PromptsModalManager from './Routing/PromptsModal/PromptsModalManager';

document.addEventListener('DOMContentLoaded', () => {
    // First, render React components to populate the DOM
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        const root = createRoot(appContainer);
        root.render(
            <React.StrictMode>
                <Sidebar />
                <MainContent />
            </React.StrictMode>
        );
    }

    // Render the prompts modal separately in the body
    const modalContainer = document.createElement('div');
    document.body.appendChild(modalContainer);
    const modalRoot = createRoot(modalContainer);
    modalRoot.render(
        <React.StrictMode>
            <PromptsModalManager />
        </React.StrictMode>
    );

    // After React components are rendered, initialize the App logic
    // Use setTimeout to ensure React has completed rendering
    setTimeout(() => {
        App.init();
    }, 0);
});