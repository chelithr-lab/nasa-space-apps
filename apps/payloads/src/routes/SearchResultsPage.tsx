import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ButtonLink } from '../components/ButtonLink';
import { CardGrid } from '../components/cards/PayloadCard';
import { PageHead } from '../components/PageHead';
import { EmptyState } from '../components/states/States';
import { useCatalogue } from '../hooks/useCatalogue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSearchIndex } from '../hooks/useSearchIndex';
import { searchPayloads } from '../lib/search';
import { pluralise } from '../lib/pad';
import type { Payload } from '../types/catalogue';

export function SearchResultsPage() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const index = useSearchIndex();
  const { categories } = useCatalogue();
  useDocumentTitle(query ? `Search: ${query}` : 'Search');

  const matches = useMemo(() => (query ? searchPayloads(index, query) : []), [index, query]);

  // Grouped by category in catalogue order; inside each group, the ranking is kept.
  const groups = useMemo(() => {
    const byCategory = new Map<number, Payload[]>();
    for (const m of matches) {
      const n = m.payload.category;
      byCategory.set(n, [...(byCategory.get(n) ?? []), m.payload]);
    }
    return categories.flatMap((c) => {
      const items = byCategory.get(c.number);
      return items ? [{ category: c, items }] : [];
    });
  }, [matches, categories]);

  const popular = [2, 6, 5].flatMap((n) => {
    const c = categories.find((cat) => cat.number === n);
    return c ? [c] : [];
  });

  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Search' }]} />
      <PageHead
        eyebrow="Search"
        title={query ? `Results for “${query}”` : 'Search payloads'}
        lead={
          query
            ? `${pluralise(matches.length, 'payload')} found`
            : 'Type in the search bar above to find a payload by name, abbreviation, category or number.'
        }
      />

      {query && matches.length === 0 ? (
        <EmptyState
          title={`No payloads match “${query}”`}
          body="Try a shorter word (for example “spectro” instead of “spectroscopy”), check the spelling, or browse a category:"
          actions={
            <>
              {popular.map((c) => (
                <ButtonLink key={c.number} to={`/category/${c.number}`} variant="secondary" size="sm">
                  {c.name}
                </ButtonLink>
              ))}
              <ButtonLink to="/categories" variant="primary" size="sm" iconAfter="next">
                All categories
              </ButtonLink>
            </>
          }
        />
      ) : null}

      {groups.length > 0 ? (
        <div className="stack stack--lg">
          {groups.map(({ category, items }) => (
            <section key={category.number} className="result-group" aria-label={`${category.name}: ${items.length} results`}>
              <h2 className="result-group__head">
                <Link to={`/category/${category.number}`}>{category.name}</Link>
                <span className="result-group__n">({items.length})</span>
              </h2>
              <CardGrid payloads={items} showCategory query={query} />
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
