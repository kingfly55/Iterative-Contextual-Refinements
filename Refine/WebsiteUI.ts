import { globalState } from '../Core/State';
import { PipelineState } from '../Core/Types';
import { updateControlsState } from '../UI/Controls';

// ---------------------------------------------------------------------------
// Pipeline status — mutates state and fires a custom event so the React tree
// can re-render. Also syncs the legacy stop-button element if present.
// ---------------------------------------------------------------------------

export function updatePipelineStatusUI(pipelineId: number, status: PipelineState['status']) {
    const pipeline = globalState.pipelinesState.find(p => p.id === pipelineId);
    if (!pipeline) return;

    pipeline.status = status;

    // Sync legacy stop-button element (rendered outside the React tree by UIManager).
    if (pipeline.stopButtonElement) {
        if (status === 'running') {
            pipeline.stopButtonElement.style.display = 'inline-flex';
            const textEl = pipeline.stopButtonElement.querySelector('.button-text');
            if (textEl) textEl.textContent = 'Stop';
            pipeline.stopButtonElement.disabled = false;
        } else if (status === 'stopping') {
            pipeline.stopButtonElement.style.display = 'inline-flex';
            const textEl = pipeline.stopButtonElement.querySelector('.button-text');
            if (textEl) textEl.textContent = 'Stopping...';
            pipeline.stopButtonElement.disabled = true;
        } else {
            pipeline.stopButtonElement.style.display = 'none';
            pipeline.stopButtonElement.disabled = true;
        }
    }

    updateControlsState();
    window.dispatchEvent(new CustomEvent('refine:pipeline-status', { detail: { pipelineId, status } }));
}

// Fires when an iteration's data has been mutated in globalState so the React
// tree knows to re-render that panel.
export function notifyIterationUpdated(pipelineId: number, iterationIndex: number) {
    window.dispatchEvent(new CustomEvent('refine:iteration-updated', { detail: { pipelineId, iterationIndex } }));
}

