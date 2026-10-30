import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
const opts={skip:!builderBrowserTestsEnabled,timeout:90000};
const settle=(p:any)=>p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
const starterPath=fileURLToPath(new URL('../app/journey/home/home-trip-starter.tsx',import.meta.url));
const fullHomeFixture=readFileSync(starterPath,'utf8').replace('export default function HomeTripStarter','function OriginalHomeTripStarter')+`
import {createContext,useContext} from 'react';
import ImmersiveHome from './immersive/immersive-home';
import {immersiveHomepageRoutes} from '@/lib/easyt/immersive-homepage-routes';
import {discoveryCatalogue} from '@/lib/easyt/discovery-catalogue';
const HomeFixtureContext=createContext(false);
export default function FullHomeFixture(){return useContext(HomeFixtureContext)?<OriginalHomeTripStarter/>:<HomeFixtureContext.Provider value={true}><ImmersiveHome routes={immersiveHomepageRoutes()} previewRoutes={discoveryCatalogue()}/></HomeFixtureContext.Provider>}
`;
test('real Home tour covers inspiration cards outside the isolated hero and retains dismissal/focus at responsive widths',opts,async()=>{
 const h=await renderBuilder({path:'/',styled:true,offlineOnly:true,sourceOverrides:new Map([[starterPath,fullHomeFixture]])});
 try{const p=h.page;for(const width of [1280,768,390,320]){await p.setViewportSize({width,height:width<=430?844:1280});const trigger=p.getByRole('button',{name:'See how it works',exact:true});await trigger.focus();
  // Existing event path opens the real listener while leaving cards at a visible scroll position.
  await p.locator('#routes').scrollIntoViewIfNeeded();await p.evaluate(()=>window.dispatchEvent(new Event('easyt-open-product-tour')));const dialog=p.getByRole('dialog',{name:'Start with the trip in your head.',exact:true});await dialog.waitFor();
  const stacking=await dialog.evaluate((e:any)=>{let n=e.parentElement;while(n&&n!==document.body){if(getComputedStyle(n).isolation==='isolate')return false;n=n.parentElement;}return true});assert.equal(stacking,true,'tour must escape the isolated hero stacking context');
  const front=await p.locator('#routes').evaluate((e:any)=>{const c=e.querySelector('article')??e.querySelector('a'),r=c.getBoundingClientRect();const x=Math.min(innerWidth-3,Math.max(3,r.x+10)),y=Math.min(innerHeight-3,Math.max(3,r.y+10));const top=document.elementFromPoint(x,y);return !!top?.closest('[role=dialog], [role=presentation]')});assert.equal(front,true,'background cards cannot paint or hit-test above tour');
  await dialog.locator('h2,#easyt-tour-description').evaluateAll((es:any[])=>es.forEach(e=>e.style.fontSize=`${parseFloat(getComputedStyle(e).fontSize)*2}px`));assert.equal(await dialog.evaluate((e:any)=>e.scrollWidth>e.clientWidth+1),false,'200% text stays within the scrolling tour');await p.getByRole('button',{name:'Next',exact:true}).click();await p.getByRole('button',{name:'Back',exact:true}).click();await p.keyboard.press('Escape');assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await trigger.evaluate((e:any)=>document.activeElement===e),true);
 }
 assert.deepEqual(h.errors,[]);
 }finally{await h.close();}
});
