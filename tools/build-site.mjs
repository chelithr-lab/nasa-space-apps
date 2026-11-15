// Builds every Serenity app and assembles one site in dist/:
//   dist/                 home page (apps/home)
//   dist/explorer/        3D lunar explorer (Vite, base /explorer/)
//   dist/missions/        mission explorer (static, apps/missions)
//   dist/payloads/        payload explorer (Vite, base /payloads/)
//
// Each app is built with its own toolchain and its own pinned versions. Base paths are passed through the
// environment of the child process (not a shell command), so Git Bash on Windows cannot rewrite them.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { copyStatic } from './copy-static.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const apps = join(root, 'apps');

/** Runs a package's bin with node, from the app's own folder, and fails the build on error. */
function runBin(appDir, pkg, bin, args, env = {}) {
  const requireFromApp = createRequire(join(appDir, 'package.json'));
  const pkgJson = requireFromApp.resolve(`${pkg}/package.json`);
  const binPath = join(dirname(pkgJson), bin);
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: appDir,
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${pkg} ${args.join(' ')} failed in ${appDir} (exit ${result.status})`);
}

function buildViteApp(name, base, extraSteps = []) {
  const appDir = join(apps, name);
  console.log(`\n== ${name} (base ${base})`);
  for (const step of extraSteps) step(appDir);
  runBin(appDir, 'vite', 'bin/vite.js', ['build', '--outDir', join(dist, name), '--emptyOutDir'], { VITE_BASE: base });
}

rmSync(dist, { recursive: true, force: true });

console.log('== home (static)');
copyStatic(join(apps, 'home', 'src'), dist);

console.log('\n== missions (static)');
copyStatic(join(apps, 'missions', 'src'), join(dist, 'missions'));

buildViteApp('explorer', '/explorer/', [
  (appDir) => runBin(appDir, 'typescript', 'bin/tsc', ['-b']),
]);

buildViteApp('payloads', '/payloads/', [
  (appDir) => runBin(appDir, 'typescript', 'bin/tsc', ['-b']),
  (appDir) => spawnNode(join(appDir, 'tools', 'build-catalogue.mjs'), appDir),
]);

function spawnNode(script, cwd) {
  const result = spawnSync(process.execPath, [script], { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${script} failed (exit ${result.status})`);
}

console.log(`\nSite assembled in ${dist}`);
