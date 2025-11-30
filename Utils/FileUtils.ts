
import JSZip from 'jszip';
import { globalState } from '../Core/State';

export async function createAndDownloadReactProjectZip() {
    if (!globalState.activeReactPipeline || !globalState.activeReactPipeline.finalAppendedCode) {
        alert("No React project code available to download.");
        return;
    }

    const zip = new JSZip();
    const finalCode = globalState.activeReactPipeline.finalAppendedCode;
    const fileMarkerRegex = /^\/\/\s*---\s*FILE:\s*(.*?)\s*---\s*$/m;
    const files: { path: string, content: string }[] = [];

    const parts = finalCode.split(fileMarkerRegex);

    if (parts.length > 1) {
        for (let i = 1; i < parts.length; i += 2) {
            const path = parts[i].trim();
            const content = (parts[i + 1] || '').trim();
            if (path && content) {
                files.push({ path, content });
            }
        }
    }

    if (files.length === 0 && finalCode.length > 0) {
        files.push({ path: "src/App.tsx", content: finalCode });
    }

    files.forEach(file => {
        const correctedPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
        zip.file(correctedPath, file.content);
    });

    try {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const { downloadFile } = await import('../Components/ActionButton');
        downloadFile(zipBlob as any, `react-app-${globalState.activeReactPipeline.id}.zip`, 'application/zip');
    } catch (error) {
        alert("Failed to generate zip file. See console for details.");
    }
}
