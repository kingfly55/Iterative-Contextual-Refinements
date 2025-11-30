/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class GlobalModals {
    public static initialize() {
        this.initializeRedTeamModals();
        this.initializeDeepthinkRedTeamModals();
        this.initializePatchesModal();
    }

    private static initializeRedTeamModals() {
        (window as any).toggleRedTeamReasoning = function (agentId: string) {
            const content = document.getElementById(`red-team-reasoning-${agentId}`);
            if (content) {
                if (content.classList.contains('expanded')) {
                    content.classList.remove('expanded');
                } else {
                    content.classList.add('expanded');
                }
            }
        };

        (window as any).showFullRedTeamReasoning = function (_agentId: string, fullContent: string) {
            const modal = document.getElementById('red-team-full-modal');
            const modalContent = document.getElementById('red-team-modal-content');
            if (modal && modalContent) {
                modalContent.innerHTML = `<pre>${fullContent}</pre>`;
                modal.classList.add('active');
            }
        };

        (window as any).closeRedTeamModal = function () {
            const modal = document.getElementById('red-team-full-modal');
            if (modal) {
                modal.classList.remove('active');
            }
        };
    }

    private static initializeDeepthinkRedTeamModals() {
        (window as any).toggleDeepthinkRedTeamReasoning = function (agentId: string) {
            const content = document.getElementById(`deepthink-red-team-reasoning-${agentId}`);
            if (content) {
                if (content.classList.contains('expanded')) {
                    content.classList.remove('expanded');
                } else {
                    content.classList.add('expanded');
                }
            }
        };

        (window as any).showFullDeepthinkRedTeamReasoning = function (_agentId: string, fullContent: string) {
            const modal = document.getElementById('deepthink-red-team-full-modal');
            const modalContent = document.getElementById('deepthink-red-team-modal-content');
            if (modal && modalContent) {
                modalContent.innerHTML = `<pre>${fullContent}</pre>`;
                modal.classList.add('active');
            }
        };

        (window as any).closeDeepthinkRedTeamModal = function () {
            const modal = document.getElementById('deepthink-red-team-full-modal');
            if (modal) {
                modal.classList.remove('active');
            }
        };
    }

    private static initializePatchesModal() {
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
}
