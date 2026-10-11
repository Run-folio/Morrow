import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {searchReferencePlaces,compareReferenceSearchMatches} from '../lib/easyt/place-reference.server.ts';
import {mergeEquivalentPlaceSuggestions,placeSuggestionLocationDetail} from '../lib/easyt/place-autocomplete.ts';
import {PLACE_CATALOG} from '../lib/easyt/place-catalog.ts';
import {countryFor} from '../lib/easyt/country-registry.ts';
const normalize=(v:string)=>v.normalize('NFKD').replace(/\p{M}/gu,'').replace(/['’]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
type Row=[string,string,string,number,number,string,number|string,string[]|string,boolean,string];
const settlements=JSON.parse(readFileSync(new URL('../data/place-reference/settlements.json',import.meta.url),'utf8')) as Row[];
const airports=JSON.parse(readFileSync(new URL('../data/place-reference/airports.json',import.meta.url),'utf8')) as Row[];
const pool=[...settlements.map(r=>({r,source:'geonames',names:[r[1],...(r[7] as string[])].map(normalize)})),...airports.filter(r=>r[5]!=='closed_airport').map(r=>({r,source:'ourairports',names:[normalize(r[1])]}))];

test('the empty reviewed crosswalk preserves every authored/source pair in the full settlement pool',()=>{
 const byName=new Map<string,Row[]>();for(const row of settlements){const key=normalize(row[1]);const group=byName.get(key)??[];group.push(row);byName.set(key,group);}
 let pairs=0;
 for(const entry of PLACE_CATALOG.filter(e=>!e.canonicalPlaceId.startsWith('reference:')&&['city','town'].includes(e.placeType)&&e.coordinates&&e.parentCountries.length===1)){
  const authored={canonicalPlaceId:entry.canonicalPlaceId,name:entry.canonicalName,country:entry.parentCountries[0]!,placeType:entry.placeType,coordinates:entry.coordinates};
  const sources=(byName.get(normalize(entry.canonicalName))??[]).map(row=>({canonicalPlaceId:`reference:geonames:${row[0]}`,name:row[1],country:countryFor(row[2])!.name,placeType:row[5]==='PPL'?'town':'city',coordinates:[row[3],row[4]]}));
  const equivalent=sources.filter(source=>mergeEquivalentPlaceSuggestions([authored,source]).length===1);
  assert.ok(equivalent.length<=1,`${entry.canonicalPlaceId}: truncated output cannot manufacture equivalence uniqueness`);
  assert.equal(mergeEquivalentPlaceSuggestions([authored,...sources]).length,1+sources.length-equivalent.length);
  pairs+=equivalent.length;
 }
 assert.equal(pairs,0,'no source-fact match is a reviewed equivalence mapping');
 console.info(`Globally unique authored/source display pairs: ${pairs}`);
});

test('all source same-country settlement collision groups retain identities and truthfully mark unavailable administrative detail',()=>{
 const groups=new Map<string,Row[]>();
 for(const row of settlements){const key=`${normalize(row[1])}:${row[2]}:${row[5]==='PPL'?'town':'city'}`;const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
 let checked=0;
 for(const rows of groups.values()){
  if(rows.length<2)continue;
  const choices=rows.map(r=>({canonicalPlaceId:`reference:geonames:${r[0]}`,name:r[1],country:r[2],placeType:r[5]==='PPL'?'town':'city',coordinates:[r[3],r[4]]}));
  const actual=mergeEquivalentPlaceSuggestions(choices);assert.equal(actual.length,rows.length);
  for (const choice of actual) { const detail=placeSuggestionLocationDetail(choice,actual);
    assert.match(detail,/Location to confirm/);assert.doesNotMatch(detail,/Location \d|\d of \d/);
    assert.ok(detail.includes(choice.country));assert.ok(!detail.includes(String(choice.coordinates[0])));
  } checked++;
 }
 assert.ok(checked>10_000,'enumerate every collision group from the installed source, not a selected example list');
});

test('canonical evidence precedes aliases/population and numeric IDs in a many-hit pool',()=>{
 const rivals=Array.from({length:20},(_,i)=>({id:String(i+1),score:1000,population:1_000_000,canonicalExact:false}));
 const strongest={id:'999',score:1000,population:500,canonicalExact:true};
 for(const rows of [[...rivals,strongest],[strongest,...rivals.toReversed()]]){
  assert.equal(rows.toSorted(compareReferenceSearchMatches)[0],strongest);
  assert.equal(rows.map((r,i)=>({...r,id:String(100-i)})).toSorted(compareReferenceSearchMatches)[0]!.canonicalExact,true);
 }
});

test('bounded indexed search equals independently sorted full eligible source pool',()=>{
 for(const [query,country] of [['Los Angeles',''],['Springfield',''],['Santiago',''],['San José',''],['Xi’an',''],['London',''],['Sydney',''],['sa',''],['東京','JP'],['Nairobi','KE'],['Porto','PT']] as const){
  const q=normalize(query);
  const eligible=pool.filter(p=>!country||p.r[2]===country).flatMap(p=>{
   const exact=p.names.includes(q),prefix=p.names.some(n=>n.startsWith(q)),word=p.names.some(n=>n.split(' ').some(w=>w.startsWith(q)));
   const tier=exact?1000:prefix?700:word?500:0;
   if(!tier||p.source==='ourairports'&&!p.r[8]&&!exact)return [];
   return [{p,tier,canonical:p.names[0]===q,population:p.source==='geonames'?Number(p.r[6]):0}];
  }).sort((a,b)=>b.tier-a.tier||Number(b.canonical)-Number(a.canonical)||b.population-a.population||Number(a.p.r[0])-Number(b.p.r[0]));
  for(const limit of [1,8,12]){
   const actual=searchReferencePlaces(query,country?{explicitCountryNames:[country]}:{},{limit});
   const expected=eligible.slice(0,limit);
   assert.deepEqual(actual.map(p=>p.canonicalPlaceId),expected.map(({p})=>`reference:${p.source}:${p.r[0]}`),`${query}, ${country}, top ${limit}`);
   assert.deepEqual(actual.map(p=>p.coordinates),expected.map(({p})=>[p.r[3],p.r[4]]));
  }
 }
});
