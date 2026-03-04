/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { highlightCodeSync, isLanguageSupported, resolveLanguage } from '../Shiki';

const GRAMMAR = {
  CODE_BLOCK: /(```(?:[\w-]*)\n[\s\S]*?```)/g,
  HEADING: /^(#{1,6})(\s.*)$/,
  LIST_ITEM: /^(\s*-\s)(.*)/,
  TOKENS: new RegExp(
    [
      /(\{\{[^}]+\}\})/,
      /(<\/?[\w\s="-]+>)/,
      /(\[[^\]]+\])/,
      /(\*\*.*?\*\*)/,
      /(`[^`]+`)/,
      /(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
      /\b(You must|Must|Always|Ensure|IMPORTANT|CRITICAL|Mandatory|Required|Require|Be sure to|Make sure to|Ensure that|Strictly|At all times)\b/,
      /\b(Never|Do not|Don't|Avoid|Must not|Mustn't|Should not|Shouldn't|No|Not allowed|Prohibited|Forbidden|Disallowed|Cannot|Can't)\b/
    ].map(r => r.source).join('|'),
    'gi'
  ),
  TYPES: {
    VAR: /^\{\{/,
    TAG: /^</,
    INST: /^\[/,
    CRIT: /^\*\*/,
    CODE: /^`/,
    STR: /^["']/,
    POS: /^(?:You must|Must|Always|Ensure|IMPORTANT|CRITICAL|Mandatory|Required|Require|Be sure to|Make sure to|Ensure that|Strictly|At all times)$/i,
    NEG: /^(?:Never|Do not|Don't|Avoid|Must not|Mustn't|Should not|Shouldn't|No|Not allowed|Prohibited|Forbidden|Disallowed|Cannot|Can't)$/i
  }
};

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
};

export const Utils = {
  escapeHtml: (unsafe: string): string => unsafe.replace(/[&<>"']/g, c => ESCAPE_MAP[c]),

  getPlainText: (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\u200B/g, '');
    }
    if (node.nodeName === 'BR') {
      return '\n';
    }
    if (Utils.isBlockElement(node)) {
      let content = '';
      node.childNodes.forEach(child => {
        content += Utils.getPlainText(child);
      });
      if (node.previousSibling && node.previousSibling.nodeName !== 'BR' && content.length > 0) {
        return '\n' + content;
      }
      return content;
    }
    let text = '';
    node.childNodes.forEach(child => {
      text += Utils.getPlainText(child);
    });
    return text;
  },

  isBlockElement: (node: Node): boolean => {
    return (node.nodeType === Node.ELEMENT_NODE) &&
      ['DIV', 'P', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'].includes(node.nodeName);
  }
};

export class CaretManager {
  static getCaretPosition(root: HTMLElement): number {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;
    const range = selection.getRangeAt(0);
    const targetNode = range.startContainer;
    const targetOffset = range.startOffset;
    let currentIndex = 0;
    let found = false;

    const walk = (node: Node) => {
      if (found) return;
      if (node === targetNode) {
        if (node.nodeType === Node.TEXT_NODE) {
          currentIndex += targetOffset;
        } else {
          for (let i = 0; i < targetOffset; i++) {
            const child = node.childNodes[i];
            currentIndex += Utils.getPlainText(child).length;
          }
        }
        found = true;
        return;
      }
      if (Utils.isBlockElement(node) && node.previousSibling && node.hasChildNodes()) {
        currentIndex += 1;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').replace(/\u200B/g, '');
        currentIndex += text.length;
      }
      else if (node.nodeName === 'BR') {
        currentIndex += 1;
      }
      if (!found && node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (found) return;
        }
      }
    };
    walk(root);
    return currentIndex;
  }

  static setCaretPosition(root: HTMLElement, targetIndex: number): void {
    const selection = window.getSelection();
    if (!selection) return;
    let currentIndex = 0;
    let rangeSet = false;
    const range = document.createRange();

    const walk = (node: Node) => {
      if (rangeSet) return;
      if (Utils.isBlockElement(node) && node.previousSibling && node.hasChildNodes()) {
        if (currentIndex === targetIndex) {
          range.setStart(node, 0);
          range.collapse(true);
          rangeSet = true;
          return;
        }
        currentIndex += 1;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').replace(/\u200B/g, '');
        const len = text.length;
        if (currentIndex + len >= targetIndex) {
          const offset = targetIndex - currentIndex;
          range.setStart(node, offset);
          range.collapse(true);
          rangeSet = true;
          return;
        }
        currentIndex += len;
      }
      else if (node.nodeName === 'BR') {
        if (currentIndex === targetIndex) {
          range.setStartBefore(node);
          range.collapse(true);
          rangeSet = true;
          return;
        }
        currentIndex += 1;
      }
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (rangeSet) return;
        }
      }
    };
    walk(root);
    if (!rangeSet) {
      range.selectNodeContents(root);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

export class Tokenizer {
  static parse(text: string) {
    const tokens: any[] = [];
    const parts = text.split(GRAMMAR.CODE_BLOCK);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (part.startsWith('```') && (part.endsWith('```') || i === parts.length - 1)) {
        const lines = part.split('\n');
        const lang = lines[0].slice(3).trim() || 'plaintext';
        const code = lines.slice(1, part.endsWith('```') ? -1 : undefined).join('\n');
        tokens.push({ type: 'code-block', content: code, lang });
        continue;
      }
      Tokenizer.parseInline(part, tokens);
    }
    return tokens;
  }

  private static parseInline(text: string, tokens: any[]) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) tokens.push({ type: 'newline' });
      if (!line) return;
      const hMatch = line.match(GRAMMAR.HEADING);
      if (hMatch) {
        tokens.push({ type: 'heading', content: line, level: hMatch[1].length });
        return;
      }
      const lMatch = line.match(GRAMMAR.LIST_ITEM);
      if (lMatch) {
        tokens.push({ type: 'list-marker', content: lMatch[1] });
        Tokenizer.tokenizeString(lMatch[2], tokens);
        return;
      }
      Tokenizer.tokenizeString(line, tokens);
    });
  }

  private static tokenizeString(text: string, tokens: any[]) {
    let lastIdx = 0;
    let match;
    GRAMMAR.TOKENS.lastIndex = 0;
    while ((match = GRAMMAR.TOKENS.exec(text)) !== null) {
      if (match.index > lastIdx) {
        tokens.push({ type: 'text', content: text.substring(lastIdx, match.index) });
      }
      const raw = match[0];
      const type = Tokenizer.classify(raw);
      tokens.push({ type, content: raw });
      lastIdx = match.index + raw.length;
    }
    if (lastIdx < text.length) {
      tokens.push({ type: 'text', content: text.substring(lastIdx) });
    }
  }

  private static classify(text: string) {
    const T = GRAMMAR.TYPES;
    if (T.VAR.test(text)) return 'variable';
    if (T.TAG.test(text)) return 'tag';
    if (T.INST.test(text)) return 'instruction';
    if (T.CRIT.test(text)) return 'critical';
    if (T.CODE.test(text)) return 'code-inline';
    if (T.STR.test(text)) return 'string';
    if (T.POS.test(text)) return 'keyword-positive';
    if (T.NEG.test(text)) return 'keyword-negative';
    return 'text';
  }
}

