# Lunar Solar Intelligence (first release): what it calculates and what it does not

Use: choose **Illumination** in the Visualisation mode box, then click the Moon. A panel for that one site appears; leaving Illumination (or the x button) clears it. Nothing is calculated for any site until you click, and the Moon is drawn as in Normal mode.

## Frames and conventions (unchanged from the app)
Moon-fixed frame: X to 0 N 0 E, Y east, Z north; scene = (x, z, -y). The Sun direction comes from the app's own snapshot (astronomy-engine) rotated into the Moon-fixed frame by the **IAU rotational-elements series** (`lunarOrientation.ts`; before this release the app used a simplified frame with no libration; `?frame=approximate` restores it). A clicked point is converted with the same function as the hover readout (`sceneDirectionToLatLon`), so there is one mapping. Local frame at a site: up = radial, north, east. Azimuth is clockwise from north (east = 90 degrees).

## Quantities (all for the centre of the Sun's disc)
- Sun elevation / azimuth relative to the local horizontal plane (perpendicular to the radial direction).
- **Terrain horizon**: for 360 azimuths, the highest elevation angle of the LOLA raster within 250 km, curvature included. "Blocked by terrain" = Sun above the geometric horizon but below this horizon. "Darkness" = Sun below the geometric horizon. These are different situations and are labelled differently.
- Earth blocking the Sun (lunar eclipse): two opaque discs; fraction of the Sun's disc covered.
- Condition labels (HIGH SUN, LOW SUN [below 10 degrees, a display band], SUNRISE, SUNSET, TERRAIN SHADOW, DARKNESS, ECLIPSE) come from these values.
- Regional terrain normal/slope: central differences one raster cell each side (about 4 km baseline). It is not a lander-scale slope.

## Solar power (five separate stages)
1. Irradiance at the Moon: S = 1361 W/m2 x (1 au / r)^2 (IAU 2015 B3 nominal value; r = actual Sun-Moon distance from the snapshot).
2. Direct normal irradiance: S x (1 - eclipse fraction) if the Sun is directly visible, else exactly 0.
3. Panel incident irradiance: DNI x max(0, s_hat . n_hat), with n_hat the PANEL normal (horizontal = local up; fixed tilt = tilt and facing direction; tracking = towards the Sun, an idealisation).
4. Incident solar power = (3) x area.
5. Electrical power = (4) x efficiency x (1 - losses).
No reflected, scattered or thermal contribution; no panel mounting height; no temperature or dust effects. The defaults (10 m2, 25 %, 15 % losses) are example assumptions, not equipment.

## Energy and events
Energy = integral of electrical power over time (trapezoid rule on time-ordered samples, converted to Wh/kWh). The scan takes samples at most 30 minutes apart (about 400 samples per window), and wherever lighting state changes between two samples it bisects to 1 second, so sunrise, sunset and shadow edges are bracketed to about 1 s. Where a fixed panel turns away from the Sun between samples, the crossing is located from the signed cosine and only the generating part is integrated. Events (sunrise, sunset, shadow start/end, eclipse start/end, maximum/minimum elevation) are listed only if found in the calculated window (30 days either side of the moment of selection, re-centred when the clock approaches an edge). Countdowns shown in the daylight ring are differences between found events; if an event is not in the window the app says so.
**Known blind spot:** a lit or dark spell that starts and ends between two neighbouring coarse samples (shorter than the displayed step) can be missed.

## Validation actually run (Node, independent Meeus Sun, no astronomy-engine)
Analytic energy for a horizontal panel over one lunar day (P0 x 2 / omega); tracker gives constant power for exactly the daylight duration; vertical east-facing panel collects only the morning; a 10 degree eastern ridge removes exactly the first 10 degrees of the morning; power scales with area, efficiency and (1 - losses); zero power when facing away, in darkness, in terrain shadow and in total eclipse; five-stage hand arithmetic; inverse-square distance; sunrise/sunset/extremes found within 1 s of analytic times; two transitions inside one coarse step both found; Apollo 11 Sun elevation at touchdown against NASA's planning figure (10.8 degrees); the Sun stays within about 1.6 degrees of the horizon at the south pole (axis tilt 1.54 degrees); near- and far-side equatorial sites have opposite day phase about 14.8 days apart; east is on the left of the sky plot (looking up); IAU frame is a proper rotation and the Sun moves west across the lunar sky.

## Not verified / limitations
- IAU coefficients were transcribed from a secondary open-source reproduction of Archinal et al.; they were NOT checked against the primary publication here.
- Not run: the astronomy-engine-backed tests (18, skipped without the package), `npm run build`, the real WebGL scene with a real click, and performance on your laptop.
- Terrain data: LDEM_16 cell means (about 1.9 km). Craters, rims and boulders smaller than a few cells are absent; permanently shadowed regions are not identified.
- Raster and texture orientation are still unverified (`node scripts/check-orientation.ts`); a wrong orientation would move terrain relative to the Sun.
- Sunrise/sunset are Sun-centre crossings; the disc takes about an hour to rise.
- The sky plot is a flat polar chart (looking up), not a 3D scene.
- **Not built yet:** Solar Conditions Score, two-site comparison, custom date ranges for energy, report/PDF, shadow-direction arrows on the Moon, per-config comparison beyond the three panel types.
