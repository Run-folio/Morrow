import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeEquivalentPlaceSuggestions} from '../lib/easyt/place-autocomplete.ts';
import {canonicalPlaceSuggestionsForQuery} from '../lib/easyt/place-intelligence.ts';
const choices=(name:string)=>canonicalPlaceSuggestionsForQuery(name,[],30,true);
for(const [name,id] of [['Bali','bali'],['Hong Kong','jurisdiction-hk'],['Berlin','berlin'],['Tokyo','tokyo-marathon'],['Singapore','singapore']] as const){
 test(`${name}: one stable catalog identity is not duplicated by API source attribution`,()=>{
  const original=choices(name).find(item=>item.canonicalPlaceId===id)!;assert(original);
  const echo={...original,provenance:[{id,label:'Global place provider',kind:'provider' as const,supports:'Local API representation of the same canonical identity.'}]};
  const before=structuredClone([original,echo]);
  const result=mergeEquivalentPlaceSuggestions([original,echo]);
  assert.equal(result.length,1);assert.equal(result[0],original,'retain the complete original tuple without grafting provider proof');
  assert.deepEqual([original,echo],before);
 });
}
test('same-label distinct cities and city versus broad area stay explicit',()=>{
 const cities=choices('Oranjestad').filter(item=>item.placeType==='city');assert(cities.length>1);
 assert.equal(mergeEquivalentPlaceSuggestions(cities).length,cities.length);
 const hk=choices('Hong Kong');assert.equal(mergeEquivalentPlaceSuggestions(hk).length,hk.length);
});
test('contradictory geographic facts and separate provider claims remain separate',()=>{
 const base=choices('Bali').find(item=>item.canonicalPlaceId==='bali')!;
 for(const changed of [{...base,country:'Philippines'},{...base,placeType:'city' as const},{...base,coordinates:[0,0] as [number,number]},
  {...base,canonicalPlaceId:'separate-island'},{...base,region:'different-region'}])assert.equal(mergeEquivalentPlaceSuggestions([base,changed]).length,2);
 const first={...base,provenance:[{id:'photon:node:1',label:'Provider',kind:'provider' as const,supports:'Source proof'}]};
 assert.equal(mergeEquivalentPlaceSuggestions([first,{...first,provenance:[{...first.provenance[0]!,id:'photon:node:2'}]}]).length,2);
 const reference=choices('Beijing').find(item=>item.canonicalPlaceId.startsWith('reference:'))!;
 assert.equal(mergeEquivalentPlaceSuggestions([reference,{...reference,provenance:[]}]).length,2,'invalid reference attribution cannot hide another tuple');
});
test('a catalog echo cannot bridge two conflicting provider claims in any ordering',()=>{
 const base=choices('Berlin').find(item=>item.canonicalPlaceId==='berlin')!;
 const first={...base,provenance:[{id:'photon:node:1',label:'Provider',kind:'provider' as const,supports:'Source proof'}]};
 const second={...first,provenance:[{...first.provenance[0]!,id:'photon:node:2'}]};
 for(const input of [[base,first,second],[first,base,second],[first,second,base]])assert.equal(mergeEquivalentPlaceSuggestions(input).length,3);
});
test('same identity with incompatible routability never collapses city and area behavior',()=>{
 const base=choices('Berlin').find(item=>item.canonicalPlaceId==='berlin')!;
 assert.equal(mergeEquivalentPlaceSuggestions([base,{...base,routability:'planning_area' as const}]).length,2);
});
