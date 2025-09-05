import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import hljs from 'highlight.js';

// Global functions for code block actions
declare global {
    interface Window {
        toggleCodeBlock: (codeId: string) => void;
        copyCodeBlock: (codeId: string) => Promise<void>;
        downloadCodeBlock: (codeId: string) => void;
    }
}

// Initialize global functions if they don't exist
if (typeof window !== 'undefined') {
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

    window.copyCodeBlock = async function(codeId: string) {
        try {
            const codeElement = document.getElementById(codeId);
            if (!codeElement) return;
            
            const codeText = codeElement.textContent || '';
            await navigator.clipboard.writeText(codeText);
            
            // Visual feedback
            const copyBtn = document.querySelector(`[onclick="copyCodeBlock('${codeId}')"]`);
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                `;
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                }, 1000);
            }
        } catch (err) {
            console.error('Failed to copy code:', err);
        }
    };

    window.downloadCodeBlock = function(codeId: string) {
        try {
            const codeElement = document.getElementById(codeId);
            if (!codeElement) return;
            
            const codeText = codeElement.textContent || '';
            const blob = new Blob([codeText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `code-${codeId}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Visual feedback
            const downloadBtn = document.querySelector(`[onclick="downloadCodeBlock('${codeId}')"]`);
            if (downloadBtn) {
                const originalText = downloadBtn.innerHTML;
                downloadBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                `;
                setTimeout(() => {
                    downloadBtn.innerHTML = originalText;
                }, 1000);
            }
        } catch (err) {
            console.error('Failed to download code:', err);
        }
    };
}

function renderMathContent(content: string): string {
    if (!content) return '';

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
        let highlightedCode = code.innerHTML; // Already escaped by textContent
        try {
            if (hljs.getLanguage('html')) {
                highlightedCode = hljs.highlight(content, { language: 'html' }).value;
            }
        } catch (error) {
            console.warn('Syntax highlighting failed, using escaped version:', error);
        }
        
        // Create enhanced code block
        const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
        const htmlContent = `
            <div style="font-size: 1.4rem; line-height: 1.6;">
                <div class="code-block-container">
                    <div class="code-block-header" onclick="toggleCodeBlock('${codeId}')">
                        <span class="code-block-title">HTML</span>
                        <div class="code-block-actions" onclick="event.stopPropagation()">
                            <button class="code-action-btn copy-code-btn" onclick="copyCodeBlock('${codeId}')" title="Copy code">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                            <button class="code-action-btn download-code-btn" onclick="downloadCodeBlock('${codeId}')" title="Download code">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="7,10 12,15 17,10"></polyline>
                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                </svg>
                            </button>
                            <button class="code-block-expand-toggle expanded" id="toggle-${codeId}" onclick="toggleCodeBlock('${codeId}')" title="Toggle code visibility">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="6,9 12,15 18,9"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="code-block-content expanded" id="${codeId}">
                        <pre><code class="language-html">${highlightedCode}</code></pre>
                    </div>
                </div>
            </div>
        `;
        
        return `<div class="rich-content-display"><div class="markdown-content">${htmlContent}</div></div>`;
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
        let highlightedCode = codeContent;
        
        if (codeContent.length <= MAX_CODE_SIZE) {
            try {
                if (language && hljs.getLanguage(language)) {
                    highlightedCode = hljs.highlight(codeContent, { language }).value;
                } else {
                    // Auto-detect language if no specific language is provided
                    const result = hljs.highlightAuto(codeContent);
                    highlightedCode = result.value;
                }
            } catch (error) {
                // Fallback to original code if highlighting fails
                console.warn('Syntax highlighting failed:', error);
                highlightedCode = codeContent;
            }
        } else {
            console.warn(`Code block too large (${codeContent.length} chars), skipping syntax highlighting`);
        }
        
        return `
            <div class="code-block-container">
                <div class="code-block-header" onclick="toggleCodeBlock('${codeId}')">
                    <span class="code-block-title">${language ? language.toUpperCase() : 'Code'}</span>
                    <div class="code-block-actions" onclick="event.stopPropagation()">
                        <button class="code-action-btn copy-code-btn" onclick="copyCodeBlock('${codeId}')" title="Copy code">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                        <button class="code-action-btn download-code-btn" onclick="downloadCodeBlock('${codeId}')" title="Download code">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7,10 12,15 17,10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <button class="code-block-expand-toggle expanded" id="toggle-${codeId}" onclick="toggleCodeBlock('${codeId}')" title="Toggle code visibility">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6,9 12,15 18,9"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="code-block-content expanded" id="${codeId}">
                    <pre><code${attributes}>${highlightedCode}</code></pre>
                </div>
            </div>
        `;
    });
    
    // Wrap content in a div with rich styling classes for consistent appearance
    return `<div class="rich-content-display"><div class="markdown-content">${htmlContent}</div></div>`;
}

/**
 * Utility function to create a DOM element with rendered math content
 * @param content - The markdown content with LaTeX math to render
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