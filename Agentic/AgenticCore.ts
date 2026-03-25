/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAPIRequestController } from '../Routing';
import { VERIFIER_SYSTEM_PROMPT } from './AgenticModePrompt';
import { searchArxiv, formatPaperForDisplay } from './ArxivAPI';

import { getSelectedModel, getSelectedTemperature, getSelectedTopP } from '../Routing';
import { globalState } from '../Core/State';
import { updateControlsState } from '../UI/Controls';
import type { AgenticPromptsManager } from './AgenticPromptsManager';
import { AgenticConversationManager } from './AgenticCoreLangchain';


// Verifier history storage - stores conversation history for each agentic session
interface VerifierHistoryEntry {
    timestamp: number;
    contentReceived: string;
    report: string;
}

// Map to store verifier history by session ID
const verifierHistoryMap = new Map<string, VerifierHistoryEntry[]>();

// Interfaces for Agentic mode
export interface DiffCommand {
    type: 'search_and_replace' | 'delete' | 'insert_before' | 'insert_after';
    params: string[];
}

// Parse inner operations for multi_edit(...)
// Supports bare calls like:
//   insert_after("marker", "text"); delete("x"); search_and_replace("a","b")
// separated by semicolons, commas, or newlines. Robust to parentheses/quotes inside strings.
function parseMultiEditOps(inner: string): DiffCommand[] {
    const ops: DiffCommand[] = [];
    const names = ['search_and_replace', 'delete', 'insert_before', 'insert_after'] as const;
    type OpName = typeof names[number];

    let i = 0;
    const len = inner.length;
    const isNameStart = (idx: number) => /[a-z_]/i.test(inner[idx] || '');

    const matchName = (idx: number): OpName | null => {
        for (const n of names) {
            if (inner.slice(idx, idx + n.length) === n) return n as OpName;
        }
        return null;
    };

    while (i < len) {
        // Skip whitespace and separators
        while (i < len && /[\s;,]/.test(inner[i])) i++;
        if (i >= len) break;

        if (!isNameStart(i)) { i++; continue; }
        const name = matchName(i);
        if (!name) { i++; continue; }
        i += name.length;
        // Skip spaces
        while (i < len && /\s/.test(inner[i])) i++;
        if (i >= len || inner[i] !== '(') { continue; }
        // Parse parenthesized arguments with quote awareness
        i++; // after '('
        let depth = 1;
        let startArgs = i;
        let inQuote: string | null = null;
        let escape = false;
        while (i < len) {
            const ch = inner[i];
            if (escape) { escape = false; i++; continue; }
            if (ch === '\\') { escape = true; i++; continue; }
            if (inQuote) {
                if (ch === inQuote) { inQuote = null; }
                i++;
                continue;
            }
            if (ch === '"' || ch === '\'' || ch === '`') { inQuote = ch; i++; continue; }
            if (ch === '(') { depth++; i++; continue; }
            if (ch === ')') {
                depth--; i++;
                if (depth === 0) {
                    const argsRaw = inner.slice(startArgs, i - 1);
                    const args = parseCommandParams(argsRaw);
                    if (args.length > 0) {
                        ops.push({ type: name, params: args });
                    }
                    break;
                }
                continue;
            }
            i++;
        }
        // move past any trailing separators
        while (i < len && /[\s;,]/.test(inner[i])) i++;
    }

    return ops;
}

export type ToolCall =
    | { type: 'read_current_content'; params?: number[] }
    | { type: 'Exit' }
    | { type: 'verify_current_content' }
    | { type: 'multi_edit'; operations: DiffCommand[] }
    | { type: 'searchacademia'; query: string }
    | { type: 'searchacademia_and'; terms: string[] };

// Provider-agnostic text extraction utility
export function extractTextFromAny(response: any): string {
    try {
        if (!response) return '';

        // Direct string
        if (typeof response === 'string') return response;

        // Priority 1: Direct text property (used by our mock responses)
        if (typeof (response as any).text === 'string') return (response as any).text;

        // Priority 2: Gemini-style nested structure
        const gemParts = (response as any).candidates?.[0]?.content?.parts;
        if (Array.isArray(gemParts)) {
            const joined = gemParts.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
            if (joined.trim()) return joined;
            const first = gemParts[0];
            if (first?.text) return first.text;
        }

        // Priority 3: Mock response structure (our providers use this)
        const mockParts = (response as any).response?.candidates?.[0]?.content?.parts;
        if (Array.isArray(mockParts) && mockParts[0]?.text) {
            return mockParts[0].text;
        }

        // Priority 4: OpenAI-style
        const openAIChoice = (response as any).choices?.[0];
        if (openAIChoice?.message?.content) return openAIChoice.message.content;
        if (openAIChoice?.text) return openAIChoice.text;

        // Priority 5: Raw Anthropic-style (fallback for direct API responses)
        const anthContent = (response as any).content;
        if (Array.isArray(anthContent) && anthContent[0]?.text) return anthContent[0].text;
        if ((response as any).completion) return (response as any).completion;

        // Priority 6: Alternative message formats
        if ((response as any).message?.content) return (response as any).message.content;

        // Priority 7: Function call fallback for Gemini
        if (typeof (response as any).response?.text === 'function') {
            return (response as any).response.text();
        }

        // Priority 8: Try calling .text() method directly (used by other modes)
        if (typeof (response as any).text === 'function') {
            return (response as any).text();
        }

        // Fallback: try to stringify primitives
        if (typeof response === 'object') {
            const maybe = (response as any).toString?.();
            if (typeof maybe === 'string' && maybe !== '[object Object]') return maybe;
        }
        return '';
    } catch {
        return '';
    }
}

// Types for parsed response segments
export type ResponseSegment =
    | { kind: 'text'; text: string }
    | { kind: 'diff'; command: DiffCommand }
    | { kind: 'tool'; tool: ToolCall };

export type ResponseActionWithPos = {
    pos: number;
    end: number;
    action: DiffCommand | ToolCall;
};

export interface ParsedResponse {
    actions: Array<DiffCommand | ToolCall>;
    actionsWithPos: ResponseActionWithPos[];
    segments: ResponseSegment[];
}

