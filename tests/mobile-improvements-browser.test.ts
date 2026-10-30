import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import {homepageInputStorageKey} from '../lib/easyt/private-browser-context.ts';
const opts={skip:!builderBrowserTestsEnabled,timeout:90000};
const evidence=process.env.MORROVIA_MOBILE_IMPROVEMENTS_EVIDENCE??'/tmp/mobile-improvements';mkdirSync(evidence,{recursive:true});
const settle=(p:any)=>p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
test('Home direct travellers preserve budget and dates without a summary or budget dropdown',opts,async()=>{
 const snapshot={...emptyHomepageInput('owner-a'),budget:{state:'selected' as const,value:'high' as const},dates:{state:'selected' as const,value:{start:'2030-06-01',end:'2030-06-12'}},travellers:{state:'selected' as const,value:2}};
 const h=await renderBuilder({path:'/',ownerId:'owner-a',styled:true,offlineOnly:true,storedInput:{snapshot}});
 try{const p=h.page;await p.setViewportSize({width:390,height:844});await p.getByRole('tab',{name:'Plan with stops',exact:true}).waitFor();
  assert.equal(await p.getByRole('group',{name:'Travellers',exact:true}).count(),1,'direct traveller group is present');
  assert.equal(await p.getByRole('region',{name:'Destinations',exact:true}).count(),1);
  assert.equal(await p.getByRole('button',{name:'Budget and travellers',exact:true}).count(),0);
  assert.equal(await p.locator('[class*="plannerSummary"]').count(),0);
  await p.getByRole('button',{name:'Increase travellers; 2 travellers currently',exact:true}).click();
  await p.getByRole('tab',{name:'Describe my trip',exact:true}).click();await p.getByRole('tab',{name:'Plan with stops',exact:true}).click();
  await settle(p);const stored=await p.evaluate((key:string)=>JSON.parse(localStorage.getItem(key)!),homepageInputStorageKey('owner-a'));
  assert.deepEqual(stored.snapshot.budget,snapshot.budget);assert.deepEqual(stored.snapshot.dates,snapshot.dates);assert.equal(stored.snapshot.travellers.value,3);
  await p.getByRole('button',{name:'Increase travellers; 3 travellers currently',exact:true}).press('End');
  assert.equal(await p.getByRole('button',{name:'Increase travellers; 12 travellers currently',exact:true}).isDisabled(),true);
  await p.getByRole('button',{name:'Decrease travellers; 12 travellers currently',exact:true}).press('Home');
  assert.equal(await p.getByRole('button',{name:'Decrease travellers; 1 traveller currently',exact:true}).isDisabled(),true);
  await p.screenshot({path:`${evidence}/home-390.png`});assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('My Trips compacts only the actual no-photo fallback on mobile',opts,async()=>{
 const trip={...canonicalRouteFixture(),title:'Synthetic Japan trip',status:'planned' as const};
 const h=await renderBuilder({path:'/journey/dashboard',ownerId:'owner-a',dashboardTrips:()=>[trip],styled:true,offlineOnly:true});
 try{const p=h.page;await p.setViewportSize({width:390,height:844});const card=p.getByRole('article').first();await card.waitFor();
  const cover=card.locator('a').first();assert.ok((await cover.boundingBox())!.height<=88,'fallback is a shallow strip');
  assert.equal(await card.getByRole('link',{name:'Continue trip',exact:true}).count(),1);
  await p.setViewportSize({width:1440,height:1000});assert.ok((await cover.boundingBox())!.height>=230,'desktop cover height retained');assert.ok((await card.locator('[class*=countryFallback] > div').boundingBox())!.height>=230,'desktop fallback itself fills cover');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
const allocationFixture=`
 import {useState} from 'react';import {TripBuilderRouteWorkspace} from '@/app/journey/new/trip-builder-route-workspace';import styles from '@/app/journey/new/trip-builder.module.css';
 const seed=${JSON.stringify(canonicalRouteFixture())};
 export default function Fixture(){const[trip,setTrip]=useState(()=>({...seed,ownerId:null,stops:seed.stops.map((s,i)=>({...s,name:['San Cristóbal de las Casas','Las Palmas de Gran Canaria','Tokyo'][i]??s.name,nights:[0,3,3][i]??0}))}));const[selected,setSelected]=useState(null);
 return <main id="start-building" className={styles.shellWide} style={{width:'calc(100vw - 16px)'}}><TripBuilderRouteWorkspace canonicalTrip={trip} selectedStopId={selected} onSelectStop={setSelected} previewStopIds={null} lockedStopIds={[]} fixedOrder={false} routeCheckProposalStopIds={null} nightStatus={{total:6,allocated:trip.stops.reduce((n,s)=>n+(s.nights??0),0),complete:true,language:'en'}} stopReview={()=><>{null}{null}</>} onPreviewOrder={()=>{}} onCommitOrder={ids=>{setTrip(t=>({...t,stops:ids.map((id,i)=>({...t.stops.find(s=>s.id===id),order:i}))}));return true}} onEditNights={(id,n)=>setTrip(t=>({...t,stops:t.stops.map(s=>s.id===id?{...s,nights:n}:s)}))} onRemoveStop={id=>setTrip(t=>({...t,stops:t.stops.filter(s=>s.id!==id)}))} onTransportChoiceChange={()=>{}} /></main>;
 }`;
test('original Builder hierarchy wraps long names, keeps second-row menus and preserves 0/3/3 edits',opts,async()=>{
 const h=await renderBuilder({path:'/',styled:true,offlineOnly:true,sourceOverrides:new Map([[fileURLToPath(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url)),allocationFixture]])});
 try{const p=h.page;for(const width of [320,360,390,430]){await p.setViewportSize({width,height:844});await p.locator('[data-builder-stop-index="0"]').waitFor();
  for(const font of [13,26]){await p.locator('[data-builder-stop-index] [class*="builderRouteIdentity"] strong').evaluateAll((es:any[],f:number)=>es.forEach(e=>e.style.fontSize=`${f}px`),font);await settle(p);
   const rows=await p.locator('[data-builder-stop-index]').evaluateAll((es:any[])=>es.map(e=>{const title=e.querySelector('[class*="builderRouteIdentity"] strong'),n=e.querySelector('[class*="builderRouteNights"]'),m=e.querySelector('summary'),t=title.getBoundingClientRect(),b=n.getBoundingClientRect(),menu=m.getBoundingClientRect();return{full:title.textContent,overflow:e.scrollWidth>e.clientWidth+1,stacked:b.top>=t.bottom-1,lines:t.height/parseFloat(getComputedStyle(title).lineHeight),menuSecond:menu.top>=Math.max(t.bottom,b.bottom)-1}}));
   assert.ok(rows.every((r:any)=>!r.overflow&&(r.stacked||r.lines<=2.05)&&r.menuSecond),`${width}/${font}: ${JSON.stringify(rows)}`);
  }
 }
 await p.setViewportSize({width:430,height:844});await p.locator('[data-builder-stop-name]').evaluateAll((es:any[])=>es.forEach(e=>{e.style.fontSize='13px'}));await settle(p);assert.equal(await p.locator('[data-builder-stop-index="2"]').getAttribute('data-compact-stacked'),null,'empty production review fragment must not force short names to stack');
 const first=p.locator('[data-builder-stop-index="0"]');assert.equal(await first.getByRole('button',{name:/Remove one night/}).isDisabled(),true);
 await first.getByRole('button',{name:/Add one night/}).click();assert.deepEqual(await p.locator('[data-builder-stop-index] [class*="builderRouteNights"] strong').allTextContents(),['1','3','3']);
 await first.getByRole('button',{name:/Remove one night/}).click();assert.deepEqual(await p.locator('[data-builder-stop-index] [class*="builderRouteNights"] strong').allTextContents(),['0','3','3']);
 await first.locator('summary').click();await first.getByRole('button',{name:'Later',exact:true}).click();assert.match(await p.locator('[data-builder-stop-index="1"]').innerText(),/San Cristóbal/);
 await p.screenshot({path:`${evidence}/builder-430-large.png`});assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
test('Calendar exposes existing destination and transfer context in compact cells',opts,async()=>{
 const trip=canonicalRouteFixture();const h=await renderBuilder({path:`/journey/${trip.id}/itinerary`,shellCanonicalTrip:trip,styled:true,offlineOnly:true});
 try{const p=h.page;await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'Calendar',exact:true}).click();const cells=p.locator('[class*="calendarDaySelect"]');await cells.first().waitFor();
  assert.equal(await cells.first().locator('strong').isVisible(),true,'existing destination text is visible');
  assert.ok(await p.locator('[data-calendar-travel]').count()>0,'travel marker comes from actual calendar transfer items');
  await cells.first().click();assert.equal(await p.locator('dialog:modal').count(),1);await p.keyboard.press('Escape');await cells.first().click();assert.equal(await p.locator('dialog:modal').count(),1);
  await p.screenshot({path:`${evidence}/calendar-390.png`});await p.keyboard.press('Escape');await p.setViewportSize({width:1440,height:1000});assert.equal(await p.locator('[data-calendar-travel]').first().isVisible(),false,'travel marker is mobile-only');assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

for(const budget of [{state:'cleared' as const},{state:'untouched' as const}]) test(`Home traveller edits and reload retain ${budget.state} budget provenance`,opts,async()=>{
 const snapshot={...emptyHomepageInput('owner-a'),budget,travellers:{state:'selected' as const,value:2}};
 const h=await renderBuilder({path:'/',ownerId:'owner-a',styled:true,offlineOnly:true,storedInput:{snapshot}});
 try{let p=h.page;await p.setViewportSize({width:320,height:844});await p.getByRole('region',{name:'Destinations',exact:true}).waitFor();
  const increase=p.getByRole('button',{name:'Increase travellers; 2 travellers currently',exact:true});assert.ok((await increase.boundingBox())!.width>=43.9);await increase.click();await settle(p);
  // The harness reseeds its initial snapshot on every navigation of its original page.
  // A fresh same-context page exercises a real persisted reload without that fixture reset.
  const url=p.url();p=await p.context().newPage();await p.addInitScript(()=>{(window as any).__BUILDER_TEST_OWNER__='owner-a'});await p.setViewportSize({width:320,height:844});await p.goto(url);
  await p.getByRole('button',{name:'Increase travellers; 3 travellers currently',exact:true}).waitFor();
  const stored=await p.evaluate((key:string)=>JSON.parse(localStorage.getItem(key)!),homepageInputStorageKey('owner-a'));
  assert.deepEqual(stored.snapshot.budget,budget);assert.equal(stored.snapshot.travellers.value,3);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('Builder original option2 production rows survive 40 name/width/text cases and dynamic review',opts,async()=>{
 const names=['San Cristóbal de las Casas','Las Palmas de Gran Canaria','San Martín de los Andes','Synthetic very long destination label for a surrounding district and its extended neighbourhoods','SyntheticUnbrokenDestinationNameForAPlaceWithAnExtremelyLongAdministrativeNeighbourhoodLabelForTesting'];
 const fixture=allocationFixture
  .replace("const seed=", "const seed=")
  .replace('stops:seed.stops.map((s,i)=>', 'stops:[...seed.stops,{...seed.stops[0],id:"synthetic-4"},{...seed.stops[0],id:"synthetic-5"}].map((s,i)=>')
  .replace("['San Cristóbal de las Casas','Las Palmas de Gran Canaria','Tokyo'][i]??s.name",`${JSON.stringify(names)}[i]??s.name`)
  .replace('const[selected,setSelected]=useState(null);', 'const[selected,setSelected]=useState(null);const[review,setReview]=useState(false);')
  .replace('<TripBuilderRouteWorkspace canonicalTrip=', '<button type="button" onClick={()=>setReview(v=>!v)}>Toggle synthetic review</button><TripBuilderRouteWorkspace canonicalTrip=')
  .replace('stopReview={()=><>{null}{null}</>}', 'stopReview={id=><>{review&&id===trip.stops[0].id?<p role="status">Review this synthetic location before continuing.</p>:null}{null}</>}');
 const h=await renderBuilder({path:'/',styled:true,offlineOnly:true,sourceOverrides:new Map([[fileURLToPath(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url)),fixture]])});
 try{const p=h.page;for(const width of [320,360,390,430]){await p.setViewportSize({width,height:844});for(const font of [13,26]){
   await p.locator('[data-builder-stop-name]').evaluateAll((es:any[],f:number)=>es.forEach(e=>e.style.fontSize=`${f}px`),font);await settle(p);
   const rows=await p.locator('[data-builder-stop-id]').evaluateAll((es:any[])=>es.map(e=>{const title=e.querySelector('[data-builder-stop-name]'),n=e.querySelector('[data-builder-nights]'),m=e.querySelector('summary'),t=title.getBoundingClientRect(),b=n.getBoundingClientRect(),menu=m.getBoundingClientRect();return{name:title.textContent,overflow:e.scrollWidth>e.clientWidth+1,clipped:title.scrollWidth>title.clientWidth+1||title.scrollHeight>title.clientHeight+1,stacked:b.top>=t.bottom-1,lines:t.height/parseFloat(getComputedStyle(title).lineHeight),menuSecond:menu.top>=Math.max(t.bottom,b.bottom)-1,targets:[e.querySelector('button'),...n.querySelectorAll('button'),m].every(c=>c.getBoundingClientRect().width>=43.9&&c.getBoundingClientRect().height>=43.9)}}));
   assert.deepEqual(rows.map((r:any)=>r.name),names);assert.ok(rows.every((r:any)=>!r.overflow&&!r.clipped&&(r.stacked||r.lines<=2.05)&&r.menuSecond&&r.targets),`${width}/${font}: ${JSON.stringify(rows)}`);
  }}
  await p.locator('[data-builder-stop-name]').evaluateAll((es:any[])=>es.forEach(e=>e.style.fontSize='13px'));await p.getByRole('button',{name:'Toggle synthetic review',exact:true}).click();await settle(p);
  assert.equal(await p.getByRole('status').filter({hasText:'Review this synthetic location'}).isVisible(),true);assert.equal(await p.locator('[data-builder-stop-id]').first().getAttribute('data-compact-stacked'),'true');assert.equal(await p.getByRole('button',{name:'Toggle synthetic review',exact:true}).evaluate((e:any)=>document.activeElement===e),true,'layout measurement never steals review trigger focus');
  await p.setViewportSize({width:1440,height:1000});await p.waitForFunction(()=>!document.querySelector('[data-builder-stop-id]')?.hasAttribute('data-compact-stacked'));assert.equal(await p.locator('[data-builder-stop-id]').first().getAttribute('data-compact-stacked'),null);assert.equal(await p.locator('[class*=builderStopFacts]').first().isVisible(),false,'mobile-only facts do not duplicate desktop metadata');
  assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('translated Home component branch retains direct accessible traveller labels without changing beta locale policy',opts,async()=>{
 const h=await renderBuilder({path:'/',styled:true,offlineOnly:true});
 try{const p=h.page;await p.setViewportSize({width:320,height:844});
  // Authority deliberately locks beta rendering to English. Exercise the existing
  // locale-event component branch only; this is not a production language rollout.
  await p.evaluate(()=>window.dispatchEvent(new CustomEvent('easyt-language-change',{detail:'es'})));
  await p.getByRole('region',{name:'Destinos',exact:true}).waitFor();const increase=p.getByRole('button',{name:'Aumentar viajeros; actualmente 2 viajeros',exact:true});await increase.click();
  assert.equal(await p.getByRole('button',{name:'Reducir viajeros; actualmente 3 viajeros',exact:true}).isVisible(),true);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('My Trips keeps a loaded image tall and compacts after a real image error',opts,async()=>{
 const image='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%23173630"/%3E%3C/svg%3E';
 const fixture=`import {useState} from 'react';import {TripCard} from '@/app/journey/dashboard/dashboard-client';import {easytCopy} from '@/lib/easyt/i18n';import styles from '@/app/journey/dashboard/dashboard.module.css';const trip=${JSON.stringify({...canonicalRouteFixture(),status:'planned'})};export default function Fixture(){const[photo,setPhoto]=useState({src:${JSON.stringify(image)},alt:'Synthetic test image',authorHref:null,creditHref:null,creditLabel:null,licenseHref:null,fullCreditHref:null,place:null});const[failed,setFailed]=useState(false);return <main id="start-building"><button type="button" onClick={()=>setPhoto(p=>({...p,src:'/synthetic-missing-image.png'}))}>Fail synthetic image</button><output>{failed?'Image failure handled':'Image ready'}</output><div className={styles.sectionGrid}><TripCard trip={trip} photo={photo} language="en" copy={easytCopy.en.dashboard} recoveryIssues={{}} working={false} workingAction={null} onAction={()=>{}} onGift={()=>{}} onRemove={()=>{}} onPhotoError={()=>{setFailed(true);setPhoto(null)}}/></div></main>}`;
 const h=await renderBuilder({path:'/',styled:true,offlineOnly:true,sourceOverrides:new Map([[fileURLToPath(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url)),fixture]])});
 try{const p=h.page;await p.setViewportSize({width:390,height:844});const card=p.getByRole('article').first(),cover=card.locator('a').first();await p.getByRole('img',{name:'Synthetic test image',exact:true}).waitFor();await p.waitForFunction(()=>[...document.images].some(i=>i.alt==='Synthetic test image'&&i.complete&&i.naturalWidth>0));assert.ok((await cover.boundingBox())!.height>=190);assert.equal(await card.locator('[class*=countryFallback]').count(),0);
  await p.getByRole('button',{name:'Fail synthetic image',exact:true}).click();await p.getByText('Image failure handled',{exact:true}).waitFor();assert.ok((await cover.boundingBox())!.height<=88);
  await p.setViewportSize({width:1440,height:1000});await settle(p);assert.ok((await card.locator('[class*=countryFallback] > div').boundingBox())!.height>=230);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('short Builder row returns inline after review resolves without a resize or focus change',opts,async()=>{
 const fixture=allocationFixture.replace("'San Cristóbal de las Casas'","'Tokyo'")
  .replace('const[selected,setSelected]=useState(null);','const[selected,setSelected]=useState(null);const[review,setReview]=useState(false);')
  .replace('<TripBuilderRouteWorkspace canonicalTrip=','<button type="button" onClick={()=>setReview(v=>!v)}>Toggle review</button><TripBuilderRouteWorkspace canonicalTrip=')
  .replace('stopReview={()=><>{null}{null}</>}','stopReview={id=><>{review&&id===trip.stops[0].id?<span role="status">Review location</span>:null}{null}</>}');
 const h=await renderBuilder({path:'/',styled:true,offlineOnly:true,sourceOverrides:new Map([[fileURLToPath(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url)),fixture]])});
 try{const p=h.page;await p.setViewportSize({width:430,height:844});const row=p.locator('[data-builder-stop-id]').first(),toggle=p.getByRole('button',{name:'Toggle review',exact:true});await settle(p);assert.equal(await row.getAttribute('data-compact-stacked'),null);
  await toggle.click();await p.waitForFunction(()=>document.querySelector('[data-builder-stop-id]')?.hasAttribute('data-compact-stacked'));await toggle.click();
  await p.waitForFunction(()=>!document.querySelector('[data-builder-stop-id]')?.hasAttribute('data-compact-stacked'),{},{timeout:1500});assert.equal(await toggle.evaluate((e:any)=>document.activeElement===e),true);assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});

test('Calendar long destination context grows without clipping at mobile widths and enlarged text',opts,async()=>{
 const trip=canonicalRouteFixture();trip.stops=trip.stops.map((s,i)=>({...s,name:i===0?'SaintRemyDeProvenceAndSurroundingNeighbourhoodsWithoutBreaks':s.name}));
 const h=await renderBuilder({path:`/journey/${trip.id}/itinerary`,shellCanonicalTrip:trip,styled:true,offlineOnly:true});
 try{const p=h.page;await p.getByRole('button',{name:'Calendar',exact:true}).click();for(const width of [320,390,430]){await p.setViewportSize({width,height:844});for(const font of [11,22]){
  await p.locator('[class*=calendarCompactDestination]').evaluateAll((es:any[],f:number)=>es.forEach(e=>e.style.fontSize=`${f}px`),font);await settle(p);
  const clipping=await p.locator('[class*=calendarDaySelect]').evaluateAll((es:any[])=>es.map(e=>({text:e.textContent,w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight,children:[...e.querySelectorAll('strong,[data-calendar-travel]')].map((c:any)=>({text:c.textContent,w:c.clientWidth,sw:c.scrollWidth,h:c.clientHeight,sh:c.scrollHeight}))})).filter(e=>e.sw>e.w+1||e.sh>e.h+1||e.children.some((c:any)=>c.sw>c.w+1||c.sh>c.h+1)));
  assert.equal(clipping.length,0,`${width}/${font}: ${JSON.stringify(clipping)}`);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }}assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
