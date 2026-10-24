type Json = { [k: string]: Json } | Json[] | string | number | boolean | null;
export const RETENTION_KEYS: string[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJsonc(text: string): any;
export function preflight(i: {
  production: boolean;
  env: Record<string, string | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrangler: any;
  redirects?: string;
  routes?: Json;
  devVarsExample?: string;
}): { errors: string[]; warnings: string[] };
