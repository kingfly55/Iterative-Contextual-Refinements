/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Editor, { loader } from '@monaco-editor/react';

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

// Parse the aggregated code into individual files
function parseAggregatedCode(code: string): ParsedFile[] {
    const files: ParsedFile[] = [];
    const fileMarkerRegex = /^\/\/\s*---\s*FILE:\s*(.*?)\s*---\s*$/gm;
    const parts = code.split(fileMarkerRegex);
    
    // Parse files using the FILE marker
    for (let i = 1; i < parts.length; i += 2) {
        const filePath = parts[i].trim();
        const fileContent = parts[i + 1] || '';
        
        // Clean up the content (remove leading/trailing whitespace but preserve internal formatting)
        const cleanedContent = fileContent.trim();
        
        // Determine language based on file extension
        const extension = filePath.split('.').pop()?.toLowerCase();
        let language = 'plaintext';
        
        switch (extension) {
            case 'js':
            case 'jsx':
                language = 'javascript';
                break;
            case 'ts':
            case 'tsx':
                language = 'typescript';
                break;
            case 'html':
                language = 'html';
                break;
            case 'css':
                language = 'css';
                break;
            case 'json':
                language = 'json';
                break;
            case 'md':
            case 'txt':
                language = 'markdown';
                break;
            case 'py':
                language = 'python';
                break;
            case 'yaml':
            case 'yml':
                language = 'yaml';
                break;
        }
        
        if (cleanedContent) {
            files.push({
                path: filePath,
                content: cleanedContent,
                language
            });
        }
    }
    
    // If no files were parsed, treat the entire content as a single file
    if (files.length === 0 && code.trim()) {
        files.push({
            path: 'main.tsx',
            content: code,
            language: 'typescript'
        });
    }
    
    return files;
}

