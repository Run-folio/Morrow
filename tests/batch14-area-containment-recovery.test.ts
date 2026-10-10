import assert from 'node:assert/strict';
import test from 'node:test';
import {placeCandidateWithinPlanningParent} from '../lib/easyt/place-intelligence.ts';
import {searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
const area={canonicalPlaceId:'example-island',canonicalName:'Example Island',placeType:'island' as const,parentCountries:['Greece'],parentRegionId:'enclosing-island-group'};
test('shared enclosing geography does not prove membership within the selected island',()=>{
 assert.equal(placeCandidateWithinPlanningParent({canonicalName:'Sibling island settlement',placeType:'town',parentCountries:['Greece'],parentRegionId:'enclosing-island-group',coordinates:[26,37],routability:'direct_destination'},area),false);
});
test('independent exact parent hierarchy or actual area bounds can verify a real overnight settlement',()=>{
 const base={canonicalName:'Explicit real settlement',placeType:'town' as const,parentCountries:['Greece'],coordinates:[25.43,36.42] as [number,number],routability:'direct_destination' as const};
 assert(placeCandidateWithinPlanningParent({...base,parentRegionId:'Example Island'},area));
 assert(placeCandidateWithinPlanningParent({...base,parentRegionId:'example-island'},area));
 assert(placeCandidateWithinPlanningParent(base,{...area,bounds:{south:36.3,west:25.3,north:36.5,east:25.6}}));
 assert(!placeCandidateWithinPlanningParent({...base,coordinates:[26,37]}, {...area,bounds:{south:36.3,west:25.3,north:36.5,east:25.6}}));
 for(const placeType of ['island','transport_gateway','natural_area'] as const)assert(!placeCandidateWithinPlanningParent({...base,placeType,parentRegionId:'Example Island'},area));
});
test('installed Fira identity alone never manufactures Santorini containment',()=>{
 const candidate=searchReferencePlaces('Fira',{explicitCountryNames:['Greece']}).find(c=>c.canonicalPlaceId==='reference:geonames:252920');assert(candidate);assert.equal(candidate.parentRegionId,undefined);
 assert(!placeCandidateWithinPlanningParent(candidate,{canonicalPlaceId:'santorini',canonicalName:'Santorini',placeType:'island',parentCountries:['Greece'],parentRegionId:'greek-islands'}));
});
