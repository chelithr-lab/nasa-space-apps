# Deliverable 5 — React Application: Run Guide, Structure and Results

> Status: **Delivered.** The React app in `app/` implements the migration plan in [04-react-migration-plan.md](04-react-migration-plan.md). It replaces the vanilla-JS prototype in `prototype/` for the requirements in [01-requirements-specification.md](01-requirements-specification.md) and the design in [02-solution-design.md](02-solution-design.md). Phase 6 (data-rendering improvements) is not started and needs a separate go-ahead.

---

## 1. Running the app

The app lives in `app/`. Run all commands from that folder.

```bash
npm install
npm run dev            # http://127.0.0.1:5174/   (port 5174 avoids Serenity on 5173)
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server. Rebuilds the catalogue index first |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serves `dist/` on port 5174 |
| `npm run catalogue` / `npm run catalogue:check` | Rebuild / verify `public/data/catalogue.json` |
| `npm run typecheck`, `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright); starts `build` + `preview` itself |
| `npm run test:e2e:smoke` | Only the all-320-payloads smoke test |

**Environment variables**

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERENITY_URL` | `http://localhost:5173/` | Target of "Back to Serenity" |
| `VITE_BASE` | `/` | Sub-path the app is served under, e.g. `/lunar/` |

**Browser tests**
- `PW_CHANNEL=chrome npm run test:e2e` uses an installed Google Chrome. Without it, Playwright's bundled Chromium is used (`npx playwright install chromium` once).
- `SUBPATH_URL=http://127.0.0.1:5180/lunar/ npx playwright test e2e/subpath.spec.ts` checks a build made with `VITE_BASE=/lunar/` (serve it with `VITE_BASE=/lunar/ npx vite preview --outDir dist-base --port 5180`).
- `PROTO_URL=http://127.0.0.1:8765/ npx playwright test e2e/parity.spec.ts` writes prototype/app screenshot pairs to `test-results/parity/` for review.

---

## 2. Adding a payload

1. Save the article JSON as `public/data/payloads/NNN_<snake_case_name>_payload.json`, using the catalogue number (for example `013_fluxgate_magnetometer_payload.json`).
2. Run `npm run catalogue` (or `npm run dev`, which runs it first).
3. Reload. The payload's card, category counts and details page update automatically. No code change is needed.

Files that do not match the pattern are ignored by the build, and the build prints warnings for files that do not match a catalogue number.

---

## 3. Structure

```
app/
├─ content/                    Catalogue source (.md) and category metadata. Not served
├─ public/data/
│  ├─ catalogue.json           Generated index (not committed)
│  └─ payloads/NNN_*_payload.json   320 articles
├─ tools/build-catalogue.mjs   Builds and checks the index
├─ src/
│  ├─ main.tsx                 Entry: legacy hash redirect, router
│  ├─ router.tsx               Routes (clean URLs, basename from VITE_BASE)
│  ├─ config.ts                Serenity URL, search settings
│  ├─ types/                   Catalogue and article types
│  ├─ lib/                     Pure logic: search, article sections, formatting, URLs, guards
│  ├─ data/                    Loading and caching of the catalogue and articles
│  ├─ hooks/                   useCatalogue, useSearchIndex, useDocumentTitle, useRouteFocus, …
│  ├─ layouts/RootLayout.tsx   Skip link, header with search, page outlet, footer
│  ├─ routes/                  Pages: Home, Categories, Category, SearchResults, Payload, NotFound, RootError
│  ├─ components/              Header, SearchBox, Tabs, Lightbox, cards, states, icons…
│  │  └─ article/              Article renderers: prose, values, specs, transport, images, references
│  └─ styles/                  The prototype's CSS, unchanged
└─ e2e/                        Browser tests
```

**Routes**

| Path | Page |
|---|---|
| `/` | Home |
| `/categories` | All categories (catalogue order or A–Z) |
| `/category/:n` | Category with payload cards |
| `/search?q=` | Search results grouped by category |
| `/payload/:n?tab=` | Payload article with 13 tabs (or "coming soon") |
| anything else | Not found |

Old prototype links such as `/#/payload/13?tab=images` are rewritten to `/payload/13?tab=images` on load.

**Design decisions**
- **Data loading:** the catalogue loads once from the root route. Each article loads through a route loader, cached per payload. Failed loads are not cached, and the payload page offers Retry.
- **Tab state:** the active tab lives in `?tab=`. Tab changes replace the history entry, so Back leaves the payload page. Changing only the tab does not reload the article.
- **Safety:** payload text is rendered as text only. `react/no-danger` is an error in lint. Links and images only accept http(s) URLs.
- **Search:** one index per catalogue, built once and shared by the header, the hero and the results page.
- **Lightbox:** one shared dialog. Each image strip opens it with its own images, and focus stays inside the dialog while moving between images.

---

## 4. Results

