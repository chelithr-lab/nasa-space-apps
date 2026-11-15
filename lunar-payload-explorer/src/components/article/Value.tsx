import type { ReactNode } from 'react';
import { formatSpecValue, humanise } from '../../lib/format';
import { isRecord, isStringArray } from '../../lib/guards';
import { isImageList } from '../../lib/article';
import { ExternalLink } from '../ExternalLink';
import { Prose } from './Prose';
import { SectionImages, ImageGrid } from './ImageGrid';

const isUrlKey = (key: string): boolean => /(^|_)urls?$/.test(key);

/**
 * Renders any JSON value (DR-4). Used for unknown sections and for values without a dedicated renderer.
 * Strings become paragraphs, string lists bullets, URL keys links, image lists thumbnails, objects labelled groups.
 */
export function renderValue(value: unknown, key = '', depth = 0): ReactNode {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    return isUrlKey(key) ? (
      <p>
        <ExternalLink href={value} />
      </p>
    ) : (
      <Prose text={value} />
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <p>{formatSpecValue(key, value)}</p>;
  if (isImageList(value)) return <ImageGrid images={value} variant="strip" />;
  if (Array.isArray(value)) {
    if (isStringArray(value)) {
      return isUrlKey(key) ? (
        <ul className="link-list">
          {value.map((u, i) => (
            <li key={i}>
              <ExternalLink href={u} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="bullets">
          {value.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      );
    }
    if (value.length > 0 && value.every((v) => typeof v === 'number')) return <p>{formatSpecValue(key, value)}</p>;
    return (
      <div className="stack">
        {value.map((v, i) =>
          isRecord(v) ? (
            <div key={i} className="subpanel">
              <ObjectGroup obj={v} depth={depth + 1} />
            </div>
          ) : (
            <div key={i}>{renderValue(v, key, depth + 1)}</div>
          ),
        )}
      </div>
    );
  }
  if (isRecord(value)) return <ObjectGroup obj={value} depth={depth} />;
  return null;
}

function ObjectGroup({ obj, depth }: { obj: Record<string, unknown>; depth: number }) {
  const Heading = depth === 0 ? 'h3' : 'h4';
  return (
    <div className="stack">
      {Object.entries(obj).map(([k, v]) => {
        if (isImageList(v)) return <SectionImages key={k} images={v} label={humanise(k)} />;
        const flat = formatSpecValue(k, v);
        if (flat !== null && typeof v !== 'string') {
          return (
            <p key={k}>
              <strong>{`${humanise(k)}: `}</strong>
              {flat}
            </p>
          );
        }
        return (
          <div key={k} className="subsection">
            <Heading className="subhead">{humanise(k)}</Heading>
            {renderValue(v, k, depth + 1)}
          </div>
        );
      })}
    </div>
  );
}
