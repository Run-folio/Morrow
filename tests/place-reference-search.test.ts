import test from 'node:test';
import assert from 'node:assert/strict';
import {searchReferencePlaces, referencePlaceById} from '../lib/easyt/place-reference.server.ts';
import {countryCodeFor} from '../lib/easyt/country-registry.ts';

test('local name/prefix choices retain exact reference identity and jurisdiction',()=>{
 for(const [query,country] of [['Antigua Guatemala','GT'],['Málaga','ES'],['Nairobi','KE'],['Busan','KR'],['Suva','FJ']] as const){
  const candidates=searchReferencePlaces(query,{explicitCountryNames:[country]});
  assert.ok(candidates.length,query);assert.ok(candidates.length<=12);
  const first=candidates[0];assert.equal(countryCodeFor(first.parentCountries![0]),country);
  const id=first.providerId.split('@')[0];const record=referencePlaceById(id)!;
  assert.ok(record);assert.equal(record.canonicalName,first.canonicalName);assert.deepEqual(record.coordinates,first.coordinates);assert.equal(record.providerId,first.providerId);
 }
 assert.ok(searchReferencePlaces('Antigua Guat',{}).some(c=>c.canonicalName==='Antigua Guatemala'));
 assert.deepEqual(searchReferencePlaces('Antigua Guatemala',{explicitCountryNames:['France']}),[]);
 assert.equal(referencePlaceById('reference:geonames:unknown'),undefined);
});
