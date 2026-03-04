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

export function initializeSidebarControls(): void {
    const sidebarCollapseButton = getCollapseButton();
    const controlsSidebar = getSidebarElement();
    const mainContent = getMainContentElement();
    const expandButton = getExpandButton();

    if (controlsSidebar && controlsSidebar.classList.contains('collapsed')) {
        if (expandButton) {
            expandButton.style.display = 'flex';
        }
    }

    if (expandButton) {
        expandButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (controlsSidebar) {
                controlsSidebar.classList.remove('collapsed');
                expandButton.style.display = 'none';
            }
        });
    }

    if (sidebarCollapseButton && controlsSidebar) {
        const newCollapseButton = sidebarCollapseButton.cloneNode(true) as HTMLElement;
        sidebarCollapseButton.replaceWith(newCollapseButton);

        newCollapseButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            controlsSidebar.offsetHeight;

            controlsSidebar.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            controlsSidebar.classList.add('collapsed');

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

export function ensureExpandButton(): void {
    const controlsSidebar = getSidebarElement();
    const expandButton = getExpandButton();
    const sidebarIsCollapsed = controlsSidebar?.classList.contains('collapsed');

    if (expandButton) {
        expandButton.style.display = sidebarIsCollapsed ? 'flex' : 'none';
    }
}
