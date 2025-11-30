
export function initializeSidebarControls() {
    let sidebarIsCollapsed = false;

    const sidebarCollapseButton = document.getElementById('sidebar-collapse-button');
    const controlsSidebar = document.getElementById('controls-sidebar');
    const mainContent = document.getElementById('main-content');
    const expandButton = document.getElementById('sidebar-expand-button');

    if (controlsSidebar && controlsSidebar.classList.contains('collapsed')) {
        sidebarIsCollapsed = true;
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
                sidebarIsCollapsed = false;
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
            sidebarIsCollapsed = true;

            requestAnimationFrame(() => {
                const expandBtn = document.getElementById('sidebar-expand-button');
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

export function ensureExpandButton() {
    const controlsSidebar = document.getElementById('controls-sidebar');
    const expandButton = document.getElementById('sidebar-expand-button');
    const sidebarIsCollapsed = controlsSidebar?.classList.contains('collapsed');

    if (expandButton) {
        expandButton.style.display = sidebarIsCollapsed ? 'flex' : 'none';
    }
}
