import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {builderBrowserTestsEnabled,renderBuilder} from './helpers/builder-render.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
import {tripOverviewDisplayTitle,renameTripIdentity} from '../lib/easyt/trip-display.ts';

for(const browserName of ['chromium','webkit'] as const)for(const surface of ['overview','transport','itinerary'] as const)test(`${browserName}: ${surface} title saves once without duplicate preview and uses the shared rounded field`,{skip:!builderBrowserTestsEnabled,timeout:90_000},async()=>{
 const trip=japanTrip();trip.title=trip.brief.customTitle='Original name';
 const view=await renderBuilder({path:`/journey/${trip.id}${surface==='overview'?'':`/${surface}`}`,initialTrip:trip,styled:true,browserName});
 mkdirSync('output/playwright/title-polish',{recursive:true});
 try{
  for(const width of [390,1440,320]){
   await view.page.setViewportSize({width,height:1000});const title=view.page.locator('#trip-shell-title');await title.scrollIntoViewIfNeeded();const before=(await title.boundingBox())!;
   await title.getByRole('button').click();const input=title.getByRole('textbox',{name:'Trip name',exact:true});await input.waitFor();assert.equal(await view.page.getByRole('textbox',{name:'Trip name',exact:true}).count(),1);assert.ok(Math.abs((await input.boundingBox())!.y-before.y)<4);
   await input.fill('Test trip name');await input.press('Enter');await title.getByRole('button',{name:'Test trip name',exact:true}).waitFor();
   assert.equal(await title.innerText(),'Test trip name','Saving must not add a second copy through the full-title preview');assert.equal(await title.getByRole('button').evaluate((el:HTMLElement)=>document.activeElement===el),true);
   if(width!==320)await view.page.screenshot({path:`output/playwright/title-polish/${surface}-${width}-${browserName}-short-saved.png`,fullPage:false});
   await title.getByRole('button').press('Space');const field=title.getByRole('textbox',{name:'Trip name',exact:true});await field.waitFor();assert.equal(await view.page.getByText(/Leave blank to use/).count(),0);assert.equal(await view.page.locator('#trip-title-hint').count(),0,'No redundant counter/helper line');
   const style=await field.evaluate((el:HTMLElement)=>{const c=getComputedStyle(el);return {radius:c.borderTopLeftRadius,token:c.getPropertyValue('--morrovia-control-radius').trim(),borders:[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth],padding:c.paddingLeft}});assert.equal(style.radius,style.token);assert.notEqual(style.radius,'0px');assert.deepEqual(style.borders,['1px','1px','1px','1px']);assert.equal(style.padding,'16px');
   await view.page.screenshot({path:`output/playwright/title-polish/${surface}-${width}-${browserName}-editing.png`,fullPage:false});
   await field.fill('Cancelled name');await field.press('Escape');assert.equal(await title.innerText(),'Test trip name');assert.equal(await title.getByRole('button').evaluate((el:HTMLElement)=>document.activeElement===el),true);
   assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  const title=view.page.locator('#trip-shell-title');await title.getByRole('button').press('Enter');let input=title.getByRole('textbox',{name:'Trip name',exact:true});await input.fill('日'.repeat(81));await input.press('Enter');await view.page.getByRole('alert').getByText('Use 80 characters or fewer.').waitFor();assert.equal(await input.getAttribute('aria-describedby'),'trip-title-error');assert.equal(await input.inputValue(),'日'.repeat(81));
  await view.page.addScriptTag({path:resolve('node_modules/axe-core/axe.min.js')});const audit=await view.page.evaluate(async()=> (window as any).axe.run(document.querySelector('#trip-shell-title')!.closest('form'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}));assert.deepEqual(audit.violations.map((v:any)=>v.id),[]);
  await input.fill('  Café   京都  ');await input.press('Enter');await title.getByRole('button',{name:'Café 京都',exact:true}).waitFor();assert.equal(await title.innerText(),'Café 京都');await view.page.reload();await title.getByRole('button',{name:'Café 京都',exact:true}).waitFor();assert.equal(await title.innerText(),'Café 京都');
  await title.getByRole('button').click();input=title.getByRole('textbox',{name:'Trip name',exact:true});await input.fill('   ');await input.press('Enter');const fallback=tripOverviewDisplayTitle(renameTripIdentity(trip,''));await title.getByRole('button',{name:fallback,exact:true}).waitFor();assert.equal(await title.innerText(),fallback);await view.page.reload();await title.getByRole('button',{name:fallback,exact:true}).waitFor();
  await title.getByRole('button').click();input=title.getByRole('textbox',{name:'Trip name',exact:true});const long='W'.repeat(80);await input.fill(long);await input.press('Enter');await title.getByRole('button',{name:long,exact:true}).waitFor();assert.equal(await title.innerText(),long,'A clipped title also stays single after save');
  await view.page.keyboard.press('Tab');await title.getByRole('button').focus();const preview=title.locator('span[aria-hidden="true"]');await preview.waitFor({state:'visible'});assert.equal(await preview.innerText(),long,'A later explicit focus still offers the full clipped title');await title.getByRole('button').press('Escape');await preview.waitFor({state:'hidden'});
  await view.page.screenshot({path:`output/playwright/title-polish/${surface}-${browserName}-saved.png`,fullPage:false});assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
