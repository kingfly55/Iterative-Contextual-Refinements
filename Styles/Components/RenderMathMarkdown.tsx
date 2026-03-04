import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { onHighlighterReady, isHighlighterReady } from '../Shiki';
import { renderMathContent } from './RenderMathMarkdownLogic';

// --- Shared Hooks ---

export function useHighlighting() {
    const [isReady, setIsReady] = useState(isHighlighterReady());

    useEffect(() => {
        if (isReady) return;
        return onHighlighterReady(() => setIsReady(true));
    }, [isReady]);

    return isReady;
}

// --- Image Preview Modal Component ---

export interface ImagePreviewData {
    src: string;
    alt: string;
    format: string;
}

export const ImagePreviewModal: React.FC<{
    data: ImagePreviewData | null;
    onClose: () => void;
}> = ({ data, onClose }) => {
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };

        if (data) {
            document.body.style.overflow = 'hidden';
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [data]);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 180); // matches CSS animation duration
    }, [onClose]);

    if (!data) return null;

    return createPortal(
        <div
            className="file-preview-modal-overlay"
            onClick={handleClose}
            style={isClosing ? { animation: 'fadeIn 0.2s ease reverse' } : undefined}
        >
            <div
                className="file-preview-modal"
                onClick={(e) => e.stopPropagation()}
                style={isClosing ? { animation: 'scaleIn 0.2s ease reverse' } : undefined}
            >
                <div className="preview-modal-header">
                    <div className="preview-file-info">
                        <span className="material-symbols-outlined" style={{ color: '#10b981' }}>image</span>
                        <span className="preview-file-name">Generated Figure</span>
                        <span className="preview-file-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.13)', color: '#10b981' }}>
                            {data.format}
                        </span>
                    </div>
                    <button className="preview-close-btn" title="Close (Esc)" onClick={handleClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="preview-modal-content">
                    <div className="preview-image-container">
                        <img src={data.src} alt={data.alt} className="preview-image" />
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export const GlobalImagePreviewModal: React.FC = () => {
    const [previewData, setPreviewData] = useState<ImagePreviewData | null>(null);

    useEffect(() => {
        const handlePreview = (e: Event) => {
            const customEvent = e as CustomEvent<ImagePreviewData>;
            if (customEvent.detail && customEvent.detail.src) {
                setPreviewData(customEvent.detail);
            }
        };

        window.addEventListener('exec-image-preview', handlePreview);
        return () => window.removeEventListener('exec-image-preview', handlePreview);
    }, []);

    return <ImagePreviewModal data={previewData} onClose={() => setPreviewData(null)} />;
};

// --- Main Component ---

export interface RenderMathMarkdownProps {
    content: string;
    className?: string;
}

export const RenderMathMarkdown: React.FC<RenderMathMarkdownProps> = ({ content, className = '' }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const busyRef = useRef<Record<string, boolean>>({});

    const handleContainerClick = async (ev: React.MouseEvent<HTMLDivElement>) => {
        const target = ev.target as HTMLElement;

        // 1. Handle Copy Button
        const copyBtn = target.closest('.copy-code-btn') as HTMLElement;
        if (copyBtn) {
            const id = copyBtn.getAttribute('data-code-id') ||
                copyBtn.closest('.code-block-container')?.querySelector('.code-block-content code')?.id;

            if (id) {
                const key = `copy:${id}`;
                if (busyRef.current[key]) return;
                busyRef.current[key] = true;

                try {
                    let codeElement = document.getElementById(id) ||
                        copyBtn.closest('.code-block-container')?.querySelector('.code-block-content code') as HTMLElement;

                    if (codeElement) {
                        const codeText = codeElement.textContent || '';
                        await navigator.clipboard.writeText(codeText);

                        const icon = copyBtn.querySelector('.material-symbols-outlined');
                        if (icon) {
                            const originalText = icon.textContent;
                            icon.textContent = 'check';
                            setTimeout(() => {
                                icon.textContent = originalText;
                                delete busyRef.current[key];
                            }, 1500);
                            return;
                        }
                    }
                } catch (err) {
                    console.error('Copy failed:', err);
                }

                setTimeout(() => {
                    delete busyRef.current[key];
                }, 500);
            }
            return;
        }

        // 2. Handle Image Preview (React Delegation)
        const imageItem = target.closest('.exec-image-item') as HTMLElement;
        if (imageItem && !imageItem.classList.contains('exec-image-error-item')) {
            if (typeof (window as any).previewImage === 'function') {
                (window as any).previewImage(imageItem);
            } else {
                const src = imageItem.dataset.src || (imageItem.querySelector('img') as HTMLImageElement)?.src;
                const format = imageItem.dataset.format || 'PNG';
                if (src) {
                    window.dispatchEvent(new CustomEvent('exec-image-preview', {
                        detail: { src, alt: 'Generated Figure', format }
                    }));
                }
            }
            return;
        }

        // 3. Handle toggling code block (if we had toggle buttons, using the window global in legacy)
        // Usually toggle buttons have an ID starting with toggle- and toggle a container
        if (target.id?.startsWith('toggle-') || target.closest('[id^="toggle-"]')) {
            const toggleElement = target.id?.startsWith('toggle-') ? target : target.closest('[id^="toggle-"]') as HTMLElement;
            const codeId = toggleElement.id.replace('toggle-', '');
            const codeContent = document.getElementById(codeId);
            const container = codeContent?.closest('.code-block-container');

            if (codeContent && container) {
                const isExpanded = codeContent.classList.contains('expanded');
                codeContent.classList.toggle('expanded', !isExpanded);
                codeContent.classList.toggle('collapsed', isExpanded);
                toggleElement.classList.toggle('expanded', !isExpanded);
                container.classList.toggle('expanded', !isExpanded);
                container.classList.toggle('collapsed', isExpanded);
            }
        }
    };

    // Render HTML content based on whether highlighter is ready.
    // We re-render when highlighter is ready to ensure correct syntax highlighting.
    const htmlContent = React.useMemo(() => {
        return renderMathContent(content);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content, isHighlighterReady]);

    return (
        <div
            ref={containerRef}
            className={`render-math-markdown ${className}`.trim()}
            onClick={handleContainerClick}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
    );
};

export default RenderMathMarkdown;
