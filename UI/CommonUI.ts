
import { IterationData, EvolutionMode } from '../Core/Types';
import { globalState } from '../Core/State';

export function getEvolutionModeDescription(mode: EvolutionMode): string {
    switch (mode) {
        case 'off':
            return 'Standard refinement. Each iteration builds directly on the previous one.';
        case 'novelty':
            return 'Explores different approaches. If an iteration is too similar to previous ones, it retries with higher temperature.';
        case 'quality':
            return "Ensures improvement. If an iteration doesn't improve the score, it retries with higher temperature.";
    }
}

export function setEvolutionMode(mode: EvolutionMode) {
    globalState.currentEvolutionMode = mode;
    window.dispatchEvent(new CustomEvent('refine:evolution-mode-changed', { detail: { mode } }));
}

export function updateEvolutionModeDescription(mode: EvolutionMode) {
    const el = document.getElementById('evolution-mode-description');
    if (el) el.textContent = getEvolutionModeDescription(mode);
}

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

// SVG icons for copy button states
const COPY_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>`;

const CHECK_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="20 6 9 17 4 12"></polyline>
</svg>`;

// Copy code block with visual feedback
export async function copyCodeBlock(codeId: string) {
    try {
        const copyBtn = document.querySelector(`.copy-code-btn[data-code-id="${codeId}"]`) as HTMLElement | null;
        if (!copyBtn) return;

        // Find code element - try by ID first, then fall back to container search
        let codeElement = document.getElementById(codeId);
        if (!codeElement) {
            const container = copyBtn.closest('.code-block-container');
            codeElement = container?.querySelector('.code-block-content code') as HTMLElement | null;
        }
        if (!codeElement) return;

        const codeText = codeElement.textContent || '';
        await navigator.clipboard.writeText(codeText);

        // Swap to check icon and add copied class
        copyBtn.innerHTML = CHECK_ICON_SVG;
        copyBtn.classList.add('copied');

        // Revert after delay
        setTimeout(() => {
            copyBtn.innerHTML = COPY_ICON_SVG;
            copyBtn.classList.remove('copied');
        }, 1500);
    } catch (_) {
        // Silent fail
    }
}

// Handle image preview globally
export function previewImage(element: HTMLElement) {
    if (element && !element.classList.contains('exec-image-error-item')) {
        const src = element.dataset.src || (element.querySelector('img') as HTMLImageElement)?.src;
        const format = element.dataset.format || 'PNG';

        if (src) {
            window.dispatchEvent(new CustomEvent('exec-image-preview', {
                detail: { src, alt: 'Generated Figure', format }
            }));
        }
    }
}

// Attach to window for HTML onclick handlers
(window as any).toggleCodeBlock = toggleCodeBlock;
(window as any).copyCodeBlock = copyCodeBlock;
(window as any).previewImage = previewImage;
