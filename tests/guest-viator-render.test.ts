import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {exploreResultForActivity} from '../lib/easyt/explore.ts';

const require=createRequire(import.meta.url);
const trip=requireReadableTripDocument(canonicalRouteFixture());trip.ownerId='disposable-guest';
const stop=trip.stops[0]!;
const product={provider:'viator' as const,source:'viator' as const,providerProductId:'PUBLIC-SSR',title:'Public museum tour',destination:{canonicalPlaceId:stop.canonicalPlaceId!,label:stop.name},productUrl:'https://www.viator.com/tours/Tokyo/PUBLIC-SSR?campaign=a%2Bb&medium=api',provenance:{kind:'live_provider_search' as const,provider:'viator' as const,checkedAt:'2026-10-17T00:00:00Z'}};
async function component(entry:string) {
 const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',jsx:'automatic',format:'cjs',packages:'external',plugins:[{name:'external-ui-boundaries',setup(b){
  b.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/auth-client$/},()=>({path:'auth',namespace:'fixture'}));
  b.onResolve({filter:/^@\/lib\/analytics$/},()=>({path:'analytics',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/trip-shell-client$/},()=>({path:'shell',namespace:'fixture'}));
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),contents:path==='css'?'export default {};':path==='auth'?`export const authClient={useSession:()=>({data:globalThis.__viatorRenderSession,isPending:false})};`:path==='analytics'?'export function trackEvent(){}':path==='shell'?`export function useTripShellMutation(){return {trip:globalThis.__viatorRenderTrip,isPending:()=>false,mutateTrip:async()=>{throw new Error('SSR must never mutate');}};}`:`import {createElement} from 'react';export default function Link({children,...props}){return createElement('a',props,children);}`}));
 }}]});
 const module={exports:{} as any};new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);return module.exports.default;
}
const Explore=await component('components/easyt/trip-explore-workspace.tsx');
const Live=await component('components/easyt/live-activity-inventory.tsx');
function setup(t:any){(globalThis as any).__viatorRenderTrip=trip;(globalThis as any).__viatorRenderSession=null;t.after(()=>{delete (globalThis as any).__viatorRenderTrip;delete (globalThis as any).__viatorRenderSession;});}
test('guest Explore, Map and Itinerary render exact sponsored product handoffs without account or booking mutations',t=>{
 setup(t);
 for(const session of [null,{user:{id:'disposable-owner'}}]){
  (globalThis as any).__viatorRenderSession=session;
  const explore=renderToStaticMarkup(createElement(Explore,{trip,initialResults:[exploreResultForActivity(stop,product,trip)],initialDestinationId:stop.id,initialCategory:'tours'}));
  for(const markup of [explore,...(['map','itinerary'] as const).map(workspace=>renderToStaticMarkup(createElement(Live,{trip,stop,day:trip.planItems[0]!,workspace,placement:'disposable-render',initialItems:[product],onSave:()=>assert.fail('render cannot save'),onSchedule:()=>assert.fail('render cannot schedule')})))]) {
   assert.match(markup,/Public museum tour/);assert.match(markup,/href="https:\/\/www.viator.com\/tours\/Tokyo\/PUBLIC-SSR\?campaign=a%2Bb&amp;medium=api"/);
   assert.match(markup,/rel="sponsored noopener noreferrer"/);assert.match(markup,/Partner link/);assert.doesNotMatch(markup,/Sign in to see bookable/);
  }
 }
});
test('unavailable guest Tours retains the approved generic public affiliate handoff',t=>{
 setup(t);const markup=renderToStaticMarkup(createElement(Explore,{trip,initialResults:[],initialDestinationId:stop.id,initialCategory:'tours',initialProviderState:'degraded'}));
 assert.match(markup,/href="https:\/\/vi.me\/IiuWB"/);assert.match(markup,/rel="sponsored noopener noreferrer"/);assert.doesNotMatch(markup,/>Sign in</);
});
