export const MAX_SCRIPT_HASHES: number;
export const MAX_RULES: number;
export const MAX_LINE: number;
export function scanHtml(
  html: string,
  opts?: { allowInlineStyle?: boolean },
): { hashes: string[]; violations: string[] };
export function renderHeaders(template: string, o: { hashes: string[]; noindex: boolean }): string;
export function validateHeadersFile(text: string): void;