// Types for system message blocks
export type SystemBlock =
    | { kind: 'edit_ok' }
    | { kind: 'error'; message: string }
    | { kind: 'ignored_tool'; tool: string }
    | { kind: 'tool_result'; tool: string; result: string; toolCall?: ToolCall };

export interface AgenticMessage {
    id: string;
    role: 'agent' | 'system' | 'user';
    content: string;
    timestamp: number;
    commands?: DiffCommand[];
    toolCalls?: ToolCall[];
    status?: 'success' | 'error' | 'processing';
    segments?: ResponseSegment[];  // For agent messages
    blocks?: SystemBlock[];  // For system messages
}

export interface ContentHistoryEntry {
    content: string;
    title: string;
    timestamp: number;
}

export interface AgenticState {
    id: string;
    originalContent: string;
    currentContent: string;
    messages: AgenticMessage[];
    isProcessing: boolean;
    isComplete: boolean;
    error?: string;
    streamBuffer: string;
    contentHistory: ContentHistoryEntry[];
}

// System prompt is now imported from AgenticModePrompt.ts

// Parse agent response with segments for efficient UI rendering
export function parseAgentResponseWithSegments(response: string): ParsedResponse {
    const actionsWithPos = parseActionsWithPositions(response);
    const actions = actionsWithPos.map(x => x.action);

    // Build segments from the response and actions
    const segments: ResponseSegment[] = [];
    const sanitizeNarrative = (text: string): string => {
        // AGGRESSIVE cleaning to prevent ANY tool syntax or code blocks from leaking

        // 1. Remove code blocks (```, ''', or single `)
        let cleaned = text
            .replace(/```[\s\S]*?```/g, '')  // Triple backticks
            .replace(/'''[\s\S]*?'''/g, '')  // Triple quotes
            .replace(/`[^`\n]+`/g, '')       // Inline code

            // 2. Remove bracketed tool/diff syntax
            .replace(/\[(TOOL_CALL|DIFF):([^\]]+)\]/g, '')
            .replace(/\[TOOL_RESULT:[^\]]+\]/g, '')
            .replace(/\[SYSTEM_ERROR:[^\]]+\]/g, '')

            // 3. Remove any lines that look like tool calls (even without brackets)
            .replace(/\b(multi_edit|read_current_content|verify_current_content|searchacademia|Exit)\s*\([^)]*\)/g, '')

            // 4. Remove any lines with search_and_replace, delete, insert_before, insert_after
            .replace(/\b(search_and_replace|delete|insert_before|insert_after)\s*\([^)]*\)/g, '');

        // 5. Filter out lines that are tool-related headers
        const lines = cleaned.split('\n');
        const filtered = lines.filter(l => {
            const trimmed = l.trim();
            // Skip empty lines
            if (!trimmed) return false;
            // Skip tool-related headers
            if (/^\s*Tools?\s+called:/i.test(l)) return false;
            if (/^\s*Tool[s]?\s+called:/i.test(l)) return false;
            if (/^\s*Commands?\s+executed:/i.test(l)) return false;
            if (/^\s*System:\s*/i.test(l)) return false;
            // Skip lines that are just function calls
            if (/^\s*\w+\s*\([^)]*\)\s*;?\s*$/.test(l)) return false;
            return true;
        });

        // 6. Clean up excessive whitespace
        return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    };
    let lastEnd = 0;

    // Sort by position to ensure proper ordering
    const sortedActions = [...actionsWithPos].sort((a, b) => a.pos - b.pos);

    for (const actionInfo of sortedActions) {
        // Add text segment before this action
        if (actionInfo.pos > lastEnd) {
            const raw = response.substring(lastEnd, actionInfo.pos);
            const text = sanitizeNarrative(raw);
            if (text.trim()) {
                segments.push({ kind: 'text', text });
            }
        }

        // Add action segment
        if ('params' in actionInfo.action) {
            segments.push({ kind: 'diff', command: actionInfo.action as DiffCommand });
        } else {
            segments.push({ kind: 'tool', tool: actionInfo.action as ToolCall });
        }

        lastEnd = actionInfo.end;
    }

    // Add trailing text if any
    if (lastEnd < response.length) {
        const raw = response.substring(lastEnd);
        const text = sanitizeNarrative(raw);
        if (text.trim()) {
            segments.push({ kind: 'text', text });
        }
    }

    return { actions, actionsWithPos, segments };
}

// Legacy function for backward compatibility
export function parseAgentResponse(response: string): Array<DiffCommand | ToolCall> {
    return parseAgentResponseWithSegments(response).actions;
}

// Internal function to parse actions with positions
function parseActionsWithPositions(response: string): ResponseActionWithPos[] {
    const actionsWithPos: ResponseActionWithPos[] = [];
    const bracketRanges: Array<{ start: number; end: number }> = [];

    // 1) Bracketed commands: [DIFF:...] or [TOOL_CALL:...] (non-greedy inner capture)
    const combinedRegex = /\[(DIFF|TOOL_CALL):(search_and_replace|delete|insert_before|insert_after|read_current_content|Exit|verify_current_content|multi_edit|searchacademia|searchacademia_and)\(([\s\S]*?)\)\]/gs;
    let m: RegExpExecArray | null;
    while ((m = combinedRegex.exec(response)) !== null) {
        const commandType = m[1];
        const subType = m[2];
        const paramsStr = m[3] ?? '';
        const start = m.index;
        const end = m.index + m[0].length;
        bracketRanges.push({ start, end });

        if (commandType === 'DIFF') {
            if (subType === 'multi_edit') {
                // Be tolerant: if model mistakenly used DIFF:multi_edit(...), treat it as TOOL_CALL:multi_edit
                const ops = parseMultiEditOps(paramsStr);
                if (ops.length > 0) {
                    actionsWithPos.push({ pos: start, end, action: { type: 'multi_edit', operations: ops } as ToolCall });
                }
            } else {
                const type = subType as DiffCommand['type'];
                const params = parseCommandParams(paramsStr);
                if (params.length > 0) {
                    actionsWithPos.push({ pos: start, end, action: { type, params } as DiffCommand });
                }
            }
        } else {
            const type = subType as ToolCall['type'];
            if (type === 'Exit' || type === 'verify_current_content') {
                actionsWithPos.push({ pos: start, end, action: { type } as ToolCall });
            } else if (type === 'read_current_content') {
                const nums = paramsStr.split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
                actionsWithPos.push({ pos: start, end, action: { type, params: nums.length ? nums : undefined } as ToolCall });
            } else if (type === 'multi_edit') {
                const ops = parseMultiEditOps(paramsStr);
                if (ops.length > 0) {
                    actionsWithPos.push({ pos: start, end, action: { type: 'multi_edit', operations: ops } as ToolCall });
                }
            } else if (type === 'searchacademia') {
                const params = parseCommandParams(paramsStr);
                if (params.length > 0) {
                    actionsWithPos.push({ pos: start, end, action: { type: 'searchacademia', query: params[0] } as ToolCall });
                }
            } else if (type === 'searchacademia_and') {
                const params = parseCommandParams(paramsStr);
                if (params.length > 0) {
                    actionsWithPos.push({ pos: start, end, action: { type: 'searchacademia_and', terms: params } as ToolCall });
                }
            }
        }
    }

    // Note: we no longer parse bare mentions; only bracketed [DIFF:...] and [TOOL_CALL:...] are recognized

    // 2) Bare function-like DIFF commands: disabled to avoid accidental triggers from narrative text
    const bareDiffRegex = /(delete|insert_before|insert_after|search_and_replace)\s*\(([\s\S]*?)\)/g;
    while (bareDiffRegex.exec(response) !== null) {
        // Ignore bare DIFF mentions; only bracketed [DIFF:...] is recognized
    }

    // 3) Bare tool calls: disabled; only bracketed [TOOL_CALL:...] is recognized
    const verifyRegex = /\bverify_current_content\s*\(\s*\)/g;
    while (verifyRegex.exec(response) !== null) {
        // Ignore bare tool mention
    }

    const readRegex = /\bread_current_content\s*\(\s*(\d+\s*,\s*\d+)?\s*\)/g;
    while (readRegex.exec(response) !== null) {
        // Ignore bare tool mention
    }

    // Exit() bare call disabled
    const exitRegex = /\bExit\s*\(\s*\)/g;
    while (exitRegex.exec(response) !== null) {
        // Ignore bare tool mention
    }

    // 3b) Bare multi_edit: disabled; only bracketed or consolidated actions are recognized
    const bareMultiRegex = /\bmulti_edit\s*\(\s*([\s\S]*?)\s*\)/g;
    while (bareMultiRegex.exec(response) !== null) {
        // Ignore bare multi_edit mentions
    }


    // If there are multiple DIFF commands, consolidate them into a single multi_edit tool call
    const diffs = actionsWithPos.filter(a => 'params' in a.action);
    if (diffs.length > 1) {
        // Sort by position to preserve first occurrence position
        actionsWithPos.sort((a, b) => a.pos - b.pos);
        const firstDiffPos = diffs[0].pos;
        const lastDiffEnd = Math.max(...diffs.map(d => d.end));
        const operations = diffs.map(d => d.action as DiffCommand);
        // Remove all diff entries
        const filtered = actionsWithPos.filter(a => !('params' in a.action));
        // Insert a single multi_edit tool at the first diff position
        filtered.push({ pos: firstDiffPos, end: lastDiffEnd, action: { type: 'multi_edit', operations } as ToolCall });
        filtered.sort((a, b) => a.pos - b.pos);
        return filtered;
    }

    // Otherwise return actions in order
    actionsWithPos.sort((a, b) => a.pos - b.pos);
    return actionsWithPos;
}

// Parse command parameters handling escaped quotes and complex syntax
function parseCommandParams(paramsStr: string): string[] {
    const params: string[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;
    let quoteChar: string | null = null; // Track which quote type we're in
    let bracketDepth = 0; // Track bracket nesting for complex syntax

    for (let i = 0; i < paramsStr.length; i++) {
        const char = paramsStr[i];
        const nextChar = i < paramsStr.length - 1 ? paramsStr[i + 1] : null;

        if (escapeNext) {
            // Enhanced escape sequence handling
            switch (char) {
                case 'n': current += '\n'; break;
                case 't': current += '\t'; break;
                case 'r': current += '\r'; break;
                case 'b': current += '\b'; break;
                case 'f': current += '\f'; break;
                case 'v': current += '\v'; break;
                case '0': current += '\0'; break;
                case '\\': current += '\\'; break;
                case '"': current += '"'; break;
                case "'": current += "'"; break;
                case '`': current += '`'; break;
                // Unicode escape sequences
                case 'u':
                    if (i + 4 < paramsStr.length) {
                        const unicode = paramsStr.substr(i + 1, 4);
                        if (/^[0-9a-fA-F]{4}$/.test(unicode)) {
                            current += String.fromCharCode(parseInt(unicode, 16));
                            i += 4;
                            break;
                        }
                    }
                    current += char;
                    break;
                // Hex escape sequences
                case 'x':
                    if (i + 2 < paramsStr.length) {
                        const hex = paramsStr.substr(i + 1, 2);
                        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                            current += String.fromCharCode(parseInt(hex, 16));
                            i += 2;
                            break;
                        }
                    }
                    current += char;
                    break;
                default:
                    // Keep the character as-is if not a recognized escape
                    current += char;
            }
            escapeNext = false;
        } else if (char === '\\') {
            // Check if this is actually an escape sequence or part of content
            if (nextChar && '"\'\'`nrtbfv0ux'.includes(nextChar)) {
                escapeNext = true;
            } else if (inQuotes) {
                // In quotes, always treat backslash as escape
                escapeNext = true;
            } else {
                // Outside quotes, might be literal backslash
                current += char;
            }
        } else if (!inQuotes && (char === '"' || char === "'" || char === '`')) {
            // Starting a quoted section
            inQuotes = true;
            quoteChar = char;
        } else if (inQuotes && char === quoteChar) {
            // Ending the quoted section
            inQuotes = false;
            quoteChar = null;
        } else if (!inQuotes) {
            // Track bracket depth for better parameter splitting
            if (char === '(' || char === '[' || char === '{') {
                bracketDepth++;
                current += char;
            } else if (char === ')' || char === ']' || char === '}') {
                bracketDepth--;
                current += char;
            } else if (char === ',' && bracketDepth === 0) {
                // Only split on comma if we're not inside brackets
                params.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        } else {
            // Inside quotes, keep everything
            current += char;
        }
    }

    // Add any remaining parameter
    if (current.trim()) {
        params.push(current.trim());
    }

    return params;
}

