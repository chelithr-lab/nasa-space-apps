# Astronomy validation record (Stage 2)

Last updated 2026-10-19. This file separates what was **checked**, what was **only designed**, and what is **not validated**.

## 1. Summary

| Item | Status |
|---|---|
| Geometry maths (triangle, phase angle, elongation, phase names, matrices) | TESTED. 53 tests pass in the build sandbox using a SYNTHETIC ephemeris with hand-calculated answers. This proves the maths and wiring, **not** real Moon/Sun positions. |
| Reference data used by the tests (USNO, NASA, Meeus/PyMeeus values) | CHECKED against the live sources on 2026-10-19 (section 2). |
| Real `astronomy-engine` results vs those references (13 tests) | **NOT RUN YET.** The build sandbox cannot install the package, so these tests are reported as SKIPPED. They must be run on your computer (README). Until you send the results, real-library accuracy is **unverified**. |
| Libration sign convention | **UNVERIFIED.** The library documentation does not state it. The Meeus test will reveal it on your machine. |
| Moon-fixed orientation matrix | NOT IMPLEMENTED in Stage 2 (deferred to the lunar-surface stage, after the libration convention is known). |
| Comparison with JPL Horizons | NOT DONE. Horizons could not be reached from the build sandbox. |

## 2. Reference data re-check (done 2026-10-19)

Method: pages were read through a web-fetch tool that returns text. Each value was compared with the test file. Two independent sources agree wherever both were readable.

- **Principal phase times (29 entries: 4 each in 1901, 1950, 2001, 2050, 2099 and 9 in 2026).** USNO API `https://aa.usno.navy.mil/api/moon/phases/year?year=YYYY` and NASA GSFC (F. Espenak) tables `https://eclipse.gsfc.nasa.gov/phase/phases1901.html` and `phases2001.html` (NASA states Universal Time; the USNO response does not state a time scale, so it is treated as UT).
  - 22 entries: USNO and NASA agree to the minute with the test value.
  - 3 entries: the two sources differ by one minute, and the test file labels which value it uses: 1950-01-18 New Moon (test uses NASA 08:00; USNO 07:59), 2026-06-29 Full Moon (test uses USNO 23:56; NASA 23:57), 2026-10-18 First Quarter (test uses USNO 16:12; NASA 16:13). The 150 s tolerance covers a one-minute gap.
  - 4 entries (all of 2099) are **USNO only**: the NASA 2001-2100 table could not be read that far (the page text was cut off).
  - Caveat: pages were read through a text-fetch tool, not downloaded and parsed by script. The agreement of two independent sources on 22 entries makes a transcription error unlikely but I cannot rule it out for the single-source rows.
- **2026 equinoxes and solstices** (USNO `https://aa.usno.navy.mil/api/seasons?year=2026&tz=0`): 20 Mar 14:46, 21 Jun 08:24, 23 Sep 00:05, 21 Dec 20:50 (UTC). Match the test.
- **Meeus Examples 47.a and 53.a** (1992-04-12 0h, Moon): values match the PyMeeus documentation page `https://pymeeus.readthedocs.io/en/latest/examples/ex-Moon.html`: longitude 133.162655 (mean), 133.167264 (apparent), latitude -3.229126, distance 368409.7 km, optical libration l = -1.206, b = +4.194 (physical -0.025, +0.006). The page does not name a time scale; Meeus's examples use Dynamical Time, which the test assumes.
- **Meeus Example 12.a** (mean sidereal time 1987-04-10 0h UT = 13h 10m 46.3668s): the formula in the test reproduces it exactly (re-run independently in Python on 2026-10-19). The apparent value 13h 10m 46.1351s is the book's printed result; it was not independently re-derived.
- **Library facts** (from the library's JS README and project README, 2026-10-19): numeric dates mean UTC days since J2000 (the adapter always passes `Date` objects); TT from the Espenak and Meeus delta-T model; UT1 approximated by UTC; `Rotation_EQJ_EQD` and `RotateVector` exist; the project README states a design goal of "within 1 arcminute of results from NOVAS" and says it is unit-tested against NOVAS and JPL Horizons. **No date range is stated** ("millennia before or after the present"). The `Vector` constructor arguments, the GeoVector aberration flag and the Libration sign convention were not found in the documentation read.

## 3. Tests and tolerances (real-library tests, not yet run)

Tolerance kinds: DERIVED follows from a stated accuracy or rounding; SANITY is a wide band that catches gross errors (wrong units, frame or sign) and is **not** an accuracy claim.

| Test | Tolerance | Kind and reasoning |
|---|---|---|
| Phase times vs USNO/NASA | 150 s (300 s after 2060) | DERIVED: 1 arcminute is about 118 s of Moon-Sun motion, plus 30 s minute rounding. The 300 s after 2060 is an engineering choice because predicted delta-T differs between sources. |
| Sun declination at equinoxes and solstices | 0.025 deg | DERIVED worst-case sum: 0.0167 (1 arcmin) + 0.0023 (no aberration) + 0.0026 (nutation in obliquity) + 0.001 (rounding). |
| GAST vs independent mean sidereal formula | 1.1 s of time | DERIVED: equation of the equinoxes is at most about 1.05 s. |
| GAST vs Meeus 12.a | 1.0 s | DERIVED: UTC treated as UT1 (up to 0.9 s) plus 0.1 s. |
| Moon longitude/latitude vs Meeus 47.a | 0.03 deg | SANITY: 1 arcmin plus mean/apparent equinox gap (0.0046 deg). |
| Moon distance vs Meeus 47.a | 0.05 percent (184 km) | SANITY. |
| Libration vs Meeus 53.a | 0.1 deg | SANITY: exceeds the physical libration (about 0.03 deg) that the optical values exclude. A larger miss, especially near twice the value, means an opposite sign convention. |
| Consistency sweep (every 6 h through 2026 plus 5 other epochs) | see test file | DERIVED or SANITY as labelled in the file. Compares our geometry with the library's own `MoonPhase` and `Illumination`. |

Passing these would show agreement at about the arcminute level at the sampled instants only.

## 4. What is NOT validated

- **Continuous accuracy** across any span. Only the sampled dates above are checked.
- **Edges of the range**: 1900-01-01 to 1900-12-31 and 2100-01-01 to 2100-12-31 are accepted by `src/core/time.ts` but are outside the sampled span. Dates there return a warning in `state.warnings`.
- **Future delta-T**: for dates after about 2026 the Earth's rotation is predicted, not observed. Phase times after about 2060 carry growing uncertainty from delta-T alone.
- **Physical libration**, topocentric parallax (a particular place on Earth), polar motion, and UT1-UTC (up to 0.9 s) are not modelled. Phase and illumination are geocentric.
- **Moon vs JPL Horizons**: not compared.
- **Anything about terrain, mission coordinates or shadows**: not part of Stage 2. No such data was created.

## 5. Supported date range review

- `src/core/time.ts` still holds the provisional range 1900-01-01 to 2100-12-31 (it was not modified, as instructed).
- The astronomy module accepts that range but attaches a warning outside **1901-01-01 to 2099-12-31**, the span of the spot checks. This is a statement of what was sampled, **not** a proven accuracy bound.
- Recommended next step: after your local test results arrive, decide the range shown in the interface (likely the sampled span), and narrow `SUPPORTED_RANGE` in `core/time.ts` in a later stage.
