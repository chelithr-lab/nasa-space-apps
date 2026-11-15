# Real LOLA terrain on the Moon: what the code does and what is unverified

## What I found in your source (not what I assumed)
Terrain was already connected in your `moonScene.ts`: it loaded `ldem_16_uint.raw`, called `buildTerrainMesh` at exaggeration 1 on a 256x128 mesh, and used the isotropic footprint unless the address had `?footprint=current`. It had no status, failed silently, and the chip still said "No terrain / shadows yet". This package finishes that work. It does **not** touch `lunarElevation.ts` or its tests.

## What changed
| File | Change |
|---|---|
| `src/sim/terrainConfig.ts` (new) | File name, raster size, exaggeration setting, footprint rule, byte-length check, status wording. Pure code, tested. |
| `src/sim/terrainIntegration.test.ts` (new) | 9 tests (see below). |
| `src/render/textures.ts` | New `loadNasaMoonElevation()` returns data or a reason: HTTP status, exact byte length (33,177,600), decoding errors. Old `loadNasaMoonElevationData()` kept as a wrapper. |
| `src/render/moonScene.ts` | Terrain status callback (4th constructor argument, optional); terrain written into the existing buffers in place (no second geometry); errors caught; corrupted degree labels (`0â”¬â–‘`) fixed to `0°`, `90°E`, `90°W`, `180°`; BOM removed. Marker clicking, shadows and everything else kept. |
| `src/ui/MoonViewport.tsx` | Shows the terrain status chip; replaces the now-false "No terrain / shadows yet" chip. |
| `src/ui/InfoPanel.tsx` | One line: "Terrain: Not built" is now an honest "Level 4" description. |

## Units and exaggeration
Heights stay in metres (`(count - 20000) / 2`, above the 1737.4 km sphere, not sea level). At the rendering boundary only: `sceneRadius = 1 + exaggeration * metres / 1,737,400`. Default exaggeration is **1.5**; add `?exaggeration=1` (true scale) to the address, allowed range 0 to 2. The cap exists because markers sit at 1.012 and the highest pixel (+10685.5 m) reaches 1.0123 at 2x. Astronomy, distances and mission coordinates are not affected.

## Status meaning
- **loading**: file requested; the Moon is smooth.
- **active**: set only after load, size check, decode, mesh build and buffer update all succeeded. The chip tooltip shows the height range and says orientation is unverified.
- **unavailable**: tooltip gives the reason (missing file, wrong size, error). The smooth sphere stays and is labelled as such.

## Orientation: what is and is not established
Assumed by BOTH the raster code and the mesh: row 0 = north, column 0 starts at longitude -180, east to the right; mesh uv.u = (lon+180)/360. A test confirms a bump placed at a given latitude/longitude is raised exactly in the direction `toScene(latLonToUnit(lat, lon))` that markers use, and that the mesh UVs match the same rule. **That proves the code is self-consistent. It does not prove the real file follows these assumptions.** East-west mirroring is still unverified until you compare the near side in the browser.

## Browser checklist
1. Open the app, DevTools Console: no red errors. Console prints "NASA lunar terrain active: ...".
2. Chip shows "Terrain: loading", then "Terrain: LOLA active, relief exaggerated 1.5x". Rename the .raw file temporarily: chip must say "unavailable" with a reason (restore it afterwards).
3. Near side: Mare Imbrium, Mare Serenitatis, Tycho and Copernicus should sit on the matching colour features. Mirror-image placement means the east-west assumption is wrong: tell me.
4. Far side: the South Pole-Aitken basin (deep, around -70 deg, -170 deg) should look low.
5. Look at +/-180 degrees longitude (far side): no crack along the seam.
6. North and south pole views: no spikes. The isotropic rule is the default; `?footprint=current` shows the older rule.
7. Camera presets, time controls, mission markers and dossiers work; a marker click still opens its dossier.
8. Rotate and play time on the laptop: it should stay smooth. The terrain is built once, not per frame.
Try `?exaggeration=1` and `?exaggeration=2` too.

## Not verified
- `npm run build`, `npm run lint` and the real WebGL render (no npm registry or three.js here).
- Loading the real 33 MB file.
- Everything in the checklist above.
