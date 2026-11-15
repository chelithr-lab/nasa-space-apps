import { useState } from 'react';
import { Link } from 'react-router';
import type { Payload } from '../../types/catalogue';
import { pad3 } from '../../lib/pad';
import { safeUrl } from '../../lib/url';
import { Highlight } from '../Highlight';
import { Icon } from '../Icon';
import { StatusChip } from '../Chip';

/** Category icon on a lunar gradient, shown when there is no usable image. */
export function PlaceholderArt({ iconName = 'moon', className = 'card__art card__art--ph' }: { iconName?: string; className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <Icon name={iconName} size={44} />
    </div>
  );
}

function CardImage({ payload }: { payload: Payload }) {
  const url = safeUrl(payload.thumb);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <PlaceholderArt iconName={payload.categoryRef.icon} />;
  return (
    <div className="card__art">
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

interface PayloadCardProps {
  payload: Payload;
  /** Show the category name (search results, related lists; DR-2). */
  showCategory?: boolean;
  /** Highlight this query in the title. */
  query?: string;
  heading?: 'h2' | 'h3';
}

/** One payload as a card (FR-L2): image, number, status, summary and a "View details" button. */
export function PayloadCard({ payload, showCategory = false, query = '', heading = 'h3' }: PayloadCardProps) {
  const Heading = heading;
  const titleId = `card-title-${payload.number}`;
  return (
    <article
      className={['card', payload.hasDetail ? 'card--has-detail' : ''].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
    >
      <CardImage payload={payload} />
      <div className="card__body">
        <div className="card__meta">
          <span className="badge">#{pad3(payload.number)}</span>
          <StatusChip hasDetail={payload.hasDetail} />
        </div>
        <Heading className="card__title" id={titleId}>
          <Highlight text={payload.name} query={query} />
        </Heading>
        {showCategory ? <p className="card__cat">{payload.categoryRef.name}</p> : null}
        {payload.summary ? <p className="card__summary">{payload.summary}</p> : null}
        <Link
          className="btn btn--primary btn--sm card__cta stretched"
          to={`/payload/${payload.number}`}
          aria-describedby={titleId}
        >
          View details
          <Icon name="next" size={16} />
        </Link>
      </div>
    </article>
  );
}

export function CardGrid({
  payloads,
  showCategory,
  query,
  heading,
}: {
  payloads: Payload[];
  showCategory?: boolean;
  query?: string;
  heading?: 'h2' | 'h3';
}) {
  return (
    <div className="grid grid--cards">
      {payloads.map((p) => (
        <PayloadCard key={p.number} payload={p} showCategory={showCategory} query={query} heading={heading} />
      ))}
    </div>
  );
}
