/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanJsonOutput } from './JsonParser';

/**
 * Output cleaning utilities for AI-generated content
 */

/**
 * Clean HTML output by extracting valid HTML structure
 * @param rawHtml - Raw HTML string to clean
 * @returns Cleaned HTML string
 */
export function cleanHtmlOutput(rawHtml: string): string {
    if (typeof rawHtml !== 'string') return '';
    let textToClean = rawHtml.trim();

    // Handle single-line HTML by converting \n to actual newlines
    textToClean = textToClean.replace(/\\n/g, '\n');
    textToClean = textToClean.replace(/\\t/g, '\t');
    textToClean = textToClean.replace(/\\"/g, '"');
    
    // Try to find the start of the HTML document
    const lowerText = textToClean.toLowerCase();
    let startIndex = lowerText.indexOf('<!doctype');
    if (startIndex === -1) {
        startIndex = lowerText.indexOf('<html');
    }

    if (startIndex !== -1) {
        // Try to find the end of the HTML document
        const endIndex = textToClean.lastIndexOf('</html>');
        if (endIndex !== -1 && endIndex + '</html>'.length > startIndex) {
            return textToClean.substring(startIndex, endIndex + '</html>'.length).trim();
        } else {
            const potentialDoc = textToClean.substring(startIndex).trim();
            const isNearBeginning = startIndex < 20 || textToClean.substring(0, startIndex).trim().length < 10;
            if (isNearBeginning && potentialDoc.length > 100 && (potentialDoc.toLowerCase().includes("<body") || potentialDoc.toLowerCase().includes("<head") || potentialDoc.toLowerCase().includes("<div"))) {
                console.warn(`cleanHtmlOutput: HTML document started but '</html>' tag was missing. Returning potentially truncated document starting with '${potentialDoc.substring(0, 30)}...'.`);
                return potentialDoc;
            }
            console.warn(`cleanHtmlOutput: HTML document started but '</html>' tag was missing. Conditions for truncated HTML not met. Falling through to return original de-fenced and trimmed text.`);
        }
    }

    return textToClean;
}

/**
 * Clean text output by trimming whitespace
 * @param rawText - Raw text string to clean
 * @returns Cleaned text string
 */
export function cleanTextOutput(rawText: string): string {
    if (typeof rawText !== 'string') return '';
    return rawText.trim(); // Already handled by cleanOutputByType
}

/**
 * Clean output by type with appropriate cleaning strategy
 * @param rawOutput - Raw output string to clean
 * @param type - Type of content ('html', 'json', 'text', etc.)
 * @returns Cleaned output string
 */
export function cleanOutputByType(rawOutput: string, type: string = 'text'): string {
    if (typeof rawOutput !== 'string') return '';
    let textToClean = rawOutput.trim();

    const fenceRegex = /^```(\w*)?\s*\n?([\s\S]*?)\n?\s*```$/s;
    const fenceMatch = textToClean.match(fenceRegex);

    if (fenceMatch && fenceMatch[2]) { // fenceMatch[2] is the content inside the fence
        textToClean = fenceMatch[2].trim();
    }
    // After potential fence removal, trim again.
    // This is crucial for JSON.parse and general cleanliness.
    textToClean = textToClean.trim();

    if (type === 'html') {
        // cleanHtmlOutput has specific logic to extract valid HTML structure,
        // potentially discarding preamble/postamble even if no fences were present initially,
        // or if fences were already stripped.
        return cleanHtmlOutput(textToClean); // textToClean here is already fence-stripped and trimmed
    }

    if (type === 'json') {
        // Special handling for JSON to fix newline and special character issues
        return cleanJsonOutput(textToClean);
    }

    // For 'text', 'markdown', 'python', etc., after the above fence removal and trimming,
    // return the result. The caller is responsible for further processing like JSON.parse().
    return textToClean;
}

/**
 * Detect if content is HTML by checking for html tags
 * @param content - Content string to check
 * @returns True if content appears to be HTML
 */
export function isHtmlContent(content: string): boolean {
    if (!content || typeof content !== 'string') return false;
    const trimmed = content.trim();
    // Check for common HTML patterns - be more permissive than requiring full HTML document
    return trimmed.includes('<html>') || 
           trimmed.includes('<!DOCTYPE') || 
           (trimmed.includes('<head>') && trimmed.includes('<body>')) ||
           (trimmed.includes('<div') && trimmed.includes('<style')) ||
           (trimmed.includes('<script') && trimmed.includes('<style'));
}