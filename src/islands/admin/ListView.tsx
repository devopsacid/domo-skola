/** @jsxImportSource preact */
import { useEffect, useRef, useState } from 'preact/hooks';
import { GRADES, REGIONS } from '../../shared/enums';
import { useAdmin } from './context';
import { formatDateTime, label } from './i18n';
import {
  INITIAL_FILTERS,
  canUi,
  setFilter,
  shortId,
  statusesFor,
  type Filters,
  type ListState,
} from './state';
import type { RecordListItem, RecordType } from './types';
import { ErrorBox, Loading, ViewHeading } from './ui';

interface Props {
  filters: Filters;
  list: ListState;
  focus: boolean;
  apply: (f: Filters) => void;
  loadMore: () => void;
  reload: () => void;
}

export function ListView(props: Props) {
  const { t, locale, role, api, announce, onUnauthorized } = useAdmin();
  const { filters, list } = props;
  const [draft, setDraft] = useState(filters.q);
  const [exporting, setExporting] = useState(false);
  const firstNewRef = useRef<HTMLAnchorElement>(null);
  const announced = useRef(0);

  // Move focus to the first row that "load more" added, and say how many came in.
  useEffect(() => {
    if (list.phase === 'loaded' && list.firstNew >= 0) {
      firstNewRef.current?.focus();
      announce(t('list.loadedMore', { n: list.items.length - list.firstNew }), 'quiet');
    }
  }, [list.firstNew, list.phase]);

  // Say how many records a fresh query found.
  useEffect(() => {
    if (list.phase === 'loaded' && list.firstNew < 0 && announced.current !== list.seq) {
      announced.current = list.seq;
      announce(t('list.refreshed', { n: list.items.length }), 'quiet');
    }
  }, [list.phase, list.seq]);

  const change = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    props.apply(setFilter({ ...filters, q: draft }, key, value));

  const search = (e: Event) => {
    e.preventDefault();
    props.apply({ ...filters, q: draft.trim() });
  };
  const clear = () => {
    setDraft('');
    props.apply(INITIAL_FILTERS);
  };

  const doExport = async () => {
    setExporting(true);
    const res = await api.export(
      {
        type: filters.type,
        status: filters.status || undefined,
        region: filters.region || undefined,
        grade: filters.grade ? Number(filters.grade) : undefined,
        include_spam: filters.includeSpam,
      },
      filters.q.trim() || undefined,
    );
    setExporting(false);
    if (!res.ok) {
      if (res.kind === 'unauthorized') return onUnauthorized();
      announce(res.kind === 'conflict' ? t('export.tooMany') : t(`err.${res.kind}`), 'error');
      return;
    }
    // Save the blob through a temporary link; the object URL is revoked straight away.
    const url = URL.createObjectURL(res.data.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce(t('export.done', { file: res.data.filename }));
  };

  const statuses = statusesFor(filters.type);
  const typeName = t(`type.${filters.type}`);

  return (
    <section aria-labelledby="view-title" class="admin-section">
      <ViewHeading focus={props.focus} id="view-title">
        {t('list.heading')}
      </ViewHeading>

      <form class="admin-filters form-panel" onSubmit={search} aria-label={t('filter.legend')}>
        <fieldset class="choice-group admin-types">
          <legend class="choice-group__legend">{t('type.label')}</legend>
          <div class="admin-types__row">
            {(['application', 'inquiry'] as RecordType[]).map((ty) => (
              <label class="radio-card" key={ty}>
                <input
                  class="check__input"
                  type="radio"
                  name="type"
                  value={ty}
                  checked={filters.type === ty}
                  onChange={() => change('type', ty)}
                />
                <span>{t(`type.${ty}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div class="admin-filters__grid">
          <div class="field">
            <label class="field__label" for="f-status">
              {t('filter.status')}
            </label>
            <select
              class="select"
              id="f-status"
              value={filters.status}
              onChange={(e) => change('status', e.currentTarget.value)}
            >
              <option value="">{t('filter.all')}</option>
              {statuses.map((s) => (
                <option value={s} key={s}>
                  {label(t, 'status', s)}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="f-region">
              {t('filter.region')}
            </label>
            <select
              class="select"
              id="f-region"
              value={filters.region}
              onChange={(e) => change('region', e.currentTarget.value)}
            >
              <option value="">{t('filter.all')}</option>
              {REGIONS.map((r) => (
                <option value={r} key={r}>
                  {label(t, 'region', r)}
                </option>
              ))}
            </select>
          </div>
          {filters.type === 'application' && (
            <div class="field">
              <label class="field__label" for="f-grade">
                {t('filter.grade')}
              </label>
              <select
                class="select"
                id="f-grade"
                value={filters.grade}
                onChange={(e) => change('grade', e.currentTarget.value)}
              >
                <option value="">{t('filter.all')}</option>
                {GRADES.map((g) => (
                  <option value={String(g)} key={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <label class="check">
          <input
            class="check__input"
            type="checkbox"
            checked={filters.includeSpam}
            onChange={(e) => change('includeSpam', e.currentTarget.checked)}
          />
          <span>{t('filter.spam')}</span>
        </label>

        <div class="field">
          <label class="field__label" for="f-q">
            {t('filter.search')}
          </label>
          <p class="field__help" id="f-q-help">
            {t('filter.searchHelp')}
          </p>
          <div class="admin-search">
            <input
              class="input"
              id="f-q"
              type="search"
              autocomplete="off"
              spellcheck={false}
              aria-describedby="f-q-help"
              maxLength={100}
              value={draft}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
            <button type="submit" class="btn btn-primary">
              {t('filter.searchButton')}
            </button>
          </div>
        </div>
        <div class="btn-group">
          <button type="button" class="btn btn-secondary btn-s" onClick={clear}>
            {t('filter.clear')}
          </button>
          {canUi(role, 'export') && (
            <button
              type="button"
              class="btn btn-secondary btn-s"
              onClick={doExport}
              aria-disabled={exporting}
              aria-describedby="export-help"
            >
              {t('export.button')}
            </button>
          )}
        </div>
        {canUi(role, 'export') && (
          <p class="field__help" id="export-help">
            {t('export.help')}
          </p>
        )}
      </form>

      <div class="admin-results">
        {list.phase === 'error' && list.error && (
          <ErrorBox failure={list.error} onRetry={props.reload} />
        )}
        {list.phase === 'loading' && list.items.length === 0 && (
          <Loading label={t('common.loading')} />
        )}
        {list.phase === 'loaded' && list.items.length === 0 && (
          <p class="admin-empty">{t('list.empty')}</p>
        )}
        {list.items.length > 0 && (
          <>
            <p class="admin-count" aria-hidden="true">
              {t('list.count', { n: list.items.length })}
            </p>
            <div
              class="admin-table-wrap"
              role="region"
              tabIndex={0}
              aria-label={t('list.caption', { type: typeName })}
            >
              <table class="admin-table">
                <caption class="visually-hidden">{t('list.caption', { type: typeName })}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('col.id')}</th>
                    <th scope="col">{t('col.created')}</th>
                    <th scope="col">{t('col.status')}</th>
                    <th scope="col">{t('col.region')}</th>
                    <th scope="col">{t('col.language')}</th>
                    <th scope="col">{t('col.detail')}</th>
                    <th scope="col">{t('col.flags')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((r, i) => (
                    <Row
                      key={r.id}
                      row={r}
                      linkRef={i === list.firstNew ? firstNewRef : undefined}
                      locale={locale}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {list.phase === 'loading' && list.items.length > 0 && (
          <Loading label={t('common.loading')} />
        )}
        {list.nextCursor && list.phase !== 'loading' && (
          <button type="button" class="btn btn-secondary" onClick={props.loadMore}>
            {t('list.loadMore')}
          </button>
        )}
      </div>
    </section>
  );
}

function Row(props: {
  row: RecordListItem;
  linkRef?: { current: HTMLAnchorElement | null };
  locale: 'sk' | 'cs' | 'en';
}) {
  const { t } = useAdmin();
  const r = props.row;
  return (
    <tr>
      <th scope="row">
        <a ref={props.linkRef} href={`#/record/${r.type}/${r.id}`} class="admin-id">
          {shortId(r.id)}
        </a>
      </th>
      <td>
        <time dateTime={r.created_at}>{formatDateTime(r.created_at, props.locale)}</time>
      </td>
      <td>
        <span class={`admin-badge admin-badge--${r.status}`}>{label(t, 'status', r.status)}</span>
      </td>
      <td>{label(t, 'region', r.region)}</td>
      <td>{label(t, 'locale', r.locale)}</td>
      <td>
        {r.type === 'inquiry'
          ? label(t, 'subject', r.subject ?? '')
          : t('list.grade', { n: r.intended_grade ?? '' })}
      </td>
      <td>
        {r.suspected_spam && <span class="admin-badge admin-badge--spam">{t('list.spam')}</span>}
      </td>
    </tr>
  );
}
