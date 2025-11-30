/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { globalState } from '../Core/State';

export class LayoutController {
    private static sidebarIsCollapsed = false;

    public static initialize() {
        this.initializeSidebarControls();
        this.initializeThemeToggle();
        this.initializeFullscreenHandler();

        // Global function to reinitialize sidebar controls (called from other functions)
        (window as any).pipelinesState = globalState.pipelinesState;

        // Re-initialize sidebar controls whenever tabs are updated
        const observer = new MutationObserver(() => {
            // Call ensureExpandButton to maintain button after tab changes
            this.ensureExpandButton();
        });

        const tabsContainer = document.getElementById('tabs-nav-container');
        if (tabsContainer) {
            observer.observe(tabsContainer, { childList: true, subtree: true });
        }
    }

    public static ensureExpandButton() {
        // Button now exists in HTML, just show/hide it
        const expandButton = document.getElementById('sidebar-expand-button');
        if (expandButton) {
            expandButton.style.display = this.sidebarIsCollapsed ? 'flex' : 'none';
        }
    }

    private static initializeSidebarControls() {
        const sidebarCollapseButton = document.getElementById('sidebar-collapse-button');
        const controlsSidebar = document.getElementById('controls-sidebar');
        const mainContent = document.getElementById('main-content');
        const expandButton = document.getElementById('sidebar-expand-button');

        // Initialize expand button visibility based on current state
        if (controlsSidebar && controlsSidebar.classList.contains('collapsed')) {
            this.sidebarIsCollapsed = true;
            if (expandButton) {
                expandButton.style.display = 'flex';
            }
        }

        // Attach expand button handler (button exists in HTML)
        if (expandButton) {
            expandButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (controlsSidebar) {
                    controlsSidebar.classList.remove('collapsed');
                    this.sidebarIsCollapsed = false;
                    expandButton.style.display = 'none';
                }
            });
        }

        if (sidebarCollapseButton && controlsSidebar) {
            // Remove existing listeners to avoid duplicates
            const newCollapseButton = sidebarCollapseButton.cloneNode(true) as HTMLElement;
            sidebarCollapseButton.replaceWith(newCollapseButton);

            newCollapseButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Force layout recalculation before transition
                controlsSidebar.offsetHeight;

                // Add transition class and collapse
                controlsSidebar.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
                controlsSidebar.classList.add('collapsed');
                this.sidebarIsCollapsed = true;

                // Force repaint to ensure smooth transition
                requestAnimationFrame(() => {
                    // Show expand button
                    const expandBtn = document.getElementById('sidebar-expand-button');
                    if (expandBtn) {
                        expandBtn.style.display = 'flex';
                    }

                    // Trigger layout recalculation for main content
                    if (mainContent) {
                        mainContent.style.transform = 'translateZ(0)';
                        setTimeout(() => {
                            mainContent.style.transform = '';
                        }, 300);
                    }
                });
            });
        }
    }

    private static initializeThemeToggle() {
        // Load saved theme preference or default to dark mode
        const savedTheme = localStorage.getItem('theme') || 'dark';
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            const themeToggleButton = document.getElementById('theme-toggle-button');
            const themeIcon = themeToggleButton?.querySelector('.material-symbols-outlined');
            if (themeIcon) themeIcon.textContent = 'dark_mode';
        }

        // Use event delegation on document to ensure it always works
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const themeToggleButton = target.closest('#theme-toggle-button');

            if (themeToggleButton) {
                e.preventDefault();
                e.stopPropagation();

                const isLightMode = document.body.classList.toggle('light-mode');

                // Query for icon each time to avoid stale references
                const themeIcon = themeToggleButton.querySelector('.material-symbols-outlined');
                if (themeIcon) {
                    themeIcon.textContent = isLightMode ? 'dark_mode' : 'light_mode';
                }

                // Save preference
                localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
            }
        }, true); // Use capture phase to ensure we catch it first
    }

    private static initializeFullscreenHandler() {
        document.addEventListener('fullscreenchange', () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            document.querySelectorAll('.fullscreen-toggle-button').forEach(button => {
                const btn = button as HTMLButtonElement;
                const iconFullscreen = btn.querySelector('.icon-fullscreen') as HTMLElement;
                const iconExitFullscreen = btn.querySelector('.icon-exit-fullscreen') as HTMLElement;
                const previewContainerId = btn.id.replace('fullscreen-btn-', 'preview-container-');
                const associatedPreviewContainer = document.getElementById(previewContainerId);

                if (isCurrentlyFullscreen && document.fullscreenElement === associatedPreviewContainer) {
                    if (iconFullscreen) iconFullscreen.style.display = 'none';
                    if (iconExitFullscreen) iconExitFullscreen.style.display = 'inline-block';
                    btn.title = "Exit Fullscreen Preview";
                    btn.setAttribute('aria-label', "Exit Fullscreen Preview");
                } else {
                    if (iconFullscreen) iconFullscreen.style.display = 'inline-block';
                    if (iconExitFullscreen) iconExitFullscreen.style.display = 'none';
                    btn.title = "Toggle Fullscreen Preview";
                    btn.setAttribute('aria-label', "Toggle Fullscreen Preview");
                }
            });
        });
    }
}
