import { Link } from 'react-router';
import type { Category } from '../../types/catalogue';
import { pad2, pluralise } from '../../lib/pad';
import { Icon } from '../Icon';

interface CategoryTileProps {
  category: Category;
  heading?: 'h2' | 'h3';
}

/** One category in the tiled grid (FR-C1). The whole tile is a link. */
export function CategoryTile({ category, heading = 'h3' }: CategoryTileProps) {
  const Heading = heading;
  const articles = category.withDetail;
  return (
    <Link className="tile" to={`/category/${category.number}`}>
      <div className="tile__top">
        <span className="tile__icon">
          <Icon name={category.icon} size={28} />
        </span>
        <span className="tile__num">CATEGORY {pad2(category.number)}</span>
      </div>
      <Heading className="tile__title">{category.name}</Heading>
      <p className="tile__desc">{category.description}</p>
      <span className="tile__count">
        {pluralise(category.payloads.length, 'payload')}
        {articles > 0 ? (
          <span className="tile__articles">
            {` · ${articles} with article${articles === 1 ? '' : 's'}`}
          </span>
        ) : null}
        <span className="tile__chev" aria-hidden="true">
          {' ›'}
        </span>
      </span>
    </Link>
  );
}
