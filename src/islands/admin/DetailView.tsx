/** @jsxImportSource preact */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { ApiFailure } from './api';
import { failureMessage, useAdmin } from './context';
import { formatDateTime, label, type Translate } from './i18n';
import { canUi, confirmationMatches, shortId, statusesFor } from './state';
import type { DeliveryRow, NoteRow, RecordDetailData, RecordType } from './types';
import { ErrorBox, FormError, Loading, ViewHeading } from './ui';

const FIELD_ORDER: Record<RecordType, readonly string[]> = {
  inquiry: [
    'created_at',
    'parent_name',
    'email',
    'phone',
    'region',
    'subject',
    'message',
    'locale',
    'status',
    'status_changed_at',
    'source_page',
    'suspected_spam',
    'privacy_notice_version',
    'privacy_ack_at',
    'retain_until',
    'closed_at',
    'updated_at',
  ],
  application: [
    'created_at',
    'parent_name',
    'email',
    'phone',
    'municipality',
    'region',
    'preferred_language',
    'child_name',
    'intended_grade',
    'intended_school_year',
    'current_arrangement',
    'motivation',
    'environment_priorities',
    'questions',
    'preferred_next_step',
    'locale',
    'status',
    'status_changed_at',
    'suspected_spam',
    'privacy_notice_version',
    'privacy_ack_at',
    'retain_until',
    'closed_at',
    'updated_at',
  ],
};
const DATE_FIELDS = new Set([
  'created_at',
  'updated_at',
  'status_changed_at',
  'privacy_ack_at',
  'retain_until',
  'closed_at',
]);
const ENUM_PREFIX: Record<string, string> = {
  status: 'status',
  region: 'region',
  locale: 'locale',
  preferred_language: 'locale',
  subject: 'subject',
  current_arrangement: 'arrangement',
  preferred_next_step: 'nextstep',
};

interface Props {
  type: RecordType;
  id: string;
  focus: boolean;
  onGone: () => void;
  onChanged: () => void;
}

export function DetailView(props: Props) {
  const { api, t, onUnauthorized } = useAdmin();
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'error'; failure: ApiFailure }
    | { phase: 'ready'; data: RecordDetailData }
  >({ phase: 'loading' });

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    const res = await api.detail(props.type, props.id);
    if (res.ok) setState({ phase: 'ready', data: res.data });
    else {
      if (res.kind === 'unauthorized') onUnauthorized();
      setState({ phase: 'error', failure: res });
    }
  }, [api, props.type, props.id, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (fn: (d: RecordDetailData) => RecordDetailData) =>
    setState((s) => (s.phase === 'ready' ? { phase: 'ready', data: fn(s.data) } : s));

  return (
    <section aria-labelledby="view-title" class="admin-section">
      <p>
        <a href="#/" class="link-arrow">
          {t('common.back')}
        </a>
      </p>
      <ViewHeading focus={props.focus} id="view-title">
        {t('detail.heading', { id: shortId(props.id) })}
      </ViewHeading>
      {state.phase === 'loading' && <Loading label={t('detail.loading')} />}
      {state.phase === 'error' && <ErrorBox failure={state.failure} onRetry={load} />}
      {state.phase === 'ready' && <Ready {...props} data={state.data} patch={patch} />}
    </section>
  );
}

function Ready(
  props: Props & {
    data: RecordDetailData;
    patch: (fn: (d: RecordDetailData) => RecordDetailData) => void;
  },
) {
  const { t, role } = useAdmin();
  const { data } = props;
  return (
    <div class="admin-detail">
      <p class="form-note">{t('detail.privacy')}</p>
      <Fields data={data} type={props.type} />
      <StatusPanel {...props} />
      <NotesPanel {...props} />
      <DeliveriesPanel {...props} />
      <ConsentsPanel data={data} />
      {canUi(role, 'delete') && <DeletePanel {...props} />}
    </div>
  );
}

