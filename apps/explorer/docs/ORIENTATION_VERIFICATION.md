# Verified Geography: orientation checks and the coordinate readout

Read on 2026-10-29/31. "Documented" means a page states it. Nothing below was measured on your real raster by me.

## 1. Source conventions

| Item | Finding | Status |
|---|---|---|
| Product | NASA SVS 4720 CGI Moon Kit, `ldem_16` (a repackaging of LRO LOLA LDEM_16) | [SVS 4720](https://svs.gsfc.nasa.gov/4720) |
| Centre of the maps | SVS: colour map "centered on 0° longitude"; displacement maps (64, 16, 4 px/deg) "centered on 0° longitude" | **Documented.** This is why column 0 is assumed to start at -180°. |
| Native PDS product | The project's `src/modes/demSources.ts` records the ODE page as describing LDEM_16 tiling 0 to 360 (I did not re-read that line this session). If so, the SVS file is a re-centred copy, and a 180° shift is a real risk the checker tests for | Recorded earlier, not re-verified |
| Longitude direction (SVS file) | Not stated on the pages read | **Not stated.** Tested by evidence only |
| Row order (SVS file) | Not stated on the pages read | **Not stated.** Tested by evidence only |
| Gazetteer longitude convention | Tsiolkovskiy page: "+East, from -180 to 180"; coordinate system labelled "Planetographic" | [USGS](https://planetarynames.wr.usgs.gov/Feature/6108). The label is recorded as-is; I did not establish whether it matters at the 0.1° level |
| Height formula | `(count - 20000) / 2` m above the 1737.4 km sphere | Derived/tested in the project; not printed verbatim by NASA |

## 2. Landmarks and how good each one is

| Landmark | Coordinates used | Source | Tier |
|---|---|---|---|
| Tsiolkovskiy | 20.38 S, 128.97 E, 184.39 km | [USGS Gazetteer](https://planetarynames.wr.usgs.gov/Feature/6108) | **Gazetteer** |
| Tycho | 43.31 S, 11.36 W, ~85 km | [Wikipedia](https://en.wikipedia.org/wiki/Tycho_(lunar_crater)) (no source cited) | Secondary. The Gazetteer page could not be fetched |
| Copernicus | 9.62 N, 20.08 W, ~93 km | [Wikipedia](https://en.wikipedia.org/wiki/Copernicus_(lunar_crater)) (no source cited) | Secondary. The Gazetteer page could not be fetched |
| Highest point | 5.4125 N, 158.6335 W (201.3665 E) | [LROC post](https://lunarnetworks.blogspot.com/2010/10/lroc-highest-point-on-moon.html?m=1) | Secondary |
| Lowest point | 70.368 S, 172.413 W (Chang'e-1) / 70.43 S, 187.42 E (Kaguya) | [Wikipedia, Antoniadi](https://en.wikipedia.org/wiki/Antoniadi_(lunar_crater)) | Secondary |
| Shackleton | about 89.7 S (Gazetteer lists -89.67 to -89.90) | [USGS](https://planetarynames.wr.usgs.gov/Feature/5450) | Not used as pass/fail: longitude is almost undefined at the pole, so it cannot test east-west |

Developer-reported: the checker earlier found the lowest pixel at -70.34, -172.47 and the highest at +5.41, -158.66. Those agree with the table to about 0.1 degrees. That is evidence, not proof.

## 3. What the checker does (and cannot do)
`node scripts/check-orientation.ts` tests five hypotheses: the code's convention, east-west mirror, north-south flip, 180° shift, mirror + flip.
1. **Extrema:** where the raster's highest and lowest pixels are, against the table above.
2. **Craters:** "rim minus floor" height at each crater (median of rings at 0.9, 1.0, 1.1 radii minus median inside 0.4 radius), compared with the same measure at every 3° of longitude along that parallel. The hypothesis whose positions stand out most wins.

The verdict is **consistent-with-code** only if both agree with a margin; **contradicts-code** only if both point at the same defect; otherwise **inconclusive**.

Limits (also printed by the script): two extrema are two points; craters can be imitated; **the margins and thresholds were tuned and tested on synthetic rasters only and have not been run on your real data, so a result of "inconclusive" is possible and honest**; the checker never tests the colour texture. Brightness-versus-elevation correlation is NOT used.

Run it (read-only):
```
node scripts/check-orientation.ts
```
Exit code 0 = consistent, 2 = inconclusive, 1 = contradicts or file problem. Please send me the full output.

## 4. Colour texture orientation: UNRESOLVED
No page read states the colour map's east direction or row order, and I cannot open your JPEG. Use the readout (below) as the independent check:
1. Start the app, near-side view. Move the pointer onto the centre of Tycho (the bright crater with rays in the southern highlands).
2. The readout must say about **43.3° S, 11.4° W**. Repeat for Copernicus (**9.6° N, 20.1° W**, dark-floored crater with rays, west of centre). Far-side view: Tsiolkovskiy (**20.4° S, 129.0° E**, dark floor with a central peak).
3. If a feature sits at the mirrored or flipped coordinates, the texture and the mesh disagree. Tell me which; do not rotate anything yourself.
The readout takes its coordinates from the mesh under the pointer, and the texture is mapped onto the same mesh, so this tests the texture against the app's coordinate system.

## 5. The coordinate readout
Panel "Surface point" (bottom right). Latitude and longitude (east positive; the seam shows as 180°; at the poles it says longitude is undefined), and height in metres above the 1737.4 km reference sphere, **sampled from the raster by bilinear interpolation between cell centres**, not read from the drawn mesh, so it is the un-exaggerated real value. Rounded to 10 m and 0.1°, because the cells are 1.9 km area means and their vertical accuracy is not stated by the pages read. Off the Moon it shows a prompt; while dragging it is hidden. One raycast per animation frame at most.

## 6. Not tested here
`npm run build`; the real WebGL render; the real raster and texture; the speed of the pointer raycast on your laptop (it checks about 65,000 triangles per frame while the pointer moves).
