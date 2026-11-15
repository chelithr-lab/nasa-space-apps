#!/usr/bin/env node
/**
 * Builds public/data/catalogue.json from:
 *   - content/lunar_payloads_catalogue.md   (source of truth: categories, numbering, names)
 *   - content/category-meta.json            (hand-edited descriptions + icon keys)
 *   - public/data/payloads/NNN_<name>_payload.json (detail files, matched by payload NUMBER)
 *
 * Usage:
 *   node tools/build-catalogue.mjs           write the index
 *   node tools/build-catalogue.mjs --check   exit 1 if the committed index is out of date
 * Run whenever the catalogue changes or a payload JSON is added/removed.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD_FILE = path.join(ROOT, 'content', 'lunar_payloads_catalogue.md');
const META_FILE = path.join(ROOT, 'content', 'category-meta.json');
const PAYLOAD_DIR = path.join(ROOT, 'public', 'data', 'payloads');
const OUT_FILE = path.join(ROOT, 'public', 'data', 'catalogue.json');
const CHECK = process.argv.includes('--check');
const SUMMARY_LEN = 150;
// Payload article files: number first, e.g. 001_passive_seismometer_payload.json
const PAYLOAD_FILE = /^(\d{3})_.+_payload\.json$/i;

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function truncate(text, max) {
  if (!text || text.length <= max) return text || null;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

async function main() {
  const md = await readFile(MD_FILE, 'utf8');
  const meta = JSON.parse(await readFile(META_FILE, 'utf8'));

  const categories = [];
  const payloads = [];
  let current = null;

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const cat = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (cat) {
      const number = Number(cat[1]);
      const name = cat[2].trim();
      const m = meta[String(number)] || {};
      current = {
        number, name, slug: slugify(name),
        description: m.description || '', icon: m.icon || 'target',
        payload_numbers: [],
      };
      categories.push(current);
      continue;
    }
    const item = line.match(/^(\d+)\.\s+(.+)$/);
    if (item && current) {
      const number = Number(item[1]);
      const name = item[2].trim();
      payloads.push({ number, name, slug: slugify(name), category: current.number,
        detail_file: null, thumb: null, summary: null });
      current.payload_numbers.push(number);
    }
  }

  // Match detail files by number, not by name.
  const files = (await readdir(PAYLOAD_DIR)).filter((f) => PAYLOAD_FILE.test(f));
  const byNumber = new Map(payloads.map((p) => [p.number, p]));
  const warnings = [];

  for (const file of files) {
    const number = Number(file.match(PAYLOAD_FILE)[1]);
    const p = byNumber.get(number);
    if (!p) { warnings.push(`${file}: no catalogue payload #${number}`); continue; }
    let json;
    try { json = JSON.parse(await readFile(path.join(PAYLOAD_DIR, file), 'utf8')); }
    catch (e) { warnings.push(`${file}: invalid JSON (${e.message})`); continue; }
    const article = json?.payload?.article || {};
    p.detail_file = `data/payloads/${file}`; // relative to the app base URL
    p.summary = truncate(article.overview, SUMMARY_LEN);
    // Card thumbnail: prefer the overview's own images, then the master image registry.
    const candidates = [...(Array.isArray(article.overview_images) ? article.overview_images : []), ...(article.images || [])];
    const img = candidates.find((i) => isHttp(i?.image_url));
    p.thumb = img ? img.image_url : null;
    if (json?.payload?.number !== number) warnings.push(`${file}: payload.number ${json?.payload?.number} != file number ${number}`);
  }

  // Validation
  const nums = payloads.map((p) => p.number);
  nums.forEach((n, i) => { if (n !== i + 1) warnings.push(`Numbering gap/out of order at position ${i + 1}: #${n}`); });
  const seen = new Map();
  for (const p of payloads) {
    const k = p.name.toLowerCase();
    if (seen.has(k)) warnings.push(`Duplicate name "${p.name}": #${seen.get(k)} and #${p.number} (kept as separate payloads)`);
    else seen.set(k, p.number);
  }

  const out = {
    generated_at: new Date().toISOString(),
    source: 'lunar_payloads_catalogue.md',
    counts: {
      categories: categories.length,
      payloads: payloads.length,
      with_details: payloads.filter((p) => p.detail_file).length,
    },
    categories,
    payloads,
  };
  const text = JSON.stringify(out) + '\n';

  if (CHECK) {
    // Ignore generated_at: it changes on every run.
    const strip = (t) => t.replace(/"generated_at":"[^"]*",/, '');
    let current = '';
    try { current = await readFile(OUT_FILE, 'utf8'); } catch { /* missing counts as out of date */ }
    if (strip(current) !== strip(text)) {
      console.error(`catalogue.json is out of date (${path.relative(ROOT, OUT_FILE)}). Run: npm run catalogue`);
      process.exit(1);
    }
    console.log(`catalogue.json is up to date: ${out.counts.payloads} payloads, ${out.counts.with_details} with articles`);
    return;
  }

  await writeFile(OUT_FILE, text, 'utf8');

  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`  categories:   ${out.counts.categories}`);
  console.log(`  payloads:     ${out.counts.payloads}`);
  console.log(`  with details: ${out.counts.with_details}`);
  for (const c of categories) console.log(`    ${String(c.number).padStart(2)}. ${c.name} (${c.payload_numbers.length})`);
  if (warnings.length) { console.log('Warnings:'); warnings.forEach((w) => console.log('  - ' + w)); }
}

main().catch((e) => { console.error(e); process.exit(1); });
