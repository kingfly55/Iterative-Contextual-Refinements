import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'dompurify';
import { highlightCodeSync, isLanguageSupported, resolveLanguage } from '../Shiki';
import he from 'he';
import { nanoid } from 'nanoid';
import type { Root as HastRoot, Element as HastElement, Text as HastText } from 'hast';
import type { Code } from 'mdast';

// --- Constants & Config ---

const MAX_CODE_HIGHLIGHT_SIZE = 50000;

// --- Helper Functions ---

export function escapeHtml(str: string): string {
    return he.encode(str, { useNamedReferences: true });
}

export function decodeEntities(str: string): string {
    return he.decode(str);
}

export function generateCodeId(): string {
    return `code-${nanoid(9)}`;
}

// --- HTML Templates ---

const COPY_ICON_SVG = `<span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>`;

interface CodeBlockOptions {
    codeId: string;
    language: string;
    displayLang: string;
    highlightedCode: string;
    extraClass?: string;
}

function renderCodeBlockHtml({ codeId, language, displayLang, highlightedCode, extraClass = '' }: CodeBlockOptions): string {
    const isShikiBlock = highlightedCode.includes('<pre class="shiki');

    const contentHtml = isShikiBlock
        ? highlightedCode
        : `<pre><code id="${escapeHtml(codeId)}" class="language-${escapeHtml(language)}">${highlightedCode}</code></pre>`;

    return `<div class="code-block-container ${extraClass}">
<div class="code-block-header">
<span class="code-block-title">${escapeHtml(displayLang)}</span>
<button class="code-copy-icon copy-code-btn" data-code-id="${escapeHtml(codeId)}" title="Copy code" onclick="window.copyCodeBlock && window.copyCodeBlock('${escapeHtml(codeId)}')">${COPY_ICON_SVG}</button>
</div>
<div class="code-block-content">
${contentHtml}
</div>
</div>`;
}

interface OutputBlockOptions {
    title: string;
    content: string;
    extraClass?: string;
}

function renderOutputBlockHtml({ title, content, extraClass = '' }: OutputBlockOptions): string {
    return `<div class="code-block-container exec-output-block ${extraClass}">
<div class="code-block-header">
<span class="code-block-title">${escapeHtml(title)}</span>
</div>
<div class="code-block-content exec-output-content">
<pre><code class="exec-output-text">${content}</code></pre>
</div>
</div>`;
}

interface ImageItemOptions {
    dataUrl: string;
    mimeType: string;
    formatLabel: string;
    estimatedSizeKB: number;
}

function renderImageItemHtml({ dataUrl, mimeType, formatLabel, estimatedSizeKB }: ImageItemOptions): string {
    return `<div class="exec-image-item" data-src="${escapeHtml(dataUrl)}" data-mime="${escapeHtml(mimeType)}" data-format="${escapeHtml(formatLabel)}" data-size="${estimatedSizeKB}" onclick="window.previewImage && window.previewImage(this)">
<img src="${escapeHtml(dataUrl)}" alt="Generated visualization" class="exec-rendered-image" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'exec-image-error\\'>Failed to render image</div>';"/>
</div>`;
}

function renderImageGridHtml(imagesHtml: string): string {
    return `<div class="code-block-container exec-image-block">
<div class="code-block-header">
<span class="code-block-title">FIGURE</span>
</div>
<div class="exec-image-grid">${imagesHtml}</div>
</div>`;
}

function renderImageErrorHtml(errorMessage: string): string {
    return `<div class="exec-image-item exec-image-error-item">
<div class="exec-image-error">${escapeHtml(errorMessage)}</div>
</div>`;
}

// --- Rendering Logic ---

function renderCompleteDocument(content: string, type: 'latex' | 'html'): string {
    const codeId = generateCodeId();
    const codeToHighlight = type === 'html' ? decodeEntities(content) : content;
    let highlightedCode = '';

    try {
        if (content.length <= MAX_CODE_HIGHLIGHT_SIZE && isLanguageSupported(type)) {
            highlightedCode = highlightCodeSync(codeToHighlight, type);
        } else {
            highlightedCode = escapeHtml(codeToHighlight);
        }
    } catch {
        highlightedCode = escapeHtml(codeToHighlight);
    }

    const displayLang = type === 'latex' ? 'LATEX DOCUMENT' : 'HTML';
    const codeBlock = renderCodeBlockHtml({ codeId, language: type, displayLang, highlightedCode });

    return `<div class="rich-content-display"><div class="latex-content-wrapper"><div style="font-size: 1.4rem; line-height: 1.6;">${codeBlock}</div></div></div>`;
}

