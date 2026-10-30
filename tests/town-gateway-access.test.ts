import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyTownGatewayAccess} from '../lib/easyt/town-gateway-access.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';
function fixture(){
 const p=selectedTransferPlace('Ubud','Indonesia','reference:geonames:1622846','stop');const a=selectedTransferPlace('DPS','Indonesia','reference:ourairports:26751','endpoint');
 const town={...p,id:'stay',kind:'stop' as const,coordinates:p.coordinates!},gateway={...a,id:'gateway',kind:'gateway' as const,coordinates:a.coordinates!};
 return {town,gateway,record:{version:1,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,id:'synthetic-access',status:'active',town,gateway:{kind:'airport',place:gateway},directions:['town-to-gateway'],accessMode:'road',relationship:'same-land',evidence:{id:'access-source',url:'https://operator.example/access',supports:'access',reviewedAt:'2026-10-21'},timingPolicy:'gateway-access-v1'}};
}
const context={asOf:'2026-10-27',travelDate:'2026-12-11'};
test('qualified access retains exact identities and exposes no onward passenger service',()=>{const f=fixture(),before=JSON.stringify(f);const r=qualifyTownGatewayAccess(f.record as any,f.town,f.gateway,'town-to-gateway',context);assert.ok(r);assert.equal(r.gateway.kind,'airport');assert.equal(r.accessMode,'road');assert.ok(r.planningMinutes!>0);assert.equal('service' in r,false);assert.equal(JSON.stringify(f),before);});
test('strict kind, direction, snapshot, identity, geography and source guards fail closed',()=>{
 const mutations=[(r:any)=>r.status='withdrawn',(r:any)=>r.referenceSnapshotId='old',(r:any)=>r.version=2,(r:any)=>r.gateway.kind='port',(r:any)=>r.town.country='Turkey',(r:any)=>r.town.providerId+='changed',(r:any)=>r.gateway.place.coordinates[0]+=0.1,(r:any)=>r.town.geographicBinding=undefined,(r:any)=>r.evidence.supports='directional-service',(r:any)=>r.evidence.reviewedAt='2027-01-01',(r:any)=>r.evidence.validUntil='2026-12-01',(r:any)=>r.evidence.expiresAt='2026-10-26',(r:any)=>r.accessMode='ferry',(r:any)=>r.timingPolicy='invented'];
 for(const change of mutations){const f=fixture();const r=structuredClone(f.record);change(r);assert.equal(qualifyTownGatewayAccess(r as any,f.town,f.gateway,'town-to-gateway',context),null);}
 const f=fixture();assert.equal(qualifyTownGatewayAccess(f.record as any,f.town,f.gateway,'gateway-to-town',context),null);
});
test('off-island access needs independently supplied crossing evidence; unknown timing is not zero',()=>{
 const f=fixture();const r:any={...f.record,relationship:'explicit-crossing',timingPolicy:null};assert.equal(qualifyTownGatewayAccess(r,f.town,f.gateway,'town-to-gateway',context),null);
 r.crossingEvidence={...r.evidence,id:'crossing-source'};const qualified=qualifyTownGatewayAccess(r,f.town,f.gateway,'town-to-gateway',context);assert.ok(qualified);assert.equal(qualified.planningMinutes,null);
 r.crossingEvidence.supports='directional-service';assert.equal(qualifyTownGatewayAccess(r,f.town,f.gateway,'town-to-gateway',context),null);
});

import * as bali from '../lib/easyt/reviewed-island-destinations.ts';
test('published Bali access runs through shared contract in both existing directions',()=>{
 const f=fixture();const lookup=(bali as any).reviewedIslandAccessForBase;assert.equal(typeof lookup,'function');
 for(const direction of ['town-to-gateway','gateway-to-town']){const r=lookup(f.town,direction);assert.ok(r);assert.equal(r.gateway.kind,'airport');assert.equal(r.gateway.place.canonicalPlaceId,'reference:ourairports:26751');assert.equal(r.direction,direction);assert.deepEqual(r.town.coordinates,f.town.coordinates);}
});
test('Bali adapter preserves repeated stop occurrence identities independently',()=>{
 const f=fixture(),lookup=(bali as any).reviewedIslandAccessForBase;
 for(const id of ['first-ubud-stay','second-ubud-stay']){const input={...f.town,id};const before=JSON.stringify(input);assert.equal(lookup(input,'town-to-gateway')?.town.id,id);assert.equal(JSON.stringify(input),before);}
});
test('estimated access carries internal timing provenance separately from access evidence',()=>{const f=fixture();const r=qualifyTownGatewayAccess(f.record as any,f.town,f.gateway,'town-to-gateway',context)!;assert.equal((r as any).timing?.source.id,'planner:gateway-access-v1');assert.equal((r as any).timing?.basis,'estimate');assert.equal((r as any).timing?.scope,'access');assert.equal(r.evidence.id,'access-source');});
test('remote access uses the existing distance allowance rather than a short airport default',()=>{
 const f=fixture(),p=selectedTransferPlace('Bristol','United Kingdom','reference:geonames:2654675','stop'),a=selectedTransferPlace('LHR','United Kingdom','reference:ourairports:2434','endpoint');
 const town={...p,id:'bristol-stay',kind:'stop' as const,coordinates:p.coordinates!},gateway={...a,id:'lhr',kind:'gateway' as const,coordinates:a.coordinates!};
 // Synthetic access proof tests contract behavior, not reviewed Bristol service coverage.
 const record={...f.record,town,gateway:{kind:'airport',place:gateway},relationship:'remote'};const r=qualifyTownGatewayAccess(record as any,town,gateway,'town-to-gateway',context);assert.ok(r);assert.equal(r.planningMinutes,210);assert.equal(r.timing?.source.id,'planner:gateway-access-v1');
 record.evidence={...record.evidence,withdrawn:true} as any;assert.equal(qualifyTownGatewayAccess(record as any,town,gateway,'town-to-gateway',context),null);
});
