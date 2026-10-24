export function startDevAccessProxy(opts: {
  target: string;
  issuer: string;
  audience: string;
  port?: number;
  certsPort?: number;
  host?: string;
  defaultEmail?: string;
}): Promise<{ url: string; certsUrl: string; close: () => Promise<void> }>;
