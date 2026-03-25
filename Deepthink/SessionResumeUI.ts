/**
 * SessionResumeUI — Overlay shown after a session file is loaded.
 *
 * Lets the user configure the quota reset time and target depth before
 * resuming, without needing to touch the config panel or the browser console.
 */

import type { DeepthinkSessionFile } from './DeepthinkSession';

const OVERLAY_ID = 'session-resume-overlay';

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Show a fixed overlay after a session is loaded.
 *
 * @param session   The loaded session (used for label + default depth)
 * @param onResume  Called when the user clicks Resume. Receives the backoff
 *                  duration in hours (0 if left blank) and target depth.
 */
export function showSessionResumeOverlay(
    session: DeepthinkSessionFile,
    onResume: (backoffDurationHours: number, targetDepth: number) => void,
): void {
    // Remove any pre-existing instance
    document.getElementById(OVERLAY_ID)?.remove();

    const defaultDepth = session.pipelineConfig?.iterativeDepth ?? 10;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
        'position: fixed',
        'top: 20px',
        'right: 20px',
        'z-index: 100001',
        'background: #1a1a2e',
        'color: #e0e0e0',
        'border: 1px solid #4a9eff',
        'border-radius: 12px',
        'padding: 20px',
        'min-width: 320px',
        'max-width: 420px',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'font-size: 14px',
        'box-shadow: 0 8px 32px rgba(74, 158, 255, 0.25)',
    ].join('; ');

    // ── Title ──
    const title = document.createElement('div');
    title.style.cssText = 'font-size:16px; font-weight:700; margin-bottom:8px; color:#4a9eff;';
    title.textContent = '\u2713 Session Loaded';
    overlay.appendChild(title);

    // ── Session label ──
    const label = document.createElement('div');
    label.style.cssText = 'margin-bottom:16px; color:#8888aa; font-size:12px; word-break:break-all;';
    label.textContent = session.label;
    overlay.appendChild(label);

    // ── Backoff duration field ──
    const resetGroup = document.createElement('div');
    resetGroup.style.cssText = 'margin-bottom:12px;';

    const resetLabel = document.createElement('label');
    resetLabel.htmlFor = 'sresume-backoff-duration';
    resetLabel.style.cssText = 'display:block; font-size:12px; color:#aaa; margin-bottom:6px;';
    resetLabel.textContent = 'Backoff Duration (hours from now)';
    resetGroup.appendChild(resetLabel);

    const resetInput = document.createElement('input');
    resetInput.id = 'sresume-backoff-duration';
    resetInput.type = 'number';
    resetInput.placeholder = 'e.g. 2';
    resetInput.min = '0';
    resetInput.max = '168';
    resetInput.step = '0.5';
    resetInput.style.cssText = [
        'width: 100%',
        'box-sizing: border-box',
        'padding: 8px 12px',
        'background: #0f1a2e',
        'color: #e0e0e0',
        'border: 1px solid #4a9eff44',
        'border-radius: 6px',
        'font-size: 14px',
        'outline: none',
    ].join('; ');
    resetGroup.appendChild(resetInput);

    const resetHint = document.createElement('div');
    resetHint.style.cssText = 'font-size:11px; color:#8888aa; margin-top:4px;';
    resetHint.textContent = 'Leave blank (0) to pause without auto-resume on next 429.';
    resetGroup.appendChild(resetHint);

    overlay.appendChild(resetGroup);

    // ── Target depth field ──
    const depthGroup = document.createElement('div');
    depthGroup.style.cssText = 'margin-bottom:16px;';

    const depthLabel = document.createElement('label');
    depthLabel.htmlFor = 'sresume-target-depth';
    depthLabel.style.cssText = 'display:block; font-size:12px; color:#aaa; margin-bottom:6px;';
    depthLabel.textContent = 'Target Depth';
    depthGroup.appendChild(depthLabel);

    const depthInput = document.createElement('input');
    depthInput.id = 'sresume-target-depth';
    depthInput.type = 'number';
    depthInput.value = String(defaultDepth);
    depthInput.min = '1';
    depthInput.max = '50';
    depthInput.style.cssText = [
        'width: 100%',
        'box-sizing: border-box',
        'padding: 8px 12px',
        'background: #0f1a2e',
        'color: #e0e0e0',
        'border: 1px solid #4a9eff44',
        'border-radius: 6px',
        'font-size: 14px',
        'outline: none',
    ].join('; ');
    depthGroup.appendChild(depthInput);

    overlay.appendChild(depthGroup);

    // ── Buttons ──
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:8px;';

    const dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = [
        'flex: 1',
        'padding: 8px 16px',
        'border: 1px solid #444',
        'border-radius: 6px',
        'background: transparent',
        'color: #aaa',
        'font-size: 14px',
        'cursor: pointer',
    ].join('; ');
    btnRow.appendChild(dismissBtn);

    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = '\u25b6 Resume Pipeline';
    resumeBtn.style.cssText = [
        'flex: 2',
        'padding: 8px 16px',
        'border: none',
        'border-radius: 6px',
        'background: #0f3460',
        'color: #fff',
        'font-size: 14px',
        'font-weight: 600',
        'cursor: pointer',
    ].join('; ');
    btnRow.appendChild(resumeBtn);

    overlay.appendChild(btnRow);

    document.body.appendChild(overlay);

    // ── Event handlers ──
    dismissBtn.addEventListener('click', () => overlay.remove());

    resumeBtn.addEventListener('click', () => {
        const backoffDurationHours = parseFloat(resetInput.value) || 0;
        const targetDepth = parseInt(depthInput.value, 10) || defaultDepth;
        overlay.remove();
        onResume(backoffDurationHours, targetDepth);
    });

    // Focus the backoff duration input
    resetInput.focus();
}
