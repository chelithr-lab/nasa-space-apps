# Deliverable 1 — Requirement Specification: Lunar Payloads Explorer

> **Superseded (2026-11-13).** The application is now the React app in the `app/` folder (see [05-react-app.md](05-react-app.md)). This document remains the requirements record; the earlier prototype is kept in `prototype/` as a reference and is no longer the deliverable.

> Status: **Approved.** Deliverable 2 (solution, page list, wireframes) follows, and Deliverable 3 (HTML prototype) starts only after Deliverable 2 is approved.

---

## 1. Context and purpose

Lunar Payloads Explorer (LPE) is a companion web app to the **Serenity™ Lunar Explorer** main application, which links to it. Visitors use it to browse and search the 320 scientific instruments (payloads) in the working catalogue, and to read what each one was designed to do.

**Intended outcome:** within 3 clicks of landing, a visitor can find any payload by category or search and read a structured, sourced article about it.

**Source inputs**
| Input | Location | Notes |
|---|---|---|
| Catalogue (16 categories, 320 payloads) | `lunar_payloads_catalogue.md` | Source of truth for names, numbering and category membership |
| Payload detail (320 files) | `data/payloads/001_passive_seismometer_payload.json` | One JSON per payload, with the number first; a Markdown copy of each sits beside it for reading |
| Main app look and feel | `sample-ui/*.jpg` | Serenity screenshots: dark slate UI, condensed type |

---

## 2. Scope

**In scope**
- Home page with a hero image and an app description
- Category browsing: 16 categories as tiles, then the payloads in a category as cards
- Global search across all 320 payloads
- A payload details page with tabbed sections generated from the JSON
- Visual alignment with Serenity, using a blue primary accent
- A link back to Serenity
- A functioning static HTML/CSS/JS prototype (Deliverable 3)

**Out of scope (for this phase)**
- Authentication, user accounts, favourites
- CMS or admin editing of payload content
- A backend or API (the data is static files)
- Writing or validating content for the 319 payloads that have no JSON yet
- Lunar location recommendations (the JSON marks these "Deferred by user")
- Lander compatibility checks, 3D models, mission timelines
- Localisation (content keeps its UK English spelling)
- Analytics and telemetry

---

## 3. Users and key journeys

| User | Goal |
|---|---|
| Curious visitor arriving from Serenity | Understand what kinds of instruments go to the Moon |
| Student or educator | Read a clear, sourced explanation of a specific instrument |
| Mission and space enthusiast | Compare historical and modern examples and their specifications |

**Journeys**
- **J1 Browse:** Home → Categories → Category → Payload card → Details tab
- **J2 Search:** Search bar (any page) → suggestion or results page → Details
- **J3 Return:** Any page → "Back to Serenity" → main app
- **J4 Deep link:** A shared URL to a category, search or payload opens straight into that view

---

## 4. Data requirements

### 4.1 Catalogue index
- **DR-1** The catalogue is parsed into a machine-readable index of 16 categories and 320 payloads. The index is generated once from the `.md` file, which stays the source of truth.
  - Category fields: `number`, `name`, `slug`
  - Payload fields: `number`, `name`, `slug`, `category_number`, `detail_file` (null when no JSON exists)
- **DR-2** The **payload number (1–320) is the unique key**. Duplicate names are separate payloads, for example *Gas chromatograph* is #70 (category 3) and #144 (category 7). The UI always shows the category alongside the name so they can be told apart.
- **DR-3** Detail files follow the pattern `data/payloads/{NNN}_{snake_case_name}_payload.json`, where NNN is the zero-padded payload number at the start of the name (e.g. `001_passive_seismometer_payload.json`). The number first keeps the files in catalogue order in any file browser. Markdown copies use the same name with `.md`. Adding a payload means adding its JSON file and setting `detail_file` in the index. No code change is needed.

