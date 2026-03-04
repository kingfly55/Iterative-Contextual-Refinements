import React, { useEffect, useRef } from 'react';
import { App } from '../../Core/App';
import '../../UI/CommonUI'; // Ensure global window handlers are registered
import { GlobalImagePreviewModal } from './RenderMathMarkdown';

export const AppInitializer: React.FC = () => {
    const initialized = useRef(false);

    useEffect(() => {
        if (!initialized.current) {
            // Initialize the App logic once the component has mounted
            App.init();
            initialized.current = true;
        }
    }, []);

    return (
        <>
            <GlobalImagePreviewModal />
        </>
    );
};
