import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import hljs from 'highlight.js';

// Global functions for code block actions
declare global {
    interface Window {
        toggleCodeBlock: (codeId: string) => void;
        copyCodeBlock: (codeId: string) => Promise<void>;
    }
}

// Helper: decode HTML entities (e.g., &amp;gt; -> >) safely into plain text
// Only decode ONCE to avoid mangling legitimate code content
function decodeEntities(html: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    return textarea.value;
}

// Helper: escape HTML special characters for safe insertion as innerHTML
// Using efficient single-pass regex with lookup map (best practice)
function escapeHtml(str: string): string {
    const htmlEscapeMap: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
}

// Preload both highlight.js themes and toggle via disabled attribute
function loadHighlightTheme() {
    const lightThemeId = 'hljs-theme-light';
    const darkThemeId = 'hljs-theme-dark';
    const isLightMode = document.body.classList.contains('light-mode');
    
    // Create light theme link if it doesn't exist
    let lightLink = document.getElementById(lightThemeId) as HTMLLinkElement;
    if (!lightLink) {
        lightLink = document.createElement('link');
        lightLink.id = lightThemeId;
        lightLink.rel = 'stylesheet';
        lightLink.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css';
        document.head.appendChild(lightLink);
    }
    
    // Create dark theme link if it doesn't exist
    let darkLink = document.getElementById(darkThemeId) as HTMLLinkElement;
    if (!darkLink) {
        darkLink = document.createElement('link');
        darkLink.id = darkThemeId;
        darkLink.rel = 'stylesheet';
        darkLink.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css';
        document.head.appendChild(darkLink);
    }
    
    // Toggle themes via disabled attribute instead of removing/adding
    lightLink.disabled = !isLightMode;
    darkLink.disabled = isLightMode;
}

// Initialize global functions if they don't exist
if (typeof window !== 'undefined') {
    // Load initial theme
    loadHighlightTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                loadHighlightTheme();
            }
        });
    });
    
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.toggleCodeBlock = function(codeId: string) {
        const codeContent = document.getElementById(codeId);
        const toggleBtn = document.getElementById(`toggle-${codeId}`);
        const container = codeContent?.closest('.code-block-container');
        
        if (!codeContent || !toggleBtn || !container) return;
        
        const isExpanded = codeContent.classList.contains('expanded');
        
        if (isExpanded) {
            codeContent.classList.remove('expanded');
            codeContent.classList.add('collapsed');
            toggleBtn.classList.remove('expanded');
            container.classList.remove('expanded');
            container.classList.add('collapsed');
        } else {
            codeContent.classList.remove('collapsed');
            codeContent.classList.add('expanded');
            toggleBtn.classList.add('expanded');
            container.classList.remove('collapsed');
            container.classList.add('expanded');
        }
    };

    // copyCodeBlock is defined in index.tsx


    // One-time delegated listeners to ensure buttons work even if inline onclicks are removed
    const w = window as any;
    if (!w.__codeblockEventsSetup) {
        // simple throttle store on window
        w.__codeblockBusy = w.__codeblockBusy || {} as Record<string, boolean>;
        document.addEventListener('click', (ev) => {
            const el = ev.target as HTMLElement | null;
            if (!el) return;
            const btn = el.closest('.copy-code-btn') as HTMLElement | null;
            if (!btn) return;
            const explicitId = (btn as HTMLElement).getAttribute('data-code-id') || '';
            let id = explicitId;
            let codeEl: HTMLElement | null = null;
            if (!id) {
                const container = btn.closest('.code-block-container') as HTMLElement | null;
                codeEl = container?.querySelector<HTMLElement>('.code-block-content code') || null;
                if (!codeEl) return;
                id = codeEl.id;
            } else {
                codeEl = document.getElementById(id);
            }
            if (!codeEl) return;

            if (btn.classList.contains('copy-code-btn')) {
                const key = `copy:${id}`;
                if (w.__codeblockBusy[key]) return;
                w.__codeblockBusy[key] = true;
                if (typeof window.copyCodeBlock === 'function') {
                    window.copyCodeBlock(id);
                }
                setTimeout(() => { delete w.__codeblockBusy[key]; }, 500);
                return;
            }
        }, true);
        w.__codeblockEventsSetup = true;
    }
}

