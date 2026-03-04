/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure Logic Utilities for action operations
export const copyToClipboard = async (content: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(content);
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

// Function to open fullscreen preview (pure window manipulation)
export const openLivePreviewFullscreen = (content: string) => {
    if (content) {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            const fullscreenContent = `
                ${content}
                <script>
                    document.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape') {
                            window.close();
                        }
                    });
                    
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
