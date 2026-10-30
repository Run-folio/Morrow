import assert from 'node:assert/strict';
import test from 'node:test';
import {composeReviewedJourney} from '../lib/easyt/reviewed-journey-composer.ts';
import {comparisonLeg} from './fixtures/transport-comparison.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
const context={asOf:'2026-10-27',travelDate:'2026-12-30'};
const source=(id:string,supports:string)=>({id,url:'https://operator.example/'+id,reviewedAt:'2026-10-27',expiresAt:'2026-10-28',supports});
function fixture(){
 const leg=comparisonLeg(),p=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint'),middle={...p,id:'same-terminal',kind:'gateway',coordinates:p.coordinates!};
 const service=(id:string,from:any,to:any)=>({id,kind:'service',mode:'train',from,to,evidence:source(id,'directional-service'),timing:{minutes:150,basis:'estimate',scope:'component',covers:['movement','departure-processing','arrival-processing'],evidence:source(id+'-time','planning-estimate')}});
 const connection={id:'connection',kind:'connection',mode:'walk',from:middle,to:middle,evidence:source('same-terminal','connection'),timing:{minutes:75,basis:'estimate',scope:'component',covers:['connection-buffer'],evidence:{kind:'internal-policy',id:'planner:transfer-impact-rules-v1',version:1,rule:'connection-buffer',supports:'planning-estimate'}}};
 return {leg,template:{id:'policy-connection',from:leg.fromEndpoint!,to:leg.toEndpoint!,components:[service('first',leg.fromEndpoint,middle),connection,service('second',middle,leg.toEndpoint)]}};
}
test('versioned existing connection policy needs no invented external timing URL',()=>{
 const {leg,template}=fixture();const r=composeReviewedJourney(leg,template as any,context);assert.equal(r.status,'complete');if(r.status!=='complete')return;
 assert.equal(r.candidate.totalDurationMinutes,375);assert.equal(r.candidate.segments.length,2);assert.ok(r.candidate.reasons.some(r=>r.includes('planner:transfer-impact-rules-v1')));assert.ok(!JSON.stringify(r).includes('https://planner:'));
});
test('internal policy cannot establish service or bless altered numbers, versions or a moving connection',()=>{
 for(const change of [(t:any)=>t.components[1].timing.minutes=5,(t:any)=>t.components[1].timing.evidence.version=2,(t:any)=>t.components[1].timing.evidence.id='unknown-policy',(t:any)=>t.components[0].evidence=t.components[1].timing.evidence,(t:any)=>t.components[1].to=t.to]){
  const {leg,template}=fixture();change(template);assert.notEqual(composeReviewedJourney(leg,template as any,context).status,'complete');
 }
});

test('malformed internal timing evidence is refused without throwing',()=>{
 for(const value of [null,undefined,42,'internal-policy',{}, {kind:'internal-policy'}]){
  const {leg,template}=fixture();template.components[1].timing.evidence=value as any;
  assert.equal(composeReviewedJourney(leg,template as any,context).status,'unqualified');
 }
});

test('external service evidence cannot impersonate internal policy provenance',()=>{
 const {leg,template}=fixture();Object.assign(template.components[0].evidence,{kind:'internal-policy'});
 assert.equal(composeReviewedJourney(leg,template as any,context).status,'unqualified');
});

test('existing gateway access policy scales with qualified distance and rejects a short remote-airport allowance',()=>{
 const {leg,template}=fixture();
 const airport=selectedTransferPlace('LHR','United Kingdom','reference:ourairports:2434','endpoint');
 const gateway={...airport,id:'airport',kind:'gateway',coordinates:airport.coordinates!};
 const origin=leg.fromEndpoint!;
 const access={id:'access',kind:'access',mode:'road',from:origin,to:gateway,evidence:source('qualified-access','access'),timing:{minutes:75,basis:'estimate',scope:'component',covers:['movement'],evidence:{kind:'internal-policy',id:'planner:gateway-access-v1',version:1,rule:'gateway-access',supports:'planning-estimate'}}};
 const service={...template.components[0],from:gateway,to:leg.toEndpoint};
 const t={...template,components:[access,service]};
 assert.equal(composeReviewedJourney(leg,t as any,context).status,'complete');
 const remote=selectedTransferPlace('Bristol','United Kingdom','reference:geonames:2654675','endpoint');
 const from={...remote,id:origin.id,kind:origin.kind,coordinates:remote.coordinates!};
 const remoteLeg={...leg,fromEndpoint:from};const remoteTemplate={...t,from,components:[{...access,from},service]};
 assert.equal(composeReviewedJourney(remoteLeg,remoteTemplate as any,context).status,'unqualified','75 minutes must not qualify remote access');
 remoteTemplate.components[0].timing!.minutes=210;const remoteResult=composeReviewedJourney(remoteLeg,remoteTemplate as any,context);assert.equal(remoteResult.status,'complete');if(remoteResult.status==='complete')assert.equal(remoteResult.candidate.totalDurationMinutes,360,'existing access allowance plus service once');
 for(const mutate of [(a:any)=>a.kind='connection',(a:any)=>a.mode='walk',(a:any)=>a.timing.evidence.version=2,(a:any)=>a.to=leg.toEndpoint]){
  const copy=structuredClone(t);mutate(copy.components[0]);assert.notEqual(composeReviewedJourney(leg,copy as any,context).status,'complete');
 }
});
