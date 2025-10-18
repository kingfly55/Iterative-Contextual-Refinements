/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * React Agentic Embedded UI - Monaco File Manager with Agent Activity
 * Layout: 75% File Manager (left) + 25% Agent Activity (right)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AgenticState } from '../Agentic/AgenticCoreLangchain';
import { AgentActivityPanel } from '../Agentic/AgenticUI';
import { MonacoFileEditor } from '../Components/MonacoFileEditor';

// Track React roots by container to prevent duplicate root creation
const rootMap = new WeakMap<HTMLElement, any>();

interface ReactAgenticEmbeddedUIProps {
    state: AgenticState;
    onStop: () => void;
    currentContent: string;
    onContentChange: (content: string) => void;
    onDownload: () => void;
    onViewEvolutions: () => void;
}

// Main embedded UI component with 75/25 split
const ReactAgenticEmbeddedUI: React.FC<ReactAgenticEmbeddedUIProps> = ({ 
    state, 
    onStop, 
    currentContent,
    onContentChange,
    onDownload,
    onViewEvolutions
}) => {
    return (
        <div className="react-agentic-embedded-ui-container">
            {/* Left Panel: Monaco File Manager (75%) */}
            <div className="react-agentic-file-manager-panel">
                <MonacoFileEditor
                    content={currentContent}
                    onContentChange={onContentChange}
                    onDownload={onDownload}
                    onViewEvolutions={onViewEvolutions}
                    readOnly={true}
                    forceDarkTheme={false}
                />
            </div>
            
            {/* Right Panel: Agent Activity (25%) */}
            <div className="react-agentic-agent-panel-wrapper">
                <AgentActivityPanel state={state} onStop={onStop} />
            </div>
        </div>
    );
};

/**
 * Render the embedded UI in a container
 */
export function renderReactAgenticEmbeddedUI(
    container: HTMLElement,
    state: AgenticState,
    onStop: () => void,
    currentContent: string,
    onContentChange: (content: string) => void,
    onDownload: () => void,
    onViewEvolutions: () => void
) {
    // Check if root already exists for this container
    let root = rootMap.get(container);
    if (!root) {
        root = ReactDOM.createRoot(container);
        rootMap.set(container, root);
    }
    
    root.render(
        <ReactAgenticEmbeddedUI
            state={state}
            onStop={onStop}
            currentContent={currentContent}
            onContentChange={onContentChange}
            onDownload={onDownload}
            onViewEvolutions={onViewEvolutions}
        />
    );
    return root;
}

/**
 * Update the embedded UI with new state
 */
export function updateReactAgenticEmbeddedUI(
    root: any,
    state: AgenticState,
    onStop: () => void,
    currentContent: string,
    onContentChange: (content: string) => void,
    onDownload: () => void,
    onViewEvolutions: () => void
) {
    flushSync(() => {
        root.render(
            <ReactAgenticEmbeddedUI
                state={state}
                onStop={onStop}
                currentContent={currentContent}
                onContentChange={onContentChange}
                onDownload={onDownload}
                onViewEvolutions={onViewEvolutions}
            />
        );
    });
}

/**
 * Helper to force UI render
 */
export async function forceReactAgenticUIRender() {
    return new Promise<void>(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}
