# Terrain Visibility Foundation (Stage 1)

New files only; no existing production file is modified:
`src/sim/heightField.ts`, `src/sim/terrainVisibility.ts`, `src/sim/terrainVisibility.test.ts`, this document.

## Architecture
- `HeightField` is the single abstraction for terrain: `heightMetres(lat, lon) -> number | null` (null = no data), `bounds`, `effectiveSpacingKm`, `maxHeightM/minHeightM`, `revision`, `provenance`. Nothing in the engine knows about rasters.
- `rasterHeightField(raster)` adapts the current global LOLA LDEM_16 raster (bilinear, never null). `functionHeightField(...)` builds synthetic terrain for tests (provenance says "Not lunar data").
- `terrainVisibility(field, site, sunDirMoonFixed, options)` is independent of `computeHorizonProfile`.
- `VisibilityCache` is an LRU keyed by field id + revision + site + Sun direction + options. A mutable source must bump `revision`.
- Future tiled/high-resolution sources only need to implement `HeightField` (and honour `revision`).

## Mathematics
Moon-fixed frame: X to (0N,0E), Y east, Z north. Observer P = (R + h_ground + h_observer)·u, R = 1737.4 km. Ray Q(s) = P + s·d, d = unit Sun direction. At each sample, the ray radius |Q| is compared with the terrain surface radius R + h at the sub-point, so curvature is inherent (no flat-plane approximation).
Exact stop: for s > −P·d the ray radius only grows; once |Q| ≥ R + maxHeight nothing can block. Tangent reach ≈ sqrt(2·R·H) ≈ 190 km for H = 4 km.
Sun elevation e is measured against the local horizontal at the observer. Dip = acos(R/|P|) (0 if |P| ≤ R).

## Classification
- e ≤ −dip: geometric-darkness (no march).
- Blocked and e ≤ 0: geometric-darkness (the ground itself blocks; this is not "terrain shadow").
- Blocked and e > 0: terrain-obstruction.
- Clear: direct-sunlight (`belowLocalHorizon: true` when e ≤ 0 — an elevated observer seeing past the tangent).
- Missing data: unknown, unless an obstruction was already found.
- Sample budget exhausted: unknown.
Status is for the Sun's centre. The Sun-disc fraction treats the horizon as straight (circular segment) and is approximate.

## Sampling
Step = 0.5 × field.effectiveSpacingKm; first blocked distance refined by 24-step bisection. Azimuth-free, so no special-casing at the poles. Results are cached; no per-frame work.
`terrainHorizonDeg` covers only the reachable part of the ray for that Sun elevation; probe with a grazing Sun (~0.05°) for the full horizon.

## Missing data
Null samples are counted (`sampling.missingSamples`). A gap only matters if no obstruction has been found; then the result is `unknown`, never "lit".

## Polar design
Azimuth-free formulation; lat/lon only used for sampling with `moonFixedKmToGeo` (lon 0 at a pole). Tested: crater centred on the south pole, ±90° and ±89.9999°. Heights are true metres, independent of display exaggeration.

## Limitations (read before use)
- A single-instant result says NOTHING about permanent shadow or permanent illumination. PSR/illuminated-rim claims need long-term Sun sweeps and suitable data.
- Current source (LDEM_16) is a 1.9 km area mean with unknown vertical accuracy; real crater walls/small peaks are not resolved. At the poles that is far too coarse for decisions. SLDEM2015 is limited to ±60° latitude; poles need polar LOLA products or LROC NAC DTMs (not integrated; not downloadable from the build sandbox).
- Sun is a disc; status uses its centre. No atmosphere/dust, no Earth-shine, no secondary illumination, no ephemeris uncertainty.
- Orientation of the raster: check-orientation = CONSISTENT-WITH-CODE (supporting evidence, not proof). Colour texture orientation is a separate unresolved issue.

## Performance (sandbox, Node 22, x64 Xeon 2.1 GHz x2; NOT the target i5-8265U)
Full 5760×2880 synthetic raster, ms per call: equator 0.04; mid-lat 0.05; polar 0.03–0.09 (63–134 samples). Field build (min/max scan) 48 ms once. Cache hit ≈ 2 µs. 1,440 consecutive polar calls ≈ 43 ms; 360-azimuth grazing horizon ≈ 6 ms; old `computeHorizonProfile` ≈ 11–16 ms. Measured by `scratchpad/perf-visibility.ts`; the target laptop is untested and likely several times slower.

## Tests
`node --test src/sim/terrainVisibility.test.ts`: 19 tests (flat, ridge, ridge outside Sun direction, Sun sweep, curvature, elevation, coordinates, missing data, budget, thin ridge, exaggeration independence, polar crater, polar safety, cross-check vs old horizon, cache, validation).

## Stage 2 can build on
Shared HeightField as the single terrain truth for mesh and engine; site-fitted shadow camera only in Illumination mode; tiles implementing HeightField + revision; Stage 4 scans should call the engine selectively (edges/bisection) rather than per sample.
