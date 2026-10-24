import { bundledSettings, type ServerSettings } from './settings';
import type { EmailTransport } from './email/transport';

/** Injectable collaborators. Production wrappers use the defaults; tests override them. */
export interface Deps {
  now(): Date;
  uuid(): string;
  fetch: typeof fetch;
  settings: ServerSettings;
  /** When set, replaces the transport built from config (tests). */
  transport?: EmailTransport;
}

export function resolveDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
    fetch: (input, init) => fetch(input, init),
    settings: bundledSettings,
    ...overrides,
  };
}
