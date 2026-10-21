import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import dependencies from '../public/easyt-offline-dependencies.js';
import { MORROVIA_OFFLINE_READER_FLOOR } from '../lib/easyt/offline-reader-floor.ts';

// HTML omits lazy chunks. Only public build files, never user/API responses.
function canonicalAssetPath(pathname) {
  try {
    if (!pathname.startsWith('/') || pathname.includes('//')) return null;
    const segments = pathname.slice(1).split('/').map(segment => decodeURIComponent(segment));
    if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || segment.includes('%'))) return null;
    return '/' + segments.map(segment => encodeURIComponent(segment)).join('/');
  } catch { return null; }
}

// Keep this public module boundary in step with the service-worker allowlist.
// Parse actual ESM imports (including re-exports and literal dynamic imports),
// so an added or missing dependency cannot silently qualify a cold graph.
const publicWorkerModules = new Set(['/maplibre/maplibre-gl-worker.mjs', '/maplibre/maplibre-gl-shared.mjs']);
// MapLibre 6.1.0 also contains two parameterized imports for its optional custom
// script/RTL plugin API, which this app does not enable. They are not startup
// dependencies. Only these exact reviewed distribution bytes may contain them;
// a changed module with an unresolvable import must fail qualification.
const optionalPluginLoaderWorkerSha256 = '5a77b4637ea5ae64f0b1f208e4b1f4d9c681e2575d96e592f2074925597224c6';
function addPublicWorkerGraph(root, add) {
  const visited = new Set();
  const visit = url => {
    if (visited.has(url)) return;
    if (!publicWorkerModules.has(url)) throw new Error('Offline worker dependency is outside the supported public graph: ' + url);
    visited.add(url);
    const file = path.join(root, 'public', url.slice(1));
    let source;
    try { add(url, file); source = fs.readFileSync(file, 'utf8'); }
    catch { throw new Error('Offline worker dependency unavailable: ' + url); }
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (parsed.parseDiagnostics.length) throw new Error('Offline worker module could not be parsed: ' + url);
    const knownOptionalPluginLoader = url === '/maplibre/maplibre-gl-worker.mjs'
      && createHash('sha256').update(source).digest('hex') === optionalPluginLoaderWorkerSha256;
    const dependency = node => {
      if (!node || !ts.isStringLiteralLike(node)) throw new Error('Offline worker module dependency must be a literal');
      const relative = node.text;
      if (!relative.startsWith('./') || canonicalAssetPath('/maplibre/' + relative.slice(2)) !== '/maplibre/' + relative.slice(2)) throw new Error('Offline worker dependency must be a canonical local module');
      visit('/maplibre/' + relative.slice(2));
    };
    const inspect = node => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier) dependency(node.moduleSpecifier);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (!knownOptionalPluginLoader || node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) dependency(node.arguments[0]);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(parsed);
  };
  for (const url of publicWorkerModules) visit(url);
}

export function writeOfflineShellManifest(root, dist = '.next') {
  const buildRoot = path.join(root, dist);
  const buildId = fs.readFileSync(path.join(buildRoot, 'BUILD_ID'), 'utf8').trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(buildId)) throw new Error('Invalid offline build identity');
  const serverFiles = JSON.parse(fs.readFileSync(path.join(buildRoot, 'required-server-files.json'), 'utf8'));
  const buildCommit = serverFiles.config?.env?.MORROVIA_BUILD_COMMIT;
  if (typeof buildCommit !== 'string' || (buildCommit !== '' && !/^[a-f0-9]{40}$/i.test(buildCommit))) throw new Error('Invalid offline commit identity');
  const assets = [];
  const add = (url, file) => {
    if (canonicalAssetPath(url) !== url) throw new Error('Unsafe offline asset path');
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Offline asset must be a regular build file');
    assets.push({ url, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  };
  const staticRoot = path.join(buildRoot, 'static');
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else add('/_next/static/' + path.relative(staticRoot, file).split(path.sep).map(segment => encodeURIComponent(segment)).join('/'), file);
    }
  };
  walk(staticRoot);
  if (!assets.length) throw new Error('Offline client graph is empty');
  for (const url of ['/easyt-offline-dependencies.js', '/easyt-icon.svg']) add(url, path.join(root, 'public', url.slice(1)));
  addPublicWorkerGraph(root, add);
  assets.sort((a, b) => a.url.localeCompare(b.url, 'en'));
  const assetUrls = new Set(assets.map(asset => asset.url));
  for (const route of ['journey/new', 'journey/plan']) {
    const html = fs.readFileSync(path.join(buildRoot, 'server/app', route + '.html'), 'utf8');
    if (!html.includes(`name="morrovia-offline-reader" content="${MORROVIA_OFFLINE_READER_FLOOR}"`)
      || !html.includes(`name="morrovia-build-commit" content="${buildCommit}"`)) throw new Error('Offline shell reader/build marker missing: ' + route);
    for (const raw of dependencies.extract(html)) {
      const url = canonicalAssetPath(raw);
      if (!url) throw new Error('Unsafe offline HTML dependency');
      if (!assetUrls.has(url)) throw new Error('Offline shell dependency missing: ' + url);
    }
  }
  const manifest = { version: 1, readerFloor: MORROVIA_OFFLINE_READER_FLOOR, buildId, buildCommit, assets };
  manifest.artifactId = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const output = 'self.MORROVIA_OFFLINE_SHELL = Object.freeze(' + JSON.stringify(manifest) + ');\n';
  fs.writeFileSync(path.join(root, 'public/easyt-offline-manifest.js'), output);
  if (process.env.STATIC_EXPORT === '1') fs.writeFileSync(path.join(root, 'out/easyt-offline-manifest.js'), output);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = writeOfflineShellManifest(process.cwd(), process.env.NEXT_DIST_DIR ?? '.next');
  console.log(JSON.stringify({ readerFloor: manifest.readerFloor, buildId: manifest.buildId, buildCommit: manifest.buildCommit, assets: manifest.assets.length }));
}
