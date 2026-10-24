/** @jsxImportSource preact */
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from './api';
import { failureMessage, useAdmin } from './context';
import { formatDateTime } from './i18n';
import { canUi, confirmationMatches } from './state';
import type { RetentionData } from './types';
import { ErrorBox, FormError, Loading, ViewHeading } from './ui';

export function RetentionView(props: { focus: boolean; onPurged: () => void }) {
  const { t, api, role, locale, announce, onUnauthorized } = useAdmin();
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'error'; failure: ApiFailure }
    | { phase: 'ready'; data: RetentionData }
  >({ phase: 'loading' });
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const word = t('retention.purgeWord');
  const armed = confirmationMatches(typed, word);

  const load = useCallback(async () => {
    const res = await api.retention();
    if (res.ok) setState({ phase: 'ready', data: res.data });
    else {
      if (res.kind === 'unauthorized') onUnauthorized();
      setState({ phase: 'error', failure: res });
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const purge = async (e: Event) => {
    e.preventDefault();
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    const res = await api.purge();
    setBusy(false);
    if (!res.ok) {
      if (res.kind === 'unauthorized') return onUnauthorized();
      setError(failureMessage(t, res));
      return;
    }
    setTyped('');
    props.onPurged();
    announce(
      t('retention.purged', {
        inquiries: res.data.inquiries,
        applications: res.data.applications,
        consents: res.data.consents,
        audit: res.data.audit_rows,
      }),
    );
    await load();
  };

  const rows =
    state.phase === 'ready'
      ? ([
          ['retention.inquiries', state.data.inquiries],
          ['retention.applications', state.data.applications],
          ['retention.consents', state.data.consents],
          ['retention.audit', state.data.audit_rows],
        ] as const)
      : [];
  const total = rows.reduce((n, [, v]) => n + v, 0);

  return (
    <section aria-labelledby="view-title" class="admin-section">
      <ViewHeading focus={props.focus} id="view-title">
        {t('retention.heading')}
      </ViewHeading>
      <p>{t('retention.intro')}</p>
      {state.phase === 'loading' && <Loading label={t('common.loading')} />}
      {state.phase === 'error' && (
        <ErrorBox
          failure={state.failure}
          onRetry={() => {
            setState({ phase: 'loading' });
            void load();
          }}
        />
      )}
      {state.phase === 'ready' && (
        <>
          <div class="admin-table-wrap">
            <table class="admin-table admin-table--narrow">
              <caption>{t('retention.table')}</caption>
              <tbody>
                {rows.map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{t(k)}</th>
                    <td data-testid={k}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="form-note">
            {t('retention.asOf', { when: formatDateTime(state.data.as_of, locale) })}
          </p>
          {total === 0 && <p>{t('retention.nothing')}</p>}
        </>
      )}
      {canUi(role, 'purge') && state.phase === 'ready' && (
        <section aria-labelledby="h-purge" class="admin-panel admin-panel--danger">
          <h2 id="h-purge">{t('retention.purgeHeading')}</h2>
          <p id="purge-help">{t('retention.purgeHelp')}</p>
          <form class="admin-inline-form" onSubmit={purge}>
            <div class="field">
              <label class="field__label" for="purge-confirm">
                {t('retention.purgeLabel', { word })}
              </label>
              <input
                class="input"
                id="purge-confirm"
                type="text"
                autocomplete="off"
                spellcheck={false}
                aria-describedby="purge-help"
                value={typed}
                onInput={(e) => setTyped(e.currentTarget.value)}
              />
            </div>
            <button type="submit" class="btn btn-primary" aria-disabled={!armed || busy}>
              {t('retention.purgeButton')}
            </button>
          </form>
          <FormError message={error} />
        </section>
      )}
    </section>
  );
}
