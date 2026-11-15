# Plan: Merge the four Serenity apps into one codebase (`Serenity/`)

## Context

Serenity was built as four separate apps in `C:\dev\test-data-access\lunar_payload_explorer\`:

| App | What it is today |
|---|---|
| `serenity-continuous-motion` | The home page: hand-written static site (no build, no package.json) served by `serve.cjs` on port 8095. It also carries a prebuilt copy of the 3D explorer and an older copy of the mission explorer. Its three "Open … Explorer" buttons have no URLs yet (`destinations = {lunar: null, mission: null, payload: null}` in `site/home-assets/home.js`). |
| `clps-3d-lunar-explorer` | The 3D explorer: React 19.2.8, Three.js, Vite 8.3, TypeScript 6.0, oxlint, 29 `node:test` files. About 17,700 lines. 101 MB of textures. No git. |
| `lunar-mission-explorer` | The mission explorer: plain JavaScript, no build, classic `<script>` tags, about 140 missions, hash deep links. The latest version carries the "Serenity - Mission Explorer" branding. |
| `payload-explorer` | The payload explorer: React 19.3.1, React Router 7, Vite 7, TypeScript 5.9, Vitest, Playwright. Has its own git history (7 commits, 2 uncommitted changes). |

Nothing links the apps together yet, and the home page cannot open any of them. The goal is **one repo where a single command builds and serves the whole site, with the apps linked to each other**, and where each app keeps working exactly as it does today.

## Decisions already made

| Topic | Decision |
|---|---|
| Architecture | **Monorepo, one assembled site.** Each app stays its own npm workspace package. One build puts them under one origin: `/`, `/explorer/`, `/missions/`, `/payloads/`. Separate HTML documents, so no CSS, router or global-variable collisions. |
| 3D explorer | **`clps-3d-lunar-explorer` source only.** The prebuilt bundle in the main app is not carried over. |
| Large files | **Git LFS** (git-lfs 3.6.1 is installed). One copy of the textures. |
| Home page, mission explorer | **Import as-is.** Porting them to React + TypeScript is a separate follow-up. |

### What is deliberately not carried over (please confirm on approval)

- Features that exist only in the prebuilt 3D bundle and not in the clps source: the **mission planner** (`ma-planner`), **atlas** (`ma-atlas`), **start/demo flow** (`ma-start`) and **regional shadow maps** (`checkRegional`, `checkTerrain`).
- `explorer.html`, `assets/` (bundle), `terrain/` (demo JSON and PNGs the bundle fetches) and `home-assets/launch-workspace.js` (it only drives UI that exists in the bundle; the home page has no `?view=` links).
- The older "LUNAR ATLAS" copy of the mission explorer inside the main app.
- `ldem_16_uint.tif` (33 MB): not referenced by any code.
- `START_SERENITY.cmd`, `serve.cjs`, `serve.ps1`: replaced by one cross-platform server.
- `prototype/`: the frozen vanilla prototype is not imported.

The original folders are **copied from, never changed or deleted**.

## Target layout

```
Serenity/
├─ package.json            npm workspaces: apps/*; scripts: dev, build, start, test, lint
├─ .gitattributes          Git LFS rules for the large textures
├─ .gitignore  .nvmrc?     node_modules, dist, test-results
├─ README.md               Run guide, ports, layout, how to add an app
├─ apps/
│  ├─ home/                ← serenity-continuous-motion/site (index.html, home-assets/, icons)
│  ├─ explorer/            ← clps-3d-lunar-explorer (source; Vite, base /explorer/)
│  ├─ missions/            ← lunar-mission-explorer (static)
│  └─ payloads/            ← payload-explorer (Vite, base /payloads/; history kept)
├─ tools/
│  ├─ build-site.mjs       Builds every app with its base path and assembles dist/
│  ├─ copy-static.mjs      "Build" for the two static apps (copy src → dist)
│  └─ serve.mjs            Cross-platform static server (replaces serve.cjs/.ps1/.cmd)
├─ e2e/                    Cross-app integration tests (Playwright)
└─ docs/                   ARCHITECTURE.md, MIGRATION.md (sources, drops, baselines)
```

Assembled output (`dist/`): `index.html` (home) at the root; `explorer/`, `missions/`, `payloads/` below it.

## URLs and ports

| URL | App | Notes |
|---|---|---|
| `/` | home | Port 8095 for the assembled site, as before (`SERENITY_PORT` overrides). |
| `/explorer/` | 3D explorer | No router. Reads `?frame=`, `?exaggeration=`, `?footprint=`. Textures resolve through `import.meta.env.BASE_URL`, so the sub-path works. |
| `/missions/` | mission explorer | `#<mission id>` deep links. |
| `/payloads/…` | payload explorer | React Router `basename` already supports a base path. The server sends unknown paths under `/payloads/` to `/payloads/index.html` (SPA fallback). |

Per-app development keeps today's ports: explorer 5173, payloads 5174 (strict). `npm start` builds and serves the whole site on 8095.

## Work plan

### Phase 0: baseline and prerequisites (before anything is copied)
1. **Record how each original app behaves today** so the merge can be compared against it: explorer `npm run build` and `node --test` (README claims 320 tests, 302 pass, 18 skipped, and says `build` was never run); payload explorer unit and e2e results (44 unit tests; browser suite); home and missions: screenshots at 1440 px and 375 px.
2. **Payload explorer has uncommitted work** (the Bricolage Grotesque header font in `index.html` and `components.css`, and `e2e/header-font.spec.ts`). I will commit it in `payload-explorer` first, so it comes through in the imported history. If you would rather not, I import its working tree as a plain copy and its history is not preserved.
3. Verify by checksum that `site/textures/*` equals `clps-3d-lunar-explorer/public/textures/*` before dropping the main-app copy.

### Phase 1: repo skeleton
`git init -b main` in `Serenity/`, root `package.json` (workspaces), `.gitignore`, `.gitattributes`, `git lfs install --local`. LFS tracks `apps/explorer/public/textures/moon_color_16k.jpg` and `ldem_16_uint.raw` (38.8 MB and 33 MB). The smaller textures (2k and 8-bit JPEGs) stay plain git. Commit.

### Phase 2: import the apps
- **payloads:** `git subtree add --prefix=apps/payloads <payload-explorer> main` (keeps its 7+ commits). `public/data/catalogue.json` is generated (gitignored), so it is rebuilt by `predev`/`prebuild`.
- **explorer:** copy source, excluding `node_modules`, `dist` and `ldem_16_uint.tif`. Keep `docs/`, `scripts/`, tests.
- **missions:** copy the standalone folder (the newer, Serenity-branded version) into `apps/missions/src/`.
- **home:** copy `index.html`, `home-assets/` (without `launch-workspace.js`), `favicon.svg`, `icons.svg` into `apps/home/src/`.
- One commit per app. Package names become `@serenity/home`, `@serenity/explorer`, `@serenity/missions`, `@serenity/payloads`. **Each app's dependency versions stay exactly as they are** (explorer on Vite 8 / TypeScript 6 / oxlint, payloads on Vite 7 / TypeScript 5.9 / ESLint); aligning them is a follow-up, so the import cannot change behaviour.

### Phase 3: workspace wiring
- `apps/home` and `apps/missions` get a tiny `package.json` with `build` → `tools/copy-static.mjs` (no bundler; their classic scripts and `?v=` cache-busting stay as they are).
- `apps/explorer`: add `"test": "node --test \"src/**/*.test.ts\""` (it has none today; Node 24 is installed, 22.6+ is required).
- Root scripts: `dev:<app>`, `build` (runs `tools/build-site.mjs`), `start` (build + serve), `test` and `lint` (run each workspace's own, `--if-present`).
- `npm install` once at the root; confirm each app still builds on its own.

### Phase 4: assembly, server and cross-links
- **`tools/build-site.mjs`:** builds `explorer` with `VITE_BASE=/explorer/` and `payloads` with `VITE_BASE=/payloads/`, runs the static copies, and assembles `dist/`. It passes `VITE_BASE` through Node's `env`, not a shell command: Git Bash on Windows rewrites `/lunar/` into a Windows path (this bit us before).
- **`tools/serve.mjs`:** a port of `serve.cjs` (127.0.0.1:8095, GET/HEAD only, 403 on path traversal, 404/405, `nosniff`, directory → `index.html`) plus the `/payloads/` SPA fallback. No browser auto-open via `cmd.exe`.
- **Home → apps:** set `destinations` in `home.js` to `./explorer/`, `./missions/`, `./payloads/` (relative, so a sub-path host still works). Verify that the existing link-replacement code keeps the `.feature-link` button styling on the new `<a>` elements.
- **Apps → home** (small, deliberate code changes):

| App | Change |
|---|---|
| payloads | `config.ts`: `serenityUrl` falls back to the parent of its base path (`/payloads/` → `/`) when `VITE_SERENITY_URL` is not set; standalone dev keeps working through a `.env.development` pointing at `http://127.0.0.1:8095/`. |
| missions | Brand links `href="./"` (header, footer, about dialog) → `href="../"`. |
| explorer | `SerenityMark` (a non-interactive `role="img"` group) becomes a link to the site root, built from `import.meta.env.BASE_URL`. `index.html` title becomes "Serenity · 3D Lunar Explorer". The Vite template leftovers (`App.css`, `index.css`, `app-stage4.css`, unused assets) are **listed in MIGRATION.md but not removed** in this step. |

