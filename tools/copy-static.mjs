// Copies a static app's source folder into the assembled site. Used by build-site.mjs for the home page
// and the mission explorer, which have no bundler.
import { cpSync, existsSync, mkdirSync } from 'node:fs';

/**
 * @param {string} from  source folder (apps/<name>/src)
 * @param {string} to    destination folder inside dist/
 */
export function copyStatic(from, to) {
  if (!existsSync(from)) throw new Error(`Static source folder not found: ${from}`);
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}
