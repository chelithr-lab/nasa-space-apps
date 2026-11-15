# Deliverable 2 — Proposed Solution: Lunar Payloads Explorer

> **Superseded (2026-11-13).** The application is now the React app in the `app/` folder (see [05-react-app.md](05-react-app.md)). This document remains the requirements record; the earlier prototype is kept in `prototype/` as a reference and is no longer the deliverable.

> Status: **Approved.** Implements [01-requirements-specification.md](01-requirements-specification.md). Requirement IDs (FR-, DR-, NFR-) refer to that document. Deliverable 3 (the HTML prototype) is described in [03-prototype.md](03-prototype.md).

---

## 1. Solution summary

LPE is a **static single-page app** written in HTML, CSS and vanilla JavaScript ES modules, with no framework and no build step.

- **One `index.html` shell.** It holds the header, a `<main>` outlet and the footer.
- **Hash router.** It swaps views into `<main>`.
- **Catalogue index (`data/catalogue.json`).** It is loaded once at start-up and drives the categories, cards and search.
- **Payload JSONs.** They are fetched on demand and cached.
- **Data generation script.** A small Node script, `tools/build-catalogue.mjs`, regenerates the index from `lunar_payloads_catalogue.md` and detects which payloads have detail files. It runs only when the data changes; the app itself is never built.

```
 ┌──────────────────────────── Browser ─────────────────────────────┐
 │  index.html (shell: header · <main id="app"> · footer)           │
 │      │                                                           │
 │  js/app.js ── boot ──► data.loadCatalogue() ──► search.index()   │
 │      │                                                           │
 │  js/router.js  (hashchange) ──► view.render(params) ──► <main>   │
 │      │                               │                           │
 │      │                     data.loadPayload(n) ─ cache (Map)     │
 └──────┼───────────────────────────────┼───────────────────────────┘
        │ fetch                         │ fetch (on demand)
  data/catalogue.json          data/payloads/NNN_*_payload.json
        ▲
        │ node tools/build-catalogue.mjs   (run only when data changes)
  lunar_payloads_catalogue.md + data/category-meta.json + data/payloads/
```

---

## 2. File and folder structure

```
lunar_payload_explorer/
├─ index.html                     App shell
├─ css/
│  ├─ tokens.css                  Colours, type, spacing, radius (LF-1)
│  ├─ base.css                    Reset, typography, layout, utilities
│  └─ components.css              Header, tiles, cards, tabs, search, lightbox…
├─ js/
│  ├─ config.js                   SERENITY_URL, data paths, app name
│  ├─ app.js                      Boot: load data, mount header search, start router
│  ├─ router.js                   Hash routes → views; page titles; scroll/focus reset
│  ├─ data.js                     loadCatalogue(), loadPayload(n), in-memory cache
│  ├─ search.js                   normalise(), buildIndex(), query() with ranking
│  ├─ format.js                   humanise keys, units, ranges (DR-5)
│  ├─ dom.js                      h() element builder (textContent only), safeUrl()
│  ├─ icons.js                    16 inline SVG category icons + UI icons
│  ├─ components/
│  │  ├─ breadcrumbs.js  category-tile.js  payload-card.js
│  │  ├─ header-search.js (typeahead)  tabs.js  spec-card.js
│  │  ├─ stepper.js  gallery.js  lightbox.js
│  │  └─ states.js  (skeleton, empty, error, coming-soon)
│  └─ views/
│     ├─ home.js  categories.js  category.js
│     ├─ search-results.js  payload.js  not-found.js
├─ assets/
│  └─ hero-moon.jpg               Public-domain NASA lunar image (local copy)
├─ data/
│  ├─ catalogue.json              GENERATED index (16 categories, 320 payloads)
│  ├─ category-meta.json          Hand-edited: one-line description + icon key per category
│  └─ payloads/*.json             One file per payload (only #001 today)
├─ tools/
│  └─ build-catalogue.mjs         md + meta + payloads folder → catalogue.json
├─ docs/                          These documents
└─ README.md                      How to run and how to add a payload
```

---

## 3. Data design