| Area | Result |
|---|---|
| Typecheck, lint | Pass |
| Unit tests (Vitest) | **44 of 44 pass**: search ranking and highlighting, formatting, URL safety, catalogue model, article section builder on real payloads |
| Browser tests (Playwright, Chrome) | **39 pass, 2 skipped** (see below) |
| Accessibility (axe, WCAG 2.2 A/AA, serious and critical) | **Pass** on home, categories, category, search, not-found, and every tab of payloads #1 and #13 |
| All 320 payload pages | **Pass**: each renders its heading and tabs with no page or console errors (network-dependent image failures are excluded) |
| Sub-path build (`VITE_BASE=/lunar/`) | **Pass**: assets, catalogue, article and deep links resolve; the browser check passes. This found and fixed a bug: the router needed the base as its basename |
| Catalogue index | `catalogue:check` passes: 16 categories, 320 payloads, 320 with articles |
| Production build | Pass. JavaScript bundle 368 kB (117 kB gzipped) |
| Production dependencies audit | 0 vulnerabilities. Test-only tools have advisories (see §6) |
| Visual comparison with the prototype | Three of nine screenshot pairs reviewed (home, payload #13, payload #1 on a phone): they match in layout, type, colour and spacing. The remaining six are captured, not yet reviewed |

**Skipped checks, and why**
- *Coming-soon page:* every payload now has an article, so there is no payload to test. The test runs automatically if one is removed from the data.
- *Sub-path browser check:* it needs a separate build and server. It runs with `SUBPATH_URL` set (see §1).

**Mapping of the prototype's 56 checks.** The prototype's `verify-e2e.mjs` has been replaced by Playwright specs covering the same acceptance criteria: `browse` (AC1–AC3, typeahead keys, results), `payload` (AC4–AC6, lightbox, layout, history), `responsive` (AC7), `shell`, `accessibility`, `tabs-network`, `all-payloads`, and `subpath`. Expected counts come from `catalogue.json`, so the suite stays valid as articles are added.

---

## 5. Differences from the prototype

| Area | Prototype | React app | Reason |
|---|---|---|---|
| URLs | `#/payload/13` | `/payload/13` (old links redirected) | Clean URLs decided in the migration plan |
| Lightbox focus | Restored by a workaround after each image change | Focus stays on the control naturally | Simpler with React; also uses the browser's own focus restore |
| Tab panels | Built on first visit, then kept | Same | Parity |
| Dev server | `python -m http.server 8765` | `npm run dev` on 5174 | Standard Vite workflow |
| Serenity link | Edit `js/config.js` | `VITE_SERENITY_URL` | Configurable per environment |
| Browser support in tests | Chrome | Chromium (Chrome channel) | Playwright. Firefox and Safari not yet tested |
| Tab order and layout | 13 tabs, scrollable strip, mobile select | Same | Parity |
| Dialog `eslint-disable` | — | One documented suppression in `Lightbox.tsx` | The native `<dialog>` handles focus and Escape; the lint rule does not recognise it as interactive |

Three of the nine prototype/app screenshot pairs were reviewed by eye (home, payload #13, payload #1 on a phone); no visible differences beyond the URL format were found. The other six pairs were captured but not reviewed; `e2e/parity.spec.ts` regenerates them.

---

## 6. Known limitations and follow-ups

| # | Item | Notes |
|---|---|---|
| L1 | Browsers tested: Chromium only | Run `PW_CHANNEL` against Firefox and Safari before handover |
| L2 | Test-only dependency advisories (2 critical, 8 moderate in the full audit) | Come from Vitest and its helpers, which do not ship to the browser. Upgrade Vitest to a version that resolves them when convenient. `npm audit --omit=dev` is clean |
| L3 | Images are hotlinked from NASA and the Smithsonian | Same as the prototype: placeholders on failure. Mirror the assets for production |
| L4 | Google Fonts loaded from the internet | Self-host before production (plan decision D4) |
| L5 | `VITE_SERENITY_URL` defaults to `http://localhost:5173/` | Set the production address |
| L6 | No Git hosting configured | The app repository is local (`app/`, branch `main`). It has not been pushed anywhere |
| L7 | Phase 6 (data-rendering improvements) not started | Tables, metadata keys and scope callouts. Needs approval, item by item |
| L8 | Article metadata keys (`version`, `date`, `scope`, …) still appear as extra tabs | Known and unchanged from the prototype, until Phase 6 |

---

## 7. Git history

| Commit | Contents |
|---|---|
| `26588af` | Phase 0: scaffold, content moved, build tool |
| `b2120b9` | Phase 1: foundation, shell and routing |
| `317c882` | Phase 2: browse flow |
| `0f12142` | Phase 3: payload page and article renderers |
| Phase 4 and 5 | Accessibility and sub-path checks, sub-path router fix, this documentation (see `git log` in `app/`) |