function Fields(props: { data: RecordDetailData; type: RecordType }) {
  const { t, locale } = useAdmin();
  const rec = props.data.record;
  return (
    <section aria-labelledby="h-record" class="admin-panel">
      <h2 id="h-record">{t('detail.record')}</h2>
      <dl class="admin-fields">
        {FIELD_ORDER[props.type]
          .filter((k) => k in rec)
          .map((k) => (
            <div class="admin-fields__row" key={k}>
              <dt>{t(`field.${k}`)}</dt>
              <dd>{fieldValue(t, locale, k, rec[k])}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

function fieldValue(
  t: Translate,
  locale: 'sk' | 'cs' | 'en',
  key: string,
  v: string | number | boolean | null | undefined,
): string {
  if (v === null || v === undefined || v === '') return t('common.none');
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (DATE_FIELDS.has(key) && typeof v === 'string') return formatDateTime(v, locale);
  const prefix = ENUM_PREFIX[key];
  if (prefix && typeof v === 'string') return label(t, prefix, v);
  return String(v);
}

type PanelProps = Props & {
  data: RecordDetailData;
  patch: (fn: (d: RecordDetailData) => RecordDetailData) => void;
};

function StatusPanel(props: PanelProps) {
  const { t, api, announce, onUnauthorized } = useAdmin();
  const current = String(props.data.record.status);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await api.setStatus(props.type, props.id, value);
    setBusy(false);
    if (!res.ok) {
      if (res.kind === 'unauthorized') return onUnauthorized();
      setError(failureMessage(t, res));
      return;
    }
    props.patch((d) => ({ ...d, record: { ...d.record, status: value } }));
    props.onChanged();
    announce(
      t(res.data.changed ? 'detail.statusChanged' : 'detail.statusUnchanged', {
        status: label(t, 'status', value),
      }),
    );
  };

  return (
    <section aria-labelledby="h-status" class="admin-panel">
      <h2 id="h-status">{t('detail.statusHeading')}</h2>
      <form class="admin-inline-form" onSubmit={submit}>
        <div class="field">
          <label class="field__label" for="status-select">
            {t('detail.statusLabel')}
          </label>
          <select
            class="select"
            id="status-select"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
          >
            {statusesFor(props.type).map((s) => (
              <option value={s} key={s}>
                {label(t, 'status', s)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" class="btn btn-primary" aria-disabled={busy}>
          {t('detail.statusSave')}
        </button>
      </form>
      <FormError message={error} />
    </section>
  );
}

function NotesPanel(props: PanelProps) {
  const { t, api, locale, announce, onUnauthorized } = useAdmin();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await api.addNote(props.type, props.id, text);
    setBusy(false);
    if (!res.ok) {
      if (res.kind === 'unauthorized') return onUnauthorized();
      const f = res.fields?.body;
      setError(f ? t(`err.field.${f}`) : failureMessage(t, res));
      area.current?.focus();
      return;
    }
    const note: NoteRow = res.data;
    props.patch((d) => ({ ...d, notes: [...d.notes, note] }));
    setText('');
    announce(t('detail.noteAdded'));
    area.current?.focus();
  };

  return (
    <section aria-labelledby="h-notes" class="admin-panel">
      <h2 id="h-notes">{t('detail.notesHeading')}</h2>
      {props.data.notes.length === 0 ? (
        <p>{t('detail.notesEmpty')}</p>
      ) : (
        <ul class="admin-notes">
          {props.data.notes.map((n) => (
            <li key={n.id}>
              <p class="admin-notes__body">{n.body}</p>
              <p class="form-note">
                {t('detail.noteBy', {
                  email: n.author_email,
                  when: formatDateTime(n.created_at, locale),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form class="form-stack" onSubmit={submit}>
        <div class="field">
          <label class="field__label" for="note-body">
            {t('detail.noteLabel')}
          </label>
          <p class="field__help" id="note-help">
            {t('detail.noteHelp')}
          </p>
          <textarea
            class="textarea"
            id="note-body"
            ref={area}
            rows={3}
            maxLength={4000}
            value={text}
            aria-describedby={error ? 'note-help note-error' : 'note-help'}
            aria-invalid={error ? 'true' : undefined}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          {error && (
            <p class="field__error" id="note-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div>
          <button type="submit" class="btn btn-primary" aria-disabled={busy}>
            {t('detail.noteSave')}
          </button>
        </div>
      </form>
    </section>
  );
}

function DeliveriesPanel(props: PanelProps) {
  const { t, locale } = useAdmin();
  const rows = props.data.deliveries;
  return (
    <section aria-labelledby="h-deliveries" class="admin-panel">
      <h2 id="h-deliveries">{t('detail.deliveriesHeading')}</h2>
      {rows.length === 0 ? (
        <p>{t('detail.deliveriesEmpty')}</p>
      ) : (
        <ul class="admin-deliveries">
          {rows.map((d) => (
            <Delivery key={d.id} row={d} locale={locale} {...props} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Delivery(props: PanelProps & { row: DeliveryRow; locale: 'sk' | 'cs' | 'en' }) {
  const { t, api, announce, onUnauthorized } = useAdmin();
  const d = props.row;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = t(`delivery.kind.${d.kind}`);

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await api.resend(props.type, props.id, d.kind);
    setBusy(false);
    if (!res.ok) {
      if (res.kind === 'unauthorized') return onUnauthorized();
      setError(res.kind === 'conflict' ? t('delivery.resendNoFailed') : failureMessage(t, res));
      return;
    }
    props.patch((data) => ({
      ...data,
      deliveries: data.deliveries.map((x) =>
        x.id === d.id
          ? {
              ...x,
              status: res.data.status,
              last_error_code: res.data.last_error_code,
              attempts: x.attempts + 1,
            }
          : x,
      ),
    }));
    announce(
      res.data.status === 'sent'
        ? t('delivery.resent')
        : t('delivery.resentFailed', { code: res.data.last_error_code ?? '?' }),
      res.data.status === 'sent' ? 'success' : 'error',
    );
  };

  return (
    <li
      class={`admin-delivery admin-delivery--${d.status}`}
      data-kind={d.kind}
      data-status={d.status}
    >
      <p class="admin-delivery__head">
        <strong>{kind}</strong>{' '}
        <span class={`admin-badge admin-badge--delivery-${d.status}`}>
          {t(`delivery.status.${d.status}`)}
        </span>
      </p>
      <p class="form-note">
        {t('delivery.attempts', { n: d.attempts })}.{' '}
        {t('delivery.updated', { when: formatDateTime(d.updated_at, props.locale) })}
      </p>
      {d.status === 'skipped' && d.last_error_code === 'recipient_limit' && (
        <p class="admin-callout" data-testid="recipient-limit">
          {t('delivery.recipientLimit')}
        </p>
      )}
      {d.status === 'skipped' && d.last_error_code !== 'recipient_limit' && (
        <p class="form-note">{t('delivery.skippedOther')}</p>
      )}
      {d.status === 'failed' && (
        <>
          {d.last_error_code && (
            <p class="form-note">{t('delivery.error', { code: d.last_error_code })}</p>
          )}
          <button
            type="button"
            class="btn btn-secondary btn-s"
            onClick={resend}
            aria-disabled={busy}
          >
            {t('delivery.resend', { kind })}
          </button>
        </>
      )}
      <FormError message={error} />
    </li>
  );
}

function ConsentsPanel(props: { data: RecordDetailData }) {
  const { t, locale } = useAdmin();
  const rows = props.data.consents;
  return (
    <section aria-labelledby="h-consents" class="admin-panel">
      <h2 id="h-consents">{t('detail.consentsHeading')}</h2>
      {rows.length === 0 ? (
        <p>{t('detail.consentsEmpty')}</p>
      ) : (
        <ul class="admin-notes">
          {rows.map((c) => (
            <li key={c.id}>
              <p>
                {c.purpose}. {t('detail.consentVersion', { v: c.consent_text_version })}
              </p>
              <p class="form-note">
                {t('detail.consentGranted', { when: formatDateTime(c.granted_at, locale) })}
                {c.withdrawn_at &&
                  `. ${t('detail.consentWithdrawn', { when: formatDateTime(c.withdrawn_at, locale) })}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeletePanel(props: PanelProps) {
  const { t, api, announce, onUnauthorized } = useAdmin();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const word = t('delete.word');
  const armed = confirmationMatches(typed, word);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    const res = await api.remove(props.type, props.id);
    setBusy(false);
    if (!res.ok) {
      if (res.kind === 'unauthorized') return onUnauthorized();
      setError(failureMessage(t, res));
      return;
    }
    announce(t('delete.done'));
    props.onGone();
  };

  return (
    <section aria-labelledby="h-delete" class="admin-panel admin-panel--danger">
      <h2 id="h-delete">{t('delete.heading')}</h2>
      <p id="delete-help">{t('delete.help')}</p>
      <form class="admin-inline-form" onSubmit={submit}>
        <div class="field">
          <label class="field__label" for="delete-confirm">
            {t('delete.label', { word })}
          </label>
          <input
            class="input"
            id="delete-confirm"
            type="text"
            autocomplete="off"
            spellcheck={false}
            aria-describedby="delete-help"
            value={typed}
            onInput={(e) => setTyped(e.currentTarget.value)}
          />
        </div>
        <button type="submit" class="btn btn-primary" aria-disabled={!armed || busy}>
          {t('delete.button')}
        </button>
      </form>
      <FormError message={error} />
    </section>
  );
}
