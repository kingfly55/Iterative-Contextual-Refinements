/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderMathContent } from './RenderMathMarkdown';

export interface ModalMessage {
    id: string;
    role: string;
    content: string;
    iterationNumber: number;
}

/**
 * Opens an embedded modal with blur backdrop (reusable across modes)
 * @param title - Modal title
 * @param content - HTML content to display
 * @param currentMessage - Optional current message for navigation
 * @param allMessages - Optional all messages for navigation
 */
export function openEmbeddedModal(
    title: string,
    content: string,
    currentMessage?: ModalMessage,
    allMessages?: ModalMessage[]
): void {
    // Preserve the original title (agent name) for navigation
    const baseTitle = title;
    // Create embedded modal overlay with blur backdrop
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'embedded-modal-overlay';
    modalOverlay.style.position = 'fixed';
    
    // Detect if we're inside Deepthink modal (z-index 2100) and boost z-index accordingly
    const isInsideDeepthinkModal = document.getElementById('solution-modal-overlay') !== null;
    modalOverlay.style.setProperty('z-index', isInsideDeepthinkModal ? '2200' : '1000', 'important');
    modalOverlay.style.pointerEvents = 'auto';

    const modalContent = document.createElement('div');
    modalContent.className = 'embedded-modal-content';

    // Determine if navigation is available
    const hasNavigation = currentMessage && allMessages && allMessages.length > 1;
    let prevMessage: ModalMessage | null = null;
    let nextMessage: ModalMessage | null = null;

    if (hasNavigation) {
        // Filter messages from the same agent
        const sameAgentMessages = allMessages
            .filter(m => m.role === currentMessage.role)
            .sort((a, b) => a.iterationNumber - b.iterationNumber);
        
        const currentIndex = sameAgentMessages.findIndex(m => m.id === currentMessage.id);
        if (currentIndex > 0) {
            prevMessage = sameAgentMessages[currentIndex - 1];
        }
        if (currentIndex < sameAgentMessages.length - 1) {
            nextMessage = sameAgentMessages[currentIndex + 1];
        }
    }

    modalContent.innerHTML = `
        <div class="modal-header" style="display:flex;justify-content:space-between;align-items:center;">
            <div class="embedded-modal-header-left" style="display:flex;flex-direction:row;align-items:center;gap:.5rem;">
                <div class="modal-title-row" style="display:flex;flex-direction:row;align-items:center;gap:.5rem;">
                    <h4 style="margin:0;" id="modal-title">${title}</h4>
                    ${hasNavigation && currentMessage ? `<span class="iteration-indicator" id="modal-iteration-indicator" style="display:inline-flex;">${currentMessage.iterationNumber}</span>` : ''}
                </div>
            </div>
            <div class="embedded-modal-header-controls" style="display:flex;align-items:center;gap:.5rem;margin-left:auto;">
                ${hasNavigation ? `
                    <button class="modal-nav-btn" id="prev-btn" data-nav="prev" ${!prevMessage ? 'disabled' : ''} title="Previous iteration">
                        <span class="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button class="modal-nav-btn" id="next-btn" data-nav="next" ${!nextMessage ? 'disabled' : ''} title="Next iteration">
                        <span class="material-symbols-outlined">chevron_right</span>
                    </button>
                ` : ''}
                <button class="close-modal-btn" id="close-btn">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
        <div class="modal-body custom-scrollbar" id="modal-body">
            <div class="modal-content-wrapper">
                ${renderMathContent(content || 'No content available')}
            </div>
        </div>
    `;

    // Auto-resize modal based on content width
    requestAnimationFrame(() => {
        const contentWrapper = modalContent.querySelector('.modal-content-wrapper') as HTMLElement;
        if (contentWrapper) {
            const scrollWidth = contentWrapper.scrollWidth;
            const currentWidth = modalContent.offsetWidth;
            
            // If content is wider, expand the modal up to max-width
            if (scrollWidth > currentWidth - 100) { // Account for padding
                const newWidth = Math.min(scrollWidth + 100, window.innerWidth * 0.95, 1400);
                modalContent.style.width = `${newWidth}px`;
            }
        }
    });

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Smooth navigation function
    const updateModalContent = (message: ModalMessage) => {
        // Update title and iteration
        const titleElement = modalContent.querySelector('#modal-title') as HTMLElement;
        const iterationElement = modalContent.querySelector('#modal-iteration-indicator') as HTMLElement;
        if (titleElement) titleElement.textContent = baseTitle;
        if (iterationElement) iterationElement.textContent = message.iterationNumber.toString();

        // Update body content with fade effect
        const modalBody = modalContent.querySelector('#modal-body') as HTMLElement;
        if (modalBody) {
            modalBody.style.opacity = '0.3';
            setTimeout(() => {
                const contentWrapper = modalBody.querySelector('.modal-content-wrapper') as HTMLElement;
                if (contentWrapper) {
                    contentWrapper.innerHTML = renderMathContent(message.content || 'No content available');
                }
                modalBody.style.opacity = '1';
            }, 150);
        }

        // Update navigation button states
        const prevBtn = modalContent.querySelector('#prev-btn') as HTMLButtonElement;
        const nextBtn = modalContent.querySelector('#next-btn') as HTMLButtonElement;
        
        if (prevBtn && nextBtn && allMessages) {
            const sameAgentMessages = allMessages
                .filter(m => m.role === message.role)
                .sort((a, b) => a.iterationNumber - b.iterationNumber);
            
            const currentIndex = sameAgentMessages.findIndex(m => m.id === message.id);
            prevBtn.disabled = currentIndex <= 0;
            nextBtn.disabled = currentIndex >= sameAgentMessages.length - 1;
        }

        // Update current message reference for keyboard navigation
        currentMessage = message;
        
        // Re-calculate prev/next messages
        if (allMessages) {
            const sameAgentMessages = allMessages
                .filter(m => m.role === message.role)
                .sort((a, b) => a.iterationNumber - b.iterationNumber);
            
            const currentIndex = sameAgentMessages.findIndex(m => m.id === message.id);
            prevMessage = currentIndex > 0 ? sameAgentMessages[currentIndex - 1] : null;
            nextMessage = currentIndex < sameAgentMessages.length - 1 ? sameAgentMessages[currentIndex + 1] : null;
        }
    };

    // Add close functionality
    const closeBtn = modalContent.querySelector('#close-btn');
    const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeModal();
        } else if (hasNavigation && e.key === 'ArrowLeft' && prevMessage) {
            e.preventDefault();
            updateModalContent(prevMessage);
        } else if (hasNavigation && e.key === 'ArrowRight' && nextMessage) {
            e.preventDefault();
            updateModalContent(nextMessage);
        }
    };
    const closeModal = () => {
        modalOverlay.remove();
        document.removeEventListener('keydown', handleKeydown);
    };

    closeBtn?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', handleKeydown);

    // Add smooth navigation functionality
    if (hasNavigation) {
        const prevBtn = modalContent.querySelector('#prev-btn');
        const nextBtn = modalContent.querySelector('#next-btn');

        if (prevBtn && prevMessage) {
            prevBtn.addEventListener('click', () => {
                updateModalContent(prevMessage);
            });
        }

        if (nextBtn && nextMessage) {
            nextBtn.addEventListener('click', () => {
                updateModalContent(nextMessage);
            });
        }
    }
}
