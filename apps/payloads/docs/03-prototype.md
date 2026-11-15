# Deliverable 3 — HTML Prototype: Lunar Payloads Explorer

> **Superseded (2026-11-13).** The application is now the React app in the `app/` folder (see [05-react-app.md](05-react-app.md)). This document remains the requirements record; the earlier prototype is kept in `prototype/` as a reference and is no longer the deliverable.

> Status: **Delivered for review.** Implements [01-requirements-specification.md](01-requirements-specification.md) using the design in [02-solution-design.md](02-solution-design.md).

---

## 1. Running the prototype

The app loads JSON with `fetch`, so it must be served over HTTP. Opening `index.html` via `file://` shows a banner that explains this.

```bash
# from the project root
python -m http.server 8765 --bind 127.0.0.1      # or: npx serve .
# then open http://127.0.0.1:8765/
```

| Task | Command |
|---|---|
| Rebuild the catalogue index after editing `lunar_payloads_catalogue.md` or adding a payload JSON | `node tools/build-catalogue.mjs` |
| Run the end-to-end checks (server must be running; needs Chrome) | `node tools/verify-e2e.mjs` |

**Requirements:**
- Node 22 or later (for the tools only; the app has no build step)
- Any modern browser

---

## 2. Adding a new payload article

1. Save the JSON in `data/payloads/` as `{NNN}_{snake_case_name}_payload.json`, where `NNN` is the zero-padded catalogue number, for example `013_fluxgate_magnetometer_payload.json`. Use the schema from `001_passive_seismometer_payload.json`. Optionally save a Markdown copy with the same name and `.md`.
2. Run `node tools/build-catalogue.mjs`. The script:
   - matches the file to its payload **by number**;
   - sets `detail_file`;
   - copies the first image and a ~150-character summary into `data/catalogue.json` for the cards;
   - prints any warnings.
3. Reload the browser. The payload's card switches to "Article available", and its details page shows the tabs.

**No code changes are needed** (DR-3, DR-4):
- Tabs appear only for sections that exist.
- New, unknown `article` keys appear automatically as extra tabs with readable labels, placed before Images.

---

## 3. What was built

| Page | Route | Notes |
|---|---|---|
| Home | `#/` | Hero (Apollo 17 full-disc photo, NASA AS17-152-23311, stored locally); search; CTAs; stats 16 / 320 / 1; 16 category tiles; how it works; data disclaimer |
| All categories | `#/categories` | 16 tiles; catalogue order or A–Z toggle |
| Category | `#/category/{n}` | Header, filter box, "All / With articles" toggle, payload cards, previous/next category |
| Search results | `#/search?q=` | Ranked results grouped by category, highlighted matches, empty state |
| Payload details | `#/payload/{n}[?tab=]` | Header with feature image and prev/next; full-width module with 13 deep-linkable tabs; "More in this category" |
| Coming soon | `#/payload/{n}` (no JSON) | Graceful placeholder; related list puts articles first |
| Not found | anything else | Search box plus recovery links |

**Shared behaviour:**
- **Header typeahead:** ARIA combobox with ↑ ↓ Enter Esc; accent- and abbreviation-aware matching.
- **Tabs:** WAI-ARIA tabs with ← → Home End, a scrollable strip with arrow buttons, and a `<select>` below 768 px.
- **Image viewer:** native `<dialog>` lightbox with ← →, Esc, and a link to the source page.
- **Back to Serenity:** link in the header and the hero.

### File map
```
index.html                 App shell (header, <main>, footer)
css/tokens.css             Design tokens — change --accent* to retheme
css/base.css               Reset, type, grids, utilities
css/components.css         All components
js/config.js               Serenity URL and app settings
js/app.js · router.js      Boot + hash router
js/data.js                 Catalogue + payload loading/caching
js/search.js               Normalise / index / rank / highlight
js/format.js               Key labels, units, ranges
js/dom.js                  Safe DOM builder (no innerHTML), URL allow-list
js/icons.js                Static inline SVG icons
js/components/             common, cards, search-box, tabs, lightbox, article
js/views/                  home, categories, category, search-results, payload, not-found
data/catalogue.json        GENERATED index
data/category-meta.json    Hand-edited category descriptions + icon keys
tools/build-catalogue.mjs  Index generator
tools/verify-e2e.mjs       End-to-end checks
```

