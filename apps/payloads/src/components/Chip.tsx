import type { ReactNode } from 'react';

type ChipVariant = '' | 'ok' | 'warn' | 'accent';

export function Chip({ children, variant = '' }: { children: ReactNode; variant?: ChipVariant }) {
  return <span className={['chip', variant ? `chip--${variant}` : ''].filter(Boolean).join(' ')}>{children}</span>;
}

/** "Article available" (green) or "Coming soon" (amber). */
export function StatusChip({ hasDetail }: { hasDetail: boolean }) {
  return hasDetail ? (
    <span className="chip chip--ok">
      <span className="dot" aria-hidden="true" />
      Article available
    </span>
  ) : (
    <span className="chip chip--warn">
      <span className="dot dot--hollow" aria-hidden="true" />
      Coming soon
    </span>
  );
}
