/**
 * Form controls for the islands. Markup follows docs/design/system.md §6.8 and the classes in
 * src/styles/forms.css: label, help, control, error; help and error ids go into aria-describedby and
 * an invalid control gets aria-invalid="true".
 */
import type { ComponentChildren } from 'preact';
import type { Option } from './logic';

interface FieldMeta {
  /** Control id; the help and error ids derive from it. */
  id: string;
  name: string;
  label: string;
  /** Text of the "(optional)" marker; leave undefined for required fields. */
  optional?: string;
  help?: string;
  /** Resolved, translated message (not a code). */
  error?: string;
  required?: boolean;
}

export const helpId = (id: string) => `${id}-help`;
export const errorId = (id: string) => `${id}-error`;
const describedBy = (m: FieldMeta) =>
  [m.help ? helpId(m.id) : '', m.error ? errorId(m.id) : ''].filter(Boolean).join(' ') || undefined;

function LabelText({ m }: { m: FieldMeta }) {
  return (
    <>
      {m.label}
      {m.optional ? <span class="field__optional"> {m.optional}</span> : null}
    </>
  );
}

function Help({ m }: { m: FieldMeta }) {
  return m.help ? (
    <p class="field__help" id={helpId(m.id)}>
      {m.help}
    </p>
  ) : null;
}

function ErrorText({ m }: { m: FieldMeta }) {
  return m.error ? (
    <p class="field__error" id={errorId(m.id)}>
      {m.error}
    </p>
  ) : null;
}