function renderCodeBlock(code: string, language: string): string {
    const codeId = generateCodeId();
    const validLang = language && isLanguageSupported(language) ? resolveLanguage(language) : 'plaintext';
    const cleanCode = decodeEntities(code);
    let highlightedCode = '';

    const alreadyHighlighted = /<span\s+class="(hljs-|shiki)/.test(cleanCode);

    if (alreadyHighlighted) {
        highlightedCode = cleanCode;
    } else if (cleanCode.length > MAX_CODE_HIGHLIGHT_SIZE) {
        highlightedCode = escapeHtml(cleanCode);
        console.warn(`Code block too large (${cleanCode.length} chars), skipping syntax highlighting`);
    } else {
        try {
            highlightedCode = highlightCodeSync(cleanCode, validLang);
        } catch {
            highlightedCode = escapeHtml(cleanCode);
        }
    }

    return renderCodeBlockHtml({
        codeId,
        language: validLang || 'text',
        displayLang: (language || 'Code').toUpperCase(),
        highlightedCode
    });
}

// --- Code Execution Block Rendering ---

let executionCellCounter = 0;

function renderCodeExecutionBlock(code: string, language: string, _cellNumber: number): string {
    const codeId = generateCodeId();
    const validLang = language && isLanguageSupported(language) ? resolveLanguage(language) : 'python';
    const cleanCode = decodeEntities(code);
    let highlightedCode = '';

    const alreadyHighlighted = /<span\s+class="(hljs-|shiki)/.test(cleanCode);

    if (alreadyHighlighted) {
        highlightedCode = cleanCode;
    } else if (cleanCode.length > MAX_CODE_HIGHLIGHT_SIZE) {
        highlightedCode = escapeHtml(cleanCode);
    } else {
        try {
            highlightedCode = highlightCodeSync(cleanCode, validLang);
        } catch {
            highlightedCode = escapeHtml(cleanCode);
        }
    }

    return renderCodeBlockHtml({
        codeId,
        language: validLang,
        displayLang: validLang.toUpperCase(),
        highlightedCode,
        extraClass: 'exec-code-block'
    });
}

function renderExecutionOutputBlock(output: string, _cellNumber: number): string {
    const escapedOutput = escapeHtml(output);
    const hasError = output.toLowerCase().includes('error') ||
        output.toLowerCase().includes('traceback') ||
        output.toLowerCase().includes('exception');

    return renderOutputBlockHtml({
        title: hasError ? 'ERROR' : 'OUTPUT',
        content: escapedOutput,
        extraClass: hasError ? 'exec-output-error' : ''
    });
}

function renderExecutionImageBlock(base64Data: string, mimeType: string, _cellNumber: number): string {
    if (!base64Data || base64Data.trim() === '') {
        return renderImageErrorHtml('Empty image data received');
    }

    const normalizedMimeType = mimeType?.startsWith('image/') ? mimeType : 'image/png';
    const formatLabel = normalizedMimeType.replace('image/', '').toUpperCase();

    let dataUrl: string;
    if (base64Data.startsWith('data:')) {
        dataUrl = base64Data;
    } else {
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        const cleanBase64 = base64Data.replace(/\s/g, '');

        if (!base64Regex.test(cleanBase64)) {
            return renderImageErrorHtml('Invalid base64 encoding');
        }

        dataUrl = `data:${normalizedMimeType};base64,${cleanBase64}`;
    }

    const estimatedSizeKB = Math.round((base64Data.length * 3) / 4 / 1024);

    return renderImageItemHtml({ dataUrl, mimeType: normalizedMimeType, formatLabel, estimatedSizeKB });
}

let storedBlocks: string[] = [];

