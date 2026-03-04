/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { copyToClipboard, downloadFile, openLivePreviewFullscreen } from './ActionButtonLogic';

export { copyToClipboard, downloadFile, openLivePreviewFullscreen };

export interface ActionButtonProps {
    id?: string;
    type?: 'copy' | 'download' | 'preview' | 'custom';
    icon: string;
    text: string;
    title?: string;
    disabled?: boolean;
    className?: string;
    onClick?: () => void;
    content?: string | (() => string);
    filename?: string;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
    id,
    type = 'custom',
    icon,
    text,
    title,
    disabled = false,
    className = '',
    onClick,
    content,
    filename = 'file.txt'
}) => {
    const [status, setStatus] = useState<'idle' | 'success'>('idle');

    const handleClick = async () => {
        if (disabled) return;

        const finalContent = typeof content === 'function' ? content() : content;

        if (type === 'copy' && finalContent) {
            const success = await copyToClipboard(finalContent);
            if (success) {
                setStatus('success');
                setTimeout(() => setStatus('idle'), 1500);
            }
        } else if (type === 'download' && finalContent) {
            downloadFile(finalContent, filename, filename.endsWith('html') ? 'text/html' : 'text/plain');
        } else if (type === 'preview' && finalContent) {
            openLivePreviewFullscreen(finalContent);
        }

        if (onClick) {
            onClick();
        }
    };

    const baseClass = type === 'copy' ? 'copy-solution-btn' :
        type === 'download' ? 'download-solution-btn' :
            'action-btn';

    return (
        <button
            id={id}
            className={`button ${baseClass} ${className} ${status === 'success' ? 'copied' : ''}`}
            type="button"
            title={title || text}
            disabled={disabled}
            onClick={handleClick}
        >
            <span className="material-symbols-outlined">
                {status === 'success' ? 'check' : icon}
            </span>
            <span className="button-text">
                {status === 'success' ? 'Copied!' : text}
            </span>
        </button>
    );
};

export interface ActionGroupProps {
    type: 'source' | 'target';
    view: 'instant' | 'preview';
    contentSource?: () => string;
}

export const ActionButtonGroup: React.FC<ActionGroupProps> = ({ type, view, contentSource }) => {
    const copyId = `copy-${view}-${type}-button`;
    const downloadId = `download-${view}-${type}-button`;
    const fullscreenId = `fullscreen-${view}-${type}-button`;

    return (
        <div className="code-actions">
            <ActionButton
                id={copyId}
                type="copy"
                icon="content_copy"
                text="Copy"
                content={contentSource}
            />
            <ActionButton
                id={downloadId}
                type="download"
                icon="download"
                text="Download"
                content={contentSource}
                filename={`${type}-${Date.now()}.html`}
            />
            {view === 'preview' && (
                <ActionButton
                    id={fullscreenId}
                    type="preview"
                    icon="preview"
                    text="Preview"
                    content={contentSource}
                />
            )}
        </div>
    );
};

// ==========================================================
// LEGACY BRIDGES FOR MIGRATION (DiffModalController compat)
// ==========================================================

export const createActionButtons = (type: 'source' | 'target', view: 'instant' | 'preview') => {
    const copyId = `copy-${view}-${type}-button`;
    const downloadId = `download-${view}-${type}-button`;
    const fullscreenId = `fullscreen-${view}-${type}-button`;

    let buttons = `
        <div class="code-actions">
            <button id="${copyId}" class="button copy-solution-btn" type="button" title="Copy">
                <span class="material-symbols-outlined">content_copy</span>
                <span class="button-text">Copy</span>
            </button>
            <button id="${downloadId}" class="button download-solution-btn" type="button" title="Download">
                <span class="material-symbols-outlined">download</span>
                <span class="button-text">Download</span>
            </button>
    `;

    if (view === 'preview') {
        buttons += `
            <button id="${fullscreenId}" class="button" type="button" title="View Fullscreen">
                <span class="material-symbols-outlined">preview</span>
                <span class="button-text">Preview</span>
            </button>
        `;
    }

    buttons += '</div>';
    return buttons;
};