// Helper function to normalize whitespace for comparison
function normalizeWhitespace(str: string): string {
    // Normalize different types of spaces and line endings
    return str
        .replace(/\r\n/g, '\n') // Windows to Unix line endings
        .replace(/\r/g, '\n')   // Mac to Unix line endings
        .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Unicode spaces to regular space
        .replace(/\t/g, '    '); // Tab to 4 spaces (configurable)
}

// Calculate the actual end index for fuzzy matched content
function calculateFuzzyEndIndex(content: string, searchStr: string, startIndex: number): number {
    // Default to the expected length
    let endIndex = startIndex + searchStr.length;

    // Try to match normalized versions to find actual end
    const normalizedSearch = normalizeWhitespace(searchStr);
    const contentFromIndex = content.substring(startIndex);
    const normalizedContent = normalizeWhitespace(contentFromIndex);

    if (normalizedContent.startsWith(normalizedSearch)) {
        // Walk through both strings to find where the match actually ends
        let searchPos = 0;
        let contentPos = 0;

        while (searchPos < searchStr.length && contentPos < contentFromIndex.length) {
            const searchChar = searchStr[searchPos];
            const contentChar = contentFromIndex[contentPos];

            // Check if characters match (exact or normalized)
            if (searchChar === contentChar) {
                searchPos++;
                contentPos++;
            } else if (normalizeWhitespace(searchChar) === normalizeWhitespace(contentChar)) {
                searchPos++;
                contentPos++;
            } else if (/\s/.test(searchChar) && /\s/.test(contentChar)) {
                // Both are whitespace, skip until non-whitespace
                while (searchPos < searchStr.length && /\s/.test(searchStr[searchPos])) {
                    searchPos++;
                }
                while (contentPos < contentFromIndex.length && /\s/.test(contentFromIndex[contentPos])) {
                    contentPos++;
                }
            } else {
                // Mismatch - this shouldn't happen if fuzzyIndexOf succeeded
                break;
            }
        }

        endIndex = startIndex + contentPos;
    }

    return endIndex;
}

