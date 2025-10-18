/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ArXiv API integration for SearchAcademia tool
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface ArxivPaper {
    id: string;
    title: string;
    authors: string[];
    abstract: string;
    published: string;
    updated: string;
    categories: string[];
    pdfUrl: string;
    arxivUrl: string;
    journalRef?: string;
    doi?: string;
}

export interface ArxivSearchOptions {
    searchType: 'simple' | 'and_terms';
    query?: string;
    terms?: string[];
    maxResults?: number;
    startIndex?: number;
}

/**
 * Search arXiv papers using the API
 */
export async function searchArxiv(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
    let searchQuery = '';
    
    if (options.searchType === 'simple' && options.query) {
        // Simple search across all fields
        searchQuery = `all:${encodeURIComponent(options.query)}`;
    } else if (options.searchType === 'and_terms' && options.terms && options.terms.length > 0) {
        // Multiple terms with AND
        searchQuery = options.terms.map(term => `all:${encodeURIComponent(term)}`).join('+AND+');
    } else {
        throw new Error('Invalid search options');
    }
    
    const maxResults = options.maxResults || 10;
    const startIndex = options.startIndex || 0;
    
    const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=${startIndex}&max_results=${maxResults}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`arXiv API error: ${response.status}`);
        }
        
        const xmlText = await response.text();
        return parseArxivResponse(xmlText);
    } catch (error) {
        console.error('Error fetching from arXiv:', error);
        throw new Error(`Failed to search arXiv: ${error}`);
    }
}

/**
 * Parse arXiv API XML response
 */
function parseArxivResponse(xmlText: string): ArxivPaper[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    const entries = doc.getElementsByTagName('entry');
    const papers: ArxivPaper[] = [];
    
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        
        // Extract ID from the entry id URL
        const idElement = entry.getElementsByTagName('id')[0];
        const fullId = idElement?.textContent || '';
        const arxivId = fullId.split('/abs/')?.pop() || fullId;
        
        // Extract title
        const titleElement = entry.getElementsByTagName('title')[0];
        const title = titleElement?.textContent?.trim() || '';
        
        // Extract authors
        const authorElements = entry.getElementsByTagName('author');
        const authors: string[] = [];
        for (let j = 0; j < authorElements.length; j++) {
            const nameElement = authorElements[j].getElementsByTagName('name')[0];
            if (nameElement?.textContent) {
                authors.push(nameElement.textContent.trim());
            }
        }
        
        // Extract abstract
        const summaryElement = entry.getElementsByTagName('summary')[0];
        const abstract = summaryElement?.textContent?.trim() || '';
        
        // Extract dates
        const publishedElement = entry.getElementsByTagName('published')[0];
        const published = publishedElement?.textContent || '';
        
        const updatedElement = entry.getElementsByTagName('updated')[0];
        const updated = updatedElement?.textContent || '';
        
        // Extract categories
        const categoryElements = entry.getElementsByTagName('category');
        const categories: string[] = [];
        for (let j = 0; j < categoryElements.length; j++) {
            const term = categoryElements[j].getAttribute('term');
            if (term) {
                categories.push(term);
            }
        }
        
        // Extract links
        const linkElements = entry.getElementsByTagName('link');
        let pdfUrl = '';
        let arxivUrl = '';
        
        for (let j = 0; j < linkElements.length; j++) {
            const link = linkElements[j];
            const type = link.getAttribute('type');
            const href = link.getAttribute('href');
            
            if (type === 'application/pdf' && href) {
                pdfUrl = href;
            } else if (link.getAttribute('rel') === 'alternate' && href) {
                arxivUrl = href;
            }
        }
        
        // Extract journal reference if available
        const journalRefElement = entry.getElementsByTagName('arxiv:journal_ref')[0];
        const journalRef = journalRefElement?.textContent?.trim();
        
        // Extract DOI if available
        const doiElement = entry.getElementsByTagName('arxiv:doi')[0];
        const doi = doiElement?.textContent?.trim();
        
        papers.push({
            id: arxivId,
            title,
            authors,
            abstract,
            published,
            updated,
            categories,
            pdfUrl,
            arxivUrl,
            journalRef,
            doi
        });
    }
    
    return papers;
}

/**
 * Fetch full PDF content of a paper and extract text
 * Returns the complete text content extracted from all pages of the PDF
 */
export async function fetchPaperPDF(pdfUrl: string): Promise<string> {
    try {
        // Fetch the PDF binary data
        const response = await fetch(pdfUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        
        // Extract text from the PDF
        const textContent = await extractTextFromPDF(arrayBuffer);
        return textContent;
    } catch (error) {
        console.error('Error fetching PDF:', error);
        throw new Error(`Failed to fetch paper PDF: ${error}`);
    }
}

/**
 * Extract full text content from a PDF ArrayBuffer
 * Processes all pages and returns complete text content
 */
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
        // Load the PDF document
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        const totalPages = pdf.numPages;
        const textParts: string[] = [];
        
        // Extract text from each page
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Combine all text items from the page
            const pageText = textContent.items
                .map((item: any) => {
                    // Handle both TextItem and TextMarkedContent
                    if ('str' in item) {
                        return item.str;
                    }
                    return '';
                })
                .join(' ');
            
            // Add page separator for readability
            textParts.push(`\n\n--- Page ${pageNum} ---\n\n${pageText}`);
        }
        
        // Combine all pages into a single text
        const fullText = textParts.join('\n');
        
        // Clean up excessive whitespace while preserving structure
        const cleanedText = fullText
            .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
            .replace(/ \n /g, '\n')  // Clean up spaces around newlines
            .replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines to 2
            .trim();
        
        return cleanedText;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error(`Failed to extract text from PDF: ${error}`);
    }
}

/**
 * Format paper for display
 */
export function formatPaperForDisplay(paper: ArxivPaper): string {
    const lines: string[] = [];
    
    lines.push(`Title: ${paper.title}`);
    lines.push(`Authors: ${paper.authors.join(', ')}`);
    lines.push(`Published: ${new Date(paper.published).toLocaleDateString()}`);
    
    if (paper.updated !== paper.published) {
        lines.push(`Updated: ${new Date(paper.updated).toLocaleDateString()}`);
    }
    
    lines.push(`Categories: ${paper.categories.join(', ')}`);
    
    if (paper.journalRef) {
        lines.push(`Journal Reference: ${paper.journalRef}`);
    }
    
    if (paper.doi) {
        lines.push(`DOI: ${paper.doi}`);
    }
    
    lines.push(`arXiv ID: ${paper.id}`);
    lines.push(`PDF: ${paper.pdfUrl}`);
    lines.push(`URL: ${paper.arxivUrl}`);
    lines.push('');
    lines.push('Abstract:');
    lines.push(paper.abstract);
    
    return lines.join('\n');
}
