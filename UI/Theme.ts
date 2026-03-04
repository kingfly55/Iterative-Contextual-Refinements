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

export function initializeThemeToggle(): void {
    const savedTheme = getSavedTheme();
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        setThemeIcon(true);
    }

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
