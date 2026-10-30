import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import config from '../next.config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = join(root, 'data/package-manifest.json');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'));
const requiredRoutes = ['journey-geocode', 'journey-discover', 'journey-route-image', 'journey-capture', 'journey-day-trips'];

test('source package owns regular, hash-pinned reference data without local symlinks', () => {
  assert.ok(existsSync(manifestPath), 'source-package manifest must exist');
  assert.ok(lstatSync(join(root, 'data')).isDirectory());
  const data = manifest();
  assert.equal(data.version, 1);
  assert.equal(data.files.length, 27);
  const actual = [];
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), stat = lstatSync(path);
      assert.equal(stat.isSymbolicLink(), false, 'data must survive a clean checkout without another workspace');
      if (stat.isDirectory()) walk(path);
      else actual.push(path.slice(join(root, 'data').length + 1));
    }
  };
  walk(join(root, 'data'));
  assert.deepEqual(actual.sort(), [...data.files.map(file => file.path), 'package-manifest.json'].sort());
  for (const file of data.files) {
    assert.match(file.path, /^[a-z0-9A-Z._/-]+$/);
    assert.equal(file.path.includes('..'), false);
    const bytes = readFileSync(join(root, 'data', file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(digest(bytes), file.sha256, file.path);
  }
  const fingerprint = digest(data.files.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0).map(file => `${file.path}\0${file.sha256}\n`).join(''));
  assert.equal(fingerprint, data.fingerprint);
});

test('all data consumers trace exactly the accepted reference files', () => {
  const files = manifest().files.filter(file => file.path.startsWith('place-reference/')).map(file => `./data/${file.path}`).sort();
  for (const route of requiredRoutes) assert.deepEqual(config.outputFileTracingIncludes[`/api/${route}`].slice().sort(), files, route);
  assert.equal(files.length, 26);
});

test('source-package allowlist includes accepted data and rejects unrelated/private additions', () => {
  const accepted = [...manifest().files.map(file => `data/${file.path}`), 'data/package-manifest.json'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: root, input: [...accepted, 'data/private.json', 'data/place-reference/.env', 'data/place-reference/islands/access-token.json'].join('\n'),
    encoding: 'utf8',
  }).trim().split('\n');
  assert.deepEqual(ignored, ['data/private.json', 'data/place-reference/.env', 'data/place-reference/islands/access-token.json']);
});

test('every accepted data input is versioned in the source package', () => {
  const versioned = new Set(execFileSync('git', ['ls-files', 'data'], { cwd: root, encoding: 'utf8' }).trim().split('\n'));
  for (const file of manifest().files) assert.equal(versioned.has(`data/${file.path}`), true, file.path);
  assert.equal(versioned.has('data/package-manifest.json'), true);
});
