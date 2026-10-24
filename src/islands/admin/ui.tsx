/** @jsxImportSource preact */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { ApiFailure } from './api';
import { failureMessage, useAdmin } from './context';

/** View heading that takes focus when a view mounts after navigation (screen-reader orientation). */
export function ViewHeading(props: { children: ComponentChildren; focus: boolean; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (props.focus) ref.current?.focus();
    // Only on mount: later re-renders must not steal focus.
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} id={props.id} class="admin-heading">
      {props.children}
    </h1>
  );
}

/** Takes its text as a prop so it also works before the context exists (the first /me call). */
export function Loading(props: { label: string }) {
  return (
    <p class="admin-loading" role="status">
      {props.label}
    </p>
  );
}

/** Error panel with an optional retry. role="alert" so it is announced when it appears. */
export function ErrorBox(props: { failure: ApiFailure; onRetry?: () => void }) {
  const { t } = useAdmin();
  const message = failureMessage(t, props.failure);
  return (
    <div class="error-summary admin-error" role="alert">
      <p>{message}</p>
      {props.onRetry && (
        <button type="button" class="btn btn-secondary btn-s" onClick={props.onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** Inline error for one form (409, 422 and so on), without a retry. */
export function FormError(props: { message: string | null }) {
  if (!props.message) return null;
  return (
    <p class="field__error" role="alert">
      {props.message}
    </p>
  );
}
