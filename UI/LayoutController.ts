/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { globalState } from '../Core/State';

export type ThemeMode = 'light' | 'dark';

export function getSavedTheme(): ThemeMode {
    return (localStorage.getItem('theme') as ThemeMode) || 'dark';
}

export function setSavedTheme(theme: ThemeMode): void {
    localStorage.setItem('theme', theme);
}

export function isLightMode(): boolean {
    return getSavedTheme() === 'light';
}

export function toggleBodyLightMode(): boolean {
    return document.body.classList.toggle('light-mode');
}

export function getThemeToggleButton(): HTMLElement | null {
    return document.getElementById('theme-toggle-button');
}

export function getThemeIcon(): HTMLElement | null {
    const button = getThemeToggleButton();
    return button?.querySelector('.material-symbols-outlined') || null;
}

export function setThemeIcon(isLight: boolean): void {
    const icon = getThemeIcon();
    if (icon) {
        icon.textContent = isLight ? 'dark_mode' : 'light_mode';
    }
}

export function getSidebarElement(): HTMLElement | null {
    return document.getElementById('controls-sidebar');
}

export function getMainContentElement(): HTMLElement | null {
    return document.getElementById('main-content');
}

export function getExpandButton(): HTMLElement | null {
    return document.getElementById('sidebar-expand-button');
}

export function getCollapseButton(): HTMLElement | null {
    return document.getElementById('sidebar-collapse-button');
}

export function isSidebarCollapsed(): boolean {
    const sidebar = getSidebarElement();
    return sidebar?.classList.contains('collapsed') || false;
}

export function getTabsContainer(): HTMLElement | null {
    return document.getElementById('tabs-nav-container');
}

export function getFullscreenButtons(): NodeListOf<Element> {
    return document.querySelectorAll('.fullscreen-toggle-button');
}

export function getPreviewContainerId(buttonId: string): string {
    return buttonId.replace('fullscreen-btn-', 'preview-container-');
}

export function getAssociatedPreviewContainer(buttonId: string): HTMLElement | null {
    const previewContainerId = getPreviewContainerId(buttonId);
    return document.getElementById(previewContainerId);
}

export function isFullscreenActive(): boolean {
    return !!document.fullscreenElement;
}

export function getFullscreenElement(): Element | null {
    return document.fullscreenElement;
}

let sidebarIsCollapsed = false;

export function setSidebarCollapsed(collapsed: boolean): void {
    sidebarIsCollapsed = collapsed;
}

export function getSidebarCollapsed(): boolean {
    return sidebarIsCollapsed;
}

export function ensureExpandButtonVisibility(): void {
    const expandButton = getExpandButton();
    if (expandButton) {
        expandButton.style.display = sidebarIsCollapsed ? 'flex' : 'none';
    }
}

export function collapseSidebar(): void {
    const sidebar = getSidebarElement();
    if (sidebar) {
        sidebar.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
        sidebar.classList.add('collapsed');
        setSidebarCollapsed(true);
    }
}

export function expandSidebar(): void {
    const sidebar = getSidebarElement();
    const expandButton = getExpandButton();
    if (sidebar) {
        sidebar.classList.remove('collapsed');
        setSidebarCollapsed(false);
    }
    if (expandButton) {
        expandButton.style.display = 'none';
    }
}

export function initializeSidebarEventListeners(): void {
    const expandButton = getExpandButton();
    const collapseButton = getCollapseButton();
    const sidebar = getSidebarElement();
    const mainContent = getMainContentElement();

    if (expandButton) {
        expandButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            expandSidebar();
        });
    }

    if (collapseButton && sidebar) {
        const newCollapseButton = collapseButton.cloneNode(true) as HTMLElement;
        collapseButton.replaceWith(newCollapseButton);

        newCollapseButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            sidebar.offsetHeight;
            collapseSidebar();

            requestAnimationFrame(() => {
                const expandBtn = getExpandButton();
                if (expandBtn) {
                    expandBtn.style.display = 'flex';
                }

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

export function initializeThemeEventListeners(): void {
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const themeToggleButton = target.closest('#theme-toggle-button');

        if (themeToggleButton) {
            e.preventDefault();
            e.stopPropagation();

            const isLight = toggleBodyLightMode();
            setThemeIcon(isLight);
            setSavedTheme(isLight ? 'light' : 'dark');
        }
    }, true);
}

export function initializeFullscreenEventListeners(): void {
    document.addEventListener('fullscreenchange', () => {
        const isFullscreen = isFullscreenActive();
        const fullscreenElement = getFullscreenElement();

        getFullscreenButtons().forEach(button => {
            const btn = button as HTMLButtonElement;
            const iconFullscreen = btn.querySelector('.icon-fullscreen') as HTMLElement;
            const iconExitFullscreen = btn.querySelector('.icon-exit-fullscreen') as HTMLElement;
            const associatedPreview = getAssociatedPreviewContainer(btn.id);

            if (isFullscreen && fullscreenElement === associatedPreview) {
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

export function initializeThemeFromStorage(): void {
    const savedTheme = getSavedTheme();
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        setThemeIcon(true);
    }
}

export function initializeTabsObserver(): void {
    const tabsContainer = getTabsContainer();
    if (tabsContainer) {
        const observer = new MutationObserver(() => {
            ensureExpandButtonVisibility();
        });
        observer.observe(tabsContainer, { childList: true, subtree: true });
    }
}

export function initializeLayoutController(): void {
    initializeSidebarEventListeners();
    initializeThemeEventListeners();
    initializeFullscreenEventListeners();
    initializeThemeFromStorage();
    initializeTabsObserver();

    if (isSidebarCollapsed()) {
        ensureExpandButtonVisibility();
    }

    (window as any).pipelinesState = globalState.pipelinesState;
}

export class LayoutController {
    public static initialize() {
        initializeLayoutController();
    }

    public static ensureExpandButton() {
        ensureExpandButtonVisibility();
    }
}
