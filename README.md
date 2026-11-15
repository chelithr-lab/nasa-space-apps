# Serenity

One site for the lunar explorers:

| Path | App | Stack |
|---|---|---|
| `/` | Home page | Static HTML, CSS, JavaScript |
| `/explorer/` | 3D Lunar Explorer | React 19, Three.js, Vite 8, TypeScript 6 |
| `/missions/` | Mission Explorer | Static HTML, CSS, JavaScript |
| `/payloads/` | Payload Explorer | React 19, React Router 7, Vite 7, TypeScript 5.9 |

Each app keeps its own dependencies and its own tests. This repository assembles them into one site.

## Requirements

- Node.js 22.6 or later (the 3D explorer's tests run TypeScript directly)
- npm 10 or later
- Git with Git LFS (the two large Moon textures are stored with LFS)

## Get the code

```bash
git lfs install            # once per machine
git clone <repo>
cd Serenity
git lfs pull               # fetches the large textures, if the clone did not
npm install                # installs every app (npm workspaces)
```

## Run the whole site

```bash
npm start                  # builds every app into dist/ and serves it on http://127.0.0.1:8095/
```

Set `SERENITY_PORT` to use another port. The server only listens on `127.0.0.1`.

Build without serving:

```bash
npm run build              # writes dist/
node tools/serve.mjs       # serves dist/
```

## Develop one app

| Command | Address |
|---|---|
| `npm run dev:explorer` | http://127.0.0.1:5173/ (the 3D explorer, its own dev server) |
| `npm run dev:payloads` | http://127.0.0.1:5174/ (the payload explorer, its own dev server) |

The home page and mission explorer are static: change their files in `apps/home/src` or `apps/missions/src` and rebuild with `npm run build`.

## Tests

| Command | What it runs |
|---|---|
| `npm test` | Every app's unit tests (3D explorer: node tests; payload explorer: Vitest) |
| `npm run lint` | Every app's linter |
| `npm run test:e2e` | Integration tests across the assembled site (Playwright) |

For the browser tests, `PW_CHANNEL=chrome` uses an installed Google Chrome. Otherwise run `npx playwright install chromium` once.

## Layout

```
apps/
  home/         Home page (static)
  explorer/     3D Lunar Explorer (Vite app, base /explorer/)
  missions/     Mission Explorer (static)
  payloads/     Payload Explorer (Vite app, base /payloads/)
tools/
  build-site.mjs   builds each app with its base path and assembles dist/
  copy-static.mjs  copies the static apps
  serve.mjs        static server with the /payloads/ client-side fallback
e2e/            integration tests across the apps
docs/           plan, migration notes, baselines
```

Each app's own documentation is in its folder (for example `apps/payloads/docs/`).

## How the apps link together

- The home page's three "Open … Explorer" buttons link to `./explorer/`, `./missions/` and `./payloads/`.
- Each app links back to the home page: the 3D explorer's wordmark, the mission explorer's header and the payload explorer's "Back to Serenity" button all go to the site root. The payload explorer finds the root from its base path; in standalone development it uses `apps/payloads/.env.development`.

## Adding another app

1. Create `apps/<name>/` with a `package.json` (its name `@serenity/<name>`).
2. Vite app: make its config read `base` from `process.env.VITE_BASE`, then add a `buildViteApp(...)` call in `tools/build-site.mjs` with base `/<name>/`. Static app: add a `copyStatic(...)` call there.
3. Link to it from the home page and back to the home page.
4. Add an integration check to `e2e/site.spec.ts`. See `docs/ARCHITECTURE.md`.

## Deployment

`dist/` is plain static files, but two rules matter:

- Serve the whole `dist/` folder at the web root (or set `VITE_BASE` to the sub-path when building).
- The payload explorer uses client-side routes under `/payloads/`. The host must send requests for those paths to `/payloads/index.html`. `tools/serve.mjs` does this; other hosts need a rewrite rule.

## Repository notes

- Nothing is pushed anywhere. No remote is configured yet.
- The history of `apps/payloads` comes from the original `payload-explorer` repository through `git subtree`. The other apps start from the imported files.
- See [docs/MIGRATION.md](docs/MIGRATION.md) for what came from where, what was left behind, and the baselines.
