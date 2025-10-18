/**
 * React Build Manager - Handles building React applications in the browser
 * Uses esbuild-wasm for in-browser compilation
 */

import * as esbuild from 'esbuild-wasm';
import { ReactPipelineState } from '../index.tsx';

// Build configuration interface
interface BuildConfig {
    entryPoint: string;
    files: Map<string, string>;
    external?: string[];
}

interface BuildResult {
    success: boolean;
    errors: string[];
    warnings: string[];
    outputFiles?: esbuild.OutputFile[];
}

// Initialize esbuild once
let esbuildInitialized = false;
let initPromise: Promise<void> | null = null;

async function initializeEsbuild(): Promise<void> {
    if (esbuildInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            await esbuild.initialize({
                wasmURL: 'https://unpkg.com/esbuild-wasm@0.25.10/esbuild.wasm',
                worker: true
            });
            // Small delay to ensure WASM module is fully ready
            await new Promise(resolve => setTimeout(resolve, 100));
            esbuildInitialized = true;
        } catch (error) {
            // Reset on failure so it can be retried
            initPromise = null;
            esbuildInitialized = false;
            throw new Error(`Failed to initialize esbuild: ${error instanceof Error ? error.message : String(error)}`);
        }
    })();

    await initPromise;
}

/**
 * Parse concatenated code into individual files
 */
export function parseFilesFromConcatenatedCode(concatenatedCode: string): Map<string, string> {
    const files = new Map<string, string>();

    // Regular expression to match file markers
    // Supports both /* --- File: ... --- */ and // --- FILE: ... ---
    const fileMarkerRegex = /(?:\/\*\s*---\s*(?:File|FILE|Code from Agent \d+):\s*(.+?)\s*---\s*\*\/|\/\/\s*---\s*(?:File|FILE):\s*(.+?)\s*---)/gi;

    let lastIndex = 0;
    let lastFileName: string | null = null;
    let match;

    while ((match = fileMarkerRegex.exec(concatenatedCode)) !== null) {
        if (lastFileName) {
            // Extract content between previous marker and current marker
            const content = concatenatedCode.substring(lastIndex, match.index).trim();
            if (content) {
                files.set(lastFileName, content);
            }
        }

        // Extract filename from the marker
        let fileName = match[1].trim();

        // Clean up the filename
        fileName = fileName.replace(/^Agent\s*\d+:\s*/i, ''); // Remove "Agent N:" prefix
        fileName = fileName.replace(/\s*-\s*FAILED$/, ''); // Remove "- FAILED" suffix
        fileName = fileName.replace(/\s*-\s*CANCELLED$/, ''); // Remove "- CANCELLED" suffix

        // Normalize file paths
        if (!fileName.startsWith('/') && !fileName.startsWith('./') && !fileName.match(/^[a-zA-Z]:/)) {
            // If it's not an absolute path or relative path, assume it's a src file
            if (!fileName.startsWith('src/') && !fileName.startsWith('public/') &&
                fileName !== 'package.json' && fileName !== 'tsconfig.json' &&
                !fileName.endsWith('.html')) {
                fileName = 'src/' + fileName;
            }
        }

        // Ensure proper file extensions
        if (!fileName.includes('.')) {
            if (fileName.includes('component') || fileName.includes('Component')) {
                fileName += '.tsx';
            } else if (fileName === 'package' || fileName === 'package.json') {
                fileName = 'package.json';
            } else {
                fileName += '.ts';
            }
        }

        lastFileName = fileName;
        lastIndex = match.index + match[0].length;
    }

    // Get the last file's content
    if (lastFileName) {
        const content = concatenatedCode.substring(lastIndex).trim();
        if (content) {
            files.set(lastFileName, content);
        }
    }

    // If no file markers found, treat entire content as a single file
    if (files.size === 0) {
        // Check if it looks like a React component
        if (concatenatedCode.includes('import React') || concatenatedCode.includes('export default')) {
            files.set('src/App.tsx', concatenatedCode);
        } else {
            files.set('src/index.tsx', concatenatedCode);
        }
    }

    // Ensure essential files exist
    ensureEssentialFiles(files);

    return files;
}

