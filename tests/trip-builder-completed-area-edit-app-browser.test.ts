import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder} from './helpers/builder-render.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {builderInputDraftKey} from '../lib/easyt/trip-builder-input-draft.ts';

const enabled=process.env.MORROVIA_BUILDER_APP_BROWSER_TESTS==='1';
for(const anotherPending of [false,true])test(`completed country top Edit reopens its exact intent${anotherPending?' with another country pending':''}`,{skip:!enabled,timeout:40000},async()=>{
 const view=await renderBuilder({query:'?inspire=morocco-rail',geocodeCandidates:{
  Kyrgyzstan:[{name:'Kyrgyzstan',canonicalPlaceId:'open-world:fixture:kyrgyzstan',country:'Kyrgyzstan',coordinates:[74.5,41.2],placeType:'country',routability:'planning_area'}],
  'Bishkek City':[{name:'Bishkek City',canonicalPlaceId:'open-world:fixture:bishkek-city',country:'Kyrgyzstan',coordinates:[74.5698,42.8746],placeType:'city',routability:'direct_destination'}],
  Kazakhstan:[{name:'Kazakhstan',canonicalPlaceId:'open-world:fixture:kazakhstan',country:'Kazakhstan',coordinates:[68.5,48.2],placeType:'country',routability:'planning_area'}],
 }});
 const readTrip=async()=>requireReadableTripDocument(await view.page.evaluate(()=>Object.keys(localStorage)
  .filter(key=>key.startsWith('easyt:trip-recovery:v2:')).map(key=>JSON.parse(localStorage.getItem(key)!))
  .sort((a,b)=>(Date.parse(b.savedAt)||0)-(Date.parse(a.savedAt)||0)||b.writeId.localeCompare(a.writeId))[0]?.trip));
 const addCountry=async(name:string)=>{
  await view.page.getByRole('button',{name:'Add destination',exact:true}).click();
  await view.page.getByRole('combobox',{name:'Add a stop',exact:true}).fill(name);
  await view.page.getByRole('option',{name:new RegExp(`^${name}`)}).first().click();
  await view.page.getByRole('dialog').getByRole('heading',{name:'Explore places',exact:true}).waitFor();
 };
 try{
  view.page.setDefaultTimeout(4000);
  await addCountry('Kyrgyzstan');
  const dialog=view.page.getByRole('dialog');await dialog.getByRole('combobox').fill('Bishkek City');
  await dialog.getByRole('option',{name:/^Bishkek City/}).click();
  await dialog.getByRole('button',{name:'Add 1 place',exact:true}).click();await dialog.waitFor({state:'detached'});
  await view.page.waitForFunction(()=>Object.values(localStorage).some(raw=>{try{const trip=JSON.parse(raw).trip;return trip?.stops?.length===4&&trip.brief.structuredBrief?.completedPlanningAreaMentionIds?.length}catch{return false}}));
  const completed=await readTrip();const parent=completed.brief.intent.route.destinations.find(intent=>intent.sourceText==='Kyrgyzstan')!;
  assert.ok(parent);assert.ok(completed.brief.structuredBrief?.completedPlanningAreaMentionIds?.includes(parent.id));
  assert.deepEqual(completed.stops.map(stop=>stop.name),['Marrakech','Fes','Chefchaouen','Bishkek City']);
  if(anotherPending){await addCountry('Kazakhstan');await dialog.getByRole('button',{name:'Close Discovery',exact:true}).click();await dialog.waitFor({state:'detached'});}
  const top=view.page.locator('[data-builder-top-controls]');await top.getByRole('combobox',{name:'Starting from',exact:true}).fill('Lon partial');
  const before=await readTrip();const key=builderInputDraftKey(null,before.id);
  await view.page.waitForFunction((key:string)=>JSON.parse(localStorage.getItem(key)??'{}').fields?.some((field:{raw:string})=>field.raw==='Lon partial'),key);
  const draft=()=>view.page.evaluate((key:string)=>JSON.parse(localStorage.getItem(key)!).fields,key);
  const beforeDraft=await draft();
  const assertPreserved=async()=>{const trip=await readTrip();assert.deepEqual(trip.stops,before.stops);assert.deepEqual(trip.brief.intent.route,before.brief.intent.route);assert.deepEqual(trip.brief.nightAllocations,before.brief.nightAllocations);assert.deepEqual(trip.brief.manualNightStopIds,before.brief.manualNightStopIds);assert.deepEqual(trip.brief.structuredBrief?.placeSelections,before.brief.structuredBrief?.placeSelections);assert.deepEqual(trip.brief.structuredBrief?.countryDiscoveryChoices,before.brief.structuredBrief?.countryDiscoveryChoices);assert.deepEqual(await draft(),beforeDraft);};
  await top.getByRole('button',{name:'Edit Kyrgyzstan',exact:true}).click();
  await dialog.getByRole('heading',{name:'Explore places',exact:true}).waitFor();
  assert.ok((await dialog.innerText()).includes('Kyrgyzstan'),'the requested completed country owns the dialog');
  assert.ok(!(await dialog.innerText()).includes('Kazakhstan'),'an unrelated pending country must not replace the requested intent');
  assert.equal((await readTrip()).brief.structuredBrief?.completedPlanningAreaMentionIds?.includes(parent.id),false,'the existing guarded reopen marks only this country incomplete');
  await assertPreserved();
  await dialog.getByRole('button',{name:'Close Discovery',exact:true}).click();await dialog.waitFor({state:'detached'});await assertPreserved();
  await top.getByRole('button',{name:'Edit Kyrgyzstan',exact:true}).click();await dialog.getByRole('heading',{name:'Explore places',exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Finish later',exact:true}).click();await dialog.waitFor({state:'detached'});await assertPreserved();
  await view.page.reload();await top.waitFor();assert.equal(await top.getByRole('combobox',{name:'Starting from',exact:true}).inputValue(),'Lon partial');
  await top.getByRole('button',{name:'Edit Kyrgyzstan',exact:true}).click();await dialog.getByRole('heading',{name:'Explore places',exact:true}).waitFor();assert.ok((await dialog.innerText()).includes('Kyrgyzstan'));await assertPreserved();assert.deepEqual(view.errors,[]);
 }finally{await view.close()}
});
