import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createAbortableEffectScope} from '../lib/easyt/abortable-effect.ts';
import {withProviderTimeout} from '../lib/easyt/provider-timeout.ts';
import {referenceGeographicAcceptanceMatches} from '../lib/easyt/place-reference.ts';
const text=readFileSync(new URL('../components/easyt/canonical-place-autocomplete.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('autocomplete.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let code;
function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('"canonical place autocomplete"'))code=n.arguments[0].getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(code);
const run=new Function('scope',`with(scope){${ts.transpileModule('return ('+code+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`);
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness(fetchImpl,state={searching:false,failed:false,suggestions:[]}){
 const scope={deferredValue:'kuta',parentConstraint:{canonicalPlaceId:'bali',canonicalName:'Bali',placeType:'island',parentCountries:['Indonesia']},contextCountries:['Indonesia'],nearbyAnchor:undefined,searchIntent:'route-stop',allowedPlaceTypes:['city','town'],referenceGeographicAcceptanceMatches,createAbortableEffectScope,withProviderTimeout,URLSearchParams,
  setProviderSearching:v=>state.searching=v,setProviderFailed:v=>state.failed=v,setProviderSuggestions:v=>state.suggestions=v,
  window:{setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},fetch:fetchImpl};
 return{state,start:()=>run(scope)()};
}
for(const phase of ['headers','body'])test(`actual autocomplete settles unavailable after bounded ${phase} wait`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let signal;
 const h=harness(async(_url,init)=>{signal=init.signal;return phase==='headers'?new Promise(()=>{}):{ok:true,json:()=>new Promise(()=>{})};});
 const close=h.start();t.mock.timers.tick(220);await flush();assert.equal(h.state.searching,true);
 t.mock.timers.tick(20_001);await flush();assert.equal(h.state.searching,false);assert.equal(h.state.failed,true);assert.equal(signal.aborted,true);close();
});
test('late body after deadline cannot install candidates',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release;
 const h=harness(async()=>({ok:true,json:()=>new Promise(r=>{release=r;})}));const close=h.start();t.mock.timers.tick(220);await flush();
 t.mock.timers.tick(20_001);await flush();assert.equal(h.state.failed,true);release({candidates:[{name:'Wrong late result',country:'Indonesia',canonicalPlaceId:'late',coordinates:[115,-8],placeType:'town'}]});await flush();assert.deepEqual(h.state.suggestions,[]);close();
});
test('cancelled old request cannot overwrite a replacement healthy result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release;const old=harness(async()=>new Promise(r=>{release=r;}));const closeOld=old.start();t.mock.timers.tick(220);await flush();closeOld();
 const fresh=harness(async()=>({ok:true,json:async()=>({candidates:[]})}),old.state);const closeFresh=fresh.start();t.mock.timers.tick(220);await flush();
 release({ok:false,json:async()=>({})});await flush();t.mock.timers.tick(20_001);await flush();assert.equal(fresh.state.failed,false);assert.equal(fresh.state.searching,false);closeFresh();
});
for(const outcome of ['empty','http503','malformed'])test(`actual autocomplete completes ${outcome} and retry can finish`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness(async()=>({ok:outcome!=='http503',json:async()=>{if(outcome==='malformed')throw Error('Malformed fixture');return{candidates:[]};}}));const close=h.start();t.mock.timers.tick(220);await flush();assert.equal(h.state.searching,false);assert.equal(h.state.failed,outcome!=='empty');close();
 const retry=harness(async()=>({ok:true,json:async()=>({candidates:[]})}),h.state);const done=retry.start();t.mock.timers.tick(220);await flush();assert.equal(retry.state.searching,false);assert.equal(retry.state.failed,false);done();
});
