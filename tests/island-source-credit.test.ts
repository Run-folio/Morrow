import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { searchBundledIslandIdentityCandidates } from '../lib/easyt/island-geography.server.ts';
const island = searchBundledIslandIdentityCandidates('Bohol',['Philippines'])[0]!;
assert(island);
const compile = (code:string,...args:string[]) => new Function(...args,ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);

test('normal autocomplete credits the actual bundled island identity alongside existing sources',()=>{
  const text=readFileSync('components/easyt/canonical-place-autocomplete.tsx','utf8');
  const start=text.indexOf('sources={[',text.indexOf('<MorroviaPlaceDataCredit'))+'sources={'.length;
  const end=text.indexOf(']}/>',start)+1;assert(start>=0&&end>start);
  const credit=compile(`return (${text.slice(start,end)});`,'suggestions');
  const selected={provenance:[{id:island.providerId,supports:island.normalizationReason}]};
  assert.deepEqual(credit([selected]),['openstreetmap']);
  assert.deepEqual(credit([selected,{provenance:[{id:'reference:geonames:1684497',supports:'Settlement identity'}]}]),['geonames','openstreetmap']);
});
test('spreadsheet meaning choices credit the actual island-snapshot source before base selection',()=>{
  const text=readFileSync('app/journey/new/import/spreadsheet-import-review.tsx','utf8');
  const start=text.indexOf('  const dataSources:'),end=text.indexOf('  return <>',start);assert(start>=0&&end>start);
  const credit=compile(`${text.slice(start,end)}; return dataSources;`,'visibleOptions');
  assert.deepEqual(credit([island]),['openstreetmap']);
  assert.deepEqual(credit([island,{providerId:'reference:ourairports:1'}]),['ourairports','openstreetmap']);
});
test('explicit spreadsheet base results retain OSM physical-proof credit alongside reference identity',()=>{
  const text=readFileSync('app/journey/new/import/spreadsheet-import-review.tsx','utf8');
  const start=text.indexOf('  const dataSources:'),end=text.indexOf('  return <>',start);assert(start>=0&&end>start);
  const credit=compile(`${text.slice(start,end)}; return dataSources;`,'visibleOptions');
  const base={providerId:'reference:geonames:1684497',normalizationReason:'Physical island verified: OSM relation:3625899; result=strict-inside/outside-holes'};
  assert.deepEqual(credit([base]),['geonames','openstreetmap']);
  assert.deepEqual(credit([{providerId:base.providerId}]),['geonames']);
  assert.deepEqual(credit([{...base,normalizationReason:null}]),['geonames']);
  assert.deepEqual(credit([{...base,normalizationReason:17}]),['geonames']);
  assert.deepEqual(credit([{...base,normalizationReason:'Physical island verification unavailable'}]),['geonames']);
  assert.deepEqual(credit([base,{...base}]),['geonames','openstreetmap']);
});