// Fuzzy string matching for better error recovery
function fuzzyIndexOf(content: string, searchStr: string, startIndex: number = 0): number {
    // First try exact match
    let index = content.indexOf(searchStr, startIndex);
    if (index !== -1) return index;

    // Try with normalized whitespace
    const normalizedContent = normalizeWhitespace(content);
    const normalizedSearch = normalizeWhitespace(searchStr);
    index = normalizedContent.indexOf(normalizedSearch, startIndex);
    if (index !== -1) {
        // Find the corresponding position in original content
        let originalPos = 0;
        let normalizedPos = 0;
        while (normalizedPos < index && originalPos < content.length) {
            const origChar = content[originalPos];
            const normChar = normalizeWhitespace(origChar);
            normalizedPos += normChar.length;
            originalPos++;
        }
        return originalPos;
    }

    // Try trimmed match (ignore leading/trailing whitespace)
    const trimmedSearch = searchStr.trim();
    if (trimmedSearch !== searchStr) {
        index = content.indexOf(trimmedSearch, startIndex);
        if (index !== -1) return index;
    }

    // Try with collapsed whitespace (multiple spaces to single space)
    const collapsedContent = content.replace(/\s+/g, ' ');
    const collapsedSearch = searchStr.replace(/\s+/g, ' ');
    index = collapsedContent.indexOf(collapsedSearch, startIndex);
    if (index !== -1) {
        // Map back to original position
        let origPos = 0;
        let collapsedPos = 0;
        while (collapsedPos < index && origPos < content.length) {
            if (/\s/.test(content[origPos])) {
                // Skip consecutive whitespace in original
                while (origPos < content.length && /\s/.test(content[origPos])) {
                    origPos++;
                }
                collapsedPos++; // Single space in collapsed
            } else {
                origPos++;
                collapsedPos++;
            }
        }
        return origPos;
    }

    // Try case-insensitive match as last resort for short strings
    if (searchStr.length < 100) {
        const lowerContent = content.toLowerCase();
        const lowerSearch = searchStr.toLowerCase();
        index = lowerContent.indexOf(lowerSearch, startIndex);
        if (index !== -1) {
            // Case-insensitive match found
            return index;
        }
    }

    return -1;
}

