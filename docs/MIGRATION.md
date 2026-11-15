# Migration: four apps into one repository

This records where each part of Serenity came from, what was left behind, the baselines taken before the merge, and what is still to clean up. The plan is in [00-merge-plan.md](00-merge-plan.md).

## 1. Sources

| Repo location | Original folder (unchanged) | Notes |
|---|---|---|
| `apps/home` | `serenity-continuous-motion/site` | Only `index.html`, `home-assets/` (minus `launch-workspace.js`), `favicon.svg`, `icons.svg`. |
| `apps/explorer` | `clps-3d-lunar-explorer` | Source. Excludes `node_modules`, `dist` and `public/textures/ldem_16_uint.tif`. |
| `apps/missions` | `lunar-mission-explorer` | Standalone copy (the newer one with Serenity branding). |
| `apps/payloads` | `payload-explorer` | Imported with `git subtree`, so its commit history is kept under `apps/payloads/`. |

## 2. Left behind on purpose

| Item | Why |
|---|---|
| `serenity-continuous-motion/site/assets/` (prebuilt 3D bundle, `index-y4Lb_HTL.js`, 1.1 MB, and `index-CK7JuFz3.css`) and `explorer.html` | A compiled copy of an earlier 3D explorer. It has features that the source does not: the mission planner (`ma-planner`), atlas (`ma-atlas`), start/demo flow (`ma-start`) and regional shadow maps. Those are **not carried over**. The original folder keeps the bundle. |
| `serenity-continuous-motion/site/terrain/` | Demo data the bundle fetches (`pgda-demo-*.json`, `psr-sites.json`, two PNGs). |
| `serenity-continuous-motion/site/home-assets/launch-workspace.js` | Drives UI inside the bundle through `?view=` links. Nothing in the home page uses those links. |
| `serenity-continuous-motion/site/missions/` | An older copy of the mission explorer ("LUNAR ATLAS" branding). The newer standalone folder is imported instead. |
| `serenity-continuous-motion/site/textures/moon_color_4k.jpg` | Used only by the prebuilt bundle. |
| `clps-3d-lunar-explorer/public/textures/ldem_16_uint.tif` (33 MB) | Not loaded by any code. The app loads `ldem_16_uint.raw`, which is derived from it. The `.tif` is the documented source (`docs/TERRAIN_DATA.md`) and remains in the original folder. |
| `serenity-continuous-motion/START_SERENITY.cmd`, `serve.cjs`, `serve.ps1` | Replaced by `tools/serve.mjs` (cross-platform, no browser auto-launch through `cmd.exe`). |
| `prototype/` (vanilla payload prototype) | Frozen reference; superseded by `apps/payloads`. |
| Per-app `package-lock.json` files | Replaced by the single root lockfile (npm workspaces). |

## 3. Changes made in the merge

| App | Change | Why |
|---|---|---|
| All | Package names `@serenity/*` | Workspace names. |
| explorer | `vite.config.ts`: `base: process.env.VITE_BASE \|\| '/'` | So the app works under `/explorer/`. |
| explorer | `index.html` title → "Serenity · 3D Lunar Explorer" | Consistent naming. |
| explorer | `src/ui/SerenityMark.tsx`: the wordmark is now a link to the site root (`BASE_URL` one level up) | Back to home. |
| explorer | `src/styles/tokens.css`: `a.sg-brand { color: inherit; text-decoration: none; }` | Keeps the link looking like the old label. |
| explorer | `package.json`: `"test": "node --test \"src/**/*.test.ts\""` | It had no test script. |
| payloads | `src/config.ts`: "Back to Serenity" goes to the site root by default; `.env.development` sets it to `http://127.0.0.1:8095/` for standalone development | Works in the assembled site and standalone. |
| missions | Header brand `href="./"` → `href="../"` | Back to home. The footer and about dialog have no link to home, so the header is the only one to change. |
| home | `home-assets/home.js`: destinations `./explorer/`, `./missions/`, `./payloads/` | The three buttons open the apps. |

## 4. Baselines (before the merge)

### 4.1 Tests and builds

