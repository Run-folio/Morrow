import type {Route} from 'playwright';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import test from 'node:test';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {loadLocalTripFromStorage} from '../lib/easyt/storage.ts';

const require=createRequire(import.meta.url);
const bundled=`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const {chromium}=require(process.env.MORROVIA_PLAYWRIGHT_MODULE??(existsSync(bundled)?bundled:'playwright'));
const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
const baseUrl=process.env.MORROVIA_BASE_URL??'http://127.0.0.1:3100';

for(const [type,width,feedbackOnly] of [['Return to start',390,false],['One way',1440,false],['Return to start',430,true]] as const)
test(feedbackOnly?'canonical night conflict reload never claims an unapplied legacy rebalance at 430px':`local homepage → Builder → autosave/reload → Build → Overview/Itinerary preserves ${type} at ${width}px`,{skip:!enabled,timeout:60000},async()=>{
 const browser=await chromium.launch({channel:process.env.MORROVIA_BROWSER_CHANNEL??'chrome',headless:true});
 const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(10000);
 const errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));
 try{
  await page.route('**/api/**',async(route:Route)=>{
   const request=route.request(),url=new URL(request.url());
   const london={name:'London',country:'United Kingdom',canonicalPlaceId:'london',coordinates:[-0.1276,51.5072],placeType:'city',routability:'direct_destination'};
   const places:Record<string,unknown>={London:london,Madrid:{name:'Madrid',country:'Spain',canonicalPlaceId:'madrid',coordinates:[-3.7038,40.4168],kind:'city'},Lisbon:{name:'Lisbon',country:'Portugal',canonicalPlaceId:'lisbon',coordinates:[-9.1393,38.7223],kind:'city'}};
   const place=places[url.searchParams.get('place')??''];
   const body=url.pathname.includes('/auth/')?null:url.pathname==='/api/journey-geocode'?{candidates:place?[place]:[],result:place??null}:url.pathname==='/api/journey-discover'?{places:[]}:url.pathname==='/api/journey-transfer-resolution'?{legs:request.postDataJSON().legs??[]}:{error:'Fixture resource not found'};
   await route.fulfill({status:url.pathname.includes('/auth/')||['/api/journey-geocode','/api/journey-discover','/api/journey-transfer-resolution'].includes(url.pathname)?200:404,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  if(type==='Return to start')await page.getByRole('button',{name:'One way',exact:true}).click();
  await page.getByRole('button',{name:type,exact:true}).click();
  await page.getByRole('combobox',{name:'Start from',exact:true}).fill('London');
  await page.getByRole('option',{name:/^London.*United Kingdom/}).first().click();
  for(const [name,country] of [['Madrid','Spain'],['Lisbon','Portugal']]){
   if(name==='Lisbon')await page.getByRole('button',{name:'Add destination',exact:true}).click();
   await page.getByRole('combobox',{name:'Destination',exact:true}).fill(name);
   await page.getByRole('option',{name:new RegExp(`^${name}.*${country}`)}).first().click();
  }
  await page.getByRole('button',{name:/Travel dates/}).click();
  const dates=page.getByRole('dialog',{name:/Travel dates/}).getByRole('textbox',{name:'YYYY-MM-DD'});
  for(const date of ['2026-11-10','2026-11-20']){await dates.fill(date);await dates.press('Enter')}
  await page.getByRole('button',{name:'Plan my trip',exact:true}).first().click();
  await page.locator('[data-builder-edit-session="active"]').waitFor();
  const tripId=new URL(page.url()).searchParams.get('trip');assert.ok(tripId);
  const readTrip=async()=>{
   const entries=await page.evaluate(()=>Object.entries(localStorage));const values=new Map<string,string>(entries);
   const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)},key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size}};
   const trip=loadLocalTripFromStorage(storage,tripId!,null);assert.ok(trip);return requireReadableTripDocument(trip);
  };
  const initial=await readTrip();assert.equal(initial.brief.origin,'London');
  assert.deepEqual(initial.stops.map(stop=>stop.name),['Madrid','Lisbon']);
  assert.equal(initial.brief.intent.route.tripType,type==='One way'?'one_way':'return_to_start');
  const homepage=await page.evaluate(()=>localStorage.getItem('easyt-private:guest:homepage-input'));
  const madrid=initial.stops.find(stop=>stop.name==='Madrid')!;const madridNights=madrid.nights;assert.ok(madridNights!==null);
  await page.getByRole('button',{name:/Add one night to Madrid/}).click();
  await page.waitForFunction(({id,nights}:{id:string;nights:number})=>Object.values(localStorage).some(raw=>{try{return JSON.parse(raw).trip?.stops?.some((stop:{id:string;nights:number})=>stop.id===id&&stop.nights===nights)}catch{return false}}),{id:madrid.id,nights:madridNights+1});
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();
  const edited=await readTrip();assert.equal(edited.stops.find(stop=>stop.id===madrid.id)!.nights,madridNights+1);
  assert.deepEqual(edited.brief.intent.route.orderedStopIds,initial.brief.intent.route.orderedStopIds);
  assert.equal(await page.evaluate(()=>localStorage.getItem('easyt-private:guest:homepage-input')),homepage);
  assert.equal(await page.getByRole('button',{name:/^Build trip/}).isDisabled(),true,'fixed dates with one extra requested night require review');
  assert.equal(await page.getByText('1 night was rebalanced',{exact:true}).count(),0,'a canonical conflict must never claim an unapplied legacy rebalance');
  assert.match(await page.locator('body').innerText(),/11 allocated nights do not reconcile with the 10-night trip/);
  if(feedbackOnly){assert.deepEqual(errors,[]);return}
  await page.getByRole('button',{name:/Remove one night from Lisbon/}).click();
  await page.waitForFunction(()=>Object.values(localStorage).some(raw=>{try{const trip=JSON.parse(raw).trip;return trip?.status==='draft'&&trip.stops.reduce((sum:number,stop:{nights:number})=>sum+stop.nights,0)===10&&trip.brief.manualNightStopIds.length===2}catch{return false}}));
  await page.reload();await page.locator('[data-builder-edit-session="active"]').waitFor();
  const balanced=await readTrip();assert.ok((balanced.brief.builderCalendarGeneration??0)>0);assert.deepEqual(balanced.planItems.map(day=>day.dayNumber),Array.from({length:11},(_,i)=>i+1));assert.equal(new Set(balanced.planItems.map(day=>day.id)).size,11);assert.deepEqual(balanced.planItems.map(day=>day.date),Array.from({length:11},(_,i)=>new Date(Date.parse('2026-11-10T00:00:00Z')+i*86400000).toISOString().slice(0,10)));assert.equal(balanced.stops.find(stop=>stop.id===madrid.id)!.nights,madridNights+1);assert.equal(balanced.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),10);
  const reject=page.getByRole('button',{name:'Reject optional',exact:true});if(await reject.count())await reject.click();
  await page.getByRole('button',{name:/^Build trip/}).click();
  const attention=page.getByRole('dialog');if(await attention.count())await attention.getByRole('button',{name:/Build|Continue/}).click();
  await page.getByRole('region',{name:'Trip overview',exact:true}).waitFor();
  const built=await readTrip();assert.equal(built.status,'planned');
  const guide=page.getByRole('button',{name:'Skip workspace guide',exact:true});try{await guide.waitFor({state:'visible',timeout:1500});await guide.click()}catch(error){if(!(error instanceof Error)||error.name!=='TimeoutError')throw error}
  await page.evaluate(()=>window.scrollTo(0,0));
  const navigation=page.getByRole('navigation',{name:'Trip workspace'});
  await navigation.getByRole('link',{name:'Itinerary',exact:true}).click();
  await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();await page.reload();
  await page.getByRole('region',{name:'Trip itinerary',exact:true}).waitFor();
  const reloaded=await readTrip();assert.deepEqual(reloaded.stops,built.stops);assert.deepEqual(reloaded.planItems,built.planItems);
  assert.equal(reloaded.brief.intent.route.tripType,built.brief.intent.route.tripType);
  assert.deepEqual(reloaded.brief.intent.route.orderedStopIds,built.brief.intent.route.orderedStopIds);assert.deepEqual(errors,[]);
 }catch(error){throw new Error(`${String(error)}; url=${page.url()}; body=${(await page.locator('body').innerText()).slice(-3000)}; errors=${JSON.stringify(errors)}`,{cause:error})}finally{await browser.close()}
});
