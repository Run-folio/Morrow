import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {releaseAvailability} from '../lib/easyt/release-availability.ts';
import {defaultTravelProfile} from '../lib/easyt/travel-profile.ts';
import {defaultTravelReadinessProfile} from '../lib/easyt/travel-readiness.ts';
const require=createRequire(import.meta.url);
async function moduleAt(path:string){
 const output=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},external:['react','react/jsx-runtime','react-dom/server'],plugins:[{name:'synthetic-private-boundaries',setup(b){
  b.onResolve({filter:/^next\/server$/},()=>({path:'response',namespace:'synthetic'}));
  b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'synthetic'}));
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'synthetic'}));
  b.onResolve({filter:/^@\/lib\/(auth-client|easyt\/owner|easyt\/repository|easyt\/visa-requirements)$/},({path})=>({path,namespace:'synthetic'}));
  b.onResolve({filter:/\.\/passport-destination-client$/},()=>({path:'passport-client',namespace:'synthetic'}));
  b.onLoad({filter:/.*/,namespace:'synthetic'},({path})=>({loader:'js',contents:path==='response'?`export const NextResponse={json:(v,i)=>new Response(JSON.stringify(v),i)};`:path==='navigation'?`export function notFound(){throw Error('UNAVAILABLE')};`:path==='link'?`import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`:path.includes('auth-client')?`export const authClient={useSession:()=>({data:{user:{id:'owner-a'}},isPending:false}),updateUser:async v=>({error:null})};`:path.endsWith('/owner')?`export async function requireEasyTOwner(){globalThis.__ownerReads++;return{id:'owner-a'}}`:path.endsWith('/repository')?`export async function updateEasyTUserPreferences(id,value){globalThis.__profileWrites.push({id,value})}`:path.endsWith('/visa-requirements')?`export function touristEntryRequirementFor(){globalThis.__visaReads++;return {status:'not-verified'}}`:`export default function PassportClient(){return 'PASSPORT_CLIENT'}` }));
 }}]});const mod={exports:{} as any};new Function('require','module','exports',output.outputFiles[0].text)(require,mod,mod.exports);return mod.exports;
}
test('unfinished beta surfaces are unavailable without changing data',()=>{assert.deepEqual(releaseAvailability,{travelPreferences:false,passportInfo:false})});
test('direct Passport page and API refuse access without lookup',async()=>{
 (globalThis as any).__visaReads=0;const page=await moduleAt('app/journey/passport/page.tsx');assert.throws(()=>page.default(),/UNAVAILABLE/);
 const api=await moduleAt('app/api/journey-passport-requirements/route.ts');const response=await api.POST(new Request('http://fixture.invalid/api/journey-passport-requirements',{method:'POST',body:JSON.stringify({nationality:'GB',destination:'UZ'})}));assert.equal(response.status,404);assert.equal((globalThis as any).__visaReads,0);
});
test('hidden preference writes are refused while workspace guide updates retain their existing path',async()=>{
 (globalThis as any).__ownerReads=0;(globalThis as any).__profileWrites=[];const api=await moduleAt('app/api/easyt/profile/route.ts');
 const post=(body:unknown)=>api.PATCH(new Request('http://fixture.invalid/api/easyt/profile',{method:'PATCH',body:JSON.stringify(body)}));
 assert.equal((await post({travelProfile:defaultTravelProfile})).status,404);assert.deepEqual((globalThis as any).__profileWrites,[]);
 assert.equal((await post({workspaceGuideVersionSeen:1})).status,200);assert.deepEqual((globalThis as any).__profileWrites,[{id:'owner-a',value:{workspaceGuideVersionSeen:1}}]);
});
test('Account details remain available without the unfinished travel and passport fields',async()=>{
 const {default:Form}=await moduleAt('app/journey/profile/profile-form.tsx');const html=renderToStaticMarkup(createElement(Form,{ownerId:'owner-a',name:'Synthetic traveller',email:'fixture@example.invalid',language:'en',initialTravelProfile:defaultTravelProfile,initialTravelReadinessProfile:defaultTravelReadinessProfile}));
 assert.match(html,/Account details/);assert.match(html,/Save account details/);assert.doesNotMatch(html,/Trip pace options|Hotel move options|Comfort level options|Save travel profile|Passport expiry month/);
});

test('navigation and Help hide Passport while retaining Account settings, privacy and sign-out',async()=>{
 const {default:Nav}=await moduleAt('app/journey/easyt-navigation.tsx');const html=renderToStaticMarkup(createElement(Nav,{current:'profile',account:{id:'owner-a',name:'Synthetic traveller',email:'fixture@example.invalid'}}));
 assert.doesNotMatch(html,/href="\/journey\/passport"|Passport info/);assert.match(html,/Account settings/);assert.match(html,/href="\/journey\/privacy"/);assert.match(html,/Sign out/);
 const {helpTopics}=await moduleAt('app/journey/help/help-content.ts');assert.equal(helpTopics.some((t:any)=>t.id==='passport-and-travel-info'),false);assert.ok(helpTopics.some((t:any)=>t.id==='privacy-and-analytics'));
});