### 4.2 Payload detail JSON (schema taken from #001)
| JSON path | Use in UI |
|---|---|
| `category.number` / `category.name` | Breadcrumb and category chip |
| `payload.number` / `payload.name` | Page title and "#001" badge |
| `payload.article.overview` | Overview tab, and card or hero summary text |
| `article.description` | Description tab |
| `article.scientific_purpose_and_applications` | Scientific Purpose & Applications tab |
| `article.operating_principle` | Operating Principle tab |
| `article.scientific_importance` | Scientific Importance tab |
| `article.physical_specifications` | Physical Specifications tab: note, one spec card per example, then dimensions and mass prose |
| `article.environmental_and_operational_requirements` | Environment & Operations tab |
| `article.limitations` | Limitations tab |
| `article.transportation_and_deployment` | Transportation & Deployment tab: overview, numbered steps, methods, historical examples, compatibility |
| `article.historical_significance` | Historical Significance tab |
| `article.limitations_and_uncertainties` | Uncertainties tab |
| `article.overview_images[]` | Image strip inside the Overview tab; its first image is the feature image and card thumbnail (DR-8) |
| `article.physical_specifications.examples[].images[]` | Thumbnails inside that example's spec card (FR-D5) |
| `article.transportation_and_deployment.images[]` | Image strip inside the Transportation & Deployment tab (FR-D6) |
| `article.images[]` | Master image registry: Images tab (gallery); fallback for the feature image and card thumbnail |
| `images[].section_placements` | Metadata only: records where an image is used. Not shown in the UI |
| `image_handling` (top level, outside `payload`) | Metadata describing the image layout. Not shown in the UI |
| `article.references[]` | References tab (external links) |
| `payload.research_status` | Not shown in the UI (the Content status panel was removed; see FR-D9) |

- **DR-4 Rendering is generic and tolerant:**
  - A tab appears only when its field exists and is not empty.
  - Unknown future `article` keys still render, as a tab with a humanised label.
  - String values render as paragraphs, arrays as lists, and objects as labelled groups.
- **DR-5 Formatting of specification values:**
  - Key suffixes become units: `_kg`→kg, `_cm`→cm, `_w`→W, `_hz`→Hz, `_seconds`→s.
  - Two-number arrays render as ranges, e.g. `0.05–20 Hz`.
  - `approximate_range` renders as "≈ a–b".
  - `source_urls` render as links.
