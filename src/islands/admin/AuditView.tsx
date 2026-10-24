/** @jsxImportSource preact */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ApiFailure } from './api';
import { useAdmin } from './context';
import { formatDateTime, label } from './i18n';
import { shortId } from './state';
import type { AuditRow } from './types';
import { ErrorBox, Loading, ViewHeading } from './ui';

export function AuditView(props: { focus: boolean }) {
  const { t, api, locale, announce, onUnauthorized } = useAdmin();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [firstNew, setFirstNew] = useState(-1);
  const firstRef = useRef<HTMLTableCellElement>(null);
  const count = useRef(0);

  const load = useCallback(
    async (cursor: string | null) => {
      setPhase('loading');
      const res = await api.audit(cursor);
      if (!res.ok) {
        if (res.kind === 'unauthorized') onUnauthorized();
        setFailure(res);
        setPhase('error');
        return;
      }
      setRows((prev) => (cursor ? [...prev, ...res.data.items] : res.data.items));
      setFirstNew(cursor ? count.current : -1);
      count.current = cursor ? count.current + res.data.items.length : res.data.items.length;
      setNext(res.data.next_cursor);
      setPhase('ready');
      if (cursor) announce(t('list.loadedMore', { n: res.data.items.length }), 'quiet');
    },
    [api, onUnauthorized, announce, t],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  useEffect(() => {
    if (firstNew >= 0 && phase === 'ready') firstRef.current?.focus();
  }, [firstNew, phase]);

  return (
    <section aria-labelledby="view-title" class="admin-section">
      <ViewHeading focus={props.focus} id="view-title">
        {t('audit.heading')}
      </ViewHeading>
      <p>{t('audit.intro')}</p>
      {phase === 'error' && failure && (
        <ErrorBox failure={failure} onRetry={() => void load(null)} />
      )}
      {phase === 'loading' && rows.length === 0 && <Loading label={t('common.loading')} />}
      {phase === 'ready' && rows.length === 0 && <p class="admin-empty">{t('audit.empty')}</p>}
      {rows.length > 0 && (
        <div class="admin-table-wrap" role="region" tabIndex={0} aria-label={t('audit.caption')}>
          <table class="admin-table" data-testid="audit-table">
            <caption class="visually-hidden">{t('audit.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('audit.col.when')}</th>
                <th scope="col">{t('audit.col.actor')}</th>
                <th scope="col">{t('audit.col.action')}</th>
                <th scope="col">{t('audit.col.subject')}</th>
                <th scope="col">{t('audit.col.details')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} data-action={r.action}>
                  <th
                    scope="row"
                    ref={i === firstNew ? firstRef : undefined}
                    tabIndex={i === firstNew ? -1 : undefined}
                  >
                    <time dateTime={r.at}>{formatDateTime(r.at, locale)}</time>
                  </th>
                  <td>
                    {r.actor_email} ({label(t, 'role', r.actor_role)})
                  </td>
                  <td>{label(t, 'audit.action', r.action)}</td>
                  <td>
                    {r.subject_type === 'bulk'
                      ? t('audit.subject.bulk')
                      : `${label(t, 'type', `${r.subject_type}.single`)}${r.subject_id ? ` ${shortId(r.subject_id)}` : ''}`}
                  </td>
                  <td>{r.details && <code class="admin-code">{r.details}</code>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {phase === 'loading' && rows.length > 0 && <Loading label={t('common.loading')} />}
      {next && phase !== 'loading' && (
        <button type="button" class="btn btn-secondary" onClick={() => void load(next)}>
          {t('audit.loadMore')}
        </button>
      )}
    </section>
  );
}
