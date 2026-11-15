import { hostOf, safeUrl } from '../lib/url';

/**
 * A link that opens in a new tab. Unsafe or missing URLs render as plain text (NFR-5).
 */
export function ExternalLink({ href, label, className = 'ext-link' }: { href: unknown; label?: string; className?: string }) {
  const url = safeUrl(href);
  const text = label ?? (typeof href === 'string' ? hostOf(href) : '');
  if (!url) return <span>{text}</span>;
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer">
      {text}
      <span className="ext-icon" aria-hidden="true">
        ↗
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
