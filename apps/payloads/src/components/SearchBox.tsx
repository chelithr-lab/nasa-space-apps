// Typeahead search (FR-S1–S3): the WAI-ARIA combobox pattern with list autocomplete.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { CONFIG } from '../config';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSearchIndex } from '../hooks/useSearchIndex';
import { searchPayloads } from '../lib/search';
import { pad3 } from '../lib/pad';
import { Highlight } from './Highlight';
import { Icon } from './Icon';

interface SearchBoxProps {
  size?: 'sm' | 'md' | 'lg';
  placeholder?: string;
  label?: string;
  /** On the results page, keep the box showing the query from the URL. */
  syncWithUrl?: boolean;
}

export function SearchBox({
  size = 'sm',
  placeholder = 'Search payloads…',
  label = 'Search payloads',
  syncWithUrl = false,
}: SearchBoxProps) {
  const index = useSearchIndex();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const urlQuery = syncWithUrl && pathname === '/search' ? (params.get('q') ?? '') : null;

  const [text, setText] = useState(urlQuery ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  useEffect(() => {
    if (urlQuery !== null) setText(urlQuery);
  }, [urlQuery]);

  // Results follow the debounced text, so typing does not search on every keystroke.
  const debounced = useDebouncedValue(text, CONFIG.typeaheadDebounceMs).trim();
  const qualifies = debounced.length >= CONFIG.typeaheadMinChars || /^#?\d+$/.test(debounced);
  const all = useMemo(() => (qualifies ? searchPayloads(index, debounced) : []), [index, debounced, qualifies]);
  const results = all.slice(0, CONFIG.typeaheadLimit);
  const showList = open && qualifies;

  const liveText = !showList
    ? ''
    : all.length
      ? `${all.length} results available. Use up and down arrows to review.`
      : 'No results.';

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function goPayload(number: number) {
    close();
    inputRef.current?.blur();
    navigate(`/payload/${number}`);
  }

  function goSearch() {
    const q = text.trim();
    if (!q) return;
    close();
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const n = results.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!showList) setOpen(true);
        else if (n > 0) setActive((active + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n > 0) setActive(active <= 0 ? n - 1 : active - 1);
        break;
      case 'Enter': {
        e.preventDefault();
        const hit = showList && active >= 0 ? results[active] : undefined;
        if (hit) goPayload(hit.payload.number);
        else goSearch();
        break;
      }
      case 'Escape':
        if (showList) {
          e.preventDefault();
          close();
        } else {
          setText('');
        }
        break;
      default:
        break;
    }
  }

  const activeId = showList && active >= 0 ? `${listId}-o${active}` : undefined;

  return (
    <form
      className={`search search--${size}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        goSearch();
      }}
    >
      <label htmlFor={`${baseId}-input`} className="sr-only">
        {label}
      </label>
      <span className="search__icon">
        <Icon name="search" size={size === 'lg' ? 22 : 18} />
      </span>
      <input
        ref={inputRef}
        id={`${baseId}-input`}
        type="search"
        className="search__input"
        role="combobox"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeId}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          if (text.trim().length >= CONFIG.typeaheadMinChars) setOpen(true);
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        className="search__list"
        role="listbox"
        aria-label="Suggestions"
        hidden={!showList}
      >
        {showList && results.length === 0 ? (
          <li className="search__empty" role="presentation">
            No payloads match “{debounced}”
          </li>
        ) : null}
        {showList
          ? results.map((r, i) => (
              <li
                key={r.payload.number}
                id={`${listId}-o${i}`}
                role="option"
                aria-selected={i === active}
                className="search__opt"
                // Keep focus in the input while the pointer selects an option.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goPayload(r.payload.number)}
                // Options are not focusable: the input keeps focus and handles arrow keys. This handler
                // only covers a focused option, should one ever be focusable.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') goPayload(r.payload.number);
                }}
                onMouseMove={() => {
                  if (active !== i) setActive(i);
                }}
              >
                <span className="search__opt-main">
                  <span className="search__opt-name">
                    <Highlight text={r.payload.name} query={debounced} />
                  </span>
                  <span className="search__opt-num">#{pad3(r.payload.number)}</span>
                </span>
                <span className="search__opt-cat">{r.payload.categoryRef.name}</span>
              </li>
            ))
          : null}
        {showList && all.length > 0 ? (
          <li className="search__all" role="presentation">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={goSearch}
            >
              See all {all.length} result{all.length === 1 ? '' : 's'}
              <kbd>↵</kbd>
            </button>
          </li>
        ) : null}
      </ul>
      <div className="sr-only" aria-live="polite">
        {liveText}
      </div>
    </form>
  );
}
