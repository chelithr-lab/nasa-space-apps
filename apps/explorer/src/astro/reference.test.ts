/**
 * REFERENCE VALIDATION against published data, using the REAL astronomy-engine.
 *
 * If the package is not installed these tests are SKIPPED (never "passed").
 * After `npm install astronomy-engine` the summary must show "skipped 0".
 *
 * Every tolerance below is explained. Two kinds:
 *   DERIVED  - follows from a stated accuracy of the library or the source.
 *   SANITY   - a deliberately wide engineering band that catches gross errors
 *              (wrong units, wrong frame, swapped sign). It is NOT a claim of accuracy.
 * Each test prints the actual deviations (t.diagnostic) so tolerances can be
 * tightened or defended with evidence. Sources and details: docs/ASTRO_VALIDATION.md
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeg360, signedAngleDiffDeg } from './angles.ts';
import type { Ephemeris } from './ephemeris.ts';
import { computeAstroStateWith } from './state.ts';
import type { AstroState } from './state.ts';

// ---------------------------------------------------------------- loading
let loaded: Ephemeris | null = null;
let skip: string | false = false;
try {
  const mod = await import('./ephemeris-astronomy-engine.ts');
  loaded = mod.astronomyEngineEphemeris;
} catch (error) {
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === 'ERR_MODULE_NOT_FOUND' && /astronomy-engine/.test(message)) {
    skip =
      'astronomy-engine is not installed in this environment: every reference test is SKIPPED, not passed.';
  } else {
    throw error; // a real problem (for example a wrong import style) must fail loudly
  }
}

function eph(): Ephemeris {
  if (loaded === null) throw new Error('astronomy-engine not loaded');
  return loaded;
}

function stateAt(ms: number): AstroState {
  const r = computeAstroStateWith(eph(), ms);
  if (!r.ok) throw new Error(`computeAstroState failed at ${new Date(ms).toISOString()}: ${r.reason}`);
  return r.value;
}

const DAY_MS = 86_400_000;
const f = (x: number, digits = 4): string => x.toFixed(digits);

// -------------------------------------------------- 1. principal phase times
/**
 * Principal-phase instants, UTC, minute resolution.
 * Sources (every row re-checked against the live sources on 2026-10-19; see docs/ASTRO_VALIDATION.md):
 *  USNO  = U.S. Naval Observatory API https://aa.usno.navy.mil/api/moon/phases/year?year=YYYY
 *  NASA  = NASA GSFC (F. Espenak) https://eclipse.gsfc.nasa.gov/phase/phases1901.html and phases2001.html (Universal Time)
 * "both" = the two sources agree to the minute for that entry. "USNO only" = the NASA 2099 table could not be read.
 * Where the sources differ by one minute the label says so; the 150 s tolerance covers that.
 * quarter: 0 New, 1 First Quarter, 2 Full, 3 Last Quarter.
 */
