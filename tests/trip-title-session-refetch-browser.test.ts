import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {cityReturnTrip} from './fixtures/omio-return.ts';
const auth=`import{useState,useEffect}from'react';export const authClient={useSession(){const[pending,setPending]=useState(false);useEffect(()=>{const start=()=>setPending(true),end=()=>setPending(false);window.addEventListener('title-refetch-start',start);window.addEventListener('title-refetch-end',end);return()=>{window.removeEventListener('title-refetch-start',start);window.removeEventListener('title-refetch-end',end)}},[]);return{data:null,isPending:pending}},getSession:async()=>({data:null})};`;
for(const browserName of ['chromium','webkit'] as const)test(`${browserName}: an enabled guest title save remains device-only during session refetch`,{skip:!builderBrowserTestsEnabled,timeout:60_000},async()=>{
 let accountWrites=0;const trip=cityReturnTrip(),view=await renderBuilder({browserName,initialTrip:trip,path:`/journey/${trip.id}/transport`,styled:true,sourceOverrides:new Map([['fixture:auth',auth]]),accountRequest:()=>{accountWrites++;return{status:500,body:{error:'Guest must remain device-only'}};}});
 try{
  const page=view.page,card=page.locator('[data-transport-leg-id]').first();await card.locator('[data-transport-summary] button').click();const mark=card.getByRole('button',{name:'Mark as booked',exact:true});
  await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Mark as booked');return b&&!b.disabled});
  await page.evaluate(()=>localStorage.setItem('synthetic-retained-title-data','preserve'));
  await page.locator('#trip-shell-title').getByRole('button').click();const input=page.getByRole('textbox',{name:'Trip name',exact:true});await input.fill('Guest refetch title retained');
  await page.evaluate(()=>window.dispatchEvent(new Event('title-refetch-start')));await page.getByText('Checking this trip…',{exact:true}).waitFor();assert.equal(await mark.isEnabled(),false);
  const save=page.getByRole('button',{name:'Save name',exact:true});assert.equal(await save.isEnabled(),true);await save.click();await input.waitFor({state:'detached'});await page.getByRole('heading',{name:'Guest refetch title retained',level:1,exact:true}).waitFor();
  assert.equal(accountWrites,0);assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-retained-title-data')),'preserve');assert.equal(await page.getByRole('alert').count(),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('title-refetch-end')));await page.getByText('Checking this trip…',{exact:true}).waitFor({state:'hidden'});await page.reload();await page.getByRole('heading',{name:'Guest refetch title retained',level:1,exact:true}).waitFor();assert.equal(accountWrites,0);assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
