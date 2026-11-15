# Approximate Moon-fixed frame (Stage 3)

Status: **accuracy level 4, simplified approximation.** Implemented in `src/sim/moonFrame.ts`. Not the IAU / Mean-Earth frame. Do not use for site-level work.

## Why it exists

The Stage 2 astronomy module gives validated Moon and Sun positions but no validated Moon-fixed orientation (the libration sign convention was left unverified). The lunar globe needs *some* orientation so that the Sun can light it. This frame is the simplest one whose lighting still follows the real Earth-Moon-Sun geometry.

## Construction (all vectors in EQJ, from the Moon's centre)

| Axis | Definition |
|---|---|
| Z (north) | North pole of the J2000 mean ecliptic. In EQJ coordinates (0, -sin ε, cos ε), ε = 23.4393°. |
| X (lat 0, lon 0) | The Earth direction with its Z component removed, normalised. |
| Y (east, lon +90) | Z × X. Seen from Earth with north up, east is on the right, as on lunar maps. |

Sun direction in this frame = rotation of the Stage 2 Moon-to-Sun unit vector. Earth direction likewise. Sub-solar point = latitude/longitude of the Sun direction.

## What is right

- The Sun's direction relative to the Earth-facing side. Hence the phase pattern and where the terminator falls on the near side follow the real geometry. Tests: sub-solar longitude is 180° at New Moon, +90° at First Quarter, 0° at Full Moon, -90° at Last Quarter (hand-derived, tolerance 0.35°, which is the angle at the Sun). The same test against the **real library** at 48 exact quarter instants is in `src/sim/integration.test.ts` and must be run locally.
- Handedness: at First Quarter the Sun is over the east side (y > 0).
- The angle between the Sun and Earth directions in this frame equals the Stage 2 phase angle (a rotation preserves angles). Real-library version in `integration.test.ts`.

## What is wrong, and by how much

| Simplification | Error bound | Basis |
|---|---|---|
| Longitudinal libration set to zero | Surface features displaced by up to about 8° of longitude | Known range of optical libration in longitude. Meeus 1992-04-12 example: true l = -1.206°, model 0°. |
| Spin axis set to the ecliptic pole | Pole direction off by about 1.54° | Mean tilt of the lunar equator to the ecliptic. |
| Sub-Earth latitude = minus the Moon's ecliptic latitude | Off by up to about 1.5° (axis-tilt term omitted) | Meeus 1992-04-12 example: true b = +4.194°, model +3.229°, difference 0.97°. |
| Physical libration ignored | Under 0.05° | Meeus example: -0.025°, +0.006°. |

Consequence: a lunar feature drawn at longitude L, latitude B may really be up to roughly 8° away on the true Moon at a given instant. The grid, labels and sub-solar point all share this frame, so they are mutually consistent; they are not tied to the real surface to better than this.

## Why not use the library's libration values now

The Stage 2 libration angles are marked UNVERIFIED because the library documentation does not state their sign convention. You reported that the Stage 2 Meeus libration test passed on your machine (tolerance 0.1° against l = -1.206°, b = +4.194°), which suggests the convention matches Meeus's. I have not seen the measured numbers. A later stage should look at them, decide, and then build a proper orientation (libration in longitude and latitude, and ideally the IAU pole and prime meridian) with its own validation. Nothing in Stage 3 depends on that.

## Display conventions

- Scene axes: north +Y, longitude 0 on +X, east on -Z (see `src/sim/sceneMapping.ts`).
- The Moon mesh never rotates; the Sun light direction moves. Moving a camera cannot change astronomy.
- Surface texture: equirectangular, centred on longitude 0, east to the right. The built-in placeholder is generic and contains no real features.
