/**
 * Checks the font files in src/assets/fonts before you build.
 * Run from the project folder:  node scripts/check-fonts.ts
 * It reads each font's own name table, so a wrong download (for example a different family or weight) is caught.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Expect {
  readonly file: string;
  readonly family: string;
  readonly weight: number;
  readonly required: boolean;
}

const dir = join(process.cwd(), 'src', 'assets', 'fonts');
const EXPECT: readonly Expect[] = [
  { file: 'Inter-Bold.otf', family: 'Inter', weight: 700, required: true },
  { file: 'Economica-Regular.ttf', family: 'Economica', weight: 400, required: true },
  { file: 'Economica-Bold.ttf', family: 'Economica', weight: 700, required: true },
  // Must be the static Regular file, not the variable font. Used for the Serenity wordmark only.
  { file: 'DarkerGrotesque-Regular.ttf', family: 'Darker Grotesque', weight: 400, required: true },
];
const LICENCES = ['Inter-OFL.txt', 'Economica-OFL.txt', 'DarkerGrotesque-OFL.txt'];

interface FontInfo {
  readonly family: string | null;
  readonly weight: number | null;
  readonly kind: string;
}

/** Reads family name (ID 1, or 16 if present) and OS/2 weight from a TrueType or OpenType file. */
export function readFontInfo(buf: Buffer): FontInfo {
  const tag = buf.toString('latin1', 0, 4);
  const sfnt = buf.readUInt32BE(0);
  const kind = tag === 'OTTO' ? 'OpenType (CFF)' : sfnt === 0x00010000 || tag === 'true' ? 'TrueType' : tag;
  if (kind !== 'OpenType (CFF)' && kind !== 'TrueType') return { family: null, weight: null, kind };
  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.set(buf.toString('latin1', o, o + 4), { offset: buf.readUInt32BE(o + 8), length: buf.readUInt32BE(o + 12) });
  }
  let weight: number | null = null;
  const os2 = tables.get('OS/2');
  if (os2) weight = buf.readUInt16BE(os2.offset + 4);
  let family: string | null = null;
  const name = tables.get('name');
  if (name) {
    const count = buf.readUInt16BE(name.offset + 2);
    const strBase = name.offset + buf.readUInt16BE(name.offset + 4);
    const found = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      const r = name.offset + 6 + i * 12;
      const platform = buf.readUInt16BE(r);
      const id = buf.readUInt16BE(r + 6);
      const len = buf.readUInt16BE(r + 8);
      const off = buf.readUInt16BE(r + 10);
      if ((id !== 1 && id !== 16) || found.has(id)) continue;
      const raw = buf.subarray(strBase + off, strBase + off + len);
      if (platform === 3 || platform === 0) found.set(id, Buffer.from(raw).swap16().toString('utf16le'));
      else if (platform === 1) found.set(id, raw.toString('latin1'));
    }
    family = found.get(16) ?? found.get(1) ?? null;
  }
  return { family, weight, kind };
}

function main(): number {
  let problems = 0;
  console.log(`Checking ${dir}\n`);
  for (const e of EXPECT) {
    const p = join(dir, e.file);
    if (!existsSync(p)) {
      console.log(`MISSING  ${e.file}  (${e.required ? 'required' : 'optional'})`);
      if (e.required) problems++;
      continue;
    }
    const buf = readFileSync(p);
    let info: FontInfo;
    try {
      info = readFontInfo(buf);
    } catch (err) {
      console.log(`BAD      ${e.file}: cannot read it (${(err as Error).message})`);
      problems++;
      continue;
    }
    const okFamily = info.family === e.family;
    const okWeight = info.weight === e.weight;
    const ok = okFamily && okWeight && buf.length > 20_000;
    console.log(
      `${ok ? 'OK      ' : 'WRONG   '} ${e.file}: ${info.kind}, family "${info.family}", weight ${info.weight}, ${(buf.length / 1024).toFixed(0)} KB` +
        (ok ? '' : `  (expected family "${e.family}", weight ${e.weight})`),
    );
    if (!ok) problems++;
  }
  for (const l of LICENCES) {
    const present = existsSync(join(dir, l));
    console.log(`${present ? 'OK      ' : 'MISSING '} ${l}`);
    if (!present) problems++;
  }
  console.log(problems === 0 ? '\nAll font files are in place.' : `\n${problems} problem(s). See the README, step 1.`);
  return problems === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('check-fonts.ts')) {
  process.exitCode = main();
}
