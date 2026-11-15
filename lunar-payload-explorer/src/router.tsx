// Route table (FR-G4).
import { createBrowserRouter } from 'react-router';
import { RootLayout } from './layouts/RootLayout';
import { loadCatalogue } from './data/catalogue';
import { BASE_PATH } from './lib/url';
import { PageLoading } from './components/states/States';
import { PayloadPage, payloadLoader, shouldRevalidatePayload } from './routes/PayloadPage';
import { CategoriesPage } from './routes/CategoriesPage';
import { CategoryPage } from './routes/CategoryPage';
import { HomePage } from './routes/HomePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { RootError } from './routes/RootError';
import { SearchResultsPage } from './routes/SearchResultsPage';

export function createAppRouter() {
  return createBrowserRouter([
    {
      id: 'root',
      path: '/',
      element: <RootLayout />,
      loader: () => loadCatalogue(),
      errorElement: <RootError />,
      HydrateFallback: PageLoading,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'categories', element: <CategoriesPage /> },
        { path: 'category/:categoryNumber', element: <CategoryPage /> },
        { path: 'search', element: <SearchResultsPage /> },
        {
          path: 'payload/:payloadNumber',
          element: <PayloadPage />,
          loader: payloadLoader,
          // Tab changes (?tab=) must not refetch the article.
          shouldRevalidate: shouldRevalidatePayload,
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ], { basename: BASE_PATH || undefined });
}
