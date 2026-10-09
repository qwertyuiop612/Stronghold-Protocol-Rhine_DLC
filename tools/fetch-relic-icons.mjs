// Fetch just the collectible icons; normal `npm run assets` includes the same plan.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Downloader } from './assets/downloader.mjs';
import { collectLeaves, resolveTemplate, contentHash, totalBytes } from './assets/manifest.mjs';
import { relicIconTemplate, prepareCustomRelicIcons } from './assets/relics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const assets = join(root, 'public', 'assets');
const template = relicIconTemplate();
await prepareCustomRelicIcons(assets);
const dl = new Downloader({ root: assets, ledgerPath: join(root, '.cache', 'assets-ledger.json'), concurrency: 6, timeoutMs: 30000 });
await dl.loadLedger();
await dl.run(collectLeaves(template).map(({ leaf }) => leaf.alts[0]).filter((alt) => alt.urls.length), 'collectible icons');
await dl.saveLedger();
const resolved = resolveTemplate(template, { root: assets, spine: new Map() });
if (resolved.misses.length) throw new Error(`Missing collectible icons: ${resolved.misses.join(', ')}`);
const path = join(root, 'data', 'assets.json');
const original = await readFile(path, 'utf8');
const manifest = JSON.parse(original);
manifest.relics = resolved.value;
const { version, hash, generator, stats, ...body } = manifest;
const files = new Set();
function collectFiles(value) {
  if (typeof value === 'string' && value.startsWith('/assets/')) files.add(value.slice(8));
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectFiles(v);
}
collectFiles(body);
manifest.hash = contentHash(body);
manifest.stats = { ...stats, files: files.size, bytes: totalBytes(assets, files), relics: Object.keys(manifest.relics).length };
await writeFile(path + '.relics.tmp', JSON.stringify(manifest, null, original.trim().includes('\n') ? 2 : undefined) + '\n');
await rename(path + '.relics.tmp', path);
console.log(`Collectible icons ready: ${Object.keys(manifest.relics).length}`);
