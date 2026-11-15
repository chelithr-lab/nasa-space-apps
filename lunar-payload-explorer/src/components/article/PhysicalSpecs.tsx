import { formatSpecValue, humanise } from '../../lib/format';
import { isRecord } from '../../lib/guards';
import { isImageList } from '../../lib/article';
import { Chip } from '../Chip';
import { ExternalLink } from '../ExternalLink';
import { Icon } from '../Icon';
import { Callout } from './Prose';
import { renderValue } from './Value';
import { ImageGrid, SectionImages } from './ImageGrid';

// Fields lifted out of the key/value table: they have their own place on the card (FR-D5).
const LIFTED = new Set(['name', 'type', 'qualification', 'source_urls', 'images']);

const asText = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);

function SpecCard({ example }: { example: Record<string, unknown> }) {
  const name = asText(example.name, 'Example');
  const rows = Object.entries(example).filter(([k]) => !LIFTED.has(k));
  const sources = Array.isArray(example.source_urls) ? example.source_urls : [];
  const qualification = typeof example.qualification === 'string' ? example.qualification : '';
  return (
    <article className="spec-card">
      <header className="spec-card__head">
        <h3 className="spec-card__title">{name}</h3>
        {typeof example.type === 'string' && example.type ? <Chip variant="accent">{example.type}</Chip> : null}
      </header>
      {isImageList(example.images) ? <ImageGrid images={example.images} variant="mini" /> : null}
      <table className="spec-table">
        <caption className="sr-only">{`Specifications of ${name}`}</caption>
        <tbody>
          {rows.map(([k, v]) => {
            const flat = formatSpecValue(k, v);
            return (
              <tr key={k}>
                <th scope="row">{humanise(k)}</th>
                <td>{flat !== null ? flat : renderValue(v, k, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {qualification ? (
        <p className="spec-card__note">
          <Icon name="info" size={16} />
          <span>{qualification}</span>
        </p>
      ) : null}
      {sources.length > 0 ? (
        <p className="spec-card__sources">
          <span className="label">Sources</span>
          {sources.map((u, i) => (
            <ExternalLink key={i} href={u} />
          ))}
        </p>
      ) : null}
    </article>
  );
}

/** Physical specifications: a caveat, one card per example, then any other fields (FR-D5). */
export function PhysicalSpecs({ spec }: { spec: unknown }) {
  if (!isRecord(spec)) return <>{renderValue(spec)}</>;
  const examples = Array.isArray(spec.examples) ? spec.examples.filter(isRecord) : [];
  const rest = Object.entries(spec).filter(([k]) => k !== 'note' && k !== 'examples');
  return (
    <div className="stack">
      {typeof spec.note === 'string' && spec.note ? <Callout text={spec.note} /> : null}
      {examples.length > 0 ? (
        <div className="spec-grid">
          {examples.map((ex, i) => (
            <SpecCard key={i} example={ex} />
          ))}
        </div>
      ) : null}
      {rest.map(([k, v]) =>
        isImageList(v) ? (
          <SectionImages key={k} images={v} label={humanise(k)} />
        ) : (
          <div key={k} className="subsection">
            <h3 className="subhead">{humanise(k)}</h3>
            {renderValue(v, k, 1)}
          </div>
        ),
      )}
    </div>
  );
}
