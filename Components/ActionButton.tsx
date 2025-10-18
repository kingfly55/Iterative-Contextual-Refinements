// Utility functions for copy and download operations
export const copyToClipboard = async (content: string, button?: HTMLElement): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(content);
        
        // Show silent feedback on the button itself
        if (button) {
            const originalIcon = button.querySelector('.material-symbols-outlined');
            const buttonText = button.querySelector('.button-text');
            if (originalIcon && buttonText) {
                const originalIconText = originalIcon.textContent;
                const originalButtonText = buttonText.textContent;
                
                originalIcon.textContent = 'check';
                buttonText.textContent = 'Copied!';
                button.classList.add('copied');
                
                setTimeout(() => {
                    originalIcon.textContent = originalIconText;
                    buttonText.textContent = originalButtonText;
                    button.classList.remove('copied');
                }, 1500);
            }
        }
        
        return true;
    } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        return false;
    }
};

export const downloadFile = (content: string, filename: string, mimeType = 'text/plain'): void => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

// Enhanced action button creation with more flexibility
export interface ActionButtonConfig {
    id?: string;
    type?: 'copy' | 'download' | 'preview' | 'custom';
    icon: string;
    text: string;
    title?: string;
    disabled?: boolean;
    className?: string;
    onClick?: () => void;
    content?: string; // For copy/download buttons
    filename?: string; // For download buttons
}

export const createActionButton = (config: ActionButtonConfig): string => {
    const {
        id = `action-btn-${Math.random().toString(36).substr(2, 9)}`,
        type = 'custom',
        icon,
        text,
        title = text,
        disabled = false,
        className = '',
        content = '',
        filename = 'file.txt'
    } = config;

    const baseClass = type === 'copy' ? 'copy-solution-btn' : 
                     type === 'download' ? 'download-solution-btn' : 
                     'action-btn';
    
    const dataAttrs = type === 'copy' || type === 'download' ? 
        `data-content="${content.replace(/"/g, '&quot;')}"` + 
        (type === 'download' ? ` data-filename="${filename}"` : '') : '';

    return `
        <button 
            id="${id}" 
            class="button ${baseClass} ${className}" 
            type="button" 
            title="${title}"
            ${disabled ? 'disabled' : ''}
            ${dataAttrs}
        >
            <span class="material-symbols-outlined">${icon}</span>
            <span class="button-text">${text}</span>
        </button>
    `;
};

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

export const bindActionButtons = (
    type: 'source' | 'target',
    view: 'instant' | 'preview',
    copyFn: (type: 'source' | 'target') => void,
    downloadFn: (type: 'source' | 'target') => void,
    fullscreenFn?: (type: 'source' | 'target') => void
) => {
    const copyButton = document.getElementById(`copy-${view}-${type}-button`);
    if (copyButton && !copyButton.hasAttribute('data-bound')) {
        copyButton.setAttribute('data-bound', 'true');
        copyButton.addEventListener('click', () => copyFn(type));
    }

    const downloadButton = document.getElementById(`download-${view}-${type}-button`);
    if (downloadButton && !downloadButton.hasAttribute('data-bound')) {
        downloadButton.setAttribute('data-bound', 'true');
        downloadButton.addEventListener('click', () => downloadFn(type));
    }

    if (view === 'preview' && fullscreenFn) {
        const fullscreenButton = document.getElementById(`fullscreen-${view}-${type}-button`);
        if (fullscreenButton && !fullscreenButton.hasAttribute('data-bound')) {
            fullscreenButton.setAttribute('data-bound', 'true');
            fullscreenButton.addEventListener('click', () => fullscreenFn(type));
        }
    }
};

// Universal event binding for copy/download buttons
export const bindCopyDownloadButtons = (container: HTMLElement | Document = document): void => {
    // Bind copy buttons
    container.querySelectorAll('.copy-solution-btn').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return; // Avoid double binding
        btn.setAttribute('data-bound', 'true');
        
        btn.addEventListener('click', async () => {
            const content = btn.getAttribute('data-content') || '';
            const success = await copyToClipboard(content, btn as HTMLElement);
            if (!success) {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = content;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
        });
    });

    // Bind download buttons
    container.querySelectorAll('.download-solution-btn').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return; // Avoid double binding
        btn.setAttribute('data-bound', 'true');
        
        btn.addEventListener('click', () => {
            const content = btn.getAttribute('data-content') || '';
            const filename = btn.getAttribute('data-filename') || 'solution.md';
            downloadFile(content, filename);
        });
    });
};

// Specific binding for DiffModal buttons with dynamic content
export const bindDiffModalButtons = (container: HTMLElement, getSourceContent: () => string, getTargetContent: () => string): void => {
    // Bind copy buttons with dynamic content
    container.querySelectorAll('.copy-solution-btn').forEach(btn => {
        if (btn.hasAttribute('data-bound')) return;
        btn.setAttribute('data-bound', 'true');
        
        btn.addEventListener('click', async () => {
            const buttonId = btn.id;
            const isSource = buttonId.includes('source');
            const content = isSource ? getSourceContent() : getTargetContent();
            
            if (content) {
                await copyToClipboard(content, btn as HTMLElement);
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

// Function to open fullscreen preview (shared helper)
export const openLivePreviewFullscreen = (content: string) => {
    if (content) {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            // Add escape key listener to close the window
            const fullscreenContent = `
                ${content}
                <script>
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape') {
                            window.close();
                        }
                    });
                    
                    // Add visual indicator that escape closes the window
                    const indicator = document.createElement('div');
                    indicator.style.cssText = \`
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        background: rgba(0,0,0,0.8);
                        color: white;
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-family: system-ui, sans-serif;
                        font-size: 12px;
                        z-index: 10000;
                        opacity: 0.7;
                        pointer-events: none;
                    \`;
                    indicator.textContent = 'Press ESC to close';
                    document.body.appendChild(indicator);
                    
                    // Hide indicator after 3 seconds
                    setTimeout(() => {
                        if (indicator.parentNode) {
                            indicator.style.opacity = '0';
                            setTimeout(() => indicator.remove(), 300);
                        }
                    }, 3000);
                <\/script>
            `;
            
            newWindow.document.write(fullscreenContent);
            newWindow.document.close();
        }
    }
};

// Initialize global event listeners when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bindCopyDownloadButtons());
    } else {
        bindCopyDownloadButtons();
    }
}