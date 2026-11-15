# Lunar Payloads Explorer (React app)

Explore the 320 scientific payloads carried by, or proposed for, lunar missions. Companion app to Serenity Lunar Explorer.

Built with Vite, React 19, React Router 7 and TypeScript.

## Run it

```bash
npm install
npm run dev            # http://127.0.0.1:5174/
```

`dev` and `preview` use port **5174**. Serenity uses 5173, so the two can run side by side.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (rebuilds the catalogue index first) |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm run preview` | Serves `dist/` on port 5174 |
| `npm run catalogue` | Regenerates `public/data/catalogue.json` |
| `npm run catalogue:check` | Fails if the index is out of date |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright). Needs `npm run build` first, or it builds for you |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SERENITY_URL` | `http://localhost:5173/` | Target of the "Back to Serenity" link |
| `VITE_BASE` | `/` | Sub-path the app is hosted under, for example `/lunar/` |

Set them in a `.env.local` file or on the command line.

## Content

| Path | Contents |
|---|---|
| `content/lunar_payloads_catalogue.md` | Source of truth for the 16 categories and 320 payload names |
| `content/category-meta.json` | Category descriptions and icons |
| `public/data/payloads/NNN_<name>_payload.json` | One article per payload, matched by the number at the start of the name |
| `public/data/catalogue.json` | **Generated.** Do not edit; run `npm run catalogue` |

### Adding or updating a payload article

1. Save the JSON as `public/data/payloads/NNN_<snake_case_name>_payload.json`, using the number from the catalogue (for example `013_fluxgate_magnetometer_payload.json`).
2. Run `npm run catalogue`, or simply `npm run dev` (it regenerates the index first).
3. The article appears automatically. No code change is needed.

A file that does not match the pattern is ignored by the build, so check the warnings the build prints.

## Hosting

The app is a single-page app with clean URLs (`/payload/13`). The host must send requests for paths that are not files to `index.html`:

- **Dev and preview:** handled by Vite.
- **Static hosts:** add a rewrite rule, for example `/*  /index.html  200` on Netlify or an equivalent on other hosts.

## Tests

- `npm test` runs unit tests (search, formatting, URLs, catalogue model, article sections) and component tests.
- `npm run test:e2e` runs the browser suite (Playwright): browse flow, payload page, responsive layout, accessibility scans (axe, WCAG 2.2 A/AA), tab behaviour, and a smoke test that opens all 320 payload pages.
  - Use an installed Chrome with `PW_CHANNEL=chrome npm run test:e2e`. Otherwise run `npx playwright install chromium` once.
  - Checks for a sub-path build: `SUBPATH_URL=http://127.0.0.1:5180/lunar/` (after building with `VITE_BASE=/lunar/`).
  - Parity screenshots against the prototype: `PROTO_URL=http://127.0.0.1:8765/`.

See `docs/05-react-app.md` for the results and the differences from the prototype.

## Security notes

- Payload text is rendered as text only. `dangerouslySetInnerHTML` is banned by lint (`react/no-danger`).
- Links and images are only allowed for `http` and `https` URLs.
- Test-only dependencies (Vitest and its helpers) have known audit advisories. They do not ship to the browser; `npm audit --omit=dev` reports none.

## Project history

The earlier vanilla-JavaScript prototype is kept in the project's `prototype/` folder as a reference. The requirement and design documents, the React migration plan and the results are in `docs/` (`01` to `05`).
