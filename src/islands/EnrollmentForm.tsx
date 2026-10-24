/**
 * Enrolment form island (brief §7, architecture §4.2). The server-rendered markup is one long
 * <form method="post" action="/api/applications"> with every step visible, so it works without JS.
 * After hydration the island turns it into a four-step form: per-step validation, a review step with
 * edit links, a sessionStorage draft and the JSON submit.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { CURRENT_ARRANGEMENTS, GRADES, LOCALES, NEXT_STEPS } from '../shared/enums';
import { APPLICATION_PHONE_REQUIRED, type ApplicationStep } from '../shared/schemas/application';
import type { Locale } from '../i18n/routes';
import { fill, type FormStrings } from '../i18n/forms';
import { track } from './forms/analytics';
import { postJson } from './forms/api';
import {
  Checkbox,
  ErrorSummary,
  FailurePanel,
  Honeypot,
  RadioGroup,
  Select,
  SubmitButton,
  TextArea,
  TextInput,
} from './forms/controls';
import { clearDraft, loadDraft, saveDraft } from './forms/draft';
import {
  buildFields,
  errorMessage,
  failureCopy,
  firstStepWithErrors,
  reviewSections,
  stepOfField,
  summaryItems,
  validateEnrolAll,
  validateEnrolStep,
  type Errors,
  type Failure,
  type Option,
  type Values,
} from './forms/logic';
import './forms/forms-island.css';

export interface EnrollmentFormProps {
  locale: Locale;
  t: Pick<FormStrings, 'common' | 'enrol'>;
  regions: Option[];
  /** Verified `applicationYears` or null. Null: free input with format help. */
  years: string[] | null;
  privacyHref: string;
  submittedHref: string;
  contactHref: string;
  marketing: { text: string; version: string } | null;
}

const TOTAL = 4;
const STEP_FIELDS: Record<ApplicationStep, readonly string[]> = {
  1: ['parent_name', 'email', 'phone', 'municipality', 'region', 'preferred_language'],
  2: ['child_name', 'intended_grade', 'intended_school_year', 'current_arrangement'],
  3: ['motivation', 'environment_priorities', 'questions', 'preferred_next_step'],
  4: ['privacy_ack', 'marketing_consent'],
};
const ALL_FIELDS = [1, 2, 3, 4].flatMap((s) => STEP_FIELDS[s as ApplicationStep]);
const id = (name: string) => `enrol-${name}`;
type FocusTarget = 'summary' | 'failure' | 'heading';

const initialValues = (locale: Locale): Values => ({
  parent_name: '',
  email: '',
  phone: '',
  municipality: '',
  region: '',
  preferred_language: locale,
  child_name: '',
  intended_grade: '',
  intended_school_year: '',
  current_arrangement: '',
  motivation: '',
  environment_priorities: '',
  questions: '',
  preferred_next_step: '',
  privacy_ack: false,
  marketing_consent: false,
});

