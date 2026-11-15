import { useState } from 'react';
import { Link } from 'react-router';
import heroMoon from '../assets/hero-moon.jpg';
import { CONFIG } from '../config';
import { ButtonLink } from '../components/ButtonLink';
import { CategoryTile } from '../components/cards/CategoryTile';
import { Icon } from '../components/Icon';
import { SearchBox } from '../components/SearchBox';
import { useCatalogue } from '../hooks/useCatalogue';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { IconName } from '../components/Icon';

function Stat({ value, label, icon }: { value: number; label: string; icon: IconName }) {
  return (
    <div className="panel stat">
      <span className="stat__icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="stat__n">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function HowCard({ n, title, icon, children }: { n: number; title: string; icon: IconName; children: string }) {
  return (
    <div className="panel how">
      <div className="how__head">
        <span className="how__n">{n}</span>
        <Icon name={icon} size={20} />
      </div>
      <h3 className="how__title">{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function HomePage() {
  useDocumentTitle(undefined);
  const catalogue = useCatalogue();
  const [moonFailed, setMoonFailed] = useState(false);
  const articles = catalogue.payloads.filter((p) => p.hasDetail).length;

  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-title">
        <div className={moonFailed ? 'hero__moon hero__moon--css' : 'hero__moon'}>
          {moonFailed ? null : (
            <img
              src={heroMoon}
              alt="Full Moon photographed by the Apollo 17 crew"
              decoding="async"
              fetchPriority="high"
              onError={() => setMoonFailed(true)}
            />
          )}
        </div>
        <div className="hero__content">
          <p className="eyebrow">Serenity - Payload Explorer</p>
          <h1 id="hero-title" tabIndex={-1}>
            The instruments that explore the Moon
          </h1>
          <p className="hero__lead">
            Discover scientific payloads carried by, or proposed for, lunar missions. Browse them by category, search
            by name, and read what each one was designed to measure and how it works.
          </p>
          <SearchBox size="lg" placeholder="Try “seismometer”, “APXS” or “radar”…" />
          <div className="hero__actions">
            <ButtonLink to="/categories" variant="primary" iconAfter="next">
              Explore categories
            </ButtonLink>
            <a className="btn btn--secondary" href={CONFIG.serenityUrl}>
              <Icon name="back" size={18} />
              Back to {CONFIG.serenityName}
            </a>
          </div>
        </div>
        <p className="hero__credit">Image: Apollo 17 crew, NASA (AS17-152-23311)</p>
      </section>

      <section className="container stats" aria-label="Catalogue at a glance">
        <Stat value={catalogue.categories.length} label="Categories" icon="grid" />
        <Stat value={catalogue.payloads.length} label="Payloads" icon="target" />
        <Stat value={articles} label={articles === 1 ? 'Detailed article' : 'Detailed articles'} icon="book" />
      </section>

      <section className="container section" aria-labelledby="browse-h">
        <div className="section-label">
          <h2 className="label" id="browse-h">
            Browse by category
          </h2>
          <Link className="btn btn--ghost" to="/categories">
            View all
            <Icon name="next" size={18} />
          </Link>
        </div>
        <div className="grid grid--tiles">
          {catalogue.categories.map((c) => (
            <CategoryTile key={c.number} category={c} />
          ))}
        </div>
      </section>

      <section className="container section" aria-labelledby="how-h">
        <div className="section-label">
          <h2 className="label" id="how-h">
            How it works
          </h2>
        </div>
        <div className="grid grid--3">
          <HowCard n={1} title="Browse" icon="grid">
            Pick one of 16 categories, from seismology to sample return, to see the payloads in it.
          </HowCard>
          <HowCard n={2} title="Search" icon="search">
            Type a name or an abbreviation, such as “LIBS” or “APXS”, to jump straight to an instrument.
          </HowCard>
          <HowCard n={3} title="Read the details" icon="book">
            Each article is organised into tabs: purpose, operating principle, specifications, deployment, images and
            references.
          </HowCard>
        </div>
      </section>

      <section className="container section">
        <div className="callout callout--warn callout--lg">
          <Icon name="warn" size={22} />
          <div>
            <h2 className="label">About this data</h2>
            <p>
              This is a working catalogue. Entries have not yet been independently deduplicated or technically
              validated, and detailed articles are being added over time. Specifications always refer to named example
              instruments, not to every instrument of that type.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
