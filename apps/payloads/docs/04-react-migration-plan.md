# Deliverable 4 — Plan: Convert the Prototype to a React Application

> Status: **Implemented** (phases 0 to 5, see [05-react-app.md](05-react-app.md)). Phase 6 awaits approval. Original status was: draft for approval. Builds on [01-requirements-specification.md](01-requirements-specification.md), [02-solution-design.md](02-solution-design.md) and [03-prototype.md](03-prototype.md). The prototype in `prototype/` is the behavioural reference. The React app goes in `app/`.
> Requirement IDs (FR-, DR-, NFR-, AC-) refer to document 01.

---

## 1. Context and goal

The vanilla-JS prototype is approved and tested (56 end-to-end checks). It was always meant as a stepping stone to the production stack, which is **Vite + React + React Router**, the same toolchain as Serenity. This plan converts it into that app with **no change in behaviour or appearance** first, and only then improves how the richer payload data is rendered.

**Goal:** `app/` reproduces every page, behaviour and acceptance criterion of the prototype, passes the same tests (ported), and is easy to extend. The prototype folder is left untouched as the reference.

### Decisions already made

| Topic | Decision |
|---|---|
| Stack | Vite + React + React Router (v7, library mode: `createBrowserRouter`). No framework, no SSR |
| Language | **TypeScript** |
| URLs | **Clean URLs** (`/payload/13`, `/search?q=radar`, `?tab=`), not hash URLs |
| Data location | **Moved to `app/`**. The app is the single source of truth and the prototype's copy is frozen |
| Scope | **Parity first**, then a separate data-rendering phase (Phase 6) that needs its own go-ahead |
| Styling | Reuse the prototype's three CSS files unchanged as global CSS (visual parity). No Tailwind or CSS-in-JS in this phase |

---

## 2. Starting point: what the prototype contains

| Item | Facts |
|---|---|
| Code | About 2,400 lines: 23 JS modules, 3 CSS files (611 lines), 1 HTML shell, 2 Node tools |
| Data | `catalogue.json` (128 KB, generated), 320 payload JSON files (**about 9.9 MB** in total, largest 88 KB), `category-meta.json`, one backup (`…_001_old.json`). 319 read-only Markdown renderings of the JSON sit beside them; the app does not use them (§4.1) |
| Routes | `#/`, `#/categories`, `#/category/{n}`, `#/payload/{n}?tab=`, `#/search?q=`, not-found |
| Tests | `tools/verify-e2e.mjs`: 56 checks over Chrome DevTools Protocol |
| Port | Prototype runs on 8765. **Serenity runs on 5173**, Vite's default, so the new app must not use it |

### Data findings that shape the design

A survey of all 320 payload files found that the data is much richer than the 13 standard sections the prototype was built around:

