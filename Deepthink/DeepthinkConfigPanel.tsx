/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DeepthinkConfigPanel — React component for the configuration panel.
 * All business logic and state management lives in the controller (Routing/DeepthinkConfigController).
 * This file renders JSX exclusively.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { getDeepthinkConfigController } from '../Routing';

export interface DeepthinkConfigPanelProps {
    strategiesCount: number;
    subStrategiesCount: number;
    hypothesisCount: number;
    skipSubStrategies: boolean;
    hypothesisEnabled: boolean;
    redTeamMode: string;
    postQualityFilterEnabled: boolean;
    refinementEnabled: boolean;
    dissectedObservationsEnabled: boolean;
    iterativeCorrectionsEnabled: boolean;
    iterativeDepth: number;
    provideAllSolutionsEnabled: boolean;
    codeExecutionEnabled: boolean;
    isGeminiProvider: boolean;

    // Quota Backoff config
    quotaBackoffDurationHours: number;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;
    quotaMaxCyclesPerSession: number;

    onStrategiesChange: (count: number) => void;
    onSubStrategiesChange: (count: number) => void;
    onHypothesisChange: (count: number) => void;
    onSkipSubStrategiesToggle: (skip: boolean) => void;
    onHypothesisToggle: (enabled: boolean) => void;
    onRedTeamModeChange: (mode: string) => void;
    onPostQualityFilterToggle: (enabled: boolean) => void;
    onRefinementToggle: (enabled: boolean) => void;
    onDissectedObservationsToggle: (enabled: boolean) => void;
    onIterativeCorrectionsToggle: (enabled: boolean) => void;
    onIterativeDepthChange: (depth: number) => void;
    onProvideAllSolutionsToggle: (enabled: boolean) => void;
    onCodeExecutionToggle: (enabled: boolean) => void;

    // Quota Backoff callbacks
    onQuotaBackoffDurationChange: (hours: number) => void;
    onQuotaConsecutive429ThresholdChange: (threshold: number) => void;
    onQuotaAutoResumeToggle: (enabled: boolean) => void;
    onQuotaMaxCyclesPerSessionChange: (max: number) => void;
}

// ═══════════════════════════════════════════════════════════════════════
// Shared Helpers
// ═══════════════════════════════════════════════════════════════════════

