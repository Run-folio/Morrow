import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Executes the production worker with synthetic caches/fetch. No browser,
// native storage, provider, account, or real network is used.
const dependencySource=readFileSync(new URL('../public/easyt-offline-dependencies.js',import.meta.url),'utf8');
const source=dependencySource+'\n'+readFileSync(new URL('../public/easyt-sw.js',import.meta.url),'utf8');
const floor = 'idb-recovery-account-v1';
const build = 'synthetic-build-1';
const commit = 'a'.repeat(40);
const assets = new Map([
  ['/easyt-offline-dependencies.js',dependencySource],
  ['/_next/static/chunks/reader.js', 'synthetic reader'],
  ['/_next/static/chunks/lazy-map.js', 'synthetic lazy map'],
  ['/_next/static/css/shell.css', 'synthetic css'],
  ['/maplibre/maplibre-gl-worker.mjs', 'synthetic map worker'],
]);
const manifest = {
  version: 1, readerFloor: floor, buildId: build, buildCommit: commit,
  assets: [...assets].map(([url, body]) => ({ url, sha256: createHash('sha256').update(body).digest('hex') })),
};
manifest.artifactId = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const shell = (path, { readerFloor = floor, buildCommit = commit, asset = '/_next/static/chunks/reader.js' } = {}) =>
  `<!doctype html><meta name="morrovia-offline-reader" content="${readerFloor}"><meta name="morrovia-build-commit" content="${buildCommit}"><script src="${asset}"></script><div>${path}</div>`;
const currentCache = `easyt-public-shell-${floor}-${manifest.artifactId}`;
const readyKey = '/__morrovia_offline_ready__';

function model({ seed = [], network = null, manifestValue = manifest, failPut = null, discardPut = false } = {}) {
  const stores = new Map(seed.map(([name, rows]) => [name, new Map(rows)]));
  const listeners = new Map(), requests = [], deletedCaches = [], puts = [];
  let skipped = 0, claimed = 0, globalDocumentReads = 0;
  const key = value => {
    const raw = typeof value === 'string' ? value : value.url;
    const url = new URL(raw, 'https://isolated.invalid');
    return url.pathname + url.search;
  };
  const open = async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const rows = stores.get(name);
    return {
      match: async request => rows.get(key(request))?.clone(),
      put: async (request, response) => {
        if (key(request) === failPut) throw new Error('synthetic cache write refusal');
        puts.push([name, key(request)]); if (!discardPut) rows.set(key(request), response.clone());
      },
      delete: async request => rows.delete(key(request)),
      addAll: async paths => { for (const path of paths) await (await open(name)).put(path, await fetcher(path)); },
      add: async path => (await open(name)).put(path, await fetcher(path)),
    };
  };
  const fetcher = async (request, options) => {
    requests.push({ path: key(request), options });
    const response = network ? await network(key(request), options) : null;
    if (!response) throw new TypeError('synthetic offline');
    return response.clone();
  };
  const self = {
    location: { origin: 'https://isolated.invalid' },
    MORROVIA_OFFLINE_SHELL: manifestValue,
    skipWaiting: async () => { skipped++; },
    clients: { claim: async () => { claimed++; } },
    addEventListener: (name, listener) => listeners.set(name, listener),
  };
  runInNewContext(source, {
    self, importScripts: () => {}, fetch: fetcher, crypto: webcrypto,
    caches: {
      open,
      keys: async () => [...stores.keys()],
      delete: async name => { deletedCaches.push(name); return stores.delete(name); },
      match: async request => {
        if (!key(request).startsWith('/_next/static/')) globalDocumentReads++;
        for (const name of stores.keys()) { const result = await (await open(name)).match(request); if (result) return result; }
      },
    },
    URL, Response, Request, TextEncoder, Uint8Array, Promise, Set, Map,
  });
  return {
    stores, requests, deletedCaches, puts,
    get skipped() { return skipped; }, get claimed() { return claimed; },
    get globalDocumentReads() { return globalDocumentReads; },
    async lifecycle(name) {
      let work;
      listeners.get(name)({ waitUntil: value => { work = Promise.resolve(value); } });
      assert.ok(work); return work;
    },
    async request(path, mode = 'navigate', method = 'GET') {
      let work;
      listeners.get('fetch')({ request: { url: 'https://isolated.invalid' + path, mode, method },
        respondWith: value => { work = Promise.resolve(value); } });
      return work ? await work : null;
    },
  };
}
const online = (path) => {
  if (['/', '/journey/new', '/journey/plan'].includes(path)) return new Response(shell(path), { headers: { 'content-type': 'text/html' } });
  if (assets.has(path)) return new Response(assets.get(path));
  if (path === '/easyt-icon.svg') return new Response('<svg/>');
};
async function installed(options = {}) {
  const m = model({ network: online, ...options }); await m.lifecycle('install'); return m;
}

