
export function renderPrompt(template: string, data: Record<string, string>): string {
    let rendered = template;
    for (const key in data) {
        rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), data[key] || '');
    }
    return rendered;
}
