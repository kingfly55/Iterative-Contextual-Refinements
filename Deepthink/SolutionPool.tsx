/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SolutionPool — React components for rendering solution pool UI.
 * All data management logic lives in SolutionPool.ts.
 */

import React, { useState, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
    DeepthinkPipelineState,
    getActiveDeepthinkPipeline,
} from './DeepthinkCore';
import {
    SolutionPoolParsedSolution,
    SolutionPoolParsedResponse,
    AtomicGroup,
    extractAtomicGroups,
    computeIterationCount,
} from './SolutionPool';
import RenderMathMarkdown from '../Styles/Components/RenderMathMarkdown';

// @ts-ignore — CSS module import handled by Vite
import './SolutionPool.css';

// ═══════════════════════════════════════════════════════════════════════
// Shared Sub-components
// ═══════════════════════════════════════════════════════════════════════

const MaterialIcon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
    <span className={`material-symbols-outlined${className ? ` ${className}` : ''}`}>{name}</span>
);

const Collapsible: React.FC<{
    toggleClassName: string;
    icon: string;
    label: string;
    children: React.ReactNode;
}> = ({ toggleClassName, icon, label, children }) => {
    const [collapsed, setCollapsed] = useState(true);
    return (
        <>
            <button className={toggleClassName} onClick={() => setCollapsed(c => !c)}>
                <MaterialIcon name={icon} />
                {label}
                <MaterialIcon name={collapsed ? 'expand_more' : 'expand_less'} className="sp-critique-chevron" />
            </button>
            <div className={`sp-critique-body${collapsed ? ' sp-collapsed' : ''}`}>
                {children}
            </div>
        </>
    );
};

const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
    const level = confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low';
    return <span className={`sp-confidence-badge ${level}`}>{(confidence * 100).toFixed(0)}%</span>;
};

// ═══════════════════════════════════════════════════════════════════════
// Solution Card
// ═══════════════════════════════════════════════════════════════════════

const SolutionCard: React.FC<{ solution: SolutionPoolParsedSolution; index: number }> = ({ solution, index }) => (
    <div className="sp-solution-card" style={{ animationDelay: `${index * 0.06}s` }}>
        <div className="sp-card-header">
            <span className="sp-card-number">{index + 1}</span>
            <h3 className="sp-card-title">{solution.title || `Solution ${index + 1}`}</h3>
            <ConfidenceBadge confidence={solution.confidence} />
        </div>

        {solution.approach_summary && (
            <p className="sp-approach-summary">{solution.approach_summary}</p>
        )}

        <div className="sp-card-content-wrapper">
            <RenderMathMarkdown content={solution.content || ''} className="sp-card-content" />
        </div>

        {solution.atomic_reconstruction && (
            <Collapsible toggleClassName="sp-critique-toggle sp-atomic-toggle" icon="fingerprint" label="Atomic Reconstruction">
                <RenderMathMarkdown content={solution.atomic_reconstruction} className="sp-atomic-body" />
            </Collapsible>
        )}

        {solution.internal_critique && (
            <Collapsible toggleClassName="sp-critique-toggle" icon="psychology_alt" label="Internal Critique">
                <RenderMathMarkdown content={solution.internal_critique} />
            </Collapsible>
        )}
    </div>
);

