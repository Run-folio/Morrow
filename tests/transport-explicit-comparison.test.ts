import assert from 'node:assert/strict';
import test from 'node:test';
import * as engine from '../lib/easyt/multimodal-transfer-resolution.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import type {RoadRoutingProvider} from '../lib/easyt/road-routing.ts';

import {comparisonLeg,syntheticRoad} from './fixtures/transport-comparison.ts';
const compare=(...args:Parameters<typeof engine.resolveCanonicalTransferJourney>) => {
 const operation=(engine as unknown as {compareCanonicalTransferJourney?:typeof engine.resolveCanonicalTransferJourney}).compareCanonicalTransferJourney;
 assert.equal(typeof operation,'function','explicit comparison must be separate from automatic recommendation');
 return operation!(...args);
};

test('explicit comparison offers eligible driving beside existing rail without replacing the saved leg',async()=>{
 const leg=comparisonLeg(), before=structuredClone(leg);let calls=0;
 const automatic=await engine.resolveCanonicalTransferJourney(leg,{provider:syntheticRoad(()=>calls++)});
 assert.equal(calls,0);assert.equal(automatic.leg.mode,'train');
 const saved={...automatic.leg,routeMetadata:{...automatic.leg.routeMetadata,userConfirmed:true}};
 const result=await compare(saved,{provider:syntheticRoad(()=>calls++)});
 assert.equal(calls,1);assert.deepEqual(result.leg,saved);assert.deepEqual(leg,before);
 assert.ok(result.diagnostic.candidates.some(c=>c.summaryMode==='train'));
 assert.ok(result.diagnostic.candidates.some(c=>c.summaryMode==='road'));
 assert.equal(result.assessment.evidence,'conditional');
});

test('explicit comparison keeps hard road exclusions and refuses unqualified geography',async()=>{
 const leg=comparisonLeg();leg.routeMetadata.transportConstraints={avoidDriving:true};let calls=0;
 const result=await compare(leg,{provider:syntheticRoad(()=>calls++)});
 assert.equal(calls,0);assert.ok(!result.diagnostic.candidates.some(c=>c.segments.some(s=>s.mode==='road')));
 const invalid={...leg,fromEndpoint:{...leg.fromEndpoint!,coordinates:[0,0] as [number,number]}};
 const blocked=await compare(invalid,{provider:syntheticRoad(()=>calls++)});
 assert.equal(blocked.assessment.retrieval,'blocked');assert.equal(blocked.assessment.reason,'identity_required');
 assert.equal(calls,0);assert.deepEqual(blocked.leg,invalid);assert.deepEqual(blocked.diagnostic.candidates,[]);
});
