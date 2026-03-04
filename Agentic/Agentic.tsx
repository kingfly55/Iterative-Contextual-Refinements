/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AgenticUI } from './AgenticUI';
import { AgenticEngine } from './AgenticCore';
import type { AgenticState } from './AgenticCore';
import type { AgenticPromptsManager } from './AgenticPromptsManager';

export interface AgenticModeProps {
    initialContent: string;
    promptsManager: AgenticPromptsManager;
    onContentUpdated?: (content: string, isComplete?: boolean) => void;
    isActive?: boolean;
}

export const AgenticMode: React.FC<AgenticModeProps> = ({
    initialContent,
    promptsManager,
    onContentUpdated,
    isActive = true
}) => {
    const [engine, setEngine] = useState<AgenticEngine | null>(null);
    const [agenticState, setAgenticState] = useState<AgenticState | null>(null);

    useEffect(() => {
        if (!isActive) return;

        // Initialize mapping for force render via rAF double buffer (if needed by lower components)
        const forceRender = async () => {
            return new Promise<void>(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                });
            });
        };

        const newEngine = new AgenticEngine(
            initialContent,
            {
                onStateChange: (state) => setAgenticState({ ...state }),
                onContentUpdated: onContentUpdated,
                onForceRender: forceRender
            },
            promptsManager
        );

        setEngine(newEngine);
        newEngine.start();

        return () => {
            newEngine.stop();
        };
    }, [isActive, initialContent, promptsManager]); // Intentionally not including onContentUpdated to avoid restart loops

    const handleStop = () => {
        if (engine) engine.stop();
    };

    return (
        <div className="agentic-mode-root" style={{ height: '100%', width: '100%' }}>
            {(!isActive || !agenticState) ? null : (
                <AgenticUI state={agenticState} onStop={handleStop} />
            )}
        </div>
    );
};

export default AgenticMode;
