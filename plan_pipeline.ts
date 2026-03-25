#!/usr/bin/env tsx
/**
 * plan_pipeline.ts — AI-driven plan → adversarial refinement → milestones → implementation
 *
 * Uses the Claude Agent SDK to give Claude full file-system + shell access at every stage.
 * Runs with dangerously-skip-permissions so no manual approval prompts interrupt the pipeline.
 *
 * Usage (from /home/joenathan/deepthink):
 *   tsx plan_pipeline.ts
 *
 * Prerequisites:
 *   npm install   (installs @anthropic-ai/claude-agent-sdk from package.json)
 *   tsx installed globally: npm install -g tsx
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── Paths ────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PLAN_SLUG = 'deepthink-quota-backoff-auto-resume';
const PLAN_DIR  = path.join(__dirname, 'docs', 'plans', PLAN_SLUG);
const PLAN_PATH = path.join(PLAN_DIR,  'plan.md');
const SRC_DIR   = path.join(__dirname, 'Iterative-Contextual-Refinements');

// ─── Agent SDK base options ───────────────────────────────────────────────────

const BASE_OPTIONS: Options = {
  cwd:                           __dirname,
  permissionMode:                'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  tools:                         ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  maxTurns:                      80,
};

// ─── PLAN INPUT ───────────────────────────────────────────────────────────────
//
// The feature description fed into the pipeline. Edit this to plan something else.

const PLAN_INPUT = `
## Feature: DeepThink 429 Quota Backoff & Automatic Pause/Resume

### Background
The DeepThink pipeline runs multi-hour LLM inference workflows through a local Claude CLI proxy
(cliproxyapi at localhost:8317). When the Claude API quota is exceeded, the proxy returns HTTP 429
"model_cooldown" errors. The current retry logic (exponential backoff, max 4 attempts) exhausts all
retries and fails permanently — losing all in-progress work.

A session save/resume system already exists (DeepthinkSession.ts) with:
  - saveSessionToFile() — downloads full pipeline state as JSON
  - restoreSession()    — restores state from a loaded file
  - resumeSolutionPoolIterations(depth) — resumes from the correct iteration
  - window.__deepthinkResume / __deepthinkLoadAndResume — console entry points

### What Must Be Built
1. **Configurable quota reset time** — Users input their first quota reset time (e.g. "14:59").
   Subsequent resets are always exactly 5 hours later. The system computes all future resets
   without user intervention.

2. **Auto-save on quota exceeded** — When 2+ consecutive 429s are received across any pipeline
   requests, automatically save full pipeline state to a timestamped local JSON file before halting.
   This MUST be wired into makeDeepthinkApiCall() in DeepthinkCore.ts where RateLimitError is
   already caught — NOT via fetch monkey-patching (the SDK captures fetch at module init time,
   making window.fetch monkey-patching ineffective after bundle load).

3. **Auto-pause until quota reset** — After saving, pause all active requests and show a
   visible countdown in the UI (e.g. "Quota exceeded — resuming at 14:59 (4h 32m remaining)").
   No retry attempts during the pause.

4. **Auto-resume after quota reset** — When the reset time arrives, automatically call
   resumeSolutionPoolIterations() without user interaction.

5. **Configurable via DeepthinkConfigPanel** — All quota parameters (reset time string, 5h cycle
   toggle, consecutive-429 threshold, auto-resume toggle) must be editable in the config panel.

### Why the Console Watchdog Failed (root cause to document in code)
A prior attempt monkey-patched window.fetch to intercept 429s. It failed because Vite bundles
@anthropic-ai/sdk with a closure over the original fetch captured at module init — reassigning
window.fetch afterward never affects the SDK's captured reference. Fix MUST be at the
RateLimitError catch site in makeDeepthinkApiCall().

### Testing Strategy Requirements
Tests must NOT require waiting for real quota limits (5h cycle = impractical). Provide:
- A mock/inject mechanism to simulate 429 RateLimitError responses on demand
- A time-mock to fast-forward the quota-reset countdown without real waiting
- Unit tests for: 429 detection/counting, state machine transitions (running→paused→resuming),
  save trigger, countdown math, auto-resume invocation
- An integration test that runs a short synthetic pipeline through
  quota-exceeded → wait (mocked) → resume in under 2 minutes of wall time
`.trim();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFile(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function globMilestones(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^milestone-\d+/.test(f) && f.endsWith('.md'))
    .sort()
    .map(f => path.join(dir, f));
}

function milestoneStatus(filePath: string): string {
  try {
    const content = readFile(filePath);
    const m = content.match(/\*\*Status:\*\*\s*(\w+)/);
    return m?.[1]?.toUpperCase() ?? 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

// ─── Git helper ───────────────────────────────────────────────────────────────

function gitCommit(repoDir: string, message: string, stagePaths: string[] = ['.']): void {
  const run = (cmd: string, args: string[]) =>
    execFileSync(cmd, args, { cwd: repoDir, stdio: 'pipe' });

  try {
    // Init repo if it doesn't exist
    if (!fs.existsSync(path.join(repoDir, '.git'))) {
      run('git', ['init']);
      run('git', ['config', 'user.email', 'pipeline@deepthink']);
      run('git', ['config', 'user.name',  'DeepThink Pipeline']);
    }

    run('git', ['add', ...stagePaths]);
    run('git', ['commit', '-m', message]);
    console.log(`  [git] ${repoDir === __dirname ? 'docs' : 'src'}: ${message}`);
  } catch (err: any) {
    const out = err.stdout?.toString() ?? '';
    if (out.includes('nothing to commit')) {
      console.log(`  [git] nothing to commit (${path.basename(repoDir)})`);
    } else {
      // Non-fatal — log and continue
      console.warn(`  [git] commit skipped: ${(err.stderr?.toString() ?? err.message).trim().split('\n')[0]}`);
    }
  }
}

// ─── Core runner ──────────────────────────────────────────────────────────────

async function runAgent(
  label:        string,
  prompt:       string,
  extraOptions: Partial<Options> = {},
): Promise<{ result: string; success: boolean; cost: number }> {
  const bar = '═'.repeat(62);
  console.log(`\n${bar}`);
  console.log(`  ${label}`);
  console.log(`${bar}\n`);

  const options: Options = { ...BASE_OPTIONS, ...extraOptions };

  let resultText = '';
  let isError    = false;
  let cost       = 0;
  let turns      = 0;

  for await (const msg of query({ prompt, options })) {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          console.log(`  session: ${msg.session_id}`);
          console.log(`  tools:   ${msg.tools.join(', ')}\n`);
        }
        break;

      case 'assistant':
        // Print text blocks in real time so progress is visible
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            process.stdout.write(block.text);
          }
        }
        break;

      case 'result':
        turns   = msg.num_turns;
        cost    = msg.total_cost_usd;
        isError = msg.is_error;

        if (msg.subtype === 'success') {
          resultText = msg.result;
        } else {
          // SDKResultError — has .errors array, no .result
          resultText = (msg as { errors?: string[] }).errors?.join('\n') ?? `error: ${msg.subtype}`;
        }

        const icon = isError ? '✗' : '✓';
        console.log(`\n\n  ${icon} done — turns=${turns}, cost=$${cost.toFixed(4)}, status=${msg.subtype}`);
        break;
    }
  }

  return { result: resultText, success: !isError, cost };
}

// ─── Step 1: Write initial plan ───────────────────────────────────────────────

async function step1_writePlan(): Promise<void> {
  const prompt = `
You are writing a detailed implementation plan for a software feature.

Create the file: docs/plans/${PLAN_SLUG}/plan.md

The plan must have these sections (in order):
1. # ${PLAN_SLUG} (use this exact title)
2. ## Summary (3-5 sentence overview)
3. ## Background & Context (why this is needed, root cause of the watchdog failure)
4. ## Architecture (data flow, which files change, ASCII or mermaid diagram)
5. ## Detailed Implementation (exact file names, function signatures, new types/interfaces)
6. ## Testing Strategy (fast automated tests, no waiting for real quota limits — see requirements)
7. ## Rollout Notes (backwards compat, migration, config defaults)
8. ## Open Questions

Be precise: name every file, every new function, every new config field, every new type.
A developer must be able to implement this without asking any clarifying questions.

Feature requirements:
${PLAN_INPUT}
`.trim();

  const { success } = await runAgent('Step 1 — Write implementation plan', prompt);
  if (!success) throw new Error('Step 1 failed');
  console.log(`\n  → docs/plans/${PLAN_SLUG}/plan.md`);
  gitCommit(__dirname, `plan(${PLAN_SLUG}): create initial implementation plan`, ['docs/']);
}

// ─── Step 2: Adversarial analysis (2 stateless rounds) ───────────────────────

async function step2_adversarialRound(round: number): Promise<void> {
  const currentPlan = readFile(PLAN_PATH);

  const prompt = `
You are performing adversarial analysis on an implementation plan.
This is round ${round} of 2. Each round is stateless — you only see the current plan.

Your job:
1. Find every flaw, gap, edge case, unstated assumption, race condition, missing error path,
   UI state not handled, infinite-loop risk, or test that can't actually catch the bug it claims to.
2. Fix ALL of them directly in the plan — do NOT output a separate issues list.
3. Return the COMPLETE updated plan.md with every fix already incorporated.

Rewrite docs/plans/${PLAN_SLUG}/plan.md with all improvements. Keep every original section.
Add/modify sections as needed. Do not remove anything useful.

Current plan:
<plan>
${currentPlan}
</plan>
`.trim();

  const { success } = await runAgent(
    `Step 2 — Adversarial analysis (round ${round}/2)`,
    prompt,
  );
  if (!success) throw new Error(`Step 2 round ${round} failed`);
  console.log(`\n  → plan.md updated (round ${round})`);
  gitCommit(__dirname, `plan(${PLAN_SLUG}): adversarial analysis round ${round}`, ['docs/']);
}

// ─── Step 3: Break into milestones ───────────────────────────────────────────

async function step3_breakIntoMilestones(): Promise<void> {
  const currentPlan = readFile(PLAN_PATH);

  const prompt = `
You are breaking an implementation plan into independently verifiable milestones.

Rules for each milestone:
- Self-contained: stands alone or builds only on previous milestones
- Programmatically verifiable: has a specific shell command (tsc, node test.mjs, npm run build)
  that deterministically returns success/failure. NO "manually verify" steps.
- Achievable in one focused coding session
- Each milestone file goes in: docs/plans/${PLAN_SLUG}/milestone-NN-<slug>.md

Milestone file format (use EXACTLY this structure):
---
# Milestone N: <Title>

## Goal
<one paragraph>

## Prerequisites
<list previous milestones, or "None">

## Implementation Tasks
<numbered list of specific tasks with file paths>

## Verification
\`\`\`bash
# Exact commands — must pass with exit code 0 when milestone is done
npx tsc --noEmit 2>&1 | tail -5
# add more specific test commands here
\`\`\`

## Definition of Done
- [ ] <each item is a boolean, machine-checkable criterion>

**Status:** PENDING
---

After creating all milestone files, update docs/plans/${PLAN_SLUG}/plan.md:
- Replace the "Detailed Implementation" section body with a table of milestone references
- Format: | N | [Title](./milestone-NN-slug.md) | PENDING |

Current plan:
<plan>
${currentPlan}
</plan>
`.trim();

  const { success } = await runAgent('Step 3 — Break into milestones', prompt);
  if (!success) throw new Error('Step 3 failed');

  const files = globMilestones(PLAN_DIR);
  console.log(`\n  → ${files.length} milestone files created`);
  for (const f of files) {
    console.log(`     ${path.basename(f)}  [${milestoneStatus(f)}]`);
  }
  gitCommit(__dirname, `plan(${PLAN_SLUG}): decompose into ${files.length} milestones`, ['docs/']);
}

// ─── Step 4: Implement milestones (one agent call per milestone) ──────────────

async function step4_implementMilestones(): Promise<void> {
  const bar = '═'.repeat(62);
  console.log(`\n${bar}`);
  console.log('  Step 4 — Implement milestones');
  console.log(`${bar}`);

  let totalCost = 0;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 2;

  // Keep looping until all milestones are terminal (COMPLETED or FAILED)
  while (true) {
    const allFiles = globMilestones(PLAN_DIR);
    if (allFiles.length === 0) {
      console.log('\n  No milestone files found — skipping implementation.');
      break;
    }

    const nextPending = allFiles.find(f => milestoneStatus(f) === 'PENDING');
    if (!nextPending) {
      const failed = allFiles.filter(f => milestoneStatus(f) === 'FAILED');
      if (failed.length > 0) {
        console.log(`\n  All milestones processed. ${failed.length} failed:`);
        failed.forEach(f => console.log(`    ✗ ${path.basename(f)}`));
      } else {
        console.log('\n  All milestones COMPLETED ✓');
      }
      break;
    }

    const milestoneNum   = path.basename(nextPending).match(/milestone-(\d+)/)?.[1] ?? '?';
    const milestoneTitle = path.basename(nextPending).replace(/^milestone-\d+-/, '').replace(/\.md$/, '');
    const milestoneContent = readFile(nextPending);

    console.log(`\n  Milestone ${milestoneNum}: ${milestoneTitle}  [PENDING → implementing]`);

    // Mark in-progress before starting
    fs.writeFileSync(
      nextPending,
      milestoneContent.replace('**Status:** PENDING', '**Status:** IN_PROGRESS'),
    );

    const prompt = `
You are implementing Milestone ${milestoneNum} of the ${PLAN_SLUG} feature.

The source code is in: ${SRC_DIR}
The plan is at: ${PLAN_PATH}
This milestone's doc is at: ${nextPending}

## Your Instructions
1. Read the milestone document carefully.
2. Read ALL relevant existing source files before making any changes.
3. Implement every task listed in "Implementation Tasks".
4. Run each command in the "Verification" section.
5. If verification fails, debug and fix until it passes.
6. When ALL "Definition of Done" items are satisfied, update the milestone file:
   - Change **Status:** IN_PROGRESS → **Status:** COMPLETED
   - Append a "## Completion Report" section with: what was changed, verification output.
7. Update docs/plans/${PLAN_SLUG}/plan.md — change this milestone's row from PENDING to ✅ COMPLETED.

## Milestone Document
${milestoneContent}
`.trim();

    const start = Date.now();
    const { success, cost } = await runAgent(
      `  Milestone ${milestoneNum}/${globMilestones(PLAN_DIR).length}`,
      prompt,
      { cwd: __dirname, maxTurns: 100 },
    );
    const elapsed = Math.round((Date.now() - start) / 1000);
    totalCost += cost;

    // Re-read to see what the agent wrote
    const finalContent = readFile(nextPending);
    const finalStatus  = milestoneStatus(nextPending);

    if (!success || finalStatus !== 'COMPLETED') {
      // Agent didn't mark it completed — force a FAILED status if still IN_PROGRESS
      if (finalStatus === 'IN_PROGRESS') {
        fs.writeFileSync(
          nextPending,
          finalContent.replace('**Status:** IN_PROGRESS', '**Status:** FAILED')
          + `\n\n## Completion Report\n**Status:** FAILED\n**Duration:** ${elapsed}s\n`
          + (success ? '(agent ended without completing verification)' : '(agent error)') + '\n',
        );
      }
      consecutiveFailures++;
      console.error(`\n  ✗ Milestone ${milestoneNum} FAILED (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} consecutive)`);
      // Commit whatever partial work exists in both repos
      gitCommit(SRC_DIR,   `impl(${PLAN_SLUG}): milestone ${milestoneNum} FAILED — partial work`, ['.']);
      gitCommit(__dirname, `plan(${PLAN_SLUG}): milestone ${milestoneNum} marked FAILED`,           ['docs/']);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('  Too many consecutive failures — stopping. Fix manually and re-run.');
        break;
      }
    } else {
      consecutiveFailures = 0;
      console.log(`\n  ✓ Milestone ${milestoneNum} COMPLETED in ${elapsed}s`);
      gitCommit(SRC_DIR,   `impl(${PLAN_SLUG}): complete milestone ${milestoneNum} — ${milestoneTitle}`, ['.']);
      gitCommit(__dirname, `plan(${PLAN_SLUG}): milestone ${milestoneNum} marked COMPLETED`,              ['docs/']);
    }
  }

  console.log(`\n  Total implementation cost: $${totalCost.toFixed(4)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║            DeepThink Plan Pipeline (Agent SDK)              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Plan:   docs/plans/${PLAN_SLUG}/`);
  console.log(`  Source: Iterative-Contextual-Refinements/`);
  console.log(`  Mode:   bypassPermissions + dangerouslySkipPermissions\n`);

  // Step 1 — only if plan.md doesn't already exist
  if (!fs.existsSync(PLAN_PATH)) {
    await step1_writePlan();
  } else {
    console.log(`\n[Step 1] plan.md exists — skipping (delete it to regenerate)\n`);
  }

  // Step 2 — adversarial analysis, 2 rounds
  await step2_adversarialRound(1);
  await step2_adversarialRound(2);

  // Step 3 — milestone breakdown (skip if milestones already exist)
  const existingMilestones = globMilestones(PLAN_DIR);
  if (existingMilestones.length === 0) {
    await step3_breakIntoMilestones();
  } else {
    console.log(`\n[Step 3] ${existingMilestones.length} milestone(s) found — skipping breakdown\n`);
  }

  // Step 4 — implement all pending milestones
  await step4_implementMilestones();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                     Pipeline complete                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Elapsed:    ${minutes}m ${seconds}s`);
  console.log(`  Plan:       docs/plans/${PLAN_SLUG}/plan.md`);
  console.log(`  Milestones: docs/plans/${PLAN_SLUG}/milestone-*.md\n`);
}

main().catch((err: unknown) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
