import { ButtonLink } from '../components/ButtonLink';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Not found');
  return (
    <div className="container page">
      <div className="panel state">
        <div className="state__icon">
          <Icon name="moon" size={40} />
        </div>
        <h1 className="state__title" tabIndex={-1}>
          We couldn’t find that page or payload
        </h1>
        <p className="state__body">The link may be out of date. Try searching, or start from the home page.</p>
        <div className="state__search">
          <SearchBox size="md" />
        </div>
        <div className="state__actions">
          <ButtonLink to="/" variant="secondary">
            Home
          </ButtonLink>
          <ButtonLink to="/categories" variant="primary" iconAfter="next">
            All categories
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
