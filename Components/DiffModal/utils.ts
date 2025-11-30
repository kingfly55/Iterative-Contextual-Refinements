import * as Diff from 'diff';
import hljs from 'highlight.js';
import { renderMathContent } from '../RenderMathMarkdown';

export { renderMathContent };

export function createUnifiedDiff(oldText: string, newText: string): string {
    // Create a proper unified diff format with correct chunk headers
    let diff = 'diff --git a/source b/target\n';
    diff += '--- a/source\n';
    diff += '+++ b/target\n';

    const changes = Diff.diffLines(oldText, newText);

    // Build chunks with proper line tracking
    let oldLineNum = 1;
    let newLineNum = 1;
    let chunkStart = true;

    changes.forEach((change, idx) => {
        const lines = change.value.split('\n').filter((line, i, arr) => {
            // Keep all lines except the last one if it's empty (trailing newline)
            return !(i === arr.length - 1 && line === '');
        });

        if (lines.length === 0) return;

        // Add chunk header before first change or when starting new chunk
        if (chunkStart) {
            // Calculate counts for this chunk (look ahead)
            let totalOldCount = 0;
            let totalNewCount = 0;

            for (let i = idx; i < changes.length; i++) {
                const c = changes[i];
                const cLines = c.value.split('\n').filter((l, j, a) => !(j === a.length - 1 && l === ''));
                if (cLines.length === 0) continue;

                if (!c.added) totalOldCount += cLines.length;
                if (!c.removed) totalNewCount += cLines.length;
            }

            diff += `@@ -${oldLineNum},${totalOldCount} +${newLineNum},${totalNewCount} @@\n`;
            chunkStart = false;
        }

        lines.forEach(line => {
            if (change.added) {
                diff += '+' + line + '\n';
                newLineNum++;
            } else if (change.removed) {
                diff += '-' + line + '\n';
                oldLineNum++;
            } else {
                diff += ' ' + line + '\n';
                oldLineNum++;
                newLineNum++;
            }
        });
    });

    return diff;
}

export function applyCustomThemeToD2H(container: HTMLElement) {
    // Theme is applied via CSS ID selectors for maximum specificity
    // Apply syntax highlighting to code content
    if (typeof hljs !== 'undefined') {
        const codeLines = container.querySelectorAll('.d2h-code-line-ctn, .d2h-code-side-line-ctn');
        codeLines.forEach((lineElement) => {
            const code = lineElement.textContent || '';
            if (code.trim()) {
                try {
                    const highlighted = hljs.highlightAuto(code, ['html', 'css', 'javascript', 'typescript', 'python', 'java', 'cpp']);
                    if (highlighted.value) {
                        (lineElement as HTMLElement).innerHTML = highlighted.value;
                    }
                } catch (e) {
                    // Ignore highlighting errors
                }
            }
        });
    }
}

// Helper function to add dark theme styles to HTML content
export function addDarkThemeStyles(htmlContent: string): string {
    const darkThemeCSS = `
        <style>
            body {
                background-color: #1a1a1a !important;
                color: #e0e0e0 !important;
                font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif !important;
            }
            * {
                color: #e0e0e0 !important;
            }
            h1, h2, h3, h4, h5, h6 {
                color: #ffffff !important;
            }
            a {
                color: #64b5f6 !important;
            }
            a:visited {
                color: #ba68c8 !important;
            }
            pre, code {
                background-color: #2d2d2d !important;
                color: #e0e0e0 !important;
                border: 1px solid #404040 !important;
            }
            table {
                border-color: #404040 !important;
            }
            th, td {
                border-color: #404040 !important;
                background-color: #2d2d2d !important;
            }
        </style>
    `;

    // Insert the CSS into the head of the HTML document
    if (htmlContent.includes('<head>')) {
        return htmlContent.replace('<head>', '<head>' + darkThemeCSS);
    } else if (htmlContent.includes('<html>')) {
        return htmlContent.replace('<html>', '<html><head>' + darkThemeCSS + '</head>');
    } else {
        // If no proper HTML structure, wrap the content
        return `<!DOCTYPE html><html><head>${darkThemeCSS}</head><body>${htmlContent}</body></html>`;
    }
}

/**
 * Detects if content is HTML
 */
export function isHTMLContent(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.includes('<html') ||
        trimmed.includes('<!DOCTYPE') ||
        (trimmed.includes('<body') && trimmed.includes('</body>')) ||
        (trimmed.includes('<div') && trimmed.includes('</div>'));
}
