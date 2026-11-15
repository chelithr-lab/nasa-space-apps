# Architecture

## Shape of the system

Serenity is one static site built from four apps. Each app is built with its own toolchain and tested on its own. `tools/build-site.mjs` puts their output side by side in `dist/`, under one origin:

```
dist/
├─ index.html, home-assets/, favicon.svg, icons.svg   home page            (static)
├─ missions/                                           mission explorer   (static)
├─ explorer/                                           3D lunar explorer  (Vite, base /explorer/)
└─ payloads/                                           payload explorer   (Vite, base /payloads/)
```

Separate HTML documents keep the apps apart. Their CSS, global variables and routers never meet, which is why the apps are not merged into one React application.

## Apps

| App | Path | Toolchain (pinned in its own `package.json`) | Tests |
|---|---|---|---|
| Home page | `apps/home` | none (static) | integration only |
| 3D lunar explorer | `apps/explorer` | React 19, Three.js, Vite 8, TypeScript 6, oxlint | 379 Node tests |
| Mission explorer | `apps/missions` | none (static, classic scripts) | integration only |
| Payload explorer | `apps/payloads` | React 19, React Router 7, Vite 7, TypeScript 5.9, ESLint | 44 Vitest unit tests, 41 Playwright browser tests |

Shared at the root: `tools/`, `e2e/` (cross-app Playwright), and one lockfile.

## Dependency placement

npm workspaces hoist shared packages. Two Vite majors and two React plugin majors are needed, so the root pins the versions the payload explorer and the test runner use, and the 3D explorer keeps its own:

| Package | Root (`node_modules`) | Nested |
|---|---|---|
| `vite` | 7.3.8 (payload explorer, Vitest) | `apps/explorer/node_modules/vite` 8.3.8 |
| `@vitejs/plugin-react` | 5.2.0 (payload explorer) | `apps/explorer/node_modules/@vitejs/plugin-react` 6.3.0 |
| `react` | 19.3.1 | — |

Without the root pins, npm hoisted Vite 8 to the root. Vitest 3 then ran on Vite 8, and the explorer's React plugin 6 imported an internal API from the wrong Vite. Both were build failures.

## Base paths and URLs

| URL | App | How the base is set |
|---|---|---|
| `/` | home | root |
| `/explorer/` | 3D explorer | `VITE_BASE=/explorer/` in `build-site.mjs`; `vite.config.ts` reads `process.env.VITE_BASE`. Textures and assets resolve through `import.meta.env.BASE_URL`. |
| `/missions/` | mission explorer | folder copy, no base needed; the header link is `../` |
| `/payloads/` | payload explorer | `VITE_BASE=/payloads/`; React Router `basename` is derived from `BASE_URL` |

`build-site.mjs` passes base paths through the child process environment, not a shell command. Git Bash on Windows otherwise rewrites values such as `/payloads/` into a Windows path.

## Links between the apps

- Home → apps: the three "Open … Explorer" buttons (`home-assets/home.js`, `destinations`) link to `./explorer/`, `./missions/`, `./payloads/`.
- Apps → home: the explorer's wordmark (`SerenityMark`, from `BASE_URL` one level up), the mission explorer's header brand (`../`), and the payload explorer's "Back to Serenity" (`config.ts`, from `BASE_URL`; `VITE_SERENITY_URL` overrides it, and `apps/payloads/.env.development` points it at the assembled site in standalone development).

## Serving

`tools/serve.mjs` serves `dist/` on `127.0.0.1` (port 8095, or `SERENITY_PORT`):

- GET and HEAD only (405 otherwise); 403 for paths outside `dist/`; 404 for missing files; directory requests serve `index.html`.
- Headers: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
- Under `/payloads/`, a path that is not a file is answered with `payloads/index.html`, so the payload explorer's client-side routes survive a reload.

## Development ports

| App | Command | Port |
|---|---|---|
| Whole site | `npm start` | 8095 |
| 3D explorer, dev server | `npm run dev:explorer` | 5173 (Vite default) |
| Payload explorer, dev server | `npm run dev:payloads` | 5174 (strict) |
| Playwright integration tests | `npm run test:e2e` | 8095 (builds and serves the site itself) |

## Large files

Two textures are stored with Git LFS (`.gitattributes`): `moon_color_16k.jpg` (39 MB) and `ldem_16_uint.raw` (33 MB). A clone made with Git LFS installed gets the real files. On a machine without LFS the clone holds small pointer files instead; install Git LFS and run `git lfs pull` to fetch the real ones, or the 3D explorer's texture requests fail.

## Adding an app

1. Create `apps/<name>/` with a `package.json` whose name is `@serenity/<name>`.
2. Vite app: make its config read `base` from `process.env.VITE_BASE`, then add a `buildViteApp(...)` call in `tools/build-site.mjs` with base `/<name>/`.
   Static app: add a `copyStatic(...)` call in `tools/build-site.mjs`.
3. Link to it from the home page (`apps/home/src/home-assets/home.js`) and back.
4. Add a check to `e2e/site.spec.ts`.
5. If it needs a different Vite or React version than the root, install it inside its own folder so npm nests it.
