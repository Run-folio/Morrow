import assert from 'node:assert/strict';
import test from 'node:test';
import {performance} from 'node:perf_hooks';
import {PLACE_CATALOG,findCatalogPlacesByPhrase,findCatalogMatches,normalizeCatalogPhrase} from '../lib/easyt/place-catalog.ts';
import {referenceSeedRetired} from '../lib/easyt/place-reference.ts';

const eligible=PLACE_CATALOG.filter(entry=>!referenceSeedRetired(entry.canonicalPlaceId));
const normalized=eligible.map(entry=>({entry,phrases:new Set([entry.canonicalName,...entry.aliases].map(normalizeCatalogPhrase))}));
function scanOracle(value:string){
 const exact=normalizeCatalogPhrase(value);if(!exact)return [];
 const scan=(phrase:string)=>{const rows=normalized.filter(row=>row.phrases.has(phrase)).map(row=>row.entry);const authored=rows.filter(row=>row.captureMode!=='explicit-only');return authored.length?authored:rows;};
 const matches=scan(exact);return matches.length?matches:scan(normalizeCatalogPhrase(value.replace(/^\s*(?:the|el|la|los|las)\s+/iu,'')));
}
const ids=(rows:readonly {canonicalPlaceId:string}[])=>rows.map(row=>row.canonicalPlaceId);

test('phrase normalization preserves character folding for every catalog label and ASCII separator',()=>{
 const original=(value:string)=>{
  let text='';
  for(const sourceCharacter of value)for(const character of sourceCharacter.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase())
   text+=/^[\p{L}\p{N}]$/u.test(character)?character:' ';
  return text.replace(/ +/g,' ').trim();
 };
 for(const label of PLACE_CATALOG.flatMap(entry=>[entry.canonicalName,...entry.aliases]))assert.equal(normalizeCatalogPhrase(label),original(label));
 for(let code=0;code<128;code++){
  const value=`  LIMA${String.fromCharCode(code)}Cusco  `;
  assert.equal(normalizeCatalogPhrase(value),original(value));
 }
 for(const value of ['ΣΟΣ','İIıi','São Paulo','東京','Cafe\u0301','🗺️Lima → Cusco','𐐀𐐨'])assert.equal(normalizeCatalogPhrase(value),original(value));
});

test('exact lookup agrees with a full catalog scan for every name, alias, article and mixed-case label',()=>{
 const phrases=new Set(eligible.flatMap(entry=>[entry.canonicalName,...entry.aliases]));
 for(const phrase of phrases)for(const query of [phrase,phrase.toUpperCase(),`the ${phrase}`])assert.deepEqual(ids(findCatalogPlacesByPhrase(query)),ids(scanOracle(query)),query);
 for(const value of ['',' ! ','unknown-place-zxy','Georgia','la paz','LAS VEGAS','東京','ΣΟΣ','São Paulo'])assert.deepEqual(ids(findCatalogPlacesByPhrase(value)),ids(scanOracle(value)),value);
});

test('exact lookup callers cannot reorder or remove choices from later ambiguity results',()=>{
 const before=ids(findCatalogPlacesByPhrase('Georgia'));assert.ok(before.length>1);
 const disposable=findCatalogPlacesByPhrase('Georgia');disposable.reverse();disposable.pop();
 assert.deepEqual(ids(findCatalogPlacesByPhrase('Georgia')),before);
});

test('phrase capture retains source offsets, longest matches, repeated occurrences and code casing',()=>{
 const source='The Sacred Valley → São Paulo → Sacred Valley; fly from LHR, then lhr.';
 const matches=findCatalogMatches(source);
 assert.equal(matches.filter(match=>match.entries.some(entry=>entry.canonicalPlaceId==='sacred-valley')).length,2);
 for(const match of matches)assert.equal(source.slice(match.start,match.end),match.sourceText);
 assert.equal(matches.some(match=>match.sourceText==='LHR'),true);
 assert.equal(matches.some(match=>match.sourceText==='lhr'),false);
});

test('repeated exact lookup stays within a bounded application CPU budget after initial catalog preparation',()=>{
 const queries=['London','Lima','Tokyo','Georgia','the Sacred Valley','São Paulo','unknown-place-zxy'];
 queries.forEach(query=>findCatalogPlacesByPhrase(query));
 const started=performance.now();for(let i=0;i<500;i++)findCatalogPlacesByPhrase(queries[i%queries.length]);
 const elapsed=performance.now()-started;
 assert.ok(elapsed<100,`500 exact lookups took ${elapsed.toFixed(1)}ms; budget100ms`);
});