// Apply a diff command to the content
export function applyDiffCommand(content: string, command: DiffCommand): {
    success: boolean;
    result: string;
    error?: string
} {
    try {
        switch (command.type) {
            case 'search_and_replace': {
                if (command.params.length !== 2) {
                    return {
                        success: false,
                        result: content,
                        error: 'search_and_replace requires exactly 2 parameters'
                    };
                }
                const [find, replace] = command.params;

                // Try exact match first
                if (content.includes(find)) {
                    const result = content.replace(find, replace);
                    return { success: true, result };
                }

                // Try fuzzy matching
                const fuzzyIndex = fuzzyIndexOf(content, find);
                if (fuzzyIndex !== -1) {
                    // Calculate the actual matched length in the content
                    const endIndex = calculateFuzzyEndIndex(content, find, fuzzyIndex);

                    const result = content.substring(0, fuzzyIndex) + replace + content.substring(endIndex);
                    return { success: true, result };
                }

                return {
                    success: false,
                    result: content,
                    error: `String not found (tried exact and fuzzy matching): "${find.substring(0, 100)}${find.length > 100 ? '...' : ''}"`
                };
            }

            case 'delete': {
                if (command.params.length !== 1) {
                    return {
                        success: false,
                        result: content,
                        error: 'delete requires exactly 1 parameter'
                    };
                }
                const [toDelete] = command.params;

                // Try exact match first
                if (content.includes(toDelete)) {
                    const result = content.replace(toDelete, '');
                    return { success: true, result };
                }

                // Try fuzzy matching
                const fuzzyIndex = fuzzyIndexOf(content, toDelete);
                if (fuzzyIndex !== -1) {
                    // Calculate the actual matched length in the content
                    const endIndex = calculateFuzzyEndIndex(content, toDelete, fuzzyIndex);

                    const result = content.substring(0, fuzzyIndex) + content.substring(endIndex);
                    return { success: true, result };
                }

                return {
                    success: false,
                    result: content,
                    error: `String not found (tried exact and fuzzy matching): "${toDelete.substring(0, 100)}${toDelete.length > 100 ? '...' : ''}"`
                };
            }

            case 'insert_before': {
                if (command.params.length !== 2) {
                    return {
                        success: false,
                        result: content,
                        error: 'insert_before requires exactly 2 parameters'
                    };
                }
                const [marker, toInsert] = command.params;

                // Try exact match first
                let index = content.indexOf(marker);
                if (index === -1) {
                    // Try fuzzy matching
                    index = fuzzyIndexOf(content, marker);
                }

                if (index === -1) {
                    return {
                        success: false,
                        result: content,
                        error: `Marker not found (tried exact and fuzzy matching): "${marker.substring(0, 100)}${marker.length > 100 ? '...' : ''}"`
                    };
                }

                const result = content.slice(0, index) + toInsert + content.slice(index);
                return { success: true, result };
            }

            case 'insert_after': {
                if (command.params.length !== 2) {
                    return {
                        success: false,
                        result: content,
                        error: 'insert_after requires exactly 2 parameters'
                    };
                }
                const [marker, toInsert] = command.params;

                // Try exact match first
                let index = content.indexOf(marker);
                let markerLength = marker.length;

                if (index === -1) {
                    // Try fuzzy matching
                    index = fuzzyIndexOf(content, marker);
                    if (index !== -1) {
                        // Calculate actual marker length in content
                        markerLength = calculateFuzzyEndIndex(content, marker, index) - index;
                    }
                }

                if (index === -1) {
                    return {
                        success: false,
                        result: content,
                        error: `Marker not found (tried exact and fuzzy matching): "${marker.substring(0, 100)}${marker.length > 100 ? '...' : ''}"`
                    };
                }

                const result = content.slice(0, index + markerLength) + toInsert + content.slice(index + markerLength);
                return { success: true, result };
            }

            default:
                return {
                    success: false,
                    result: content,
                    error: `Unknown command type: ${command.type}`
                };
        }
    } catch (error) {
        return {
            success: false,
            result: content,
            error: `Error executing command: ${error}`
        };
    }
}

// Execute a tool call
export async function executeToolCall(
    content: string,
    toolCall: ToolCall,
    modelName?: string,
    _agenticPromptsManager?: any,
    sessionId?: string  // Add session ID to track verifier history
): Promise<string> {
    switch (toolCall.type) {
        case 'read_current_content': {
            if (toolCall.params && toolCall.params.length === 2) {
                const [startLine, endLine] = toolCall.params;
                const lines = content.split('\n');
                const selectedLines = lines.slice(startLine - 1, endLine);
                return selectedLines.join('\n');
            }
            return content;
        }

        case 'verify_current_content': {
            try {
                // Get or initialize verifier history for this session
                const historyKey = sessionId || 'default';
                if (!verifierHistoryMap.has(historyKey)) {
                    verifierHistoryMap.set(historyKey, []);
                }
                const verifierHistory = verifierHistoryMap.get(historyKey)!;

                // Build the prompt with history context
                let fullPrompt = VERIFIER_SYSTEM_PROMPT;

                // Add conversation history if it exists
                if (verifierHistory.length > 0) {
                    fullPrompt += '\n\n<conversation_history>';
                    fullPrompt += '\nYou have previously analyzed content in this session. Here is your conversation history:';

                    verifierHistory.forEach((entry, index) => {
                        fullPrompt += `\n\n[Verification Turn ${index + 1} - ${new Date(entry.timestamp).toISOString()}]`;
                        fullPrompt += '\n<previous_content_received>';
                        fullPrompt += `\n${entry.contentReceived}`;
                        fullPrompt += '\n</previous_content_received>';
                        fullPrompt += '\n<your_previous_report>';
                        fullPrompt += `\n${entry.report}`;
                        fullPrompt += '\n</your_previous_report>';
                    });

                    fullPrompt += '\n</conversation_history>';
                    fullPrompt += '\n\nNow analyze the following current content. Consider what improvements have been made since your last report and identify any remaining or new issues:';
                }

                // Add the current content to analyze
                fullPrompt += `\n\n<current_content>\n${content}\n</current_content>`;

                // Call the verifier with the full context
                const verifierController = getAPIRequestController();
                const verifierResponse = await verifierController.request({
                    promptOrParts: fullPrompt,
                    temperature: 0.2,
                    model: modelName || '',
                    systemInstruction: VERIFIER_SYSTEM_PROMPT,
                    label: 'Verifier',
                });
                const verifierText = extractTextFromAny(verifierResponse);

                if (!verifierText || !verifierText.trim()) {
                    console.warn('[Verifier] Empty response text from provider', {
                        provider: modelName,
                        keys: verifierResponse ? Object.keys(verifierResponse as any) : []
                    });
                }

                const finalReport = verifierText || 'No issues detected by the verifier.';

                // Store this interaction in history
                verifierHistory.push({
                    timestamp: Date.now(),
                    contentReceived: content,
                    report: finalReport
                });

                // Store all interactions - no limit for natural conversation flow

                return finalReport;
            } catch (error) {
                console.error('Verifier agent error:', error);
                return `[VERIFIER_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}]`;
            }
        }

        case 'Exit':
            return '[AGENT_EXIT]';

        case 'searchacademia': {
            try {
                const papers = await searchArxiv({
                    searchType: 'simple',
                    query: toolCall.query,
                    maxResults: 10
                });

                if (papers.length === 0) {
                    return 'No papers found matching your search query.';
                }

                const results: string[] = [];
                results.push(`Found ${papers.length} papers:\n`);

                papers.forEach((paper, index) => {
                    results.push(`\n[Paper ${index + 1}]`);
                    results.push(formatPaperForDisplay(paper));
                    results.push('\n' + '='.repeat(80));
                });

                return results.join('\n');
            } catch (error) {
                console.error('SearchAcademia error:', error);
                return `[SEARCH_ERROR: ${error instanceof Error ? error.message : 'Failed to search arXiv'}]`;
            }
        }

        case 'searchacademia_and': {
            try {
                const papers = await searchArxiv({
                    searchType: 'and_terms',
                    terms: toolCall.terms,
                    maxResults: 10
                });

                if (papers.length === 0) {
                    return `No papers found containing all terms: ${toolCall.terms.join(', ')}`;
                }

                const results: string[] = [];
                results.push(`Found ${papers.length} papers containing all terms (${toolCall.terms.join(' AND ')}):\n`);

                papers.forEach((paper, index) => {
                    results.push(`\n[Paper ${index + 1}]`);
                    results.push(formatPaperForDisplay(paper));
                    results.push('\n' + '='.repeat(80));
                });

                return results.join('\n');
            } catch (error) {
                console.error('SearchAcademia AND error:', error);
                return `[SEARCH_ERROR: ${error instanceof Error ? error.message : 'Failed to search arXiv'}]`;
            }
        }

        default:
            return `[TOOL_ERROR: Unknown tool ${(toolCall as any).type}]`;
    }
}

