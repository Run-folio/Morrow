// Mounted production-workspace checks against synthetic Storybook fixtures only.
// Run with MORROVIA_CALENDAR_PREVIEW_ORIGIN=http://127.0.0.1:60312 and, if needed,
// MORROVIA_PLAYWRIGHT_PATH pointing at the already-installed Playwright package.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const origin = process.env.MORROVIA_CALENDAR_PREVIEW_ORIGIN;
const enabled = Boolean(origin);
async function fixture(run, { story='populated', width=390, day=2 }={}) {
  const { chromium }=require(process.env.MORROVIA_PLAYWRIGHT_PATH || 'playwright');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width,height:844}});
  page.setDefaultTimeout(10000);
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  // Count at every native modal opening, catching transient stacking as well as settled DOM.
  await page.addInitScript(()=>{window.__modalCounts=[];const show=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){show.call(this);window.__modalCounts.push(document.querySelectorAll('dialog:modal').length);};});
  try {
    await page.goto(`${origin}/iframe.html?id=morrovia-mobile-workspace--${story}&viewMode=story`);
    await page.getByRole('button',{name:'Calendar',exact:true}).click({timeout:45000});
    await page.getByRole('button',{name:new RegExp(`^Day ${day},`)}).click();
    await run(page);
    assert.ok((await page.evaluate(()=>window.__modalCounts)).every(n=>n<=1),'no transition may stack native modal dialogs');
  } catch(error) { console.error('Fixture failure', await page.evaluate(()=>({url:location.href,dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>({label:e.getAttribute('aria-label'),modal:e.matches(':modal')})),inputs:[...document.querySelectorAll('input')].map(e=>({value:e.value,visible:!!e.getClientRects().length})),headings:[...document.querySelectorAll('h2')].map(e=>e.textContent)}))); throw error; } finally {await browser.close();}
}
async function oneModal(page){await page.waitForFunction(()=>document.querySelectorAll('dialog:modal').length===1);assert.equal(await page.locator('dialog:modal').count(),1);}
for(const kind of ['transfer','activity','move','add']) test(`Calendar ${kind} uses one active surface`,{skip:!enabled},async()=>{
 await fixture(async p=>{
  if(kind==='transfer') await p.getByRole('button',{name:/Sacred Valley.*Arequipa/}).first().click();
  if(kind==='activity') await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).click();
  if(kind==='move'){await p.locator('summary[aria-label="Organise Shinjuku Gyo-en"]').click();await p.locator('details[open]').getByRole('button',{name:'Move to another day',exact:true}).click();}
  if(kind==='add') await p.getByRole('button',{name:'Add plan',exact:true}).click();
  assert.equal(await p.locator('dialog:modal').count(),1,`${kind} must replace or suspend its day surface`);
 },kind==='transfer'?{story:'empty',day:6}:{});
});

for(const keyboard of [false,true]) test(`detail Back preserves day draft, scroll and origin (${keyboard?'keyboard':'touch'})`,{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.getByLabel('Add day note',{exact:true}).fill('Unsaved note survives detail navigation');
  const origin=p.getByRole('button',{name:/^Shinjuku Gyo-en/});
  await origin.scrollIntoViewIfNeeded();await origin.focus();
  const before=await p.locator('dialog:modal').evaluate(e=>e.scrollTop);
  if(keyboard) await origin.press('Enter'); else await origin.click();
  await oneModal(p);
  await p.getByRole('button',{name:'Back to day',exact:true}).waitFor();
  assert.equal(await p.getByRole('button',{name:'Close day details',exact:true}).count(),0,'detail has only its own close action');
  await p.waitForFunction(()=>document.activeElement?.hasAttribute('data-calendar-item-back'));
  // Hidden day controls must not participate in the active detail's tab cycle.
  await p.getByRole('button',{name:'Back to day',exact:true}).press('Shift+Tab');
  assert.ok(await p.evaluate(()=>Boolean(document.activeElement?.closest('dialog:modal'))));
  await p.getByRole('button',{name:'Back to day',exact:true}).click();
  await p.waitForFunction(()=>document.activeElement?.textContent?.startsWith('Shinjuku Gyo-en'));
  assert.ok(Math.abs(await p.locator('dialog:modal').evaluate(e=>e.scrollTop)-before)<3,'same day scroll');
  assert.equal(await p.getByLabel('Add day note',{exact:true}).inputValue(),'Unsaved note survives detail navigation');
 });
});

test('details Escape returns to day; Close exits and reopening starts at day',{skip:!enabled},async()=>{
 await fixture(async p=>{
  for(let i=0;i<2;i++){
   await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).click();await oneModal(p);
   await p.keyboard.press('Escape');await oneModal(p);
   await p.getByRole('heading',{name:'Tokyo',exact:true}).waitFor();
  }
  await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).click();
  await p.getByRole('button',{name:'Close',exact:true}).click();
  await p.waitForFunction(()=>document.querySelectorAll('dialog:modal').length===0);
  assert.match(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')||''),/^Day 2, Tokyo/);
  await p.getByRole('button',{name:/^Day 2, Tokyo,/}).click();await oneModal(p);
  await p.getByRole('heading',{name:'Tokyo',exact:true}).waitFor();
 });
});

for(const dismiss of ['Cancel','Escape'])test(`Move ${dismiss} restores activity details and day draft`,{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.getByLabel('Add day note',{exact:true}).fill('Keep this note');
  await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).click();
  await p.getByRole('button',{name:'Move to…',exact:true}).click();await oneModal(p);
  await p.locator('dialog:modal select').first().selectOption('day-3');
  if(dismiss==='Escape')await p.keyboard.press('Escape');else await p.getByRole('button',{name:'Cancel',exact:true}).click();
  await p.getByRole('button',{name:'Back to day',exact:true}).waitFor();await oneModal(p);
  await p.waitForFunction(()=>document.activeElement?.textContent==='Move to…');
  await p.getByRole('button',{name:'Back to day',exact:true}).click();
  assert.equal(await p.getByLabel('Add day note',{exact:true}).inputValue(),'Keep this note');
 });
});

test('Add editor preserves text through viewport interruption then saves to chosen daypart',{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.getByLabel('Add day note',{exact:true}).fill('Day note remains');
  await p.getByRole('button',{name:'Add plan',exact:true}).click();await oneModal(p);
  await p.getByRole('button',{name:'Afternoon',exact:true}).click();
  await p.getByRole('button',{name:'New plan',exact:true}).click();
  await p.getByLabel('Add your own',{exact:true}).fill('Synthetic afternoon walk');await oneModal(p);
  await p.setViewportSize({width:768,height:844});
  assert.equal(await p.getByLabel('Add your own',{exact:true}).inputValue(),'Synthetic afternoon walk');await oneModal(p);
  await p.setViewportSize({width:390,height:844});
  assert.equal(await p.getByLabel('Add your own',{exact:true}).inputValue(),'Synthetic afternoon walk');
  await p.getByRole('button',{name:'Add to Afternoon',exact:true}).click();
  await p.getByRole('button',{name:/^Synthetic afternoon walk/}).waitFor();await oneModal(p);
  assert.equal(await p.getByLabel('Add day note',{exact:true}).inputValue(),'Day note remains');
 });
});

test('Move save selects target day and Undo preserves the original activity',{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.locator('summary[aria-label="Organise Shinjuku Gyo-en"]').click();
  await p.locator('details[open]').getByRole('button',{name:'Move to another day',exact:true}).click();
  await p.locator('dialog:modal select').first().selectOption('day-3');
  await p.getByRole('button',{name:'Move activity',exact:true}).click();
  await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).waitFor();await oneModal(p);
  assert.equal(new URL(p.url()).searchParams.get('day'),'3');
  await p.getByRole('button',{name:'Undo',exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('summary[aria-label="Organise Shinjuku Gyo-en"]'));
  await p.getByRole('button',{name:'Close day details',exact:true}).click();
  await p.getByRole('button',{name:/^Day 2, Tokyo,/}).click();
  await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).waitFor();
 });
});

for(const width of [768,1440]) test(`Calendar details and editor return at ${width}px`,{skip:!enabled},async()=>{
 await fixture(async p=>{
  assert.equal(await p.locator('dialog:modal').count(),width<1100?1:0);
  await p.getByRole('button',{name:/^Shinjuku Gyo-en/}).last().click();await oneModal(p);
  await p.getByRole('button',{name:'Move to…',exact:true}).click();await oneModal(p);
  await p.getByRole('button',{name:'Cancel',exact:true}).click();
  await p.getByRole('button',{name:'Back to day',exact:true}).waitFor();await oneModal(p);
  await p.getByRole('button',{name:'Back to day',exact:true}).click();
  await p.waitForFunction(n=>document.querySelectorAll('dialog:modal').length===n,width<1100?1:0);
 },{width});
});

test('desktop Add editor survives shrinking to mobile without an underlying open day sheet',{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.getByRole('button',{name:/Add plan to.*morning/i}).click();
  await p.getByLabel('Add your own',{exact:true}).fill('Resize draft');
  await p.setViewportSize({width:390,height:844});await oneModal(p);
  assert.equal(await p.locator('dialog[data-dialog-presentation="modal"][open]').count(),1,'suspended day must be closed, not merely nonmodal');
  assert.equal(await p.getByLabel('Add your own',{exact:true}).inputValue(),'Resize draft');
  await p.getByRole('button',{name:'Close Add panel',exact:true}).click();
  await p.getByRole('heading',{name:'Tokyo',exact:true}).waitFor();await oneModal(p);
 },{width:1440});
});

test('same-day browser Back/Forward preserves an active Add draft and never stacks surfaces',{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.getByRole('button',{name:'Add plan',exact:true}).click();
  await p.getByRole('button',{name:'New plan',exact:true}).click();
  await p.getByLabel('Add your own',{exact:true}).fill('History draft');
  // Native Back follows the browser history entry, without assuming duplicate same-day entries.
  await p.evaluate(()=>history.back());
  await p.waitForFunction(()=>new URL(location.href).searchParams.get('itineraryView')!=='calendar');
  assert.equal(await p.getByLabel('Add your own',{exact:true}).inputValue(),'History draft');await oneModal(p);
  await p.evaluate(()=>history.forward());
  await p.waitForFunction(()=>new URL(location.href).searchParams.get('itineraryView')==='calendar');
  assert.equal(await p.getByLabel('Add your own',{exact:true}).inputValue(),'History draft');await oneModal(p);
  await p.getByRole('button',{name:'Close Add panel',exact:true}).click();
  await p.getByRole('heading',{name:'Tokyo',exact:true}).waitFor();
 });
});

test('authored activity removal suspends details, cancel returns, confirm and Undo retain action parity',{skip:!enabled},async()=>{
 await fixture(async p=>{
  await p.getByRole('button',{name:'Add plan',exact:true}).click();
  await p.getByRole('button',{name:'New plan',exact:true}).click();
  await p.getByLabel('Add your own',{exact:true}).fill('Synthetic removable walk');
  await p.getByRole('button',{name:'Add to Morning',exact:true}).click();
  await p.getByRole('button',{name:/^Synthetic removable walk/}).click();
  await p.getByRole('button',{name:'Remove',exact:true}).click();await oneModal(p);
  await p.getByRole('button',{name:'Keep activity',exact:true}).click();
  await p.getByRole('button',{name:'Back to day',exact:true}).waitFor();await oneModal(p);
  await p.getByRole('button',{name:'Remove',exact:true}).click();
  await p.getByRole('button',{name:'Remove activity',exact:true}).click();
  await p.getByRole('heading',{name:'Tokyo',exact:true}).waitFor();await oneModal(p);
  assert.equal(await p.getByRole('button',{name:/^Synthetic removable walk/}).count(),0);
  await p.getByRole('button',{name:'Undo',exact:true}).click();
  await p.getByRole('button',{name:/^Synthetic removable walk/}).waitFor();
 });
});
