import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { CONFIG } from '../config';
import { Icon } from './Icon';

interface HeaderProps {
  /** Slot for the search box (Phase 2). */
  children?: ReactNode;
}

export function Header({ children }: HeaderProps) {
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const onCategories = pathname === '/categories' || pathname.startsWith('/category/');

  return (
    <header className="app-header">
      <div className="app-header__inner container">
        <Link className="wordmark" to="/" aria-label="Lunar Payloads Explorer, home">
          <span className="wordmark__name">Lunar Payloads</span>
          <span className="wordmark__sub">Explorer</span>
        </Link>
        <nav className="nav-pill" aria-label="Primary">
          <Link to="/" aria-current={onHome ? 'page' : undefined}>
            Home
          </Link>
          <Link to="/categories" aria-current={onCategories ? 'page' : undefined}>
            Categories
          </Link>
        </nav>
        <div className="app-header__search">{children}</div>
        <a className="btn btn--secondary btn--sm serenity-link" href={CONFIG.serenityUrl}>
          <Icon name="back" size={16} />
          <span>{CONFIG.serenityName}</span>
          <span className="sr-only"> (back to the main Lunar Explorer)</span>
        </a>
      </div>
    </header>
  );
}
