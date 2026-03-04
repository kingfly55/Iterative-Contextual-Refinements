import { globalState } from '../../../Core/State';

export interface FileData {
    base64: string;
    mimeType: string;
    name: string;
    size: number;
}

export interface FileTypeConfig {
    icon: string;
    color: string;
    label: string;
}

export const FILE_TYPE_CONFIG: Record<string, FileTypeConfig> = {
    'image/png': { icon: 'image', color: '#10b981', label: 'PNG' },
    'image/jpeg': { icon: 'image', color: '#10b981', label: 'JPG' },
    'image/gif': { icon: 'gif', color: '#8b5cf6', label: 'GIF' },
    'image/webp': { icon: 'image', color: '#10b981', label: 'WEBP' },
    'application/pdf': { icon: 'picture_as_pdf', color: '#ef4444', label: 'PDF' },
    'text/plain': { icon: 'description', color: '#6b7280', label: 'TXT' },
    'text/html': { icon: 'code', color: '#f97316', label: 'HTML' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { icon: 'description', color: '#3b82f6', label: 'DOCX' },
    'text/csv': { icon: 'table_chart', color: '#22c55e', label: 'CSV' },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { icon: 'table_chart', color: '#22c55e', label: 'XLSX' },
    'text/x-python': { icon: 'code', color: '#3776ab', label: 'PY' },
    'application/x-python': { icon: 'code', color: '#3776ab', label: 'PY' },
    'text/javascript': { icon: 'javascript', color: '#f7df1e', label: 'JS' },
    'application/javascript': { icon: 'javascript', color: '#f7df1e', label: 'JS' },
    'text/x-c++src': { icon: 'code', color: '#00599c', label: 'CPP' },
    'application/json': { icon: 'data_object', color: '#6b7280', label: 'JSON' },
    'video/mp4': { icon: 'movie', color: '#a855f7', label: 'MP4' },
    'video/webm': { icon: 'movie', color: '#a855f7', label: 'WEBM' },
    'video/quicktime': { icon: 'movie', color: '#a855f7', label: 'MOV' },
};

export const ACCEPTED_FILES = [
    'image/*',
    '.pdf', '.txt', '.html', '.docx',
    '.csv', '.xlsx',
    '.py', '.js', '.cpp', '.json',
    '.mp4', '.webm', '.mov'
].join(',');

export const SIZE_WARNING_THRESHOLD = 15 * 1024 * 1024;

export function getFileConfig(mimeType: string): FileTypeConfig {
    return FILE_TYPE_CONFIG[mimeType] || { icon: 'insert_drive_file', color: '#6b7280', label: 'FILE' };
}

export function isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
}

export function isVideo(mimeType: string): boolean {
    return mimeType.startsWith('video/');
}

export function isPdf(mimeType: string): boolean {
    return mimeType === 'application/pdf';
}

export function isText(mimeType: string): boolean {
    return mimeType.startsWith('text/') || mimeType === 'application/json';
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function calculateTotalSize(files: FileData[]): number {
    return files.reduce((sum, f) => sum + f.size, 0);
}

export function isSizeWarning(totalSize: number): boolean {
    return totalSize > SIZE_WARNING_THRESHOLD;
}

export function decodeBase64Content(base64: string): string {
    try {
        return atob(base64);
    } catch {
        return 'Unable to decode file content';
    }
}

export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
    const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (matches) {
        return {
            mimeType: matches[1],
            base64: matches[2],
        };
    }
    return null;
}

export function createFileData(mimeType: string, base64: string, name: string, size: number): FileData {
    return { mimeType, base64, name, size };
}

export function processFile(file: File): Promise<FileData> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            const parsed = parseDataUrl(result);
            if (parsed) {
                const fileData = createFileData(parsed.mimeType, parsed.base64, file.name, file.size);
                resolve(fileData);
            } else {
                reject(new Error('Invalid file format'));
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

export function processFiles(fileList: FileList | File[]): Promise<FileData[]> {
    const promises = Array.from(fileList).map(file => processFile(file));
    return Promise.all(promises);
}

export function updateGlobalStateWithFiles(files: FileData[]): void {
    globalState.currentProblemImages = files;
}

export function clearGlobalStateFiles(): void {
    globalState.currentProblemImages = [];
}

export function resetFileInput(inputRef: React.RefObject<HTMLInputElement | null>): void {
    if (inputRef.current) {
        inputRef.current.value = '';
    }
}
