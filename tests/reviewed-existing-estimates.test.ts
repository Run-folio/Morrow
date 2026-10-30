import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonLeg} from './fixtures/transport-comparison.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
test('existing qualified London Paris allowance is usable without a dated timetable or new policy',async()=>{
 const leg=comparisonLeg();const p=selectedTransferPlace('Paris','France','reference:geonames:2988507','stop');leg.toEndpoint={...p,id:leg.toStopId,kind:'stop',coordinates:p.coordinates!};
 const r=await compareCanonicalTransferJourney(leg);const c=r.diagnostic.candidates.find(c=>c.summaryMode==='train'&&c.evidence==='exact_transfer');assert.ok(c);assert.equal(c.totalDurationMinutes,270);assert.equal(c.provenance,'planning_estimate');
});