const RawTextFallback: React.FC<{ content: string }> = ({ content }) => (
    <div className="sp-raw-fallback">
        <div className="sp-raw-notice">
            <MaterialIcon name="info" />
            <span>Pool response could not be parsed as structured JSON. Showing raw content.</span>
        </div>
        <pre className="sp-raw-content">{content}</pre>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════
// Full-Screen Panel Shell
// ═══════════════════════════════════════════════════════════════════════

const SolutionPoolPanel: React.FC<{
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}> = ({ title, onClose, children }) => {
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div className="sp-fullscreen-overlay sp-visible" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="sp-fullscreen-panel">
                <div className="sp-fullscreen-header">
                    <div className="sp-fullscreen-header-left">
                        <MaterialIcon name="workspaces" className="sp-header-icon" />
                        <h2 className="sp-fullscreen-title">{title}</h2>
                    </div>
                    <button className="sp-close-btn" onClick={onClose}>
                        <MaterialIcon name="close" />
                    </button>
                </div>
                <div className="sp-fullscreen-body custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
// Solution Pool Modal (per-strategy)
// ═══════════════════════════════════════════════════════════════════════

const SolutionPoolModalContent: React.FC<{
    poolAgent: { poolResponse?: string; parsedPoolResponse?: SolutionPoolParsedResponse };
}> = ({ poolAgent }) => {
    const parsed = poolAgent.parsedPoolResponse;

    if (parsed && parsed.solutions.length > 0) {
        return (
            <div className="sp-cards-grid">
                {parsed.solutions.map((s, i) => <SolutionCard key={i} solution={s} index={i} />)}
            </div>
        );
    }

    // Fallback: try re-parsing raw response
    if (poolAgent.poolResponse) {
        try {
            const data = JSON.parse(poolAgent.poolResponse);
            if (data && Array.isArray(data.solutions)) {
                return (
                    <div className="sp-cards-grid">
                        {data.solutions.map((s: any, i: number) => (
                            <SolutionCard key={i} index={i} solution={{
                                title: s.title || `Solution ${i + 1}`,
                                approach_summary: s.approach_summary || '',
                                content: s.content || '',
                                confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
                                internal_critique: s.internal_critique || '',
                            }} />
                        ))}
                    </div>
                );
            }
        } catch { /* fall through */ }
        return <RawTextFallback content={poolAgent.poolResponse} />;
    }

    return <RawTextFallback content="No pool data available." />;
};

// ═══════════════════════════════════════════════════════════════════════
// Full Repository View (Current Solution Pool)
// ═══════════════════════════════════════════════════════════════════════

const TimelineSection: React.FC<{ content: string; className: string }> = ({ content, className }) => (
    <div className={`sp-timeline-section ${className}`}>
        <RenderMathMarkdown content={content} className="sp-timeline-section-content" />
    </div>
);

const PoolLabel: React.FC<{ icon: string; text: string; className?: string }> = ({ icon, text, className = 'sp-pool-label' }) => (
    <div className={className}>
        <MaterialIcon name={icon} /> {text}
    </div>
);

const AtomicList: React.FC<{ groups: AtomicGroup[] }> = ({ groups }) => (
    <div className="sp-atomic-list">
        {groups.map((group, gi) => (
            <div key={gi} className="sp-atomic-iteration-group">
                <div className="sp-atomic-iteration-title">{group.iterationTitle}</div>
                {group.atomics.map((item, ai) => (
                    <div key={ai} className="sp-atomic-entry">
                        <div className="sp-atomic-entry-header">
                            <span className="sp-atomic-entry-title">{item.title}</span>
                            <ConfidenceBadge confidence={item.confidence} />
                        </div>
                        <RenderMathMarkdown content={item.reconstruction} className="sp-atomic-entry-text" />
                    </div>
                ))}
            </div>
        ))}
    </div>
);

const StrategySection: React.FC<{
    strategy: any;
    stratIdx: number;
    pipelineId: string;
}> = ({ strategy, stratIdx, pipelineId }) => {
    const strategyText = strategy.strategy_text || '';
    const subtitle = strategyText.length > 120 ? strategyText.slice(0, 120) + '…' : strategyText;

    const parsedPool: SolutionPoolParsedResponse | null =
        strategy.solution_pool && typeof strategy.solution_pool === 'object' && strategy.solution_pool.solutions
            ? strategy.solution_pool
            : null;

    const atomicGroups = extractAtomicGroups(pipelineId, strategy.strategy_id, parsedPool);

    const firstCritique = strategy.iterations?.[0]?.critique;
    const lastIteration = strategy.iterations?.[strategy.iterations.length - 1];
    const latestCritique = strategy.latest_critique || lastIteration?.critique;

    return (
        <div className="sp-strategy-section" style={{ animationDelay: `${stratIdx * 0.08}s` }}>
            <div className="sp-strategy-section-header">
                <MaterialIcon name="deployed_code" />
                <h3>{strategy.strategy_id?.toUpperCase() || `Strategy ${stratIdx + 1}`}</h3>
                {strategyText && <span className="sp-strategy-subtitle">{subtitle}</span>}
            </div>

            {/* 1. Original solution */}
            {strategy.original_solution && (
                <>
                    <PoolLabel icon="code" text="Original Executed Solution" className="sp-pool-label sp-original-label" />
                    <TimelineSection content={strategy.original_solution} className="sp-timeline-corrected" />
                </>
            )}

            {/* 2. First critique */}
            {firstCritique && (
                <>
                    <PoolLabel icon="rate_review" text="Initial Critique" className="sp-pool-label sp-critique-label" />
                    <TimelineSection content={firstCritique} className="sp-timeline-critique" />
                </>
            )}

            {/* 3. Atomic reconstructions */}
            {atomicGroups.length > 0 && (
                <>
                    <PoolLabel icon="fingerprint" text="Atomic Reconstructions" className="sp-pool-label sp-atomic-label" />
                    <AtomicList groups={atomicGroups} />
                </>
            )}

            {/* 4. Compressed iterations banner */}
            {strategy.compressed_iterations_note && (
                <div className="sp-compressed-banner">
                    <MaterialIcon name="compress" />
                    <span>{strategy.compressed_iterations_note}</span>
                </div>
            )}

            {/* 5. Latest correction */}
            {lastIteration?.corrected_solution && (
                <>
                    <PoolLabel icon="auto_fix_high" text="Latest Correction" className="sp-pool-label sp-corrected-label" />
                    <TimelineSection content={lastIteration.corrected_solution} className="sp-timeline-corrected" />
                </>
            )}

            {/* 6. Latest critique */}
            {latestCritique && latestCritique !== firstCritique && (
                <>
                    <PoolLabel icon="rate_review" text="Latest Critique" className="sp-pool-label sp-critique-label" />
                    <TimelineSection content={latestCritique} className="sp-timeline-critique" />
                </>
            )}

            {/* 7. Full solution pool cards */}
            {parsedPool?.solutions ? (
                <>
                    <PoolLabel icon="auto_awesome" text="Solution Pool" />
                    <div className="sp-cards-grid">
                        {parsedPool.solutions.map((s, i) => <SolutionCard key={i} solution={s} index={i} />)}
                    </div>
                </>
            ) : typeof strategy.solution_pool === 'string' ? (
                <RawTextFallback content={strategy.solution_pool} />
            ) : null}
        </div>
    );
};

const CurrentSolutionPoolContent: React.FC<{ pipelineId: string; poolJson: string }> = ({ pipelineId, poolJson }) => {
    try {
        const poolData = JSON.parse(poolJson);
        if (poolData && Array.isArray(poolData.strategies)) {
            return (
                <>
                    {poolData.strategies.map((strategy: any, idx: number) => (
                        <StrategySection key={idx} strategy={strategy} stratIdx={idx} pipelineId={pipelineId} />
                    ))}
                </>
            );
        }
        return <RawTextFallback content={poolJson} />;
    } catch {
        return <RawTextFallback content={poolJson} />;
    }
};

// ═══════════════════════════════════════════════════════════════════════
// Solution Pool Tab Content (iteration grid shown in the main tab)
// ═══════════════════════════════════════════════════════════════════════

export const SolutionPoolTabContent: React.FC<{ process: DeepthinkPipelineState }> = ({ process }) => {
    if (!process.structuredSolutionPoolEnabled) {
        return (
            <div className="solution-pool-container">
                <SolutionPoolHeader processId={process.id} />
                <div className="solution-pool-disabled-state">
                    <span className="material-symbols-outlined disabled-icon">block</span>
                    <h4>Structured Solution Pool Disabled</h4>
                    <p>This feature is currently disabled for this session.</p>
                    <p className="disabled-hint">Enable "Iterative Corrections" in settings to use this feature.</p>
                </div>
            </div>
        );
    }

    if (!process.structuredSolutionPool?.trim()) {
        return (
            <div className="solution-pool-container">
                <SolutionPoolHeader processId={process.id} />
                <div className="solution-pool-empty-state">
                    <span className="material-symbols-outlined empty-icon">pending</span>
                    <h4>Pool Initializing</h4>
                    <p>Waiting for initial solutions to be generated...</p>
                </div>
            </div>
        );
    }

    const poolAgents = process.structuredSolutionPoolAgents || [];
    const survivingStrategies = process.initialStrategies.filter(s => !s.isKilledByRedTeam);
    const iterationCount = computeIterationCount(process);

    return (
        <div className="solution-pool-container">
            <SolutionPoolHeader processId={process.id} />
            <div className="solution-pool-content-wrapper">
                {Array.from({ length: iterationCount }, (_, i) => i + 1).map(iteration => (
                    <div key={iteration} className="pool-iteration-container">
                        <div className="pool-iteration-header">
                            <h4 className="pool-iteration-title">Iteration {iteration}</h4>
                        </div>
                        <div className="pool-iteration-content">
                            <div className="red-team-agents-grid">
                                {survivingStrategies.map(strategy => {
                                    const poolAgent = poolAgents.find(a => a.mainStrategyId === strategy.id);
                                    const hasPoolResponse = !!(poolAgent?.poolResponse?.trim());
                                    const isError = poolAgent?.status === 'error';
                                    const critiquesCount = process.solutionCritiques.filter(c => c.mainStrategyId === strategy.id).length;
                                    const hasPool = iteration <= critiquesCount && hasPoolResponse;
                                    const solutionCount = poolAgent?.parsedPoolResponse?.solutions?.length;

                                    return (
                                        <div key={strategy.id} className={`red-team-agent-card${!hasPool ? ' pool-pending' : ''}`}>
                                            <div className="red-team-agent-header">
                                                <h4 className="red-team-agent-title">{strategy.id.toUpperCase()}</h4>
                                                {hasPool
                                                    ? <span className="status-badge status-completed">Available</span>
                                                    : isError
                                                        ? <span className="status-badge status-error">Error</span>
                                                        : <span className="status-badge status-pending">Pending</span>}
                                            </div>
                                            <div className="red-team-results">
                                                {hasPool ? (
                                                    <>
                                                        {solutionCount && <span className="sp-count-badge">{solutionCount} solutions</span>}
                                                        <button
                                                            className="view-argument-button view-pool-button"
                                                            data-strategy-id={strategy.id}
                                                            data-iteration={iteration}
                                                        >
                                                            <MaterialIcon name="visibility" /> View Solution Pool
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="pool-empty-state-mini">
                                                        <MaterialIcon name="hourglass_empty" />
                                                        <span>{isError ? 'Failed' : 'Processing...'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SolutionPoolHeader: React.FC<{ processId: string }> = ({ processId }) => (
    <div className="solution-pool-header">
        <div className="solution-pool-header-left">
            <span className="material-symbols-outlined solution-pool-icon">workspaces</span>
            <div className="solution-pool-title-group">
                <h3 className="solution-pool-title">Structured Solution Pool</h3>
                <p className="solution-pool-subtitle">Cross-strategy collaborative solution repository</p>
            </div>
        </div>
        <div className="solution-pool-header-buttons">
            <button className="solution-pool-current-button" data-pipeline-id={processId}>
                <MaterialIcon name="database" /> Current Pool
            </button>
            <button className="solution-pool-download-button" data-pipeline-id={processId}>
                <MaterialIcon name="download" /> Download Pool (JSON)
            </button>
            <button className="solution-pool-evolution-button" data-pipeline-id={processId}>
                <MaterialIcon name="timeline" /> View Evolution
            </button>
        </div>
    </div>
);

// ═══════════════════════════════════════════════════════════════════════
// Imperative Mount Functions (called from Deepthink.ts event handlers)
// ═══════════════════════════════════════════════════════════════════════

let panelRoot: Root | null = null;

function unmountPanel(): void {
    if (panelRoot) {
        const rootToUnmount = panelRoot;
        panelRoot = null;
        // Schedule unmount to avoid React 18 synchronous unmount race condition from within event handlers
        setTimeout(() => {
            rootToUnmount.unmount();
        }, 0);
    }
}

export function openSolutionPoolModal(strategyId: string, iteration: number): void {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline) return;

    const poolAgent = pipeline.structuredSolutionPoolAgents?.find(a => a.mainStrategyId === strategyId);
    if (!poolAgent?.poolResponse) {
        alert('No solution pool available for this strategy.');
        return;
    }

    const title = `${strategyId.toUpperCase()} — Iteration ${iteration} • Solution Pool`;
    const container = document.createElement('div');
    document.body.appendChild(container);
    unmountPanel();
    panelRoot = createRoot(container);

    const handleClose = () => {
        unmountPanel();
        container.remove();
    };

    panelRoot.render(
        <SolutionPoolPanel title={title} onClose={handleClose}>
            <SolutionPoolModalContent poolAgent={poolAgent} />
        </SolutionPoolPanel>
    );
}

export function openCurrentSolutionPool(pipelineId: string): void {
    const pipeline = getActiveDeepthinkPipeline();
    if (!pipeline || pipeline.id !== pipelineId) {
        alert('Pipeline not found.');
        return;
    }
    if (!pipeline.structuredSolutionPool?.trim()) {
        alert('No solution pool content available yet. The pool is still initializing.');
        return;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    unmountPanel();
    panelRoot = createRoot(container);

    const handleClose = () => {
        unmountPanel();
        container.remove();
    };

    panelRoot.render(
        <SolutionPoolPanel title="Solution Pool Repository" onClose={handleClose}>
            <CurrentSolutionPoolContent pipelineId={pipelineId} poolJson={pipeline.structuredSolutionPool} />
        </SolutionPoolPanel>
    );
}