// Aggregate files back into code format (for parent component)
// All files are treated equally with FILE markers - including Plan.txt and WorkerAgentsPrompts.json
function aggregateFiles(files: ParsedFile[]): string {
    let aggregatedCode = '';
    
    // Add all files with FILE marker (including Plan.txt and WorkerAgentsPrompts.json)
    files.forEach(file => {
        aggregatedCode += `// --- FILE: ${file.path} ---\n${file.content}\n\n`;
    });
    
    return aggregatedCode.trim();
}
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
    
    // Parse content into files
    useEffect(() => {
        const parsedFiles = parseAggregatedCode(content);
        setFiles(parsedFiles);
        setSelectedFileIndex(0);
    }, [content]);
    
    // Initialize custom theme
    useEffect(() => {
        loader.init().then((monaco) => {
            // Disable ALL language validation and error markers
            monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: true,
                noSuggestionDiagnostics: true
            });
            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: true,
                noSuggestionDiagnostics: true
            });
            
            // Disable compiler options that might trigger errors
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                noLib: true,
                allowNonTsExtensions: true
            });
            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
                noLib: true,
                allowNonTsExtensions: true
            });

            // Define custom theme that matches system theme
            monaco.editor.defineTheme('system-theme-dark', {
                base: 'vs-dark',
                inherit: true, // Keep syntax highlighting but override colors
                rules: [],
                colors: {
                    // Editor base
                    'editor.background': '#0a0b1e00',
                    'editor.foreground': '#e6e7ee',
                    'editor.lineHighlightBackground': 'rgba(124, 74, 240, 0.08)',
                    'editor.selectionBackground': 'rgba(124, 74, 240, 0.25)',
                    'editor.inactiveSelectionBackground': 'rgba(124, 74, 240, 0.12)',
                    'editorCursor.foreground': '#7c4af0',
                    'editorWhitespace.foreground': 'rgba(227, 228, 226, 0.16)',
                    
                    // Line numbers
                    'editorLineNumber.foreground': '#6b7280',
                    'editorLineNumber.activeForeground': '#7c4af0',
                    
                    // Scrollbar
                    'scrollbar.shadow': 'rgba(0, 0, 0, 0.15)',
                    'scrollbarSlider.background': 'rgba(124, 74, 240, 0.4)',
                    'scrollbarSlider.hoverBackground': 'rgba(124, 74, 240, 0.55)',
                    'scrollbarSlider.activeBackground': 'rgba(124, 74, 240, 0.7)',
                    
                    // Overview ruler - NO RED
                    'editorOverviewRuler.border': 'rgba(124, 74, 240, 0.1)',
                    'editorOverviewRuler.background': 'transparent',
                    'editorOverviewRuler.errorForeground': 'transparent',
                    'editorOverviewRuler.warningForeground': 'transparent',
                    'editorOverviewRuler.infoForeground': 'rgba(124, 74, 240, 0.3)',
                    
                    // Error/warning - NO RED
                    'editorError.foreground': 'transparent',
                    'editorError.border': 'transparent',
                    'editorWarning.foreground': 'transparent',
                    'editorWarning.border': 'transparent',
                    'editorInfo.foreground': 'rgba(124, 74, 240, 0.3)',
                    'editorHint.foreground': 'rgba(124, 74, 240, 0.2)',
                    
                    // Widget colors
                    'editorWidget.background': '#252526',
                    'editorWidget.foreground': '#cccccc',
                    'editorWidget.border': '#454545',
                    'editorSuggestWidget.background': '#252526',
                    'editorSuggestWidget.foreground': '#e6e7ee',
                    'editorSuggestWidget.selectedBackground': 'rgba(124, 74, 240, 0.3)',
                    'editorSuggestWidget.highlightForeground': '#7c4af0',
                    
                    // Brackets
                    'editorBracketMatch.background': 'rgba(124, 74, 240, 0.1)',
                    'editorBracketMatch.border': '#7c4af0'
                }
            });
            
            monaco.editor.defineTheme('system-theme-light', {
                base: 'vs',
                inherit: true, // Keep syntax highlighting but override colors
                rules: [],
                colors: {
                    // Editor base
                    'editor.background': '#ffffff00',
                    'editor.foreground': '#2d2d3a',
                    'editor.lineHighlightBackground': 'rgba(124, 74, 240, 0.05)',
                    'editor.selectionBackground': 'rgba(124, 74, 240, 0.2)',
                    'editor.inactiveSelectionBackground': 'rgba(124, 74, 240, 0.1)',
                    'editorCursor.foreground': '#7c4af0',
                    'editorWhitespace.foreground': 'rgba(100, 100, 100, 0.2)',
                    
                    // Line numbers
                    'editorLineNumber.foreground': '#9ca3af',
                    'editorLineNumber.activeForeground': '#7c4af0',
                    
                    // Scrollbar
                    'scrollbar.shadow': 'rgba(0, 0, 0, 0.1)',
                    'scrollbarSlider.background': 'rgba(124, 74, 240, 0.3)',
                    'scrollbarSlider.hoverBackground': 'rgba(124, 74, 240, 0.5)',
                    'scrollbarSlider.activeBackground': 'rgba(124, 74, 240, 0.7)',
                    
                    // Overview ruler - NO RED
                    'editorOverviewRuler.border': 'rgba(124, 74, 240, 0.1)',
                    'editorOverviewRuler.background': 'transparent',
                    'editorOverviewRuler.errorForeground': 'transparent',
                    'editorOverviewRuler.warningForeground': 'transparent',
                    'editorOverviewRuler.infoForeground': 'rgba(124, 74, 240, 0.3)',
                    
                    // Error/warning - NO RED
                    'editorError.foreground': 'transparent',
                    'editorError.border': 'transparent',
                    'editorWarning.foreground': 'transparent',
                    'editorWarning.border': 'transparent',
                    'editorInfo.foreground': 'rgba(124, 74, 240, 0.3)',
                    'editorHint.foreground': 'rgba(124, 74, 240, 0.2)',
                    
                    // Widget colors
                    'editorWidget.background': '#f5f5f5',
                    'editorWidget.foreground': '#2d2d3a',
                    'editorWidget.border': '#d0d0d0',
                    'editorSuggestWidget.background': '#f5f5f5',
                    'editorSuggestWidget.foreground': '#2d2d3a',
                    'editorSuggestWidget.selectedBackground': 'rgba(124, 74, 240, 0.2)',
                    'editorSuggestWidget.highlightForeground': '#7c4af0',
                    
                    // Brackets
                    'editorBracketMatch.background': 'rgba(124, 74, 240, 0.1)',
                    'editorBracketMatch.border': '#7c4af0'
                }
            });
            
            setThemeInitialized(true);
        });
    }, []);
    
    // Check for dark mode using application theme (not system preference)
    useEffect(() => {
        if (forceDarkTheme) {
            setIsDark(true);
            return;
        }
        
        // Check if body has light-mode class
        const checkTheme = () => {
            const isLightMode = document.body.classList.contains('light-mode');
            const isDarkMode = !isLightMode;
            setIsDark(isDarkMode);
            
            // Also update Monaco editor theme if already loaded
            if ((window as any).monaco && (window as any).monaco.editor) {
                (window as any).monaco.editor.setTheme(isDarkMode ? 'system-theme-dark' : 'system-theme-light');
            }
        };
        
        // Set initial theme
        checkTheme();
        
        // Listen for theme changes via MutationObserver
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    checkTheme();
                }
            });
        });
        
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        return () => {
            observer.disconnect();
        };
    }, [forceDarkTheme]);
    
    const handleFileContentChange = useCallback((value: string | undefined) => {
        if (value !== undefined && !readOnly) {
            const newFiles = [...files];
            newFiles[selectedFileIndex].content = value;
            setFiles(newFiles);
            
            // Aggregate and notify parent
            if (onContentChange) {
                const aggregatedCode = aggregateFiles(newFiles);
                onContentChange(aggregatedCode);
            }
        }
    }, [files, selectedFileIndex, onContentChange, readOnly]);
    
    const currentFile = files[selectedFileIndex];
    
    // Build file tree structure
    const fileTree = useMemo(() => {
        const root: FileTreeNode = {
            name: 'root',
            path: '',
            isFolder: true,
            children: []
        };
        
        files.forEach(file => {
            const parts = file.path.split('/');
            let current = root;
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isLast = i === parts.length - 1;
                const currentPath = parts.slice(0, i + 1).join('/');
                
                if (isLast) {
                    // It's a file
                    if (!current.children) current.children = [];
                    current.children.push({
                        name: part,
                        path: currentPath,
                        isFolder: false,
                        content: file.content,
                        language: file.language
                    });
                } else {
                    // It's a folder
                    if (!current.children) current.children = [];
                    let folder = current.children.find(c => c.name === part && c.isFolder);
                    if (!folder) {
                        folder = {
                            name: part,
                            path: currentPath,
                            isFolder: true,
                            children: []
                        };
                        current.children.push(folder);
                    }
                    current = folder;
                }
            }
        });
        
        return root.children || [];
    }, [files]);
    
    const renderFileTree = (nodes: FileTreeNode[], level = 0) => {
        return nodes.map((node, index) => {
            const isSelected = !node.isFolder && files[selectedFileIndex]?.path === node.path;
            const fileIndex = files.findIndex(f => f.path === node.path);
            
            if (node.isFolder) {
                const folderItemStyle: React.CSSProperties = {
                    paddingLeft: `${level * 12 + 8}px`,
                    padding: `2px 0 2px ${level * 12 + 8}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    userSelect: 'none'
                };
                    
                return (
                    <div key={`${node.path}-${index}`}>
                        <div 
                            style={folderItemStyle}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--hover-bg-color, rgba(255, 255, 255, 0.04))';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--accent-yellow, #dcb67a)' }}>folder</span>
                            <span style={{ fontSize: '13px' }}>{node.name}</span>
                        </div>
                        {node.children && renderFileTree(node.children, level + 1)}
                    </div>
                );
            } else {
                const icon = getFileIcon(node.name);
                const fileItemStyle: React.CSSProperties = {
                    paddingLeft: `${level * 12 + 8}px`,
                    padding: `2px 0 2px ${level * 12 + 8}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    color: isSelected 
                        ? 'var(--text-color)'
                        : 'var(--text-secondary)',
                    background: isSelected 
                        ? 'var(--accent-blue-translucent, rgba(30, 144, 255, 0.15))'
                        : 'transparent',
                    userSelect: 'none'
                };
                
                return (
                    <div
                        key={`${node.path}-${index}`}
                        style={fileItemStyle}
                        onClick={() => fileIndex >= 0 && setSelectedFileIndex(fileIndex)}
                        title={node.path}
                        onMouseEnter={(e) => {
                            if (!isSelected) {
                                e.currentTarget.style.background = 'var(--hover-bg-color, rgba(255, 255, 255, 0.04))';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isSelected) {
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        <span className="material-symbols-outlined" style={{ 
                            fontSize: '18px',
                            color: getIconColor(icon, isDark)
                        }}>{icon}</span>
                        <span style={{ fontSize: '13px' }}>{node.name}</span>
                    </div>
                );
            }
        });
    };
    
    const getFileIcon = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'tsx':
            case 'ts':
                return 'code';
            case 'jsx':
            case 'js':
                return 'javascript';
            case 'css':
                return 'css';
            case 'html':
                return 'html';
            case 'json':
                return 'data_object';
            case 'txt':
            case 'md':
                return 'description';
            default:
                return 'insert_drive_file';
        }
    };
    
    const getIconColor = (icon: string, isDark: boolean) => {
        switch (icon) {
            case 'code':
                return isDark ? '#4ec9b0' : '#0084ce';
            case 'javascript':
                return isDark ? '#f0db4f' : '#f0db4f';
            case 'css':
                return isDark ? '#563d7c' : '#563d7c';
            case 'html':
                return isDark ? '#e34c26' : '#e34c26';
            case 'data_object':
                return isDark ? '#cbcb41' : '#b07219';
            default:
                return isDark ? '#969696' : '#616161';
        }
    };
    
    if (files.length === 0) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '400px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                background: 'var(--card-bg-color)',
                backdropFilter: 'var(--card-blur-effect)',
                WebkitBackdropFilter: 'var(--card-blur-effect)',
                borderRadius: 'var(--border-radius-lg)',
                border: '1px solid var(--border-color)'
            }}>
                <p>No code available</p>
            </div>
        );
    }
    
    const containerStyles: React.CSSProperties = {
        display: 'flex',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'rgba(var(--card-bg-base-rgb), 0.7)', // Integrated background
        backdropFilter: 'blur(30px) saturate(140%)',
        WebkitBackdropFilter: 'blur(30px) saturate(140%)',
        borderRadius: '12px',
        border: 'none' // No border
    };
    
    const sidebarStyles: React.CSSProperties = {
        width: '220px',
        borderRight: '1px solid rgba(var(--border-color-rgb), 0.3)',
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent', // Transparent to blend with container
        overflow: 'hidden'
    };
    
    const explorerHeaderStyles: React.CSSProperties = {
        padding: '8px 12px',
        fontSize: '11px',
        fontWeight: 500,
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(0, 0, 0, 0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    };
    
    const fileTreeStyles: React.CSSProperties = {
        flex: 1,
        overflow: 'auto',
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: '4px 0'
    };
    
    const mainContentStyles: React.CSSProperties = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'transparent', // Transparent - container has background
        border: 'none'
    };
    
    const tabBarStyles: React.CSSProperties = {
        display: 'flex',
        background: 'rgba(0, 0, 0, 0.03)',
        borderBottom: '1px solid var(--border-color)',
        height: '35px',
        alignItems: 'center',
        paddingLeft: '8px',
        gap: '1px'
    };
    
    return (
        <div style={containerStyles}>
            {/* File Explorer Sidebar */}
            <div style={sidebarStyles}>
                <div style={explorerHeaderStyles}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>folder_open</span>
                    <span>EXPLORER</span>
                </div>
                <div style={fileTreeStyles} className="custom-scrollbar">
                    {renderFileTree(fileTree)}
                </div>
                {/* Action Buttons */}
                <div style={{ 
                    padding: '12px', 
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
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
            
            {/* Main Content Area */}
            <div style={mainContentStyles}>
                {/* Tab Bar */}
                <div style={tabBarStyles}>
                    {currentFile && (
                        <div style={{
                            background: 'rgba(var(--card-bg-base-rgb), 0.4)',
                            padding: '4px 12px',
                            borderTop: 'none', // No blue border
                            color: 'var(--text-color)',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                {getFileIcon(currentFile.path)}
                            </span>
                            <span>{currentFile.path.split('/').pop()}</span>
                            {readOnly && (
                                <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    background: 'var(--warning-bg, rgba(255, 193, 7, 0.2))',
                                    color: 'var(--warning-color, #ffc107)',
                                    borderRadius: '3px',
                                    marginLeft: '8px'
                                }}>READ ONLY</span>
                            )}
                        </div>
                    )}
                </div>
                
                {/* Breadcrumb - REMOVED to avoid duplicate file name display */}
                
                {/* Editor */}
                <div style={{ 
                    flex: 1, 
                    overflow: 'hidden',
                    background: 'transparent', // Let Monaco theme control background
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none'
                }}>
                    {currentFile && themeInitialized && (
                        <Editor
                            height="100%"
                            language={currentFile.language || 'typescript'}
                            value={currentFile.content}
                            onChange={handleFileContentChange}
                            theme={isDark ? 'system-theme-dark' : 'system-theme-light'}
                            options={{
                                minimap: { enabled: false }, // DISABLED minimap
                                scrollBeyondLastLine: false,
                                fontSize: 20,
                                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                                lineNumbers: 'on',
                                renderWhitespace: 'selection',
                                tabSize: 2,
                                wordWrap: 'on',
                                automaticLayout: true,
                                overviewRulerBorder: false,
                                overviewRulerLanes: 0,
                                hideCursorInOverviewRuler: true,
                                readOnly: readOnly,
                                quickSuggestions: !readOnly,
                                suggestOnTriggerCharacters: !readOnly,
                                formatOnPaste: !readOnly,
                                formatOnType: !readOnly,
                                // Enhanced editor features
                                colorDecorators: true,
                                folding: true,
                                foldingHighlight: true,
                                matchBrackets: 'always',
                                links: true,
                                contextmenu: true,
                                // Completely disable all error/warning decorations
                                glyphMargin: false,
                                renderValidationDecorations: 'off',
                                renderLineHighlight: 'none', // No line highlighting
                                occurrencesHighlight: false,
                                selectionHighlight: false,
                                hover: {
                                    enabled: false // Disable hover to avoid error tooltips
                                },
                                renderIndicators: false,
                                guides: {
                                    indentation: false,
                                    highlightIndentation: false
                                },
                                scrollbar: {
                                    vertical: 'visible',
                                    horizontal: 'visible'
                                },
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonacoFileEditor;
