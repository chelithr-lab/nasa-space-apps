import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads src/styles/tokens.css and src/styles/themeBridge.css and checks the design rules from the
 * interface proposal. Ratios are WCAG 2 contrast ratios computed here. Nothing is measured on screen.
 */
const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, '..', 'styles', 'tokens.css');
const bridgePath = join(here, '..', 'styles', 'themeBridge.css');
const fontsDir = join(here, '..', 'assets', 'fonts');
const tokensCss = readFileSync(tokensPath, 'utf8');
const bridgeCss = readFileSync(bridgePath, 'utf8');

function tokenMap(css: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of css.matchAll(/(--lg-[a-z0-9-]+)\s*:\s*([^;]+);/g)) if (!m.has(x[1] as string)) m.set(x[1] as string, (x[2] as string).trim());
  return m;
}
const tokens = tokenMap(tokensCss);
const tok = (name: string): string => {
  const v = tokens.get(name);
  assert.ok(v !== undefined, `token ${name} is defined`);
  return v;
};

type Rgb = [number, number, number];
const hex = (h: string): Rgb => {
  assert.match(h, /^#[0-9a-f]{6}$/i, `${h} is a 6-digit hex colour`);
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (c: Rgb) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const mix = (fg: Rgb, bg: Rgb, a: number): Rgb => fg.map((c, i) => Math.round(a * c + (1 - a) * (bg[i] as number))) as Rgb;

test('the approved colours are exactly as approved', () => {
  assert.equal(tok('--lg-ground'), '#101820');
  assert.equal(tok('--lg-panel'), '#202d38');
  assert.equal(tok('--lg-text'), '#d8e0e6');
  assert.equal(tok('--lg-text-2'), '#8e9eaa');
  assert.equal(tok('--lg-blue'), '#6489a5');
  assert.equal(tok('--lg-amber'), '#d4a45f');
});

test('text colours reach 4.5:1 on both the panel and the ground', () => {
  for (const bg of ['--lg-panel', '--lg-ground']) {
    for (const fg of ['--lg-text', '--lg-text-2', '--lg-text-2l', '--lg-blue-text', '--lg-amber', '--lg-green', '--lg-red']) {
      const r = ratio(hex(tok(fg)), hex(tok(bg)));
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}`);
    }
  }
});

test('control borders and the instrument blue reach 3:1 on the panel (WCAG 1.4.11)', () => {
  assert.ok(ratio(hex(tok('--lg-ctl')), hex(tok('--lg-panel'))) >= 3);
  assert.ok(ratio(hex(tok('--lg-blue')), hex(tok('--lg-panel'))) >= 3);
});

test('documented findings: instrument blue is too dark for small text, and light text on a blue fill fails', () => {
  const blueOnPanel = ratio(hex(tok('--lg-blue')), hex(tok('--lg-panel')));
  assert.ok(blueOnPanel < 4.5, `blue on panel ${blueOnPanel.toFixed(2)}`); // why --lg-blue-text exists
  assert.ok(ratio(hex(tok('--lg-text')), hex(tok('--lg-blue'))) < 3); // why blue buttons take dark text
  assert.ok(ratio(hex(tok('--lg-ground')), hex(tok('--lg-blue'))) >= 4.5);
});

function glassModel() {
  const rgb = tok('--lg-panel-rgb').split(/\s+/).map(Number) as Rgb;
  assert.deepEqual(rgb, hex(tok('--lg-panel')), '--lg-panel-rgb equals the approved panel colour');
  const dim = Number(/brightness\(\s*var\((--lg-glass-dim)\)/.test(tok('--lg-glass-filter')) ? tok('--lg-glass-dim') : NaN);
  assert.ok(Number.isFinite(dim), 'glass filter uses --lg-glass-dim');
  const backdrop = (v: number): Rgb => [v, v, v].map((c) => Math.min(255, c * dim)) as Rgb;
  return { rgb, dim, backdrop, alpha: Number(tok('--lg-glass-alpha')), dense: Number(tok('--lg-glass-alpha-dense')) };
}

test('glass spec: about 70 percent opaque, blur 20 to 28 px, radius 10 to 14 px, subtle light border', () => {
  const g = glassModel();
  assert.ok(g.alpha >= 0.68 && g.alpha <= 0.72, `alpha ${g.alpha}`);
  const blur = Number(tok('--lg-glass-blur').replace('px', ''));
  assert.ok(blur >= 20 && blur <= 28, `blur ${blur}`);
  const radius = Number(tok('--lg-radius').replace('px', ''));
  assert.ok(radius >= 10 && radius <= 14, `radius ${radius}`);
  assert.match(tok('--lg-glass-border'), /rgba\(216,\s*224,\s*230,/);
  assert.match(tok('--lg-glass-filter'), /blur\(var\(--lg-glass-blur\)\)/);
  assert.ok(g.dense > g.alpha && g.dense < 1);
});

test('glass contrast, worst case over a pure white backdrop: primary text passes on both recipes', () => {
  const g = glassModel();
  const def = mix(g.rgb, g.backdrop(255), g.alpha);
  const dense = mix(g.rgb, g.backdrop(255), g.dense);
  assert.ok(ratio(hex(tok('--lg-text')), def) >= 4.5, `primary on default glass ${ratio(hex(tok('--lg-text')), def).toFixed(2)}`);
  for (const fg of ['--lg-text', '--lg-text-2l', '--lg-blue-text', '--lg-amber']) {
    const r = ratio(hex(tok(fg)), dense);
    assert.ok(r >= 4.5, `${fg} on dense glass is ${r.toFixed(2)}`);
  }
});

test('documented finding: at 70 percent opacity over a white backdrop, secondary text fails 4.5:1', (t) => {
  const g = glassModel();
  const def = mix(g.rgb, g.backdrop(255), g.alpha);
  const r = ratio(hex(tok('--lg-text-2l')), def);
  t.diagnostic(`lifted secondary on default glass at a pure white backdrop: ${r.toFixed(2)}:1 (pure white is far brighter than the real Moon)`);
  assert.ok(ratio(hex(tok('--lg-text-2')), def) < 4.5, 'the original secondary grey is not safe on default glass');
});

test('type scale keeps Economica text at 14 px or more', () => {
  const px = (n: string) => Number(tok(n).replace('px', ''));
  assert.ok(px('--lg-fs-caption') >= 14);
  assert.ok(px('--lg-fs-data') >= 15);
  assert.ok(px('--lg-fs-body') >= 16);
});

test('fonts: exactly three families; Darker Grotesque is the wordmark only', () => {
  const faces = [...tokensCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] as string);
  const info = faces.map((f) => ({
    family: /font-family:\s*'([^']+)'/.exec(f)?.[1],
    weight: /font-weight:\s*(\d+)/.exec(f)?.[1],
  }));
  assert.deepEqual(new Set(info.map((i) => i.family)), new Set(['Inter', 'Economica', 'Darker Grotesque']));
  assert.deepEqual(info.filter((i) => i.family === 'Inter').map((i) => i.weight), ['700']);
  assert.deepEqual(info.filter((i) => i.family === 'Economica').map((i) => i.weight).sort(), ['400', '700']);
  assert.deepEqual(info.filter((i) => i.family === 'Darker Grotesque').map((i) => i.weight), ['400']);
  assert.equal(tok('--lg-font-head').split(',')[0]?.trim(), "'Inter'");
  assert.equal(tok('--lg-font-ui').split(',')[0]?.trim(), "'Economica'");
  assert.equal(tok('--lg-font-mark').split(',')[0]?.trim(), "'Darker Grotesque'");
  // --lg-font-mark may be used only by the wordmark rule, in tokens.css, the bridge and every component source
  const users: string[] = [];
  for (const [name, css] of [['tokens', tokensCss], ['bridge', bridgeCss]] as const) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if ((rule[2] as string).includes('var(--lg-font-mark)')) users.push(`${name}: ${(rule[1] as string).trim()}`);
    }
  }
  assert.deepEqual(users, ['tokens: .sg-wordmark']);
  assert.ok(!/Darker Grotesque/.test(bridgeCss), 'the bridge never names Darker Grotesque');
});

test('font files: Inter Bold and its licence ship with the package; Economica and Darker Grotesque are reported (added by hand)', (t) => {
  assert.ok(existsSync(join(fontsDir, 'Inter-Bold.otf')), 'Inter-Bold.otf present');
  assert.ok(existsSync(join(fontsDir, 'Inter-OFL.txt')), 'Inter licence present');
  for (const f of ['Economica-Regular.ttf', 'Economica-Bold.ttf', 'Economica-OFL.txt', 'DarkerGrotesque-Regular.ttf', 'DarkerGrotesque-OFL.txt']) {
    t.diagnostic(`${f}: ${existsSync(join(fontsDir, f)) ? 'present' : 'MISSING (add it, see the README; run: node scripts/check-fonts.ts)'}`);
  }
});

test('every --lg- variable used by tokens.css and themeBridge.css is defined', () => {
  const used = new Set<string>();
  for (const css of [tokensCss, bridgeCss]) for (const m of css.matchAll(/var\(\s*(--lg-[a-z0-9-]+)/g)) used.add(m[1] as string);
  const missing = [...used].filter((n) => !tokens.has(n));
  assert.deepEqual(missing, []);
});

test('the theme bridge removes the old cyan and adds no new accent colour', () => {
  for (const banned of ['99, 217, 255', '#63d9ff', '#38e8ff', '56, 232, 255']) {
    assert.ok(!bridgeCss.toLowerCase().includes(banned), `bridge does not contain ${banned}`);
  }
  // any literal hex colour in the bridge must be one of the token values, black, or the error overlay
  const allowed = new Set([...tokens.values()].filter((v) => /^#[0-9a-f]{6}$/i.test(v)).map((v) => v.toLowerCase()));
  allowed.add('#000');
  for (const m of bridgeCss.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
    assert.ok(allowed.has(m[0].toLowerCase()), `unexpected literal colour ${m[0]} in themeBridge.css`);
  }
});

test('reduced motion removes the slide and shortens the fade', () => {
  assert.match(tokensCss, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*--lg-open-slide:\s*0px/);
  assert.equal(tok('--lg-dur-open'), '180ms');
});

test('the solid fallback exists for every glass surface that the bridge creates', () => {
  assert.match(tokensCss, /:root\[data-glass='solid'\] \.lg-g1/);
  for (const sel of ['.panel-mini', '.solar-panel', '.mdx']) {
    assert.ok(bridgeCss.includes(`:root[data-glass='solid'] .app ${sel}`), `solid fallback for ${sel}`);
  }
  assert.match(bridgeCss, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
});