function preprocessCodeExecutionBlocks(content: string): { processed: string; blocks: string[] } {
    let processed = content;
    executionCellCounter = 0;
    storedBlocks = [];

    const storePlaceholder = (html: string): string => {
        const idx = storedBlocks.length;
        storedBlocks.push(html);
        return `<!--STORED_BLOCK_${idx}-->`;
    };

    const codeExecPattern = /<!-- CODE_EXECUTION_START -->\s*\n?<!-- LANGUAGE: (\w+) -->\s*\n?```\w*\n([\s\S]*?)\n```\s*\n?<!-- CODE_EXECUTION_END -->/g;
    processed = processed.replace(codeExecPattern, (_, language, code) => {
        executionCellCounter++;
        const html = renderCodeExecutionBlock(code.trim(), language.toLowerCase(), executionCellCounter);
        return storePlaceholder(html);
    });

    let outputCounter = 0;
    const outputPattern = /<!-- EXECUTION_OUTPUT_START -->\s*\n?```\n?([\s\S]*?)\n?```\s*\n?<!-- EXECUTION_OUTPUT_END -->/g;
    processed = processed.replace(outputPattern, (_, output) => {
        outputCounter++;
        const html = renderExecutionOutputBlock(output.trim(), outputCounter);
        return storePlaceholder(html);
    });

    const imagePattern = /<!-- EXECUTION_IMAGE_START -->\s*\n?<!-- MIME_TYPE: ([^\s]+) -->\s*\n?([\s\S]*?)\n?<!-- EXECUTION_IMAGE_END -->/g;
    let imageCounter = 0;
    const imageHtmlParts: string[] = [];
    processed = processed.replace(imagePattern, (_, mimeType, base64Data) => {
        imageCounter++;
        const html = renderExecutionImageBlock(base64Data.trim(), mimeType, imageCounter);
        imageHtmlParts.push(html);
        return `<!--TEMP_IMG_${imageHtmlParts.length - 1}-->`;
    });

    let finalProcessed = '';
    let currentImageGroup: number[] = [];

    // Split the text by exactly the image placeholder markers
    const parts = processed.split(/(<!--TEMP_IMG_\d+-->)/);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const match = part.match(/<!--TEMP_IMG_(\d+)-->/);

        if (match) {
            currentImageGroup.push(parseInt(match[1], 10));
        } else {
            // If the text between images isn't just whitespace, flush the group.
            // If it is just whitespace, we let the group continue.
            if (part.trim() !== '') {
                if (currentImageGroup.length > 0) {
                    const imagesHtml = currentImageGroup.map(idx => imageHtmlParts[idx]).join('');
                    finalProcessed += storePlaceholder(renderImageGridHtml(imagesHtml));
                    currentImageGroup = [];
                }
                finalProcessed += part;
            } else if (currentImageGroup.length === 0) {
                finalProcessed += part;
            }
        }
    }

    // Flush any remaining trailing images
    if (currentImageGroup.length > 0) {
        const imagesHtml = currentImageGroup.map(idx => imageHtmlParts[idx]).join('');
        finalProcessed += storePlaceholder(renderImageGridHtml(imagesHtml));
    }

    return { processed: finalProcessed, blocks: storedBlocks };
}

// --- Unified Pipeline ---

function rehypeAddClasses() {
    return (tree: HastRoot) => {
        const visit = (node: HastRoot | HastElement | HastText) => {
            if (node.type === 'element') {
                const element = node as HastElement;

                if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.tagName)) {
                    const level = parseInt(element.tagName[1]);
                    const existingClass = (element.properties?.className as string[] || []).join(' ');
                    const levelClass = level <= 3 ? `token-heading${level}` : '';
                    element.properties = element.properties || {};
                    element.properties.className = `token-heading ${levelClass} ${existingClass}`.trim().split(' ').filter(Boolean);
                }

                // Catch bold tokens
                if (element.tagName === 'strong') {
                    element.properties = element.properties || {};
                    const existingClass = (element.properties.className as string[] || []);
                    element.properties.className = [...existingClass, 'token-critical'];
                }

                // Make native markdown images clickable like Code Execution ones
                if (element.tagName === 'img') {
                    element.properties = element.properties || {};
                    const src = element.properties.src as string || '';
                    const alt = element.properties.alt as string || 'Image';

                    element.properties.className = ['exec-rendered-image', 'markdown-image'];
                    element.properties.loading = 'lazy';

                    // Create a wrapper mimicking the exec-image-item layout
                    const wrapper: HastElement = {
                        type: 'element',
                        tagName: 'div',
                        properties: {
                            className: ['exec-image-item'],
                            'data-src': src,
                            'data-format': 'IMAGE',
                            'data-alt': alt,
                            // The onclick attribute handles Vanilla HTML injections. React zones use synthetic bubbling.
                            onclick: 'window.previewImage && window.previewImage(this)'
                        },
                        children: [{ ...element }]
                    };

                    // Mutate the original element pointer into the wrapper
                    Object.assign(element, wrapper);
                }

                if (element.children) {
                    element.children.forEach(child => visit(child as HastElement));
                }
            }
        };

        tree.children.forEach(child => visit(child as HastElement));
    };
}