const SliderWithFill: React.FC<{
    id: string;
    value: number;
    min: number;
    max: number;
    color: string;
    disabled?: boolean;
    onChange: (value: number) => void;
}> = ({ id, value, min, max, color, disabled, onChange }) => {
    const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;
    const background = `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, var(--slider-track-color) ${percentage}%, var(--slider-track-color) 100%)`;

    return (
        <input
            type="range"
            id={id}
            className="slider"
            min={min}
            max={max}
            step={1}
            value={value}
            disabled={disabled}
            style={{ background }}
            onChange={e => onChange(parseInt(e.target.value))}
        />
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Sub-Sections
// ═══════════════════════════════════════════════════════════════════════

const StrategyExecutionSection: React.FC<{
    strategiesCount: number;
    subStrategiesCount: number;
    iterativeCorrectionsEnabled: boolean;
    onStrategiesChange: (v: number) => void;
    onSubStrategiesChange: (v: number) => void;
    onSkipSubStrategiesToggle: (skip: boolean) => void;
}> = ({ strategiesCount, subStrategiesCount, iterativeCorrectionsEnabled, onStrategiesChange, onSubStrategiesChange, onSkipSubStrategiesToggle }) => {
    const subPercentage = (subStrategiesCount / 10) * 100;
    const subBackground = `linear-gradient(to right, #e86b6b 0%, #e86b6b ${subPercentage}%, var(--slider-track-color) ${subPercentage}%, var(--slider-track-color) 100%)`;

    return (
        <div className="strategy-execution-container">
            <div className="strategy-execution-header">
                <span className="material-symbols-outlined">account_tree</span>
                <span>Strategy Execution</span>
            </div>
            <div className="strategy-execution-card">
                {/* Primary strategies */}
                <div className="strategy-execution-section">
                    <div className="input-group-tight">
                        <label htmlFor="dt-strategies-slider" className="input-label">
                            Strategies: <span id="dt-strategies-value">{strategiesCount}</span>
                        </label>
                        <SliderWithFill
                            id="dt-strategies-slider"
                            value={strategiesCount}
                            min={1}
                            max={10}
                            color="#e86b6b"
                            onChange={onStrategiesChange}
                        />
                    </div>
                </div>

                <div className="strategy-execution-divider" />

                {/* Sub-strategies */}
                <div className={`strategy-execution-section${subStrategiesCount === 0 ? ' dimmed' : ''}`}>
                    <div className="input-group-tight">
                        <label htmlFor="dt-sub-strategies-slider" className="input-label">
                            Sub-strategies: <span id="dt-sub-strategies-value">{subStrategiesCount}</span>
                            {subStrategiesCount === 0 && <span className="disabled-label">(Disabled)</span>}
                        </label>
                        <div className="slider-with-dots">
                            <input
                                type="range"
                                id="dt-sub-strategies-slider"
                                className="slider dots-slider"
                                min={0}
                                max={10}
                                step={1}
                                value={subStrategiesCount}
                                disabled={iterativeCorrectionsEnabled}
                                style={{ background: subBackground }}
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    onSkipSubStrategiesToggle(v === 0);
                                    onSubStrategiesChange(v);
                                }}
                            />
                            <div className="slider-dots">
                                {Array.from({ length: 11 }, (_, i) => (
                                    <span key={i} className={`slider-dot${i <= subStrategiesCount ? ' active' : ''}`} data-value={i}>{i}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RedTeamSection: React.FC<{
    redTeamMode: string;
    postQualityFilterEnabled: boolean;
    iterativeCorrectionsEnabled: boolean;
    onRedTeamModeChange: (mode: string) => void;
    onPostQualityFilterToggle: (enabled: boolean) => void;
}> = ({ redTeamMode, postQualityFilterEnabled, iterativeCorrectionsEnabled, onRedTeamModeChange, onPostQualityFilterToggle }) => (
    <div className="red-team-options-container">
        <div className="red-team-options-header">
            <span className="material-symbols-outlined">security</span>
            <span>Red Team Evaluation</span>
        </div>
        <div className="red-team-toggle-wrapper">
            <div className="red-team-buttons">
                {(['off', 'balanced', 'very_aggressive'] as const).map(mode => (
                    <button
                        key={mode}
                        type="button"
                        className={`red-team-button${redTeamMode === mode ? ' active' : ''}`}
                        data-value={mode}
                        onClick={() => onRedTeamModeChange(mode)}
                    >
                        {mode === 'off' ? 'Off' : mode === 'balanced' ? 'Balanced' : 'Aggressive'}
                    </button>
                ))}
            </div>
        </div>

        {/* Post Quality Filter */}
        <div className="post-quality-filter-card-wrapper">
            <div className={`refinement-method-card post-quality-filter-card${!iterativeCorrectionsEnabled ? ' disabled' : ''}`} data-method="postqualityfilter">
                <div className="method-card-header">
                    <div className="method-card-selector">
                        <input
                            type="checkbox"
                            id="dt-post-quality-filter-toggle"
                            className="method-checkbox"
                            checked={postQualityFilterEnabled}
                            disabled={!iterativeCorrectionsEnabled}
                            onChange={e => onPostQualityFilterToggle(e.target.checked)}
                        />
                        <label htmlFor="dt-post-quality-filter-toggle" className="method-checkbox-label">
                            <div className="method-checkbox-custom" />
                        </label>
                    </div>
                    <div className="method-card-title">
                        <div className="method-name">Post Quality Filter</div>
                        <div className="method-type">Strategy Evolution</div>
                    </div>
                </div>
                <div className="method-card-description">
                    Requires Iterative Corrections enabled. Iteratively refines strategies based on execution quality.
                </div>
            </div>
        </div>
    </div>
);

const InformationPacketSection: React.FC<{
    hypothesisEnabled: boolean;
    hypothesisCount: number;
    onHypothesisToggle: (enabled: boolean) => void;
    onHypothesisChange: (value: number) => void;
}> = ({ hypothesisEnabled, hypothesisCount, onHypothesisToggle, onHypothesisChange }) => (
    <div className="information-packet-container">
        <div className={`information-packet-window${!hypothesisEnabled ? ' collapsed' : ''}`} id="dt-information-packet-window">
            <div className="window-header">
                <div className="window-left">
                    <label className="window-toggle-label">
                        <input
                            type="checkbox"
                            id="dt-hypothesis-toggle"
                            className="window-toggle-input"
                            checked={hypothesisEnabled}
                            onChange={e => {
                                onHypothesisToggle(e.target.checked);
                                if (!e.target.checked) onHypothesisChange(0);
                            }}
                        />
                        <span className="window-toggle-slider" />
                    </label>
                    <div className="window-title">Information Packet</div>
                </div>
                <div className="window-right">
                    <div className="window-controls">
                        <div className="window-button close" />
                        <div className="window-button minimize" />
                        <div className="window-button maximize" />
                    </div>
                </div>
            </div>
            <div className="window-content" id="dt-information-packet-content">
                <div className="loading-info">
                    {Array.from({ length: 16 }, (_, i) => {
                        const widths = [85, 92, 78, 95, 68, 88, 90, 75, 93, 82, 87, 79, 91, 84, 77, 89];
                        return <div key={i} className="loading-line" style={{ width: `${widths[i]}%` }} />;
                    })}
                </div>
            </div>
        </div>

        {/* Execution agents SVG visualization */}
        <div className="execution-agents-visualization" id="dt-execution-agents-visualization">
            <div className="connection-nodes">
                <svg className="connection-svg" viewBox="0 0 400 40">
                    <defs>
                        <linearGradient id="dtBlueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: 'var(--accent-blue)', stopOpacity: 0.9 }} />
                            <stop offset="100%" style={{ stopColor: 'var(--accent-blue)', stopOpacity: 0.3 }} />
                        </linearGradient>
                    </defs>
                    <circle cx="200" cy="0" r="4" fill="var(--accent-blue)" opacity="1" />
                    {[60, 120, 180, 220, 280, 340].map((x, i) => (
                        <React.Fragment key={i}>
                            <line x1="200" y1="0" x2={x} y2="40" stroke="url(#dtBlueGradient)" strokeWidth="2" opacity={[0.8, 0.7, 0.8, 0.6, 0.7, 0.8][i]} />
                            <circle cx={x} cy="40" r="3" fill="var(--accent-blue)" opacity={[0.6, 0.5, 0.6, 0.4, 0.5, 0.6][i]} />
                        </React.Fragment>
                    ))}
                </svg>
            </div>
            <div className="execution-agents-wrapper">
                <div className="execution-agents-text">Execution &amp; Refinement Agents</div>
            </div>
        </div>

        {/* Hypothesis slider */}
        <div className="hypothesis-slider-card">
            <div className="hypothesis-slider-container" id="dt-hypothesis-slider-container">
                <div className="input-group-tight">
                    <label htmlFor="dt-hypothesis-slider" className="input-label">
                        Hypothesis Count: <span id="dt-hypothesis-value">{hypothesisCount}</span>
                    </label>
                    <SliderWithFill
                        id="dt-hypothesis-slider"
                        value={hypothesisCount > 0 ? hypothesisCount : 1}
                        min={1}
                        max={6}
                        color="var(--accent-blue)"
                        disabled={!hypothesisEnabled}
                        onChange={onHypothesisChange}
                    />
                </div>
            </div>
        </div>
    </div>
);

const RefinementSection: React.FC<{
    refinementEnabled: boolean;
    dissectedObservationsEnabled: boolean;
    iterativeCorrectionsEnabled: boolean;
    iterativeDepth: number;
    provideAllSolutionsEnabled: boolean;
    codeExecutionEnabled: boolean;
    isGeminiProvider: boolean;
    onRefinementToggle: (enabled: boolean) => void;
    onDissectedObservationsToggle: (enabled: boolean) => void;
    onIterativeCorrectionsToggle: (enabled: boolean) => void;
    onIterativeDepthChange: (value: number) => void;
    onProvideAllSolutionsToggle: (enabled: boolean) => void;
    onCodeExecutionToggle: (enabled: boolean) => void;
}> = (props) => {
    const {
        refinementEnabled, dissectedObservationsEnabled, iterativeCorrectionsEnabled,
        iterativeDepth, provideAllSolutionsEnabled, codeExecutionEnabled, isGeminiProvider,
        onRefinementToggle, onDissectedObservationsToggle, onIterativeCorrectionsToggle,
        onIterativeDepthChange, onProvideAllSolutionsToggle, onCodeExecutionToggle,
    } = props;

    const singlePassDisabled = !refinementEnabled || iterativeCorrectionsEnabled;

    return (
        <div className="refinement-options-container">
            <div className="refinement-options-header">
                <span className="material-symbols-outlined">auto_fix_high</span>
                <span>Solution Refinement</span>
            </div>

            {/* Master toggle */}
            <div className="refinement-master-control">
                <label className="toggle-label">
                    <input type="checkbox" id="dt-refinement-toggle" className="toggle-input" checked={refinementEnabled} onChange={e => onRefinementToggle(e.target.checked)} />
                    <span className="toggle-slider" />
                </label>
                <div className="refinement-master-info">
                    <div className="refinement-master-title">Enable Refinements</div>
                    <div className="refinement-master-description">Generates critique for each solution &amp; attempts to correct it</div>
                </div>
            </div>

            {/* Method cards */}
            <div className="refinement-methods">
                <div className="refinement-methods-label">Select Refinement Strategy</div>

                <div className="refinement-methods-row">
                    {/* Synthesis */}
                    <div className={`refinement-method-card${singlePassDisabled ? ' disabled' : ''}`} data-method="synthesis">
                        <div className="method-card-header">
                            <div className="method-card-selector">
                                <input type="checkbox" id="dt-dissected-observations-toggle" className="method-checkbox"
                                    checked={dissectedObservationsEnabled} disabled={singlePassDisabled}
                                    onChange={e => onDissectedObservationsToggle(e.target.checked)} />
                                <label htmlFor="dt-dissected-observations-toggle" className="method-checkbox-label">
                                    <div className="method-checkbox-custom" />
                                </label>
                            </div>
                            <div className="method-card-title">
                                <div className="method-name">Critique Synthesis</div>
                                <div className="method-type">Single Pass</div>
                            </div>
                        </div>
                        <div className="method-card-description">Synthesizes all solution critiques. Cannot use with Iterative Corrections.</div>
                    </div>

                    {/* Full Context */}
                    <div className={`refinement-method-card${singlePassDisabled ? ' disabled' : ''}`} data-method="fullcontext">
                        <div className="method-card-header">
                            <div className="method-card-selector">
                                <input type="checkbox" id="dt-provide-all-solutions-toggle" className="method-checkbox"
                                    checked={provideAllSolutionsEnabled} disabled={singlePassDisabled}
                                    onChange={e => onProvideAllSolutionsToggle(e.target.checked)} />
                                <label htmlFor="dt-provide-all-solutions-toggle" className="method-checkbox-label">
                                    <div className="method-checkbox-custom" />
                                </label>
                            </div>
                            <div className="method-card-title">
                                <div className="method-name">Full Solution Context</div>
                                <div className="method-type">Static Solution Pool</div>
                            </div>
                        </div>
                        <div className="method-card-description">Provides all solutions to correctors. Cannot use with Iterative Corrections.</div>
                    </div>
                </div>

                {/* Iterative */}
                <div className={`refinement-method-card${!refinementEnabled ? ' disabled' : ''}`} data-method="iterative">
                    <div className="method-card-header">
                        <div className="method-card-selector">
                            <input type="checkbox" id="dt-iterative-corrections-toggle" className="method-checkbox"
                                checked={iterativeCorrectionsEnabled} disabled={!refinementEnabled}
                                onChange={e => onIterativeCorrectionsToggle(e.target.checked)} />
                            <label htmlFor="dt-iterative-corrections-toggle" className="method-checkbox-label">
                                <div className="method-checkbox-custom" />
                            </label>
                        </div>
                        <div className="method-card-title">
                            <div className="method-name">Iterative Corrections</div>
                            <div className="method-type">{iterativeDepth} Refinement Loop{iterativeDepth !== 1 ? 's' : ''}</div>
                        </div>
                    </div>
                    <div className="method-card-description">Iterative loop of Corrector &amp; Critique. Disables Synthesis &amp; Full Context options.</div>
                    <div className="iteration-depth-container" style={{ display: iterativeCorrectionsEnabled ? 'block' : 'none', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="input-group-tight">
                            <label htmlFor="dt-iteration-depth-slider" className="input-label">
                                Iteration Depth: <span id="dt-iteration-depth-value">{iterativeDepth}</span>
                            </label>
                            <SliderWithFill
                                id="dt-iteration-depth-slider"
                                value={iterativeDepth}
                                min={1}
                                max={10}
                                color="var(--accent-purple)"
                                onChange={onIterativeDepthChange}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Code Execution */}
            <div className="code-execution-toggle-container" id="dt-code-execution-container" style={{ display: isGeminiProvider ? 'flex' : 'none', marginTop: 12 }}>
                <label className="code-execution-toggle-label">
                    <input type="checkbox" id="dt-code-execution-toggle" className="code-execution-toggle-input"
                        checked={codeExecutionEnabled} onChange={e => onCodeExecutionToggle(e.target.checked)} />
                    <span className="code-execution-toggle-slider" />
                </label>
                <div className="code-execution-toggle-info">
                    <span className="code-execution-toggle-title">Code Execution</span>
                    <span className="code-execution-toggle-subtitle">Python sandbox for agents</span>
                </div>
            </div>
        </div>
    );
};

const QuotaBackoffSection: React.FC<{
    quotaBackoffDurationHours: number;
    quotaConsecutive429Threshold: number;
    quotaAutoResumeEnabled: boolean;
    quotaMaxCyclesPerSession: number;
    onQuotaBackoffDurationChange: (hours: number) => void;
    onQuotaConsecutive429ThresholdChange: (threshold: number) => void;
    onQuotaAutoResumeToggle: (enabled: boolean) => void;
    onQuotaMaxCyclesPerSessionChange: (max: number) => void;
}> = (props) => {
    const {
        quotaBackoffDurationHours, quotaConsecutive429Threshold,
        quotaAutoResumeEnabled, quotaMaxCyclesPerSession,
        onQuotaBackoffDurationChange, onQuotaConsecutive429ThresholdChange,
        onQuotaAutoResumeToggle, onQuotaMaxCyclesPerSessionChange,
    } = props;

    return (
        <div className="quota-backoff-container">
            <div className="quota-backoff-header">
                <span className="material-symbols-outlined">schedule</span>
                <span>Quota Backoff</span>
            </div>
            <div className="quota-backoff-card">
                {/* Backoff Duration */}
                <div className="quota-backoff-section">
                    <div className="input-group-tight">
                        <label htmlFor="dt-quota-backoff-duration" className="input-label">
                            Backoff Duration (hours from now)
                        </label>
                        <input
                            type="number"
                            id="dt-quota-backoff-duration"
                            className="quota-time-input"
                            value={quotaBackoffDurationHours || ''}
                            placeholder="e.g. 2"
                            min={0}
                            max={168}
                            step={0.5}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                onQuotaBackoffDurationChange(isNaN(v) ? 0 : v);
                            }}
                        />
                    </div>
                </div>

                {/* Consecutive 429 Threshold Slider */}
                <div className="quota-backoff-section">
                    <div className="input-group-tight">
                        <label htmlFor="dt-quota-429-threshold-slider" className="input-label">
                            Consecutive 429 Threshold: <span>{quotaConsecutive429Threshold}</span>
                        </label>
                        <SliderWithFill
                            id="dt-quota-429-threshold-slider"
                            value={quotaConsecutive429Threshold}
                            min={1}
                            max={10}
                            color="#e8a96b"
                            onChange={onQuotaConsecutive429ThresholdChange}
                        />
                    </div>
                </div>

                {/* Max Cycles Per Session Slider */}
                <div className="quota-backoff-section">
                    <div className="input-group-tight">
                        <label htmlFor="dt-quota-max-cycles-slider" className="input-label">
                            Max Cycles Per Session: <span>{quotaMaxCyclesPerSession}</span>
                        </label>
                        <SliderWithFill
                            id="dt-quota-max-cycles-slider"
                            value={quotaMaxCyclesPerSession}
                            min={1}
                            max={20}
                            color="#e8a96b"
                            onChange={onQuotaMaxCyclesPerSessionChange}
                        />
                    </div>
                </div>

                {/* Auto-Resume Toggle */}
                <div className="quota-backoff-section">
                    <div className="quota-toggle-row">
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                id="dt-quota-auto-resume-toggle"
                                className="toggle-input"
                                checked={quotaAutoResumeEnabled}
                                onChange={e => onQuotaAutoResumeToggle(e.target.checked)}
                            />
                            <span className="toggle-slider" />
                        </label>
                        <span className="quota-toggle-text">Auto-Resume After Quota Reset</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Main Config Panel Component
// ═══════════════════════════════════════════════════════════════════════

export const DeepthinkConfigPanelComponent: React.FC<DeepthinkConfigPanelProps> = (props) => (
    <div className="deepthink-config-panel">
        <div className="deepthink-config-scroll-container">
            {/* Top Row: Strategy Execution + Red Team */}
            <div className="config-row-container">
                <div className="config-row-inner">
                    <StrategyExecutionSection
                        strategiesCount={props.strategiesCount}
                        subStrategiesCount={props.subStrategiesCount}
                        iterativeCorrectionsEnabled={props.iterativeCorrectionsEnabled}
                        onStrategiesChange={props.onStrategiesChange}
                        onSubStrategiesChange={props.onSubStrategiesChange}
                        onSkipSubStrategiesToggle={props.onSkipSubStrategiesToggle}
                    />
                    <RedTeamSection
                        redTeamMode={props.redTeamMode}
                        postQualityFilterEnabled={props.postQualityFilterEnabled}
                        iterativeCorrectionsEnabled={props.iterativeCorrectionsEnabled}
                        onRedTeamModeChange={props.onRedTeamModeChange}
                        onPostQualityFilterToggle={props.onPostQualityFilterToggle}
                    />
                </div>
            </div>

            {/* Bottom Row: Information Packet + Refinement */}
            <div className="config-row-container">
                <div className="config-row-inner">
                    <InformationPacketSection
                        hypothesisEnabled={props.hypothesisEnabled}
                        hypothesisCount={props.hypothesisCount}
                        onHypothesisToggle={props.onHypothesisToggle}
                        onHypothesisChange={props.onHypothesisChange}
                    />
                    <RefinementSection
                        refinementEnabled={props.refinementEnabled}
                        dissectedObservationsEnabled={props.dissectedObservationsEnabled}
                        iterativeCorrectionsEnabled={props.iterativeCorrectionsEnabled}
                        iterativeDepth={props.iterativeDepth}
                        provideAllSolutionsEnabled={props.provideAllSolutionsEnabled}
                        codeExecutionEnabled={props.codeExecutionEnabled}
                        isGeminiProvider={props.isGeminiProvider}
                        onRefinementToggle={props.onRefinementToggle}
                        onDissectedObservationsToggle={props.onDissectedObservationsToggle}
                        onIterativeCorrectionsToggle={props.onIterativeCorrectionsToggle}
                        onIterativeDepthChange={props.onIterativeDepthChange}
                        onProvideAllSolutionsToggle={props.onProvideAllSolutionsToggle}
                        onCodeExecutionToggle={props.onCodeExecutionToggle}
                    />
                </div>
            </div>

            {/* Quota Backoff Row */}
            <div className="config-row-container">
                <div className="config-row-inner">
                    <QuotaBackoffSection
                        quotaBackoffDurationHours={props.quotaBackoffDurationHours}
                        quotaConsecutive429Threshold={props.quotaConsecutive429Threshold}
                        quotaAutoResumeEnabled={props.quotaAutoResumeEnabled}
                        quotaMaxCyclesPerSession={props.quotaMaxCyclesPerSession}
                        onQuotaBackoffDurationChange={props.onQuotaBackoffDurationChange}
                        onQuotaConsecutive429ThresholdChange={props.onQuotaConsecutive429ThresholdChange}
                        onQuotaAutoResumeToggle={props.onQuotaAutoResumeToggle}
                        onQuotaMaxCyclesPerSessionChange={props.onQuotaMaxCyclesPerSessionChange}
                    />
                </div>
            </div>
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════
// Controller Bridge & Mounting
// ═══════════════════════════════════════════════════════════════════════

function deriveProps(controller: ReturnType<typeof getDeepthinkConfigController>): DeepthinkConfigPanelProps {
    const s = controller.getState();
    return {
        ...s,
        isGeminiProvider: true, // simplified for now, assuming gemini provider as per original logic
        onStrategiesChange: v => controller.setStrategiesCount(v),
        onSubStrategiesChange: v => controller.setSubStrategiesCount(v),
        onHypothesisChange: v => controller.setHypothesisCount(v),
        onSkipSubStrategiesToggle: v => controller.setSkipSubStrategies(v),
        onHypothesisToggle: v => controller.setHypothesisEnabled(v),
        onRedTeamModeChange: v => controller.setRedTeamMode(v),
        onPostQualityFilterToggle: v => controller.setPostQualityFilterEnabled(v),
        onRefinementToggle: v => controller.setRefinementEnabled(v),
        onDissectedObservationsToggle: v => controller.setDissectedObservationsEnabled(v),
        onIterativeCorrectionsToggle: v => controller.setIterativeCorrectionsEnabled(v),
        onIterativeDepthChange: v => controller.setIterativeDepth(v),
        onProvideAllSolutionsToggle: v => controller.setProvideAllSolutionsEnabled(v),
        onCodeExecutionToggle: v => controller.setCodeExecutionEnabled(v),
        onQuotaBackoffDurationChange: v => controller.setQuotaBackoffDurationHours(v),
        onQuotaConsecutive429ThresholdChange: v => controller.setQuotaConsecutive429Threshold(v),
        onQuotaAutoResumeToggle: v => controller.setQuotaAutoResumeEnabled(v),
        onQuotaMaxCyclesPerSessionChange: v => controller.setQuotaMaxCyclesPerSession(v),
    };
}

let configPanelRoot: Root | null = null;
let configPanelContainerNode: HTMLElement | null = null;

function renderPanel(controller: ReturnType<typeof getDeepthinkConfigController>): void {
    if (configPanelRoot) {
        configPanelRoot.render(React.createElement(DeepthinkConfigPanelComponent, deriveProps(controller)));
    }
}

/**
 * Renders the Deepthink config panel into the given container.
 * Subscribes to the controller's state changes and re-renders automatically.
 */
export function renderDeepthinkConfigPanelInContainer(pipelinesContentContainer: HTMLElement): void {
    if (!pipelinesContentContainer) return;

    const controller = getDeepthinkConfigController();

    // Hide main header for edge-to-edge config panel
    const mainHeaderContent = document.querySelector('.main-header-content') as HTMLElement;
    if (mainHeaderContent) mainHeaderContent.style.display = 'none';

    // Disable sidebar collapse button
    const sidebarCollapseButton = document.getElementById('sidebar-collapse-button') as HTMLButtonElement;
    if (sidebarCollapseButton) {
        sidebarCollapseButton.disabled = true;
        sidebarCollapseButton.style.opacity = '0.3';
        sidebarCollapseButton.style.cursor = 'not-allowed';
        sidebarCollapseButton.title = 'Sidebar collapse disabled in config view';
    }

    // Unmount explicitly if the DOM node was wiped by the AppRouter
    if (configPanelRoot && configPanelContainerNode && !document.contains(configPanelContainerNode)) {
        const rootToUnmount = configPanelRoot;
        setTimeout(() => {
            rootToUnmount.unmount();
        }, 0);
        configPanelRoot = null;
        configPanelContainerNode = null;
    }

    if (!configPanelRoot) {
        pipelinesContentContainer.innerHTML = '';
        configPanelContainerNode = document.createElement('div');
        configPanelContainerNode.className = 'deepthink-config-react-root';
        pipelinesContentContainer.appendChild(configPanelContainerNode);

        configPanelRoot = createRoot(configPanelContainerNode);
    }

    // Mount or update React component
    renderPanel(controller);

    // Subscribe to controller state changes
    const onConfigChange = (_e: Event) => {
        renderPanel(controller);
    };

    controller.addEventListener('configchange', onConfigChange);

    // Store cleanup function on the container for later removal
    (pipelinesContentContainer as any).__deepthinkConfigCleanup = () => {
        controller.removeEventListener('configchange', onConfigChange);
        if (configPanelRoot) {
            const rootToUnmount = configPanelRoot;
            configPanelRoot = null;
            setTimeout(() => {
                rootToUnmount.unmount();
            }, 0);
        }
    };
}

export { renderDeepthinkConfigPanelInContainer as renderDeepthinkConfigPanel };
export default DeepthinkConfigPanelComponent;
