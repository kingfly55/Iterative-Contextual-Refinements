/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanOutputByType } from './OutputCleaner';

/**
 * This file contains minimal JSON parsing for Deepthink strategies only.
 * Feature suggestions have been migrated to markdown output and no longer use JSON.
 */

/**
 * Generate fallback strategies for Deepthink mode
 */
export function generateFallbackStrategies(text: string, count: number): string[] {
    const listItemsRegex = /(?:^\s*[-*+]|\d+\.)\s+(.*)/gm;
    let matches;
    const strategies: string[] = [];

    while ((matches = listItemsRegex.exec(text)) !== null && strategies.length < count) {
        strategies.push(matches[1].trim());
    }

    if (strategies.length > 0) return strategies.slice(0, count);

    // Default fallbacks for Deepthink strategies
    const fallbacks = [
        "Try to simplify the problem statement or break it into smaller parts.",
        "Identify relevant formulas or theorems.",
        "Work through the problem step by step.",
        "Check for any given constraints or conditions.",
        "Consider alternative approaches or methods."
    ];
    return fallbacks.slice(0, count);
}

// Deprecated - features now use markdown
export function generateFallbackFeaturesFromString(_text: string): string[] {
    console.warn("generateFallbackFeaturesFromString is deprecated - features now use markdown output");
    return [];
}

// Deprecated
export function generateFallbackCritiqueFromString(_text: string, _count: number = 3): string[] {
    console.warn("generateFallbackCritiqueFromString is deprecated");
    return [];
}

/**
 * JSON parsing for Deepthink strategies/sub-strategies ONLY
 * DO NOT use this for feature suggestions - they now use markdown output
 */
export function parseJsonSuggestions(rawJsonString: string, suggestionKey: 'features' | 'suggestions' | 'strategies' | 'sub_strategies' = 'features', expectedCount: number = 3): string[] {
    // Block feature suggestions from using JSON parsing
    if (suggestionKey === 'features' || suggestionKey === 'suggestions') {
        console.error("Feature suggestions must use markdown output, not JSON parsing");
        return [];
    }

    if (!rawJsonString || !rawJsonString.trim()) {
        return generateFallbackStrategies('', expectedCount);
    }

    const cleanedJsonString = cleanOutputByType(rawJsonString, 'json');

    try {
        const parsed = JSON.parse(cleanedJsonString);
        let items: string[] = [];

        // Standard case: {"strategies": ["item1", "item2"]}
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed[suggestionKey])) {
            items = parsed[suggestionKey].filter((s: any) => typeof s === 'string');
        }
        // Array of strings: ["item1", "item2"]
        else if (Array.isArray(parsed)) {
            items = parsed.filter((s: any) => typeof s === 'string');
        }

        if (items.length > 0) {
            return items.slice(0, expectedCount);
        }

        return generateFallbackStrategies(rawJsonString, expectedCount);
    } catch (e) {
        console.error(`Failed to parse JSON for ${suggestionKey}:`, e);
        return generateFallbackStrategies(rawJsonString, expectedCount);
    }
}