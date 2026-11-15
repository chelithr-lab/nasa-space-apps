# Lunar Solar Intelligence, first release (Priorities 1 and 2 plus visual core)

**Review first; nothing here touches your project until you copy it.** Read `docs/SOLAR_INTELLIGENCE.md`.

## IMPORTANT: this package also contains the IAU Moon-frame change
Solar analysis needs the real lunar orientation, so the app now defaults to the IAU rotational-elements frame instead of the simplified one. This moves the Sun relative to the Moon (up to about 8 degrees of longitude), so the **lighting on the globe will look different from before**. To compare or undo: add `?frame=approximate` to the address. Files: `lunarOrientation.ts`, `frameModel.ts`, `liveCompute.ts`, `simSnapshot.ts`, `moonFrame.ts`, `InfoPanel.tsx` (+ test). I do not have a record of delivering these earlier, so they are included.

## New files
`src/sim/solarSite.ts`, `solarPower.ts`, `solarScan.ts`, `solarView.ts`, `solarTestSupport.ts` (tests only), four `solar*.test.ts`, `src/ui/useSolarSite.ts`, `src/ui/SolarPanel.tsx`, `src/styles/solar.css`, `docs/SOLAR_INTELLIGENCE.md`.
## Modified (complete files)
`src/render/moonScene.ts` (click-to-select in Illumination mode, selected-site marker, raster getter; one new constructor argument at the end), `src/ui/MoonViewport.tsx`, `src/modes/visualisationModes.ts` and `src/sim/visualisationModes.test.ts` (Illumination is now "available": the test asserts exactly Normal, Elevation, Illumination), plus the frame files above.
**Compatibility:** built on your source + terrain + geography + elevation packages. If you changed any modified file since, send it to me instead of overwriting.

## Install (Windows CMD)
```
cd /d C:\Users\danid\clps-3d-lunar-explorer
mkdir _backup_lsi
xcopy /E /I src _backup_lsi\src
tar -xf clps-solar-intelligence.zip
node --test src/sim/*.test.ts src/astro/*.test.ts src/core/*.test.ts
npm run build
npm run dev
```
## Roll back
```
rmdir /S /Q src
xcopy /E /I _backup_lsi\src src
```
(then delete `docs\SOLAR_INTELLIGENCE.md`)

## What I ran (sandbox)
- `node --test` on all `src/sim`, `src/astro`, `src/core` tests: **320 tests, 302 pass, 0 fail, 18 skipped** (all need `astronomy-engine`, not installed here).
- Strict type check of every new/changed file: clean except errors caused by missing three.js / astronomy-engine / vite types in my sandbox. Two real strict-mode errors (an unused variable and an unused test parameter) were found by this and fixed.
- Chromium with a stand-in Moon, a synthetic raster with one ridge, and a Meeus-based Sun (not astronomy-engine): 20 UI checks pass (no panel in Normal; click-to-select only in Illumination; panel shows coordinates, elevation, azimuth, power stages, energy, events, sky plot, graph; panel changes keep the site; an event click and +3 d move the one shared clock; a new click replaces the site and keeps panel settings; leaving the mode clears it; invalid efficiency is reported).
## Not run
`npm run build`; astronomy-engine-backed tests; real WebGL click-picking; real LOLA terrain horizons; performance on your laptop (the two background scans of 60 days and the energy period each take a few seconds at most in my sandbox, with a progress message; please tell me what you see).
