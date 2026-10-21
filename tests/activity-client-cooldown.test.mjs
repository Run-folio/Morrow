import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import {build} from 'esbuild';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';

const project=fileURLToPath(new URL('../',import.meta.url)), require=createRequire(import.meta.url);
// Execute the actual request effects, retry handlers, scope guards and domain
// helpers. Substitute React scheduling, network and visual children only.
const leafNames=[...new Set(['trip-explore-workspace','trip-itinerary-workspace'].flatMap(file=>[...readFileSync(project+'components/easyt/'+file+'.tsx','utf8').matchAll(/import\s*\{([\s\S]*?)\}\s*from/g)].flatMap(match=>match[1].split(',').map(name=>name.trim().replace(/^type\s+/,'').split(/\s+as\s+/)[0]).filter(name=>/^[A-Za-z_$][\w$]*$/.test(name)))))];
const script=(await build({stdin:{contents:"export {default as Explore} from './components/easyt/trip-explore-workspace.tsx'; export {ItineraryDaySuggestions as Itinerary} from './components/easyt/trip-itinerary-workspace.tsx'; import {useActivityClientCooldown} from './lib/easyt/activity-client-cooldown.ts'; export function Probe({scope}){return useActivityClientCooldown(scope)}; export {activityCooldownKey,activityRetryDeadline,activityCooldownUntil} from './lib/easyt/activity-client-cooldown.ts';",resolveDir:project,loader:'tsx'},bundle:true,write:false,outfile:'offline-cooldown.cjs',format:'cjs',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'offline-components',setup(b){
 b.onLoad({filter:/trip-itinerary-workspace\.tsx$/},args=>({contents:readFileSync(args.path,'utf8')+'\nexport {ItineraryDaySuggestions};',loader:'tsx'}));
 b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'fake'}));
 b.onLoad({filter:/^hooks$/,namespace:'fake'},()=>({contents:['useState','useRef','useMemo','useCallback','useEffect','useLayoutEffect','useId'].map(name=>`export const ${name}=(...args)=>globalThis.__hooks.${name}(...args);`).join('\n')}));
 b.onResolve({filter:/^lucide-react$|^react-dom$|^@\/lib\/(analytics|auth-client)$/},a=>({path:a.path,namespace:'leaf'}));
 b.onResolve({filter:/^@\/components\/|^\.\//},a=>{
  if(a.path.endsWith('.css')||/trip-(explore|itinerary)-workspace\.tsx$/.test(a.path))return;
  if(a.path.startsWith('@/components/')||a.importer.includes('/components/easyt/'))return {path:a.path,namespace:'leaf'};
 });
 b.onLoad({filter:/.*/,namespace:'leaf'},()=>({contents:"export default function Leaf(){};"+leafNames.map(name=>`export const ${name}=globalThis.__leaves.${name}??function Leaf(){};`).join("\n")}));
}}]})).outputFiles[0].text;
const unavailable={unavailable:true,assessment:{retrieval:'unavailable',evidence:'insufficient',reason:'provider_error',retryable:true}};
const elements=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(elements):node.props?[node,...elements(node.props.children)]:[];
const texts=node=>typeof node==='string'?node:Array.isArray(node)?node.map(texts).join(' '):node?.props?texts(node.props.children):'';
function environment(){
 let now=Date.parse('2026-10-21T12:00:00Z'),serial=0,active,session=null;
 const timers=new Map(),requests=[],instances=[];
 const hooks={
  useState(initial){const h=active,i=h.cursor++;if(!(i in h.slots))h.slots[i]=typeof initial==='function'?initial():initial;return [h.slots[i],v=>{const next=typeof v==='function'?v(h.slots[i]):v;if(!Object.is(next,h.slots[i])){h.slots[i]=next;h.dirty=true;}}];},
  useRef(initial){const h=active,i=h.cursor++;return h.slots[i]??=( {current:initial} );},
  useMemo(factory,deps){const h=active,i=h.cursor++,old=h.slots[i];if(!old||!deps?.every((v,j)=>Object.is(v,old.deps[j])))h.slots[i]={value:factory(),deps};return h.slots[i].value;},
  useCallback(callback,deps){return hooks.useMemo(()=>callback,deps);},
  useEffect(callback,deps){const h=active,i=h.cursor++,old=h.effects[i];if(!old||!deps?.every((v,j)=>Object.is(v,old.deps?.[j])))h.pending.push(()=>{old?.cleanup?.();h.effects[i]={deps,cleanup:callback()};});},
  useLayoutEffect(...args){return hooks.useEffect(...args);},useId(){return hooks.useMemo(()=>`id-${++serial}`,[]);},
 };
 const leaves={authClient:{useSession:()=>({data:session,isPending:false})},useTripShellMutation:()=>({trip:active.props.trip,error:null,isPending:()=>false}),useJourneyLocalPlacePhotos:()=>({}),trackEvent(){}};
 const module={exports:{}},ctx=vm.createContext({module,exports:module.exports,require,console,URL,URLSearchParams,AbortController,AbortSignal,DOMException,structuredClone,process:{env:{NODE_ENV:'test'}},__hooks:hooks,__leaves:leaves,
  Date:class extends Date{static now(){return now;}},performance:{now:()=>now},
  setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},
  window:{addEventListener(){},removeEventListener(){},requestAnimationFrame(fn){fn();}},document:{getElementById:()=>null,activeElement:null},
  fetch:(url,options={})=>new Promise(resolve=>{requests.push({url,options,respond:(status,body,header)=>resolve({status,ok:status>=200&&status<300,headers:new Headers(header===undefined?{}:{'Retry-After':header}),json:async()=>body})});}),
 });
 new vm.Script(script).runInContext(ctx);
 function mount(kind,overrides={}){
  const trip=canonicalRouteFixture();trip.ownerId=null;
  const day=trip.planItems[0];
  const h={kind,slots:[],effects:[],pending:[],cursor:0,dirty:true,tree:null,closed:false,props:kind==='Explore'?{trip,initialDestinationId:trip.stops[0].id,initialCategory:'tours',...overrides}:{trip,day,stop:trip.stops[0],copy:{suggestionsUnavailable:'Suggestions unavailable'},language:'en',addPart:null,addDraft:'',addError:'',addPending:false,isPending:()=>false,onInteractionReset(){},onSelectedDetailRefresh(){},...overrides}};
  h.render=(changes={},effects=true)=>{h.props={...h.props,...changes};h.dirty=false;h.cursor=0;h.pending=[];active=h;h.tree=module.exports[kind](h.props);active=null;if(effects)h.pending.splice(0).forEach(fn=>fn());return h.tree;};
  h.close=()=>{h.closed=true;h.effects.forEach(effect=>effect?.cleanup?.());};
  h.status=()=>elements(h.tree).find(n=>n.props.state==='error'&&('onRetry' in n.props));
  h.retry=()=>{assert.equal(typeof h.status()?.props.onRetry,'function');h.status().props.onRetry();};
  instances.push(h);h.render();return h;
 }
 const flush=async()=>{for(let turn=0;turn<40;turn++){await Promise.resolve();for(const h of instances)if(!h.closed&&h.dirty)h.render();}};
 const commercial=()=>requests.filter(r=>r.url==='/api/journey-activity-inventory');
 const organic=()=>requests.filter(r=>String(r.url).startsWith('/api/journey-discover'));
 return {mount,flush,commercial,organic,requests,timers,helpers:module.exports,setSession(value){session=value;},async advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();},now:()=>now};
}

