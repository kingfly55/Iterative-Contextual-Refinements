/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Declare hljs as global (loaded via CDN in index.html)
declare const hljs: any;



const escapeHtml = (unsafe: string): string =>
  unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// Removed: createTokenSpan (no longer used)

// Token type for incremental updates
export type Token = {
  type: 'text' | 'keyword-positive' | 'keyword-negative' | 'string' | 'code' | 'variable' | 'tag' | 'instruction' | 'critical' | 'heading' | 'list-marker';
  content: string;
  className?: string;
};

// Serialize the editor DOM back to a plain text format with code fences preserved
function getPlainTextFromEditor(editor: HTMLElement): string {
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\u200B/g, ''); // strip ZWSP used for caret
    }
    if (node.nodeName === 'BR') {
      return '\n';
    }
    if (node.nodeName === 'PRE') {
      const codeEl = (node as HTMLElement).querySelector('code');
      if (codeEl) {
        const cls = codeEl.className || '';
        const m = cls.match(/language-([a-z0-9]+)/i);
        const lang = m ? m[1] : '';
        const code = (codeEl.textContent || '').replace(/\u200B/g, '');
        return '```' + lang + '\n' + code + '\n```';
      }
    }
    // Skip visual fence markers; PRE handles serialization of fences
    if ((node as HTMLElement).nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList?.contains('token-code-marker')) {
      return '';
    }
    let out = '';
    node.childNodes.forEach(child => { out += serialize(child); });
    return out;
  };
  return serialize(editor);
}

// Parse text into tokens with code block support
export function parseIntoTokens(text: string): Token[] {
  // First check for code blocks
  const codeBlockRegex = /(```(?:[a-zA-Z]*)?\n[\s\S]*?\n```)/g;
  const parts = text.split(codeBlockRegex).filter(Boolean);
  
  const tokens: Token[] = [];
  
  parts.forEach(part => {
    if (part.startsWith('```') && part.includes('\n')) {
      // This is a code block
      const lines = part.trimEnd().split('\n');
      const firstLine = lines[0];
      const lastLine = lines.length > 1 ? lines[lines.length - 1] : '';
      
      if ((firstLine === '```' || /^```[a-zA-Z]+$/.test(firstLine)) && lastLine.trim() === '```') {
        const langMatch = firstLine.match(/```(\w*)/);
        const lang = langMatch && langMatch[1] ? langMatch[1] : 'plaintext';
        
        // Return as a single code block token
        tokens.push({
          type: 'code',
          content: part,
          className: `hljs language-${lang}`
        });
        return;
      }
    }
    
    // Process regular content line by line
    const lines = part.split('\n');
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        tokens.push({ type: 'text', content: '\n' });
      }
      
      // Check for headings
      const headingMatch = line.match(/^(#{1,6})(\s.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        tokens.push({ 
          type: 'heading', 
          content: line, 
          className: `token-heading token-heading${level}` 
        });
        return;
      }
      
      // Check for list items
      const listMatch = line.match(/^(\s*-\s)(.*)/);
      if (listMatch) {
        tokens.push({ 
          type: 'list-marker', 
          content: listMatch[1], 
          className: 'token-list-marker' 
        });
        line = listMatch[2];
      }
      
      // Process the line for inline tokens
      const tokenRegex = /(\{\{[^}]+\}\}|<\/?[^>]+>|\[[^\]]+\]|\*\*.*?\*\*|`[^`]+`|(?<!\w)"(?:[^\\"\n]|\\.)*"(?!\w)|(?<!\w)'(?:[^\\'\n]|\\.)*'(?!\w)|(?<!\w)["](?:[^"\n]|\\.)*["](?!\w)|(?<!\w)['](?:[^'\n]|\\.)*['](?!\w)|\b(You must|Must|Always|Ensure|IMPORTANT|CRITICAL|Mandatory|Required|Require|Be sure to|Make sure to|Ensure that|Strictly|At all times|Never|Do not|Don't|Don't|Avoid|Must not|Mustn't|Mustn't|Should not|Shouldn't|Shouldn't|No|Not allowed|Prohibited|Forbidden|Disallowed|Cannot|Can't|Can't)\b)/giu;
      const positiveKeywords = /\b(You must|Must|Always|Ensure|IMPORTANT|CRITICAL|Mandatory|Required|Require|Be sure to|Make sure to|Ensure that|Strictly|At all times)\b/iu;
      const negativeKeywords = /\b(Never|Do not|Don't|Don't|Avoid|Must not|Mustn't|Mustn't|Should not|Shouldn't|Shouldn't|No|Not allowed|Prohibited|Forbidden|Disallowed|Cannot|Can't|Can't)\b/iu;
      
      let lastIndex = 0;
      let match;
      
      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          tokens.push({ type: 'text', content: line.substring(lastIndex, match.index) });
        }
        
        const tokenValue = match[0];
        if (tokenValue.startsWith('{{')) {
          tokens.push({ type: 'variable', content: tokenValue, className: 'token-variable' });
        } else if (tokenValue.startsWith('<')) {
          tokens.push({ type: 'tag', content: tokenValue, className: 'token-tag' });
        } else if (tokenValue.startsWith('[')) {
          tokens.push({ type: 'instruction', content: tokenValue, className: 'token-instruction' });
        } else if (tokenValue.startsWith('**')) {
          tokens.push({ type: 'critical', content: tokenValue, className: 'token-critical' });
        } else if (tokenValue.startsWith('`')) {
          tokens.push({ type: 'code', content: tokenValue, className: 'token-code' });
        } else if (/^["'"']/.test(tokenValue)) {
          tokens.push({ type: 'string', content: tokenValue, className: 'token-string' });
        } else if (positiveKeywords.test(tokenValue)) {
          tokens.push({ type: 'keyword-positive', content: tokenValue, className: 'token-keyword-positive' });
        } else if (negativeKeywords.test(tokenValue)) {
          tokens.push({ type: 'keyword-negative', content: tokenValue, className: 'token-keyword-negative' });
        } else {
          tokens.push({ type: 'text', content: tokenValue });
        }
        
        lastIndex = match.index + tokenValue.length;
      }
      
      if (lastIndex < line.length) {
        tokens.push({ type: 'text', content: line.substring(lastIndex) });
      }
    });
  });
  
  return tokens;
}

