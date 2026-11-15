import { useId, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { CardGrid } from '../components/cards/PayloadCard';
import { EmptyState } from '../components/states/States';
import { Icon } from '../components/Icon';
import { PageHead } from '../components/PageHead';
import { Segmented } from '../components/Segmented';
import { useCatalogue } from '../hooks/useCatalogue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { normalise } from '../lib/search';
import { pad2, pluralise } from '../lib/pad';
import type { Category } from '../types/catalogue';
import { NotFoundPage } from './NotFoundPage';

type Show = 'all' | 'detail';

export function CategoryPage() {
  const { categoryNumber } = useParams();
  const catalogue = useCatalogue();
  const category = catalogue.categoryByNumber.get(Number(categoryNumber));
  if (!category) return <NotFoundPage />;
  return <CategoryView category={category} />;
}

function CategoryView({ category }: { category: Category }) {
  useDocumentTitle(category.name);
  const { categories } = useCatalogue();
  const filterId = useId();
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState<Show>('all');

  const index = categories.indexOf(category);
  const prev = categories[index - 1];
  const next = categories[index + 1];

  const needle = normalise(filter);
  const visible = useMemo(
    () =>
      category.payloads.filter(
        (p) => (show === 'all' || p.hasDetail) && (needle === '' || normalise(p.name).includes(needle)),
      ),
    [category, show, needle],
  );

  return (
    <div className="container page">
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'Categories', to: '/categories' },
          { label: category.name },
        ]}
      />
      <div className="panel cat-head">
        <PageHead
          iconName={category.icon}
          eyebrow={`Category ${pad2(category.number)} of ${categories.length}`}
          title={category.name}
          lead={category.description}
        />
        <p className="cat-head__meta">
          {pluralise(category.payloads.length, 'payload')} ·{' '}
          <span className={category.withDetail > 0 ? 'ok' : 'muted'}>
            <span className="dot" aria-hidden="true" />
            {` ${category.withDetail} with article${category.withDetail === 1 ? '' : 's'}`}
          </span>
        </p>
      </div>

      <div className="toolbar">
        <div className="filter">
          <label htmlFor={filterId} className="sr-only">
            Filter payloads in this category
          </label>
          <Icon name="search" size={18} />
          <input
            id={filterId}
            type="search"
            placeholder="Filter in this category…"
            autoComplete="off"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Segmented<Show>
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All' },
            { value: 'detail', label: 'With articles' },
          ]}
        />
        <p className="toolbar__count" aria-live="polite">
          {`${visible.length} of ${category.payloads.length} shown`}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="grid grid--cards">
          <EmptyState
            title="No payloads match these filters"
            body={
              show === 'detail' && needle === ''
                ? 'No payloads in this category have a published article yet.'
                : 'Try a different word or clear the filter.'
            }
          />
        </div>
      ) : (
        <CardGrid payloads={visible} query={filter} heading="h2" />
      )}

      <nav className="pager" aria-label="Other categories">
        {prev ? (
          <Link className="pager__link" to={`/category/${prev.number}`} rel="prev">
            <Icon name="back" size={18} />
            <span>
              <span className="label">Previous category</span>
              <span className="pager__name">{prev.name}</span>
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link className="pager__link pager__link--next" to={`/category/${next.number}`} rel="next">
            <span>
              <span className="label">Next category</span>
              <span className="pager__name">{next.name}</span>
            </span>
            <Icon name="next" size={18} />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
