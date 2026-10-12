import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = new URL('../scripts/generate-offline-shell-manifest.mjs', import.meta.url);
const commit = 'a'.repeat(40);
const html = '<meta name="morrovia-offline-reader" content="idb-recovery-v1"><meta name="morrovia-build-commit" content="' + commit + '"><script src="/_next/static/chunks/main.js"></script>';
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'morrovia-offline-manifest-'));
  const put = (file, body) => { const full = path.join(root, file); mkdirSync(path.dirname(full), { recursive: true }); writeFileSync(full, body); };
  put('.next-test/BUILD_ID', 'synthetic-build');
  put('.next-test/required-server-files.json', JSON.stringify({ config: { env: { MORROVIA_BUILD_COMMIT: commit } } }));
  put('.next-test/server/app/journey/new.html', html); put('.next-test/server/app/journey/plan.html', html);
  put('.next-test/static/chunks/main.js', 'synthetic main');
  put('.next-test/static/chunks/lazy-map.js', 'synthetic lazy');
  put('.next-test/static/media/font.woff2', 'synthetic font');
  put('public/maplibre/maplibre-gl-worker.mjs', 'synthetic worker');
  put('public/easyt-icon.svg', '<svg/>');
  return { root, put, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('build manifest includes lazy chunks/fonts/public worker with exact byte hashes', async () => {
  const { writeOfflineShellManifest } = await import(script);
  const f = fixture();
  try {
    const result = writeOfflineShellManifest(f.root, '.next-test');
    assert.equal(result.readerFloor, 'idb-recovery-v1'); assert.equal(result.buildId, 'synthetic-build'); assert.equal(result.buildCommit, commit);
    assert.deepEqual(result.assets.map(row => row.url), ['/easyt-icon.svg', '/maplibre/maplibre-gl-worker.mjs', '/_next/static/chunks/lazy-map.js', '/_next/static/chunks/main.js', '/_next/static/media/font.woff2'].sort());
    assert.equal(result.assets.find(row => row.url.endsWith('lazy-map.js')).sha256, createHash('sha256').update('synthetic lazy').digest('hex'));
    const context = { self: {} }; runInNewContext(readFileSync(path.join(f.root, 'public/easyt-offline-manifest.js'), 'utf8'), context);
    assert.equal(JSON.stringify(context.self.MORROVIA_OFFLINE_SHELL), JSON.stringify(result));
  } finally { f.close(); }
});
for (const reason of ['reader marker missing', 'commit mismatch', 'missing direct file', 'missing public worker', 'unsafe build id']) {
  test(`build cannot emit an accepted floor with ${reason}`, async () => {
    const { writeOfflineShellManifest } = await import(script); const f = fixture();
    try {
      if (reason === 'reader marker missing') f.put('.next-test/server/app/journey/new.html', '<html>legacy</html>');
      if (reason === 'commit mismatch') f.put('.next-test/server/app/journey/new.html', html.replace(commit, 'b'.repeat(40)));
      if (reason === 'missing direct file') f.put('.next-test/server/app/journey/new.html', html.replace('main.js', 'unknown.js'));
      if (reason === 'missing public worker') rmSync(path.join(f.root, 'public/maplibre/maplibre-gl-worker.mjs'));
      if (reason === 'unsafe build id') f.put('.next-test/BUILD_ID', '../legacy');
      assert.throws(() => writeOfflineShellManifest(f.root, '.next-test'));
    } finally { f.close(); }
  });
}
