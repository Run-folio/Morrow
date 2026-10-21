import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {authoredContentKey} from '../lib/easyt/trip-retained-authored-content.ts';
import {geographicallyReady,geographicCandidateMatches,geographicInputKey,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {withProviderTimeout} from '../lib/easyt/provider-timeout.ts';
const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function body(name:string){let found:string|undefined;function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node.initializer?.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert(found);return found;}
function actual(code:string,scope:any){return new Function('scope','with(scope){'+ts.transpileModule('const actual='+code+';return actual;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'}')(scope);}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred<T>(){let resolve!:(v:T)=>void;return {promise:new Promise<T>(yes=>resolve=yes),resolve};}
function fixture(response:Promise<any>){
 const trip=requireReadableTripDocument(canonicalRouteFixture());trip.stops[0]={...trip.stops[0],name:'Beijing',country:'China',canonicalPlaceId:'beijing',providerId:undefined,geographicBinding:undefined,longitude:null,latitude:null};
 let review:any=null,calls=0,owner:string|null='owner-a';
 const scope:any={trip,authoredContentKey,geographicallyReady,geographicCandidateMatches,geographicInputKey,stopGeographicPlace,withProviderTimeout,
  builderMountedRef:{current:true},builderEditSessionRef:{current:{getSnapshot:()=>({trip,browserOwnerId:owner,inputRevision:1})}},activeBrowserOwnerIdRef:{current:owner},
  savedFinishRequestRef:{current:null},setSavedFinishReview:(value:any)=>{review=typeof value==='function'?value(review):value;},openClarificationSession:()=>assert.fail('ordinary city must not open area planning'),
  fetch:async(input:any,options:any)=>{calls++;assert.match(String(input),/place=Beijing/);assert(options.signal);return response;},
 };
 for(const name of ['savedTargetPlace','savedTargetKey','savedFinishIsCurrent','dismissSavedFinish','confirmSavedLocation'])scope[name]=actual(body(name),scope);
 return {scope,trip,read:()=>review,calls:()=>calls,start:()=>scope.confirmSavedLocation(trip.stops[0].id),dismiss:()=>scope.dismissSavedFinish(),changeOwner:()=>{owner='owner-b';scope.activeBrowserOwnerIdRef.current=owner;}};
}
test('owned city confirmation deadline includes a stalled JSON body',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const json=deferred<any>(),h=fixture(Promise.resolve({ok:true,json:()=>json.promise})),run=h.start();
 await flush();assert.equal(h.read().status,'loading');t.mock.timers.tick(8_001);await flush();
 try{assert.equal(h.read().status,'unavailable');assert.equal(h.calls(),1);}
 finally{json.resolve({candidates:[]});await run;}
});
test('dismissal while parsing prevents late confirmation publication',async()=>{
 const json=deferred<any>(),h=fixture(Promise.resolve({ok:true,json:()=>json.promise})),run=h.start();await flush();h.dismiss();json.resolve({candidates:[]});await run;assert.equal(h.read(),null);assert.equal(h.calls(),1);
});
test('owner change while parsing cannot publish into the new owner',async()=>{
 const json=deferred<any>(),h=fixture(Promise.resolve({ok:true,json:()=>json.promise})),run=h.start();await flush();const before=h.read();h.changeOwner();json.resolve({candidates:[]});await run;assert.equal(h.read(),before);
});
test('malformed response remains unavailable without altering the owned stop',async()=>{
 const h=fixture(Promise.resolve({ok:true,json:async()=>({candidates:'bad'})})),before=structuredClone(h.trip);await h.start();assert.equal(h.read().status,'unavailable');assert.deepEqual(h.trip,before);
});
