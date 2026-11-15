// P5 — Payload details (FR-D1–D11) and the coming-soon page (DR-6).
import { useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData, useRevalidator, useSearchParams, type LoaderFunctionArgs } from 'react-router';
import { loadCatalogue } from '../data/catalogue';
import { loadPayloadDetail } from '../data/payload';
import { ButtonLink } from '../components/ButtonLink';
import { PlaceholderArt, PayloadCard } from '../components/cards/PayloadCard';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Icon } from '../components/Icon';
import { StatusChip } from '../components/Chip';
import { LightboxProvider, useOpenLightbox } from '../components/Lightbox';
import { Tabs, type TabItem } from '../components/Tabs';
import { ErrorState } from '../components/states/States';
import { SectionBody } from '../components/article/SectionBody';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { buildSections, featureImages } from '../lib/article';
import { safeUrl } from '../lib/url';
import { pad3 } from '../lib/pad';
import type { Payload } from '../types/catalogue';
import type { ImageItem, PayloadDetail } from '../types/payload';
import { NotFoundPage } from './NotFoundPage';

export interface PayloadRouteData {
  payload: Payload | null;
  detail: PayloadDetail | null;
  error: string | null;
}

/** Loads the catalogue entry and, if it exists, the article. A failed article load is shown on the page. */
export async function payloadLoader({ params }: LoaderFunctionArgs): Promise<PayloadRouteData> {
  const catalogue = await loadCatalogue();
  const payload = catalogue.payloadByNumber.get(Number(params.payloadNumber));
  if (!payload) return { payload: null, detail: null, error: null };
  try {
    return { payload, detail: await loadPayloadDetail(payload), error: null };
  } catch (err) {
    return { payload, detail: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** Changing only ?tab= does not reload the payload. */
export function shouldRevalidatePayload({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: {
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
}): boolean {
  return currentUrl.pathname !== nextUrl.pathname && defaultShouldRevalidate;
}

export function PayloadPage() {
  const data = useLoaderData() as PayloadRouteData;
  if (!data.payload) return <NotFoundPage />;
  return (
    <LightboxProvider>
      <PayloadView key={data.payload.number} payload={data.payload} detail={data.detail} error={data.error} />
    </LightboxProvider>
  );
}

function neighbours(payload: Payload): { prev: Payload | null; next: Payload | null } {
  const list = payload.categoryRef.payloads;
  const i = list.indexOf(payload);
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

/** Articles first, then the nearest numbers, within the same category. */
function relatedPayloads(payload: Payload, count = 4): Payload[] {
  return payload.categoryRef.payloads
    .filter((p) => p !== payload)
    .sort(
      (a, b) =>
        Number(b.hasDetail) - Number(a.hasDetail) ||
        Math.abs(a.number - payload.number) - Math.abs(b.number - payload.number),
    )
    .slice(0, count);
}

function PayloadView({
  payload,
  detail,
  error,
}: {
  payload: Payload;
  detail: PayloadDetail | null;
  error: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const revalidator = useRevalidator();
  const category = payload.categoryRef;
  const { prev, next } = neighbours(payload);
  const article = detail?.payload.article;
  const sections = useMemo(() => (article ? buildSections(article) : []), [article]);
  const title = detail?.payload.name || payload.name;
  useDocumentTitle(title);

  // The active tab lives in ?tab=. An unknown tab falls back to Overview and the URL is corrected.
  const requested = searchParams.get('tab');
  const known = sections.some((s) => s.slug === requested);
  const activeSlug = known && requested ? requested : (sections[0]?.slug ?? '');
  useEffect(() => {
    if (requested && sections.length > 0 && !known) setSearchParams({}, { replace: true });
  }, [requested, known, sections.length, setSearchParams]);

  function selectTab(slug: string) {
    // Replace the history entry, so Back leaves the payload instead of stepping through tabs.
    setSearchParams(slug === sections[0]?.slug ? {} : { tab: slug }, { replace: true });
  }

  const tabs: TabItem[] = sections.map((s) => ({ slug: s.slug, label: s.label, body: <SectionBody section={s} /> }));
  const lead = payload.hasDetail ? (payload.summary ?? '') : 'A detailed article for this payload hasn’t been published yet.';

  return (
    <div className="container page pd">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Categories', to: '/categories' },
          { label: category.name, to: `/category/${category.number}` },
          { label: payload.name },
        ]}
      />

      <section className="panel pd-head">
        <div className="pd-head__text">
          <div className="pd-meta">
            <span className="badge badge--lg">#{pad3(payload.number)}</span>
            <Link className="chip chip--link" to={`/category/${category.number}`}>
              <Icon name={category.icon} size={14} />
              {category.name}
            </Link>
            {payload.hasDetail ? null : <StatusChip hasDetail={false} />}
          </div>
          <h1 className="pd-title" tabIndex={-1}>
            {title}
          </h1>
          <p className="pd-lead">{lead}</p>
          <div className="pd-nav">
            {prev ? (
              <ButtonLink
                to={`/payload/${prev.number}`}
                variant="secondary"
                size="sm"
                iconBefore="back"
                ariaLabel={`Previous payload: ${prev.name}`}
              >
                {prev.name}
              </ButtonLink>
            ) : null}
            {next ? (
              <ButtonLink
                to={`/payload/${next.number}`}
                variant="secondary"
                size="sm"
                iconAfter="next"
                ariaLabel={`Next payload: ${next.name}`}
              >
                {next.name}
              </ButtonLink>
            ) : null}
          </div>
        </div>
        <div className="pd-head__media">
          <FeatureFigure payload={payload} images={article ? featureImages(article) : []} />
        </div>
      </section>

      <div className="pd-body">
        {error ? (
          <ErrorState
            title="We couldn’t load this article"
            message={error}
            onRetry={() => revalidator.revalidate()}
            actions={
              <ButtonLink to={`/category/${category.number}`} variant="secondary">
                Back to category
              </ButtonLink>
            }
          />
        ) : !detail ? (
          <ComingSoon payload={payload} />
        ) : (
          <Tabs tabs={tabs} activeSlug={activeSlug} onSelect={selectTab} />
        )}
      </div>

      <section className="section" aria-labelledby="more-h">
        <div className="section-label">
          <h2 className="label" id="more-h">
            More in this category
          </h2>
          <ButtonLink to={`/category/${category.number}`} variant="ghost" iconAfter="next">
            View all
          </ButtonLink>
        </div>
        <div className="grid grid--cards">
          {relatedPayloads(payload).map((p) => (
            <PayloadCard key={p.number} payload={p} heading="h3" />
          ))}
        </div>
      </section>
    </div>
  );
}

function ComingSoon({ payload }: { payload: Payload }) {
  const category = payload.categoryRef;
  return (
    <div className="panel state state--soon">
      <div className="state__icon">
        <Icon name="book" size={36} />
      </div>
      <h2 className="state__title">Article coming soon</h2>
      <p className="state__body">
        {`“${payload.name}” is part of the ${category.name} category. Its overview, operating principle, specifications, images and references will appear here once its article is published.`}
      </p>
      <div className="state__actions">
        <ButtonLink to={`/category/${category.number}`} variant="primary" iconAfter="next">
          Browse this category
        </ButtonLink>
        <ButtonLink to="/categories" variant="secondary">
          All categories
        </ButtonLink>
      </div>
    </div>
  );
}

/** The main picture for the article. Clicking it opens the lightbox on the same images. */
function FeatureFigure({ payload, images }: { payload: Payload; images: ImageItem[] }) {
  const open = useOpenLightbox();
  const valid = images.filter((i) => safeUrl(i.image_url) !== null);
  const first = valid[0];
  if (!first) {
    return (
      <figure className="pd-figure">
        <PlaceholderArt iconName={payload.categoryRef.icon} className="pd-figure__ph" />
      </figure>
    );
  }
  return (
    <FeatureImage
      key={first.image_url}
      image={first}
      iconName={payload.categoryRef.icon}
      onOpen={() => open(valid, 0)}
    />
  );
}

function FeatureImage({ image, iconName, onOpen }: { image: ImageItem; iconName: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const url = safeUrl(image.image_url);
  if (!url || failed) {
    return (
      <figure className="pd-figure">
        <PlaceholderArt iconName={iconName} className="pd-figure__ph" />
      </figure>
    );
  }
  const caption = image.caption || '';
  return (
    <figure className="pd-figure">
      <button type="button" className="pd-figure__btn" aria-label="Enlarge image" onClick={onOpen}>
        <img
          src={url}
          alt={image.description || image.caption || ''}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </button>
      <figcaption>{`${caption}${image.credit ? ` · © ${image.credit}` : ''}`}</figcaption>
    </figure>
  );
}
