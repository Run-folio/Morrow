import type {TripLeg} from '../lib/easyt/trip.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {capturedPhilippinesTrip} from './fixtures/philippines-captured.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {compareCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {effectiveTripLeg} from '../lib/easyt/transport-mode-choice.ts';
for(const browserName of ['chromium','webkit'] as const){
 test(`internal connection policy remains estimated through mounted Use and reopen (${browserName})`,{skip:!builderBrowserTestsEnabled,timeout:40_000},async()=>{
  const trip=capturedPhilippinesTrip();let calls=0;
  const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,offlineOnly:true,transferRequest:async({legs})=>{
   calls++;const leg=legs[0] as TripLeg,p=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint'),middle={...p,id:'synthetic-terminal',kind:'gateway' as const,coordinates:p.coordinates!};
   const ev=(id:string,supports:any)=>({id,url:'https://operator.example/'+id,reviewedAt:'2026-10-27',expiresAt:'2026-10-28',supports});
   const service=(id:string,from:any,to:any)=>({id,kind:'service' as const,mode:'train' as const,from,to,evidence:ev(id,'directional-service'),timing:{minutes:150,basis:'estimate' as const,scope:'component' as const,covers:['movement','departure-processing','arrival-processing'] as const,evidence:ev(id+'-timing','planning-estimate')}});
   // Synthetic contract, not a claim of Philippine/European connecting rail service.
   const template={id:'policy-mounted',from:leg.fromEndpoint!,to:leg.toEndpoint!,components:[service('first',leg.fromEndpoint,middle),{id:'connection',kind:'connection' as const,mode:'walk' as const,from:middle,to:middle,evidence:ev('connection','connection'),timing:{minutes:75,basis:'estimate' as const,scope:'component' as const,covers:['connection-buffer'] as const,evidence:{kind:'internal-policy' as const,id:'planner:transfer-impact-rules-v1' as const,version:1 as const,rule:'connection-buffer' as const,supports:'planning-estimate' as const}}},service('second',middle,leg.toEndpoint)]};
   return {status:200,body:await compareCanonicalTransferJourney(leg,{reviewedJourneyTemplates:[template],reviewedJourneyContext:{asOf:'2026-10-27',travelDate:'2026-12-30'}})};
  }});
  view.page.setDefaultTimeout(6000);
  try{
   await view.page.locator('[data-transport-leg-id]').last().getByRole('button',{name:/View details:/}).click();await view.page.getByRole('button',{name:'Change transport mode'}).click();const dialog=view.page.getByRole('dialog',{name:'Change transport',exact:true});
   await dialog.getByRole('button',{name:'Refresh options',exact:true}).click();await dialog.locator('[data-transport-comparison-status="ready"]').waitFor();await dialog.getByRole('radio',{name:/Train/}).click();await dialog.getByRole('button',{name:'Use train',exact:true}).click();await dialog.waitFor({state:'hidden'});
   await view.page.reload();await view.page.locator('[data-transport-leg-id]').last().getByText(/Rail/).first().waitFor();
   const docs=await view.page.evaluate((id:string)=>Object.entries(localStorage).filter(([k])=>k.startsWith('easyt:trip-recovery:v2:')&&k.includes(id)).map(([,v])=>JSON.parse(v).trip),trip.id);
   const saved=docs.find((t:any)=>effectiveTripLeg(t,t.legs.at(-1)).mode==='train');assert.ok(saved);const leg=effectiveTripLeg(saved,saved.legs.at(-1));assert.equal(leg.doorToDoorMinutes,375);assert.equal(leg.provenance,'planning_estimate');assert.deepEqual(saved.stops,JSON.parse(JSON.stringify(trip.stops)));assert.equal(calls,1);assert.deepEqual(view.errors,[]);
  }finally{await view.close();}
 });
}
