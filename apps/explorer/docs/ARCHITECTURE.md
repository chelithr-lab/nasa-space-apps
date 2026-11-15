# CLPS 3D Lunar Explorer: Architecture (after Stage 3)

Status key: **TESTED** = covered by automated tests that were run. **WRITTEN, NOT RUN** = code exists and was syntax-checked and type-checked against stand-in type files, but has never been executed. **PLANNED** = not built.
This file replaces the Stage 2 version of `docs/ARCHITECTURE.md`.

## What the app is now

One page with a large Moon-centred 3D globe (primary), a smaller Earth-centred orbital panel (secondary), an information panel, and a time bar. Both 3D views and the information panel read the **same** simulation store: one clock, one astronomical snapshot per instant.

## Modules

| Folder | Job | Status |
|---|---|---|
| `src/core/` | UTC simulation clock, validation, formatting | TESTED (18 tests, run by you) |
| `src/astro/` | Moon, Sun, Earth geometry, phase, libration (Astronomy Engine) | TESTED (66 tests, run by you, including the real-library reference tests) |
| `src/sim/` | Everything that connects astronomy to the screen, without Three.js or React: clock controller, shared store, approximate Moon frame, axis mapping, sphere and grid meshes, camera presets, orbit-track cache, phase jump, formatting | TESTED (52 tests pass in the build sandbox; 5 real-library tests must be run by you) |
| `src/render/` | Three.js scenes: `moonScene.ts` (primary), `orbitScene.ts` (secondary), shared `sceneHost.ts`, `textures.ts`, `labels.ts` | WRITTEN, NOT RUN |
| `src/ui/` | React components and hooks | WRITTEN, NOT RUN |
| `src/App.tsx`, `src/styles/app.css` | Page layout and theme | WRITTEN, NOT RUN |
| `src/data/` | Verified mission records, lunar features | PLANNED |

## Data flow

```
Date.now() (playback timing only)
      |
  SimClock (src/core/time.ts functions)  -- one clock
      |
  SimStore.tick(): simMs -> computeSnapshotLive(simMs)
      |                         |
      |                  Stage 2 AstroState  +  approximate Moon frame  =  SimSnapshot
      |
      +--> frame listeners: MoonScene.update(), OrbitScene.update()   (every change)
      +--> UI listener: React (at most about 10 times per second)
```

- `liveCompute.ts` is the only file in `src/sim` that imports `src/astro/index.ts`. Everything else receives the compute functions as arguments, which is why the logic is testable without the library.
- Cameras and controls live only inside the scene classes. They never write to the store, so moving a camera cannot change astronomical state.
- `SimStore.getUiSnapshot()` returns the same object until something visible changes (required by React; tested).
- Rendering is on demand: a scene draws only when its state or camera changed.

## Axis mapping (the single definition, `src/sim/sceneMapping.ts`)

Astronomy frames (EQJ, Earth-fixed, Moon-fixed) are right-handed with z north. Three.js has +Y up. Mapping: scene = (x, z, -y). It is a proper rotation (tested). Consequences: north is up; Moon longitude 0 is on +X; east is on -Z; a standard equirectangular map centred on longitude 0 wraps on without rotation. The sphere mesh is generated from this mapping (`sphereMesh.ts`) rather than taken from `THREE.SphereGeometry`, so the texture layout is defined and tested in this project.

## Primary view: Moon-centred globe

- Scene unit: 1 = lunar reference radius 1737.4 km. The Moon never rotates in the scene; the **Sun direction** (in the approximate Moon-fixed frame) moves around it.
- Orientation: **approximate**, see `docs/MOON_FRAME_APPROXIMATION.md` (up to about 8° of longitude and 1.5° of pole direction).
- Lighting: Lambert shading from one directional light. The real surface is not Lambertian. No terrain exists, so **no crater shadows are calculated**. The dark side is lifted by a display-only ambient light (not real earthshine); brightness and dark-side sliders are display aids.
- Surface: a generated generic placeholder (clearly labelled), or the NASA SVS colour map if `public/textures/moon_color_2k.jpg` exists. The NASA page says the image is "optimized for aesthetics, not science".
- Layers: lat/lon grid (equator amber, prime meridian green) and Sun/Earth markers. `MoonScene.overlayGroup` is the reserved place for later verified markers, routes and terrain.
- Camera presets: near side, far side, north pole, south pole, reset. Orientation of each preset is calculated and tested (`cameraPresets.test.ts`).

## Secondary view: Earth-centred geometry

- Frame: geocentric EQJ, mapped to scene axes; 1 scene unit = 100,000 km.
- To scale: Moon distance and direction, the rings (every 100,000 km), the Moon's path. **Not to scale:** Earth and Moon are drawn 8× too large; the Sun is a **direction only** (it is about 389× farther than the Moon).
- The Moon's path is a sample of ephemeris positions (55 points, ±13.5 days around the selected time, recomputed when the time moves more than 3 days and at most every 400 ms). It is not an idealised orbit.
- Earth's grid turns with the real Earth-fixed orientation from Stage 2 (tested for consistency with the sub-solar point by the real-library integration test).
- Camera presets: north-polar (looking down the celestial north axis, EQJ +x right, +y up, so the Moon circles counter-clockwise; tested) and oblique.

## Time behaviour

- The time bar uses the Stage 1 functions through `SimClock`: play, pause, forward and backward speeds (1× to 30 days per second), ±1 hour and ±1 day steps, UTC date entry, jump to previous or next principal phase (Stage 2 search), and "Now".
- **"Now" = `returnToPresent` followed by play at 1×**, so the display stays live. A paused "present" would go stale at once. Stage 1's `returnToPresent` alone is unchanged.
- Playback stops at the edge of the supported range and says so. Invalid or out-of-range dates give a message and leave the time unchanged.
- Supported range is still the provisional 1900-2100 range from `core/time.ts`; the astronomy module warns outside 1901-2099, the span of the spot checks. Accuracy is not demonstrated over the whole range.

## Accuracy labels shown in the interface

Level 2 (ephemeris-based): Moon and Sun positions, phase, distances. Level 4 (simplified): Moon surface orientation, sub-solar point, Earth direction on the Moon, Earth grid orientation. Not built: terrain, craters, landing sites, routes, terrain shadows. Levels 1, 3 and 5 do not occur yet.

## Known limits

- The 3D scenes and React interface have **not been run** by their author; the first run is yours (see `STAGE3_README.md`).
- Needs WebGL and Three.js r155 or newer (light units changed in r155).
- No terrain, craters, mission sites or routes. None were invented.
- Libration is not used to orient the Moon (Stage 2 libration remains UNVERIFIED; see the Moon-frame note).
- Not flight-certified and not suitable for navigation or operational mission decisions.
