# CLPS 3D Lunar Explorer: Architecture (Stage 1)

Status key: DONE = implemented and tested, PLANNED = not built yet, UNVERIFIED = needs checking before use.

## Separation of concerns

| Folder | Job | Status |
|---|---|---|
| `src/core/` | Simulation clock (UTC), validation, formatting. No dependencies. | DONE, 18 tests pass |
| `src/astro/` | Moon/Sun/Earth geometry, libration, phase (Astronomy Engine) | PLANNED (Stage 2) |
| `src/render/` | Three.js scenes for View A and View B | PLANNED |
| `src/data/` | Mission records, features, sources | PLANNED |
| `src/ui/` | React components, controls, panels | PLANNED |

Rule: only `src/core` owns time. Both views READ the clock. Cameras never write to astronomical state.

## Time

- Stored as UTC milliseconds (JavaScript time). Simulation time is computed from an anchor plus speed, never accumulated per frame, so there is no drift.
- JavaScript time ignores leap seconds. UTC to Terrestrial Time conversion (about 69 s today) is the astronomy library's job and will be documented in Stage 2.
- Real current time and selected simulation time are separate values. "Return to present" resets only the clock.
- Supported range: PROVISIONAL 1900-01-01 to 2100-12-31. This is a placeholder for input validation, not a claim of accuracy. It must be replaced by a range justified by validation.

## Reference frames (proposed, UNVERIFIED until Stage 2 and 4 tests)

- Orbital state: geocentric equatorial J2000 (EQJ), the frame Astronomy Engine returns for GeoMoon and GeoVector.
- View A north-polar view: a CAMERA placed on the +Z (north celestial pole) side looking down. It is a viewpoint, not a frame. Earth's rotational axis in the scene is tilted relative to the ecliptic as it is in reality.
- Lunar coordinates: planetocentric latitude and east-positive longitude on the sphere used by the NASA SVS Moon Kit maps (reference radius 1737.4 km, longitude 0 at map centre). Whether to use the Mean Earth/Polar Axis frame is to be confirmed in Stage 4.
- Libration: Astronomy Engine provides optical libration angles. This is an approximation of the Moon's true orientation, and will be labelled as such.

## Accuracy labels (every displayed item gets one)

1. Source-provided or observed data
2. Ephemeris-based calculated geometry
3. Terrain-based illumination or shadow calculation
4. Simplified approximation
5. Hypothetical user-created scenario

## Known limits so far

- Moon Trek and JPL Horizons could not be reached from the development sandbox, so neither is tested.
- No mission coordinates have been collected yet. None will be entered without a source link.
- Global elevation data (LOLA, via the SVS Moon Kit) is too coarse for crater-scale shadows. Terrain shadows stay disabled until suitable data is confirmed.
- This tool is not flight-certified or suitable for operational mission decisions.