export class Renderer {
  static render(tokens: any[]): string {
    return tokens.map(t => {
      switch (t.type) {
        case 'newline': return '<br>';
        case 'text': return Utils.escapeHtml(t.content);
        case 'code-block':
          let highlighted = '';
          let langClass = 'plaintext';
          if (t.lang) {
            try {
              const validLang = isLanguageSupported(t.lang) ? resolveLanguage(t.lang) : 'plaintext';
              langClass = validLang;
              const fullHtml = highlightCodeSync(t.content, validLang);
              const codeMatch = fullHtml.match(/<code[^>]*>([\s\S]*)<\/code>/);
              highlighted = codeMatch ? codeMatch[1] : Utils.escapeHtml(t.content);
            } catch (e) {
              highlighted = Utils.escapeHtml(t.content);
            }
          } else {
            highlighted = Utils.escapeHtml(t.content);
          }
          return `<div class="token-code-marker">\u0060\u0060\u0060${t.lang}</div><pre class="shiki"><code class="language-${langClass}">${highlighted}</code></pre><div class="token-code-marker">\u0060\u0060\u0060</div>`;
        case 'heading':
          return `<span class="token-heading token-heading${t.level}">${Utils.escapeHtml(t.content)}</span>`;
        case 'list-marker':
          return `<span class="token-list-marker">${Utils.escapeHtml(t.content)}</span>`;
        default:
          return `<span class="token-${t.type}">${Utils.escapeHtml(t.content)}</span>`;
      }
    }).join('');
  }
}
