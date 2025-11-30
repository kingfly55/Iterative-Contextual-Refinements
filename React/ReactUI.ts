
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { globalState } from '../Core/State';
import { MonacoFileEditor } from '../Components/MonacoFileEditor';
import { createAndDownloadReactProjectZip } from '../Utils/FileUtils';
import { activateTab, clearTabsContainer } from '../UI/Tabs';
import { renderMathContent } from '../Components/RenderMathMarkdown';
import { escapeHtml, copyToClipboard } from '../Utils/DOMHelpers';
import { getEmptyStateMessage } from '../UI/CommonUI';
import { updateControlsState } from '../UI/Controls';

const MAX_RETRIES = 3;

export function renderReactModePipeline() {
    console.log('[ReactUI] renderReactModePipeline called');
    let tabsNavContainer = document.getElementById('tabs-nav-container') as HTMLElement;
    let pipelinesContentContainer = document.getElementById('pipelines-content-container') as HTMLElement;

    if (globalState.currentMode !== 'react' || !tabsNavContainer || !pipelinesContentContainer) {
        if (globalState.currentMode !== 'react' && tabsNavContainer && pipelinesContentContainer) {
            console.log('[ReactUI] Clearing container because mode is not react:', globalState.currentMode);
            clearTabsContainer();
            pipelinesContentContainer.innerHTML = '';
        }
        return;
    }

    if (!globalState.activeReactPipeline) {
        console.log('[ReactUI] No activeReactPipeline to render');
        pipelinesContentContainer.innerHTML = '';
        return;
    }

    const pipeline = globalState.activeReactPipeline;

    clearTabsContainer();
    pipelinesContentContainer.innerHTML = '';

    const agenticTab = document.createElement('button');
    agenticTab.id = 'react-tab-agentic-refinements';
    agenticTab.className = 'tab-button react-mode-tab';
    agenticTab.textContent = 'Agentic Refinements';
    agenticTab.setAttribute('role', 'tab');
    agenticTab.setAttribute('aria-controls', 'pipeline-content-agentic-refinements');
    agenticTab.addEventListener('click', () => activateTab('agentic-refinements'));
    (agenticTab.style as any).whiteSpace = 'nowrap';
    tabsNavContainer.appendChild(agenticTab);

    if (!document.getElementById('pipeline-content-agentic-refinements')) {
        const agenticPane = document.createElement('div');
        agenticPane.id = 'pipeline-content-agentic-refinements';
        agenticPane.className = 'pipeline-content pipeline-fade-in';
        agenticPane.style.padding = '0';
        agenticPane.style.height = '100%';

        const agenticContainer = document.createElement('div');
        agenticContainer.id = 'agentic-refinements-container';
        agenticContainer.style.height = '100vh';
        agenticContainer.style.minHeight = '500px';
        agenticContainer.style.width = '100%';
        agenticPane.appendChild(agenticContainer);
        pipelinesContentContainer.appendChild(agenticPane);

        if (pipeline.initialAgenticContent && !pipeline.agenticRefineStarted) {
            pipeline.agenticRefineStarted = true;
            import('../React/ReactAgenticIntegration').then(({ startReactAgenticProcess }) => {
                startReactAgenticProcess(
                    agenticContainer,
                    pipeline.initialAgenticContent || '',
                    pipeline,
                    globalState.customPromptsReactState,
                    (content: string, isComplete?: boolean) => {
                        if (globalState.activeReactPipeline) {
                            globalState.activeReactPipeline.finalAppendedCode = content;
                            const monacoRoot = (window as any).__monacoEditorRoot;
                            if (monacoRoot) {
                                monacoRoot.render(
                                    React.createElement(MonacoFileEditor, {
                                        content: content,
                                        onContentChange: (newContent: string) => {
                                            if (globalState.activeReactPipeline) {
                                                globalState.activeReactPipeline.finalAppendedCode = newContent;
                                            }
                                        },
                                        onDownload: createAndDownloadReactProjectZip,
                                        readOnly: true,
                                        forceDarkTheme: false
                                    })
                                );
                            }
                            if (isComplete && globalState.activeReactPipeline && globalState.activeReactPipeline.status !== 'completed') {
                                globalState.activeReactPipeline.status = 'completed';
                                renderReactModePipeline();
                            }
                        }
                    }
                );
            });
        } else if (pipeline.agenticRefineStarted) {
            import('../React/ReactAgenticIntegration').then(({ rehydrateReactAgenticUI }) => {
                rehydrateReactAgenticUI(agenticContainer);
            });
        } else {
            agenticContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; color: var(--text-secondary);">
                    <div class="spinner" style="width: 40px; height: 40px; border: 3px solid var(--border-color); border-top-color: var(--accent-blue); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="font-size: 0.875rem;">Preparing React application files...</p>
                    <p style="font-size: 0.75rem; opacity: 0.7;">Plan.md and WorkerAgentsPrompts.json will load shortly</p>
                </div>
            `;
        }

        const dlAgentic = document.getElementById('download-react-runnable-project-agentic');
        if (dlAgentic) dlAgentic.addEventListener('click', createAndDownloadReactProjectZip);
    }

    if (pipeline.error && (pipeline.status === 'failed' || (pipeline.status === 'error' && pipeline.stages.every(s => s.status === 'pending')))) {
        const errorPane = document.createElement('div');
        errorPane.className = 'pipeline-content';
        errorPane.innerHTML = `<div class="status-message error"><pre>${escapeHtml(pipeline.error)}</pre></div>`;
        pipelinesContentContainer.appendChild(errorPane);
    }

    const stopReactButton = document.getElementById('stop-react-pipeline-btn');
    if (stopReactButton) {
        stopReactButton.onclick = () => {
            if (globalState.activeReactPipeline && (globalState.activeReactPipeline.status === 'orchestrating' || globalState.activeReactPipeline.status === 'agentic_orchestrating' || globalState.activeReactPipeline.status === 'processing_workers')) {
                globalState.activeReactPipeline.isStopRequested = true;
                globalState.activeReactPipeline.status = 'stopping';
                renderReactModePipeline();
            }
        };
        (stopReactButton as HTMLButtonElement).disabled = pipeline.status === 'stopping' || pipeline.status === 'stopped' || pipeline.status === 'failed' || pipeline.status === 'completed';
    }

    if (pipeline.workersExecuted) {
        pipeline.stages.forEach(stage => {
            const tabButtonId = `react-tab-worker-${stage.id}`;
            const contentPaneId = `pipeline-content-worker-${stage.id}`;

            const tabButton = document.createElement('button');
            tabButton.id = tabButtonId;
            tabButton.className = `tab-button react-mode-tab status-${stage.status}`;
            const cleanTitle = (stage.title || `Worker ${stage.id + 1}`).replace(/^Agent\s*\d+\s*:\s*/i, '').trim();
            tabButton.textContent = cleanTitle;
            (tabButton.style as any).whiteSpace = 'nowrap';
            tabButton.setAttribute('role', 'tab');
            tabButton.setAttribute('aria-controls', contentPaneId);
            tabButton.addEventListener('click', () => activateTab(`worker-${stage.id}`));
            tabsNavContainer.appendChild(tabButton);

            const workerContentPane = document.createElement('div');
            workerContentPane.id = contentPaneId;
            workerContentPane.className = 'pipeline-content';

            let displayStatusText = stage.status.charAt(0).toUpperCase() + stage.status.slice(1);
            if (stage.status === 'retrying' && stage.retryAttempt !== undefined) {
                displayStatusText = `Retrying (${stage.retryAttempt}/${MAX_RETRIES})...`;
            }

            const hasContent = !!stage.generatedContent;
            let contentBlock;
            if (hasContent) {
                const contentToRender = `\`\`\`tsx\n${stage.generatedContent!}\n\`\`\``;
                contentBlock = renderMathContent(contentToRender);
            } else {
                contentBlock = `<div class="empty-state-message">${getEmptyStateMessage(stage.status, 'code')}</div>`;
            }

            let workerDetailsHtml = `
            <div class="react-worker-content-pane model-detail-card">
                 <div class="model-detail-header">
                    <div class="model-title-area">
                        <h4 class="model-title">${escapeHtml(stage.title)}</h4>
                    </div>
                    <div class="model-card-actions">
                        <span class="status-badge status-${stage.status}">${displayStatusText}</span>
                    </div>
                </div>
                <div class="worker-details-grid">
                    <div class="info-column">
                        ${stage.error ? `<div class="status-message error"><pre>${escapeHtml(stage.error)}</pre></div>` : ''}
                        <details class="model-detail-section collapsible-section" open>
                            <summary class="model-section-title">System Instruction</summary>
                            <div class="scrollable-content-area custom-scrollbar"><pre>${escapeHtml(stage.systemInstruction || "Not available.")}</pre></div>
                        </details>
                        <details class="model-detail-section collapsible-section">
                            <summary class="model-section-title">Rendered User Prompt</summary>
                            <div class="scrollable-content-area custom-scrollbar"><pre>${escapeHtml(stage.renderedUserPrompt || stage.userPrompt || "Not available.")}</pre></div>
                        </details>
                    </div>
                    <div class="code-column">
                        <div class="model-detail-section">
                            <div class="code-block-header">
                                <span class="model-section-title">Generated Code/Content</span>
                            </div>
                            <div class="code-block-wrapper scrollable-content-area custom-scrollbar">${contentBlock}</div>
                        </div>
                    </div>
                </div>
            </div>`;
            workerContentPane.innerHTML = workerDetailsHtml;
            pipelinesContentContainer.appendChild(workerContentPane);

            const copyBtn = workerContentPane.querySelector('.copy-react-worker-code-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    const workerId = parseInt((e.currentTarget as HTMLElement).dataset.workerId || "-1", 10);
                    const contentToCopy = globalState.activeReactPipeline?.stages.find(s => s.id === workerId)?.generatedContent;
                    if (contentToCopy) {
                        copyToClipboard(contentToCopy, e.currentTarget as HTMLButtonElement);
                    }
                });
            }

            const downloadBtn = workerContentPane.querySelector('.download-react-worker-code-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', async (e) => {
                    const workerId = parseInt((e.currentTarget as HTMLElement).dataset.workerId || "-1", 10);
                    const stage = globalState.activeReactPipeline?.stages.find(s => s.id === workerId);
                    if (stage?.generatedContent) {
                        const safeTitle = stage.title.replace(/[\s&/\\?#]+/g, '_').toLowerCase();
                        const { downloadFile } = await import('../Components/ActionButton');
                        downloadFile(stage.generatedContent, `react_worker_${stage.id}_${safeTitle}.txt`, 'text/plain');
                    }
                });
            }
        });
    }

    if (pipeline.finalAppendedCode) {
        const finalOutputPane = document.createElement('div');
        finalOutputPane.className = 'react-final-output-pane';
        finalOutputPane.innerHTML = `
            <div id="monaco-editor-mount" style="height: calc(100vh - 12rem); min-height: 500px; margin-top: 0;"></div>
        `;
        const orchestratorDiv = document.getElementById('pipeline-content-orchestrator');
        orchestratorDiv?.appendChild(finalOutputPane);

        const mountPoint = document.getElementById('monaco-editor-mount');
        if (mountPoint && pipeline.finalAppendedCode) {
            let root = (window as any).__monacoEditorRoot;
            if (!root) {
                root = ReactDOM.createRoot(mountPoint);
                (window as any).__monacoEditorRoot = root;
            }

            const handleContentChange = (newContent: string) => {
                if (globalState.activeReactPipeline) {
                    globalState.activeReactPipeline.finalAppendedCode = newContent;
                }
            };

            root.render(
                React.createElement(MonacoFileEditor, {
                    content: pipeline.finalAppendedCode,
                    onContentChange: handleContentChange,
                    onDownload: createAndDownloadReactProjectZip,
                    readOnly: false,
                    forceDarkTheme: false
                })
            );
        }

        if (!document.getElementById('react-tab-agentic-refinements') && pipeline.finalAppendedCode) {
            const agenticTabLate = document.createElement('button');
            agenticTabLate.id = 'react-tab-agentic-refinements';
            agenticTabLate.className = 'tab-button react-mode-tab';
            agenticTabLate.textContent = 'Agentic Refinements';
            agenticTabLate.setAttribute('role', 'tab');
            agenticTabLate.setAttribute('aria-controls', 'pipeline-content-agentic-refinements');
            agenticTabLate.addEventListener('click', () => activateTab('agentic-refinements'));
            if (tabsNavContainer.firstChild) {
                tabsNavContainer.insertBefore(agenticTabLate, tabsNavContainer.firstChild);
            } else {
                tabsNavContainer.appendChild(agenticTabLate);
            }
        }
    }

    if (pipeline.previewUrl) {
        if (!document.getElementById('react-tab-preview')) {
            const previewTab = document.createElement('button');
            previewTab.id = 'react-tab-preview';
            previewTab.className = 'tab-button react-mode-tab';
            previewTab.textContent = 'Preview';
            previewTab.setAttribute('role', 'tab');
            previewTab.setAttribute('aria-controls', 'pipeline-content-preview');
            previewTab.addEventListener('click', () => activateTab('preview'));

            const agenticTab = document.getElementById('react-tab-agentic-refinements');
            if (agenticTab && agenticTab.nextSibling) {
                tabsNavContainer.insertBefore(previewTab, agenticTab.nextSibling);
            } else {
                tabsNavContainer.appendChild(previewTab);
            }
        }

        const previewPane = document.createElement('div');
        previewPane.id = 'pipeline-content-preview';
        previewPane.className = 'pipeline-content';
        previewPane.style.height = '100%';
        previewPane.style.position = 'relative';
        previewPane.style.display = 'flex';
        previewPane.style.flexDirection = 'column';

        previewPane.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color); background: var(--card-bg-color);">
                <h3 style="margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-color);">Live Preview</h3>
                <button 
                    id="react-preview-open-new-tab" 
                    class="button primary-action"
                    style="display: flex; align-items: center; gap: 6px; padding: 0.5rem 1rem;"
                    title="Open preview in new browser tab"
                >
                    <span class="material-symbols-outlined" style="font-size: 18px;">open_in_new</span>
                    <span>Open in New Tab</span>
                </button>
            </div>
            <div style="flex: 1; position: relative; overflow: hidden;">
                <iframe 
                    src="${pipeline.previewUrl}" 
                    style="width: 100%; height: 100%; border: none; background: white;"
                    sandbox="allow-scripts allow-same-origin"
                ></iframe>
            </div>
        `;
        pipelinesContentContainer.appendChild(previewPane);

        setTimeout(() => {
            const openNewTabBtn = document.getElementById('react-preview-open-new-tab');
            if (openNewTabBtn && pipeline.previewUrl) {
                openNewTabBtn.addEventListener('click', () => {
                    window.open(pipeline.previewUrl, '_blank');
                });
            }
        }, 0);
    }

    const tabsNavContainerEl = document.getElementById('tabs-nav-container');
    if (tabsNavContainerEl) (tabsNavContainerEl as HTMLElement).scrollLeft = 0;

    if (pipeline.activeTabId) {
        activateTab(pipeline.activeTabId);
    } else {
        activateTab('agentic-refinements');
    }
    updateControlsState();
}