**Deviation from the design (§2 of Deliverable 2):** the small components are grouped into 6 files instead of about 12:
- `common.js` holds breadcrumbs, chips, segmented pill and states.
- `article.js` holds spec cards, stepper, gallery, references and status panel.

Behaviour is unchanged.

---

## 4. Verification results

`tools/verify-e2e.mjs` drove the prototype in headless Chrome through the DevTools Protocol at 1440 px and at 375 px (mobile emulation). **56 of 56 checks passed** (1 skipped), with no console errors or exceptions. Last run: 2026-11-13, after the full-width text change in §6.

Expected counts (articles per category, the home stats) are now read from `data/catalogue.json`, so the suite stays valid as articles are added. The coming-soon check (AC5) runs only while at least one payload has no article; with all 320 articles present it is reported as **SKIP**.

| Acceptance criterion | Result |
|---|---|
| AC1 Home: hero, description, stats 16/320/1, 16 tiles | ✅ |
| AC2 Category cards per category: 25, 28, 27, 18, 15, 26, 15, 18, 20, 14, 21, 20, 19, 20, 19, 15 (sum 320); every card has a title, image or placeholder, and "View details" | ✅ |
| AC3 Search:<br>• "seismo" → #1–#4<br>• "apxs" → #54<br>• "mossbauer" → #64<br>• "gas chromatograph" → #70 (Mineralogical) and #144 (Exosphere), plus #71 | ✅ |
| AC4 `#/payload/1`:<br>• 13 tabs (no extra "Overview images" tab)<br>• specs formatted: "11.5 kg", "0.05–20 Hz", "≈ 4.3–7.4 W", "40 × 40 × 40 cm"<br>• 6 numbered transport steps<br>• lightbox opens, moves with ←/→ (focus stays in the dialog), closes with Esc<br>• 8 references open in a new tab with `noopener noreferrer` | ✅ |
| DR-8 / FR-D12 section images:<br>• Overview strip shows 3 images; feature image is the full-resolution `overview_images[0]`<br>• each spec card shows 3 thumbnails, none rendered as table rows<br>• Transport strip shows 2 images<br>• a section strip's lightbox shows "1 of 3" (scoped to the section)<br>• Images tab lists all 7; 6 load, the Smithsonian URL shows "Preview unavailable" | ✅ |
| AC5 `#/payload/2` shows "Coming soon", not an error | ✅ |
| AC6 Keyboard:<br>• typeahead ↑ ↓ Enter Esc<br>• tabs ← → End<br>• `?tab=` deep link survives reload<br>• an unknown `?tab=` falls back to Overview<br>• browser Back works | ✅ |
| AC7 At 375 px: no horizontal scroll (home, category, payload, search); single column; tabs become a working dropdown | ✅ |
| AC8 Serenity look and feel: dark slate panels, condensed type, pill controls, blue accent | ✅ (visual review of screenshots) |
| NFR-5 No `innerHTML` with data; only http(s) URLs become links or images | ✅ (code scan) |
| NFR-1 Catalogue index size | 52 KB (budget 60 KB) |

---

## 5. Known limitations and next steps

| # | Item | Suggested next step |
|---|---|---|
| L1 | #001's Smithsonian image URL (`airandspace.si.edu/collection-media/NASM-A19730062000_DSH01`) returns an HTML page, not an image, so it shows "Preview unavailable" in the gallery and in the Apollo spec card. The JSON also notes usage conditions for this image | Replace `image_url` with the direct image file URL from that page (after checking the museum's rights terms); no code change needed |
| L2 | Images are hotlinked from NASA and the Smithsonian (full-resolution NASA files are 185–460 KB each), so pages need a connection and depend on those URLs staying valid | Broken images fall back to placeholders; mirror and resize the assets for production |
| L3 | Only #001 has an article; 319 payloads show "Coming soon" | Add JSONs and run `node tools/build-catalogue.mjs` |
| L4 | `serenityUrl` defaults to `http://localhost:5173/` | Set the production URL in `js/config.js` |
| L5 | Fonts load from Google Fonts | Self-host Barlow and Barlow Condensed for production (D4) |
| L6 | Search covers names, abbreviations, categories and numbers, but not article text (FR-S7, optional) | Add full-text search once more articles exist |
| L7 | Category descriptions in `data/category-meta.json` are draft wording | Review and edit; no code change needed |
| L8 | The tools were verified with Chrome only; the app wasn't tested in Firefox or Safari | Do a manual pass in Firefox and Safari before handover |

