import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EDGE_CLOSE_DELAY_MS } from './edgePanelConfig.ts';

/** Checks the immersive layout rules by reading the real source files. Nothing is measured on screen. */
const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]): string => readFileSync(join(here, ...p), 'utf8');
// Comments are removed so only real markup is checked.
const code = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const tokens = read('..', 'styles', 'tokens.css');
const css = code(read('..', 'styles', 'immersive.css'));
const app = read('..', 'App.tsx');
const edge = code(read('EdgePanel.tsx'));
const moon = read('MoonViewport.tsx');
const orbit = read('OrbitPanel.tsx');

test('every --lg- variable used by immersive.css is defined in tokens.css', () => {
  const defined = new Set([...tokens.matchAll(/(--lg-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = [...css.matchAll(/var\(\s*(--lg-[a-z0-9-]+)/g)].map((m) => m[1] as string);
  assert.deepEqual([...new Set(used)].filter((n) => !defined.has(n)), []);
});

test('immersive.css has no literal hex colours and names no font family directly', () => {
  assert.deepEqual(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], []);
  for (const m of css.matchAll(/font-family:\s*([^;]+);/g)) {
    assert.match(m[1] as string, /^var\(--lg-font-(head|ui)\)$/, `font-family ${m[1]}`);
  }
  assert.ok(!css.includes('--lg-font-mark'), 'the wordmark font is not used outside the wordmark');
});

test('blur lives only in the shared glass recipe: immersive.css may switch blur off but never on', () => {
  const values = [...css.matchAll(/backdrop-filter:\s*([^;]+);/g)].map((m) => (m[1] as string).trim());
  assert.deepEqual(values.filter((v) => v !== 'none'), []);
});

test('the surfaces that blur are exactly the dock, the readout and the edge panels, all through .lg-g1; docked rails use the near-solid tier', () => {
  assert.match(app, /dock dock-left lg-g2/);
  assert.match(app, /dock dock-right lg-g2/);
  assert.match(app, /className="sg-dock lg-g1"/);
  assert.match(moon, /className="sg-readout lg-g1"/);
  assert.match(edge, /className="ep-panel lg-g1 lg-dense"/);
  for (const [name, src] of [['App', app], ['Moon', moon], ['Orbit', orbit], ['EdgePanel', edge]] as const) {
    const n = (src.match(/lg-g1/g) ?? []).length;
    assert.ok(n <= 1, `${name} references lg-g1 ${n} times`);
  }
  // handles, the environment switch and chips stay unblurred
  assert.ok(!/ep-handle[^"]*lg-g1|sg-env[^"]*lg-g1/.test(app + edge));
});

test('hidden stages keep their size: visibility, never display:none, and both stages are always rendered', () => {
  const stageRules = [...css.matchAll(/\.app \.sg-stage[^{]*\{([^}]*)\}/g)].map((m) => m[1] as string).join('\n');
  assert.match(stageRules, /visibility:\s*hidden/);
  assert.ok(!/display:\s*none/.test(stageRules));
  assert.match(app, /<MoonViewport store=\{store\} active=\{env === 'moon'\}/);
  assert.match(app, /<OrbitPanel store=\{store\} moonKmAt=\{moonKmLive\} active=\{env === 'earth'\} \/>/);
  // switching the environment is local UI state only
  assert.ok(!/key=\{env\}/.test(app));
});

test('panels float: overlays are absolutely positioned and no panel rule sets viewport width or height', () => {
  assert.match(css, /\.app \.ep \{ position: absolute; inset: 0;/);
  assert.match(css, /\.app \.ep-panel \{\s*position: absolute;/);
  assert.ok(!/\.viewport[^{]*\{[^}]*(width|height):\s*calc/.test(css));
});

test('edge panels: tab always visible, pointer delay is sensible, Escape and focus are handled', () => {
  assert.ok(EDGE_CLOSE_DELAY_MS >= 200 && EDGE_CLOSE_DELAY_MS <= 600, `delay ${EDGE_CLOSE_DELAY_MS}`);
  assert.match(edge, /e\.key === 'Escape'/);
  assert.match(edge, /aria-expanded=\{open\}/);
  assert.match(edge, /onFocus=\{enter\}/);
  assert.ok(!/\.ep-handle[^}]*(visibility|display):\s*(hidden|none)/.test(css), 'the tab is never hidden');
});

test('reduced motion: panel slide uses the token that reduced motion sets to 0', () => {
  assert.match(css, /transform: translateX\(var\(--lg-open-slide\)\)/);
});

import { nextLsiView } from './lsiView.ts';

test('LSI layout: fullscreen remembers where it came from and restores it', () => {
  const exp = { view: 'expanded', before: 'expanded' } as const;
  const full = nextLsiView(exp, 'fullscreen');
  assert.deepEqual(full, { view: 'fullscreen', before: 'expanded' });
  assert.deepEqual(nextLsiView(full, 'fullscreen'), full); // idempotent
  assert.deepEqual(nextLsiView(full, 'expanded'), { view: 'expanded', before: 'expanded' });
  const min = nextLsiView(exp, 'minimized');
  assert.deepEqual(min, { view: 'minimized', before: 'minimized' });
  assert.deepEqual(nextLsiView(min, 'expanded'), { view: 'expanded', before: 'expanded' });
});

test('LSI is one component instance in every layout: the layouts are CSS classes, not separate panels', () => {
  const sp = readFileSync(join(here, 'SolarPanel.tsx'), 'utf8');
  assert.equal((sp.match(/export function SolarPanel/g) ?? []).length, 1);
  assert.match(sp, /sp-full/);
  assert.match(sp, /sp-side/);
  assert.match(sp, /sp-min/);
  // the minimised early return comes after every hook, so no hook is skipped
  const start = sp.indexOf('export function SolarPanel');
  const ret = sp.indexOf("if (view === 'minimized')");
  const end = sp.indexOf('\n}\n', ret);
  assert.ok(start >= 0 && ret > start && end > ret);
  assert.ok(sp.slice(start, ret).includes('useSolarSite('));
  assert.deepEqual(sp.slice(ret, end).match(/\buse[A-Z]\w*\(/g) ?? [], [], 'no hook after the early return');
});

test('LSI stays a sunlight and terrain-obstruction instrument: this refinement adds no power, battery or grid text', () => {
  for (const [n, t] of [['App', app], ['immersive.css', css], ['EdgePanel', edge], ['Moon', moon]] as const) {
    assert.ok(!/battery|power grid|electrical grid|electrical|power-generation/i.test(t), `${n} mentions power systems`);
  }
});
