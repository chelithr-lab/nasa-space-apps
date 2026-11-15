// Image lightbox (FR-D7, FR-D12): a native <dialog>, so focus trapping and Escape come from the browser.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ImageItem } from '../types/payload';
import { safeUrl } from '../lib/url';
import { Chip } from './Chip';
import { ExternalLink } from './ExternalLink';
import { Icon } from './Icon';

interface LightboxView {
  images: readonly ImageItem[];
  index: number;
}

type OpenLightbox = (images: readonly ImageItem[], index: number) => void;

const LightboxContext = createContext<OpenLightbox>(() => undefined);

/** Opens the shared lightbox on a list of images, starting at `index`. */
export function useOpenLightbox(): OpenLightbox {
  return useContext(LightboxContext);
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<LightboxView | null>(null);
  const open = useCallback<OpenLightbox>((images, index) => setView({ images, index }), []);
  const step = useCallback(
    (delta: number) =>
      setView((v) => (v ? { ...v, index: (v.index + delta + v.images.length) % v.images.length } : v)),
    [],
  );
  const close = useCallback(() => setView(null), []);

  return (
    <LightboxContext.Provider value={open}>
      {children}
      <Lightbox view={view} onStep={step} onClose={close} />
    </LightboxContext.Provider>
  );
}

function Lightbox({
  view,
  onStep,
  onClose,
}: {
  view: LightboxView | null;
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const isOpen = view !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const close = () => ref.current?.close();
  const image = view ? view.images[view.index] : undefined;

  return (
    // The native <dialog> already handles focus and Escape; these handlers only add the arrow keys and backdrop clicks.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="lightbox"
      aria-labelledby="lightbox-title"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (outside the content) closes the dialog.
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onStep(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onStep(-1);
        }
      }}
    >
      {view && image ? (
        <LightboxContent image={image} index={view.index} total={view.images.length} onStep={onStep} onClose={close} />
      ) : null}
    </dialog>
  );
}

function LightboxContent({
  image,
  index,
  total,
  onStep,
  onClose,
}: {
  image: ImageItem;
  index: number;
  total: number;
  onStep: (delta: number) => void;
  onClose: () => void;
}) {
  const caption = image.caption || image.description || 'Image';
  return (
    <>
      <div className="lightbox__bar">
        <span className="label">{`Image ${index + 1} of ${total}`}</span>
        <div className="lightbox__nav">
          {total > 1 ? (
            <button type="button" className="icon-btn" aria-label="Previous image" onClick={() => onStep(-1)}>
              <Icon name="back" />
            </button>
          ) : null}
          {total > 1 ? (
            <button type="button" className="icon-btn" aria-label="Next image" onClick={() => onStep(1)}>
              <Icon name="next" />
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>
      <LightboxPicture key={image.image_url} image={image} />
      <div className="lightbox__meta">
        {image.image_type ? <Chip>{image.image_type}</Chip> : null}
        <h2 id="lightbox-title" className="lightbox__title">
          {caption}
        </h2>
        {image.description && image.description !== image.caption ? <p>{image.description}</p> : null}
        <p className="muted">Credit: {image.credit || image.publisher || 'Unknown'}</p>
        {image.notes ? (
          <p className="note">
            <Icon name="info" size={16} />
            <span>{image.notes}</span>
          </p>
        ) : null}
        {image.source_page_url ? (
          <p>
            <ExternalLink href={image.source_page_url} label="View on source page" className="btn btn--secondary btn--sm" />
          </p>
        ) : null}
      </div>
    </>
  );
}

function LightboxPicture({ image }: { image: ImageItem }) {
  const url = safeUrl(image.image_url);
  const [failed, setFailed] = useState(false);
  return (
    <div className="lightbox__img">
      {url && !failed ? (
        <img
          src={url}
          alt={image.description || image.caption || ''}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <p className="muted">{url ? 'This image could not be loaded.' : 'No image URL available.'}</p>
      )}
    </div>
  );
}
