/**
 * End-to-end test for CLI Proxy API integration.
 * Exercises the exact same code path as LocalModelsProvider:
 *   - OpenAI SDK client pointed at localhost:8317/v1
 *   - Bearer auth with the configured API key
 *   - Plain text completion (used by solution/critique agents)
 *   - JSON completion with prompt instruction (used by strategy generation agents)
 *   - System instruction + user message (used by all Deepthink agents)
 */

import OpenAI from 'openai';

const BASE_URL = 'http://localhost:8317/v1';
const API_KEY = 'sk-A8RULSsDwSXg173dU5IhwaQpyCI76zujXHb3MwCiNzjXh';
const MODEL = 'claude-opus-4-6';

const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: BASE_URL,
});

let passed = 0;
let failed = 0;

async function test(name, fn) {
    process.stdout.write(`  ${name} ... `);
    try {
        await fn();
        console.log('\x1b[32mPASS\x1b[0m');
        passed++;
    } catch (e) {
        console.log(`\x1b[31mFAIL\x1b[0m: ${e.message}`);
        failed++;
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg);
}

console.log(`\nTesting CLI Proxy API integration (${BASE_URL}, model: ${MODEL})\n`);

// Test 1: Model availability
await test('Model "claude-opus-4-6" is listed', async () => {
    const models = await client.models.list();
    const ids = [];
    for await (const m of models) ids.push(m.id);
    assert(ids.includes(MODEL), `Model not found. Available: ${ids.join(', ')}`);
});

// Test 2: Basic completion (matches how solution/critique agents call)
await test('Basic chat completion (system + user message)', async () => {
    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is 2+2? Reply with just the number.' },
        ],
        temperature: 0.7,
    });
    const content = response.choices[0]?.message?.content || '';
    assert(content.includes('4'), `Expected "4" in response, got: "${content}"`);
});

// Test 3: JSON output via prompt instruction (matches LocalModelsProvider JSON path)
await test('JSON output via prompt instruction', async () => {
    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: 'You are a strategy generation agent.' },
            {
                role: 'user',
                content:
                    'Generate 2 strategies for solving a math problem.' +
                    '\n\nIMPORTANT: You must respond with valid JSON only, no other text.' +
                    '\nFormat: {"strategies": ["strategy 1 text", "strategy 2 text"]}',
            },
        ],
        temperature: 0.7,
    });
    const raw = response.choices[0]?.message?.content || '';
    // Strip markdown code fences (same as DeepthinkCore.cleanOutputByType)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    assert(jsonStart !== -1 && jsonEnd !== -1, `No JSON found in response: "${raw}"`);
    const parsed = JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
    assert(Array.isArray(parsed.strategies), `Expected strategies array, got: ${JSON.stringify(parsed)}`);
    assert(parsed.strategies.length >= 2, `Expected >= 2 strategies, got ${parsed.strategies.length}`);
});

// Test 4: Multi-turn conversation (matches iterative corrections history)
await test('Multi-turn conversation (critique loop pattern)', async () => {
    const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
            { role: 'system', content: 'You are a solution critique agent.' },
            { role: 'user', content: 'Here is a solution: The answer to 15*17 is 245.' },
            { role: 'assistant', content: 'The calculation is incorrect. 15*17 = 255.' },
            { role: 'user', content: 'Corrected solution: 15*17 = 255. Please verify.' },
        ],
        temperature: 0.7,
    });
    const content = response.choices[0]?.message?.content || '';
    assert(content.length > 10, `Response too short: "${content}"`);
    assert(content.includes('255'), `Expected "255" in response, got: "${content}"`);
});

// Summary
console.log(`\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m${failed > 0 ? `, \x1b[31m${failed} failed\x1b[0m` : ''}\n`);
process.exit(failed > 0 ? 1 : 0);
