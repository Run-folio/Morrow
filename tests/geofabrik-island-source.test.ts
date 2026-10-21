import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { compileIslandSource, islandDigest, type IslandSourceRecord } from '../lib/easyt/island-geography-source.ts';
import { physicalContains } from '../lib/easyt/physical-island-geometry.ts';
const source = (): IslandSourceRecord => JSON.parse(gunzipSync(readFileSync('data/place-reference/islands/bohol.json.gz')).toString());
const changed = (change: (record: any) => void) => { const record = source(); change(record); record.geometry.bodySHA256 = islandDigest(JSON.stringify(record.geometry.body)); return record; };

test('dated Geofabrik Bohol source compiles actual complete physical land with unchanged geometry limits', () => {
  const compiled = compileIslandSource(source());
  assert.equal(compiled.identityId, 'relation:3625899');
  assert.equal(compiled.sourceGeometryId, 'relation:3625899');
  assert.equal(compiled.geometry.timestamp, '2026-10-19T20:21:11Z');
  assert.equal(compiled.geometry.outer.length, 1); assert.equal(compiled.geometry.inner.length, 0);
  assert(physicalContains(compiled.geometry, [123.85219, 9.65556]));
});

test('actual Bohol land rejects Palawan homonym, Siquijor, Panglao and its exact boundary', () => {
  const { geometry } = compileIslandSource(source());
  for (const point of [[119.8922002,10.4819463],[123.5138212,9.2155864],[123.7733382,9.577673],geometry.outer[0]![0]!] as [number,number][]) assert.equal(physicalContains(geometry, point), false);
});

const invalid: Array<[string, (record: any) => void]> = [
  ['wrong source host',r=>r.geometry.url=r.geometry.body.archive.url=r.geometry.url.replace('download.geofabrik.de','example.org')],
  ['mutable latest archive',r=>r.geometry.url=r.geometry.body.archive.url=r.geometry.url.replace('-261019','-latest')],
  ['contradictory archive URL',r=>r.geometry.body.archive.url=r.geometry.url.replace('261019','261018')],
  ['archive URL query',r=>r.geometry.url=r.geometry.body.archive.url=r.geometry.url+'?refresh=1'],
  ['unsupported format version',r=>r.geometry.body.version=2],
  ['missing SHA256',r=>delete r.geometry.body.archive.sha256],
  ['checksum text mismatch',r=>r.geometry.body.archive.checksumBody='0'.repeat(32)+'  philippines-261019.osm.pbf\n'],
  ['checksum URL mismatch',r=>r.geometry.body.archive.checksumURL=r.geometry.url+'.sha1'],
  ['wrong licence',r=>r.geometry.body.archive.licence='public-domain'],
  ['missing source timestamp',r=>delete r.geometry.body.archive.baseTimestamp],
  ['source newer than capture',r=>r.geometry.body.archive.baseTimestamp='2099-01-01T00:00:00Z'],
  ['relation newer than source',r=>r.geometry.body.relation.timestamp='2099-01-01T00:00:00Z'],
  ['missing relation version',r=>delete r.geometry.body.relation.version],
  ['wrong relation identity',r=>r.geometry.body.relation.id=1550487],
  ['administrative province',r=>r.geometry.body.relation.tags.boundary='administrative'],
  ['duplicate member',r=>r.geometry.body.relation.members.push(r.geometry.body.relation.members[0])],
  ['duplicate way',r=>r.geometry.body.ways.push(r.geometry.body.ways[0])],
  ['missing way',r=>r.geometry.body.ways.pop()],
  ['unreferenced way',r=>r.geometry.body.ways.push({...r.geometry.body.ways[0],id:999999999999})],
  ['missing node',r=>r.geometry.body.nodes.pop()],
  ['duplicate node',r=>r.geometry.body.nodes.push(r.geometry.body.nodes[0])],
  ['unreferenced node',r=>r.geometry.body.nodes.push({...r.geometry.body.nodes[0],id:999999999999})],
  ['node newer than source',r=>r.geometry.body.nodes[0].timestamp='2099-01-01T00:00:00Z'],
  ['invalid point',r=>r.geometry.body.nodes[0].lat=91],
  ['incomplete way',r=>r.geometry.body.ways[0].nodes.pop()],
  ['too many node references',r=>r.geometry.body.ways[0].nodes=Array(60001).fill(r.geometry.body.ways[0].nodes[0])],
  ['missing extraction provenance',r=>delete r.geometry.body.archive.extractionScriptSHA256],
  ['false original HTTP JSON claim',r=>{r.geometry.originalResponseBody=JSON.stringify(r.geometry.body);r.geometry.originalResponseSHA256=islandDigest(r.geometry.originalResponseBody);}],
];
for (const [name, mutate] of invalid) test(`Geofabrik ${name} fails closed even after recomputing the derived-body digest`,()=>{
  assert.throws(()=>compileIslandSource(changed(mutate)));
});
test('captured subgraph digest is checked before geometry can be accepted',()=>{
  const record:any=source();record.geometry.body.nodes[0].lon+=0.01;
  assert.throws(()=>compileIslandSource(record),/digest/);
});

test('an impossible calendar date is not normalized into a different source object date',()=>{
  assert.throws(()=>compileIslandSource(changed(r=>r.geometry.body.nodes[0].timestamp='2026-02-30T00:00:00Z')));
});