const PHASE_REFS: Array<{ iso: string; quarter: 0 | 1 | 2 | 3; src: string }> = [
  { iso: '1901-01-05T00:13:00Z', quarter: 2, src: 'both' },
  { iso: '1901-01-20T14:36:00Z', quarter: 0, src: 'both' },
  { iso: '1901-07-15T22:10:00Z', quarter: 0, src: 'both' },
  { iso: '1901-12-25T12:16:00Z', quarter: 2, src: 'both' },
  { iso: '1950-01-04T07:48:00Z', quarter: 2, src: 'both' },
  { iso: '1950-01-18T08:00:00Z', quarter: 0, src: 'NASA (USNO lists 07:59)' },
  { iso: '1950-07-15T05:05:00Z', quarter: 0, src: 'both' },
  { iso: '1950-12-24T10:23:00Z', quarter: 2, src: 'both' },
  { iso: '2001-01-09T20:24:00Z', quarter: 2, src: 'both' },
  { iso: '2001-01-24T13:07:00Z', quarter: 0, src: 'both' },
  { iso: '2001-07-20T19:44:00Z', quarter: 0, src: 'both' },
  { iso: '2001-12-30T10:41:00Z', quarter: 2, src: 'both' },
  { iso: '2026-01-03T10:03:00Z', quarter: 2, src: 'both' },
  { iso: '2026-01-10T15:48:00Z', quarter: 3, src: 'both' },
  { iso: '2026-01-18T19:52:00Z', quarter: 0, src: 'both' },
  { iso: '2026-01-26T04:47:00Z', quarter: 1, src: 'both' },
  { iso: '2026-06-29T23:56:00Z', quarter: 2, src: 'USNO (NASA lists 23:57)' },
  { iso: '2026-10-10T15:50:00Z', quarter: 0, src: 'both' },
  { iso: '2026-10-18T16:12:00Z', quarter: 1, src: 'USNO (NASA lists 16:13)' },
  { iso: '2026-10-26T04:12:00Z', quarter: 2, src: 'both' },
  { iso: '2026-11-01T20:28:00Z', quarter: 3, src: 'both' },
  { iso: '2050-01-08T01:39:00Z', quarter: 2, src: 'both' },
  { iso: '2050-01-23T04:57:00Z', quarter: 0, src: 'both' },
  { iso: '2050-04-21T10:25:00Z', quarter: 0, src: 'both' },
  { iso: '2050-12-28T05:15:00Z', quarter: 2, src: 'both' },
  { iso: '2099-01-07T01:52:00Z', quarter: 2, src: 'USNO only' },
  { iso: '2099-01-21T09:09:00Z', quarter: 0, src: 'USNO only' },
  { iso: '2099-07-18T01:02:00Z', quarter: 0, src: 'USNO only' },
  { iso: '2099-12-27T13:00:00Z', quarter: 2, src: 'USNO only' },
];

