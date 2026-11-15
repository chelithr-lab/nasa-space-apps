import { useMemo, useState } from 'react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { CategoryTile } from '../components/cards/CategoryTile';
import { PageHead } from '../components/PageHead';
import { Segmented } from '../components/Segmented';
import { useCatalogue } from '../hooks/useCatalogue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type SortMode = 'catalogue' | 'az';

export function CategoriesPage() {
  useDocumentTitle('Categories');
  const { categories, payloads } = useCatalogue();
  const [sort, setSort] = useState<SortMode>('catalogue');

  const sorted = useMemo(
    () => (sort === 'az' ? [...categories].sort((a, b) => a.name.localeCompare(b.name)) : categories),
    [categories, sort],
  );

  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Categories' }]} />
      <PageHead
        eyebrow="Catalogue"
        title="Payload categories"
        lead={`${categories.length} categories · ${payloads.length} payloads. Choose a category to see its instruments.`}
        aside={
          <Segmented<SortMode>
            label="Sort categories"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'catalogue', label: 'Catalogue order' },
              { value: 'az', label: 'A–Z' },
            ]}
          />
        }
      />
      <div className="grid grid--tiles">
        {sorted.map((c) => (
          <CategoryTile key={c.number} category={c} heading="h2" />
        ))}
      </div>
    </div>
  );
}