// Remove unused variable
// const lastTokensMap = new WeakMap<HTMLElement, Token[]>();

// Apply highlighting with code block support
export function applyIncrementalUpdate(element: HTMLElement, newTokens: Token[]): void {
  // Build HTML
  const htmlParts: string[] = [];
  for (const token of newTokens) {
    if (token.content === '\n') {
      htmlParts.push('<br>');
    } else if (token.type === 'code' && token.content.startsWith('```')) {
      // Handle code blocks specially
      const lines = token.content.trimEnd().split('\n');
      const firstLine = lines[0];
      const langMatch = firstLine.match(/```(\w*)/);
      const lang = langMatch && langMatch[1] ? langMatch[1] : 'plaintext';
      const code = lines.slice(1, -1).join('\n');
      // Show visual fences AND keep proper pre/code for hljs
      htmlParts.push(
        `<div class="token-code-marker">\u0060\u0060\u0060${lang}</div>` +
        `<pre><code class="hljs language-${lang}">${escapeHtml(code)}</code></pre>` +
        `<div class="token-code-marker">\u0060\u0060\u0060</div>`
      );
    } else if (token.className) {
      htmlParts.push(`<span class="${token.className}">${escapeHtml(token.content)}</span>`);
    } else {
      htmlParts.push(escapeHtml(token.content));
    }
  }
  
  const newHtml = htmlParts.join('');
  
  // Only update if different
  if (element.innerHTML !== newHtml) {
    element.innerHTML = newHtml;
    
    // Apply highlight.js to any code blocks
    const codeBlocks = element.querySelectorAll('pre code.hljs');
    codeBlocks.forEach(block => {
      if (typeof hljs !== 'undefined' && hljs.highlightElement) {
        hljs.highlightElement(block as HTMLElement);
      }
    });
  }
}

// Synchronous highlighter for initial mount and programmatic switches
function applySyntaxHighlightingNow(element: HTMLElement): void {
  if (!element) return;
  const text = element.innerText || element.textContent || '';
  const tokens = parseIntoTokens(text);
  applyIncrementalUpdate(element, tokens);
}

// Track IME composition state to avoid fighting the caret
const composingEditors = new WeakSet<HTMLElement>();

const applySyntaxHighlighting = (element: HTMLElement, immediate: boolean = false): void => {
  if (!element || !element.isConnected) return;

  // Don't highlight during IME composition
  if (composingEditors.has(element)) return;

  if (immediate) {
    applySyntaxHighlightingNow(element);
  }
};

/**
 * Enhance existing textareas with syntax highlighting using contenteditable
 */
export function enhanceTextarea(textarea: HTMLTextAreaElement): void {
    // Create a contenteditable div to replace the textarea
    const container = document.createElement('div');
    container.className = 'prompt-styling-container';
    
    const editor = document.createElement('div');
    editor.className = 'prompt-styling-editor';
    editor.contentEditable = 'true';
    editor.setAttribute('spellcheck', 'false');
    // Insert container before textarea and move textarea inside
    textarea.parentNode?.insertBefore(container, textarea);
    container.appendChild(editor);
    container.appendChild(textarea);
    
    // Hide the original textarea and mark as enhanced
    textarea.style.display = 'none';
    textarea.dataset.psEnhanced = 'true';
    
    // Store reference to editor on textarea for content updates
    (textarea as any).promptEditor = editor;
    
    // Set initial content and highlight it
    if (textarea.value) {
        editor.textContent = textarea.value;
        const tokens = parseIntoTokens(textarea.value);
        const html = tokens.map(token => {
            if (token.content === '\n') {
                return '<br>';
            } else if (token.className) {
                return `<span class="${token.className}">${escapeHtml(token.content)}</span>`;
            } else {
                return escapeHtml(token.content);
            }
        }).join('');
        editor.innerHTML = html;
    }
    
    // Clean up when editor is removed
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (node === editor) {
                    // Clean up when editor is removed
                    composingEditors.delete(editor);
                    observer.disconnect();
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Highlight after typing stops
    let highlightTimer: any = null;
    
    editor.addEventListener('input', () => {
        const currentText = getPlainTextFromEditor(editor);
        
        // Update the hidden textarea value immediately
        textarea.value = currentText;
        // Trigger input event on textarea for PromptsManager
        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);
        
        // Clear any pending highlight
        if (highlightTimer) {
            clearTimeout(highlightTimer);
        }
        
        // Apply highlighting after a delay
        highlightTimer = setTimeout(() => {
            // NEVER update while editor is focused - this completely avoids cursor issues
            if (document.activeElement === editor) {
                // Don't reschedule, just skip
                return;
            }
            
            const tokens = parseIntoTokens(currentText);
            // Use central updater so code blocks get proper hljs highlighting
            applyIncrementalUpdate(editor, tokens);
        }, 500); // Reduced delay as requested
    });
    
    // Immediate highlight on blur
    editor.addEventListener('blur', () => {
        if (highlightTimer) {
            clearTimeout(highlightTimer);
            highlightTimer = null;
        }
        // Always highlight on blur using central updater (ensures hljs is applied)
        const currentText = getPlainTextFromEditor(editor);
        const tokens = parseIntoTokens(currentText);
        applyIncrementalUpdate(editor, tokens);
    });
    
    // Handle paste to convert to plain text
    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
    });
    
    // Handle Enter key to ensure reliable new lines
    editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                // Remove current selection
                range.deleteContents();
                // Insert <br> and a zero-width space to place caret after line break
                const br = document.createElement('br');
                const zwsp = document.createTextNode('\u200B');
                range.insertNode(br);
                range.setStartAfter(br);
                range.collapse(true);
                range.insertNode(zwsp);
                // Move caret after the zwsp
                const newRange = document.createRange();
                newRange.setStartAfter(zwsp);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                // Dispatch input to sync hidden textarea
                const event = new Event('input', { bubbles: true });
                editor.dispatchEvent(event);
            }
        }
    });

    // Respect IME composition to avoid caret jumping/crashes
    editor.addEventListener('compositionstart', () => {
        composingEditors.add(editor);
    });
    editor.addEventListener('compositionend', () => {
        composingEditors.delete(editor);
        // Re-highlight immediately after composition ends
        applySyntaxHighlighting(editor, true);
    });
    
    // Listen for textarea value changes from outside (agent switching)
    const valueObserver = new MutationObserver(() => {
        if (textarea.value !== editor.textContent) {
            editor.textContent = textarea.value;
            applySyntaxHighlightingNow(editor);
        }
    });
    valueObserver.observe(textarea, { attributes: true, attributeFilter: ['value'] });
    
    // Remove continuous polling loop to avoid performance issues/crashes
}

/**
 * Update content in enhanced textareas when switching between agents/prompts
 */
export function updatePromptContent(): void {
    const textareas = document.querySelectorAll('.prompt-textarea') as NodeListOf<HTMLTextAreaElement>;
    
    textareas.forEach(textarea => {
        if (textarea.dataset.psEnhanced === 'true' && (textarea as any).promptEditor) {
            const editor = (textarea as any).promptEditor;
            if (editor.textContent !== textarea.value) {
                editor.textContent = textarea.value;
                applySyntaxHighlightingNow(editor);
            }
        }
    });
}

/**
 * Initialize all prompt textareas in the PromptsManager modal
 */
export function initializePromptStyling(): void {
    // Wait for hljs to be available
    if (typeof hljs === 'undefined') {
        console.warn('highlight.js not loaded, retrying...');
        setTimeout(initializePromptStyling, 100);
        return;
    }
    
    // Find all prompt textareas
    const textareas = document.querySelectorAll('.prompt-textarea') as NodeListOf<HTMLTextAreaElement>;
    
    textareas.forEach(textarea => {
        // Skip if already enhanced
        if (textarea.dataset.psEnhanced === 'true' || textarea.parentElement?.classList.contains('prompt-styling-container')) {
            return;
        }
        
        enhanceTextarea(textarea);
    });
    
    // Update content for any mode switches
    updatePromptContent();
}