test('takeover waits for the complete direct and lazy reader graph', async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const m = model({ network: async path => path === '/_next/static/chunks/lazy-map.js' ? await held : online(path) });
  const work = m.lifecycle('install'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(m.skipped, 0);
  release(online('/_next/static/chunks/lazy-map.js')); await work;
  assert.equal(m.skipped, 1);
  for (const asset of assets.keys()) assert.ok(m.stores.get(currentCache)?.has(asset), asset);
  assert.ok(m.stores.get(currentCache)?.has(readyKey));
  assert.ok(m.requests.every(row => row.options?.credentials === 'omit'));
});

for (const reason of ['legacy document', 'wrong commit', 'unknown direct chunk', 'lazy refusal', 'wrong asset bytes', 'cache refusal']) {
  test(`failed preparation cannot authorize takeover: ${reason}`, async () => {
    const m = model({ failPut: reason === 'cache refusal' ? readyKey : null, network: path => {
      if (path === '/journey/new' && reason === 'legacy document') return new Response('<html>legacy</html>');
      if (path === '/journey/new' && reason === 'wrong commit') return new Response(shell(path, { buildCommit: 'b'.repeat(40) }));
      if (path === '/journey/new' && reason === 'unknown direct chunk') return new Response(shell(path, { asset: '/_next/static/chunks/foreign.js' }));
      if (path === '/_next/static/chunks/lazy-map.js' && reason === 'lazy refusal') return null;
      if (path === '/_next/static/chunks/reader.js' && reason === 'wrong asset bytes') return new Response('wrong bytes');
      return online(path);
    } });
    await assert.rejects(m.lifecycle('install'));
    assert.equal(m.skipped, 0); assert.equal(m.claimed, 0);
    assert.equal(m.stores.get(currentCache)?.has(readyKey) ?? false, false);
  });
}

test('activation retains every legacy graph and unrelated cache', async () => {
  const names = ['easyt-public-shell-v5', 'easyt-public-shell-v6', 'easyt-public-shell-v7', 'unrelated-draft-cache'];
  const m = await installed({ seed: names.map(name => [name, [['/legacy', new Response(name)]]]) });
  await m.lifecycle('activate'); assert.equal(m.claimed, 1); assert.deepEqual(m.deletedCaches, []);
  for (const name of names) assert.equal(await m.stores.get(name).get('/legacy').text(), name);
});

for (const ordering of ['legacy-first', 'current-first']) {
  test(`offline recovery selects only the ready reader cache: ${ordering}`, async () => {
    const prepared = await installed();
    const current = prepared.stores.get(currentCache);
    const legacy = ['easyt-public-shell-v7', [['/journey/new', new Response('legacy shell')]]];
    const seed = ordering === 'legacy-first' ? [legacy, [currentCache, [...current]]] : [[currentCache, [...current]], legacy];
    const m = model({ seed });
    assert.equal(await (await m.request('/journey/new?trip=synthetic&recover=1')).text(), shell('/journey/new'));
    assert.equal(m.globalDocumentReads, 0);
  });
}