export default function EnrollmentForm(props: EnrollmentFormProps) {
  const { locale, t, regions, years, privacyHref, submittedHref, contactHref, marketing } = props;
  const { common, enrol } = t;
  const marketingVersion = marketing?.version;
  const opts = { years, marketingVersion };

  const [enhanced, setEnhanced] = useState(false);
  const [step, setStep] = useState<ApplicationStep>(1);
  const [values, setValues] = useState<Values>(() => initialValues(locale));
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  // The summary opens on a failed submit only: errors found on blur must not shift the layout under a click.
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [focusReq, setFocusReq] = useState<{ target: FocusTarget; n: number } | null>(null);
  const mountedAt = useRef(0);
  const started = useRef(false);
  const baseTitle = useRef('');
  const summaryEl = useRef<HTMLDivElement | null>(null);
  const failureEl = useRef<HTMLDivElement | null>(null);
  const headingEl = useRef<HTMLHeadingElement | null>(null);

  const requestFocus = (target: FocusTarget) =>
    setFocusReq((p) => ({ target, n: (p?.n ?? 0) + 1 }));

  useEffect(() => {
    mountedAt.current = performance.now();
    baseTitle.current = document.title;
    const draft = loadDraft();
    if (draft) {
      setValues((v) => ({ ...v, ...draft.values }));
      setStep(draft.step as ApplicationStep);
    }
    setEnhanced(true);
    const params = new URLSearchParams(location.search);
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
    if (enhanced) saveDraft({ step, values });
  }, [enhanced, step, values]);

  useEffect(() => {
    if (!focusReq) return;
    const el =
      focusReq.target === 'summary'
        ? summaryEl.current
        : focusReq.target === 'failure'
          ? failureEl.current
          : headingEl.current;
    el?.focus();
  }, [focusReq]);

  const setStepErrors = (s: ApplicationStep, found: Errors) =>
    setErrors((prev) => {
      const next: Errors = {};
      for (const [k, v] of Object.entries(prev)) if (stepOfField(k) !== s) next[k] = v;
      return { ...next, ...found };
    });

  const revalidate = (name: string, v: Values) => {
    const s = stepOfField(name);
    if (s === null) return;
    const e = validateEnrolStep(s, v, opts);
    setErrors((prev) => {
      const next = { ...prev };
      if (e[name]) next[name] = e[name];
      else delete next[name];
      return next;
    });
  };
  const setValue = (name: string, value: string | boolean) => {
    if (!started.current) {
      started.current = true;
      track('enroll_start');
    }
    const next = { ...values, [name]: value };
    setValues(next);
    if (attempted && errors[name]) revalidate(name, next);
  };
  // Errors are added on submit only and cleared while typing (setValue). Validating on blur would insert
  // error text between mousedown and mouseup and make the button jump away from the click.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onBlur = (_name: string) => undefined;

  const goTo = (n: ApplicationStep) => {
    setStep(n);
    setSummaryOpen(false);
    setFailure(null);
    document.title = `${fill(enrol.documentTitle, { n, total: TOTAL })} – ${baseTitle.current}`;
    track('enroll_step', { step: n });
    requestFocus('heading');
  };

  const submit = async () => {
    if (sending) return;
    if (step < TOTAL) {
      const found = validateEnrolStep(step, values, opts);
      setStepErrors(step, found);
      if (Object.keys(found).length > 0) {
        setAttempted(true);
        setFailure(null);
        setSummaryOpen(true);
        requestFocus('summary');
        return;
      }
      goTo((step + 1) as ApplicationStep);
      return;
    }
    const all = validateEnrolAll(values, opts);
    if (Object.keys(all).length > 0) {
      setErrors(all);
      setAttempted(true);
      setFailure(null);
      const first = firstStepWithErrors(all);
      if (first !== null && first !== step) setStep(first);
      setSummaryOpen(true);
      requestFocus('summary');
      return;
    }
    setErrors({});
    setFailure(null);
    setSending(true);
    const result = await postJson('/api/applications', {
      locale,
      fields: buildFields(values, { marketingVersion }),
      hp,
      elapsedMs: Math.max(0, Math.round(performance.now() - mountedAt.current)),
    });
    switch (result.kind) {
      case 'ok':
        clearDraft();
        track('enroll_submit');
        location.assign(submittedHref);
        return; // stay in the sending state while the browser navigates
      case 'validation': {
        setSending(false);
        setErrors(result.fields);
        setAttempted(true);
        const first = firstStepWithErrors(result.fields);
        if (first !== null) setStep(first);
        if (result.fields.marketing_consent === 'consent_version_stale') {
          setFailure({ kind: 'stale' });
          requestFocus('failure');
        } else if (first === null) {
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
      case 'closed':
        setFailure({ kind: 'closed' });
        break;
      default:
        setFailure({ kind: 'server' });
    }
    setSending(false);
    requestFocus('failure');
  };

  const fields = enrol.fields as Record<string, { label: string; help: string }>;
  const err = (name: string) =>
    errors[name] ? errorMessage(common.errors, errors[name]) : undefined;
  const str = (name: string) => String(values[name] ?? '');
  const meta = (name: string, optional = false) => ({
    id: id(name),
    name,
    label: fields[name]?.label ?? name,
    help: fields[name]?.help || undefined,
    error: err(name),
    optional: optional ? common.optional : undefined,
    required: !optional,
  });
  const textField = (
    name: string,
    extra: {
      type?: 'text' | 'email' | 'tel';
      autoComplete?: string;
      inputMode?: 'text' | 'email' | 'tel';
      maxLength?: number;
      optional?: boolean;
      help?: string;
    } = {},
  ) => (
    <TextInput
      {...meta(name, extra.optional)}
      {...(extra.help ? { help: extra.help } : {})}
      type={extra.type}
      autoComplete={extra.autoComplete}
      inputMode={extra.inputMode}
      maxLength={extra.maxLength}
      value={str(name)}
      onValue={(v) => setValue(name, v)}
      onBlur={onBlur(name)}
    />
  );
  const area = (name: string) => (
    <TextArea
      {...meta(name, true)}
      help={fields[name]?.help || enrol.textHelp}
      maxLength={2000}
      value={str(name)}
      onValue={(v) => setValue(name, v)}
      onBlur={onBlur(name)}
    />
  );

  const languageOptions: Option[] = LOCALES.map((l) => ({
    value: l,
    label: common.languageNames[l],
  }));
  const gradeOptions: Option[] = GRADES.map((g) => ({
    value: String(g),
    label: enrol.grades[String(g) as '1' | '2' | '3' | '4'],
  }));
  const arrangementOptions: Option[] = CURRENT_ARRANGEMENTS.map((a) => ({
    value: a,
    label: enrol.arrangements[a],
  }));
  const nextStepOptions: Option[] = NEXT_STEPS.map((n) => ({
    value: n,
    label: enrol.nextSteps[n],
  }));

  const heading = (n: ApplicationStep) => (
    <h2 class="form-step__title" id={id(`step-${n}`)} tabIndex={-1} ref={headingEl}>
      {enrol.stepTitles[n - 1]}
    </h2>
  );

  const step1 = (
    <section class="form-step" aria-labelledby={id('step-1')}>
      {heading(1)}
      {textField('parent_name', { autoComplete: 'name', maxLength: 120 })}
      <div class="field-row">
        {textField('email', {
          type: 'email',
          inputMode: 'email',
          autoComplete: 'email',
          maxLength: 254,
        })}
        {textField('phone', {
          type: 'tel',
          inputMode: 'tel',
          autoComplete: 'tel',
          maxLength: 32,
          optional: !APPLICATION_PHONE_REQUIRED,
        })}
      </div>
      <div class="field-row">
        {textField('municipality', { autoComplete: 'address-level2', maxLength: 120 })}
        <Select
          {...meta('region')}
          value={str('region')}
          options={regions}
          placeholder={common.select}
          onValue={(v) => setValue('region', v)}
          onBlur={onBlur('region')}
        />
      </div>
      <RadioGroup
        {...meta('preferred_language')}
        value={str('preferred_language')}
        options={languageOptions}
        onValue={(v) => setValue('preferred_language', v)}
      />
    </section>
  );

  const step2 = (
    <section class="form-step" aria-labelledby={id('step-2')}>
      {heading(2)}
      {textField('child_name', { autoComplete: 'off', maxLength: 60 })}
      <RadioGroup
        {...meta('intended_grade')}
        value={str('intended_grade')}
        options={gradeOptions}
        onValue={(v) => setValue('intended_grade', v)}
      />
      {years && years.length > 0 ? (
        <Select
          {...meta('intended_school_year')}
          help={undefined}
          value={str('intended_school_year')}
          options={years.map((y) => ({ value: y, label: y }))}
          placeholder={common.select}
          onValue={(v) => setValue('intended_school_year', v)}
          onBlur={onBlur('intended_school_year')}
        />
      ) : (
        textField('intended_school_year', { maxLength: 20 })
      )}
      <Select
        {...meta('current_arrangement', true)}
        value={str('current_arrangement')}
        options={arrangementOptions}
        placeholder={common.select}
        onValue={(v) => setValue('current_arrangement', v)}
        onBlur={onBlur('current_arrangement')}
      />
    </section>
  );

  const step3 = (
    <section class="form-step" aria-labelledby={id('step-3')}>
      {heading(3)}
      {area('motivation')}
      {area('environment_priorities')}
      {area('questions')}
      <RadioGroup
        {...meta('preferred_next_step')}
        value={str('preferred_next_step')}
        options={nextStepOptions}
        layout="list"
        onValue={(v) => setValue('preferred_next_step', v)}
      />
    </section>
  );

  const sections = enhanced && step === 4 ? reviewSections(values, enrol, common, regions) : [];
  const consent = (
    <>
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
    </>
  );
  const step4 = (
    <section class="form-step" aria-labelledby={id('step-4')}>
      {heading(4)}
      {sections.length > 0 && (
        <div class="review">
          <p>{enrol.review.intro}</p>
          {sections.map((s) => (
            <section class="review__section" aria-labelledby={id(`review-${s.step}`)}>
              <div class="review__head">
                <h3 class="review__title" id={id(`review-${s.step}`)}>
                  {s.title}
                </h3>
                <a
                  class="review__edit"
                  href={`#${id(`step-${s.step}`)}`}
                  aria-label={s.editLabel}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(s.step);
                  }}
                >
                  {enrol.review.edit}
                </a>
              </div>
              <dl class="review__list">
                {s.rows.map((r) => (
                  <div class="review__row">
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
      <div class="review__section">
        <h3 class="review__title">{enrol.review.privacyHeading}</h3>
        <p>{enrol.review.privacyText}</p>
      </div>
      <p class="form-note">{enrol.review.applicationNote}</p>
      {consent}
    </section>
  );

  const visible: Record<ApplicationStep, boolean> = enhanced
    ? { 1: step === 1, 2: step === 2, 3: step === 3, 4: step === 4 }
    : { 1: true, 2: true, 3: true, 4: true };
  const shownFields = enhanced ? STEP_FIELDS[step] : ALL_FIELDS;
  const items = summaryItems(
    errors,
    shownFields,
    (n) =>
      n === 'privacy_ack'
        ? enrol.review.privacyHeading
        : n === 'marketing_consent'
          ? (marketing?.text ?? n)
          : (fields[n]?.label ?? n),
    common.errors,
    id,
  );
  const copy = failure ? failureCopy(common, failure) : null;

  return (
    <form
      class="form-stack"
      method="post"
      action="/api/applications"
      noValidate={enhanced}
      data-enhanced={enhanced ? 'true' : undefined}
      aria-label={enrol.formLabel}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input type="hidden" name="locale" value={locale} />

      {enhanced && (
        <nav class="stepper" data-step={step} aria-label={enrol.stepperLabel}>
          <p class="stepper__count">{fill(enrol.stepOf, { n: step, total: TOTAL })}</p>
          <div class="stepper__bar" aria-hidden="true" />
          <ol class="stepper__list">
            {enrol.steps.map((name, i) => {
              const n = (i + 1) as ApplicationStep;
              return (
                <li
                  class="stepper__item"
                  aria-current={n === step ? 'step' : undefined}
                  data-state={n < step ? 'done' : undefined}
                >
                  {n < step ? (
                    <button type="button" onClick={() => goTo(n)}>
                      {name}
                      <span class="visually-hidden"> ({enrol.stepsDone})</span>
                    </button>
                  ) : (
                    name
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <p class="form-note">{common.requiredNote}</p>

      {copy && failure && (
        <FailurePanel
          id={id('failure')}
          title={copy.title}
          text={copy.text}
          refCb={(el) => (failureEl.current = el)}
          actions={
            failure.kind === 'stale' ? (
              <button type="button" class="btn btn-secondary" onClick={() => location.reload()}>
                {common.reloadHint}
              </button>
            ) : failure.kind === 'closed' ? (
              <a class="btn btn-secondary" href={contactHref}>
                {common.contactLink}
              </a>
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
          id={id('summary')}
          title={common.summaryTitle}
          items={items}
          refCb={(el) => (summaryEl.current = el)}
        />
      )}

      {visible[1] && step1}
      {visible[2] && step2}
      {visible[3] && step3}
      {visible[4] && step4}

      <Honeypot value={hp} onValue={setHp} />

      {enhanced && step === 1 && <p class="form-note">{enrol.draftNote}</p>}

      <div class="forms-actions">
        {enhanced && step > 1 && (
          <button
            type="button"
            class="btn btn-secondary"
            onClick={() => goTo((step - 1) as ApplicationStep)}
          >
            {enrol.back}
          </button>
        )}
        <SubmitButton
          label={!enhanced || step === TOTAL ? enrol.submit : enrol.next}
          sendingLabel={common.sending}
          sending={sending}
        />
      </div>
      <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {sending ? common.sending : ''}
      </div>
    </form>
  );
}
