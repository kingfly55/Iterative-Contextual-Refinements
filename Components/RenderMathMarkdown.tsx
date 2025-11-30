import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import hljs from 'highlight.js';

// --- Types & Interfaces ---

declare global {
    interface Window {
        toggleCodeBlock: (codeId: string) => void;
        copyCodeBlock: (codeId: string) => Promise<void>;
        __codeblockEventsSetup?: boolean;
        __codeblockBusy?: Record<string, boolean>;
    }
}

// --- Constants & Config ---

const HLJS_THEMES = {
    light: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css',
    dark: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css'
};

const MAX_CODE_HIGHLIGHT_SIZE = 50000; // Skip highlighting for huge blocks to prevent freezing

// Regex patterns for math detection inside inline code
const MATH_HEURISTICS = [
    // /[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\)/, // DISABLED: Too aggressive, matches function calls like setup_database()
    /\\[a-z]+/,                          // LaTeX commands like \in, \le, \times
    /[≤≥∈∉⊂⊃∪∩∀∃]/,                     // Unicode math symbols
    /\^[a-zA-Z0-9_{}]+/,                 // Superscripts
    /_{[^}]+}/,                          // Subscripts with braces ONLY (e.g. _{i}) to avoid snake_case
    // /_[a-zA-Z0-9_{}]+/,               // DISABLED: Too aggressive, matches snake_case
    // /[a-zA-Z]_[a-zA-Z0-9]/,           // DISABLED: Too aggressive, matches snake_case
    /\[.*?,.*?\]/,                       // Intervals like [j+1, i]
    /\\frac|\\sum|\\prod|\\int/,         // Common math commands
];

// --- Helper Functions ---

const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

const unescapeMap: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
};

function escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

// Optimized decode without DOM manipulation
function decodeEntities(str: string): string {
    return str.replace(/&(amp|lt|gt|quot|#39);/g, (match) => unescapeMap[match] || match);
}

function generateCodeId(): string {
    return `code-${Math.random().toString(36).substr(2, 9)}`;
}

// --- Theme Management ---

function loadHighlightTheme() {
    if (typeof document === 'undefined') return;

    const isLightMode = document.body.classList.contains('light-mode');

    const updateLink = (id: string, href: string, enable: boolean) => {
        let link = document.getElementById(id) as HTMLLinkElement;
        if (!link) {
            link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }
        link.disabled = !enable;
    };

    updateLink('hljs-theme-light', HLJS_THEMES.light, isLightMode);
    updateLink('hljs-theme-dark', HLJS_THEMES.dark, !isLightMode);
}

// --- Event Listeners Setup ---

function setupGlobalEvents() {
    if (typeof window === 'undefined') return;

    // Theme observer
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'class') {
                loadHighlightTheme();
                break; // Only need to trigger once per batch
            }
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Initial load
    loadHighlightTheme();

    // Global toggle function
    window.toggleCodeBlock = function (codeId: string) {
        const codeContent = document.getElementById(codeId);
        const toggleBtn = document.getElementById(`toggle-${codeId}`);
        const container = codeContent?.closest('.code-block-container');

        if (!codeContent || !toggleBtn || !container) return;

        const isExpanded = codeContent.classList.contains('expanded');

        // Use classList toggle for cleaner logic
        codeContent.classList.toggle('expanded', !isExpanded);
        codeContent.classList.toggle('collapsed', isExpanded);
        toggleBtn.classList.toggle('expanded', !isExpanded);
        container.classList.toggle('expanded', !isExpanded);
        container.classList.toggle('collapsed', isExpanded);
    };

    // Delegated click listener for copy buttons
    if (!window.__codeblockEventsSetup) {
        window.__codeblockBusy = {};

        document.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;
            const btn = target.closest('.copy-code-btn') as HTMLElement;

            if (!btn) return;

            // Prevent double-clicks
            const explicitId = btn.getAttribute('data-code-id') || '';
            let id = explicitId;

            if (!id) {
                // Fallback to finding ID via DOM
                const container = btn.closest('.code-block-container');
                const codeEl = container?.querySelector('.code-block-content code');
                if (codeEl) id = codeEl.id;
            }

            if (!id) return;

            const key = `copy:${id}`;
            if (window.__codeblockBusy?.[key]) return;

            if (window.__codeblockBusy) window.__codeblockBusy[key] = true;

            if (typeof window.copyCodeBlock === 'function') {
                window.copyCodeBlock(id);
            }

            setTimeout(() => {
                if (window.__codeblockBusy) delete window.__codeblockBusy[key];
            }, 500);
        }, true);

        window.__codeblockEventsSetup = true;
    }
}

