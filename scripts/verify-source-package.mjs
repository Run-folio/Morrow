import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Read-only release check. No network, generation or installation.
const root = process.cwd();
if (!lstatSync(resolve(root, 'data')).isDirectory()) throw new Error('Source-package data must be a regular directory');
const manifest = JSON.parse(readFileSync(resolve(root, 'data/package-manifest.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = new Set();
for (const file of manifest.files) {
  if (!/^[A-Za-z0-9._/-]+$/.test(file.path) || file.path.split('/').some(part => part === '..' || !part) || paths.has(file.path)) throw new Error('Invalid source-package data path');
  paths.add(file.path);
  let parent = resolve(root, 'data');
  for (const part of file.path.split('/').slice(0, -1)) {
    parent = resolve(parent, part);
    if (!lstatSync(parent).isDirectory()) throw new Error(`Source-package data directory is not regular: ${file.path}`);
  }
  const path = resolve(root, 'data', file.path);
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`Data is not a regular source-package file: ${file.path}`);
  const bytes = readFileSync(path);
  if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`Source-package data differs: ${file.path}`);
}
const fingerprint = sha(manifest.files.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => `${file.path}\0${file.sha256}\n`).join(''));
if (fingerprint !== manifest.fingerprint) throw new Error('Source-package data fingerprint differs');

const distIndex = process.argv.indexOf('--dist');
const traces = [];
if (distIndex !== -1) {
  if (!process.argv[distIndex + 1]) throw new Error('Provide the completed build directory after --dist');
  const dist = resolve(root, process.argv[distIndex + 1]);
  const files = manifest.files.filter(file => file.path.startsWith('place-reference/'));
  for (const route of ['journey-geocode', 'journey-discover', 'journey-route-image', 'journey-capture', 'journey-day-trips']) {
    const tracePath = resolve(dist, 'server/app/api', route, 'route.js.nft.json');
    const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
    const included = new Set(trace.files.map(file => resolve(dirname(tracePath), file)));
    for (const file of files) if (!included.has(resolve(root, 'data', file.path))) throw new Error(`${route} omits ${file.path} from its runtime trace`);
    traces.push({ route, referenceFiles: files.length });
  }
}
console.log(JSON.stringify({ dataFiles: manifest.files.length, fingerprint, traces, sourceDataRegular: true }));
