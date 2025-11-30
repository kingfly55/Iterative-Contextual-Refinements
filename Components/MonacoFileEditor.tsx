/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import Editor, { loader, Monaco } from '@monaco-editor/react';
import './MonacoFileEditor.css';

// --- Types & Interfaces ---

export interface ParsedFile {
    path: string;
    content: string;
    language?: string;
}

interface FileTreeNode {
    name: string;
    path: string;
    isFolder: boolean;
    children?: FileTreeNode[];
    content?: string;
    language?: string;
}

interface MonacoFileEditorProps {
    content: string;
    onContentChange?: (content: string) => void;
    onDownload?: () => void;
    onViewEvolutions?: () => void;
    readOnly?: boolean;
    forceDarkTheme?: boolean;
}

// --- Utilities (Pure Functions) ---

const getLanguageFromExtension = (path: string): string => {
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'js': case 'jsx': return 'javascript';
        case 'ts': case 'tsx': return 'typescript';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'json': return 'json';
        case 'md': case 'txt': return 'markdown';
        case 'py': return 'python';
        case 'yaml': case 'yml': return 'yaml';
        default: return 'plaintext';
    }
};

const parseAggregatedCode = (code: string): ParsedFile[] => {
    const files: ParsedFile[] = [];
    const fileMarkerRegex = /^\/\/\s*---\s*FILE:\s*(.*?)\s*---\s*$/gm;
    const parts = code.split(fileMarkerRegex);

    for (let i = 1; i < parts.length; i += 2) {
        const filePath = parts[i].trim();
        const content = parts[i + 1]?.trim() || '';

        if (content) {
            files.push({
                path: filePath,
                content,
                language: getLanguageFromExtension(filePath)
            });
        }
    }

    if (files.length === 0 && code.trim()) {
        files.push({ path: 'main.tsx', content: code, language: 'typescript' });
    }

    return files;
};

const aggregateFiles = (files: ParsedFile[]): string => {
    return files.map(f => `// --- FILE: ${f.path} ---\n${f.content}\n`).join('\n').trim();
};

const buildFileTree = (files: ParsedFile[]): FileTreeNode[] => {
    const root: FileTreeNode = { name: 'root', path: '', isFolder: true, children: [] };

    files.forEach(file => {
        const parts = file.path.split('/');
        let current = root;

        parts.forEach((part, index) => {
            const isLast = index === parts.length - 1;
            const currentPath = parts.slice(0, index + 1).join('/');

            if (!current.children) current.children = [];

            if (isLast) {
                current.children.push({
                    name: part,
                    path: currentPath,
                    isFolder: false,
                    content: file.content,
                    language: file.language
                });
            } else {
                let folder = current.children.find(c => c.name === part && c.isFolder);
                if (!folder) {
                    folder = { name: part, path: currentPath, isFolder: true, children: [] };
                    current.children.push(folder);
                }
                current = folder;
            }
        });
    });

    return root.children || [];
};

// --- Theme Logic ---

const configureMonaco = (monaco: Monaco) => {
    // Disable validation
    const defaults = [
        monaco.languages.typescript.typescriptDefaults,
        monaco.languages.typescript.javascriptDefaults
    ];

    defaults.forEach(def => {
        def.setDiagnosticsOptions({
            noSemanticValidation: true,
            noSyntaxValidation: true,
            noSuggestionDiagnostics: true
        });
        def.setCompilerOptions({
            noLib: true,
            allowNonTsExtensions: true
        });
    });

    const commonColors = {
        'editorCursor.foreground': '#7c4af0',
        'editor.lineHighlightBackground': 'rgba(124, 74, 240, 0.08)',
        'editor.selectionBackground': 'rgba(124, 74, 240, 0.25)',
        'editorBracketMatch.background': 'rgba(124, 74, 240, 0.1)',
        'editorBracketMatch.border': '#7c4af0',
        'editorOverviewRuler.border': 'rgba(124, 74, 240, 0.1)',
        'editorError.foreground': 'transparent',
        'editorWarning.foreground': 'transparent',
    };

    monaco.editor.defineTheme('system-theme-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
            ...commonColors,
            'editor.background': '#0a0b1e00',
            'editor.foreground': '#e6e7ee',
            'editorLineNumber.foreground': '#6b7280',
            'editorLineNumber.activeForeground': '#7c4af0',
            'editorWidget.background': '#252526',
            'editorWidget.border': '#454545',
        }
    });

    monaco.editor.defineTheme('system-theme-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
            ...commonColors,
            'editor.background': '#ffffff00',
            'editor.foreground': '#2d2d3a',
            'editorLineNumber.foreground': '#9ca3af',
            'editorLineNumber.activeForeground': '#7c4af0',
            'editorWidget.background': '#f5f5f5',
            'editorWidget.border': '#d0d0d0',
        }
    });
};

