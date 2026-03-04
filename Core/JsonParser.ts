/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSON5 from 'json5';
import { parse as parseLossless } from 'lossless-json';

/**
 * JSON parsing utilities for AI outputs and data processing
 */

/**
 * Safely parse JSON with multiple fallback strategies for AI-generated content
 * @param raw - Raw string to parse
 * @param context - Context description for error logging
 * @returns Parsed JSON object or throws error
 */
export function parseJsonSafe(raw: string, context: string): any {
    if (!raw || typeof raw !== 'string') {
        throw new Error(`Invalid input for ${context}: ${typeof raw}`);
    }

    // Try native JSON.parse first (fastest, handles strict JSON)
    try {
        return JSON.parse(raw);
    } catch {
        // Fallback to JSON5 for relaxed JSON (trailing commas, unquoted keys, single quotes)
        try {
            return JSON5.parse(raw);
        } catch (e) {
            console.warn(`JSON parse failed in ${context}. Error:`, e);
            throw e;
        }
    }
}

/**
 * Parse JSON ensuring numeric precision using lossless-json
 * Use this when you expect large numbers that standard JS numbers can't handle.
 * @param raw - Raw string to parse
 * @returns Parsed JSON object with potentially special number types
 */
export function parseJsonLossless(raw: string): any {
    return parseLossless(raw);
}