for(const kind of ['Explore','Itinerary'])test(`${kind}: 429 blocks manual retry until expiry without an automatic request`,async()=>{
 const env=environment(),view=env.mount(kind);await env.flush();
 env.organic().forEach(r=>r.respond(200,{places:[]}));
 assert.equal(env.commercial().length,1);env.commercial()[0].respond(429,unavailable,'120');await env.flush();
 assert.equal(view.status()?.props.onRetry,undefined,'cooldown must hide premature retry');
 await env.advance(119999);assert.equal(view.status()?.props.onRetry,undefined);assert.equal(env.commercial().length,1);
 await env.advance(1);assert.equal(typeof view.status()?.props.onRetry,'function');assert.equal(env.commercial().length,1,'expiry only re-enables manual retry');
 view.retry();await env.flush();assert.equal(env.commercial().length,2);
});

test('cooldown survives cross-workspace remount, destination switch-back and day changes',async()=>{
 const env=environment(),explore=env.mount('Explore');await env.flush();env.commercial()[0].respond(429,unavailable,'120');await env.flush();explore.close();
 const itinerary=env.mount('Itinerary');await env.flush();assert.equal(env.commercial().length,1,'Explore cooldown must cover Itinerary mount');
 const first=itinerary.props.stop,second=itinerary.props.trip.stops[1];
 itinerary.render({day:{...itinerary.props.day,id:'another-day',dayNumber:2}});await env.flush();assert.equal(env.commercial().length,1);
 itinerary.render({stop:second});await env.flush();assert.equal(env.commercial().length,2,'different destination remains available');
 itinerary.render({stop:first});await env.flush();assert.equal(env.commercial().length,2,'switch-back cannot evade cooldown');
 itinerary.close();env.mount('Explore');await env.flush();assert.equal(env.commercial().length,2);
});

