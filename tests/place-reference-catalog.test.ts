import test from 'node:test';
import assert from 'node:assert/strict';
import * as intelligence from '../lib/easyt/place-intelligence.ts';
import {PLACE_CATALOG,findCatalogMatches} from '../lib/easyt/place-catalog.ts';
import {referenceCountrySeeds,referenceKnownCodeKind} from '../lib/easyt/place-reference.ts';
import {prioritizeRouteStopSuggestions} from '../lib/easyt/place-autocomplete.ts';
test('generated explicit seeds confirm exact IDs and never become automatic prose matches',()=>{
 const seed=referenceCountrySeeds('FJ')[0];assert.ok(PLACE_CATALOG.some(p=>p.canonicalPlaceId===seed.canonicalPlaceId));
 const choice=intelligence.canonicalPlaceSuggestionForId(seed.canonicalPlaceId);assert.ok(choice);assert.deepEqual(choice.coordinates,seed.coordinates);assert.equal(choice.provenance[0].id,seed.referenceProviderId);assert.equal(choice.provenance[0].kind,'provider');
 assert.ok(findCatalogMatches(`Please visit ${seed.canonicalName}`).every(m=>m.entries.every(e=>e.canonicalPlaceId!==seed.canonicalPlaceId)));
 assert.ok(intelligence.resolvePlaceMentions('7 days from Hong Kong to Chengdu and Zhangjiajie').mentions.some(m=>m.canonicalPlaceId==='hong-kong'&&m.placeType==='city'));
});
test('known IATA pending lists suppress legacy city aliases and ICAO sorts exact gateway first',()=>{
 assert.equal(referenceKnownCodeKind('lhr'),'iata');assert.ok(intelligence.canonicalPlaceSuggestionsForQuery('LHR',[],8,true).every(c=>c.placeType!=='city'));
 assert.ok(intelligence.canonicalPlaceSuggestionsForQuery('NYC',[],8,true).some(c=>c.placeType==='city'));
 const airport={name:'London Heathrow',placeType:'transport_gateway',routability:'direct_destination',matchedIcaoCode:'EGLL'};
 assert.equal(prioritizeRouteStopSuggestions([{name:'Egll town',placeType:'town',routability:'direct_destination'},airport],'route-stop','EGLL')[0],airport);
});
