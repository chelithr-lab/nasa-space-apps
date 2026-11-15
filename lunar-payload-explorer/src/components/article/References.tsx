import type { Reference } from '../../types/payload';
import { isRecord } from '../../lib/guards';
import { ExternalLink } from '../ExternalLink';

/** Numbered reference list; each link opens in a new tab (FR-D8). */
export function References({ references }: { references: unknown[] }) {
  const items = references.filter(isRecord) as Partial<Reference>[];
  return (
    <ol className="refs">
      {items.map((r, i) => (
        <li key={i}>
          <span className="refs__title">
            <ExternalLink href={r.url} label={r.title || r.url || ''} />
          </span>
          {r.publisher ? <span className="refs__pub">{r.publisher}</span> : null}
        </li>
      ))}
    </ol>
  );
}