test('organic retry remains available and a captured retry cannot bypass commercial cooldown',async()=>{
 const env=environment(),view=env.mount('Itinerary');await env.flush();
 env.organic()[0].respond(503,{unavailable:true});env.commercial()[0].respond(503,{unavailable:true});await env.flush();
 const oldRetry=view.status().props.onRetry;oldRetry();await env.flush();assert.equal(env.commercial().length,2);
 env.commercial()[1].respond(429,unavailable,'60');env.organic()[1].respond(503,{unavailable:true});await env.flush();
 assert.equal(typeof view.status().props.onRetry,'function','organic failure can still be retried');
 oldRetry();oldRetry();await env.flush();assert.equal(env.commercial().length,2,'live fetch guard must reject stale and rapid retry callbacks');assert.equal(env.organic().length,3);
});

for(const kind of ['Explore','Itinerary'])test(`${kind}: disposed 429 cannot establish cooldown for a later request`,async()=>{
 const env=environment(),view=env.mount(kind);await env.flush();const old=env.commercial()[0];view.close();
 old.respond(429,unavailable,'120');await env.flush();env.mount(kind);await env.flush();assert.equal(env.commercial().length,2);
});

test('Itinerary render-time day change retires the old response before effect cleanup',async()=>{
 const env=environment(),view=env.mount('Itinerary');await env.flush();const old=env.commercial()[0];
 view.render({day:{...view.props.day,id:'new-day',dayNumber:2}},false);
 old.respond(429,unavailable,'120');await env.flush();
 assert.equal(env.helpers.activityCooldownUntil(env.helpers.activityCooldownKey(view.props.trip,view.props.stop)),0);
 view.close();
});

test('owner and trip scope isolate deadlines, with no persisted state',async()=>{
 const env=environment(),first=env.mount('Itinerary');await env.flush();env.commercial()[0].respond(429,unavailable,'60');await env.flush();
 env.mount('Itinerary',{trip:{...first.props.trip,ownerId:'other-owner'}});env.mount('Itinerary',{trip:{...first.props.trip,id:'other-trip'}});await env.flush();assert.equal(env.commercial().length,3);
 const reload=environment();reload.mount('Itinerary');await reload.flush();assert.equal(reload.commercial().length,1);
});

test('seconds, HTTP-date, invalid, past and oversized headers use finite bounded deadlines',()=>{
 const env=environment(),parse=env.helpers.activityRetryDeadline,now=env.now();
 for(const [status,header,seconds] of [[429,'30',30],[429,new Date(now+45000).toUTCString(),45],[429,null,60],[429,'nonsense',60],[429,'-1',60],[429,'0',1],[429,new Date(now-1000).toUTCString(),1],[429,'999999999',86400],[503,'120',120],[503,'invalid',0],[200,'60',0]]){
  assert.equal(parse(status,header,now),seconds?now+seconds*1000:0,`${status} ${header}`);
 }
});

