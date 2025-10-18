/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  try {
    // First pass: strip fences/formatting using existing cleaner
    const cleaned = cleanJsonOutput(raw);
    return JSON.parse(cleaned);
  } catch (e1) {
    try {
      // Second pass: try to recover common issues
      let text = raw.trim();
      // Remove code fences
      text = text.replace(/^```[\s\S]*?\n/, '').replace(/```\s*$/m, '');
      // Extract first JSON object/array block
      const match = text.match(/([\[{][\s\S]*[\]}])/);
      if (match) text = match[1];
      // Fix trailing commas before ] or }
      text = text.replace(/,\s*(\]|\})/g, '$1');
      // Replace smart quotes
      text = text.replace(/[""]/g, '"').replace(/['']/g, "'");
      return JSON.parse(text);
    } catch (e2) {
      try {
        // Third pass: targeted fixes for common malformed arrays/keys
        let text = raw.trim();
        // Remove fences
        text = text.replace(/^```[\s\S]*?\n/, '').replace(/```\s*$/m, '');
        // If we see an object with possibly unquoted keys (e.g., sub_strategies), quote them
        text = text.replace(/\b(sub_strategies|strategies|hypotheses)\b\s*:/g, '"$1":');
        // Capture inner-most JSON-like block
        const blockMatch = text.match(/([\[{][\s\S]*[\]}])/);
        if (blockMatch) text = blockMatch[1];
        // If array of quoted strings lacks commas, insert commas between adjacent quoted strings
        // Example: ["a" "b" "c"] => ["a", "b", "c"]
        text = text.replace(/"\s+"/g, '", "');
        // Also between "] [" patterns just in case
        text = text.replace(/"\s*\]\s*\[\s*"/g, '"], ["');
        // Fix trailing commas again
        text = text.replace(/,\s*(\]|\})/g, '$1');
        return JSON.parse(text);
      } catch (e3) {
        console.error(`JSON parse failed in ${context}:`, e2);
        throw e3;
      }
    }
  }
}

/**
 * Clean JSON output by removing markdown fences and fixing common formatting issues
 * @param jsonString - Raw JSON string to clean
 * @returns Cleaned JSON string
 */
export function cleanJsonOutput(jsonString: string): string {
    if (!jsonString || typeof jsonString !== 'string') return jsonString;
    
    let cleaned = jsonString.trim();
    
    // Remove markdown code block fences if present
    if (cleaned.startsWith('```json') || cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        // Remove first line (```json or ```)
        lines.shift();
        // Remove last line if it's just ```
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
            lines.pop();
        }
        cleaned = lines.join('\n').trim();
    }
    
    // Handle both JSON objects and arrays
    let jsonStart = -1;
    let jsonEnd = -1;
    
    // Look for array start
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd = cleaned.lastIndexOf(']');
    
    // Look for object start
    const objectStart = cleaned.indexOf('{');
    const objectEnd = cleaned.lastIndexOf('}');
    
    // Determine which comes first and use appropriate bounds
    if (arrayStart !== -1 && (objectStart === -1 || arrayStart < objectStart)) {
        jsonStart = arrayStart;
        jsonEnd = arrayEnd;
    } else if (objectStart !== -1) {
        jsonStart = objectStart;
        jsonEnd = objectEnd;
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    
    // Normalize smart quotes early
    cleaned = cleaned.replace(/[""]/g, '"').replace(/['']/g, "'");

    // Convert Python-style triple-quoted strings for known fields into valid JSON strings
    // This handles cases like: "search_block": """multi-line code...""" or with stray surrounding quotes
    // We target common patch value fields explicitly to avoid over-replacing unrelated content
    const tripleQuotedFieldRe = /(["']?(?:search_block|replace_with|new_content|content|insert|insert_content|value|replacement|replace|with|to|new_value|search|target|match|pattern|searchBlock|newContent|replaceWith)["']?\s*:\s*)(?:"\s*)?(?:"""|''')([\s\S]*?)(?:"""|''')\s*(?:"\s*)?/g;
    cleaned = cleaned.replace(tripleQuotedFieldRe, (_m, prefix: string, inner: string) => {
        try {
            // JSON.stringify will escape newlines, quotes and backslashes appropriately and include surrounding quotes
            return prefix + JSON.stringify(inner);
        } catch {
            // Fallback: basic escaping
            const escaped = inner.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t").replace(/\"/g, '\\"').replace(/"/g, '\\"');
            return prefix + '"' + escaped + '"';
        }
    });

    // Also normalize any standalone triple-quoted strings that may appear (very rare but possible)
    cleaned = cleaned.replace(/"""([\s\S]*?)"""/g, (_m, inner: string) => JSON.stringify(inner));
    cleaned = cleaned.replace(/'''([\s\S]*?)'''/g, (_m, inner: string) => JSON.stringify(inner));

    // Try to fix common JSON issues
    try {
        // First, try to parse as-is to see if it's already valid
        JSON.parse(cleaned);
        return cleaned;
    } catch (e) {
        console.warn("JSON parsing failed, attempting to fix common issues:", e);
        
        // More robust string content fixing
        let fixed = cleaned;
        
        // Fix unescaped quotes and newlines within string values
        // This is a more careful approach that preserves JSON structure
        try {
            // More robust approach: fix escaped characters and string content
            fixed = fixed
                // Fix bad escape sequences like \n\n -> \\n
                .replace(/\\([^"\\nrtbfuv/])/g, '\\\\$1')
                // Fix unescaped quotes within strings
                .replace(/"([^"]*?)"([^,}\]\s])/g, '"$1\\"$2')
                // Fix unescaped newlines in string values
                .replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"')
                // Fix unescaped carriage returns
                .replace(/"([^"]*?)\r([^"]*?)"/g, '"$1\\r$2"')
                // Fix unescaped tabs
                .replace(/"([^"]*?)\t([^"]*?)"/g, '"$1\\t$2"')
                // Remove trailing commas
                .replace(/,\s*([}\]])/g, '$1')
                // Fix unquoted keys
                .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
            
            // Try parsing the fixed version
            JSON.parse(fixed);
            return fixed;
        } catch (e2) {
            console.warn("Advanced JSON fixing failed, trying aggressive cleanup:", e2);
            
            // Fallback: very aggressive character-by-character fixes
            try {
                let basicFixed = cleaned
                    // Remove any trailing commas
                    .replace(/,\s*([}\]])/g, '$1')
                    // Fix common quote issues
                    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
                    // Escape all backslashes first
                    .replace(/\\/g, '\\\\')
                    // Then fix specific escape sequences
                    .replace(/\\\\n/g, '\\n')
                    .replace(/\\\\r/g, '\\r')
                    .replace(/\\\\t/g, '\\t')
                    // Basic newline escaping - more aggressive
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
                
                JSON.parse(basicFixed);
                return basicFixed;
            } catch (e3) {
                console.warn("All JSON fixing attempts failed, returning cleaned original:", e3);
                return cleaned;
            }
        }
    }
}