import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Header } from '../components/Header';
import { ErrorState } from '../components/states/States';

/** Shown when the catalogue cannot be loaded. The header stays so visitors can still navigate. */
export function RootError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <>
      <a className="skip-link" href="#app">
        Skip to content
      </a>
      <Header />
      <main id="app" tabIndex={-1}>
        <div className="container page">
          <ErrorState
            title="The catalogue could not be loaded"
            message={`${detail}. Check that the app is running (npm run dev) and that public/data/catalogue.json exists, then try again.`}
            onRetry={() => window.location.reload()}
          />
        </div>
      </main>
    </>
  );
}
