import { useRef } from 'react';
import { Outlet } from 'react-router';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { SearchBox } from '../components/SearchBox';
import { useCatalogue } from '../hooks/useCatalogue';
import { useRouteFocus } from '../hooks/useRouteFocus';

/** Shell shared by every page: skip link, header, routed content, footer. */
export function RootLayout() {
  const catalogue = useCatalogue();
  const mainRef = useRef<HTMLElement>(null);
  useRouteFocus(mainRef);

  return (
    <>
      <a className="skip-link" href="#app">
        Skip to content
      </a>
      <Header>
        <SearchBox syncWithUrl />
      </Header>
      <main id="app" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
      <Footer catalogue={catalogue} />
    </>
  );
}