// Create initial state
export function createInitialState(initialContent: string): AgenticState {
    const id = `session-${Date.now()}`; // Changed id generation
    // Clear any existing verifier history for a new session
    verifierHistoryMap.delete(id);
    return {
        id,
        originalContent: initialContent,
        currentContent: initialContent,
        contentHistory: [], // Added contentHistory
        messages: [{
            id: 'msg-system-initial',
            role: 'user',
            content: 'Please refine the following content:\n\n' + initialContent.substring(0, 500) + (initialContent.length > 500 ? '...' : ''),
            timestamp: Date.now()
        }],
        isProcessing: false,
        isComplete: false,
        streamBuffer: ''
    };
}

// Helper function to clear verifier history for a session
export function clearVerifierHistory(sessionId: string): void {
    verifierHistoryMap.delete(sessionId);
}

// Helper function to get verifier history for debugging
export function getVerifierHistory(sessionId: string): VerifierHistoryEntry[] | undefined {
    return verifierHistoryMap.get(sessionId);
}

const MAX_RETRIES = 3;

function newMsgId(prefix: string = 'msg'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AgenticEngineCallbacks {
    onStateChange: (state: AgenticState) => void;
    onContentUpdated?: (content: string, isComplete?: boolean) => void;
    onForceRender?: () => Promise<void>;
}

export class AgenticEngine {
    private state: AgenticState & { conversationManager?: AgenticConversationManager };
    private abortController: AbortController | null = null;
    private conversationManager: AgenticConversationManager | null = null;
    private callbacks: AgenticEngineCallbacks;
    private promptsManager: AgenticPromptsManager | null = null;

    constructor(initialContent: string, callbacks: AgenticEngineCallbacks, promptsManager?: AgenticPromptsManager) {
        this.callbacks = callbacks;
        this.promptsManager = promptsManager || null;
        this.state = createInitialState(initialContent);

        let systemPrompt = this.promptsManager?.getAgenticPrompts().systemPrompt;
        let verifierPrompt = this.promptsManager?.getAgenticPrompts().verifierPrompt;

        this.conversationManager = new AgenticConversationManager(
            initialContent,
            systemPrompt || '',
            verifierPrompt || ''
        );
        this.state.conversationManager = this.conversationManager;
    }

    public getState(): AgenticState {
        return this.state;
    }

    private updateState(newStateSubset: Partial<AgenticState>) {
        this.state = { ...this.state, ...newStateSubset };
        this.callbacks.onStateChange(this.state);
    }

    public stop() {
        console.log('[AgenticEngine] stop called');
        globalState.isAgenticRunning = false;
        globalState.isGenerating = false;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        updateControlsState();
        this.updateState({ isProcessing: false, isComplete: true });
    }

    public async start() {
        if (!this.state.currentContent || globalState.isAgenticRunning) return;

        globalState.isAgenticRunning = true;
        globalState.isGenerating = true;
        updateControlsState();
        this.abortController = new AbortController();

        this.callbacks.onStateChange(this.state);

        if (this.callbacks.onContentUpdated) {
            try { this.callbacks.onContentUpdated(this.state.currentContent); } catch { /* no-op */ }
        }

        await this.runLoop();
    }

    private async runLoop() {
        let iterations = 0;
        let consecutiveNoToolCalls = 0;
        const MAX_CONSECUTIVE_NO_TOOL_CALLS = 3;

        const flushUI = async () => {
            if (this.callbacks.onForceRender) {
                await this.callbacks.onForceRender();
            }
        };

        while (globalState.isAgenticRunning && !this.state.isComplete) {
            iterations++;
            try {
                this.updateState({ isProcessing: true });
                const placeholderIndex = this.state.messages.length;
                this.updateState({
                    messages: [
                        ...this.state.messages,
                        {
                            id: newMsgId('agent'),
                            role: 'agent',
                            content: '',
                            timestamp: Date.now(),
                            status: 'processing'
                        }
                    ]
                });
                await flushUI();

                let modelName = getSelectedModel();
                let temperature = getSelectedTemperature();
                const topP = getSelectedTopP();

                if (this.promptsManager) {
                    const prompts = this.promptsManager.getAgenticPrompts();
                    if (prompts.model) modelName = prompts.model;
                }

                if (!this.conversationManager) {
                    throw new Error('Conversation manager not initialized');
                }

                const systemPrompt = this.conversationManager.getSystemPrompt();
                // Because AgenticCore is imported by Langchain, we'll cast structure resolving any circular issues visually
                const strMsgs = await (this.conversationManager as any).buildStructuredPrompt();

                let response: any = null;
                let responseText = '';
                let lastError: Error | null = null;

                try {
                    const controller = getAPIRequestController();
                    response = await controller.request({
                        promptOrParts: strMsgs,
                        temperature,
                        model: modelName,
                        systemInstruction: systemPrompt,
                        isJsonOutput: false,
                        topP,
                        maxRetries: MAX_RETRIES,
                        signal: this.abortController?.signal,
                        label: 'Agentic chat',
                    });
                    responseText = (await import('./AgenticCoreLangchain')).extractTextFromAny(response);
                } catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                }

                if (!responseText) {
                    const errMsg = lastError ? `AI call failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}` : 'Provider returned an empty response after all retries.';

                    const msgs = [...this.state.messages];
                    const idx = Math.min(placeholderIndex, msgs.length - 1);
                    const ph = msgs[idx];
                    if (ph && ph.role === 'agent' && ph.status === 'processing' && (!ph.segments || ph.segments.length === 0)) {
                        msgs.splice(idx, 1);
                    }
                    msgs.push({
                        id: newMsgId('system'),
                        role: 'system',
                        content: errMsg,
                        timestamp: Date.now(),
                        status: 'error',
                        blocks: [{ kind: 'error', message: errMsg } as SystemBlock]
                    });

                    this.updateState({ isProcessing: false, messages: msgs });
                    await flushUI();
                    continue;
                }

                let actions: Array<DiffCommand | ToolCall> = [];
                let segments: ResponseSegment[] = [];
                try {
                    // Call local parse function
                    const parsed = parseAgentResponseWithSegments(responseText);
                    actions = parsed.actions;
                    segments = parsed.segments;
                } catch {
                    actions = [];
                    segments = [{ kind: 'text', text: responseText }];
                }

                {
                    let toolSeen = false;
                    const isDiffType = (t: any) => t === 'search_and_replace' || t === 'delete' || t === 'insert_before' || t === 'insert_after';
                    const sanitizedActions: Array<DiffCommand | ToolCall> = [];
                    for (const a of actions) {
                        const t = (a as any).type;
                        if (isDiffType(t)) sanitizedActions.push(a);
                        else if (!toolSeen) { sanitizedActions.push(a); toolSeen = true; }
                    }
                    let segToolSeen = false;
                    const sanitizedSegments: ResponseSegment[] = [];
                    for (const s of segments) {
                        if (s.kind !== 'tool') sanitizedSegments.push(s);
                        else if (!segToolSeen) { sanitizedSegments.push(s); segToolSeen = true; }
                    }
                    actions = sanitizedActions;
                    segments = sanitizedSegments;
                }

                const commands = actions.filter(a => 'params' in a && (a.type === 'search_and_replace' || a.type === 'delete' || a.type === 'insert_before' || a.type === 'insert_after')) as DiffCommand[];
                const toolCalls = actions.filter(a => ['read_current_content', 'verify_current_content', 'Exit', 'multi_edit'].includes(a.type as string)) as ToolCall[];

                if (this.conversationManager) {
                    await (this.conversationManager as any).addAgentMessage(responseText);
                }

                const narrativeText = segments.filter(seg => seg.kind === 'text').map(seg => (seg as any).text).join('\n').trim();
                const msgs = [...this.state.messages];
                const idx = Math.min(placeholderIndex, msgs.length - 1);
                const last = msgs[idx];

                if (last && last.role === 'agent' && last.status === 'processing' && !last.segments) {
                    msgs[idx] = {
                        id: last.id,
                        role: 'agent',
                        content: narrativeText || responseText,
                        timestamp: last.timestamp,
                        status: 'processing',
                        commands: commands.length ? commands : undefined,
                        toolCalls: toolCalls.length ? toolCalls : undefined,
                        segments: segments.length > 0 ? segments : undefined
                    };
                } else {
                    msgs.push({
                        id: newMsgId('agent'),
                        role: 'agent',
                        content: narrativeText || responseText,
                        timestamp: Date.now(),
                        status: 'processing',
                        commands: commands.length ? commands : undefined,
                        toolCalls: toolCalls.length ? toolCalls : undefined,
                        segments: segments.length > 0 ? segments : undefined
                    });
                }
                this.updateState({ messages: msgs });
                await flushUI();

                if (actions.length === 0) {
                    consecutiveNoToolCalls++;
                    if (consecutiveNoToolCalls >= MAX_CONSECUTIVE_NO_TOOL_CALLS) {
                        const loopErrorContent = `Agent is stuck in a loop (${consecutiveNoToolCalls} consecutive turns without tool calls). Stopping to prevent infinite loop. The agent may be confused or context window may be full.`;
                        const loopErrorMsg: AgenticMessage = {
                            id: newMsgId('system'),
                            role: 'system',
                            content: loopErrorContent,
                            timestamp: Date.now(),
                            status: 'error',
                            blocks: [{ kind: 'error', message: loopErrorContent }]
                        };
                        this.updateState({ messages: [...this.state.messages, loopErrorMsg], isComplete: true, isProcessing: false });
                        await flushUI();
                        break;
                    }
                    const noToolContent = `No tool was executed (attempt ${consecutiveNoToolCalls}/${MAX_CONSECUTIVE_NO_TOOL_CALLS}). You MUST output a tool call on the final line. Use: [TOOL_CALL:toolname(...)]`;
                    const noToolMsg: AgenticMessage = { id: newMsgId('system'), role: 'system', content: noToolContent, timestamp: Date.now(), status: 'error', blocks: [{ kind: 'error', message: 'No tool was executed. Please use proper tool call syntax.' }] };
                    this.updateState({ messages: [...this.state.messages, noToolMsg] });
                    if (this.conversationManager) {
                        await (this.conversationManager as any).addSystemMessage(noToolContent);
                    }
                } else {
                    consecutiveNoToolCalls = 0;
                    const action = actions[0];
                    const toolCall = action as ToolCall;

                    if ((toolCall as any).type === 'multi_edit') {
                        const ops = ((toolCall as any).operations as DiffCommand[]) || [];
                        if (!ops.length) {
                            const resultText = 'Multi-edit finished: 0 OK, 0 FAIL\nNo operations were provided in multi_edit()';
                            const systemMsg: AgenticMessage = { id: newMsgId('system'), role: 'system', content: `[TOOL_RESULT:multi_edit]\n${resultText}`, timestamp: Date.now(), status: 'error', blocks: [{ kind: 'tool_result', tool: 'multi_edit', result: resultText }] };
                            this.updateState({ messages: [...this.state.messages, systemMsg] });
                            if (this.conversationManager) await (this.conversationManager as any).addSystemMessage(resultText);
                        } else {
                            const logs: string[] = [];
                            const logsForHistory: string[] = [];
                            let okCount = 0;
                            let failCount = 0;
                            let currentContent = this.state.currentContent;

                            for (let i = 0; i < ops.length; i++) {
                                const op = ops[i];
                                // applyDiffCommand from original module
                                const res = applyDiffCommand(currentContent, op);
                                currentContent = res.result;

                                this.updateState({ currentContent });
                                if (this.conversationManager) this.conversationManager.updateCurrentContent(res.result);
                                if (this.callbacks.onContentUpdated) {
                                    try { this.callbacks.onContentUpdated(currentContent); } catch { }
                                }

                                if (res.success) {
                                    logs.push(`OK ${op.type}(${op.params.map(p => '"' + p + '"').join(', ')})`);
                                    logsForHistory.push(`OK ${op.type}`);
                                    okCount++;
                                } else {
                                    logs.push(`FAIL ${op.type}: ${res.error}`);
                                    logsForHistory.push(`FAIL ${op.type}: ${res.error}`);
                                    failCount++;
                                }
                            }

                            if (okCount > 0) {
                                this.updateState({
                                    contentHistory: [
                                        ...this.state.contentHistory,
                                        { content: currentContent, title: `After ${okCount} successful edit${okCount > 1 ? 's' : ''}`, timestamp: Date.now() }
                                    ]
                                });
                            }
                            const summary = `Multi-edit finished: ${okCount} OK, ${failCount} FAIL`;
                            const resultBody = [summary, ...logs].join('\n');
                            const resultBodyForHistory = [summary, ...logsForHistory].join('\n');
                            const systemMsg: AgenticMessage = { id: newMsgId('system'), role: 'system', content: `[TOOL_RESULT:multi_edit]\n${resultBody}`, timestamp: Date.now(), status: failCount > 0 ? 'error' : 'success', blocks: [{ kind: 'tool_result', tool: 'multi_edit', result: resultBody }] };
                            this.updateState({ messages: [...this.state.messages, systemMsg] });
                            if (this.conversationManager) await (this.conversationManager as any).addSystemMessage(resultBodyForHistory);
                        }
                    } else if ((toolCall as any).type === 'Exit') {
                        this.updateState({ isComplete: true });
                        const exitMessage = 'Agent has completed the refinement process.';
                        const systemMsg: AgenticMessage = { id: newMsgId('system'), role: 'system', content: exitMessage, timestamp: Date.now(), status: 'success', blocks: [{ kind: 'tool_result', tool: 'Exit', result: exitMessage }] };
                        this.updateState({ messages: [...this.state.messages, systemMsg] });
                        if (this.conversationManager) await (this.conversationManager as any).addSystemMessage(exitMessage);
                        if (this.callbacks.onContentUpdated) {
                            try { this.callbacks.onContentUpdated(this.state.currentContent, true); } catch { }
                        }
                    } else {
                        if (!this.conversationManager) throw new Error('Conversation manager not initialized');

                        // use executeToolCall from original module
                        const result = await executeToolCall(this.state.currentContent, toolCall as any, modelName, this.conversationManager as any);
                        const toolType = (toolCall as any).type;
                        const isError = result.startsWith('[TOOL_ERROR:') || result.startsWith('[VERIFIER_ERROR:');
                        const systemContent = isError ? `Your tool call failed. Reason: ${result}` : result;
                        const systemMsg: AgenticMessage = { id: newMsgId('system'), role: 'system', content: isError ? systemContent : `[TOOL_RESULT:${toolType}]\n${result}`, timestamp: Date.now(), status: isError ? 'error' : 'success', blocks: [isError ? { kind: 'error', message: result } : { kind: 'tool_result', tool: toolType, result, toolCall: toolCall as any }] };
                        this.updateState({ messages: [...this.state.messages, systemMsg] });
                        if (this.conversationManager) await (this.conversationManager as any).addSystemMessage(systemContent);
                    }

                    if (actions.length > 1) {
                        const firstToolName = (actions[0] as any).type;
                        const warningContent = `First tool executed: ${firstToolName}. All other tools were ignored. Only one tool use is allowed per single response.`;
                        const warningMsg: AgenticMessage = { id: newMsgId('system'), role: 'system', content: warningContent, timestamp: Date.now(), status: 'success', blocks: [{ kind: 'error', message: `Only the first tool (${firstToolName}) was executed. ${actions.length - 1} other tool(s) were ignored.` }] };
                        this.updateState({ messages: [...this.state.messages, warningMsg] });
                        if (this.conversationManager) await (this.conversationManager as any).addSystemMessage(warningContent);
                    }
                }

                this.updateState({ isProcessing: false });
                await flushUI();

            } catch (error) {
                console.error('Agent loop error:', error);
                const msgs = [...this.state.messages];
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg && lastMsg.role === 'agent' && lastMsg.status === 'processing' && !lastMsg.segments) {
                    msgs.pop();
                }
                this.updateState({ messages: msgs, isProcessing: false, error: error instanceof Error ? error.message : 'Unknown error occurred' });
                await flushUI();
            }

            if (this.abortController?.signal.aborted) break;
        }

        globalState.isAgenticRunning = false;
        globalState.isGenerating = false;
        updateControlsState();
    }
}