function renderMathContent(content: string): string {
    if (!content) return '';

    // Check if content is a complete LaTeX document
    const isCompleteLaTeX = content.trim().startsWith('\\documentclass') ||
                           (content.includes('\\begin{document}') && content.includes('\\end{document}'));

    if (isCompleteLaTeX) {
        // Render LaTeX document as a code block with syntax highlighting
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        
        let highlightedCode = '';
        try {
            if (hljs.getLanguage('latex')) {
                highlightedCode = hljs.highlight(content, { language: 'latex' }).value;
            } else {
                highlightedCode = escapeHtml(content);
            }
        } catch (error) {
            console.warn('LaTeX syntax highlighting failed:', error);
            highlightedCode = escapeHtml(content);
        }
        
        const htmlContent = `
            <div style="font-size: 1.4rem; line-height: 1.6;">
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span class="code-block-title">LATEX DOCUMENT</span>
                        <button class="code-copy-icon copy-code-btn" data-code-id="${codeId}" title="Copy code">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="code-block-content">
                        <pre><code id="${codeId}" class="language-latex">${highlightedCode}</code></pre>
                    </div>
                </div>
            </div>
        `;
        
        return `<div class="rich-content-display"><div class="latex-content-wrapper">${htmlContent}</div></div>`;
    }

    // Check if content is a complete HTML document
    const isCompleteHTML = content.trim().startsWith('<!DOCTYPE html>') ||
                           (content.trim().startsWith('<html') && content.includes('</html>'));

    if (isCompleteHTML) {
        // Use textContent to safely escape HTML - OWASP recommended approach
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.className = 'language-html';
        code.textContent = content; // This automatically escapes HTML entities
        pre.appendChild(code);
        
        
        // Apply syntax highlighting to the original content
        const decoded = decodeEntities(content);
        let highlightedCode = code.innerHTML; // Already escaped by textContent
        try {
            if (hljs.getLanguage('html')) {
                highlightedCode = hljs.highlight(decoded, { language: 'html' }).value;
            }
        } catch (error) {
            console.warn('Syntax highlighting failed, using escaped version:', error);
            highlightedCode = escapeHtml(decoded);
        }
        
        // Create enhanced code block
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        
        const htmlContent = `
            <div style="font-size: 1.4rem; line-height: 1.6;">
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span class="code-block-title">HTML</span>
                        <button class="code-copy-icon copy-code-btn" data-code-id="${codeId}" title="Copy code">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="code-block-content">
                        <pre><code id="${codeId}" class="language-html">${highlightedCode}</code></pre>
                    </div>
                </div>
            </div>
        `;
        
        return `<div class="rich-content-display"><div class="latex-content-wrapper">${htmlContent}</div></div>`;
    }

    let processedContent = content;
    
    // Handle display math $$...$$
    processedContent = processedContent.replace(/\$\$([\s\S]*?)\$\$/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: true,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render display math:', mathContent, e);
            return match;
        }
    });
    
    // Handle inline math $...$
    processedContent = processedContent.replace(/\$([^$\n]+?)\$/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: false,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render inline math:', mathContent, e);
            return match;
        }
    });
    
    // Handle LaTeX delimiters \[...\]
    processedContent = processedContent.replace(/\\\[([\s\S]*?)\\\]/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: true,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render LaTeX display math:', mathContent, e);
            return match;
        }
    });
    
    // Handle LaTeX delimiters \(...\)
    processedContent = processedContent.replace(/\\\(([\s\S]*?)\\\)/g, (match, mathContent) => {
        try {
            return katex.renderToString(mathContent.trim(), {
                displayMode: false,
                throwOnError: false,
                trust: true,
                strict: false
            });
        } catch (e) {
            console.warn('Failed to render LaTeX inline math:', mathContent, e);
            return match;
        }
    });
    
    // Now process markdown with larger font size and line height
    let htmlContent = marked(processedContent);
    htmlContent = DOMPurify.sanitize(htmlContent);
    
    // Convert inline code that looks like math into KaTeX-rendered math
    // This handles cases where people use backticks instead of $ for math
    htmlContent = htmlContent.replace(/<code>([^<]+?)<\/code>/g, (match, codeContent) => {
        // Decode any HTML entities first
        const decoded = decodeEntities(codeContent);
        
        // Check if this looks like math notation (contains math operators/symbols)
        const mathIndicators = [
            /[a-zA-Z_][a-zA-Z0-9_]*\([^)]*\)/, // Functions like p(j), f(x)
            /\\[a-z]+/,                          // LaTeX commands like \in, \le, \times
            /[≤≥∈∉⊂⊃∪∩∀∃]/,                     // Unicode math symbols
            /\^[a-zA-Z0-9_{}]+/,                 // Superscripts
            /_[a-zA-Z0-9_{}]+/,                  // Subscripts
            /[a-zA-Z]_[a-zA-Z0-9]/,              // Variables with subscripts like k_m
            /\[.*?,.*?\]/,                       // Intervals like [j+1, i]
            /\\frac|\\sum|\\prod|\\int/,         // Common math commands
        ];
        
        const looksLikeMath = mathIndicators.some(pattern => pattern.test(decoded));
        
        if (looksLikeMath) {
            try {
                // Try to render as inline math
                const rendered = katex.renderToString(decoded, {
                    displayMode: false,
                    throwOnError: false,
                    trust: true,
                    strict: false
                });
                return rendered;
            } catch (e) {
                // If KaTeX fails, keep it as code
                return match;
            }
        }
        
        return match; // Keep as code if it doesn't look like math
    });
    
    // Wrap content in a div with increased font size and line height
    htmlContent = `<div style="font-size: 1.4rem; line-height: 1.6;">${htmlContent}</div>`;
    
    // Process code blocks with enhanced functionality and syntax highlighting
    htmlContent = htmlContent.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (_: string, attributes: string, codeContent: string) => {
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        
        // Extract language from class attribute if present
        const langMatch = attributes.match(/class="language-(\w+)"/);
        const language = langMatch ? langMatch[1] : '';
        
        // Skip syntax highlighting for very large code blocks to prevent browser freezing
        const MAX_CODE_SIZE = 50000;
        // Decode HTML entities that marked/DOMPurify produced so hljs sees raw text
        const rawCode = decodeEntities(codeContent);
        let highlightedCode = '';
        
        if (rawCode.length <= MAX_CODE_SIZE) {
            try {
                if (language && hljs.getLanguage(language)) {
                    highlightedCode = hljs.highlight(rawCode, { language }).value;
                } else {
                    // Auto-detect language if no specific language is provided
                    const result = hljs.highlightAuto(rawCode);
                    highlightedCode = result.value;
                }
            } catch (error) {
                // Fallback to original code if highlighting fails
                console.warn('Syntax highlighting failed:', error);
                highlightedCode = escapeHtml(rawCode);
            }
        } else {
            console.warn(`Code block too large (${rawCode.length} chars), skipping syntax highlighting`);
            highlightedCode = escapeHtml(rawCode);
        }
        
        return `
            <div class="code-block-container">
                <div class="code-block-header">
                    <span class="code-block-title">${language ? language.toUpperCase() : 'Code'}</span>
                    <button class="code-copy-icon copy-code-btn" data-code-id="${codeId}" title="Copy code">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div class="code-block-content">
                    <pre><code id="${codeId}" class="language-${language || 'text'}">${highlightedCode}</code></pre>
                </div>
            </div>
        `;
    });
    
    // Wrap content in a div with rich styling classes for consistent appearance
    const finalHTML = `<div class="rich-content-display"><div class="latex-content-wrapper">${htmlContent}</div></div>`;
    
    // Removed aggressive token styling to prevent text replacement issues
    // Just add class names for CSS styling without DOM manipulation
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = finalHTML;

    const headingLevels: Array<[keyof HTMLElementTagNameMap, string | null]> = [
        ['h1', 'token-heading1'],
        ['h2', 'token-heading2'],
        ['h3', 'token-heading3'],
        ['h4', null],
        ['h5', null],
        ['h6', null],
    ];

    headingLevels.forEach(([tag, levelClass]) => {
        tempDiv.querySelectorAll(tag).forEach((heading) => {
            heading.classList.add('token-heading');
            if (levelClass) {
                heading.classList.add(levelClass);
            }
        });
    });

    tempDiv.querySelectorAll('strong, b').forEach((element) => {
        element.classList.add('token-critical');
    });

    return tempDiv.innerHTML;
}

/**
 * Utility function to create a DOM element with rendered math content
{{ ... }}
 * @param className - Optional CSS class to add to the wrapper element
 * @returns HTMLElement with rendered content
 */
export function createRenderMathMarkdownElement(content: string, className: string = ''): HTMLElement {
    const div = document.createElement('div');
    div.className = `render-math-markdown ${className}`;
    div.innerHTML = renderMathContent(content);
    return div;
}

/**
 * Utility function to render math content directly into an existing element
 * @param element - The target DOM element
 * @param content - The markdown content with LaTeX math to render
 */
export function renderMathContentIntoElement(element: HTMLElement, content: string): void {
    element.innerHTML = renderMathContent(content);
}

// Export the renderMathContent function for backward compatibility
export { renderMathContent };

// Default export is the renderMathContent function
export default renderMathContent;