// --- Rendering Logic ---

function renderCompleteDocument(content: string, type: 'latex' | 'html'): string {
    const codeId = generateCodeId();
    let highlightedCode = '';

    // For HTML, we need to decode once before highlighting because textContent would have handled it
    const codeToHighlight = type === 'html' ? decodeEntities(content) : content;

    try {
        if (content.length <= MAX_CODE_HIGHLIGHT_SIZE && hljs.getLanguage(type)) {
            highlightedCode = hljs.highlight(codeToHighlight, { language: type }).value;
        } else {
            highlightedCode = escapeHtml(codeToHighlight);
        }
    } catch (e) {
        highlightedCode = escapeHtml(codeToHighlight);
    }

    const htmlContent = `
        <div style="font-size: 1.4rem; line-height: 1.6;">
            <div class="code-block-container">
                <div class="code-block-header">
                    <span class="code-block-title">${type === 'latex' ? 'LATEX DOCUMENT' : 'HTML'}</span>
                    <button class="code-copy-icon copy-code-btn" data-code-id="${codeId}" title="Copy code">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div class="code-block-content">
                    <pre><code id="${codeId}" class="language-${type}">${highlightedCode}</code></pre>
                </div>
            </div>
        </div>
    `;

    return `<div class="rich-content-display"><div class="latex-content-wrapper">${htmlContent}</div></div>`;
}

function renderCodeBlock(code: string, language: string): string {
    const codeId = generateCodeId();
    // Normalize language to something hljs understands or 'text'
    const validLang = language && hljs.getLanguage(language) ? language : '';
    let highlightedCode = '';

    // Optimize: Skip syntax highlighting for huge blocks
    const cleanCode = decodeEntities(code);

    if (cleanCode.length > MAX_CODE_HIGHLIGHT_SIZE) {
        highlightedCode = escapeHtml(cleanCode);
        console.warn(`Code block too large (${cleanCode.length} chars), skipping syntax highlighting`);
    } else {
        try {
            if (validLang) {
                highlightedCode = hljs.highlight(cleanCode, { language: validLang }).value;
            } else {
                highlightedCode = hljs.highlightAuto(cleanCode).value;
            }
        } catch (e) {
            highlightedCode = escapeHtml(cleanCode);
        }
    }

    const displayLang = (language || 'Code').toUpperCase();

    return `
        <div class="code-block-container">
            <div class="code-block-header">
                <span class="code-block-title">${displayLang}</span>
                <button class="code-copy-icon copy-code-btn" data-code-id="${codeId}" title="Copy code">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
            </div>
            <div class="code-block-content">
                <pre><code id="${codeId}" class="language-${validLang || 'text'}">${highlightedCode}</code></pre>
            </div>
        </div>
    `;
}

function renderMathString(content: string, displayMode: boolean): string {
    try {
        return katex.renderToString(content.trim(), {
            displayMode,
            throwOnError: false,
            trust: true,
            strict: false
        });
    } catch (e) {
        console.warn('Math rendering failed:', e);
        return displayMode ? `$$${content}$$` : `$${content}$`;
    }
}

// --- Main Render Function ---

