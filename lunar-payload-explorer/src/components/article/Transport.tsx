import { humanise } from '../../lib/format';
import { isRecord, isStringArray } from '../../lib/guards';
import { isImageList } from '../../lib/article';
import { Prose } from './Prose';
import { renderValue } from './Value';
import { SectionImages } from './ImageGrid';

function Stepper({ steps }: { steps: string[] }) {
  return (
    <ol className="stepper">
      {steps.map((s, i) => (
        <li key={i} className="stepper__step">
          <span className="stepper__n" aria-hidden="true">
            {i + 1}
          </span>
          <p>{s}</p>
        </li>
      ))}
    </ol>
  );
}

/** Transportation & deployment: overview, numbered steps, then the other subsections and images (FR-D6). */
export function Transport({ data }: { data: unknown }) {
  if (!isRecord(data)) return <>{renderValue(data)}</>;
  return (
    <div className="stack">
      {Object.entries(data).map(([k, v]) => {
        if (k === 'overview' && typeof v === 'string') return <Prose key={k} text={v} className="prose prose--lead" />;
        if (isImageList(v)) return <SectionImages key={k} images={v} label={humanise(k)} />;
        if (isStringArray(v) && /process|steps/.test(k)) {
          return (
            <div key={k} className="subsection">
              <h3 className="subhead">{humanise(k)}</h3>
              <Stepper steps={v} />
            </div>
          );
        }
        return (
          <div key={k} className="subsection">
            <h3 className="subhead">{humanise(k)}</h3>
            {renderValue(v, k, 1)}
          </div>
        );
      })}
    </div>
  );
}
