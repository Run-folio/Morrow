import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {cityReturnTrip} from './fixtures/omio-return.ts';
import {gatewayReturnTrip} from './fixtures/gateway-return.ts';
for(const browserName of ['chromium','webkit'] as const)for(const [kind,fixture] of [['city',cityReturnTrip],['gateway-town',gatewayReturnTrip]] as const){
 test(`both mounted ${kind} flight legs show the same return search without booking or trip writes (${browserName})`,{skip:!builderBrowserTestsEnabled,timeout:40_000},async()=>{
  const trip=fixture();let requests=0;
  const view=await renderBuilder({path:`/journey/${trip.id}/transport`,initialTrip:trip,browserName,styled:true,offlineOnly:true,transferRequest:async()=>{requests++;return {status:500,body:{error:'No routing expected'}};}});
  view.page.setDefaultTimeout(6000);
  try{
   await view.page.setViewportSize({width:320,height:1000});
   const cards=view.page.locator('[data-transport-leg-id]');await cards.first().waitFor();assert.equal(await cards.count(),2);
   const saved=()=>view.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).sort())));const before=await saved();
   const urls:string[]=[];
   for(let i=0;i<2;i++){
    await cards.nth(i).getByRole('button',{name:/View details:/}).click();
    const link=cards.nth(i).getByRole('link',{name:/Return search/});await link.waitFor();const url=(await link.getAttribute('href'))!;urls.push(url);
    assert.match((await link.getAttribute('rel'))!,/sponsored/);assert.equal(await link.getAttribute('target'),'_blank');
    const inner=new URL(new URL(url).searchParams.get('u')!);assert.equal(inner.searchParams.get('departureDate'),trip.startDate);assert.equal(inner.searchParams.get('returnDate'),trip.endDate);
   }
   assert.equal(urls[0],urls[1]);assert.equal(await saved(),before);assert.equal(requests,0);
   assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await view.page.reload();await view.page.locator('[data-transport-leg-id]').first().waitFor();assert.equal(await view.page.locator('[data-transport-leg-id]').count(),2);assert.equal(await saved(),before);assert.deepEqual(view.errors,[]);
  }finally{await view.close();}
 });
}