export const bindDiffModalButtons = (
    container: HTMLElement,
    getSourceContent: () => string,
    getTargetContent: () => string
): void => {
    // Bind copy buttons with dynamic content
    container.querySelectorAll('.copy-solution-btn').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return;
        btn.setAttribute('data-bound', 'true');

        btn.addEventListener('click', async () => {
            const buttonId = btn.id;
            const isSource = buttonId.includes('source');
            const content = isSource ? getSourceContent() : getTargetContent();

            if (content) {
                const success = await copyToClipboard(content);
                if (success && btn) {
                    const originalIcon = btn.querySelector('.material-symbols-outlined');
                    const buttonText = btn.querySelector('.button-text');
                    if (originalIcon && buttonText) {
                        const originalIconText = originalIcon.textContent;
                        const originalButtonText = buttonText.textContent;
                        originalIcon.textContent = 'check';
                        buttonText.textContent = 'Copied!';
                        btn.classList.add('copied');
                        setTimeout(() => {
                            originalIcon.textContent = originalIconText;
                            buttonText.textContent = originalButtonText;
                            btn.classList.remove('copied');
                        }, 1500);
                    }
                }
            }
        });
    });

    // Bind download buttons with dynamic content
    container.querySelectorAll('.download-solution-btn').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return;
        btn.setAttribute('data-bound', 'true');

        btn.addEventListener('click', () => {
            const buttonId = btn.id;
            const isSource = buttonId.includes('source');
            const content = isSource ? getSourceContent() : getTargetContent();
            const title = isSource ? 'source' : 'target';

            if (content) {
                const filename = `${title}-${Date.now()}.html`;
                downloadFile(content, filename, 'text/html');
            }
        });
    });

    // Bind fullscreen preview buttons with dynamic content
    container.querySelectorAll('button[id*="fullscreen-preview"]').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return;
        btn.setAttribute('data-bound', 'true');

        btn.addEventListener('click', () => {
            const buttonId = btn.id;
            const isSource = buttonId.includes('source');
            const content = isSource ? getSourceContent() : getTargetContent();

            if (content) {
                openLivePreviewFullscreen(content);
            }
        });
    });
};

// Global polyfill for original document bindings (for backward compatibility if any vanilla JS expects it)
export const bindCopyDownloadButtons = (container: HTMLElement | Document = document): void => {
    // Only bind to ones not inside React components (React components don't have this attribute)
    container.querySelectorAll('.copy-solution-btn:not([data-react-bound])').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return;
        btn.setAttribute('data-bound', 'true');
        btn.addEventListener('click', async () => {
            const content = btn.getAttribute('data-content') || '';
            const success = await copyToClipboard(content);
            if (success) {
                const originalIcon = btn.querySelector('.material-symbols-outlined');
                const buttonText = btn.querySelector('.button-text');
                if (originalIcon && buttonText) {
                    const originalIconText = originalIcon.textContent;
                    const originalButtonText = buttonText.textContent;
                    originalIcon.textContent = 'check';
                    buttonText.textContent = 'Copied!';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        originalIcon.textContent = originalIconText;
                        buttonText.textContent = originalButtonText;
                        btn.classList.remove('copied');
                    }, 1500);
                }
            }
        });
    });

    container.querySelectorAll('.download-solution-btn:not([data-react-bound])').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return;
        btn.setAttribute('data-bound', 'true');
        btn.addEventListener('click', () => {
            const content = btn.getAttribute('data-content') || '';
            const filename = btn.getAttribute('data-filename') || 'solution.md';
            downloadFile(content, filename);
        });
    });
};

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bindCopyDownloadButtons());
    } else {
        bindCopyDownloadButtons();
    }
}