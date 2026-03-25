import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    define: {
      'process.env.AI_API_KEY': JSON.stringify(env.AI_API_KEY || env.GEMINI_API_KEY),
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    base: '/Iterative-Contextual-Refinements/',
    server: {
      proxy: {
        '/cliproxy': {
          target: env.VITE_CLIPROXY_BASE_URL || 'http://localhost:8317',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/cliproxy/, ''),
        }
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) {
              return; // Let app code be handled by default splitting
            }


            // AI Provider SDKs
            if (id.includes('@anthropic-ai') || id.includes('@google/genai') || id.includes('node_modules/openai')) {
              return 'vendor-ai';
            }
            // LangChain ecosystem
            if (id.includes('langchain') || id.includes('langsmith')) {
              return 'vendor-langchain';
            }
            // PDF processing
            if (id.includes('pdfjs-dist')) {
              return 'vendor-pdf';
            }
            // React core
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            // Markdown/math rendering
            if (id.includes('remark-') || id.includes('rehype-') || id.includes('unified') ||
              id.includes('katex') || id.includes('node_modules/marked')) {
              return 'vendor-markdown';
            }
            // Diff utilities
            if (id.includes('diff-match-patch') || id.includes('diff2html') || id.includes('node_modules/diff/')) {
              return 'vendor-diff';
            }
            // Syntax highlighting (Shiki)
            if (id.includes('shiki') || id.includes('@shikijs')) {
              return 'vendor-shiki';
            }
            // Other utilities
            if (id.includes('jszip') || id.includes('dompurify') || id.includes('nanoid') ||
              id.includes('node_modules/he/') || id.includes('fuzzball') || id.includes('fast-')) {
              return 'vendor-utils';
            }
          }
        }
      }
    }
  };
});
