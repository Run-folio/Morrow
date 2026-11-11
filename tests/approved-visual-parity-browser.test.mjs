import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const origin=process.env.MORROVIA_PARITY_STORYBOOK_ORIGIN;
const itinerary='morrovia-05-product-patterns-trip-workspace-itinerary--hierarchy-tokyo-populated';
const open=async(page,id)=>page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);

test('mobile day retains direct scheduling, notes and the disclosed Add chooser', {skip:!origin}, async()=>{
 const {chromium}=require('playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:390,height:1000}});
 await open(page,itinerary);await page.getByRole('tab',{name:/^Day 2 ·/}).click();
 const planner=page.locator('section[aria-label="Day 2 planner"]');await planner.waitFor();
 assert.equal(await planner.locator('[data-day-part]').count(),4);
 const notes=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Notes/})}).last();
 const suggestions=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Suggestions for this day'})}).last();
 assert.equal(await notes.getAttribute('open'),null);assert.equal(await suggestions.getAttribute('open'),null);
 await notes.locator(':scope > summary').click();await page.getByText('Confirm the garden opening time before setting out.',{exact:true}).waitFor();
 await suggestions.locator(':scope > summary').click();const chooser=suggestions.getByRole('button',{name:'Add plan',exact:true});await chooser.click();
 const chooseDialog=page.getByRole('dialog',{name:'Add a plan',exact:true});await chooseDialog.waitFor();await page.keyboard.press('Escape');await chooseDialog.waitFor({state:'hidden'});assert.equal(await chooser.evaluate(el=>el===document.activeElement),true);
 await planner.getByRole('button',{name:/Add plan to .*midday/i}).click();const add=page.getByRole('dialog',{name:'Add to Midday on Day 2',exact:true});await add.waitFor();await add.getByRole('textbox',{name:'Add your own',exact:true}).fill('SYNTHETIC QA — parity midday');await add.getByRole('button',{name:'Add to Midday',exact:true}).click();await add.waitFor({state:'hidden'});await planner.locator('[data-day-part="midday"]').getByText('SYNTHETIC QA — parity midday',{exact:true}).waitFor();
 for(const width of [320,390,430,768,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);if(width<=760)for(const button of await planner.getByRole('button',{name:/Add plan to /}).all()){const box=await button.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,`tap target at ${width}`);}}
 await page.close();}finally{await browser.close();}
});

test('Stay review keeps a focused handoff, generic provider link and mobile dismissal', {skip:!origin}, async()=>{
 const {chromium}=require('playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}});await open(page,'morrovia-05-product-patterns-trip-workspace-stay--approved-shortlist-desktop');await page.getByRole('heading',{name:'Find your stay',exact:true}).waitFor();
 await page.getByRole('button',{name:/^Review .+ for / }).first().click();await page.waitForFunction(()=>document.activeElement?.id==='stay-handoff');
 const handoff=page.locator('#stay-handoff');assert.equal(await handoff.getByRole('link',{name:/Open Trip.com/}).getAttribute('href'),'https://www.trip.com/t/pdAWQqi56W2');assert.match(await handoff.innerText(),/General search: enter/);
 for(const width of [390,320,430]){await page.setViewportSize({width,height:1000});const dialog=page.getByRole('dialog',{name:/Find your stay:/});await dialog.waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dialog.getByRole('button',{name:'Copy stay details',exact:true}).waitFor();}
 await page.keyboard.press('Escape');await page.getByRole('dialog',{name:/Find your stay:/}).waitFor({state:'hidden'});assert.match(await page.evaluate(()=>document.activeElement?.textContent??''),/Review stay|Open details/);await page.close();
 }finally{await browser.close();}
});
