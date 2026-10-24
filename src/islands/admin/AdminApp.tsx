/** @jsxImportSource preact */
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import './admin.css';
import { LOCALES, type Locale } from '../../shared/enums';
import { createApi, type ApiFailure } from './api';
import { AdminContext, failureMessage, type AdminContextValue } from './context';
import { AuditView } from './AuditView';
import { DetailView } from './DetailView';
import { detectLocale, label, makeT } from './i18n';
import { ListView } from './ListView';
import { RetentionView } from './RetentionView';
import { canUi, guardRoute, parseRoute, type Route } from './state';
import type { AdminRole } from './types';
import { Loading } from './ui';
import { useRecordList } from './useList';

type Me = { email: string; role: AdminRole };
type MeState =
  { phase: 'loading' } | { phase: 'ready'; me: Me } | { phase: 'error'; failure: ApiFailure };

interface Flash {
  text: string;
  tone: 'success' | 'error' | 'quiet';
  at: number;
}

const RELOAD_KEY = 'admin-last-reload';

/** When the sign-in-again reload last ran (a timestamp only, no personal data); "now" if unreadable. */
function lastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    return Date.now();
  }
}

export default function AdminApp() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale(navigator.languages));
  const t = useMemo(() => makeT(locale), [locale]);
  const api = useMemo(() => createApi(), []);
  const [meState, setMeState] = useState<MeState>({ phase: 'loading' });
  const [unauthorized, setUnauthorized] = useState(false);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const navigated = useRef(false);
  const [flash, setFlash] = useState<Flash>({ text: '', tone: 'success', at: 0 });

  const onUnauthorized = useCallback(() => setUnauthorized(true), []);
  const announce = useCallback((text: string, tone: 'success' | 'error' | 'quiet' = 'success') => {
    // Clear first so an identical message is announced again.
    setFlash({ text: '', tone, at: Date.now() });
    window.setTimeout(() => setFlash({ text, tone, at: Date.now() }), 40);
  }, []);

  const recordList = useRecordList(api, onUnauthorized);

  const loadMe = useCallback(async () => {
    setMeState({ phase: 'loading' });
    const res = await api.me();
    if (res.ok) setMeState({ phase: 'ready', me: res.data });
    else {
      if (res.kind === 'unauthorized') onUnauthorized();
      setMeState({ phase: 'error', failure: res });
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    const onHash = () => {
      // Hashes that are not routes (the skip link's #main) leave the view alone.
      if (location.hash === '#main') return;
      navigated.current = true;
      setRoute(parseRoute(location.hash));
      // A result message belongs to the view it was announced in, unless it has only just been set.
      setFlash((f) => (Date.now() - f.at > 1000 ? { ...f, text: '' } : f));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Session expired: show the message, and reload once so Cloudflare Access can ask for a sign-in.
  useEffect(() => {
    if (!unauthorized) return;
    if (Date.now() - lastReload() < 30_000) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* storage unavailable: the reload button remains */
      }
      location.reload();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [unauthorized]);

  const role = meState.phase === 'ready' ? meState.me.role : undefined;
  const effective = guardRoute(route, role);

  useEffect(() => {
    const names: Record<string, string> = {
      list: 'nav.records',
      detail: 'nav.records',
      retention: 'nav.retention',
      audit: 'nav.audit',
    };
    document.title = `${t(names[effective.name] ?? 'nav.records')} – ${t('app.title')}`;
  }, [effective.name, t]);

  const skip = (e: Event) => {
    e.preventDefault();
    document.getElementById('main')?.focus();
  };

  const header = (
    <header class="admin-header">
      <div class="admin-header__inner">
        <p class="admin-header__title">{t('app.title')}</p>
        {meState.phase === 'ready' && (
          <p class="admin-header__user">
            <span>{t('app.signedIn', { email: meState.me.email })}</span>{' '}
            <span class="admin-badge" data-testid="role">
              {t('app.role', { role: label(t, 'role', meState.me.role) })}
            </span>
          </p>
        )}
        <div class="field admin-header__lang">
          <label class="field__label" for="ui-lang">
            {t('app.language')}
          </label>
          <select
            class="select"
            id="ui-lang"
            value={locale}
            onChange={(e) => setLocale(e.currentTarget.value as Locale)}
          >
            {LOCALES.map((l) => (
              <option value={l} key={l}>
                {l.toUpperCase()} · {label(makeT(l), 'locale', l)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {meState.phase === 'ready' && !unauthorized && (
        <nav class="admin-nav" aria-label={t('nav.label')}>
          <a
            href="#/"
            aria-current={
              effective.name === 'list' || effective.name === 'detail' ? 'page' : undefined
            }
          >
            {t('nav.records')}
          </a>
          <a href="#/retention" aria-current={effective.name === 'retention' ? 'page' : undefined}>
            {t('nav.retention')}
          </a>
          {canUi(role, 'audit') && (
            <a href="#/audit" aria-current={effective.name === 'audit' ? 'page' : undefined}>
              {t('nav.audit')}
            </a>
          )}
        </nav>
      )}
    </header>
  );

  let body;
  if (unauthorized) {
    body = (
      <div class="error-summary admin-error" role="alert" data-testid="signin-again">
        <h1 class="admin-heading">{t('app.title')}</h1>
        <p>{t('err.unauthorized')}</p>
        <button type="button" class="btn btn-primary btn-s" onClick={() => location.reload()}>
          {t('common.reload')}
        </button>
      </div>
    );
  } else if (meState.phase === 'loading') {
    body = <Loading label={t('common.loading')} />;
  } else if (meState.phase === 'error') {
    body = (
      <div class="error-summary admin-error" role="alert">
        <h1 class="admin-heading">{t('app.title')}</h1>
        <p>
          {meState.failure.kind === 'forbidden'
            ? t('err.notListed')
            : failureMessage(t, meState.failure)}
        </p>
        {meState.failure.kind !== 'forbidden' && (
          <button type="button" class="btn btn-secondary btn-s" onClick={() => void loadMe()}>
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  } else {
    const focus = navigated.current;
    const me = meState.me;
    const ctx: AdminContextValue = {
      t,
      locale,
      api,
      role: me.role,
      email: me.email,
      announce,
      onUnauthorized,
    };
    let view;
    switch (effective.name) {
      case 'detail':
        view = (
          <DetailView
            key={effective.id}
            type={effective.type}
            id={effective.id}
            focus={focus}
            onChanged={recordList.markStale}
            onGone={() => {
              recordList.markStale();
              location.hash = '#/';
            }}
          />
        );
        break;
      case 'retention':
        view = <RetentionView focus={focus} onPurged={recordList.markStale} />;
        break;
      case 'audit':
        view = <AuditView focus={focus} />;
        break;
      default:
        view = <ListMount recordList={recordList} focus={focus} />;
    }
    body = <AdminContext.Provider value={ctx}>{view}</AdminContext.Provider>;
  }

  return (
    <div class="admin-app">
      <a class="skip-link" href="#main" onClick={skip}>
        {t('app.skip')}
      </a>
      {header}
      <main id="main" tabIndex={-1} class="admin-main">
        <div class="container">
          <div
            class={`admin-flash${flash.text ? ` admin-flash--${flash.tone}` : ''}${flash.tone === 'quiet' ? ' visually-hidden' : ''}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {flash.text}
          </div>
          {body}
        </div>
      </main>
    </div>
  );
}

/** Loads the list on first visit, and again after a change elsewhere made it stale. */
function ListMount(props: { recordList: ReturnType<typeof useRecordList>; focus: boolean }) {
  const { filters, list, apply, load, isStale } = props.recordList;
  useEffect(() => {
    if (isStale()) void load(filters, false);
    // Mount only: filter changes call `apply` directly.
  }, []);
  return (
    <ListView
      filters={filters}
      list={list}
      focus={props.focus}
      apply={apply}
      loadMore={() => void load(filters, true)}
      reload={() => void load(filters, false)}
    />
  );
}
