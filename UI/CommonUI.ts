
import { IterationData } from '../Core/Types';

export function getEmptyStateMessage(status: IterationData['status'] | string, contentType: string): string {
    switch (status) {
        case 'pending': return `${contentType} generation is pending.`;
        case 'processing':
        case 'retrying': return `Generating ${contentType}...`;
        case 'cancelled': return `${contentType} generation was cancelled by the user.`;
        case 'error': return `An error occurred while generating ${contentType}.`;
        default: return `No valid ${contentType} was generated.`;
    }
}

// Global functions for code block actions
export function toggleCodeBlock(codeId: string) {
    const codeContent = document.getElementById(codeId);
    const toggleBtn = document.getElementById(`toggle-${codeId}`);
    const container = codeContent?.closest('.code-block-container');

    if (!codeContent || !toggleBtn || !container) return;

    const isExpanded = codeContent.classList.contains('expanded');

    if (isExpanded) {
        codeContent.classList.remove('expanded');
        codeContent.classList.add('collapsed');
        toggleBtn.classList.remove('expanded');
        container.classList.remove('expanded');
        container.classList.add('collapsed');
    } else {
        codeContent.classList.remove('collapsed');
        codeContent.classList.add('expanded');
        toggleBtn.classList.add('expanded');
        container.classList.remove('collapsed');
        container.classList.add('expanded');
    }
}

// Copy code block with green feedback
export async function copyCodeBlock(codeId: string) {
    try {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;

        const codeText = codeElement.textContent || '';
        await navigator.clipboard.writeText(codeText);

        const copyBtn = document.querySelector(`.copy-code-btn[data-code-id="${codeId}"]`) as HTMLElement | null;
        if (copyBtn) {
            const isLightMode = document.body.classList.contains('light-mode');
            const accentColor = isLightMode ? '#2E7D32' : '#00C853';
            const accentBg = isLightMode ? 'rgba(46, 125, 50, 0.2)' : 'rgba(0, 200, 83, 0.25)';
            const accentBorder = isLightMode ? 'rgba(46, 125, 50, 0.35)' : 'rgba(0, 200, 83, 0.4)';

            // Store original styles
            const originalStyle = copyBtn.getAttribute('style') || '';

            // Force inline styles with setAttribute (highest priority)
            copyBtn.setAttribute('style', `
                color: ${accentColor} !important;
                background: ${accentBg} !important;
                background-color: ${accentBg} !important;
                border: 2px solid ${accentBorder} !important;
                box-shadow: 0 0 12px ${accentBorder} !important;
                opacity: 1 !important;
                transform: scale(1) !important;
                filter: none !important;
            `);

            copyBtn.classList.add('copied');

            // Force SVG color change directly
            const svg = copyBtn.querySelector('svg');
            if (svg) {
                svg.querySelectorAll('rect, path, polyline, line, circle').forEach((shape) => {
                    shape.setAttribute('stroke', accentColor);
                    shape.setAttribute('fill', 'none');
                });
            }

            // Remove after delay
            setTimeout(() => {
                copyBtn.setAttribute('style', originalStyle);

                // Reset SVG to currentColor
                if (svg) {
                    svg.querySelectorAll('rect, path, polyline, line, circle').forEach((shape) => {
                        shape.setAttribute('stroke', 'currentColor');
                    });
                }
            }, 1200);
        }
    } catch (_) {
        // Removed console.error
    }
}

// Attach to window for HTML onclick handlers
(window as any).toggleCodeBlock = toggleCodeBlock;
(window as any).copyCodeBlock = copyCodeBlock;
