/**
 * Conversion events (brief §13). A no-op unless PUBLIC_ANALYTICS_PROVIDER was set at build time; then
 * it posts the fixed event enum to the first-party /api/e relay (ADR-0001 D12). No ids, no free text,
 * no form values: only the enum properties the relay accepts.
 */
export type EventName =
  'enroll_start' | 'enroll_step' | 'enroll_submit' | 'contact_submit' | 'visit_request';
export type EventProps = Record<string, string | number>;

interface TrackerDeps {
  provider: string | undefined;
  send: (url: string, body: { name: string; props?: EventProps; path: string }) => void;
  path: () => string;
}

export function createTracker(deps: TrackerDeps) {
  return (name: EventName, props?: EventProps): void => {
    if (!deps.provider) return;
    try {
      const body = { name, ...(props ? { props } : {}), path: deps.path() };
      deps.send('/api/e', body);
    } catch {
      /* analytics must never break a form */
    }
  };
}

function beacon(url: string, body: unknown): void {
  const data = JSON.stringify(body);
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    if (navigator.sendBeacon(url, new Blob([data], { type: 'application/json' }))) return;
  }
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: data,
    keepalive: true,
  }).catch(() => undefined);
}

export const track = createTracker({
  provider: import.meta.env.PUBLIC_ANALYTICS_PROVIDER as string | undefined,
  send: beacon,
  path: () => location.pathname,
});