/**
 * Ensure essential files for a React app exist
 */
function ensureEssentialFiles(files: Map<string, string>) {
    // Ensure package.json exists
    if (!files.has('package.json')) {
        files.set('package.json', JSON.stringify({
            name: 'react-app',
            version: '1.0.0',
            private: true,
            dependencies: {
                'react': '^18.2.0',
                'react-dom': '^18.2.0'
            },
            devDependencies: {
                '@types/react': '^18.2.0',
                '@types/react-dom': '^18.2.0',
                'typescript': '^5.0.0'
            }
        }, null, 2));
    }

    // Ensure index.html exists
    if (!files.has('public/index.html') && !files.has('index.html')) {
        files.set('public/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React App</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
</body>
</html>`);
    }

    // Ensure entry point exists
    if (!files.has('src/index.tsx') && !files.has('src/index.ts') && !files.has('src/index.jsx') && !files.has('src/index.js')) {
        // Check if there's an App component
        let hasAppComponent = false;
        let appComponentPath = '';
        for (const [fileName] of files) {
            if (fileName.includes('App') || fileName.includes('app')) {
                hasAppComponent = true;
                appComponentPath = fileName;
                break;
            }
        }

        if (hasAppComponent) {
            // Determine the correct import path for App
            let importPath = './App';
            if (appComponentPath.startsWith('src/')) {
                importPath = './' + appComponentPath.substring(4).replace(/\.(tsx|ts|jsx|js)$/, '');
            }

            files.set('src/index.tsx', `import ReactDOM from 'react-dom/client';
import App from '${importPath}';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);`);
        } else {
            // Create a minimal app
            files.set('src/index.tsx', `import ReactDOM from 'react-dom/client';

const App = () => {
  return (
    <div>
      <h1>React App</h1>
      <p>Welcome to your React application!</p>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);`);
        }
    }
}

/**
 * Build React application using esbuild
 */
export async function buildReactApp(concatenatedCode: string): Promise<BuildResult> {
    try {
        // Initialize esbuild if needed
        await initializeEsbuild();

        // Double-check initialization completed
        if (!esbuildInitialized) {
            throw new Error('esbuild initialization failed - WASM module not ready');
        }

        // Parse files from concatenated code
        const files = parseFilesFromConcatenatedCode(concatenatedCode);

        // Find entry point
        let entryPoint = 'src/index.tsx';
        if (!files.has(entryPoint)) {
            // Try other common entry points
            const possibleEntries = ['src/index.ts', 'src/index.jsx', 'src/index.js', 'index.tsx', 'index.ts', 'index.jsx', 'index.js'];
            for (const entry of possibleEntries) {
                if (files.has(entry)) {
                    entryPoint = entry;
                    break;
                }
            }
        }

        // Create virtual file system for esbuild
        const virtualFS: Record<string, string> = {};
        files.forEach((content, path) => {
            virtualFS[path] = content;
        });

        // Build configuration
        const buildOptions: esbuild.BuildOptions = {
            stdin: {
                contents: virtualFS[entryPoint] || '',
                resolveDir: '/',
                sourcefile: entryPoint,
                loader: entryPoint.endsWith('.tsx') ? 'tsx' :
                    entryPoint.endsWith('.ts') ? 'ts' :
                        entryPoint.endsWith('.jsx') ? 'jsx' : 'js'
            },
            bundle: true,
            write: false,
            format: 'esm',
            target: 'es2020',
            jsx: 'automatic',
            loader: {
                '.tsx': 'tsx',
                '.ts': 'ts',
                '.jsx': 'jsx',
                '.js': 'js',
                '.css': 'css',
                '.json': 'json'
            },
            plugins: [
                {
                    name: 'virtual-fs',
                    setup(build) {
                        // Resolve virtual files
                        build.onResolve({ filter: /.*/ }, (args) => {
                            // First check: direct path in virtual FS (handles entry point and absolute paths)
                            if (virtualFS[args.path]) {
                                return { path: args.path, namespace: 'virtual-fs' };
                            }

                            // Second check: resolve relative imports
                            if (args.path.startsWith('.')) {
                                const basePath = args.importer || '';
                                const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
                                let resolvedPath = baseDir + '/' + args.path;

                                // Normalize path
                                resolvedPath = resolvedPath.split('/').reduce((acc, part) => {
                                    if (part === '..') {
                                        acc.pop();
                                    } else if (part !== '.' && part !== '') {
                                        acc.push(part);
                                    }
                                    return acc;
                                }, [] as string[]).join('/');

                                // Try with different extensions
                                const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
                                for (const ext of extensions) {
                                    const fullPath = resolvedPath + ext;
                                    if (virtualFS[fullPath]) {
                                        return { path: fullPath, namespace: 'virtual-fs' };
                                    }
                                }
                            }

                            // Third check: mark node_modules and other external dependencies as external
                            if (args.path.startsWith('react') ||
                                args.path.startsWith('@') ||
                                (!args.path.startsWith('.') && !args.path.startsWith('/'))) {
                                return { external: true };
                            }

                            // Default: mark as external if not found
                            return { external: true };
                        });

                        // Load virtual files
                        build.onLoad({ filter: /.*/, namespace: 'virtual-fs' }, (args) => {
                            const content = virtualFS[args.path];
                            if (!content) {
                                return { errors: [{ text: `File not found: ${args.path}` }] };
                            }

                            let loader: esbuild.Loader = 'tsx';
                            if (args.path.endsWith('.ts')) loader = 'ts';
                            else if (args.path.endsWith('.jsx')) loader = 'jsx';
                            else if (args.path.endsWith('.js')) loader = 'js';
                            else if (args.path.endsWith('.css')) loader = 'css';
                            else if (args.path.endsWith('.json')) loader = 'json';

                            return { contents: content, loader };
                        });
                    }
                }
            ]
        };

        // Run the build
        const result = await esbuild.build(buildOptions);

        // Format errors and warnings (formatMessages is async)
        const formattedErrors = await Promise.all(
            result.errors.map(async (e) => {
                try {
                    const formatted = await esbuild.formatMessages([e], { kind: 'error', color: false });
                    return formatted[0] || e.text;
                } catch {
                    return e.text;
                }
            })
        );

        const formattedWarnings = await Promise.all(
            result.warnings.map(async (w) => {
                try {
                    const formatted = await esbuild.formatMessages([w], { kind: 'warning', color: false });
                    return formatted[0] || w.text;
                } catch {
                    return w.text;
                }
            })
        );

        return {
            success: formattedErrors.length === 0,
            errors: formattedErrors,
            warnings: formattedWarnings,
            outputFiles: result.outputFiles
        };

    } catch (error) {
        console.error('Build error:', error);
        return {
            success: false,
            errors: [error instanceof Error ? error.message : String(error)],
            warnings: []
        };
    }
}

/**
 * Create a preview URL for the built application
 */
export function createPreviewUrl(buildResult: BuildResult, files: Map<string, string>): string | null {
    if (!buildResult.success || !buildResult.outputFiles || buildResult.outputFiles.length === 0) {
        return null;
    }

    // Get the bundled JavaScript
    const jsBundle = buildResult.outputFiles[0].text;

    // Get or create HTML
    let htmlContent = files.get('public/index.html') || files.get('index.html');
    if (!htmlContent) {
        htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React App Preview</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>`;
    }

    // Inject the bundle into HTML
    const scriptTag = `
<script type="module">
// React and ReactDOM from CDN
import React from 'https://esm.sh/react@18';
import ReactDOM from 'https://esm.sh/react-dom@18/client';
window.React = React;
window.ReactDOM = ReactDOM;

// App bundle
${jsBundle}
</script>`;

    // Insert script before closing body tag
    htmlContent = htmlContent.replace('</body>', scriptTag + '\n</body>');

    // Create blob URL
    const blob = new Blob([htmlContent], { type: 'text/html' });
    return URL.createObjectURL(blob);
}
