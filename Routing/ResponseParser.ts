/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ResponseParser — Gemini native code execution response parsing utilities.
 * Extracts structured parts (text, code, output, images) from Gemini API
 * responses and formats them into markdown with HTML comment markers
 * that RenderMathMarkdownLogic can pick up and render.
 *
 * This lives in /Routing because it's a provider-level concern, not
 * mode-specific logic. Any mode (Contextual, Deepthink, Agentic, etc.)
 * can import and use these functions.
 */

export interface ResponsePart {
    type: 'text' | 'code' | 'output' | 'image';
    content: string;
    language?: string;
    mimeType?: string;
}

/**
 * Extract ordered parts from a Gemini API response.
 * Handles text, executableCode, codeExecutionResult, and inlineData parts.
 */
export function extractPartsInOrder(response: any): ResponsePart[] {
    const orderedParts: ResponsePart[] = [];

    if (!response?.candidates?.[0]?.content?.parts) {
        return orderedParts;
    }

    const parts = response.candidates[0].content.parts;

    for (const part of parts) {
        if (part.text) {
            orderedParts.push({
                type: 'text',
                content: part.text
            });
        }
        else if (part.executableCode) {
            orderedParts.push({
                type: 'code',
                content: part.executableCode.code || '',
                language: (part.executableCode.language || 'PYTHON').toLowerCase()
            });
        }
        else if (part.codeExecutionResult) {
            orderedParts.push({
                type: 'output',
                content: part.codeExecutionResult.output || ''
            });
        }
        else if (part.inlineData) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            const data = part.inlineData.data || '';
            orderedParts.push({
                type: 'image',
                content: data,
                mimeType: mimeType
            });
        }
    }

    return orderedParts;
}

/**
 * Format extracted response parts into a markdown string with
 * HTML comment markers for code execution blocks, output blocks,
 * and image blocks. These markers are parsed by RenderMathMarkdownLogic.
 */
export function formatPartsForDisplay(parts: ResponsePart[]): string {
    if (parts.length === 0) return '';

    const formattedParts: string[] = [];

    for (const part of parts) {
        switch (part.type) {
            case 'text':
                formattedParts.push(part.content);
                break;
            case 'code':
                formattedParts.push(
                    `\n<!-- CODE_EXECUTION_START -->\n` +
                    `<!-- LANGUAGE: ${part.language} -->\n` +
                    `\`\`\`${part.language} \n${part.content} \n\`\`\`\n` +
                    `<!-- CODE_EXECUTION_END -->`
                );
                break;
            case 'output':
                formattedParts.push(
                    `\n<!-- EXECUTION_OUTPUT_START -->\n` +
                    `\`\`\`\n${part.content} \n\`\`\`\n` +
                    `<!-- EXECUTION_OUTPUT_END -->\n`
                );
                break;
            case 'image':
                formattedParts.push(
                    `\n<!-- EXECUTION_IMAGE_START -->\n` +
                    `<!-- MIME_TYPE: ${part.mimeType} -->\n` +
                    `${part.content}\n` +
                    `<!-- EXECUTION_IMAGE_END -->\n`
                );
                break;
        }
    }

    return formattedParts.join('\n').trim();
}
