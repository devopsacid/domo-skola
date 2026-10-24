/**
 * Contact form island (brief §6, architecture §4.1). The server-rendered markup is a complete
 * <form method="post" action="/api/contact"> that works without JS; after hydration the island adds
 * validation, the error summary, the JSON submit and the inline success state.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CONTACT_SUBJECTS } from '../shared/enums';
import type { Locale } from '../i18n/routes';
import type { FormStrings } from '../i18n/forms';
import { track } from './forms/analytics';
import { postJson } from './forms/api';
import {
  Checkbox,
  ErrorSummary,
  FailurePanel,
  Honeypot,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from './forms/controls';
import {
  buildFields,
  errorMessage,
  failureCopy,
  summaryItems,
  validateContactValues,
  type Errors,
  type Failure,
  type Option,
  type Values,
} from './forms/logic';
import './forms/forms-island.css';

export interface ContactFormProps {
  locale: Locale;
  t: Pick<FormStrings, 'common' | 'contact'>;
  regions: Option[];
  privacyHref: string;
  /** Present only when marketing consent is enabled and its text version is set. */
  marketing: { text: string; version: string } | null;
}

const ORDER = [
  'parent_name',
  'email',
  'phone',
  'region',
  'subject',
  'message',
  'privacy_ack',
  'marketing_consent',
] as const;
const id = (name: string) => `contact-${name}`;
const INITIAL: Values = {
  parent_name: '',
  email: '',
  phone: '',
  region: '',
  subject: '',
  message: '',
  privacy_ack: false,
  marketing_consent: false,
};

type FocusTarget = 'summary' | 'failure' | 'success';

