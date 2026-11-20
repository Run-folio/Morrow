import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('My Trips gives a verified guest the device-first dashboard instead of forcing login',()=>{
 const source=read('app/journey/dashboard/page.tsx');
 assert.match(source,/if \(!session\?\.user\) return <GuestTrips/);
 assert.doesNotMatch(source,/redirect\("\/journey\/login/);
 assert.match(source,/listTripsForOwner\(session.user.id\)/);
});
test('guest dashboard offers planning only for an authoritative empty device result, and optional sign-in without save intent',()=>{
 const source=read('app/journey/login/guest-device-trips.tsx');
 assert.match(source,/state.kind === "ready" && state.trips.length === 0/);
 assert.match(source,/href="\/journey\/login\?next=%2Fjourney%2Fdashboard"/);
 assert.doesNotMatch(source,/saved=1|saveExplicitGuestTrip|loadTripFromEasyT/);
});

test('rendered guest trips put device copies before account sign-in and distinguish empty from unavailable',async()=>{
 const {build}=await import('esbuild');
 const {createRequire}=await import('node:module');
 const {createElement}=await import('react');
 const {renderToStaticMarkup}=await import('react-dom/server');
 const req=createRequire(import.meta.url);
 const bundling=await build({entryPoints:['app/journey/login/guest-device-trips.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',plugins:[{name:'guest-panel-boundaries',setup(b){
  b.onResolve({filter:/\.css$|^@\//},a=>({path:a.path,namespace:'stubs'}));
  b.onLoad({filter:/.*/,namespace:'stubs'},({path})=>({loader:'jsx',resolveDir:process.cwd(),contents:path.endsWith('.css')?'export default {}':path.endsWith('easyt-controls')?'export const EasyTLinkButton=({href,children,...rest})=><a href={href} aria-label={rest["aria-label"]}>{children}</a>;export const EasyTButton=({children})=><button>{children}</button>':path.endsWith('app-motion')?'export const EntryReveal=()=>null':path.endsWith('morrovia-feedback')?'export const MorroviaStatusBanner=({title,actions})=><section><h3>{title}</h3>{actions}</section>':path.endsWith('morrovia-loading-states')?'export const MorroviaSectionStatus=()=>null':path.endsWith('auth-client')?'export const authClient={}':path.endsWith('/storage')?'export const listTripRecoveries=()=>{throw Error("render cannot read storage")}':'export const loadGuestDeviceTrips=()=>{throw Error("render cannot discover storage")}' }));
 }}]});
 const mod={exports:{}};new Function('require','module','exports',bundling.outputFiles[0].text)(req,mod,mod.exports);
 const render=state=>renderToStaticMarkup(createElement(mod.exports.GuestDeviceTripsPanel,{state,presentation:'dashboard',onRetry(){}}));
 const ready=render({kind:'ready',trips:[{id:'trip-a',title:'Tokyo and Beijing',href:'/journey/trip-a?recover=1'}]});
 assert.ok(ready.indexOf('Open device copy: Tokyo and Beijing')>0);
 assert.ok(ready.indexOf('Open device copy: Tokyo and Beijing')<ready.indexOf('Sign in'));
 assert.match(ready,/href="\/journey\/trip-a\?recover=1"/);
 const empty=render({kind:'ready',trips:[]});
 assert.match(empty,/No trips on this device yet.*Plan a trip/);
 assert.doesNotMatch(empty,/come back here to pick up/);
 const unavailable=render({kind:'unavailable'});
 assert.match(unavailable,/Check again/);assert.doesNotMatch(unavailable,/Plan a trip|Sign in/);
});
