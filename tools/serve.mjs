// Static server for the assembled Serenity site (replaces serve.cjs, serve.ps1 and START_SERENITY.cmd).
// Behaviour follows the original serve.cjs: GET/HEAD only, 403 outside the root, 404 for missing files,
// directory requests serve index.html, nosniff and no-store headers. Additionally, paths under /payloads/
// that are not files fall back to the payload app's index.html (client-side routing).
//
// Usage: node tools/serve.mjs            (serves dist/ on 127.0.0.1:8095)
//        SERENITY_PORT=8100 node tools/serve.mjs
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', 'dist');
const host = '127.0.0.1';
const port = Number(process.env.SERENITY_PORT || 8095);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.raw': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Resolves a URL path to a file inside root, or null when it is outside root or missing. */
function resolveFile(pathname) {
  let file = resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + sep)) return { status: 403 };
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
    const info = statSync(file);
    return info.isFile() ? { file, info } : { status: 404 };
  } catch {
    return { status: 404 };
  }
}

const server = createServer((request, response) => {
  const reply = (status) => response.writeHead(status).end();
  if (!['GET', 'HEAD'].includes(request.method)) return reply(405);

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    return reply(400);
  }

  let found = resolveFile(pathname);
  if (found.status === 404 && pathname.startsWith('/payloads/')) {
    // Client-side routes of the payload app, e.g. /payloads/payload/13.
    found = resolveFile('/payloads/index.html');
  }
  if (!found.file) return reply(found.status);

  response.writeHead(200, {
    'Content-Type': types[extname(found.file)] || 'application/octet-stream',
    'Content-Length': found.info.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  if (request.method === 'HEAD') return response.end();
  createReadStream(found.file)
    .on('error', () => response.destroy())
    .pipe(response);
});

server.on('error', (error) => {
  console.error('Serenity could not start:', error.message);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Serenity is running at http://${host}:${port}/`);
  console.log('Press Ctrl+C to stop.');
});