for (const reason of ['legacy only', 'unready current', 'missing lazy asset', 'corrupt lazy asset', 'old body in current cache']) {
  test(`no obsolete document fallback: ${reason}`, async () => {
    const m = await installed(); const current = m.stores.get(currentCache);
    if (reason === 'legacy only') m.stores.delete(currentCache);
    if (reason === 'unready current') current.delete(readyKey);
    if (reason === 'missing lazy asset') current.delete('/_next/static/chunks/lazy-map.js');
    if (reason === 'corrupt lazy asset') current.set('/_next/static/chunks/lazy-map.js', new Response('corrupt bytes'));
    if (reason === 'old body in current cache') current.set('/journey/new', new Response('legacy body'));
    const offline = model({ seed: [['easyt-public-shell-v7', [['/journey/new', new Response('legacy shell')]]], ...m.stores] });
    assert.equal((await offline.request('/journey/new?trip=synthetic')).type, 'error');
    assert.equal(offline.globalDocumentReads, 0);
  });
}

test('online legacy rollback refuses an obsolete shell and retains the floor', async () => {
  const m = await installed();
  const onlineLegacy = model({ seed: [...m.stores], network: () => new Response('<html>legacy rollback</html>') });
  assert.equal(await (await onlineLegacy.request('/journey/new?trip=synthetic')).text(), shell('/journey/new'));
  assert.equal(await onlineLegacy.stores.get(currentCache).get('/journey/new').text(), shell('/journey/new'));
});

test('queried online documents never overwrite the credential-free public shell', async () => {
  const m = await installed();
  const privateBody = shell('synthetic private queried response');
  const queried = model({ seed: [...m.stores], network: () => new Response(privateBody, { headers: { 'content-type': 'text/html' } }) });
  assert.equal(await (await queried.request('/journey/new?trip=synthetic')).text(), privateBody);
  assert.equal(queried.puts.length, 0);
  assert.equal(await queried.stores.get(currentCache).get('/journey/new').text(), shell('/journey/new'));
});

test('old hashed client assets stay available independently of document floor', async () => {
  const m = model({ seed: [['easyt-public-shell-v5', [['/_next/static/chunks/old.js', new Response('old asset')]]]] });
  assert.equal(await (await m.request('/_next/static/chunks/old.js', 'no-cors')).text(), 'old asset');
});

test('API, writes and private response bodies remain outside the cache', async () => {
  const m = await installed();
  const privateModel = model({ seed: [...m.stores], network: () => new Response('synthetic private response') });
  assert.equal(await privateModel.request('/api/easyt/trips/synthetic'), null);
  assert.equal(await privateModel.request('/journey/new', 'navigate', 'POST'), null);
  assert.equal(await (await privateModel.request('/journey/profile')).text(), 'synthetic private response');
  assert.equal(privateModel.puts.length, 0);
  assert.equal(await privateModel.request('/journey/profile?trip=synthetic'), null);
  const offline = model({ seed: [...m.stores] });
  assert.equal(await (await offline.request('/journey/dashboard')).text(), shell('/'));
});

test('a corrupt or unsupported manifest cannot install a reader floor', async () => {
  for (const manifestValue of [null, { ...manifest, readerFloor: 'legacy' }, { ...manifest, assets: [{ url: '/api/private', sha256: 'a'.repeat(64) }] }]) {
    const m = model({ network: online, manifestValue });
    await assert.rejects(m.lifecycle('install'));
    assert.equal(m.skipped, 0); assert.equal(m.claimed, 0);
  }
});

test('fulfilled cache writes without readback cannot authorize takeover', async () => {
  const m = model({ network: online, discardPut: true });
  await assert.rejects(m.lifecycle('install'));
  assert.equal(m.skipped, 0);
});

test('a known current asset cannot return wrong network bytes', async () => {
  const m = model({ network: () => new Response('legacy or error asset') });
  assert.equal((await m.request('/_next/static/chunks/reader.js', 'no-cors')).type, 'error');
});

test('non-HTML responses cannot impersonate an online reader document', async () => {
  const m = model({ network: () => new Response(shell('not html'), { headers: { 'content-type': 'application/json' } }) });
  assert.equal((await m.request('/journey/new')).type, 'error');
});

