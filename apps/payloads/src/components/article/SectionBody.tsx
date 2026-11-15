import type { ReactNode } from 'react';
import type { ArticleSection } from '../../lib/article';
import { isImageList } from '../../lib/article';
import { Callout, Prose } from './Prose';
import { PhysicalSpecs } from './PhysicalSpecs';
import { References } from './References';
import { SectionImages, ImageGrid } from './ImageGrid';
import { Transport } from './Transport';
import { renderValue } from './Value';

/** The Images tab: every image in the article's registry (FR-D7). */
function Gallery({ value }: { value: unknown }) {
  if (!isImageList(value)) return <>{renderValue(value)}</>;
  const small = value.some((i) => /150-pixel|150 px|[?&]h=150/.test(`${i.notes ?? ''} ${i.image_url ?? ''}`));
  return (
    <div className="stack">
      {small ? (
        <Callout
          variant="info"
          text="Some images are small preview crops supplied by the publisher. Open an image and use “View on source page” for the full-resolution version."
        />
      ) : null}
      <ImageGrid images={value} variant="gallery" />
    </div>
  );
}

function renderKind(section: ArticleSection): ReactNode {
  const { value, kind, key } = section;
  switch (kind) {
    case 'prose':
      return typeof value === 'string' ? <Prose text={value} /> : renderValue(value, key);
    case 'physical':
      return typeof value === 'string' ? <Prose text={value} /> : <PhysicalSpecs spec={value} />;
    case 'transport':
      return typeof value === 'string' ? <Prose text={value} /> : <Transport data={value} />;
    case 'gallery':
      return <Gallery value={value} />;
    case 'references':
      return <References references={Array.isArray(value) ? value : []} />;
    case 'generic':
      return renderValue(value, key);
  }
}

/** One tab's content, with any section images attached below it (FR-D12). */
export function SectionBody({ section }: { section: ArticleSection }) {
  const body = renderKind(section);
  if (!section.images) return <>{body}</>;
  return (
    <div className="stack stack--section">
      {body}
      <SectionImages images={section.images} />
    </div>
  );
}
