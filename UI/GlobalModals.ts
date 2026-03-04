/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModalType = 'red-team' | 'deepthink-red-team' | 'patches';

export interface ModalState {
    isActive: boolean;
    content: string;
}

const modalStates: Record<ModalType, ModalState> = {
    'red-team': { isActive: false, content: '' },
    'deepthink-red-team': { isActive: false, content: '' },
    'patches': { isActive: false, content: '' }
};

export function getModalState(type: ModalType): ModalState {
    return modalStates[type];
}

export function setModalContent(type: ModalType, content: string): void {
    modalStates[type].content = content;
}

export function setModalActive(type: ModalType, active: boolean): void {
    modalStates[type].isActive = active;
}

export function toggleModalExpanded(elementId: string): boolean {
    const content = document.getElementById(elementId);
    if (!content) return false;

    const isExpanded = content.classList.contains('expanded');
    if (isExpanded) {
        content.classList.remove('expanded');
    } else {
        content.classList.add('expanded');
    }
    return !isExpanded;
}

export function getModalElement(type: ModalType): { modal: HTMLElement | null; content: HTMLElement | null } {
    const ids = {
        'red-team': { modal: 'red-team-full-modal', content: 'red-team-modal-content' },
        'deepthink-red-team': { modal: 'deepthink-red-team-full-modal', content: 'deepthink-red-team-modal-content' },
        'patches': { modal: 'patches-modal-overlay', content: 'patches-modal-content' }
    };
    
    return {
        modal: document.getElementById(ids[type].modal),
        content: document.getElementById(ids[type].content)
    };
}

export function showModal(type: ModalType, content?: string): void {
    const { modal, content: contentEl } = getModalElement(type);
    if (content && contentEl) {
        contentEl.innerHTML = `<pre>${content}</pre>`;
    }
    if (modal) {
        modal.classList.add('active');
    }
    setModalActive(type, true);
}

export function closeModal(type: ModalType): void {
    const { modal } = getModalElement(type);
    if (modal) {
        modal.classList.remove('active');
    }
    setModalActive(type, false);
}

export function initializeGlobalModalFunctions(): void {
    (window as any).toggleRedTeamReasoning = function (agentId: string) {
        toggleModalExpanded(`red-team-reasoning-${agentId}`);
    };

    (window as any).showFullRedTeamReasoning = function (_agentId: string, fullContent: string) {
        setModalContent('red-team', fullContent);
        showModal('red-team', fullContent);
    };

    (window as any).closeRedTeamModal = function () {
        closeModal('red-team');
    };

    (window as any).toggleDeepthinkRedTeamReasoning = function (agentId: string) {
        toggleModalExpanded(`deepthink-red-team-reasoning-${agentId}`);
    };

    (window as any).showFullDeepthinkRedTeamReasoning = function (_agentId: string, fullContent: string) {
        setModalContent('deepthink-red-team', fullContent);
        showModal('deepthink-red-team', fullContent);
    };

    (window as any).closeDeepthinkRedTeamModal = function () {
        closeModal('deepthink-red-team');
    };
}

export function initializePatchesModalHandlers(): void {
    const patchesCloseBtn = document.getElementById('patches-modal-close-button');
    const patchesOverlay = document.getElementById('patches-modal-overlay');
    if (patchesCloseBtn && patchesOverlay) {
        patchesCloseBtn.addEventListener('click', () => {
            patchesOverlay.classList.remove('is-visible');
            setTimeout(() => { (patchesOverlay as HTMLElement).style.display = 'none'; }, 150);
        });
        patchesOverlay.addEventListener('click', (e) => {
            if (e.target === patchesOverlay) {
                patchesOverlay.classList.remove('is-visible');
                setTimeout(() => { (patchesOverlay as HTMLElement).style.display = 'none'; }, 150);
            }
        });
    }
}

export class GlobalModals {
    public static initialize() {
        initializeGlobalModalFunctions();
        initializePatchesModalHandlers();
    }
}
