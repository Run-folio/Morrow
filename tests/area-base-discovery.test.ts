import assert from 'node:assert/strict';
import test from 'node:test';
import * as reference from '../lib/easyt/place-reference.server.ts';
import type {PlanningParentConstraint} from '../lib/easyt/place-intelligence.ts';

const parent:PlanningParentConstraint={canonicalPlaceId:'bali',canonicalName:'Bali',placeType:'island',parentCountries:['Indonesia']};
test('missing-coordinate island discovery seeds bounded maintained settlement facts without certifying containment',()=>{
  assert.equal(typeof reference.referenceAreaBaseSeeds,'function','missing shared administrative candidate discovery');
  const seeds=reference.referenceAreaBaseSeeds(parent);
  assert(seeds.length>0&&seeds.length<=16);
  assert(seeds.every(c=>c.parentCountries?.[0]==='Indonesia'&&['city','town'].includes(c.placeType)&&c.coordinates));
  assert(seeds.some(c=>c.canonicalPlaceId==='reference:geonames:1639002'),'the pinned Kuta record carries Bali administrative context');
  assert(!seeds.some(c=>c.canonicalPlaceId==='reference:geonames:1645528'),'Denpasar lacks pinned administrative context; do not infer it');
  assert(seeds.every(c=>!c.normalizationReason),'administrative facts are candidate seeds, never physical proof');
  assert.equal(parent.bounds,undefined);
});
test('unknown, mismatched and ambiguous country contexts do not seed arbitrary settlements',()=>{
  assert.equal(typeof reference.referenceAreaBaseSeeds,'function');
  for(const p of [{...parent,parentCountries:['China']},{...parent,parentCountries:[]},{...parent,parentCountries:['Indonesia','China']},{...parent,canonicalName:'Unmapped synthetic island'}])
    assert.deepEqual(reference.referenceAreaBaseSeeds(p),[]);
});