// --- Sub-Components ---

const FileIcon = memo(({ name, isFolder, isDark }: { name: string, isFolder: boolean, isDark: boolean }) => {
    if (isFolder) {
        return <span className="material-symbols-outlined folder-icon">folder</span>;
    }

    const getIconData = () => {
        const ext = name.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'tsx': case 'ts': return { icon: 'code', color: isDark ? '#4ec9b0' : '#0084ce' };
            case 'jsx': case 'js': return { icon: 'javascript', color: '#f0db4f' };
            case 'css': return { icon: 'css', color: '#563d7c' };
            case 'html': return { icon: 'html', color: '#e34c26' };
            case 'json': return { icon: 'data_object', color: isDark ? '#cbcb41' : '#b07219' };
            case 'md': case 'txt': return { icon: 'description', color: isDark ? '#969696' : '#616161' };
            default: return { icon: 'insert_drive_file', color: isDark ? '#969696' : '#616161' };
        }
    };

    const { icon, color } = getIconData();
    return <span className="material-symbols-outlined file-icon" style={{ color }}>{icon}</span>;
});

const FileTreeItem = memo(({ node, level, selectedPath, onSelect, isDark }: {
    node: FileTreeNode,
    level: number,
    selectedPath: string,
    onSelect: (path: string) => void,
    isDark: boolean
}) => {
    const isSelected = !node.isFolder && selectedPath === node.path;
    const style = { paddingLeft: `${level * 12 + 8}px` };

    if (node.isFolder) {
        return (
            <div className="file-tree-group">
                <div className="file-tree-item folder" style={style}>
                    <FileIcon name={node.name} isFolder={true} isDark={isDark} />
                    <span className="file-name">{node.name}</span>
                </div>
                {node.children?.map((child, idx) => (
                    <FileTreeItem
                        key={`${child.path}-${idx}`}
                        node={child}
                        level={level + 1}
                        selectedPath={selectedPath}
                        onSelect={onSelect}
                        isDark={isDark}
                    />
                ))}
            </div>
        );
    }

    return (
        <div
            className={`file-tree-item file ${isSelected ? 'selected' : ''}`}
            style={style}
            onClick={() => onSelect(node.path)}
            title={node.path}
        >
            <FileIcon name={node.name} isFolder={false} isDark={isDark} />
            <span className="file-name">{node.name}</span>
        </div>
    );
});

const EmptyState = () => (
    <div className="monaco-empty-state">
        <p>No code available</p>
    </div>
);

// --- Main Component ---