---

## 6. Change log

### Payload #001 JSON update: section-level images
The updated `data/payloads/001_passive_seismometer_payload.json` was compared with the earlier version. The earlier copy has since been removed from the folder.

| Change in the JSON | Prototype change |
|---|---|
| Image URLs no longer carry `?crop=…&w=150&h=150`; they now point at the full-resolution files | Catalogue rebuilt; card thumbnail and feature image are now sharp. The "small preview crops" note in the Images tab no longer appears (it is shown only when a URL or note indicates a crop) |
| `article.images` grew from 4 to 7 entries (Smithsonian hardware photo, two more Farside Seismic Suite photos); IDs and descriptions refined | Images tab now shows 7 |
| New `article.overview_images` (3) | Shown as an "Images (3)" strip in the Overview tab; first entry is the feature image and card thumbnail. Without this change it would have appeared as a stray 14th tab |
| New `physical_specifications.examples[n].images` (3 per example) | Thumbnail row in each spec card. Without this change the image objects would have been dumped into the specification table |
| New `transportation_and_deployment.images` (2) | "Images (2)" strip at the end of the Transport tab |
| New `section_placements` on each image, and top-level `image_handling` | Treated as metadata; not rendered |

**Other fixes made at the same time:**
- **Lightbox focus:** pressing ←/→ used to drop keyboard focus to the page body; focus now stays on the control inside the dialog.
- **Broken image tiles:** a URL that doesn't return an image now shows a labelled "Preview unavailable" tile rather than a bare icon.

**Files changed:**
- `js/components/article.js`: shared `imageGrid` (gallery / strip / mini), `sectionImages`, `withImages`, image-aware generic renderer, spec card thumbnails, transport strip.
- `js/views/payload.js`: `<section>_images` keys attach to their section; feature image prefers `overview_images`.
- `js/components/lightbox.js`: focus handling.
- `css/components.css`: strip/mini gallery and "Preview unavailable" styles.
- `tools/build-catalogue.mjs`: thumbnail prefers `overview_images`.
- `tools/verify-e2e.mjs`: 9 new checks.
- `data/catalogue.json`: regenerated.
- Docs: `01` (DR-7, DR-8, FR-L2, FR-D1, FR-D5, FR-D6, FR-D7, FR-D12, A3, AC4), `02` (§3, §4, §5, §8.8), `03` (this section, §4, §5).

### 2026-11-13: Payload page layout, full width
- **Removed:** the "Content status" and "Quick facts" side panels on the payload page (and on the coming-soon page). `payload.research_status` is no longer displayed.
- **Layout:** the tabbed details module now spans the full content width (1200 px at desktop, the same as the header panel).
- **Navigation that remains:** prev/next buttons in the header, the breadcrumb link to the category, and "View all" next to "More in this category". The "Back to category" button lived in Quick facts and was removed with it.
- **Article text:** the 72-character line cap has been removed. Prose now fills the full width of its panel, the same as tables, spec cards and image strips. The Description tab's text spans about 95% of the panel width (checked by the test suite, which allows for panel padding).
- **Catalogue:** rebuilt. All 320 payloads now have an article (it previously listed 316).

**Files changed:**
- `js/views/payload.js`: removed `quickFacts`, the side column and the `statusPanel` call.
- `js/components/article.js`: removed `statusPanel` and its labels.
- `css/components.css`: removed `.pd-grid`, `.pd-main`, `.pd-side`, `.side-panel`, `.status-*` and `.facts` rules.
- `tools/verify-e2e.mjs`: expectations read from the catalogue; new layout checks.
- `data/catalogue.json`: regenerated.
- Docs: `01` (data table, FR-D9, FR-D10), `02` (§2, §4 P5, §5, wireframes 8.7, 8.9, 8.10), `03` (§3, §4, this entry).
