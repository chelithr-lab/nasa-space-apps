import type { ReactNode } from 'react';
import { Icon } from '../Icon';

/** Shown while the catalogue loads on the first visit. */
export function PageLoading() {
  return (
    <main id="app" tabIndex={-1}>
      <div className="container page">
        <Skeleton />
      </div>
    </main>
  );
}

/** Loading placeholder: a shimmering panel (prototype `.skeleton`). */
export function Skeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="panel skeleton" aria-busy="true" aria-label="Loading">
      <div className="sk sk--title" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="sk" style={{ width: `${92 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  actions?: ReactNode;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, actions }: ErrorStateProps) {
  return (
    <div className="panel state state--error" role="alert">
      <div className="state__icon">
        <Icon name="warn" size={36} />
      </div>
      <h2 className="state__title">{title}</h2>
      {message ? <p className="state__body">{message}</p> : null}
      <div className="state__actions">
        {onRetry ? (
          <button className="btn btn--primary" type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  body?: string;
  actions?: ReactNode;
  icon?: string;
}

export function EmptyState({ title, body, actions, icon = 'search' }: EmptyStateProps) {
  return (
    <div className="panel state">
      <div className="state__icon">
        <Icon name={icon} size={36} />
      </div>
      <h2 className="state__title">{title}</h2>
      {body ? <p className="state__body">{body}</p> : null}
      {actions ? <div className="state__actions">{actions}</div> : null}
    </div>
  );
}