test('bounded memory never evicts an active deadline to admit another destination',async()=>{
 const env=environment();
 for(let i=0;i<257;i++){const probe=env.mount('Probe',{scope:`scope-${i}`});probe.tree.recordResponse({status:429,headers:new Headers({'Retry-After':'3600'})});probe.close();}
 assert.equal(env.helpers.activityCooldownUntil('scope-0'),env.now()+3600000);
 assert.equal(env.helpers.activityCooldownUntil('scope-256'),env.now()+3600000);
 await env.advance(3600000);assert.equal(env.helpers.activityCooldownUntil('scope-0'),0);assert.equal(env.helpers.activityCooldownUntil('scope-256'),0);
});

for(const [status,header,seconds] of [[429,new Date(Date.parse('2026-10-21T12:00:00Z')+30000).toUTCString(),30],[503,'15',15],[429,'broken',60]])test(`actual Itinerary honors ${status} ${header}`,async()=>{
 const env=environment(),view=env.mount('Itinerary');await env.flush();env.organic().forEach(r=>r.respond(200,{places:[]}));env.commercial()[0].respond(status,unavailable,header);await env.flush();
 assert.equal(view.status()?.props.onRetry,undefined);await env.advance(seconds*1000);assert.equal(typeof view.status()?.props.onRetry,'function');assert.equal(env.commercial().length,1);
});

for(const kind of ['Explore','Itinerary'])test(`${kind}: existing cards survive a rate-limited refresh`,async()=>{
 const env=environment(),view=env.mount(kind);await env.flush();env.organic().forEach(r=>r.respond(200,{places:[]}));env.commercial()[0].respond(503,{unavailable:true});await env.flush();
 const retry=view.status().props.onRetry;assert.equal(typeof retry,'function');retry();await env.flush();
 const stop=view.props.trip.stops[0],item={provider:'viator',source:'viator',providerProductId:'offline-tour',title:'Retained guided walk',destination:{canonicalPlaceId:stop.canonicalPlaceId,label:stop.name},rating:5,provenance:{kind:'live_provider_search',provider:'viator',checkedAt:'2026-10-21T12:00:00Z'}};
 env.organic().forEach(r=>r.respond(200,{places:[]}));env.commercial()[1].respond(200,{activities:[item]});await env.flush();
 const hasCard=()=>texts(view.tree).includes(item.title)||elements(view.tree).some(n=>n.props.result?.title===item.title);
 assert.equal(hasCard(),true,'successful inventory should be visible');retry();await env.flush();env.commercial()[2].respond(429,unavailable,'60');await env.flush();
 assert.equal(hasCard(),true,'rate limit must not erase useful inventory');retry();await env.flush();assert.equal(env.commercial().length,3);assert.equal(hasCard(),true);
});

test('Explore session change retires an old 429 before effect cleanup',async()=>{
 const env=environment(),view=env.mount('Explore');await env.flush();const old=env.commercial()[0];
 env.setSession({user:{id:'new-session-owner'}});view.render({},false);old.respond(429,unavailable,'120');await env.flush();
 assert.equal(env.helpers.activityCooldownUntil(env.helpers.activityCooldownKey(view.props.trip,view.props.trip.stops[0])),0);view.close();
});

test('a shorter concurrent response cannot shorten the deadline and unmount clears timers',async()=>{
 const env=environment(),first=env.mount('Probe',{scope:'same'}),second=env.mount('Probe',{scope:'same'});
 first.tree.recordResponse({status:429,headers:new Headers({'Retry-After':'120'})});second.tree.recordResponse({status:429,headers:new Headers({'Retry-After':'10'})});await env.flush();
 assert.equal(env.helpers.activityCooldownUntil('same'),env.now()+120000);assert.equal(env.timers.size,2);
 first.close();second.close();assert.equal(env.timers.size,0);
});
