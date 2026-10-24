import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Locale } from '../../shared/enums';
import type { AdminApi, ApiFailure } from './api';
import type { Translate } from './i18n';
import type { AdminRole } from './types';

export interface AdminContextValue {
  t: Translate;
  locale: Locale;
  api: AdminApi;
  role: AdminRole;
  email: string;
  /** Visible and announced result message (polite live region). */
  announce: (message: string, tone?: 'success' | 'error' | 'quiet') => void;
  /** Called for any 401 so the whole app can switch to the sign-in-again screen. */
  onUnauthorized: () => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const v = useContext(AdminContext);
  if (!v) throw new Error('AdminContext missing');
  return v;
}

/** Message for a failed call; the field map of a 422 is shown by the form that owns the fields. */
export function failureMessage(t: Translate, f: ApiFailure): string {
  switch (f.kind) {
    case 'unauthorized':
      return t('err.unauthorized');
    case 'network':
      return t('err.network');
    default:
      return t(`err.${f.kind}`);
  }
}