function createProcessor() {
    return unified()
        .use(remarkParse)
        .use(remarkMath)
        .use(remarkGfm)
        .use(remarkRehype, {
            allowDangerousHtml: true,
            handlers: {
                code(_state: unknown, node: Code) {
                    return {
                        type: 'raw',
                        value: renderCodeBlock(node.value, node.lang || '')
                    };
                }
            }
        })
        .use(rehypeRaw)
        .use(rehypeKatex, {
            throwOnError: false,
            trust: true,
            strict: false
        })
        .use(rehypeAddClasses)
        .use(rehypeStringify, {
            allowDangerousHtml: true
        });
}

let cachedProcessor: ReturnType<typeof createProcessor> | null = null;

function getProcessor() {
    if (!cachedProcessor) {
        cachedProcessor = createProcessor();
    }
    return cachedProcessor;
}

const LATEX_COMMAND_PATTERN = /\\[a-zA-Z]+/;
const MATH_NOTATION_PATTERNS = [
    /[_^]\{[^}]+\}/,
    /\\[{}]/,
];

function containsLatexMath(content: string): boolean {
    if (LATEX_COMMAND_PATTERN.test(content)) {
        return true;
    }
    return MATH_NOTATION_PATTERNS.some(pattern => pattern.test(content));
}

function convertBacktickedLatexToMath(content: string): string {
    return content.replace(/(?<!`)`([^`]+)`(?!`)/g, (match, codeContent) => {
        if (containsLatexMath(codeContent)) {
            return `$$${codeContent}$$`;
        }
        return match;
    });
}

// --- Main Render Function ---

export function renderMathContent(content: string): string {
    if (!content) return '';

    const mathConvertedContent = convertBacktickedLatexToMath(content);
    const { processed: preprocessedContent, blocks } = preprocessCodeExecutionBlocks(mathConvertedContent);

    const trimmed = preprocessedContent.trim();
    if (trimmed.startsWith('\\documentclass') || (trimmed.includes('\\begin{document}') && trimmed.includes('\\end{document}'))) {
        return renderCompleteDocument(preprocessedContent, 'latex');
    }
    if (trimmed.startsWith('<!DOCTYPE html>') || (trimmed.startsWith('<html') && trimmed.includes('</html>'))) {
        return renderCompleteDocument(preprocessedContent, 'html');
    }

    const processor = getProcessor();
    let resultHtml: string;

    try {
        const result = processor.processSync(preprocessedContent);
        resultHtml = String(result);
    } catch (error) {
        console.error('Unified processing error:', error);
        resultHtml = `<pre>${escapeHtml(preprocessedContent)}</pre>`;
    }

    blocks.forEach((html, idx) => {
        resultHtml = resultHtml.replace(`<!--STORED_BLOCK_${idx}-->`, html);
    });

    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node instanceof HTMLElement && node.style.color) {
            node.style.removeProperty('color');
        }
    });

    resultHtml = DOMPurify.sanitize(resultHtml, {
        ADD_TAGS: [
            'div', 'span', 'pre', 'code',
            'math', 'annotation', 'semantics', 'mrow', 'mn', 'mo', 'mi', 'msup', 'msub', 'mfrac',
            'mtext', 'mspace', 'msqrt', 'mroot', 'mover', 'munder', 'munderover', 'mtable', 'mtr', 'mtd',
            'table', 'tr', 'td', 'th', 'tbody', 'thead', 'caption', 'colgroup', 'col',
            'svg', 'polygon', 'polyline', 'line', 'rect', 'path', 'circle', 'g', 'defs', 'use', 'symbol',
            'img', 'del', 's', 'input'
        ],
        ADD_ATTR: [
            'class', 'style', 'title', 'id',
            'data-code-id', 'data-cell-number',
            'data-src', 'data-mime', 'data-format', 'data-size',
            'viewBox', 'd', 'fill', 'stroke', 'stroke-width',
            'x', 'y', 'width', 'height', 'rx', 'ry',
            'points', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r',
            'xmlns', 'xmlns:xlink', 'xlink:href', 'transform',
            'src', 'alt', 'loading',
            'align', 'valign', 'colspan', 'rowspan',
            'type', 'checked', 'disabled'
        ],
        ADD_URI_SCHEMES: ['data'],
        RETURN_TRUSTED_TYPE: false
    } as any) as unknown as string;

    DOMPurify.removeHook('afterSanitizeAttributes');

    return `<div class="rich-content-display"><div class="latex-content-wrapper" style="font-size: 1.4rem; line-height: 1.6;">${resultHtml}</div></div>`;
}
