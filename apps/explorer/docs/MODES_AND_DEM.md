# Phase 2 — Visualisation modes and the elevation dataset (Phase A + B)

Facts below were read from the official pages on 2026-10-24/25. Each is marked
**documented** (an official page states it), **derived** (calculated from documented
numbers, reproduced by tests) or **not stated** (not found; deliberately not guessed).

## 1. Recommended elevation data

| Role | Dataset | Why | Limits |
|---|---|---|---|
| Global base (Phase C) | **LOLA LDEM_16**, 16 px/deg, 5760x2880, 1.895 km/pixel (documented) | The app already loads it (NASA SVS repackaging), so scale, legend and picking can be checked against data already in the browser. | Regional-scale only. Slope over ~1.9 km cannot judge a landing site. |
| Optional global detail | LOLA LDEM_64, 23040x11520, 0.4738 km/pixel | Better global detail. | ~531 MB raw (derived); needs build-time tiling. Not needed first. |
| Landing-scale, 60S-60N | **SLDEM2015**, 512 px/deg, 59.2252938 m/pixel, 61440x184320, 22 GB GeoTIFF; typical vertical accuracy 3-4 m (all documented, USGS) | Best candidate for site analysis. Equirectangular, planetocentric latitude, positive-east longitude, heights relative to radius 1,737,400 m, metres. | Far too big to load whole; only small regional tiles. No poles. |
| Polar (CLPS south-pole targets) | **LOLA polar stereographic grids**, LDEM_45S_100M ... LDEM_87S_5M (sizes documented) | Equirectangular grids distort badly near the poles. | Separate projection code needed. A 10 m grid is ~1.8 GB raw (derived). |

**Vertical reference:** heights are metres above a reference *sphere* of radius 1737.4 km, not a geoid or "sea level".

**Official sources**
- ODE, LOLA GDR shape map: https://ode.rsl.wustl.edu/moon/pagehelp/Content/Missions_Instruments/LRO/LOLA/GDR/GDRDEM.htm
- USGS SLDEM2015: https://astrogeology.usgs.gov/search/map/moon_lro_lola_selene_kaguya_tc_dem_merge_60n60s_59m
- NASA PGDA SLDEM2015: https://pgda.gsfc.nasa.gov/products/54
- PDS Geosciences LOLA: https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- PDS Geosciences FAQ: https://pds-geosciences.wustl.edu/faq.html

**Licence:** PDS FAQ: "Data sets archived in the PDS are in the public domain" and "should be cited in the same way that published research is cited". USGS SLDEM2015: access "public domain", "Please cite authors", credit NASA's LOLA Team and JAXA's SELENE/Kaguya Team. This is not legal advice.

**Not verified (do not assume):**
- The PDS page prints `HEIGHT = DN x SCALING_FACTOR` but not the numeric factor/offset (they are in each product label).
- The app's `(count - 20000) / 2` decoding for the SVS file is derived and tested in the project, not printed verbatim by NASA. The SVS 4720 page has a typo: one caption says "1727400 meters", the text says 1737.4 km.
- Row 0 = north and column 0 = -180 deg for the SVS file must be confirmed against the actual file in Phase C.
- No accuracy figure for gridded LDEM_16 cells was found. SLDEM2015 nodata value and checksum are not stated.

## 2. Mode architecture

- `src/modes/visualisationModes.ts` — pure registry of the six modes, status (`available` / `awaiting-implementation` / `awaiting-data`), purpose, planned content and what is still needed. Only Normal is `available`. A non-available mode shows no numbers, scale or score.
- `src/modes/modeStore.ts` — tiny store holding **only** `{ active }`. Camera, simulation clock and open mission live where they already live, so a mode switch cannot reset them.
- `src/modes/demSources.ts` — dataset records with documented/derived/unknown facts and source links.
- `src/ui/ModeSelector.tsx`, `useModeState.ts` — selector inside the existing bottom-right panel plus a store hook.
- `MoonViewport.tsx` — adds the selector and a "mode not implemented: showing Normal view" chip. It does **not** call the scene: nothing but Normal exists yet.

**Integration point for Phase C:** subscribe `MoonScene` (or an effect in `MoonViewport`) to the store and call a future `scene.setVisualisationMode(id)`. Only then does the Moon change.

## 3. Roadmap

| Phase | Adds | Files (expected) |
|---|---|---|
| C Elevation | decode/sample LDEM_16, colour scale + legend, picking, loading/error states | render layer, legend component, tests |
| D Slope, Relief | slope in degrees with stated baseline; analytic shaded relief labelled "not real sunlight" | terrain analysis module, tests |
| E Illumination | Sun direction from the shared clock, terrain shadows; permanent shadow only from a published dataset | shadow module, PGDA polar illumination data |
| F Landing Safety | measurements with sources/uncertainty; no score | needs verified lander requirements |
| G Mission Explorer | your supplied CLPS list | uses existing dossier |
