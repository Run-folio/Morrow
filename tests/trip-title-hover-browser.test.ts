import assert from'node:assert/strict';import test from'node:test';import{mkdirSync}from'node:fs';import{builderBrowserTestsEnabled,renderBuilder}from'./helpers/builder-render.ts';import{japanTrip}from'./fixtures/transport-choice.ts';
for(const browserName of['chromium','webkit']as const)for(const surface of['overview','transport']as const)test(`${browserName}: ${surface} hover discloses only genuinely clipped names across wide desktop and mobile`,{skip:!builderBrowserTestsEnabled,timeout:120_000},async()=>{
 const trip=japanTrip();trip.title=trip.brief.customTitle='test name';const view=await renderBuilder({path:`/journey/${trip.id}${surface==='overview'?'':`/${surface}`}`,initialTrip:trip,styled:true,browserName});mkdirSync('output/playwright/title-hover',{recursive:true});
 try{
  const title=view.page.locator('#trip-shell-title');
  for(const width of[1690,2048,1440,390,320]){
   await view.page.setViewportSize({width,height:1000});await view.page.evaluate(()=>document.fonts.ready);await title.scrollIntoViewIfNeeded();await title.getByRole('button').hover();assert.equal(await title.innerText(),'test name','Wide Chrome font ink beyond its line box must not create a duplicate');
   for(const name of(width===390?['A gentle journey through Japan','Café 京都','رحلة اليابان','test name']:['A gentle journey through Japan','test name'])){
    await title.getByRole('button').click();const input=title.getByRole('textbox',{name:'Trip name',exact:true});await input.fill(name);await view.page.getByRole('button',{name:'Save name',exact:true}).click();await title.getByRole('button',{name,exact:true}).waitFor();assert.equal(await title.innerText(),name);
    await view.page.mouse.move(0,0);await title.getByRole('button').hover();assert.equal(await title.innerText(),name,'Hover after save must not repeat a fitting name');
    await view.page.keyboard.press('Tab');await title.getByRole('button').focus();assert.equal(await title.innerText(),name,'Keyboard focus also avoids a redundant preview');assert.equal(await title.getByRole('button').getAttribute('aria-describedby'),'trip-title-edit-hint');
    await title.getByRole('button').press('Enter');await input.fill('Cancelled name');await input.press('Escape');assert.equal(await title.innerText(),name);await view.page.mouse.move(0,0);await title.getByRole('button').hover();assert.equal(await title.innerText(),name);
    await view.page.reload();await title.getByRole('button',{name,exact:true}).waitFor();await view.page.evaluate(()=>document.fonts.ready);await title.getByRole('button').hover();assert.equal(await title.innerText(),name,'Reload retains the title without duplicate hover text');assert.equal(await view.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   if(width===1690||width===390)await view.page.screenshot({path:`output/playwright/title-hover/fixed-${surface}-${browserName}-${width}.png`,fullPage:false});
  }
  const input=title.getByRole('textbox',{name:'Trip name',exact:true}),long='W'.repeat(80);await title.getByRole('button').click();await input.fill(long);await view.page.getByRole('button',{name:'Save name',exact:true}).click();await title.getByRole('button',{name:long,exact:true}).waitFor();assert.equal(await title.innerText(),long,'Focus return stays quiet even for a long name');
  for(const width of[320,2048]){
   await view.page.setViewportSize({width,height:1000});await view.page.keyboard.press('Tab');await title.getByRole('button').focus();const preview=title.locator('span[aria-hidden="true"]');await preview.waitFor({state:'visible'});assert.equal(await preview.innerText(),long,'Truncated names remain available in full');await title.getByRole('button').press('Escape');await preview.waitFor({state:'hidden'});
  }
  assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