test('principal phase times match USNO / NASA tables (1901..2099)', { skip }, (t) => {
  // DERIVED tolerance: the library README states a design goal of agreement within 1 arcminute of NOVAS (not measured by this project). The Moon
  // moves about 0.51 arcminute per minute relative to the Sun, so 1 arcminute is
  // about 2 minutes of time; add 30 s for the tables' rounding to the minute:
  // 150 s. For years after 2060 the tables depend on a PREDICTED delta-T that
  // different sources model differently, so the band is widened to 300 s. That
  // widening is an engineering choice, not a validated bound.
  const rows: string[] = ['date (UTC)           quarter  deviation(s)  tol(s)  source'];
  const failures: string[] = [];
  for (const ref of PHASE_REFS) {
    const refMs = Date.parse(ref.iso);
    const year = new Date(refMs).getUTCFullYear();
    const tol = year > 2060 ? 300 : 150;
    const found = eph()
      .moonQuarters(refMs - 2 * DAY_MS, 3)
      .find((q) => q.quarter === ref.quarter);
    if (found === undefined) {
      failures.push(`${ref.iso}: the library returned no quarter of type ${ref.quarter}`);
      continue;
    }
    const dev = (found.utcMs - refMs) / 1000;
    rows.push(`${ref.iso}  ${ref.quarter}        ${f(dev, 1).padStart(8)}      ${tol}     ${ref.src}`);
    if (Math.abs(dev) > tol) failures.push(`${ref.iso} (q${ref.quarter}, ${ref.src}): deviation ${f(dev, 1)} s exceeds ${tol} s`);
  }
  t.diagnostic(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

// ----------------------------------- 2. Sun position at equinoxes / solstices
/** USNO https://aa.usno.navy.mil/api/seasons?year=2026 (tz 0, i.e. UTC), retrieved 2026-10-18. */
const SEASONS: Array<{ iso: string; kind: 'equinox' | 'june-solstice' | 'december-solstice' }> = [
  { iso: '2026-03-20T14:46:00Z', kind: 'equinox' },
  { iso: '2026-06-21T08:24:00Z', kind: 'june-solstice' },
  { iso: '2026-09-23T00:05:00Z', kind: 'equinox' },
  { iso: '2026-12-21T20:50:00Z', kind: 'december-solstice' },
];

/** Mean obliquity of date, degrees (IAU 2006 linear terms; T = Julian centuries from J2000). */
function meanObliquityDeg(ms: number): number {
  const jd = 2440587.5 + ms / DAY_MS;
  const T = (jd - 2451545.0) / 36525;
  return (84381.406 - 46.836769 * T) / 3600;
}

test('Sun declination at the 2026 equinoxes and solstices (tests the EQJ to equator-of-date rotation)', { skip }, (t) => {
  // DERIVED tolerance 0.025 deg, a worst-case SUM: library goal 1 arcminute (0.0167 deg) +
  // 0.0023 deg because we do not apply aberration (20.5 arcsec of Sun longitude
  // times sin(obliquity)) + up to 0.0026 deg nutation in obliquity (the expected
  // solstice value uses the MEAN obliquity) + under 0.001 deg for the tables' minute rounding.
  // A transposed or wrong rotation would be off by many degrees.
  const rows: string[] = [];
  const failures: string[] = [];
  for (const s of SEASONS) {
    const ms = Date.parse(s.iso);
    const st = stateAt(ms);
    if (!st.earth.available) {
      failures.push(`${s.iso}: Earth orientation unavailable (${st.earth.reason})`);
      continue;
    }
    const dec = st.earth.subSolar.latDeg;
    const eps = meanObliquityDeg(ms);
    const expected = s.kind === 'equinox' ? 0 : s.kind === 'june-solstice' ? eps : -eps;
    const dev = dec - expected;
    rows.push(`${s.iso} ${s.kind.padEnd(17)} declination ${f(dec)} deg, expected ${f(expected)}, deviation ${f(dev, 5)}`);
    if (Math.abs(dev) > 0.025) failures.push(`${s.iso}: declination ${f(dec)} vs expected ${f(expected)}`);
  }
  t.diagnostic(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

// --------------------------------------------------- 3. Greenwich sidereal time
/**
 * Mean sidereal time at Greenwich, Meeus "Astronomical Algorithms" 2nd ed.,
 * eq. 12.4 (IAU 1982). Checked in this project against the book's Example 12.a
 * (1987-04-10 0h UT -> 13h 10m 46.3668s): the formula reproduces it exactly.
 */
function gmstHours(ms: number): number {
  const jd = 2440587.5 + ms / DAY_MS;
  const T = (jd - 2451545.0) / 36525;
  const deg = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return normalizeDeg360(deg) / 15;
}

function wrapHours(h: number): number {
  return ((((h + 12) % 24) + 24) % 24) - 12;
}

test('Greenwich apparent sidereal time vs an independent mean-sidereal-time formula', { skip }, (t) => {
  // DERIVED tolerance 1.1 s: apparent minus mean sidereal time is the equation of
  // the equinoxes, at most |dpsi| cos(eps) / 15 = about 1.05 s of time.
  const epochs = [
    '1901-06-15T06:00:00Z',
    '1950-03-01T18:30:00Z',
    '1987-04-10T00:00:00Z',
    '2000-01-01T12:00:00Z',
    '2026-10-18T12:00:00Z',
    '2050-06-15T00:00:00Z',
    '2099-06-15T09:00:00Z',
  ];
  const rows: string[] = [];
  const failures: string[] = [];
  for (const iso of epochs) {
    const ms = Date.parse(iso);
    const st = stateAt(ms);
    if (!st.earth.available) {
      failures.push(`${iso}: Earth orientation unavailable (${st.earth.reason})`);
      continue;
    }
    const dev = wrapHours(st.earth.gastHours - gmstHours(ms)) * 3600;
    rows.push(`${iso} GAST - GMST = ${f(dev, 4)} s of time`);
    if (Math.abs(dev) > 1.1) failures.push(`${iso}: GAST - GMST = ${f(dev, 4)} s`);
  }
  t.diagnostic(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('Greenwich apparent sidereal time matches Meeus Example 12.a (1987-04-10 0h UT)', { skip }, (t) => {
  // Book value 13h 10m 46.1351s (mean 46.3668s plus equation of equinoxes -0.2317 s).
  // The mean value was reproduced independently in this project (re-run 2026-10-19: 13h 10m 46.3668s);
  // the apparent value is the book's printed result. DERIVED tolerance 1.0 s: the library treats UTC as UT1,
  // which can differ by up to 0.9 s, plus 0.1 s for nutation-model differences.
  const st = stateAt(Date.UTC(1987, 3, 10, 0, 0, 0));
  assert.ok(st.earth.available, 'Earth orientation unavailable');
  if (!st.earth.available) return;
  const expected = 13 + 10 / 60 + 46.1351 / 3600;
  const dev = (st.earth.gastHours - expected) * 3600;
  t.diagnostic(`library GAST ${f(st.earth.gastHours, 7)} h, book ${f(expected, 7)} h, deviation ${f(dev, 4)} s`);
  assert.ok(Math.abs(dev) <= 1.0, `deviation ${f(dev, 4)} s`);
});

// ------------------------------------------ 4. Meeus Moon position + libration
/**
 * Meeus, Astronomical Algorithms 2nd ed., Examples 47.a and 53.a:
 * 1992 April 12, 0h Dynamical Time. Values as reproduced by the PyMeeus
 * documentation (https://pymeeus.readthedocs.io/en/latest/examples/ex-Moon.html,
 * retrieved 2026-10-18):
 *   geocentric ecliptic longitude 133.162655 (mean equinox of date),
 *   apparent longitude 133.167264, latitude -3.229126, distance 368409.7 km,
 *   optical libration l = -1.206, b = +4.194 degrees (physical: -0.025, +0.006).
 * The page does not name the time scale; Meeus's examples use TD, which is what
 * is assumed here (the test converts TD to UTC using the library's own delta-T).
 */
test('Moon position and optical libration match Meeus Examples 47.a and 53.a (1992-04-12 0h TD)', { skip }, (t) => {
  const ttMs = Date.UTC(1992, 3, 12, 0, 0, 0);
  let utMs = ttMs;
  for (let i = 0; i < 3; i++) utMs = Math.round(ttMs - eph().snapshot(utMs).deltaTSeconds * 1000);
  const st = stateAt(utMs);

  const dLon = signedAngleDiffDeg(st.libration.moonEclipticLonDeg, 133.162655);
  const dLonApparent = signedAngleDiffDeg(st.libration.moonEclipticLonDeg, 133.167264);
  const dLat = st.libration.moonEclipticLatDeg - -3.229126;
  const dDist = st.moon.distanceKm - 368409.7;
  const dL = st.libration.elonDeg - -1.206;
  const dB = st.libration.elatDeg - 4.194;

  t.diagnostic(
    [
      `delta-T used: ${f(st.timeScale.deltaTSeconds, 2)} s; UTC instant ${st.utcIso}`,
      `library mlon ${f(st.libration.moonEclipticLonDeg, 6)}  vs 133.162655 (mean) -> ${f(dLon, 5)} deg; vs 133.167264 (apparent) -> ${f(dLonApparent, 5)} deg`,
      `library mlat ${f(st.libration.moonEclipticLatDeg, 6)}  vs -3.229126 -> ${f(dLat, 5)} deg`,
      `GeoMoon distance ${f(st.moon.distanceKm, 1)} km vs 368409.7 -> ${f(dDist, 1)} km`,
      `library elon ${f(st.libration.elonDeg, 4)} vs l = -1.206 -> ${f(dL, 4)} deg`,
      `library elat ${f(st.libration.elatDeg, 4)} vs b = +4.194 -> ${f(dB, 4)} deg`,
      'If mlon is off by about -0.11 deg the library reports the J2000 (not of-date) ecliptic.',
      'If elon or elat is off by about twice the value, its sign convention is opposite to Meeus.',
    ].join('\n'),
  );

  // SANITY 0.03 deg: library 1 arcminute (0.0167) plus the 0.0046 deg gap between mean and apparent equinox.
  assert.ok(Math.abs(dLon) <= 0.03 || Math.abs(dLonApparent) <= 0.03, `longitude off by ${f(dLon, 5)} deg`);
  assert.ok(Math.abs(dLat) <= 0.03, `latitude off by ${f(dLat, 5)} deg`);
  // SANITY 0.05 percent of the distance (184 km).
  assert.ok(Math.abs(dDist) <= 368409.7 * 0.0005, `distance off by ${f(dDist, 1)} km`);
  // SANITY 0.1 deg: larger than the physical libration (about 0.03 deg) the Meeus optical value excludes.
  assert.ok(Math.abs(dL) <= 0.1, `libration in longitude off by ${f(dL, 4)} deg (sign convention?)`);
  assert.ok(Math.abs(dB) <= 0.1, `libration in latitude off by ${f(dB, 4)} deg (sign convention?)`);
});

// ----------------------------------------------- 5. consistency sweeps
const CHECKPOINTS = [
  '1901-06-15T00:00:00Z',
  '1950-06-15T00:00:00Z',
  '2000-01-01T12:00:00Z',
  '2050-06-15T00:00:00Z',
  '2099-06-15T00:00:00Z',
].map((s) => Date.parse(s));

test('internal consistency: our geometry vs the library, every 6 h through 2026 plus five other epochs', { skip }, (t) => {
  // Thresholds:
  //  elongation vs MoonPhase  0.05 deg   DERIVED: expected difference is the Sun aberration/light-time effect (~0.006 deg); 0.05 deg is a wide guard.
  //  phase angle              0.05 deg   same reasoning.
  //  illuminated fraction     0.001      follows from the 0.05 deg phase-angle bound (|d fraction| <= sin(i)/2 * 0.00087).
  //  distance vs Libration()  10 km      SANITY: both come from the same lunar model.
  //  triangle identity        1e-6 deg   pure geometry.
  //  Moon distance            356000..407000 km   SANITY (known extremes about 356,400 and 406,700 km).
  //  Sun distance             0.983..1.017 AU     SANITY (perihelion 0.9833, aphelion 1.0167 AU).
  //  |elon| <= 8.5, |elat| <= 7.5, |moon ecliptic lat| <= 5.5 deg   SANITY (known maxima about 7.9, 6.9 and 5.3 deg).
  const times: number[] = [];
  const start = Date.UTC(2026, 0, 1);
  for (let ms = start; ms < Date.UTC(2027, 0, 1); ms += 6 * 3_600_000) times.push(ms);
  times.push(...CHECKPOINTS);

  const worst = { elong: 0, phase: 0, frac: 0, dist: 0, tri: 0, moonMin: Infinity, moonMax: 0, sunMin: Infinity, sunMax: 0, elon: 0, elat: 0, mlat: 0 };
  const failures: string[] = [];
  for (const ms of times) {
    const s = stateAt(ms);
    const d = s.diagnostics.differences;
    worst.elong = Math.max(worst.elong, Math.abs(d.eclipticElongationDeg));
    worst.phase = Math.max(worst.phase, Math.abs(d.phaseAngleDeg));
    worst.frac = Math.max(worst.frac, Math.abs(d.diskIlluminatedFraction));
    worst.dist = Math.max(worst.dist, Math.abs(d.moonDistanceKm));
    worst.tri = Math.max(worst.tri, Math.abs(s.geometry.elongationDeg + s.geometry.phaseAngleDeg + s.geometry.angleAtSunDeg - 180));
    worst.moonMin = Math.min(worst.moonMin, s.moon.distanceKm);
    worst.moonMax = Math.max(worst.moonMax, s.moon.distanceKm);
    worst.sunMin = Math.min(worst.sunMin, s.sun.distanceAu);
    worst.sunMax = Math.max(worst.sunMax, s.sun.distanceAu);
    worst.elon = Math.max(worst.elon, Math.abs(s.libration.elonDeg));
    worst.elat = Math.max(worst.elat, Math.abs(s.libration.elatDeg));
    worst.mlat = Math.max(worst.mlat, Math.abs(s.libration.moonEclipticLatDeg));
    if (Math.abs(d.eclipticElongationDeg) > 0.05) failures.push(`${s.utcIso}: elongation differs from MoonPhase by ${f(d.eclipticElongationDeg, 4)} deg`);
    if (Math.abs(d.phaseAngleDeg) > 0.05) failures.push(`${s.utcIso}: phase angle differs by ${f(d.phaseAngleDeg, 4)} deg`);
    if (Math.abs(d.diskIlluminatedFraction) > 0.001) failures.push(`${s.utcIso}: illuminated fraction differs by ${f(d.diskIlluminatedFraction, 5)}`);
    if (Math.abs(d.moonDistanceKm) > 10) failures.push(`${s.utcIso}: distance differs from Libration() by ${f(d.moonDistanceKm, 2)} km`);
    if (s.moon.distanceKm < 356000 || s.moon.distanceKm > 407000) failures.push(`${s.utcIso}: Moon distance ${f(s.moon.distanceKm, 0)} km`);
    if (s.sun.distanceAu < 0.983 || s.sun.distanceAu > 1.017) failures.push(`${s.utcIso}: Sun distance ${f(s.sun.distanceAu, 5)} AU`);
    if (Math.abs(s.libration.elonDeg) > 8.5 || Math.abs(s.libration.elatDeg) > 7.5) failures.push(`${s.utcIso}: libration ${f(s.libration.elonDeg, 3)}, ${f(s.libration.elatDeg, 3)}`);
    if (Math.abs(s.libration.moonEclipticLatDeg) > 5.5) failures.push(`${s.utcIso}: Moon ecliptic latitude ${f(s.libration.moonEclipticLatDeg, 3)}`);
  }
  if (worst.tri > 1e-6) failures.push(`triangle identity violated by ${worst.tri} deg`);

  t.diagnostic(
    [
      `${times.length} instants checked`,
      `max |elongation - MoonPhase| ${f(worst.elong, 5)} deg; max |phase angle diff| ${f(worst.phase, 5)} deg; max |fraction diff| ${f(worst.frac, 6)}`,
      `max |distance diff| ${f(worst.dist, 3)} km; triangle identity worst ${worst.tri.toExponential(2)} deg`,
      `Moon distance range ${f(worst.moonMin, 0)}..${f(worst.moonMax, 0)} km; Sun distance range ${f(worst.sunMin, 5)}..${f(worst.sunMax, 5)} AU`,
      `max |elon| ${f(worst.elon, 3)} deg; max |elat| ${f(worst.elat, 3)} deg; max |Moon ecliptic lat| ${f(worst.mlat, 3)} deg`,
    ].join('\n'),
  );
  assert.deepEqual(failures.slice(0, 20), [], `${failures.length} failure(s); first 20 shown`);
});

test('exact quarter instants from the library fall at 0/90/180/270 degrees of our own elongation', { skip }, (t) => {
  // Two different code paths: the library finds the instant from MoonPhase();
  // we recompute the elongation from Sun and Moon vectors. DERIVED tolerance 0.05 deg (see above).
  const events = eph().moonQuarters(Date.UTC(2026, 0, 1), 16);
  const rows: string[] = [];
  const failures: string[] = [];
  for (const e of events) {
    const st = stateAt(e.utcMs);
    const dev = signedAngleDiffDeg(st.phase.eclipticElongationDeg, e.quarter * 90);
    rows.push(`${st.utcIso} quarter ${e.quarter}: elongation ${f(st.phase.eclipticElongationDeg, 4)} deg (deviation ${f(dev, 5)})`);
    if (Math.abs(dev) > 0.05) failures.push(`${st.utcIso}: deviation ${f(dev, 5)} deg`);
  }
  t.diagnostic(rows.join('\n'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

// ------------------------------------------------ 6. time handling and boundaries
test('time-unit trap: the adapter reads milliseconds as UTC milliseconds (J2000 Sun declination sanity)', { skip }, () => {
  // A bare number given to the library would mean DAYS since J2000. If that
  // mistake crept in, this instant would be wildly wrong. On 2000-01-01 12:00 UT
  // the Sun is near declination -23.0 deg at about 0.9833 AU.
  // SANITY: 0.3 deg and 0.001 AU.
  const st = stateAt(Date.UTC(2000, 0, 1, 12, 0, 0));
  const dec = (Math.asin(st.sun.dirFromEarthEqj.z) * 180) / Math.PI;
  assert.ok(Math.abs(dec - -23.03) <= 0.3, `declination ${f(dec, 3)} deg`);
  assert.ok(Math.abs(st.sun.distanceAu - 0.9833) <= 0.001, `distance ${f(st.sun.distanceAu, 5)} AU`);
});

test('delta-T: about 69 s in 2026 (32.184 s + 37 s TAI-UTC minus UT1-UTC); other epochs are finite', { skip }, (t) => {
  // SANITY band 62..76 s.
  const s2026 = stateAt(Date.UTC(2026, 9, 18, 12, 0, 0));
  assert.ok(s2026.timeScale.deltaTSeconds > 62 && s2026.timeScale.deltaTSeconds < 76, `delta-T ${s2026.timeScale.deltaTSeconds}`);
  const rows = ['1901-06-15', '1950-06-15', '2000-01-01', '2026-10-18', '2050-06-15', '2099-06-15'].map((d) => {
    const dt = stateAt(Date.parse(`${d}T12:00:00Z`)).timeScale.deltaTSeconds;
    assert.ok(Number.isFinite(dt));
    return `${d} delta-T ${f(dt, 2)} s`;
  });
  t.diagnostic(rows.join('\n'));
});

test('boundaries: the first and last supported instants compute, with the reference-span warning', { skip }, () => {
  for (const ms of [Date.UTC(1900, 0, 1, 0, 0, 0), Date.UTC(2100, 11, 31, 23, 59, 59)]) {
    const s = stateAt(ms);
    assert.ok(Number.isFinite(s.moon.distanceKm) && Number.isFinite(s.sun.distanceKm));
    assert.ok(s.warnings.some((w) => /reference spot checks/.test(w)), `no warning at ${s.utcIso}`);
  }
});

test('boundaries: leap day, fractional milliseconds and a pre-1970 instant compute', { skip }, () => {
  for (const ms of [Date.UTC(2024, 1, 29, 12, 0, 0), Date.UTC(2026, 9, 18, 12, 0, 0) + 0.5, Date.UTC(1950, 5, 15, 3, 4, 5)]) {
    const s = stateAt(ms);
    assert.ok(Number.isFinite(s.moon.distanceKm));
  }
});

test('playback-style stepping: a state at t is identical however it was reached (no accumulated drift)', { skip }, () => {
  const t0 = Date.UTC(2026, 9, 18, 12, 0, 0);
  const direct = stateAt(t0 + 3600_000 * 1000); // 1000 hours later, computed directly
  let ms = t0;
  for (let i = 0; i < 1000; i++) ms += 3600_000; // arrive step by step
  assert.deepEqual(stateAt(ms), direct);
});

// -------------------------------------------------------- 7. public entry point
test('index.ts: computeAstroState and nextMoonQuarters agree with the explicit-ephemeris functions', { skip }, async () => {
  const index = await import('./index.ts');
  const ms = Date.UTC(2026, 9, 18, 12, 0, 0);
  assert.deepEqual(index.computeAstroState(ms), computeAstroStateWith(eph(), ms));
  const q = index.nextMoonQuarters(ms, 4);
  assert.ok(q.ok);
  if (q.ok) {
    assert.deepEqual(q.value, eph().moonQuarters(ms, 4));
    // Next principal phase after 2026-10-18 12:00 UTC is First Quarter at 16:12 UTC (USNO).
    assert.equal(q.value[0]?.quarter, 1);
    assert.ok(Math.abs((q.value[0]?.utcMs ?? 0) - Date.parse('2026-10-18T16:12:00Z')) <= 150_000);
  }
  assert.equal(index.computeAstroState(Number.NaN).ok, false);
});
