// Accessible tabs (FR-D3, FR-D4): WAI-ARIA tabs with roving tabindex, a scrollable strip with
// arrow buttons, and a <select> on narrow screens. Controlled: the active tab lives in the URL.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface TabItem {
  slug: string;
  label: string;
  body: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  label?: string;
}

export function Tabs({ tabs, activeSlug, onSelect, label = 'Article sections' }: TabsProps) {
  const baseId = useId();
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.slug === activeSlug));
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([activeSlug]));
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // A panel's content is built the first time it is shown and then kept (as in the prototype).
  useEffect(() => {
    setVisited((prev) => (prev.has(activeSlug) ? prev : new Set(prev).add(activeSlug)));
  }, [activeSlug]);

  const updateArrows = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const max = strip.scrollWidth - strip.clientWidth - 2;
    setCanPrev(strip.scrollLeft > 2);
    setCanNext(strip.scrollLeft < max);
  }, []);

  // Keep the active tab in view when it changes, then refresh the scroll arrows.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = tabRefs.current[activeIndex];
    if (strip && tab) {
      const left = tab.offsetLeft;
      const right = left + tab.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollTo({ left: Math.max(0, left - 32) });
      else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: right - strip.clientWidth + 32 });
    }
    updateArrows();
  }, [activeIndex, updateArrows]);

  useEffect(() => {
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const n = tabs.length;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % n;
    else if (e.key === 'ArrowLeft') next = (index - 1 + n) % n;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    const target = tabs[next];
    if (target) onSelect(target.slug);
    tabRefs.current[next]?.focus();
  }

  const selectId = `${baseId}-select`;
  const barClass = ['tabs__bar', canPrev ? 'can-prev' : '', canNext ? 'can-next' : ''].filter(Boolean).join(' ');

  return (
    <div className="tabs">
      <div className={barClass}>
        <button
          type="button"
          className="tabs__arrow tabs__arrow--prev"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => stripRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}
        >
          <Icon name="back" size={18} />
        </button>
        <div ref={stripRef} className="tabs__strip" role="tablist" aria-label={label} onScroll={updateArrows}>
          {tabs.map((tab, i) => {
            const selected = i === activeIndex;
            return (
              <button
                key={tab.slug}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.slug}`}
                className="tabs__tab"
                aria-controls={`${baseId}-panel-${tab.slug}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab.slug)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="tabs__arrow tabs__arrow--next"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => stripRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
        >
          <Icon name="next" size={18} />
        </button>
      </div>

      <div className="tabs__mobile">
        <label className="label" htmlFor={selectId}>
          Section
        </label>
        <select
          id={selectId}
          className="tabs__select"
          value={String(activeIndex)}
          onChange={(e) => {
            const target = tabs[Number(e.target.value)];
            if (target) onSelect(target.slug);
          }}
        >
          {tabs.map((tab, i) => (
            <option key={tab.slug} value={String(i)}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      <div className="tabs__panels">
        {tabs.map((tab, i) => {
          const selected = i === activeIndex;
          const rendered = selected || visited.has(tab.slug);
          return (
            <section
              key={tab.slug}
              role="tabpanel"
              id={`${baseId}-panel-${tab.slug}`}
              className="tabs__panel panel"
              aria-labelledby={`${baseId}-tab-${tab.slug}`}
              tabIndex={0}
              hidden={!selected}
            >
              <h2 className="panel__label">{tab.label}</h2>
              {rendered ? tab.body : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