| Finding | Count | Effect on the React app |
|---|---|---|
| All 13 standard sections, `images`, `overview_images`, `references` present | 320 | Core renderers, ported as-is |
| Section image lists other than overview (`historical_significance_images`, `operating_principle_images`, `scientific_importance_images`, `description_images`) | 21 / 11 / 2 / 1 | The generic `<section>_images` rule (DR-8) already covers them; keep it generic, never hard-code names |
| Non-standard article keys (`scope`, `scope_note`, `scope_and_cross_references`, `evidence_gaps`, `payload_environment`, `reference_notes`, `research_status_note`, `status_summary`, `article_version`, `version`, `date`, `supersedes`, and article-level `dimensions_and_proportions`, `mass_and_weight`, `power_requirements`) | about 30 payloads | The prototype shows each as an extra tab. Parity phase keeps that; Phase 6 improves it |
| `physical_specifications` extras: `comparison_table*` in 5 different shapes, `comparison_table_markdown` (Markdown pipe tables), `other_concepts`, `status_and_technology_summary` | about 25 payloads | Currently rendered as nested key/value text. Phase 6 adds a real table renderer |
| `null` values (for example `comparison_table_markdown: null` on #44) | at least 1 | The renderer must skip nulls (it already does) |

**Consequence:** the article renderer must stay **data-driven and defensive**. It takes an `article: Record<string, unknown>`, not a fixed interface, with typed accessors for the parts the UI depends on.

---

## 3. Target architecture

### 3.1 Technology

| Concern | Choice |
|---|---|
| Build / dev server | Vite with `@vitejs/plugin-react`; **dev and preview port 5174, `strictPort: true`** (5173 belongs to Serenity) |
| UI | React (current stable at scaffold time), function components and hooks only |
| Routing | `react-router` v7 data router: `createBrowserRouter` + `RouterProvider`, route `loader`s and `errorElement`s |
| State | No global store. Catalogue comes from the root route loader; payload detail from a route loader; UI state (filters, active tab, lightbox) is local or in the URL |
| Types | TypeScript `strict: true` |
| Lint / format | ESLint (`typescript-eslint`, `react-hooks`, `jsx-a11y`), with **`react/no-danger` as an error** to protect NFR-5. Prettier optional |
| Unit tests | Vitest (+ React Testing Library for a few components) |
| End-to-end tests | Playwright Test (+ `@axe-core/playwright`) |
| Package manager | npm (Node 24 / npm 11 are already installed) |

Exact package versions are chosen at scaffold time with `npm view <pkg> version`, and import paths are checked against the installed React Router version's docs.

### 3.2 Folder structure

```
app/
├─ index.html                      Fonts, <div id="root">, title/meta
├─ package.json  tsconfig*.json  vite.config.ts  eslint.config.js  playwright.config.ts
├─ content/                        Authoring sources, NOT served
│  ├─ lunar_payloads_catalogue.md      Source of truth for categories/numbers/names
│  └─ category-meta.json               Descriptions + icon keys
├─ public/
│  └─ data/
│     ├─ catalogue.json                GENERATED by tools/build-catalogue.mjs
│     └─ payloads/NNN_*_payload.json   320 article files (served as-is)
├─ tools/
│  └─ build-catalogue.mjs              Ported; paths updated; adds --check mode
├─ src/
│  ├─ main.tsx                     Mount, legacy #/ redirect, CSS imports
│  ├─ router.tsx                   Route table, loaders, shouldRevalidate
│  ├─ config.ts                    serenityUrl (VITE_SERENITY_URL), base-aware data URLs
│  ├─ assets/hero-moon.jpg
│  ├─ styles/                      tokens.css  base.css  components.css  (copied verbatim)
│  ├─ types/                       catalogue.ts  payload.ts
│  ├─ lib/                         search.ts  format.ts  url.ts  article.ts  pad.ts
│  ├─ data/                        catalogue.ts (loadCatalogue, buildCatalogue)  payload.ts (loadPayload + cache)
│  ├─ hooks/                       useCatalogue  useDebouncedValue  useDocumentTitle  useRouteFocus
│  ├─ layouts/                     RootLayout.tsx (Header, <Outlet/>, Footer, skip link, focus/scroll)
│  ├─ components/
│  │  ├─ Header.tsx  Footer.tsx  SearchBox.tsx  Icon.tsx  ExternalLink.tsx  Highlight.tsx
│  │  ├─ Breadcrumbs.tsx  Chip.tsx  StatusChip.tsx  Segmented.tsx  PageHead.tsx  ButtonLink.tsx
│  │  ├─ states/        EmptyState  ErrorState  Skeleton
│  │  ├─ cards/         CategoryTile  PayloadCard  PlaceholderArt  CardGrid
│  │  ├─ Tabs.tsx  Lightbox.tsx
│  │  └─ article/       Prose  Value  PhysicalSpecs  SpecCard  Transport  Stepper
│  │                    ImageGrid  SectionImages  Gallery  References
│  └─ routes/           HomePage  CategoriesPage  CategoryPage  SearchResultsPage
│                       PayloadPage  NotFoundPage  RootError
├─ src/**/*.test.ts(x)             Vitest unit/component tests beside the code
└─ e2e/                            Playwright specs (port of verify-e2e.mjs)
```

### 3.3 Routes (FR-G4)

| Route | Component | Data | Notes |
|---|---|---|---|
| `/` (root layout, `id: 'root'`) | `RootLayout` | **root loader** → `Catalogue` | Builds lookup maps and the search index once |
| `/` index | `HomePage` | from root | |
| `/categories` | `CategoriesPage` | from root | |
| `/category/:categoryNumber` | `CategoryPage` | from root | Unknown number renders `NotFoundPage` |
| `/payload/:payloadNumber` | `PayloadPage` | **payload loader** → `PayloadDetail \| null` | `null` means no article → coming soon. Unknown number renders `NotFoundPage` |
| `/search` | `SearchResultsPage` | from root; query in `?q=` | |
| `*` | `NotFoundPage` | | |

**Behaviours that must carry over exactly:**
- Tab changes use `setSearchParams({ tab }, { replace: true })`. In the prototype they replaced the history entry, so Back leaves the payload page instead of stepping through tabs. `?tab=` for an unknown tab falls back to Overview and rewrites the URL.
- The payload loader depends only on the payload number. Setting `shouldRevalidate` to return `false` when only the search string changes stops tab clicks from re-running it.
- On a route change, scroll to the top and move focus to the page `<h1>`, **except** when only `?tab=` changes. This lives in `RootLayout` (`useRouteFocus`).
- `document.title` is `"{Page} · Lunar Payloads Explorer"` (`useDocumentTitle`).
- **Old links keep working:** `main.tsx` rewrites an incoming `/#/payload/13?tab=images` to `/payload/13?tab=images` before the router starts.
- `vite.config.ts` sets `base` from an env var, and every data/asset URL is built from `import.meta.env.BASE_URL`, so the app can be hosted under a sub-path (for example, linked from Serenity).

### 3.4 Data model (TypeScript sketch)

```ts
// types/catalogue.ts  (matches data/catalogue.json)
interface CategoryRaw { number: number; name: string; slug: string; description: string; icon: IconName; payload_numbers: number[] }
interface PayloadIndexRaw { number: number; name: string; slug: string; category: number;
                            detail_file: string | null; thumb: string | null; summary: string | null }
// derived in buildCatalogue():  Category { …, payloads: Payload[], withDetail: number }
//                               Payload  { …, hasDetail: boolean, category: Category }
interface Catalogue { generatedAt: string; counts: {…}; categories: Category[]; payloads: Payload[];
                      category(n): Category | undefined; payload(n): Payload | undefined; search: SearchIndex }

// types/payload.ts  (article stays open-ended on purpose)
interface ImageItem { id?: string; description?: string; image_type?: string; image_url: string;
                      source_page_url?: string; publisher?: string; credit?: string; caption?: string;
                      notes?: string; section_placements?: string[] }
interface Reference { title?: string; publisher?: string; url: string }
interface PayloadDetail { catalogue_id: number; category: { number: number; name: string };
  payload: { number: number; name: string; article: Article; research_status?: Record<string, unknown> } }
type Article = { [key: string]: unknown } & { overview?: string; images?: ImageItem[]; references?: Reference[]; … }
// plus type guards: isImageList(v): v is ImageItem[], isRecord(v), isStringArray(v)
```

Immutable data is never mutated. Lookup maps are built once in `buildCatalogue`.

### 3.5 Prototype → React mapping

| Prototype | React app | Notes |
|---|---|---|
| `js/config.js` | `src/config.ts` | `serenityUrl` from `VITE_SERENITY_URL`, default `http://localhost:5173/` |
| `js/dom.js` (`h`, `clear`, `append`) | **dropped** | JSX escapes text; `dangerouslySetInnerHTML` is banned by lint |
| `js/dom.js` (`safeUrl`, `hostOf`, `pad2/3`, `extLink`, `debounce`, `nextId`) | `lib/url.ts`, `lib/pad.ts`, `<ExternalLink>`, `useDebouncedValue`, `useId` | `safeUrl` (http/https only) is kept and used for every link and image `src` |
| `js/data.js` | `data/catalogue.ts`, `data/payload.ts`, `hooks/useCatalogue.ts` | Cache in a module-level `Map` (keeps the prototype's "failed fetches are not cached") |
| `js/search.js` | `lib/search.ts` + `components/Highlight.tsx` | Same scoring and ranking. `highlight()` returns React nodes with `<mark>` instead of a DOM fragment |
| `js/format.js` | `lib/format.ts` | Pure functions, unchanged logic |
| `js/icons.js` | `components/Icon.tsx` | SVG paths written as JSX in a typed `Record<IconName, ReactNode>` (no string-to-DOM parsing) |
| `js/router.js`, `js/app.js` | `router.tsx`, `main.tsx`, `layouts/RootLayout.tsx` | Replaces `startRouter`, `markNav` (use `NavLink`), and the `file://` banner (not applicable; see §8) |
| `components/common.js` | `Breadcrumbs`, `Chip`, `StatusChip`, `Segmented`, `PageHead`, `ButtonLink`, `states/*` | `Segmented` keeps native radios |
| `components/cards.js` | `cards/CategoryTile`, `PayloadCard`, `PlaceholderArt`, `CardGrid` | Image `onError` becomes component state that swaps to `PlaceholderArt` |
| `components/search-box.js` | `components/SearchBox.tsx` | Same ARIA combobox: ↑ ↓ Enter Esc, `aria-activedescendant`, 150 ms debounce, "See all N results". Keeps the `mousedown` `preventDefault` trick for the blur/click race |
| `components/tabs.js` | `components/Tabs.tsx` | Own implementation, ported (WAI-ARIA tabs, roving tabindex, ← → Home End, scroll arrows, mobile `<select>`). Panels render on first visit and stay mounted |
| `components/lightbox.js` | `components/Lightbox.tsx` | Native `<dialog>` driven by a ref and `showModal()`. Focus stays on the control after ←/→ (the controls stay mounted, so the prototype's workaround is not needed) |
| `components/article.js` | `components/article/*` + `lib/article.ts` | `buildSections`, `attachedImageKeys`, `isImageList` become pure functions in `lib/article.ts`, unit-tested |
| `views/*.js` | `routes/*Page.tsx` | One component per route |
| `css/*.css` | `src/styles/*.css` | **Copied verbatim**; class names unchanged |
| `index.html` | `app/index.html` | Google Fonts links kept; header/footer markup moves into components |
| `assets/hero-moon.jpg` | `src/assets/hero-moon.jpg` | Imported, so Vite fingerprints it |
| `tools/build-catalogue.mjs` | `tools/build-catalogue.mjs` | Same logic; new input/output paths; new `--check` flag |
| `tools/verify-e2e.mjs` | `e2e/*.spec.ts` | Ported check-for-check to Playwright |
| `start.bat` | npm scripts | See §4.3 |

---

## 4. Data and tooling migration

### 4.1 Moves (copy, then verify; the prototype copy stays as a frozen reference)

| From (`prototype/`) | To (`app/`) | Why |
|---|---|---|
| `data/payloads/NNN_*_payload.json` (320) | `public/data/payloads/` | Served statically, fetched on demand |
| `data/payloads/…_001_old.json` | not copied | Backup; the build tool already ignores it |
| `lunar_payloads_catalogue.md`, `data/category-meta.json` | `content/` | Inputs to the catalogue build |
| `data/payloads/*.md` (319) | **not copied** | The app reads only the JSON (see the note below) |
| `data/catalogue.json` | regenerated into `public/data/` | Generated file, never hand-edited |
| `assets/hero-moon.jpg` | `src/assets/` | |
| `css/*.css` | `src/styles/` | |

`prototype/sample-ui/` (Serenity screenshots) is not needed by the app and stays where it is.

**Why the Markdown files are left out**
- The app fetches only `public/data/payloads/*.json`. Nothing in the app, the build script or the tests reads a `.md` payload file. I checked the prototype code, and the only `.md` file it reads is the catalogue.
- The `.md` files are a rendering of the same article content (payload 13's Markdown has all eight examples and the same sections as its JSON). Keeping both in the app would mean two copies that can drift apart when a JSON file changes. The JSON is the one that gets published.
- Leaving them out makes `app/` smaller: about 6.5 MB of Markdown (the JSON is about 9.9 MB). The browser never downloads either set in full; it loads only the JSON for the payload being viewed.
- Regenerating the Markdown from JSON is possible later, if you want it inside the app; that would be a separate step.

### 4.2 `build-catalogue.mjs` changes
- Update the three input paths and the output path.
- Match files with `^(\d{3})_.+_payload\.json$` (number first), so a file is matched by its number, not its name.
- Add `--check`: regenerate in memory and exit non-zero if `public/data/catalogue.json` differs. This prevents a repeat of the earlier "316 vs 320" stale-index problem and can run in CI.
- Unchanged: matching by payload **number**, duplicate-name warnings, thumbnail preference (`overview_images` first), and the 150-character summary.

### 4.3 npm scripts

| Script | Does |
|---|---|
| `dev` | Vite dev server on 5174 (runs `catalogue` first via `predev`) |
| `build` | `tsc -b` then `vite build` (runs `catalogue` first via `prebuild`) |
| `preview` | Serve `dist/` on 5174 with SPA fallback |
| `catalogue` / `catalogue:check` | Regenerate / verify the index |
| `typecheck`, `lint` | `tsc --noEmit`, ESLint |
| `test` / `test:e2e` | Vitest / Playwright (starts `preview` itself) |

---

## 5. Implementation phases

Each phase ends with a short demo and its exit criteria. Nothing in Phase 6 starts without approval.

| Phase | Work | Exit criteria |
|---|---|---|
| **0. Scaffold** | Create the Vite React-TS app in `app/`. Add dependencies, tsconfig (strict), ESLint, Vitest, Playwright, scripts, port 5174. Move data and tools (§4). Copy CSS and fonts. Add `.gitignore` and `README.md` | `npm run catalogue` reports 16 / 320 / 320 with the same duplicate-name warning; `npm run dev` serves an empty shell; `typecheck` and `lint` pass |
| **1. Foundation** | Types; `lib/*` (search, format, url, article, pad) with unit tests; data layer and caching; `Icon`; hooks; router, `RootLayout`, `Header`, `Footer`, skip link, legacy-hash redirect; `NotFoundPage`, `RootError` | Header/footer render on every route; unit tests for search and format pass (the AC3 cases: "seismo" → #1–#4, "apxs" → #54, "mossbauer" → #64, "gas chromatograph" → #70, #144, #71) |
| **2. Browse flow** | Shared components; `CategoryTile`, `PayloadCard`; `HomePage`, `CategoriesPage` (sort), `CategoryPage` (filter, "With articles", prev/next); `SearchBox` typeahead; `SearchResultsPage` (grouping, highlight, empty state) | AC1, AC2, AC3 pass in the browser; category card counts sum to 320; typeahead is fully keyboard-operable |
| **3. Payload page** | `Tabs`; article renderers (`Prose`, `Value`, `PhysicalSpecs`/`SpecCard`, `Transport`/`Stepper`, `ImageGrid`/`SectionImages`/`Gallery`, `References`); `Lightbox`; `PayloadPage` (loader, skeleton, error + retry, coming soon, tab URL sync, feature image, prev/next, related) | AC4, AC5, AC6 pass on #1, #13 and two payloads with extra keys; every payload page opens without a console error (see §6.4) |
| **4. Parity verification** | Port the 56 e2e checks to Playwright; add axe scans; side-by-side screenshot comparison against the prototype; fix differences | §7 checklist all green |
| **5. Hardening and docs** | Production build and preview; bundle and `dist` size review; README (run, add a payload, env vars, hosting rewrite rule); update docs 01–03 with a "superseded by the React app" note; write `docs/05-react-app.md` (run guide, structure, results) | `npm run build` clean; docs merged; handover walkthrough |
| **6. Data rendering (separate approval)** | See §9 | Agreed per item |

**Order of work inside Phase 3** (to get a working vertical slice early): Tabs and Prose with the Overview tab → Description-style prose tabs → Physical Specifications → Images and Lightbox → Transport → References → generic renderer for unknown keys → coming soon and error states.

---

## 6. Technical risks and how the plan handles them

| # | Risk | Mitigation |
|---|---|---|
| 6.1 | Port conflict with Serenity (both Vite, default 5173) | App fixed to 5174 with `strictPort`; documented in the README |
| 6.2 | React Router re-runs a loader when only the query string changes, so every tab click would refetch the payload | `shouldRevalidate` on the payload route ignores search-only changes; also covered by an e2e check that counts network requests |
| 6.3 | Tab clicks adding history entries and breaking Back | `replace: true` on every tab change; e2e check (Back from `?tab=images` returns to the previous page) |
| 6.4 | The data varies by payload, so a renderer that works for #1 may crash on #212 | A "smoke test every payload" Playwright test visits all 320 `/payload/N` pages (fast, no screenshots) and fails on any console error or page error; unit tests for `buildSections` use fixtures taken from the odd shapes in §2 |
| 6.5 | Typeahead blur-vs-click race and double effects in React StrictMode | Keep the `mousedown` `preventDefault` pattern; effects are idempotent; Playwright keyboard and mouse tests |
| 6.6 | `<dialog>` and focus handling in React | Open via `ref.current.showModal()` in an effect guarded against double invocation; test Esc, ←/→, focus return to the trigger |
| 6.7 | Hotlinked images (NASA, Smithsonian) fail or are not images | Unchanged behaviour: placeholder on error, "Preview unavailable" tile; e2e checks do not depend on live image hosts being up for pass/fail except where the prototype's did |
| 6.8 | XSS from data rendered as markup | JSX text only; `react/no-danger` lint rule; `safeUrl` on every `href`/`src`; unit test that `javascript:` URLs are rejected |
| 6.9 | Deep links on a static host return 404 | Vite dev/preview already fall back to `index.html`; hosting note in the README gives the rewrite rule (send every non-file path to `/index.html`) |
| 6.10 | No Git repository exists yet, so changes cannot be reviewed incrementally | Open item 1 below |

---

## 7. Parity verification (Phase 4)

The app is "done" for the parity phase when all of the following pass.

1. **Acceptance criteria AC1–AC8** from document 01.
2. **All 56 prototype e2e checks**, ported to `e2e/*.spec.ts` and grouped as: `home`, `categories`, `search`, `payload`, `keyboard`, `responsive`. Expected counts are read from `catalogue.json` (as in the current suite), and the coming-soon check is skipped while every payload has an article.
3. **New checks the migration adds:**
   - no extra network request when switching tabs (6.2);
   - Back after a tab change leaves the payload page (6.3);
   - old `/#/payload/13?tab=images` URL redirects to `/payload/13?tab=images`;
   - all 320 payload pages render with no console errors (6.4);
   - the app works under a non-root `base`.
4. **Accessibility:** `@axe-core/playwright` on Home, Categories, a Category, Search results, a payload page (each tab for #1 and #13) and Not found, with no serious or critical violations. Manual keyboard pass on typeahead, tabs and lightbox.
5. **Visual parity:** run prototype (8765) and app (5174) side by side; capture the same routes at 1440 px and 375 px (Home, Categories, Category 1, Search "spectrometer", payload #1 Overview and Specs, payload #13, Not found) and compare. Differences are either fixed or listed as accepted in `docs/05-react-app.md`. Optional: a small `pixelmatch` script with a small tolerance to flag regressions.
6. **Quality gates:** `typecheck`, `lint` and `test` clean; `npm run build` succeeds; `catalogue:check` passes.

---

## 8. Things that deliberately change

| Prototype | React app | Why |
|---|---|---|
| Hash URLs (`/#/payload/13`) | Clean URLs; old links redirected | Decision above |
| Opening `index.html` from disk shows a "use a server" banner | Not applicable: `npm run dev` or `npm run preview`; a built `dist/` also needs a server because of the clean-URL fallback | A React build cannot run from `file://` either |
| Dev server `python -m http.server 8765` | `npm run dev` on 5174 | Standard Vite workflow |
| `serenityUrl` edited in `js/config.js` | `VITE_SERENITY_URL` env var | Configurable per environment without a code change |

Everything else (markup structure, class names, copy, keyboard behaviour, focus management, URLs' query parameters) stays the same.

---

## 9. Phase 6 — data-rendering improvements (proposal, needs a go-ahead)

The prototype renders every non-standard key as a generic tab and every table as nested text. After parity is confirmed, I propose handling the known shapes properly. Each item is independent, so you can accept or drop it.

| # | Item | Proposal |
|---|---|---|
| 6a | **Tables** | A `DataTable` component for the five `comparison_table*` shapes: array of uniform objects; `{columns, rows}` with array rows; `{rows:[{…}]}`; `{note/description/metric, rows}` (the note is shown above the table); skip `null`. Horizontally scrollable on small screens, with a proper `<caption>` and `<th scope>` |
| 6b | **Markdown pipe tables** (`comparison_table_markdown`, 10 payloads) | A small, safe parser for pipe tables only (no raw HTML, no full Markdown library), rendered with `DataTable` |
| 6c | **Metadata keys** (`article_version`, `version`, `date`, `supersedes`, `research_status_note`, `status_summary`) | Stop showing them as tabs. Either hide them or show a small collapsed "Article info" note at the end of the Overview tab. The Content status panel was removed on purpose, so the default is **hide** unless you say otherwise |
| 6d | **Scope keys** (`scope`, `scope_note`, `scope_and_cross_references`, `payload_environment`) | Show as a short "Scope" callout at the top of the Overview tab instead of separate tabs |
| 6e | **`evidence_gaps`, `reference_notes`** | Append to the Uncertainties and References tabs respectively |
| 6f | **Misplaced keys** (article-level `dimensions_and_proportions`, `mass_and_weight`, `power_requirements` in 5 payloads) | Move into `physical_specifications` in the JSON (a data fix; the app then needs no change), or render them under the Physical Specifications tab |
| 6g | **Tab-order rule for any remaining unknown keys** | Keep "before Images"; add a lint-style data check in `build-catalogue.mjs` that warns about unknown article keys so authors notice them |

These changes alter what visitors see, so documents 01–02 are updated at that point (new requirement IDs).

---

## 10. Open items and assumptions

| # | Item | Default if you don't object |
|---|---|---|
| 1 | **No Git repository exists** for either folder | Run `git init` in `app/` when Phase 0 starts, with a `.gitignore` for `node_modules`, `dist`, and test output; commit after each phase. I will not push anywhere |
| 2 | The 319 Markdown files are not part of the app | Left in `prototype/data/payloads/` as reading copies. Say so if you want them in a separate notes folder instead |
| 3 | `prototype/` remains untouched and runnable (its own `start.bat`) | Yes. It can be deleted once the React app is accepted |
| 4 | `public/data/catalogue.json` is generated, so it is gitignored and rebuilt by `predev`/`prebuild` | Yes; a committed copy would only create merge noise |
| 5 | Production hosting target and base path are unknown | Root path (`/`). Set `VITE_BASE` if it will be served under a sub-path |
| 6 | Production `serenityUrl` | `http://localhost:5173/` until you provide it |
| 7 | Fonts | Google Fonts, as in the prototype; self-host before production |
| 8 | Node/npm | Node 24, npm 11 (already installed) |

---

## 11. Sizing (relative)

| Phase | Size | Notes |
|---|---|---|
| 0 Scaffold | S | Mostly tooling and file moves |
| 1 Foundation | M | Logic is already written; mainly typing and tests |
| 2 Browse flow | M | |
| 3 Payload page | **L** | Largest piece: tabs, renderers, lightbox, and data variety |
| 4 Parity verification | M | Mostly porting the tests and fixing differences found |
| 5 Hardening and docs | S | |
| 6 Data rendering | M | Optional; depends on how many items are accepted |
