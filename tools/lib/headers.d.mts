export const MAX_RULES: number;
export const MAX_LINE: number;
export function scanHtml(
  html: string,
  opts?: { allowInlineStyle?: boolean; cms?: boolean; rootRedirect?: boolean },
): { violations: string[] };
export function renderHeaders(template: string, o: { noindex: boolean }): string;
export function validateHeadersFile(text: string): void;
export function parseHeadersFile(text: string): {
  path: string;
  headers: { name: string; value: string; detach: boolean }[];
}[];
export function adminCspProblems(
  blocks: { path: string; headers: { name: string; value: string; detach: boolean }[] }[],
): string[];