function renderMathContent(content: string): string {
    if (!content) return '';

    // 1. Detect Complete Documents (Early Exit)
    const trimmed = content.trim();
    if (trimmed.startsWith('\\documentclass') || (trimmed.includes('\\begin{document}') && trimmed.includes('\\end{document}'))) {
        return renderCompleteDocument(content, 'latex');
    }
    if (trimmed.startsWith('<!DOCTYPE html>') || (trimmed.startsWith('<html') && trimmed.includes('</html>'))) {
        return renderCompleteDocument(content, 'html');
    }

    // 2. Setup Marked Renderer
    const renderer = new marked.Renderer();

    // Optimize: Add styling classes directly during generation
    renderer.heading = (text, level) => {
        const levelClass = level <= 3 ? `token-heading${level}` : '';
        return `<h${level} class="token-heading ${levelClass}">${text}</h${level}>`;
    };

    renderer.strong = (text) => `<strong class="token-critical">${text}</strong>`;

    // Codespan: handle inline math detection vs regular code
    renderer.codespan = (text) => {
        const decoded = decodeEntities(text);

        // Check for math-like patterns
        const looksLikeMath = MATH_HEURISTICS.some(pattern => pattern.test(decoded));

        if (looksLikeMath) {
            try {
                // Render as inline math
                return renderMathString(decoded, false);
            } catch (e) {
                // Fallback
            }
        }

        // Standard code styling
        // We use a specific class for potential styling if needed, but standard <code> is fine
        return `<code>${text}</code>`;
    };

    // Code blocks: Use our rich custom container
    renderer.code = (code, language) => {
        return renderCodeBlock(code, language || '');
    };

    // 3. Processing Pipeline

    // Step A: Mask Code Blocks
    // We mask code blocks so that Math delimiters ($$) inside code are not rendered as math.
    // We use a placeholder that doesn't trigger markdown formatting.
    const fencedBlocks: string[] = [];
    const inlineBlocks: string[] = [];

    // Using simple placeholders that won't be confused with markdown
    const fencedPlaceholder = (idx: number) => `MARKER_FENCED_BLOCK_${idx}_END`;
    const inlinePlaceholder = (idx: number) => `MARKER_INLINE_BLOCK_${idx}_END`;

    let processed = content;

    // Mask fenced code blocks
    processed = processed.replace(/(```[\s\S]*?```)/g, (match) => {
        fencedBlocks.push(match);
        return fencedPlaceholder(fencedBlocks.length - 1);
    });

    // Mask inline code blocks
    processed = processed.replace(/(`[^`]+`)/g, (match) => {
        inlineBlocks.push(match);
        return inlinePlaceholder(inlineBlocks.length - 1);
    });

    // Step B: Render Math (KaTeX)
    // Now that code is masked, we can safely render math.

    // Display Math $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => renderMathString(math, true));

    // LaTeX Display \[...\]
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => renderMathString(math, true));

    // LaTeX Inline \(...\)
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => renderMathString(math, false));

    // Inline Math $...$
    processed = processed.replace(/\$([^$\n]+?)\$/g, (_, math) => renderMathString(math, false));

    // Step C: Unmask Code Blocks
    // We restore the code blocks back to their markdown format.
    // 'marked' will parse them in the next step.

    // Unmask fenced blocks
    // Note: We use a function replacement to avoid special char ($) replacement issues
    fencedBlocks.forEach((block, idx) => {
        const ph = fencedPlaceholder(idx);
        processed = processed.replace(ph, () => block);
    });

    // Unmask inline blocks
    inlineBlocks.forEach((block, idx) => {
        const ph = inlinePlaceholder(idx);
        processed = processed.replace(ph, () => block);
    });

    // Step D: Render Markdown
    // Marked will see:
    // 1. Text with HTML (rendered math) -> Preserves HTML
    // 2. Code blocks (restored) -> Uses renderer.code() -> Rich HTML
    // 3. Inline code -> Uses renderer.codespan() -> Math detection or <code>
    let html = marked(processed, { renderer });

    // Step E: Sanitize
    html = DOMPurify.sanitize(html, {
        ADD_TAGS: ['math', 'annotation', 'semantics', 'mrow', 'mn', 'mo', 'mi', 'msup', 'msub', 'mfrac', 'table', 'tr', 'td', 'th', 'tbody', 'thead'],
        ADD_ATTR: ['class', 'style', 'data-code-id', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'x', 'y', 'width', 'height', 'rx', 'ry']
    });

    return `<div class="rich-content-display"><div class="latex-content-wrapper" style="font-size: 1.4rem; line-height: 1.6;">${html}</div></div>`;
}

// --- React Component Wrappers ---

// Initialize global side effects once
if (typeof window !== 'undefined') {
    setupGlobalEvents();
}

export function createRenderMathMarkdownElement(content: string, className: string = ''): HTMLElement {
    const div = document.createElement('div');
    div.className = `render-math-markdown ${className}`;
    div.innerHTML = renderMathContent(content);
    return div;
}

export function renderMathContentIntoElement(element: HTMLElement, content: string): void {
    element.innerHTML = renderMathContent(content);
}

export { renderMathContent };
export default renderMathContent;