test('same-artifact reinstall reuses the complete snapshot without invalidation', async () => {
  const prepared = await installed();
  const replacement = model({ seed: [...prepared.stores] });
  await replacement.lifecycle('install');
  assert.equal(replacement.skipped, 1); assert.equal(replacement.requests.length, 0); assert.equal(replacement.puts.length, 0);
  assert.ok(replacement.stores.get(currentCache).has(readyKey));
  assert.equal(await (await replacement.request('/journey/new?trip=synthetic')).text(), shell('/journey/new'));
});

test('a failed changed graph with the same build id cannot mutate the accepted graph', async () => {
  const prepared = await installed();
  const next = { version: manifest.version, readerFloor: floor, buildId: build, buildCommit: commit,
    assets: manifest.assets.map(asset => ({ ...asset, sha256: asset.url.endsWith('reader.js') ? 'b'.repeat(64) : asset.sha256 })) };
  next.artifactId = createHash('sha256').update(JSON.stringify(next)).digest('hex');
  const replacement = model({ seed: [...prepared.stores], manifestValue: next });
  await assert.rejects(replacement.lifecycle('install'));
  assert.ok(replacement.stores.get(currentCache).has(readyKey));
  const original = model({ seed: [...replacement.stores] });
  assert.equal(await (await original.request('/journey/new?trip=synthetic')).text(), shell('/journey/new'));
});

test('encoded dynamic/catchall chunks install and match raw and encoded request spelling', async () => {
  const urls = ['/_next/static/chunks/app/journey/%5BtripId%5D/page.js', '/_next/static/chunks/app/api/auth/%5B...all%5D/route.js'];
  const dynamicAssets = urls.map(url => ({ url, sha256: createHash('sha256').update('synthetic dynamic').digest('hex') }));
  const identity = { version: 1, readerFloor: floor, buildId: build, buildCommit: commit, assets: [...manifest.assets, ...dynamicAssets] };
  const next = { ...identity, artifactId: createHash('sha256').update(JSON.stringify(identity)).digest('hex') };
  const m = await installed({ manifestValue: next, network: path => urls.includes(path) ? new Response('synthetic dynamic') : online(path) });
  const offline = model({ seed: [...m.stores], manifestValue: next });
  for (const url of urls) {
    assert.equal(await (await offline.request(url, 'no-cors')).text(), 'synthetic dynamic');
    assert.equal(await (await offline.request(decodeURIComponent(url), 'no-cors')).text(), 'synthetic dynamic');
  }
});

test('manifest URL traversal, encoded separators and malformed encodings are refused', async () => {
  for (const url of ['/_next/static/../private.js', '/_next/static/%2E%2E/private.js', '/_next/static/%252E%252E/private.js', '/_next/static/a%2Fb.js', '/_next/static/a%252Fb.js', '/_next/static/a%5Cb.js', '/_next/static/%ZZ.js']) {
    const identity = { version: 1, readerFloor: floor, buildId: build, buildCommit: commit, assets: [{ url, sha256: 'a'.repeat(64) }] };
    const next = { ...identity, artifactId: createHash('sha256').update(JSON.stringify(identity)).digest('hex') };
    const m = model({ network: online, manifestValue: next }); await assert.rejects(m.lifecycle('install')); assert.equal(m.skipped, 0);
  }
});

const nextStream = pieces => pieces.map(piece => `<script>self.__next_f.push(${JSON.stringify([1,piece])})</script>`).join('');
for (const [name, pieces, accepted] of [
  ['known CSS split at Next script boundary', [':HL["/_next/static/css/she','ll.css","style"]\n'], true],
  ['unknown CSS split at Next script boundary', [':HL["/_next/static/css/unk','nown.css","style"]\n'], false],
  ['unknown complete streamed CSS', [':HL["/_next/static/css/unknown.css","style"]\n'], false],
]) test(`worker install classifies ${name}`,async()=>{
 const m=model({network:path=>['/','/journey/new','/journey/plan'].includes(path)?new Response(shell(path)+nextStream(pieces),{headers:{'content-type':'text/html'}}):online(path)});
 if(accepted){await m.lifecycle('install');await m.lifecycle('activate');assert.equal(m.skipped,1);assert.equal(m.claimed,1);}
 else {await assert.rejects(m.lifecycle('install'));assert.equal(m.skipped,0);assert.equal(m.claimed,0);}
});
