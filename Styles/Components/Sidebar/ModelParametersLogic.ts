import { EvolutionMode } from '../../../Core/Types';
import { getEvolutionModeDescription, setEvolutionMode as setEvolutionModeUI } from '../../../UI/CommonUI';

export interface EvolutionOption {
    value: EvolutionMode;
    label: string;
}

export const EVOLUTION_OPTIONS: EvolutionOption[] = [
    { value: 'off', label: 'Off' },
    { value: 'novelty', label: 'Novelty' },
    { value: 'quality', label: 'Quality' },
];

export function getEvolutionModeDescriptionText(mode: EvolutionMode): string {
    return getEvolutionModeDescription(mode);
}

export function handleEvolutionModeSelection(mode: EvolutionMode): void {
    setEvolutionModeUI(mode);
}

export function initializeEvolutionConvergenceButtons(): void {
    // No-op: EvolutionModeSelector is rendered directly inside
    // ModelParameters as a React child — no imperative mounting required.
}
