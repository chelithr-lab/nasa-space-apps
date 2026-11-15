import { useState } from 'react';
import type { ImageItem } from '../../types/payload';
import { safeUrl } from '../../lib/url';
import { useOpenLightbox } from '../Lightbox';
import { Icon } from '../Icon';
import { Chip } from '../Chip';

export type ImageVariant = 'gallery' | 'strip' | 'mini';

function Unavailable({ size }: { size: number }) {
  return (
    <span className="img-unavailable">
      <Icon name="image" size={size} />
      <span>Preview unavailable</span>
    </span>
  );
}

/** Thumbnail with a labelled fallback when the URL is missing or does not return an image. */
function Thumb({ url, alt, size }: { url: string | null; alt: string; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="gallery__img">
      {url && !failed ? (
        <img src={url} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <Unavailable size={size} />
      )}
    </div>
  );
}

/**
 * Thumbnails that open the lightbox. The lightbox only steps through this list (FR-D12).
 * gallery: the Images tab; strip: inside a section; mini: thumbnails inside a spec card.
 */
export function ImageGrid({ images, variant = 'gallery' }: { images: readonly ImageItem[]; variant?: ImageVariant }) {
  const open = useOpenLightbox();
  const valid = images.filter((i) => i && typeof i === 'object');
  const showText = variant !== 'mini';
  const size = variant === 'mini' ? 24 : 36;

  return (
    <ul className={`gallery gallery--${variant}`}>
      {valid.map((img, i) => {
        const caption = img.caption || img.description || '';
        return (
          <li key={i}>
            <button
              type="button"
              className="gallery__item"
              aria-label={`Open image ${i + 1} of ${valid.length}: ${caption}`}
              title={variant === 'mini' ? caption : undefined}
              onClick={() => open(valid, i)}
            >
              <Thumb url={safeUrl(img.image_url)} alt={img.description || caption} size={size} />
              {showText ? (
                <span className="gallery__cap">
                  {variant === 'gallery' && img.image_type ? <Chip>{img.image_type}</Chip> : null}
                  <span className="gallery__text">{caption}</span>
                  <span className="gallery__credit">{`© ${img.credit || img.publisher || 'Unknown'}`}</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled image strip placed inside an article section (FR-D12). */
export function SectionImages({ images, label = 'Images' }: { images: readonly ImageItem[]; label?: string }) {
  return (
    <div className="subsection section-images">
      <h3 className="subhead">
        {label}
        <span className="subhead__n"> ({images.length})</span>
      </h3>
      <ImageGrid images={images} variant="strip" />
    </div>
  );
}
