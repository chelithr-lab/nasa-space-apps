import { Icon } from '../Icon';

/** Plain prose: blank lines separate paragraphs. Text is rendered as text, never as HTML. */
export function Prose({ text, className = 'prose' }: { text: string; className?: string }) {
  const paragraphs = String(text).split(/\n\s*\n/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p.trim()}</p>
      ))}
    </div>
  );
}

/** A caution or information note above some content. */
export function Callout({ text, variant = 'warn' }: { text: string; variant?: 'warn' | 'info' }) {
  return (
    <div className={`callout callout--${variant}`}>
      <CalloutIcon variant={variant} />
      <p>{text}</p>
    </div>
  );
}

function CalloutIcon({ variant }: { variant: 'warn' | 'info' }) {
  return <Icon name={variant === 'warn' ? 'warn' : 'info'} size={20} />;
}