- **DR-6 Missing detail:** payloads with `detail_file = null` still appear in categories and search. Their details page shows the name, number and category, a "Details coming soon" state, and links to other payloads in the same category.
- **DR-7 Data-quality caveats are visible, not hidden:**
  - Every image links to its source page from the lightbox. If an image URL does not return an image (e.g. #001's Smithsonian `collection-media` URL, which returns an HTML page), the tile shows "Preview unavailable" instead of a broken image.
  - If a publisher's URL is known to be a small crop (for example a `h=150` query), the Images tab shows a note pointing to the source page for full resolution.
  - The catalogue header says entries are "not independently deduplicated or technically validated", and the About or footer text says the same.
- **DR-8 Section images:** images can be attached to an article section in two ways, both rendered inside that section's tab:
  - an `images` array inside a section object (e.g. `transportation_and_deployment.images`, `physical_specifications.examples[n].images`);
  - a sibling article key named `<section>_images` (e.g. `overview_images`), which never becomes a tab of its own.

  Section image objects are full copies (same fields as `article.images[]`), so no ID lookup is needed. `article.images[]` remains the complete gallery.

---

## 5. Functional requirements

### 5.1 Global shell (every page)
- **FR-G1 Header:**
  - Wordmark "Lunar Payloads" with the letter-spaced subtitle "EXPLORER", in Serenity's wordmark style.
  - Primary navigation: Home, Categories.
  - Global search bar.
  - A "← Serenity" link back to the main app. Its URL is configurable, defaulting to Serenity's root.
- **FR-G2 Breadcrumbs** on the category, search and payload pages, e.g. Home / Categories / Geophysical… / Passive Seismometer.
- **FR-G3 Footer:** a data disclaimer (DR-7), image credit note ("Images © respective publishers, e.g. NASA"), and the catalogue version.
- **FR-G4 Routing:**
  - Hash-based, deep-linkable URLs so the app works on any static host: `#/`, `#/categories`, `#/category/{n}`, `#/payload/{n}`, `#/search?q=`.
  - Browser back and forward work.
  - Each route sets a page title, e.g. "Passive Seismometer · Lunar Payloads Explorer".
- **FR-G5 Not found:** an unknown route or an out-of-range number shows a friendly "Not found" panel linking Home and Categories.

### 5.2 Home page
- **FR-H1 Hero:**
  - Full-width lunar hero image with a dark gradient overlay.
  - App title plus a 1–2 sentence description of purpose.
  - Primary CTA "Explore categories" and a large search input.
- **FR-H2** Key stats strip: **16 categories · 320 payloads · N detailed articles**. N is computed from the index.
- **FR-H3** "Browse by category" preview showing all 16 category tiles, the same component as FR-C1.
- **FR-H4** "How to use" or About blurb (3 short points) and the data disclaimer.
- **FR-H5** The hero image is a public-domain lunar image stored locally in `assets/`. If it fails to load, a CSS-rendered moon gradient takes its place.

### 5.3 Categories (tiled UI)
- **FR-C1 One tile per category (16).** Each tile shows:
  - Category number and name
  - A line icon unique to the category
  - Payload count
  - A one-line description
- **FR-C2** Tiles are fully clickable and keyboard-focusable. Hover and focus show the blue accent border and a slight lift (no lift under reduced motion).
- **FR-C3** Responsive grid: 4 columns at 1200 px and wider, 3 at 900–1199, 2 at 600–899, 1 below 600.

### 5.4 Category page (payload cards)
- **FR-L1** Header with the category name, number, description, payload count, and previous/next category links.
- **FR-L2 One card per payload.** Each card shows:
  - **Image:** the first overview image (or, failing that, the first image in `article.images[]`); if there is none, a category-icon placeholder.
  - **Title:** the payload name.
  - **Number badge:** e.g. #001.
  - **Short summary:** the first ~140 characters of the overview when available.
  - **Status chip:** "Article available" or "Coming soon".
  - **"View details" button** linking to the details page.
- **FR-L3** In-category filter box (filters cards by name as you type) and a toggle for "Only payloads with articles".
- **FR-L4** Cards use the same responsive grid as FR-C3. Images are lazy-loaded, and a broken image falls back to the placeholder.

### 5.5 Search
- **FR-S1** The search bar is in the header on every page and as the large input in the home hero.
- **FR-S2 Matching:**
  - Case-insensitive and diacritic-insensitive, so "mossbauer" finds *Mössbauer spectrometer*.
  - Matches the payload name, abbreviations in parentheses (APXS, LIBS), the category name, and the payload number ("#57" or "57").
- **FR-S3 Typeahead:**
  - Shows up to 8 suggestions after 2 or more characters, with a debounce of about 150 ms.
  - Each suggestion shows the name, category and number, with the matched text highlighted.
  - Arrow keys, Enter and Esc work; selecting a suggestion opens the details page.
- **FR-S4 Results page (Enter or "See all results"):**
  - Shows a result count, results grouped by category, and the same card component as FR-L2.
  - The query stays in the URL.
- **FR-S5 Ranking:** exact name, then name starts with the query, then a word in the name starts with it, then the name contains it, then a category match.
- **FR-S6 Empty state:** "No payloads match '…'" with tips and links to the categories.
- **FR-S7 (Optional, later):** full-text search across article content once more JSONs exist. Not required for the prototype.

### 5.6 Payload details page
- **FR-D1 Header block:**
  - Payload name, number badge and category chip (links to the category).
  - The overview as a lead paragraph.
  - The first overview image as the feature image (falling back to the first image in `article.images[]`); clicking it opens the lightbox.
- **FR-D2 Tabbed view.** Tabs come from DR-3/DR-4 in this order:
  1. Overview
  2. Description
  3. Scientific Purpose & Applications
  4. Operating Principle
  5. Scientific Importance
  6. Physical Specifications
  7. Environment & Operations
  8. Limitations
  9. Transportation & Deployment
  10. Historical Significance
  11. Uncertainties
  12. Images
  13. References
- **FR-D3 Tab behaviour:**
  - Follows the WAI-ARIA Tabs pattern: arrow keys, Home and End move focus, and `aria-selected`, `aria-controls` and roles are set.
  - The active tab is reflected in the URL (`#/payload/1?tab=operating-principle`) so it can be deep-linked.
- **FR-D4 Tab overflow:**
  - Desktop: a horizontally scrollable tab strip with fade edges.
  - Mobile (below 768 px): the tab strip becomes a labelled `<select>` dropdown.
- **FR-D5 Physical Specifications:**
  - The note appears as a highlighted caveat.
  - Each example is a spec card: name, type chip, a row of the example's image thumbnails (if any), a key–value table formatted per DR-5, a qualification note, and source links. Images are never shown as table rows.
  - The dimensions and mass prose follows the cards.
- **FR-D6 Transportation & Deployment:** an overview paragraph, the process as a numbered stepper, then subsections for deployment methods, historical examples and compatibility assessment, followed by the section's images (FR-D12).
- **FR-D7 Images tab:**
  - A responsive gallery of every image in `article.images[]`. Each image shows its type chip, caption and credit.
  - Clicking an image opens a lightbox showing the description, notes, credit and a "View on source page" link.
  - Alt text comes from `description`.
- **FR-D8 References tab:** a numbered list with the title, the publisher, and an external link that opens in a new tab.
- **FR-D9 (Removed, 2026-11-13):** the "Content status" and "Quick facts" side panels are not part of the payload page. The tabbed details module uses the full content width, with no side column.
- **FR-D10 Navigation:** previous/next payload within the category (in the header block), a "More in this category" strip (4 cards) with "View all", and the breadcrumb link back to the category.
- **FR-D11 States:** a loading skeleton while the JSON is fetched, the "coming soon" state (DR-6), and an error state with Retry if the fetch fails.
- **FR-D12 Section image strips (DR-8):**
  - A labelled "Images (n)" strip at the end of the section, with caption and credit under each thumbnail.
  - Clicking a thumbnail opens the lightbox, where ←/→ move through **that section's** images only.
  - Keyboard focus stays inside the lightbox while moving between images.

---

## 6. Look and feel (derived from the Serenity screenshots)

| Element | Serenity observation | LPE requirement |
|---|---|---|
| Background | Near-black space (#000–#05080C) | Same, with an optional subtle static starfield |
| Panels and cards | Dark slate (~#1C2834), slightly translucent, 1 px light border, ~12 px radius | Identical tokens for cards, tiles, tab panels and search dropdown |
| Typography | Condensed sans-serif for UI, numerals and labels; thin wordmark | **Barlow Condensed** for UI, headings and labels; **Barlow** (regular width) for long article prose, for readability |
| Section labels | Uppercase, letter-spaced, small ("INFO", "LAYERS") | Same for panel headers and tab-group labels |
| Toggles and buttons | Pill segmented controls; the active segment is a lighter slate fill; small outlined buttons; filled primary button | Same shapes; **primary and active colour is blue** |
| Status colours | Green dot "Available"; amber badges | Green = article available / OK; amber = caution or coming soon |
| Accent | Cyan/teal | **Blue accent `#4D8DFF`** (hover `#6FA3FF`, pressed `#3A72D9`), at least 4.5:1 contrast on slate |
| Edge tabs and pinned panels | Vertical side tabs, "Pinned" pill | Not needed; "pill" chips reused for badges |

- **LF-1** Tokens are defined once as CSS custom properties (colour, radius, spacing, type scale) so the accent can be swapped in one place.
- **LF-2** Dark theme only, matching Serenity. No light theme in this phase.

---

## 7. Non-functional requirements

- **NFR-1 Performance:**
  - The catalogue index is under 60 KB and loads once.
  - Detail JSONs are fetched on demand and cached in memory.
  - Images are lazy-loaded.
  - Home becomes interactive in under 2 s on a typical laptop over localhost.
- **NFR-2 Accessibility:**
  - Meets WCAG 2.2 AA.
  - Full keyboard operation with a visible focus ring (blue).
  - Semantic landmarks, alt text and `prefers-reduced-motion` support.
  - Minimum touch target of 44 px.
- **NFR-3 Responsiveness:** works from 360 px to 1920 px or wider, with no horizontal page scroll.
- **NFR-4 Browsers:** latest 2 versions of Chrome, Edge, Firefox and Safari.
- **NFR-5 Security:**
  - All JSON content is rendered as text (`textContent`), never as raw HTML.
  - Link and image URLs are allowed only with `http(s)`.
  - External links use `rel="noopener noreferrer"`.
  - No third-party scripts. Fonts come only from Google Fonts or are self-hosted.
- **NFR-6 Maintainability:**
  - No build step.
  - Data is fully separate from code.
  - New payload JSONs and new article sections appear without code changes (DR-3, DR-4).
- **NFR-7 Portability:** the prototype is built from plain components (header, tile, card, tabs, search) so it is straightforward to port into Serenity's stack later.

---

## 8. Technical constraints (prototype)

- Static HTML, CSS and vanilla JavaScript (ES modules). No framework and no build.
- Needs a local static server because JSON is loaded with `fetch` (e.g. `npx serve` or `python -m http.server`). Opening via `file://` is not supported.
- Proposed folder layout (to be confirmed in Deliverable 2): `index.html`, `css/`, `js/`, `assets/`, `data/catalogue.json`, `data/payloads/*.json`. All of these live under the existing project root.

---

## 9. Assumptions, risks and open items

| # | Item | Type | Handling |
|---|---|---|---|
| A1 | Only #001 has content; 319 payloads show "coming soon" | Assumption (confirmed) | DR-6 |
| A2 | Serenity's exact fonts and hex values aren't available; they are inferred from screenshots | Risk (low) | Tokens in LF-1 make adjustment a one-line change |
| A3 | Images are hotlinked from NASA and the Smithsonian; one #001 image URL is a web page, not an image file | Risk (medium) | "Preview unavailable" fallback and source links (DR-7); mirror the assets locally for production |
| A4 | No category descriptions or icons exist in the source data | Assumption | I will write one-line descriptions and use simple inline SVG icons; you can edit them |
| A5 | The Serenity back-link URL is unknown | Open | Configurable constant, defaulting to `http://localhost:5173/` |
| A6 | 13 tabs is a lot for one strip | UX risk | Scrollable strip plus mobile dropdown (FR-D4); grouping can be reconsidered in Deliverable 2 |
| A7 | Catalogue content is unvalidated (duplicates, accuracy) | Data risk | Disclaimer (DR-7); number used as key (DR-2) |

---

## 10. Acceptance criteria

1. Home shows a hero image, the description, the stats strip (16 / 320 / 1), and all 16 category tiles.
2. Clicking any tile lists exactly the catalogue's payloads for that category as cards with title, image or placeholder, and a "View details" button. Category counts sum to 320.
3. Searching for "seismo" suggests the 4 seismometers (#1–#4). "apxs" finds #54, "mossbauer" finds #64, and "gas chromatograph" returns both #70 and #144 labelled with their categories.
4. `#/payload/1` shows all 13 tabs populated from the JSON, with section images inside the Overview, Physical Specifications and Transportation & Deployment tabs (no extra "Overview images" tab). Specification values are formatted (e.g. "11.5 kg", "0.05–20 Hz"), the transport steps are numbered, the images open in a lightbox, and the references open in new tabs.
5. `#/payload/2` shows the "coming soon" state with category navigation, not an error.
6. Tabs, search typeahead and cards are fully keyboard-operable. Reloading a deep link (including `?tab=`) restores the same view.
7. At 375 px width the layout is single-column, the tabs become a dropdown, and there is no horizontal scroll.
8. The look visibly matches Serenity (dark slate panels, condensed type, pill controls) with a blue accent.

---

## 11. Next deliverables (after approval)

- **Deliverable 2:** solution architecture, page inventory with functionality per page, component list, and wireframes for Home, Categories, Category, Search Results and Payload Details (desktop and mobile).
- **Deliverable 3:** a working static prototype in the project folder, verified against the acceptance criteria above by serving it locally and checking each journey in a browser.
