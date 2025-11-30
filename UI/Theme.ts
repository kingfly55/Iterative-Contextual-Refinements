
export function initializeThemeToggle() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        const themeToggleButton = document.getElementById('theme-toggle-button');
        const themeIcon = themeToggleButton?.querySelector('.material-symbols-outlined');
        if (themeIcon) themeIcon.textContent = 'dark_mode';
    }

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const themeToggleButton = target.closest('#theme-toggle-button');

        if (themeToggleButton) {
            e.preventDefault();
            e.stopPropagation();

            const isLightMode = document.body.classList.toggle('light-mode');

            const themeIcon = themeToggleButton.querySelector('.material-symbols-outlined');
            if (themeIcon) {
                themeIcon.textContent = isLightMode ? 'dark_mode' : 'light_mode';
            }

            localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
        }
    }, true);
}
