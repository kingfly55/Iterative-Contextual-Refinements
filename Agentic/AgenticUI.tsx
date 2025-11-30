/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AgenticState, AgenticMessage } from './AgenticCore';
import { renderMathContent } from '../Components/RenderMathMarkdown';
import { FaRobot, FaUser, FaCheckCircle, FaExclamationTriangle, FaStop, FaCalendarAlt, FaTag, FaFilePdf, FaExternalLinkAlt, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { MdVerifiedUser } from 'react-icons/md';
import { IoMdPaper } from 'react-icons/io';
import * as Diff from 'diff';

interface AgenticUIProps {
    state: AgenticState;
    onStop?: () => void;
}

// Track multi-edit expansion state per message block across re-renders
const multiEditExpansionState = new Map<string, boolean>();

// Helper functions for Deepthink agent tools
function isDeepthinkAgentTool(toolName: string): boolean {
    const deepthinkTools = [
        'GenerateStrategies',
        'GenerateHypotheses',
        'TestHypotheses',
        'ExecuteStrategies',
        'SolutionCritique',
        'CorrectedSolutions',
        'SelectBestSolution'
    ];
    return deepthinkTools.includes(toolName);
}

function getDeepthinkAgentDisplayName(toolName: string): string {
    const mapping: Record<string, string> = {
        'GenerateStrategies': 'Strategy Generation Agent',
        'GenerateHypotheses': 'Hypothesis Generation Agent',
        'TestHypotheses': 'Hypothesis Testing Agent',
        'ExecuteStrategies': 'Strategy Execution Agent',
        'SolutionCritique': 'Solution Critique Agent',
        'CorrectedSolutions': 'Solution Correction Agent',
        'SelectBestSolution': 'Final Judge Agent'
    };
    return mapping[toolName] || toolName;
}

function getToolResultSummary(toolName: string, result: string): string {
    // Extract meaningful counts from the actual results
    switch (toolName) {
        case 'GenerateStrategies': {
            const strategyMatches = result.match(/<Strategy ID: strategy-\d+-\d+>/g);
            const count = strategyMatches ? strategyMatches.length : 0;
            return count > 0 ? `Generated ${count} strategic ${count === 1 ? 'approach' : 'approaches'}` : 'Generated strategic approaches';
        }
        case 'GenerateHypotheses': {
            const hypothesisMatches = result.match(/<Hypothesis ID: hypothesis-\d+-\d+>/g);
            const count = hypothesisMatches ? hypothesisMatches.length : 0;
            return count > 0 ? `Created ${count} ${count === 1 ? 'hypothesis' : 'hypotheses'}` : 'Created hypotheses for testing';
        }
        case 'TestHypotheses': {
            const testMatches = result.match(/<hypothesis-\d+-\d+>/g);
            const count = testMatches ? testMatches.length : 0;
            return count > 0 ? `Evaluated ${count} ${count === 1 ? 'hypothesis' : 'hypotheses'}` : 'Evaluated hypotheses and gathered evidence';
        }
        case 'ExecuteStrategies': {
            const executionMatches = result.match(/<Execution ID: execution-strategy-\d+-\d+>/g);
            const count = executionMatches ? executionMatches.length : 0;
            return count > 0 ? `Executed ${count} ${count === 1 ? 'strategy' : 'strategies'} and generated solutions` : 'Executed strategies';
        }
        case 'SolutionCritique': {
            return 'Analyzed and critiqued proposed solutions';
        }
        case 'CorrectedSolutions': {
            const correctedMatches = result.match(/<execution-strategy-\d+-\d+:Corrected>/g);
            const count = correctedMatches ? correctedMatches.length : 0;
            return count > 0 ? `Refined ${count} ${count === 1 ? 'solution' : 'solutions'} based on feedback` : 'Refined solutions';
        }
        case 'SelectBestSolution': {
            return 'Selected optimal solution from candidates';
        }
        default:
            return 'Tool execution completed';
    }
}

// Component for rendering a single message (exported for reuse)
export const MessageCard: React.FC<{ message: AgenticMessage }> = ({ message }) => {
    const getMessageIcon = () => {
        switch (message.role) {
            case 'agent': return <FaRobot />;
            case 'system': return message.status === 'error' ? <FaExclamationTriangle /> : <FaCheckCircle />;
            case 'user': return <FaUser />;
            default: return <FaUser />;
        }
    };

    const getMessageClass = () => {
        let baseClass = 'agentic-message-card';
        if (message.role === 'system') {
            baseClass += message.status === 'error' ? ' system-error' : ' system-success';
        } else {
            baseClass += ` ${message.role}-message`;
        }
        return baseClass;
    };

    // Component for rendering arXiv search results
    const ArxivSearchResults: React.FC<{ result: string }> = ({ result }) => {
        const [expandedPapers, setExpandedPapers] = React.useState<Set<number>>(new Set());

        // Parse the search results
        const lines = result.split('\n');
        const papers: Array<{
            index: number;
            title: string;
            authors: string;
            published: string;
            categories: string;
            abstract: string;
            pdfUrl: string;
            arxivUrl: string;
            arxivId: string;
            journalRef?: string;
            doi?: string;
        }> = [];

        let currentPaper: any = null;
        let inAbstract = false;
        let abstractLines: string[] = [];

        for (const line of lines) {
            if (line.startsWith('[Paper ')) {
                if (currentPaper && abstractLines.length > 0) {
                    currentPaper.abstract = abstractLines.join(' ').trim();
                }
                const match = line.match(/\[Paper (\d+)\]/);
                if (match) {
                    currentPaper = { index: parseInt(match[1]) };
                    papers.push(currentPaper);
                    inAbstract = false;
                    abstractLines = [];
                }
            } else if (currentPaper) {
                if (line.startsWith('Title:')) {
                    currentPaper.title = line.substring(6).trim();
                } else if (line.startsWith('Authors:')) {
                    currentPaper.authors = line.substring(8).trim();
                } else if (line.startsWith('Published:')) {
                    currentPaper.published = line.substring(10).trim();
                } else if (line.startsWith('Categories:')) {
                    currentPaper.categories = line.substring(11).trim();
                } else if (line.startsWith('Journal Reference:')) {
                    currentPaper.journalRef = line.substring(18).trim();
                } else if (line.startsWith('DOI:')) {
                    currentPaper.doi = line.substring(4).trim();
                } else if (line.startsWith('arXiv ID:')) {
                    currentPaper.arxivId = line.substring(9).trim();
                } else if (line.startsWith('PDF:')) {
                    currentPaper.pdfUrl = line.substring(4).trim();
                } else if (line.startsWith('URL:')) {
                    currentPaper.arxivUrl = line.substring(4).trim();
                } else if (line === 'Abstract:') {
                    inAbstract = true;
                    abstractLines = [];
                } else if (inAbstract && line !== '' && !line.startsWith('=')) {
                    abstractLines.push(line);
                }
            }
        }

        // Capture the last paper's abstract
        if (currentPaper && abstractLines.length > 0) {
            currentPaper.abstract = abstractLines.join(' ').trim();
        }

        const togglePaper = (index: number) => {
            const newExpanded = new Set(expandedPapers);
            if (newExpanded.has(index)) {
                newExpanded.delete(index);
            } else {
                newExpanded.add(index);
            }
            setExpandedPapers(newExpanded);
        };

        const headerMatch = result.match(/^Found (\d+) papers/);
        const totalCount = headerMatch ? headerMatch[1] : papers.length;

        return (
            <div className="arxiv-search-results">
                <div className="arxiv-header">
                    <IoMdPaper className="arxiv-icon" />
                    <span>arXiv Search Results</span>
                    <span className="result-count">{totalCount} papers found</span>
                </div>
                <div className="arxiv-papers-list">
                    {papers.map((paper) => (
                        <div key={paper.index} className="arxiv-paper-card">
                            <div className="paper-header" onClick={() => togglePaper(paper.index)}>
                                <div className="paper-title-section">
                                    <h3 className="paper-title">{paper.title}</h3>
                                    <div className="paper-authors">{paper.authors}</div>
                                    <div className="paper-meta">
                                        <span className="paper-date">
                                            <FaCalendarAlt className="meta-icon" />
                                            {paper.published}
                                        </span>
                                        <span className="paper-categories">
                                            <FaTag className="meta-icon" />
                                            {paper.categories}
                                        </span>
                                    </div>
                                </div>
                                <button className="expand-btn">
                                    {expandedPapers.has(paper.index) ? <FaChevronDown /> : <FaChevronRight />}
                                </button>
                            </div>
                            {expandedPapers.has(paper.index) && (
                                <div className="paper-details">
                                    <div className="paper-abstract">
                                        <h4>Abstract</h4>
                                        <p>{paper.abstract}</p>
                                    </div>
                                    {paper.journalRef && (
                                        <div className="paper-ref">
                                            <strong>Journal Reference:</strong> {paper.journalRef}
                                        </div>
                                    )}
                                    {paper.doi && (
                                        <div className="paper-doi">
                                            <strong>DOI:</strong> {paper.doi}
                                        </div>
                                    )}
                                    <div className="paper-links">
                                        <a href={paper.pdfUrl} target="_blank" rel="noopener noreferrer" className="paper-link pdf-link">
                                            <FaFilePdf className="link-icon" />
                                            PDF
                                        </a>
                                        <a href={paper.arxivUrl} target="_blank" rel="noopener noreferrer" className="paper-link arxiv-link">
                                            <FaExternalLinkAlt className="link-icon" />
                                            arXiv Page
                                        </a>
                                        <span className="paper-id">ID: {paper.arxivId}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Expandable card for multi_edit tool results
    const MultiEditResultCard: React.FC<{ result: string; cacheKey: string }> = ({ result, cacheKey }) => {
        const [expanded, setExpanded] = React.useState(() => multiEditExpansionState.get(cacheKey) ?? false);

        React.useEffect(() => {
            multiEditExpansionState.set(cacheKey, expanded);
        }, [cacheKey, expanded]);
        // Parse the multi_edit output by grouping lines under each OK/FAIL entry
        const rawLines = result.split('\n');
        type Op = { idx: number; header: string; details: string[]; isOk: boolean; isFail: boolean };
        const ops: Op[] = [];
        let current: Op | null = null;
        for (const l of rawLines) {
            const startsOk = /^ *OK\b/.test(l);
            const startsFail = /^ *FAIL\b/.test(l);
            if (startsOk || startsFail) {
                if (current) {
                    // finalize previous op
                    current.idx = ops.length;
                    ops.push(current);
                }
                current = {
                    idx: ops.length,
                    header: l.trim(),
                    details: [],
                    isOk: startsOk,
                    isFail: startsFail,
                };
            } else if (current) {
                // Accumulate any subsequent lines (we don't render them by default)
                current.details.push(l);
            }
        }
        if (current) {
            current.idx = ops.length;
            ops.push(current);
        }

        const okCount = ops.filter(o => o.isOk).length;
        const failCount = ops.filter(o => o.isFail).length;
        return (
            <div className={`multi-edit-card ${failCount > 0 ? 'has-failures' : 'all-success'}`}>
                <div className="multi-edit-header">
                    <div className="multi-edit-title">
                        <span className="multi-edit-label">Multi-edit</span>
                        <div className="multi-edit-summary">
                            {okCount > 0 && <span className="success-count">{okCount} successful</span>}
                            {failCount > 0 && <span className="failure-count">{failCount} failed</span>}
                        </div>
                    </div>
                    <button
                        className="action-btn"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? 'Hide details' : 'Show details'}
                    </button>
                </div>
                {expanded && (
                    <div className="multi-edit-details">
                        {ops.map(op => (
                            <div key={op.idx} className={`operation-item ${op.isOk ? 'success' : op.isFail ? 'failure' : 'neutral'}`}>
                                <div className="operation-status">
                                    {op.isOk ? <FaCheckCircle /> : op.isFail ? <FaExclamationTriangle /> : null}
                                </div>
                                <div className="operation-text">{[op.header, ...op.details].join(' ').replace(/\s+/g, ' ').trim()}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // Render segments for agent messages
    const renderSegments = () => {
        if (!message.segments) return null;

        return (
            <div className="message-inline-content">
                {message.segments.map((segment, idx) => {
                    if (segment.kind === 'text') {
                        return (
                            <div key={`seg-${idx}`}
                                dangerouslySetInnerHTML={{ __html: renderMathContent(segment.text) }} />
                        );
                    } else if (segment.kind === 'tool') {
                        // Render tool call indicator
                        const tool = (segment as any).tool;
                        const toolType = tool.type;
                        const rawToolType = tool.rawType;
                        let toolLabel = toolType;

                        // Check if it's a Deepthink agent tool
                        const isDeepthinkTool = rawToolType && isDeepthinkAgentTool(rawToolType);
                        let agentIcon = '';

                        if (isDeepthinkTool) {
                            // Get icon for Deepthink agents
                            const iconMapping: Record<string, string> = {
                                'GenerateStrategies': 'psychology',
                                'GenerateHypotheses': 'science',
                                'TestHypotheses': 'troubleshoot',
                                'ExecuteStrategies': 'settings_suggest',
                                'SolutionCritique': 'security',
                                'CorrectedSolutions': 'auto_fix',
                                'SelectBestSolution': 'flag'
                            };
                            agentIcon = iconMapping[rawToolType] || 'smart_toy';
                        }

                        if (toolType === 'multi_edit') {
                            const opCount = tool.operations?.length || 0;
                            toolLabel = `multi_edit (${opCount} operations)`;
                        } else if (toolType === 'read_current_content') {
                            if (tool.params && tool.params.length === 2) {
                                toolLabel = `read_current_content (lines ${tool.params[0]}-${tool.params[1]})`;
                            }
                        } else if (toolType === 'searchacademia') {
                            toolLabel = `searchacademia ("${tool.query}")`;
                        }

                        return (
                            <div key={`seg-${idx}`} className={`tool-call-indicator ${isDeepthinkTool ? 'deepthink-tool-indicator' : ''}`}>
                                {isDeepthinkTool && agentIcon && (
                                    <span className="material-symbols-outlined tool-indicator-icon">{agentIcon}</span>
                                )}
                                <span className="tool-name">{toolLabel}</span>
                            </div>
                        );
                    } else if (segment.kind === 'diff') {
                        // Render diff command indicator (shouldn't happen with multi_edit, but just in case)
                        const command = (segment as any).command;
                        return (
                            <div key={`seg-${idx}`} className="diff-indicator">
                                <span className="diff-type">{command.type}</span>
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
        );
    };

    // Render system blocks (structured system messages)
    const renderSystemBlocks = () => {
        if (!message.blocks) return null;

        return (
            <div className="system-blocks">
                {message.blocks.map((block, idx) => {
                    const cacheKey = `${message.id}-block-${idx}`;
                    if (block.kind === 'edit_ok') {
                        return (
                            <div key={`block-${idx}`} className="system-block edit-ok">
                                <span>Edit Applied. Proceed.</span>
                            </div>
                        );
                    } else if (block.kind === 'error') {
                        return (
                            <div key={`block-${idx}`} className="system-block error">
                                <FaExclamationTriangle className="block-icon" />
                                <span>{block.message}</span>
                            </div>
                        );
                    } else if (block.kind === 'ignored_tool') {
                        return (
                            <div key={`block-${idx}`} className="system-block ignored">
                                <span>Ignoring {block.tool} (only one tool per turn)</span>
                            </div>
                        );
                    } else if (block.kind === 'tool_result') {
                        // For Deepthink agent tools, show concise summary instead of full result
                        if (isDeepthinkAgentTool(block.tool)) {
                            return (
                                <div key={`block-${idx}`} className="tool-result deepthink-agent-result concise">
                                    <div className="tool-result-header deepthink-agent-header">
                                        <MdVerifiedUser className="deepthink-agent-icon" />
                                        <span>{getDeepthinkAgentDisplayName(block.tool)} completed</span>
                                    </div>
                                    <div className="tool-result-summary">
                                        {getToolResultSummary(block.tool, block.result)}
                                    </div>
                                </div>
                            );
                        }
                        // Special rendering for different tool results
                        if (block.tool === 'multi_edit') {
                            return <MultiEditResultCard key={`block-${idx}`} result={block.result} cacheKey={cacheKey} />;
                        } else if (block.tool === 'verify_current_content') {
                            return (
                                <div key={`block-${idx}`} className="tool-result verifier-result">
                                    <div className="tool-result-header verifier-header">
                                        <MdVerifiedUser className="verifier-icon" />
                                        <span>Verification Report</span>
                                    </div>
                                    <CollapsibleContent content={block.result} maxLines={50} />
                                </div>
                            );
                        } else if (block.tool === 'searchacademia' || block.tool === 'searchacademia_and') {
                            return <ArxivSearchResults key={`block-${idx}`} result={block.result} />;
                        } else if (block.tool === 'read_current_content') {
                            // Show line range if specified
                            const toolCall = (block as any).toolCall;
                            let headerText = 'Content Read';

                            if (toolCall?.params && Array.isArray(toolCall.params) && toolCall.params.length === 2) {
                                headerText = `Content Read (lines ${toolCall.params[0]}-${toolCall.params[1]})`;
                            } else if (toolCall?.params && Array.isArray(toolCall.params) && toolCall.params.length > 0) {
                                headerText = `Content Read (with parameters)`;
                            } else {
                                headerText = `Content Read (full content)`;
                            }

                            return (
                                <div key={`block-${idx}`} className="tool-result">
                                    <div className="tool-result-header">{headerText}</div>
                                    <CollapsibleContent content={block.result} maxLines={30} />
                                </div>
                            );
                        } else {
                            return (
                                <div key={`block-${idx}`} className="tool-result">
                                    <div className="tool-result-header">Tool Result: {block.tool}</div>
                                    <div className="tool-result-content"
                                        dangerouslySetInnerHTML={{ __html: renderMathContent(block.result) }} />
                                </div>
                            );
                        }
                    }
                    return null;
                })}
            </div>
        );
    };

    // Collapsible content component for large outputs
    const CollapsibleContent: React.FC<{ content: string; maxLines: number }> = ({ content, maxLines }) => {
        const [expanded, setExpanded] = React.useState(false);
        const lines = content.split('\n');
        const needsCollapse = lines.length > maxLines;

        if (!needsCollapse || expanded) {
            return (
                <div className="tool-result-content">
                    <div dangerouslySetInnerHTML={{ __html: renderMathContent(content) }} />
                    {needsCollapse && (
                        <button className="action-btn" onClick={() => setExpanded(false)}>
                            Show less
                        </button>
                    )}
                </div>
            );
        }

        const preview = lines.slice(0, maxLines).join('\n');
        return (
            <div className="tool-result-content">
                <div dangerouslySetInnerHTML={{ __html: renderMathContent(preview) }} />
                <div className="content-truncated">... {lines.length - maxLines} more lines ...</div>
                <button className="action-btn" onClick={() => setExpanded(true)}>
                    Show all
                </button>
            </div>
        );
    };

    // Legacy content formatter for backward compatibility (only for user messages or old system messages)
    const formatContent = (content: string) => {
        // Render tool results as a dedicated card
        if (content.startsWith('[TOOL_RESULT:')) {
            const lines = content.split('\n');
            const toolName = lines[0].replace('[TOOL_RESULT:', '').replace(']', '');
            const result = lines.slice(1).join('\n');

            if (toolName === 'multi_edit') {
                return <MultiEditResultCard result={result} cacheKey={`${message.id}-legacy-multi-edit`} />;
            }

            if (toolName === 'verify_current_content') {
                return (
                    <div className="tool-result verifier-result">
                        <div className="tool-result-header verifier-header">
                            <MdVerifiedUser className="verifier-icon" />
                            <span>Verification Report</span>
                        </div>
                        <div className="verifier-content-wrapper">
                            <div className="tool-result-content verifier-result-content" dangerouslySetInnerHTML={{ __html: renderMathContent(result) }} />
                        </div>
                    </div>
                );
            }

            return (
                <div className="tool-result">
                    <div className="tool-result-header">Tool Result: {toolName}</div>
                    <div className="tool-result-content" dangerouslySetInnerHTML={{ __html: renderMathContent(result) }} />
                </div>
            );
        }

        // Fallback: render narrative content but strip any tool syntax to prevent leaks
        const sanitized = content
            .replace(/\[(TOOL_CALL|DIFF):([^\]]+)\]/g, '')
            .replace(/\[TOOL_RESULT:[^\]]+\]/g, '')
            .replace(/^\s*Tools?\s+called:.*$/gmi, '')
            .replace(/^\s*Commands?\s+executed:.*$/gmi, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return <div dangerouslySetInnerHTML={{ __html: renderMathContent(sanitized) }} />;
    };

    // Note: We intentionally do not render pre-execution tool/diff chips inside agent messages.

    return (
        <div className={getMessageClass()}>
            <div className="message-header">
                <span className="message-icon">{getMessageIcon()}</span>
                <span className="message-role">{message.role}</span>
                <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString()}
                </span>
            </div>
            <div className="message-content">
                {message.role === 'agent' && message.segments ? (
                    renderSegments()
                ) : message.role === 'system' && message.blocks ? (
                    renderSystemBlocks()
                ) : (
                    formatContent(message.content)
                )}
            </div>
        </div>
    );
};

// Component for the right panel showing agent activity (exported for reuse)
export const AgentActivityPanel: React.FC<{ state: AgenticState; onStop?: () => void }> = ({ state, onStop }) => {
    const messagesContainerRef = React.useRef<HTMLDivElement>(null);
    const [isUserScrolledUp, setIsUserScrolledUp] = React.useState(false);

    // Check if user has scrolled up from bottom
    const handleScroll = React.useCallback(() => {
        const el = messagesContainerRef.current;
        if (el) {
            const { scrollTop, scrollHeight, clientHeight } = el;
            // Treat within 2px of bottom as bottom (avoids float rounding issues)
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) <= 2;
            setIsUserScrolledUp(!isAtBottom);
        }
    }, []);

    // Auto-scroll to bottom only if user hasn't manually scrolled up
    React.useEffect(() => {
        if (!isUserScrolledUp && messagesContainerRef.current) {
            const el = messagesContainerRef.current;
            el.scrollTop = el.scrollHeight;
            // Ensure we stay pinned even if content reflows after paint
            requestAnimationFrame(() => {
                if (!isUserScrolledUp && messagesContainerRef.current) {
                    const el2 = messagesContainerRef.current;
                    el2.scrollTop = el2.scrollHeight;
                }
            });
        }
    }, [state.messages, isUserScrolledUp]);

    // Reset scroll position when new agent loop starts
    React.useEffect(() => {
        if (state.isProcessing && messagesContainerRef.current) {
            const el = messagesContainerRef.current;
            el.scrollTop = el.scrollHeight;
            setIsUserScrolledUp(false);
        }
    }, [state.isProcessing]);

    return (
        <div className="agentic-agent-panel">
            <div className="agent-panel-header">
                <h3>Agent Activity</h3>
                {state.isProcessing && (
                    <button className="stop-button" onClick={onStop}>
                        <FaStop />
                        Stop
                    </button>
                )}
                {state.isComplete && (
                    <span className="status-badge status-completed">Completed</span>
                )}
            </div>
            <div className="agent-messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
                {state.messages.map((message, index) => (
                    <MessageCard key={message.id || `idx-${index}`} message={message} />
                ))}
                {state.isProcessing && (
                    <div className="processing-indicator">
                        <div className="spinner"></div>
                        <span>Processing agent response...</span>
                    </div>
                )}
            </div>
            {state.error && (
                <div className="error-message">
                    <FaExclamationTriangle />
                    {state.error}
                </div>
            )}
        </div>
    );
};

// Component for the left panel showing current text (exported for reuse)
export const CurrentTextPanel: React.FC<{ content: string; originalContent: string; state: AgenticState }> = ({ content, originalContent, state }) => {
    const renderContent = () => {
        if (false) {
            // Use diff library for proper diff visualization
            const diffResult = Diff.diffLines(originalContent, content);

            return (
                <div className="diff-view">
                    {diffResult.map((part, index) => {
                        const lines = part.value.split('\n').filter(line => line.length > 0);
                        return lines.map((line, lineIndex) => {
                            const globalIndex = index * 1000 + lineIndex; // Ensure unique keys
                            const className = part.added ? 'diff-line added' :
                                part.removed ? 'diff-line removed' :
                                    'diff-line unchanged';
                            const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';

                            return (
                                <div key={globalIndex} className={className}>
                                    <span className="line-prefix">{prefix}</span>
                                    <span className="line-content">{line}</span>
                                </div>
                            );
                        });
                    }).flat()};
                </div>
            );
        }

        // Simple rendering using renderMathContent
        return <div dangerouslySetInnerHTML={{ __html: renderMathContent(content) }} />;
    };

    return (
        <div className="agentic-text-panel">
            <div className="text-panel-header">
                <h3>Current Text</h3>
                <div className="text-panel-actions">
                    <button
                        className="action-btn"
                        onClick={async () => {
                            const { openEvolutionViewerFromHistory } = await import("../Components/DiffModal/EvolutionViewer");
                            openEvolutionViewerFromHistory(state.contentHistory, state.id);
                        }}
                        title="View content evolution timeline (updates live)"
                    >
                        <span className="material-symbols-outlined">movie</span>
                    </button>
                    <button
                        className="action-btn"
                        onClick={async (e) => {
                            const button = e.currentTarget;
                            const icon = button.querySelector('.material-symbols-outlined');

                            try {
                                await navigator.clipboard.writeText(content);

                                if (icon) {
                                    const originalIcon = icon.textContent;
                                    icon.textContent = 'check';

                                    setTimeout(() => {
                                        icon.textContent = originalIcon;
                                    }, 1500);
                                }
                            } catch (err) {
                                console.error('Failed to copy:', err);
                            }
                        }}
                        title="Copy current text"
                    >
                        <span className="material-symbols-outlined">content_copy</span>
                    </button>
                </div>
            </div>
            <div className="text-content-container">
                {renderContent()}
            </div>
        </div>
    );
};

// Main Agentic UI Component
export const AgenticUI: React.FC<AgenticUIProps> = ({ state, onStop }) => {
    // Update evolution viewer when content history changes
    React.useEffect(() => {
        const updateViewer = async () => {
            const { updateEvolutionViewerIfOpen } = await import('../Components/DiffModal/EvolutionViewer');
            updateEvolutionViewerIfOpen(state.id, state.contentHistory);
        };
        updateViewer();
    }, [state.contentHistory.length, state.id]);

    return (
        <div className="agentic-ui-container">
            <CurrentTextPanel
                content={state.currentContent}
                originalContent={state.originalContent}
                state={state}
            />
            <AgentActivityPanel
                state={state}
                onStop={onStop}
            />
        </div>
    );
};

// Function to render the Agentic UI
export function renderAgenticUI(container: HTMLElement, state: AgenticState, onStop?: () => void) {
    const root = ReactDOM.createRoot(container);
    root.render(<AgenticUI state={state} onStop={onStop} />);
    return root;
}

// Function to update the Agentic UI with forced synchronous rendering
export function updateAgenticUI(root: any, state: AgenticState, onStop?: () => void) {
    // Use flushSync to force immediate DOM update, preventing React batching
    flushSync(() => {
        root.render(<AgenticUI state={state} onStop={onStop} />);
    });
}

// Helper to force a browser repaint using requestAnimationFrame
// This is more reliable than setTimeout(0) for ensuring UI updates are visible
export async function forceUIRender() {
    return new Promise<void>(resolve => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}