interface TextProps extends FieldMeta {
  value: string;
  onValue: (value: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel';
  maxLength?: number;
}

export function TextInput(p: TextProps) {
  return (
    <div class="field">
      <label class="field__label" for={p.id}>
        <LabelText m={p} />
      </label>
      <Help m={p} />
      <input
        class="input"
        id={p.id}
        name={p.name}
        type={p.type ?? 'text'}
        value={p.value}
        required={p.required}
        aria-required={p.required ? 'true' : undefined}
        aria-invalid={p.error ? 'true' : undefined}
        aria-describedby={describedBy(p)}
        autoComplete={p.autoComplete}
        inputMode={p.inputMode}
        maxLength={p.maxLength}
        onInput={(e) => p.onValue((e.currentTarget as HTMLInputElement).value)}
        onBlur={p.onBlur}
      />
      <ErrorText m={p} />
    </div>
  );
}

interface AreaProps extends FieldMeta {
  value: string;
  onValue: (value: string) => void;
  onBlur?: () => void;
  maxLength?: number;
}

export function TextArea(p: AreaProps) {
  return (
    <div class="field">
      <label class="field__label" for={p.id}>
        <LabelText m={p} />
      </label>
      <Help m={p} />
      <textarea
        class="textarea"
        id={p.id}
        name={p.name}
        rows={6}
        value={p.value}
        required={p.required}
        aria-required={p.required ? 'true' : undefined}
        aria-invalid={p.error ? 'true' : undefined}
        aria-describedby={describedBy(p)}
        maxLength={p.maxLength}
        onInput={(e) => p.onValue((e.currentTarget as HTMLTextAreaElement).value)}
        onBlur={p.onBlur}
      />
      <ErrorText m={p} />
    </div>
  );
}

interface SelectProps extends FieldMeta {
  value: string;
  options: readonly Option[];
  placeholder: string;
  onValue: (value: string) => void;
  onBlur?: () => void;
  autoComplete?: string;
}

export function Select(p: SelectProps) {
  return (
    <div class="field">
      <label class="field__label" for={p.id}>
        <LabelText m={p} />
      </label>
      <Help m={p} />
      <div class="select-wrap">
        <select
          class="select"
          id={p.id}
          name={p.name}
          value={p.value}
          required={p.required}
          aria-required={p.required ? 'true' : undefined}
          aria-invalid={p.error ? 'true' : undefined}
          aria-describedby={describedBy(p)}
          autoComplete={p.autoComplete}
          onChange={(e) => p.onValue((e.currentTarget as HTMLSelectElement).value)}
          onBlur={p.onBlur}
        >
          <option value="">{p.placeholder}</option>
          {p.options.map((o) => (
            <option value={o.value} selected={o.value === p.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorText m={p} />
    </div>
  );
}

interface RadioProps extends FieldMeta {
  value: string;
  options: readonly Option[];
  onValue: (value: string) => void;
  /** Lay the cards out in a grid (short labels) or a list. */
  layout?: 'grid' | 'list';
}

export function RadioGroup(p: RadioProps) {
  return (
    <fieldset class="choice-group" aria-describedby={describedBy(p)}>
      <legend class="choice-group__legend">
        <LabelText m={p} />
      </legend>
      <Help m={p} />
      <div class={p.layout === 'list' ? 'choice-list' : 'choice-grid'}>
        {p.options.map((o, i) => (
          <label class="radio-card">
            <input
              class="check__input"
              type="radio"
              id={i === 0 ? p.id : `${p.id}-${i}`}
              name={p.name}
              value={o.value}
              checked={p.value === o.value}
              required={p.required}
              aria-invalid={p.error ? 'true' : undefined}
              onChange={() => p.onValue(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <ErrorText m={p} />
    </fieldset>
  );
}

interface CheckProps {
  id: string;
  name: string;
  checked: boolean;
  onChecked: (checked: boolean) => void;
  error?: string;
  required?: boolean;
  children: ComponentChildren;
}

export function Checkbox(p: CheckProps) {
  const m: FieldMeta = { id: p.id, name: p.name, label: '', error: p.error };
  return (
    <div class="field">
      <label class="check">
        <input
          class="check__input"
          type="checkbox"
          id={p.id}
          name={p.name}
          checked={p.checked}
          required={p.required}
          aria-required={p.required ? 'true' : undefined}
          aria-invalid={p.error ? 'true' : undefined}
          aria-describedby={describedBy(m)}
          onChange={(e) => p.onChecked((e.currentTarget as HTMLInputElement).checked)}
        />
        <span>{p.children}</span>
      </label>
      <ErrorText m={m} />
    </div>
  );
}

export interface SummaryLink {
  name: string;
  target: string;
  text: string;
}

/** Moves focus to the field a summary link points at (a plain anchor jump would not focus radios). */
function focusTarget(e: Event, target: string) {
  const el = document.getElementById(target);
  if (!el) return;
  e.preventDefault();
  el.focus();
  el.scrollIntoView({ block: 'center' });
}

interface SummaryProps {
  id: string;
  title: string;
  items: readonly SummaryLink[];
  /** Ref callback so the form can move focus here after a failed submit. */
  refCb: (el: HTMLDivElement | null) => void;
}

export function ErrorSummary(p: SummaryProps) {
  return (
    <div class="error-summary" role="alert" tabIndex={-1} aria-labelledby={p.id} ref={p.refCb}>
      <h2 class="error-summary__title" id={p.id}>
        {p.title}
      </h2>
      <ul class="error-summary__list">
        {p.items.map((i) => (
          <li>
            <a href={`#${i.target}`} onClick={(e) => focusTarget(e, i.target)}>
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FailureProps {
  id: string;
  title: string;
  text: string;
  actions?: ComponentChildren;
  refCb: (el: HTMLDivElement | null) => void;
}

/** Submission failure (network, 429, 500, closed, stale consent): same panel as the summary. */
export function FailurePanel(p: FailureProps) {
  return (
    <div class="error-summary" role="alert" tabIndex={-1} aria-labelledby={p.id} ref={p.refCb}>
      <h2 class="error-summary__title" id={p.id}>
        {p.title}
      </h2>
      <p>{p.text}</p>
      {p.actions ? <div class="btn-group forms-actions">{p.actions}</div> : null}
    </div>
  );
}

export function Honeypot(p: { value: string; onValue: (v: string) => void }) {
  return (
    <div class="hp" aria-hidden="true">
      <input
        type="text"
        name="hp"
        tabIndex={-1}
        autoComplete="off"
        value={p.value}
        onInput={(e) => p.onValue((e.currentTarget as HTMLInputElement).value)}
      />
    </div>
  );
}

interface SubmitProps {
  label: string;
  sendingLabel: string;
  sending: boolean;
}

export function SubmitButton(p: SubmitProps) {
  return (
    <button
      type="submit"
      class={`btn btn-primary btn-block${p.sending ? ' is-loading' : ''}`}
      aria-disabled={p.sending ? 'true' : undefined}
    >
      {p.sending ? p.sendingLabel : p.label}
    </button>
  );
}
