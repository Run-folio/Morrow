import assert from 'node:assert/strict';
import test from 'node:test';
import { placeSuggestionRequiresBaseSelection, canonicalPlaceSuggestionsForQuery } from '../lib/easyt/place-intelligence.ts';
import { destinationPlanningDecision } from '../lib/easyt/destination-planning-policy.ts';
const suggestion=(id:string)=>{
 const row=canonicalPlaceSuggestionsForQuery(id==='singapore'?'Singapore':id==='hong-kong'?'Hong Kong':id==='beijing'?'Beijing':id,[],100,true).find(row=>row.canonicalPlaceId===id);
 assert.ok(row,id);return row;
};
test('Builder base decision uses planning semantics instead of inconsistent routing flags',()=>{
 const country=suggestion('singapore');
 assert.equal(placeSuggestionRequiresBaseSelection({...country,routability:'direct_destination'}),true);
 const city=suggestion('beijing');
 assert.equal(placeSuggestionRequiresBaseSelection({...city,routability:'planning_area'}),false);
 assert.equal(destinationPlanningDecision({...city,routability:'planning_area'}).behavior,'confirm');
});
test('existing broad intent stays broad and existing city identity remains unchanged',()=>{
 for(const id of ['singapore','bali']) {
  const row=suggestion(id),before=JSON.stringify(row);
  assert.equal(placeSuggestionRequiresBaseSelection(row),true);
  assert.equal(JSON.stringify(row),before);
 }
 const city=suggestion('hong-kong'),before=JSON.stringify(city);
 assert.equal(placeSuggestionRequiresBaseSelection(city),false);
 assert.equal(JSON.stringify(city),before);
});
test('non-routable reference cannot open base planning merely because its type is broad',()=>{
 const row={...suggestion('bali'),routability:'non_routable_reference' as const};
 assert.equal(placeSuggestionRequiresBaseSelection(row),false);
 assert.equal(destinationPlanningDecision(row).behavior,'confirm');
});