| Area | Command | Result |
|---|---|---|
| 3D explorer | `tsc -b` | Passes. |
| 3D explorer | `vite build` | Passes. Warning: a chunk is larger than 500 kB (the bundle is 1 MB+). |
| 3D explorer | `oxlint` | exit 0, **12 warnings**, 0 errors (react-hooks and refs rules in `src/ui/MoonViewport.tsx` and `src/ui/useSolarSite.ts`). |
| 3D explorer | `node --test "src/**/*.test.ts"` | **379 of 379 pass.** The README said 320 tests; the count has since grown. |
| Payload explorer | `tsc -b`, `eslint .` | Pass. |
| Payload explorer | `vitest run` | **44 of 44 pass.** |
| Payload explorer | `playwright test` (Chrome) | **41 pass, 11 skipped** (9 prototype-comparison screenshots that need `PROTO_URL`, 1 sub-path check, 1 coming-soon check). |
| Home page, mission explorer | none | No automated tests. Baseline screenshots below. |

### 4.2 Screenshots (`docs/baseline/`)

| File | Viewport | Source |
|---|---|---|
| `home-desktop.png` | 1440 × 900 | `serenity-continuous-motion/site/index.html` |
| `home-phone.png` | 375 × 812 | same |
| `missions-desktop.png` | 1440 × 900 | `lunar-mission-explorer/index.html` |
| `missions-phone.png` | 375 × 812 | same |

The 3D explorer and payload explorer were not captured as images in this baseline; their browser tests are the baseline for them.

### 4.3 Texture checksums

Before the merge, the shared textures in the main app and the 3D explorer were compared by SHA-256: `moon_color_2k.jpg`, `moon_color_16k.jpg`, `moon_height_8bit.jpg`, `ldem_16_uint.raw`, `ldem_16_uint.tif` and `README.txt` are identical in both places. Only `moon_color_4k.jpg` exists in the main app alone (see section 2).

## 5. Storage

| Item | Size | Storage |
|---|---|---|
| `apps/explorer/public/textures/moon_color_16k.jpg` | 38.8 MB | Git LFS |
| `apps/explorer/public/textures/ldem_16_uint.raw` | 33 MB | Git LFS |
| Other textures (2k and 8-bit JPEGs, README) | under 1 MB | Plain git |

Install Git LFS before cloning (`git lfs install`). A clone then gets the real texture files; a clone made without LFS holds pointer text instead, and `git lfs pull` fixes it. This was checked with a fresh clone: the two files came down at their full sizes (38,813,123 and 33,177,600 bytes).

## 6. Cleanup candidates (not done in this merge)

- `apps/explorer/App.css`, `src/index.css` (light theme and purple accent, still imported by `main.tsx`), `app-stage4.css` (not imported anywhere), and unused Vite template assets (`src/assets/react.svg`, `vite.svg`, `hero.png`). These need checking before deletion, because `index.css` is imported at startup.
- The explorer's 12 oxlint warnings (react-hooks and refs rules in `MoonViewport.tsx` and `useSolarSite.ts`).
- Aligning dependency versions. The explorer uses React 19.2, Vite 8, TypeScript 6 and oxlint; the payload explorer uses React 19.3, Vite 7, TypeScript 5.9 and ESLint.
- Two mission data sources: the explorer's `src/sim/missionCatalogue.ts` and the mission explorer's `catalog.js` / `history.js`.
- The shared design (fonts and tokens). The home page, mission explorer, 3D explorer and payload explorer each have their own palette and fonts.

## 7. Results after the merge

Measured on the merged repository (commit `26fe86d` and the documentation commit after it).

| Check | Before | After | Notes |
|---|---|---|---|
| 3D explorer: build | passes | passes | `vite build` in `apps/explorer` |
| 3D explorer: lint | exit 0, 12 warnings | exit 0, 12 warnings | identical count |
| 3D explorer: node tests | 379 pass | 379 pass | `npm test -w @serenity/explorer` |
| Payload explorer: typecheck and lint | pass | pass | |
| Payload explorer: unit tests | 44 pass | 44 pass | |
| Payload explorer: browser tests | 41 pass, 11 skipped | 41 pass, 11 skipped | same skips as before |
| Cross-app integration tests | none | 8 pass | `npm run test:e2e` at the root |
| Home page (desktop) | baseline screenshot | matches | `docs/baseline` vs `docs/after`; only a scroll animation differs mid-fade |
| Mission explorer (desktop) | baseline screenshot | renders correctly | catalogue, globe and timeline load |
| Assembled site build | none | passes | `npm run build` builds all four apps and the output is listed in section 3 |
| Fresh clone with LFS | none | textures at full size | see section 5 |

The 12 oxlint warnings are unchanged by the merge. They are warnings, not errors, and are listed under cleanup candidates in section 6.
