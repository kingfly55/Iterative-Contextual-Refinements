/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { AgenticConfig } from './AgenticPromptsManager';

interface AgenticImportExportProps {
    onImport: (config: AgenticConfig) => void;
    onExport: () => AgenticConfig;
    onReset: () => void;
}

/**
 * Encapsulated browser download utility
 * Does NOT interact with the React Virtual DOM or inject elements into the app UI.
 */
function triggerDownload(dataUri: string, filename: string) {
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', filename);
    linkElement.style.display = 'none';
    document.body.appendChild(linkElement); // Clean hook required by some browsers
    linkElement.click();
    document.body.removeChild(linkElement);
}

export const AgenticImportExport: React.FC<AgenticImportExportProps> = ({
    onImport,
    onExport,
    onReset
}) => {
    const handleExport = () => {
        const config = onExport();
        const dataStr = JSON.stringify(config, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `agentic-config-${new Date().toISOString().slice(0, 10)}.json`;

        triggerDownload(dataUri, exportFileDefaultName);
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target?.result as string) as AgenticConfig;
                onImport(config);
                // Reset the input for subsequent uploads of the same file
                event.target.value = '';
            } catch (error) {
                console.error('Failed to import config:', error);
                alert('Failed to import configuration. Please check the file format.');
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="agentic-import-export">
            <div className="import-export-buttons">
                <button
                    className="export-button"
                    onClick={handleExport}
                    title="Export Agentic configuration and results"
                >
                    <span className="material-symbols-outlined">download</span>
                    Export Config
                </button>

                <label className="import-button" title="Import Agentic configuration">
                    <span className="material-symbols-outlined">upload</span>
                    Import Config
                    <input
                        type="file"
                        accept=".json"
                        onChange={handleImport}
                        style={{ display: 'none' }}
                    />
                </label>

                <button
                    className="reset-button"
                    onClick={onReset}
                    title="Reset to default system prompt"
                >
                    <span className="material-symbols-outlined">restart_alt</span>
                    Reset Defaults
                </button>
            </div>
        </div>
    );
};
