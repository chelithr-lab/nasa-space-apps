import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { BASE_PATH, legacyHashToPath } from './lib/url';
import { createAppRouter } from './router';

// Prototype links used hash URLs (/#/payload/13). Rewrite them to clean URLs before the router reads the location.
const legacyPath = legacyHashToPath(window.location.hash);
if (legacyPath) window.history.replaceState(null, '', `${BASE_PATH}${legacyPath}`);

const router = createAppRouter();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