### 3.1 `data/catalogue.json` (generated)
```json
{
  "generated_at": "2026-11-12T00:00:00Z",
  "source": "lunar_payloads_catalogue.md",
  "categories": [
    { "number": 1, "name": "Geophysical and lunar interior instruments",
      "slug": "geophysical-and-lunar-interior-instruments",
      "description": "Instruments that probe the Moon's interior…", "icon": "seismic",
      "payload_numbers": [1, 2, 3, "…", 25] }
  ],
  "payloads": [
    { "number": 1, "name": "Passive seismometer", "slug": "passive-seismometer",
      "category": 1,
      "detail_file": "data/payloads/001_passive_seismometer_payload.json",
      "thumb": "https://assets.science.nasa.gov/…/371255main_Seismic_full.jpg",
      "summary": "A passive seismometer is a scientific instrument designed to…" }
  ]
}
```
- **`detail_file`:** the build script sets it when a file matching `{NNN}_*_payload.json` exists, matched by **number** rather than name, so naming slips don't break links. Otherwise it is `null`.
- **`thumb` and `summary`:** copied from each detail JSON. `thumb` is the first `overview_images` URL, falling back to the first `images` URL; `summary` is the first ~150 characters of the overview. This lets category cards render without fetching every payload file (NFR-1). It is `null` for payloads without detail.
- **Size estimate:** about 45 KB today, well under the 60 KB budget.

### 3.2 Detail JSON
The schema from #001 is used as-is, with no transformation. The details view maps it as follows:

| Order | Tab label | Source key | Renderer |
|---|---|---|---|
| 1 | Overview | `overview` (+ `overview_images`) | Prose → image strip |
| 2 | Description | `description` | Prose |
| 3 | Scientific Purpose & Applications | `scientific_purpose_and_applications` | Prose |
| 4 | Operating Principle | `operating_principle` | Prose |
| 5 | Scientific Importance | `scientific_importance` | Prose |
| 6 | Physical Specifications | `physical_specifications` | Caveat note → spec cards (each with its `examples[n].images` thumbnails) → prose |
| 7 | Environment & Operations | `environmental_and_operational_requirements` | Prose |
| 8 | Limitations | `limitations` | Prose |
| 9 | Transportation & Deployment | `transportation_and_deployment` | Prose → stepper → sub-sections → image strip (`images`) |
| 10 | Historical Significance | `historical_significance` | Prose |
| 11 | Uncertainties | `limitations_and_uncertainties` | Prose (caveat style) |
| 12 | Images | `images` (master registry, 7 for #001) | Gallery + lightbox |
| 13 | References | `references` | Numbered link list |
| — | *(any other key)* | *unknown* | Generic renderer, label = humanised key, appended before Images (DR-4) |
| — | *`<section>_images`* | e.g. `overview_images` | **Not a tab.** Attached to `<section>`'s tab as an image strip (DR-8) |
| — | `section_placements`, top-level `image_handling` | metadata | Not rendered |

**Generic renderer rules:**
- A string renders as `<p>`.
- An array of strings renders as `<ul>`.
- An array of objects renders as cards.
- An object renders as a definition list, recursing into nested values.
- A key ending in `_url` or `_urls` renders as a link.
- An array whose items all have an `image_url` renders as an image strip, never as key–value blocks. This applies anywhere in the article, so future sections with an `images` array work without code changes (DR-8).
- An image URL that fails to load as an image (for example an HTML page) shows a "Preview unavailable" tile; the lightbox still offers the source-page link.

**Spec value formatting (`format.js`, DR-5):**
- `mass_kg: 11.5` → "Mass — **11.5 kg**"
- `short_period_sensor_response_range_hz: [0.05, 20]` → "Short-period sensor response range — **0.05–20 Hz**"
- `power_consumption_w.approximate_range: [4.3, 7.4]` → "Power consumption — **≈ 4.3–7.4 W**"
- `external_dimensions_cm: [40,40,40]` → "External dimensions — **40 × 40 × 40 cm**". Arrays of three or more numbers use "×".
- Fields `name`, `type`, `qualification` and `source_urls` are lifted out of the key–value table into the card's title, chip, footnote and links.

---

## 4. Routes and page inventory

| # | Page | Route | Purpose | Requirement IDs |
|---|---|---|---|---|
| P1 | Home | `#/` | Introduce the app, search, and enter the categories | FR-H1–H5 |
| P2 | All Categories | `#/categories` | 16 category tiles | FR-C1–C3 |
| P3 | Category | `#/category/{n}` | Payload cards in one category | FR-L1–L4 |
| P4 | Search Results | `#/search?q={query}` | All matches, grouped by category | FR-S4–S6 |
| P5 | Payload Details | `#/payload/{n}` and `?tab={slug}` | Tabbed article | FR-D1–D11 |
| P5b | Payload: Coming soon | `#/payload/{n}` when `detail_file=null` | Graceful placeholder | DR-6 |
| P6 | Not Found | anything else | Recovery links | FR-G5 |
| — | Typeahead (overlay) | on any page | Quick jump to a payload | FR-S1–S3 |
| — | Image lightbox (overlay) | over P5 | Larger image + metadata | FR-D7 |

**On every route change:**
1. Set `document.title`.
2. Scroll to the top, except on tab-only changes.
3. Move focus to the page `<h1>` for screen readers.
4. Update `aria-current` on the navigation.

### P1 — Home
- Hero: a background image (`assets/hero-moon.jpg`) with a gradient overlay; if the image fails, a CSS moon gradient is used.
- The hero contains:
  - "LUNAR PAYLOADS EXPLORER" eyebrow
  - H1 "The instruments that explore the Moon"
  - A two-line description
  - A large search field (it reuses the typeahead component)
  - Buttons: **Explore categories** (primary, blue) and **← Back to Serenity** (outline)
- Stats strip: 16 categories · 320 payloads · N articles (computed).
- "Browse by category": all 16 tiles.
- "How it works": 3 cards (Browse · Search · Read the details).
- Data disclaimer panel (amber caution style).

### P2 — All Categories
- Page header with the title, a short intro and the total count.
- A grid of 16 category tiles. Each tile shows the icon, "CATEGORY 01", the name, a one-line description and "25 payloads ›".
- A "Sort: Catalogue order / A–Z" segmented pill (Serenity-style). This is a small extra, cheap to build.

### P3 — Category
- Breadcrumbs, then a header: icon, "CATEGORY 01 OF 16", H1 name, description, and the count with "N with articles".
- A toolbar:
  - Filter-in-category input
  - Segmented pill "All / With articles"
  - Result count
- A grid of payload cards (see §5).
- Footer navigation: ‹ Previous category · Next category ›.

### P4 — Search Results
- Breadcrumbs (Home / Search), then H1 `Results for "query"` with the count.
- Results are grouped by category: a sticky category label, then a card grid for each group.
- Empty state: a message, tips ("try a shorter word, e.g. 'spectro'"), and links to 3 popular categories and All Categories.

### P5 — Payload Details
- Breadcrumbs: Home / Categories / {Category} / {Payload}.
- Header panel:
  - **Left:** "#001" badge, the category chip (a link), H1 name, overview lead text, and prev/next payload buttons.
  - **Right:** the feature image (first `overview_images` entry, else first `images` entry) with its credit; click to enlarge.
- Tab strip (13 tabs) above the tab panel. Below 768 px the strip becomes a `<select>`.
- **Full width:** the tabbed details module spans the full content width, the same width as the header panel. There is no side column (the Content status and Quick facts panels were removed on 2026-11-13).
- "More in this category": 4 cards.

### P5b — Payload: Coming soon
- The same header panel, but with no image (category icon placeholder) and an amber "Coming soon" chip.
- A message panel: "A detailed article for this payload hasn't been published yet."
- Prev/next in the category, and "More in this category" (prioritising payloads that have articles).

### P6 — Not Found
- A panel: "We couldn't find that page or payload", with buttons for Home, All Categories and a search field.

---

## 5. Component inventory

| Component | Used on | Key behaviour |
|---|---|---|
| **App header** | All | Wordmark (thin "Lunar Payloads" + letter-spaced "EXPLORER"), segmented nav pill (Home · Categories), search field, "← Serenity" outline button. Collapses to icon buttons below 768 px. |
| **Typeahead search** | Header, Home hero | 150 ms debounce, 2+ characters, ≤ 8 suggestions with highlight; ↑ ↓ Enter Esc; "See all N results"; ARIA combobox pattern |
| **Breadcrumbs** | P3–P5 | `nav[aria-label=Breadcrumb]`, last item `aria-current=page` |
| **Category tile** | P1, P2 | Whole tile is a link; icon, number, name, description, count; blue border and lift on hover/focus |
| **Payload card** | P3, P4, P5 | Image (lazy-loaded, falls back to the icon placeholder), number badge, title, category label (in search/related only), summary, status chip, "View details" button |
| **Segmented pill** | P2, P3 | Serenity-style toggle; `role=radiogroup` |
| **Tabs** | P5 | WAI-ARIA tabs: roving tabindex, ←/→/Home/End, horizontal scroll with fade edges, keeps the active tab in view, `?tab=` sync; mobile `<select>` fallback |
| **Spec card** | P5 Specs tab | Title, type chip, thumbnail row (example's `images`), key–value table (DR-5), qualification footnote, source links |
| **Image strip** | P5 Overview, Transport (any section with images) | "IMAGES (n)" label + thumbnails with caption and credit; lightbox scoped to the strip's images (FR-D12) |
| **Stepper** | P5 Transport tab | Numbered vertical steps with a connector line |
| **Gallery + Lightbox** | P5 Images tab | Grid of figure cards; lightbox is a `<dialog>` with focus trap, Esc to close, ←/→ to move between images, "View on source page" |
| **States** | All | Skeleton loaders, empty, error with Retry, coming soon |
| **Footer** | All | Disclaimer, image credits, "Catalogue: 320 payloads · generated {date}" |

---

## 6. Visual design system

The look and feel copies Serenity's structure, with a blue accent in place of its cyan.

```css
/* css/tokens.css */
:root {
  --bg:            #05080c;   /* page background (space) */
  --bg-raised:     #0b1118;   /* header / footer band */
  --panel:         rgba(28, 40, 52, .92);  /* #1c2834 cards, tiles, panels */
  --panel-2:       #24323f;   /* inputs, inactive segments */
  --panel-active:  #34495c;   /* active segment (Serenity style) */
  --border:        rgba(255, 255, 255, .10);
  --border-strong: rgba(255, 255, 255, .22);
  --text:          #e8eef4;
  --text-muted:    #9aabba;
  --accent:        #4d8dff;   /* LPE blue */
  --accent-hover:  #6fa3ff;
  --accent-press:  #3a72d9;
  --accent-soft:   rgba(77, 141, 255, .16);
  --ok:            #3ddc97;   /* Serenity green */
  --warn:          #f0a53a;   /* Serenity amber */
  --radius-sm: 6px; --radius: 12px; --radius-pill: 999px;
  --font-ui:   "Barlow Condensed", "Arial Narrow", sans-serif;
  --font-body: "Barlow", system-ui, sans-serif;
  --label-tracking: .14em;   /* uppercase panel labels */
}
```

**Type scale**
- H1: 40/44 px, UI font, weight 600
- H2: 26 px
- Panel label: 12 px, uppercase, tracked
- Body: 16/1.65 px, body font; article prose fills its panel width (no line-length cap)

**Buttons**
- **Primary:** blue fill.
- **Secondary:** slate fill with a light border (like Serenity's "Phase" / "-1 d" buttons).
- **Chips:** pills with a 1 px border.

**Background**
- A fixed near-black backdrop.
- An optional, very subtle CSS starfield made from radial-gradient dots. It is static, so `prefers-reduced-motion` doesn't need special handling.

---

## 7. Search design (`js/search.js`)

1. **Normalise** a string: convert to lowercase, apply NFD and strip diacritics (ö→o), turn punctuation into spaces, and collapse whitespace.
2. **Index** each payload as a record: `{ number, nameN, words[], abbrevN (from "(APXS)"), categoryN }`. This is built once at boot, for 320 records.
3. **Score** each record for the query `q`:

   | Match | Score |
   |---|---|
   | Number match (`57` or `#57`) | 1000 |
   | `nameN == q` | 900 |
   | Abbreviation equals q | 850 |
   | Name starts with q | 700 |
   | A word starts with q | 500 |
   | Name contains q | 300 |
   | Category name contains q | 100 |

   For multi-word queries, every term must match somewhere in the name or category, and the score is the sum. Ties are broken by catalogue number.
4. **Highlight** the matched text by splitting the original string on the match span and wrapping it in `<mark>` built with DOM nodes. No `innerHTML` is used.
5. Typeahead shows the top 8. The results page shows everything with a score above 0, grouped by category in catalogue order.

---

## 8. Wireframes

### 8.1 Home — desktop (≥ 1200 px)
```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Lunar Payloads™        ( Home | Categories )      [🔍 Search payloads…    ]  [← Serenity] │
│ E X P L O R E R                                                                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░  LUNAR PAYLOADS EXPLORER                                          ░░(  MOON  )░░░│
│░  The instruments that explore the Moon                            ░░(  IMAGE )░░░│
│░  Discover the 320 scientific payloads carried — or proposed — for ░░░░░░░░░░░░░░░│
│░  lunar missions, and what each was designed to measure.           ░░░░░░░░░░░░░░░│
│░  [🔍 Try "seismometer", "APXS", "radar"…                       ]  ░░░░░░░░░░░░░░░│
│░  [ Explore categories ▸ ]   [ ← Back to Serenity ]                ░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
├──────────────────────────────────────────────────────────────────────────────────┤
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                          │
│   │ 16           │   │ 320          │   │ 1            │                          │
│   │ CATEGORIES   │   │ PAYLOADS     │   │ ARTICLES     │                          │
│   └──────────────┘   └──────────────┘   └──────────────┘                          │
│                                                                                    │
│ BROWSE BY CATEGORY                                            [ View all ▸ ]       │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐        │
│ │ ◎ icon         │ │ ◎ icon         │ │ ◎ icon         │ │ ◎ icon         │        │
│ │ CATEGORY 01    │ │ CATEGORY 02    │ │ CATEGORY 03    │ │ CATEGORY 04    │        │
│ │ Geophysical &  │ │ Imaging, photo │ │ Mineralogical  │ │ Subsurface     │        │
│ │ lunar interior │ │ & mapping      │ │ & chemical     │ │ exploration    │        │
│ │ one-line desc… │ │ one-line desc… │ │ one-line desc… │ │ one-line desc… │        │
│ │ 25 payloads ›  │ │ 28 payloads ›  │ │ 27 payloads ›  │ │ 18 payloads ›  │        │
│ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘        │
│   … 3 more rows (16 tiles total) …                                                 │
│                                                                                    │
│ HOW IT WORKS                                                                       │
│ ┌ 1 Browse ─────────┐ ┌ 2 Search ─────────┐ ┌ 3 Read ────────────┐                 │
│ │ Pick a category…  │ │ Find by name/abbr │ │ Tabbed article…    │                 │
│ └───────────────────┘ └───────────────────┘ └────────────────────┘                 │
│ ┌ ⚠ ABOUT THIS DATA ──────────────────────────────────────────────────────┐        │
│ │ Working catalogue; entries not yet deduplicated or technically validated│        │
│ └─────────────────────────────────────────────────────────────────────────┘        │
├──────────────────────────────────────────────────────────────────────────────────┤
│ Disclaimer · Images © respective publishers (e.g. NASA) · Catalogue: 320 payloads │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Home — mobile (375 px)
```
┌───────────────────────────┐
│ Lunar Payloads   [🔍][☰] │
│ EXPLORER        [← Seren.]│
├───────────────────────────┤
│░░░░░░░ MOON IMAGE ░░░░░░░░│
│░ The instruments that   ░░│
│░ explore the Moon       ░░│
│░ Short description…     ░░│
│░ [🔍 Search payloads…  ] ░│
│░ [ Explore categories ▸ ]░│
├───────────────────────────┤
│ [16 CATEGORIES][320 PAYL.]│
│ [1 ARTICLES             ] │
│ BROWSE BY CATEGORY        │
│ ┌───────────────────────┐ │
│ │ ◎ CATEGORY 01         │ │
│ │ Geophysical & lunar…  │ │
│ │ 25 payloads ›         │ │
│ └───────────────────────┘ │
│ … (1 column, 16 tiles)    │
└───────────────────────────┘
```

### 8.3 All Categories (desktop)
```
┌ header ──────────────────────────────────────────────────────────────────────────┐
│ Home / Categories                                                                 │
│ CATALOGUE                                                                         │
│ Payload categories                                   Sort ( Catalogue | A–Z )     │
│ 16 categories · 320 payloads                                                      │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │ tile 01      │ │ tile 02      │ │ tile 03      │ │ tile 04      │               │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘               │
│ ┌──────────────┐ … rows continue to tile 16 (4 / 3 / 2 / 1 columns responsive)    │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Category page (desktop)
```
┌ header ──────────────────────────────────────────────────────────────────────────┐
│ Home / Categories / Geophysical and lunar interior instruments                    │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ ◎  CATEGORY 01 OF 16                                                          │ │
│ │    Geophysical and lunar interior instruments                                 │ │
│ │    Instruments that probe the Moon's interior through seismic, thermal…       │ │
│ │    25 payloads · ● 1 with article                                             │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│ [⌕ Filter in this category…        ]   ( All | With articles )     25 shown       │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐ │
│ │ ┌──────────────┐ │ │ ┌──────────────┐ │ │ ┌──────────────┐ │ │ ┌────────────┐ │ │
│ │ │  NASA IMAGE  │ │ │ │  ◎ (icon     │ │ │ │  ◎ (icon     │ │ │ │  ◎         │ │ │
│ │ │              │ │ │ │  placeholder)│ │ │ │  placeholder)│ │ │ │            │ │ │
│ │ └──────────────┘ │ │ └──────────────┘ │ │ └──────────────┘ │ │ └────────────┘ │ │
│ │ #001             │ │ #002             │ │ #003             │ │ #004           │ │
│ │ Passive          │ │ Broadband        │ │ Short-period     │ │ Long-period    │ │
│ │ seismometer      │ │ seismometer      │ │ seismometer      │ │ seismometer    │ │
│ │ A passive seis…  │ │                  │ │                  │ │                │ │
│ │ ● Article        │ │ ◌ Coming soon    │ │ ◌ Coming soon    │ │ ◌ Coming soon  │ │
│ │ [ View details ▸]│ │ [ View details ▸]│ │ [ View details ▸]│ │ [View details▸]│ │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘ └────────────────┘ │
│   … remaining cards …                                                             │
│ ‹ Previous: —                                     Next: Imaging, photography… ›   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 8.5 Typeahead (any page)
```
                         [🔍 gas chrom|                         ]
                         ┌───────────────────────────────────────┐
                         │ ▸ **Gas chrom**atograph          #070 │
                         │   Mineralogical & chemical analysis   │
                         │   **Gas chrom**atograph          #144 │
                         │   Lunar exosphere & atmospheric       │
                         │   **Gas chrom**atograph-mass spec #071│
                         │   Mineralogical & chemical analysis   │
                         │───────────────────────────────────────│
                         │   See all 3 results ↵                 │
                         └───────────────────────────────────────┘
```

### 8.6 Search Results (desktop)
```
│ Home / Search                                                                     │
│ Results for "spectrometer"                                       27 payloads      │
│ ── MINERALOGICAL AND CHEMICAL ANALYSIS (18) ──────────────────────────────────── │
│ [card] [card] [card] [card]                                                       │
│ [card] …                                                                          │
│ ── WATER, ICE AND VOLATILE DETECTION (2) ──────────────────────────────────────── │
│ [card] [card] [card] [card]                                                       │
│                                                                                   │
│ Empty state:                                                                      │
│ ┌───────────────────────────────────────────────────────────────┐                 │
│ │ No payloads match "xyz".                                       │                 │
│ │ Try a shorter word (e.g. "spectro") or browse a category:      │                 │
│ │ [Imaging] [Radiation] [Water & ice]   [ All categories ▸ ]     │                 │
│ └───────────────────────────────────────────────────────────────┘                 │
```

### 8.7 Payload Details — desktop
```
┌ header ──────────────────────────────────────────────────────────────────────────┐
│ Home / Categories / Geophysical and lunar interior… / Passive Seismometer         │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ [#001] (Geophysical and lunar interior instruments)        ┌────────────────┐│ │
│ │ Passive Seismometer                                        │                ││ │
│ │ A passive seismometer is a scientific instrument designed  │  FEATURE IMAGE ││ │
│ │ to detect and measure ground motion without deliberately…  │                ││ │
│ │                                                            └────────────────┘│ │
│ │ [‹ Prev]  [Next: Broadband seismometer ›]                  Credit: NASA      │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│ ◂│ Overview │ Description │ Scientific Purpose… │ Operating Principle │ Sci…│▸  │
│  ━━━━━━━━━━                                       (scrollable, blue underline)    │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ OVERVIEW                                                                     │ │
│ │                                                                              │ │
│ │ A passive seismometer is a scientific instrument designed to detect and      │ │
│ │ measure ground motion…                                                       │ │
│ │ (prose, full panel width)                                                   │ │
│ │ ──────────────────────────────────────────────────────────────────────────── │ │
│ │ IMAGES (3)  [img + caption] [img + caption] [img + caption]                  │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│   (details module spans the full content width; no side column)                  │
│ MORE IN THIS CATEGORY   [card] [card] [card] [card]                               │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 8.8 Payload Details — key tab panels
```
PHYSICAL SPECIFICATIONS
┌ ⚠ There is no single universal mass or size for a passive seismometer… ┐
└──────────────────────────────────────────────────────────────────────────┘
┌ Apollo Passive Seismic Experiment (PSE) ─────┐ ┌ Farside Seismic Suite (FSS) ──────┐
│ (Historical lunar instrument)                │ │ (Modern lunar seismic payload)    │
│ [img][img][preview unavailable]              │ │ [img][img][img]                   │
│ Mass ............................ 11.5 kg    │ │ Mass .......................45 kg  │
│ Main enclosure diameter ......... 23 cm      │ │ External dimensions 40×40×40 cm   │
│ Main enclosure height ........... 29 cm      │ │ Seismic instruments ......... 2   │
│ Power consumption ........ ≈ 4.3–7.4 W       │ │ Sensor types  Very Broadband,     │
│ Short-period response ..... 0.05–20 Hz       │ │               Short Period        │
│ …                                            │ │ Power / Comms / Duration (text)   │
│ ⓘ Qualification: Smithsonian documentation…  │ │ ⓘ Qualification: …                │
│ Sources: airandspace.si.edu ↗ · science… ↗   │ │ Sources: science.nasa.gov ↗ …     │
└──────────────────────────────────────────────┘ └───────────────────────────────────┘
DIMENSIONS AND PROPORTIONS   (prose)      MASS AND WEIGHT   (prose)

TRANSPORTATION & DEPLOYMENT
(overview prose)
 ① Integrate the instrument into a spacecraft or lander payload compartment…
 │
 ② Launch it into space using a launch vehicle.
 │
 ③ … ⑥ Level and thermally protect the instrument…
DEPLOYMENT METHODS (prose) · HISTORICAL EXAMPLES (prose) · COMPATIBILITY ASSESSMENT (prose)
──────────────────────────────────────────
IMAGES (2)
┌──────────┐ ┌──────────┐
│   img    │ │   img    │      ← click: lightbox ‹ 1/2 › (this section's images only)
│ caption  │ │ caption  │
│ © credit │ │ © credit │
└──────────┘ └──────────┘

OVERVIEW
(overview prose)
──────────────────────────────────────────
IMAGES (3)   [img + caption] [img + caption] [img + caption]

IMAGES                                       Lightbox (<dialog>)
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  ┌──────────────────────────────────┐
│  img   │ │  img   │ │  img   │ │  img   │  │ [×]                     ‹  2/7  › │
├────────┤ ├────────┤ ├────────┤ ├────────┤  │        ┌──────────────┐          │
│(photo) │ │(photo) │ │(diagr.)│ │(eng.)  │  │        │    IMAGE     │          │
│caption │ │caption │ │caption │ │caption │  │        └──────────────┘          │
│© NASA  │ │© NASA  │ │© NASA  │ │© JPL   │  │ Caption · Credit · Notes         │
└────────┘ └────────┘ └────────┘ └────────┘  │ [ View on source page ↗ ]        │
                                              └──────────────────────────────────┘
REFERENCES
 1. Apollo 11 Seismic Experiment — NASA ↗
 2. Passive Seismic Experiment, Apollo — Smithsonian NASM ↗
 …
```

### 8.9 Payload Details — mobile (375 px)
```
┌───────────────────────────┐
│ Home / … / Passive Seism. │
│ [#001] (Geophysical…)     │
│ Passive Seismometer       │
│ ┌───────────────────────┐ │
│ │    FEATURE IMAGE      │ │
│ └───────────────────────┘ │
│ A passive seismometer is… │
│ SECTION                   │
│ [ Overview            ▾ ] │  ← <select> replaces tab strip
│ ┌───────────────────────┐ │
│ │ prose…                │ │
│ └───────────────────────┘ │
│ [‹ Prev]      [Next ›]    │
│ MORE IN THIS CATEGORY     │
│ [card] (1 column)         │
└───────────────────────────┘
```

### 8.10 Payload: Coming soon (P5b)
```
│ Home / Categories / Geophysical… / Broadband seismometer                          │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ [#002] (Geophysical and lunar interior instruments)  ◌ COMING SOON           │ │
│ │ Broadband seismometer                                        ┌────────────┐  │ │
│ │ A detailed article for this payload hasn't been published    │  ◎ icon    │  │ │
│ │ yet. Explore related instruments below.                      └────────────┘  │ │
│ │ [‹ Passive seismometer]   [Short-period seismometer ›]                       │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│ MORE IN THIS CATEGORY (articles first)   [card] [card] [card] [card]              │
```

---

## 9. Behaviour details and edge cases

| Situation | Behaviour |
|---|---|
| `catalogue.json` fails to load | Full-page error panel with Retry. The header and footer still render. |
| Detail JSON 404s or is invalid | P5 error state: "Couldn't load this article", with Retry and Back to category. Not cached. |
| Image hotlink fails | `onerror` swaps in the category-icon placeholder, and the alt text is preserved |
| Unsafe URL (not http/https) | Rendered as plain text, not a link (NFR-5) |
| `?tab=` names an unknown tab | Falls back to Overview and replaces the URL |
| Route `#/payload/999` or `#/category/0` | P6 Not Found |
| Duplicate names | Cards in search and related lists always show the category label (DR-2) |
| Very long names, e.g. "Alpha Particle X-ray Spectrometer (APXS)" | Title clamps to 3 lines on cards; shown in full on the details page |
| Opened via `file://` | A banner explains how to run a local server (see README) |

---

## 10. Accessibility plan (NFR-2)

- **Landmarks:** `header`, `nav`, `main`, `footer`; a skip link "Skip to content".
- **Patterns:** ARIA combobox (typeahead), ARIA tabs, `<dialog>` lightbox with focus return, and `radiogroup` segmented pills.
- **Focus:** a 2 px blue outline with offset, never removed. Focus moves to the `<h1>` after navigation.
- **Contrast:** body text #e8eef4 on #1c2834 is about 12:1; the accent #4d8dff on #1c2834 is about 4.9:1 for links and active states.
- **Motion:** the hover lift and transitions are disabled under `prefers-reduced-motion: reduce`.
- **Target size:** controls are at least 44 px tall on touch layouts.

---

## 11. Verification plan for Deliverable 3

1. Run `node tools/build-catalogue.mjs` and check that it reports 16 categories, 320 payloads and 1 detail file, and that the per-category counts sum to 320.
2. Serve the folder with `npx serve .` or `python -m http.server`, then open `http://localhost:<port>/`.
3. Walk through acceptance criteria 1–8 in the spec in a browser, covering desktop (1440 px) and mobile (375 px) using device emulation.
4. Do a keyboard-only pass on the search typeahead, tabs and lightbox.
5. Check the console for errors, and confirm that no JSON text is injected as HTML (search `innerHTML` in `js/`; it should appear only for static, trusted templates, if at all).
6. Check that `?tab=` deep links and reload restore the same view.

---

## 12. Decisions requested

| # | Decision | Recommendation |
|---|---|---|
| D1 | Keep all 13 tabs, or group them (e.g. "Science" = Description + Purpose + Importance)? | **Keep 13**, mapped 1:1 to the JSON as the brief asked; the scrollable strip and mobile dropdown handle the overflow |
| D2 | Hero image: download a public-domain NASA full-Moon photo into `assets/`? | **Yes.** NASA imagery is generally free to use with credit; the CSS fallback covers offline use |
| D3 | The Serenity back link points to `http://localhost:5173/` | Keep it **configurable** in `js/config.js`; please supply the production URL when you have it |
| D4 | Fonts from Google Fonts (Barlow and Barlow Condensed) or self-hosted? | **Google Fonts** for the prototype; self-host for production |