export default function ContactForm({
  locale,
  t,
  regions,
  privacyHref,
  marketing,
}: ContactFormProps) {
  const { common, contact } = t;
  const marketingVersion = marketing?.version;
  const [enhanced, setEnhanced] = useState(false);
  const [values, setValues] = useState<Values>(INITIAL);
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  // The summary opens on a failed submit only: errors found on blur must not shift the layout under a click.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState(false);
  const [focusReq, setFocusReq] = useState<{ target: FocusTarget; n: number } | null>(null);
  const mountedAt = useRef(0);
  const summaryEl = useRef<HTMLDivElement | null>(null);
  const failureEl = useRef<HTMLDivElement | null>(null);
  const successEl = useRef<HTMLHeadingElement | null>(null);

  const requestFocus = (target: FocusTarget) =>
    setFocusReq((p) => ({ target, n: (p?.n ?? 0) + 1 }));

  useEffect(() => {
    mountedAt.current = performance.now();
    setEnhanced(true);
    const params = new URLSearchParams(location.search);
    const subject = params.get('subject');
    if (subject && (CONTACT_SUBJECTS as readonly string[]).includes(subject)) {
      setValues((v) => ({ ...v, subject }));
    }
    if (params.get('error')) {
      // The no-JS post failed and was redirected back here.
      setFailure({ kind: 'generic' });
      requestFocus('failure');
      params.delete('error');
      const q = params.toString();
      history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }
  }, []);

  useEffect(() => {
    if (!focusReq) return;
    const el =
      focusReq.target === 'summary'
        ? summaryEl.current
        : focusReq.target === 'failure'
          ? failureEl.current
          : successEl.current;
    el?.focus();
  }, [focusReq]);

  const check = (v: Values) => validateContactValues(v, { marketingVersion });
  const revalidate = (name: string, v: Values) => {
    const e = check(v);
    setErrors((prev) => {
      const next = { ...prev };
      if (e[name]) next[name] = e[name];
      else delete next[name];
      return next;
    });
  };
  const setValue = (name: string, value: string | boolean) => {
    const next = { ...values, [name]: value };
    setValues(next);
    if (attempted && errors[name]) revalidate(name, next);
  };
  // Errors are added on submit only and cleared while typing (setValue). Validating on blur would insert
  // error text between mousedown and mouseup and make the button jump away from the click.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onBlur = (_name: string) => undefined;

  const labels = contact.fields as Record<string, { label: string; help: string }>;
  const err = (name: string) =>
    errors[name] ? errorMessage(common.errors, errors[name]) : undefined;
  const str = (name: string) => String(values[name] ?? '');
  const meta = (name: string, optional = false) => ({
    id: id(name),
    name,
    label: labels[name]?.label ?? name,
    help: labels[name]?.help || undefined,
    error: err(name),
    optional: optional ? common.optional : undefined,
    required: !optional,
  });

  const submit = async () => {
    if (sending) return;
    const found = check(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setAttempted(true);
      setFailure(null);
      setSummaryOpen(true);
      requestFocus('summary');
      return;
    }
    setErrors({});
    setFailure(null);
    setSending(true);
    const result = await postJson('/api/contact', {
      locale,
      fields: buildFields(values, { marketingVersion }),
      hp,
      elapsedMs: Math.max(0, Math.round(performance.now() - mountedAt.current)),
    });
    setSending(false);
    switch (result.kind) {
      case 'ok': {
        const subject = str('subject');
        track('contact_submit', { subject });
        if (subject === 'visit') track('visit_request');
        setDone(true);
        requestFocus('success');
        return;
      }
      case 'validation': {
        setErrors(result.fields);
        setAttempted(true);
        const known = ORDER.some((n) => result.fields[n]);
        if (result.fields.marketing_consent === 'consent_version_stale') {
          setFailure({ kind: 'stale' });
          requestFocus('failure');
        } else if (!known) {
          setFailure({ kind: 'generic' });
          requestFocus('failure');
        } else {
          setSummaryOpen(true);
          requestFocus('summary');
        }
        return;
      }
      case 'rate_limited':
        setFailure({ kind: 'rate', retryAfter: result.retryAfter });
        break;
      case 'network':
        setFailure({ kind: 'network' });
        break;
      default:
        setFailure({ kind: 'server' });
    }
    requestFocus('failure');
  };

  if (done) {
    return (
      <div class="success-panel" data-state="success">
        <h2 class="success-panel__title" tabIndex={-1} ref={successEl}>
          {contact.success.title}
        </h2>
        <p>{contact.success.text}</p>
      </div>
    );
  }

  const items = summaryItems(
    errors,
    ORDER,
    (n) =>
      n === 'privacy_ack'
        ? contact.privacyHeading
        : n === 'marketing_consent'
          ? (marketing?.text ?? n)
          : (labels[n]?.label ?? n),
    common.errors,
    id,
  );
  const copy = failure ? failureCopy(common, failure) : null;

  const subjectOptions: Option[] = CONTACT_SUBJECTS.map((s) => ({
    value: s,
    label: contact.subjects[s],
  }));

  return (
    <form
      class="form-stack"
      method="post"
      action="/api/contact"
      noValidate={enhanced}
      data-enhanced={enhanced ? 'true' : undefined}
      aria-label={contact.formLabel}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <p class="form-note">{common.requiredNote}</p>

      {copy && failure && (
        <FailurePanel
          id="contact-failure"
          title={copy.title}
          text={copy.text}
          refCb={(el) => (failureEl.current = el)}
          actions={
            failure.kind === 'stale' ? (
              <button type="button" class="btn btn-secondary" onClick={() => location.reload()}>
                {common.reloadHint}
              </button>
            ) : failure.kind === 'generic' ? null : (
              <button type="button" class="btn btn-secondary" onClick={() => void submit()}>
                {common.retry}
              </button>
            )
          }
        />
      )}
      {summaryOpen && items.length > 0 && (
        <ErrorSummary
          id="contact-summary"
          title={common.summaryTitle}
          items={items}
          refCb={(el) => (summaryEl.current = el)}
        />
      )}

      <TextInput
        {...meta('parent_name')}
        value={str('parent_name')}
        autoComplete="name"
        maxLength={120}
        onValue={(v) => setValue('parent_name', v)}
        onBlur={onBlur('parent_name')}
      />
      <div class="field-row">
        <TextInput
          {...meta('email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={str('email')}
          maxLength={254}
          onValue={(v) => setValue('email', v)}
          onBlur={onBlur('email')}
        />
        <TextInput
          {...meta('phone', true)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={str('phone')}
          maxLength={32}
          onValue={(v) => setValue('phone', v)}
          onBlur={onBlur('phone')}
        />
      </div>
      <div class="field-row">
        <Select
          {...meta('region')}
          value={str('region')}
          options={regions}
          placeholder={common.select}
          onValue={(v) => setValue('region', v)}
          onBlur={onBlur('region')}
        />
        <Select
          {...meta('subject')}
          value={str('subject')}
          options={subjectOptions}
          placeholder={common.select}
          onValue={(v) => setValue('subject', v)}
          onBlur={onBlur('subject')}
        />
      </div>
      <TextArea
        {...meta('message')}
        value={str('message')}
        maxLength={4000}
        onValue={(v) => setValue('message', v)}
        onBlur={onBlur('message')}
      />

      <Honeypot value={hp} onValue={setHp} />

      <Checkbox
        id={id('privacy_ack')}
        name="privacy_ack"
        required
        checked={values.privacy_ack === true}
        error={err('privacy_ack')}
        onChecked={(c) => setValue('privacy_ack', c)}
      >
        {common.privacyBefore}
        <a href={privacyHref}>{common.privacyLink}</a>
        {common.privacyAfter}
      </Checkbox>
      {marketing && (
        <>
          <input type="hidden" name="marketing_consent_text_version" value={marketing.version} />
          <Checkbox
            id={id('marketing_consent')}
            name="marketing_consent"
            checked={values.marketing_consent === true}
            error={err('marketing_consent')}
            onChecked={(c) => setValue('marketing_consent', c)}
          >
            {marketing.text} <span class="field__optional">{common.optional}</span>
          </Checkbox>
        </>
      )}

      <div class="forms-actions">
        <SubmitButton label={contact.submit} sendingLabel={common.sending} sending={sending} />
      </div>
      <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {sending ? common.sending : ''}
      </div>
    </form>
  );
}