### Phase 5: verification and docs
- **Per app:** payloads: typecheck, lint, 44 unit tests, browser suite; explorer: `tsc -b && vite build`, oxlint, node tests. Results compared with the Phase 0 baseline.
- **Integration e2e (new, `e2e/`, Playwright):**
  - Home loads; each of the three buttons becomes a link and opens the right app.
  - Each app has a working way back to `/`.
  - `/payloads/payload/13?tab=images` survives a reload (SPA fallback); the payloads typeahead and tab URL sync still work under `/payloads/`.
  - `/explorer/` renders its canvas and loads the 16k texture (no 404 on `/explorer/textures/…`).
  - `/missions/` lists missions; `/missions/#<id>` deep link selects one.
  - No console errors on any of the four apps' first load (external image-host failures excluded).
- **Visual check** of all four apps at 1440 px and 375 px against the Phase 0 screenshots.
- **Repo checks:** `git lfs ls-files` shows the two large textures; `git count-objects -vH` stays small; a fresh `git clone` + `npm install` + `npm start` works.
- **Docs:** root `README.md`; `docs/ARCHITECTURE.md` (layout, URLs, ports, base paths, how to add an app); `docs/MIGRATION.md` (what came from where, what was dropped, baselines, cleanup candidates). The payloads docs travel with it (`apps/payloads/docs/`); their `app/` paths are noted as historical.
- Commit per phase in the new repo. **Local only: no remote is configured and nothing is pushed.**

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Features in the old bundle are lost | Listed above for your confirmation; the bundle and the original folders stay untouched, so nothing is unrecoverable. |
| Absolute paths (`/favicon.svg`, `/textures/...`) break under `/explorer/` | The explorer already uses `BASE_URL` for textures; Vite prefixes the base on `public/` links in `index.html`. The integration test asserts there are no 404s. |
| Two Vite/TypeScript versions in one workspace | Each app keeps its own pinned versions (npm nests them). Alignment is a separate, tested follow-up. |
| Git LFS needs LFS support on any remote | Noted in README. No remote exists yet. |
| The explorer's tests have never been run on this machine, and its build is unverified | Phase 0 baselines them before import, so a failure is known to predate the merge. |
| Explorer imports `index.css` (light theme, purple accent) at startup | Left as is: the import must not change behaviour. Listed as a cleanup candidate. |
| `git subtree` rewrites commit hashes | Expected; the payloads history keeps its messages and order. |

## Not in this plan (follow-ups, each needs its own go-ahead)

- Align React, Vite, TypeScript and the linter across the apps.
- Shared design package (tokens, self-hosted fonts including the Bricolage Grotesque brand font) and one consistent header/wordmark.
- Port the home page and mission explorer to React + TypeScript.
- Merge the duplicated mission data (the explorer's `missionCatalogue.ts` and the missions app's `catalog.js`).
- Remove the explorer's leftover Vite-template files.

## Verification (end to end)

1. `npm install && npm start` from `Serenity/`: the site opens on `http://127.0.0.1:8095/`.
2. Click each of the three buttons: the matching app opens and its way back leads home.
3. `npm test` (all workspaces) and `npx playwright test` (integration) pass.
4. Compare screenshots and test counts with the Phase 0 baseline in `docs/MIGRATION.md`.
5. `git lfs ls-files` lists the two large textures; `git status` is clean.
