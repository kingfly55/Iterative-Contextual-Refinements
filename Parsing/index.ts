/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parsing module - Centralized data processing and parsing utilities
 * 
 * This module provides a comprehensive set of tools for parsing and processing
 * various data formats commonly used in AI-generated content, including:
 * - JSON parsing with robust error handling and fallback strategies
 * - HTML/text output cleaning and normalization
 * - Suggestion extraction from unstructured text
 */

// JSON parsing utilities
export { parseJsonSafe, cleanJsonOutput } from './JsonParser';

// Output cleaning utilities
export { 
    cleanHtmlOutput, 
    cleanTextOutput, 
    cleanOutputByType, 
    isHtmlContent 
} from './OutputCleaner';

// Suggestion parsing utilities
// parseJsonSuggestions is kept for Deepthink mode (strategies/sub-strategies)
// Feature suggestions now use markdown output
export { 
    parseJsonSuggestions,  // Only for Deepthink strategies - DO NOT use for features
    generateFallbackFeaturesFromString,
    generateFallbackCritiqueFromString,
    generateFallbackStrategies
} from './SuggestionParser';