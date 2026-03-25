/**
 * QuotaCountdownUI — Floating overlay that displays quota backoff status.
 *
 * Subscribes to QuotaBackoffManager and shows/hides a fixed-position overlay
 * with pause status, countdown timer, cycle info, saved filename, and
 * Resume now / Cancel buttons.
 *
 * The overlay mounts/unmounts itself based on manager state and provides
 * cleanup for SPA navigation.
 */

import {
  getQuotaBackoffManager,
  type QuotaBackoffSnapshot,
} from './QuotaBackoffManager';
import { getActiveDeepthinkPipeline } from './DeepthinkCore';

// ── Formatting Helpers ──

/**
 * Format milliseconds to "Xh Ym Zs" string.
 * - Returns "0s" for zero or negative values.
 * - Returns "—" for NaN or non-finite values.
 * - Omits zero-valued leading components (e.g. "5m 30s" not "0h 5m 30s").
 */
export function formatCountdown(ms: number): string {
  if (typeof ms !== 'number' || !isFinite(ms)) return '—';
  if (ms <= 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Format a Date to "HH:MM" local time string.
 * Returns "—" if date is null/undefined or invalid.
 */
export function formatResetTime(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '—';
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ── Overlay Creation ──

const OVERLAY_ID = 'quota-countdown-overlay';

/**
 * Build the fixed-position overlay DOM element with all child elements.
 */
function createOverlayElement(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    'position: fixed',
    'top: 20px',
    'right: 20px',
    'z-index: 100000',
    'background: #1a1a2e',
    'color: #e0e0e0',
    'border: 1px solid #e94560',
    'border-radius: 12px',
    'padding: 20px',
    'min-width: 320px',
    'max-width: 420px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 14px',
    'box-shadow: 0 8px 32px rgba(233, 69, 96, 0.3)',
    'display: none',
  ].join('; ');

  // Title
  const title = document.createElement('div');
  title.className = 'quota-overlay-title';
  title.style.cssText = 'font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #e94560;';
  title.textContent = '⏸ Quota Backoff Active';
  overlay.appendChild(title);

  // Status line
  const status = document.createElement('div');
  status.className = 'quota-overlay-status';
  status.style.cssText = 'margin-bottom: 8px;';
  overlay.appendChild(status);

  // Timer
  const timer = document.createElement('div');
  timer.className = 'quota-overlay-timer';
  timer.style.cssText = 'font-size: 28px; font-weight: 700; text-align: center; margin: 12px 0; color: #fff; font-variant-numeric: tabular-nums;';
  overlay.appendChild(timer);

  // Reset time
  const resetTime = document.createElement('div');
  resetTime.className = 'quota-overlay-reset-time';
  resetTime.style.cssText = 'margin-bottom: 8px; text-align: center; color: #aaa;';
  overlay.appendChild(resetTime);

  // Cycle info
  const cycle = document.createElement('div');
  cycle.className = 'quota-overlay-cycle';
  cycle.style.cssText = 'margin-bottom: 8px; color: #aaa;';
  overlay.appendChild(cycle);

  // Saved filename
  const filename = document.createElement('div');
  filename.className = 'quota-overlay-filename';
  filename.style.cssText = 'margin-bottom: 8px; font-size: 12px; color: #8888aa; word-break: break-all;';
  overlay.appendChild(filename);

  // No-reset warning
  const warning = document.createElement('div');
  warning.className = 'quota-overlay-warning';
  warning.style.cssText = 'margin-bottom: 12px; padding: 8px; background: #2a1a00; border: 1px solid #ff8800; border-radius: 6px; color: #ffaa33; font-size: 12px; display: none;';
  warning.textContent = '⚠ No reset time configured — auto-resume disabled. Use "Resume now" to continue manually.';
  overlay.appendChild(warning);

  // Button container
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 12px;';

  // Resume now button
  const resumeBtn = document.createElement('button');
  resumeBtn.className = 'quota-overlay-resume-btn';
  resumeBtn.textContent = '▶ Resume Now';
  resumeBtn.style.cssText = [
    'flex: 1',
    'padding: 8px 16px',
    'border: none',
    'border-radius: 6px',
    'background: #0f3460',
    'color: #fff',
    'font-weight: 600',
    'cursor: pointer',
    'font-size: 14px',
  ].join('; ');
  resumeBtn.addEventListener('click', () => {
    const manager = getQuotaBackoffManager();
    manager.resumeNow();
  });
  btnContainer.appendChild(resumeBtn);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'quota-overlay-cancel-btn';
  cancelBtn.textContent = '✕ Cancel';
  cancelBtn.style.cssText = [
    'flex: 1',
    'padding: 8px 16px',
    'border: 1px solid #555',
    'border-radius: 6px',
    'background: transparent',
    'color: #ccc',
    'font-weight: 600',
    'cursor: pointer',
    'font-size: 14px',
  ].join('; ');
  cancelBtn.addEventListener('click', () => {
    const manager = getQuotaBackoffManager();
    manager.reset();
    const pipeline = getActiveDeepthinkPipeline();
    if (pipeline) {
      pipeline.isStopRequested = true;
    }
  });
  btnContainer.appendChild(cancelBtn);

  overlay.appendChild(btnContainer);

  return overlay;
}

// ── Overlay Content Update ──

/**
 * Update overlay text and visibility based on the current snapshot.
 * - Show overlay when state is 'saving', 'paused', or 'resuming'.
 * - Hide when state is 'running'.
 */
function updateOverlayContent(
  overlay: HTMLDivElement,
  snapshot: QuotaBackoffSnapshot,
): void {
  // Show/hide based on state
  if (snapshot.state === 'running') {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'block';

  // Title
  const title = overlay.querySelector('.quota-overlay-title') as HTMLDivElement | null;
  if (title) {
    switch (snapshot.state) {
      case 'saving':
        title.textContent = '💾 Saving Session…';
        break;
      case 'paused':
        title.textContent = '⏸ Quota Backoff Active';
        break;
      case 'resuming':
        title.textContent = '▶ Resuming Pipeline…';
        break;
    }
  }

  // Status
  const status = overlay.querySelector('.quota-overlay-status') as HTMLDivElement | null;
  if (status) {
    switch (snapshot.state) {
      case 'saving':
        status.textContent = 'Saving pipeline state before pausing…';
        break;
      case 'paused':
        status.textContent = `Paused — received ${snapshot.consecutive429Count} consecutive 429 errors`;
        break;
      case 'resuming':
        status.textContent = 'Restoring pipeline and resuming API calls…';
        break;
    }
  }

  // Timer
  const timer = overlay.querySelector('.quota-overlay-timer') as HTMLDivElement | null;
  if (timer) {
    if (snapshot.state === 'paused' && snapshot.nextResetTime) {
      timer.textContent = formatCountdown(snapshot.msUntilReset);
      timer.style.display = 'block';
    } else {
      timer.style.display = 'none';
    }
  }

  // Reset time
  const resetTime = overlay.querySelector('.quota-overlay-reset-time') as HTMLDivElement | null;
  if (resetTime) {
    if (snapshot.state === 'paused' && snapshot.nextResetTime) {
      resetTime.textContent = `Quota resets at ${formatResetTime(snapshot.nextResetTime)}`;
      resetTime.style.display = 'block';
    } else {
      resetTime.style.display = 'none';
    }
  }

  // Cycle info
  const cycle = overlay.querySelector('.quota-overlay-cycle') as HTMLDivElement | null;
  if (cycle) {
    cycle.textContent = `Pause/resume cycle ${snapshot.cycleCount} of ${snapshot.maxCyclesPerSession}`;
  }

  // Saved filename
  const filename = overlay.querySelector('.quota-overlay-filename') as HTMLDivElement | null;
  if (filename) {
    if (snapshot.savedFilename) {
      filename.textContent = `📄 ${snapshot.savedFilename}`;
      filename.style.display = 'block';
    } else {
      filename.style.display = 'none';
    }
  }

  // No-reset warning
  const warning = overlay.querySelector('.quota-overlay-warning') as HTMLDivElement | null;
  if (warning) {
    warning.style.display = (snapshot.state === 'paused' && !snapshot.nextResetTime)
      ? 'block'
      : 'none';
  }

  // Button states
  const resumeBtn = overlay.querySelector('.quota-overlay-resume-btn') as HTMLButtonElement | null;
  if (resumeBtn) {
    resumeBtn.disabled = snapshot.state !== 'paused';
    resumeBtn.style.opacity = snapshot.state === 'paused' ? '1' : '0.5';
  }

  const cancelBtn = overlay.querySelector('.quota-overlay-cancel-btn') as HTMLButtonElement | null;
  if (cancelBtn) {
    cancelBtn.disabled = snapshot.state === 'resuming';
    cancelBtn.style.opacity = snapshot.state === 'resuming' ? '0.5' : '1';
  }
}

// ── Mount / Unmount ──

let currentOverlay: HTMLDivElement | null = null;
let currentUnsubscribe: (() => void) | null = null;

/**
 * Mount the quota countdown overlay. Creates the DOM element, subscribes to
 * the QuotaBackoffManager, and returns a cleanup function.
 *
 * Safe to call multiple times — subsequent calls unmount the previous overlay
 * first.
 */
export function mountQuotaCountdownUI(): () => void {
  // Clean up any existing overlay
  unmountQuotaCountdownUI();

  const manager = getQuotaBackoffManager();
  const overlay = createOverlayElement();
  document.body.appendChild(overlay);
  currentOverlay = overlay;

  // Initial render
  updateOverlayContent(overlay, manager.getSnapshot());

  // Subscribe for updates
  const unsubscribe = manager.subscribe((snapshot: QuotaBackoffSnapshot) => {
    updateOverlayContent(overlay, snapshot);
  });
  currentUnsubscribe = unsubscribe;

  // Return cleanup function
  const cleanup = () => {
    unmountQuotaCountdownUI();
  };

  return cleanup;
}

/**
 * Unmount the quota countdown overlay. Removes the DOM element and
 * unsubscribes from the manager. Safe to call when no overlay is mounted.
 */
export function unmountQuotaCountdownUI(): void {
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
}