export const MonacoFileEditor: React.FC<MonacoFileEditorProps> = ({
    content,
    onContentChange,
    onDownload,
    onViewEvolutions,
    readOnly = false,
    forceDarkTheme = false
}) => {
    const [files, setFiles] = useState<ParsedFile[]>([]);
    const [selectedFileIndex, setSelectedFileIndex] = useState(0);
    const [isDark, setIsDark] = useState(forceDarkTheme);
    const [themeInitialized, setThemeInitialized] = useState(false);

    // Initial parsing
    useEffect(() => {
        setFiles(parseAggregatedCode(content));
        setSelectedFileIndex(0);
    }, [content]);

    // Theme initialization
    useEffect(() => {
        loader.init().then((monaco) => {
            configureMonaco(monaco);
            setThemeInitialized(true);
        });
    }, []);

    // Dark mode detection
    useEffect(() => {
        if (forceDarkTheme) {
            setIsDark(true);
            return;
        }

        const checkTheme = () => {
            const isDarkMode = !document.body.classList.contains('light-mode');
            setIsDark(isDarkMode);
            if ((window as any).monaco?.editor) {
                (window as any).monaco.editor.setTheme(isDarkMode ? 'system-theme-dark' : 'system-theme-light');
            }
        };

        checkTheme();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => m.attributeName === 'class' && checkTheme());
        });

        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [forceDarkTheme]);

    // Handlers
    const handleFileSelect = useCallback((path: string) => {
        const index = files.findIndex(f => f.path === path);
        if (index >= 0) setSelectedFileIndex(index);
    }, [files]);

    const handleEditorChange = useCallback((value: string | undefined) => {
        if (value !== undefined && !readOnly) {
            setFiles(prev => {
                const newFiles = [...prev];
                newFiles[selectedFileIndex] = { ...newFiles[selectedFileIndex], content: value };
                if (onContentChange) {
                    onContentChange(aggregateFiles(newFiles));
                }
                return newFiles;
            });
        }
    }, [selectedFileIndex, onContentChange, readOnly]);

    // Memoized Tree
    const fileTree = useMemo(() => buildFileTree(files), [files]);
    const currentFile = files[selectedFileIndex];

    if (files.length === 0) return <EmptyState />;

    return (
        <div className="monaco-file-editor-container-optimized">
            {/* Sidebar */}
            <div className="monaco-sidebar">
                <div className="monaco-sidebar-header">
                    <span className="material-symbols-outlined icon">folder_open</span>
                    <span>EXPLORER</span>
                </div>

                <div className="monaco-file-tree custom-scrollbar">
                    {fileTree.map((node, i) => (
                        <FileTreeItem
                            key={`${node.path}-${i}`}
                            node={node}
                            level={0}
                            selectedPath={currentFile?.path || ''}
                            onSelect={handleFileSelect}
                            isDark={isDark}
                        />
                    ))}
                </div>

                <div className="monaco-sidebar-actions">
                    {onViewEvolutions && (
                        <button
                            onClick={onViewEvolutions}
                            className="button primary-action"
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                padding: '0.6rem 0.8rem',
                                fontSize: '0.75rem'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>history</span>
                            <span className="button-text" style={{ whiteSpace: 'nowrap' }}>Evolutions</span>
                        </button>
                    )}
                    {onDownload && (
                        <button
                            onClick={onDownload}
                            className="button primary-action"
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                padding: '0.6rem 0.8rem',
                                fontSize: '0.75rem'
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                            <span className="button-text" style={{ whiteSpace: 'nowrap' }}>Download</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Editor Area */}
            <div className="monaco-editor-area">
                <div className="monaco-tab-bar">
                    {currentFile && (
                        <div className="monaco-active-tab">
                            <FileIcon name={currentFile.path} isFolder={false} isDark={isDark} />
                            <span className="tab-filename">{currentFile.path.split('/').pop()}</span>
                            {readOnly && <span className="readonly-badge">READ ONLY</span>}
                        </div>
                    )}
                </div>

                <div className="monaco-editor-wrapper">
                    {currentFile && themeInitialized && (
                        <Editor
                            height="100%"
                            language={currentFile.language || 'typescript'}
                            value={currentFile.content}
                            onChange={handleEditorChange}
                            theme={isDark ? 'system-theme-dark' : 'system-theme-light'}
                            options={{
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fontSize: 13,
                                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                                lineNumbers: 'on',
                                renderWhitespace: 'selection',
                                tabSize: 2,
                                wordWrap: 'on',
                                automaticLayout: true,
                                overviewRulerBorder: false,
                                overviewRulerLanes: 0,
                                hideCursorInOverviewRuler: true,
                                readOnly,
                                quickSuggestions: !readOnly,
                                contextmenu: true,
                                renderValidationDecorations: 'off',
                                renderLineHighlight: 'none',
                                hover: { enabled: false },
                                guides: { indentation: false },
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonacoFileEditor;