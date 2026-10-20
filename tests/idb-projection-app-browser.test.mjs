import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {browserFixture,browserBundle} from './helpers/idb-projection-browser.mjs';
const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR??'output/playwright/idb-app';
for(const width of [1440,390])test(`rendered Builder completes selected IDB route and cold-reopens at ${width}px`,{skip:!builderBrowserTestsEnabled,timeout:60000},async()=>{
 const fixture=await browserFixture();let release,calls=0,accountWrites=0;const gate=new Promise(resolve=>{release=resolve;});
 const view=await renderBuilder({path:'/',styled:true,seedRecovery:false,transferRequest:async({legs})=>{calls++;await gate;return {status:200,body:{legs,assessments:[],failedLegIds:[]}};}});
 const page=view.page,context=page.context(),base=new URL(page.url()).origin,external=[];
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base){external.push(url.origin);return route.abort();}
  if(url.pathname.startsWith('/api/easyt/trips')&&!['GET','HEAD'].includes(route.request().method())){accountWrites++;return route.abort();}
  return route.continue();
 });
 await context.tracing.start({screenshots:true,snapshots:true,sources:true});mkdirSync(artifacts,{recursive:true});
 try{
  await page.setViewportSize({width,height:1000});await page.addScriptTag({content:await browserBundle});
  await page.evaluate(value=>window.idbQa.seed(value),fixture);
  await page.goto(base+'/journey/new?trip='+fixture.source.id+'&recover=1');
  await page.locator('[data-builder-edit-session="active"]').waitFor();
  const build=page.getByRole('button',{name:/^Build trip/});await build.waitFor();
  await page.screenshot({path:artifacts+'/idb-'+width+'-builder.png',fullPage:true});
  await build.click();await page.getByRole('button',{name:'Opening your route…',exact:true}).waitFor();release();
  await page.waitForURL(url=>url.pathname!=='/journey/new',{timeout:20000});
  await page.locator('[aria-label="Trip overview"]').waitFor({timeout:15000});
  await page.addScriptTag({content:await browserBundle});await page.evaluate(value=>window.idbQa.attach(value),fixture);
  const completed=await page.evaluate(()=>window.idbQa.read());assert.equal(completed.kind,'found');assert.equal(completed.trip.status,'planned');
  assert.equal(completed.trip.brief.cascadeStatus.routeReconciliation.residual.some(unit=>unit.kind!=='recommendation'&&unit.phase==='pending'),false);
  assert.equal(calls,1);assert.equal(accountWrites,0);assert.deepEqual(view.errors,[]);
  await page.screenshot({path:artifacts+'/idb-'+width+'-overview.png',fullPage:true});
  const overviewUrl=page.url();await page.goto('about:blank');const cold=page;await cold.goto(base+'/journey/new?trip='+fixture.source.id+'&recover=1');
  await cold.locator('[data-builder-edit-session="active"]').waitFor();await cold.addScriptTag({content:await browserBundle});await cold.evaluate(value=>window.idbQa.attach(value),fixture);
  const reopened=await cold.evaluate(()=>window.idbQa.read());assert.equal(reopened.kind,'found');assert.deepEqual(reopened.trip,completed.trip);assert.equal(accountWrites,0);
  await cold.screenshot({path:artifacts+'/idb-'+width+'-cold-builder.png',fullPage:true});
  writeFileSync(artifacts+'/idb-'+width+'.json',JSON.stringify({width,overviewUrl,providerCalls:calls,accountWrites,requiredPending:0,coldNewDocument:true,tripExact:true,externalOriginsBlocked:[...new Set(external)],errors:view.errors},null,2)+'\n');
  await context.tracing.stop({path:artifacts+'/idb-'+width+'.zip'});
 }catch(error){release();await page.screenshot({path:artifacts+'/idb-'+width+'-failure.png',fullPage:true}).catch(()=>{});await context.tracing.stop({path:artifacts+'/idb-'+width+'-failure.zip'}).catch(()=>{});throw error;}
 finally{release();await view.close();}
});
