import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {existsSync} from 'node:fs';

async function bundle(path:string) {
 const result=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'no-live-services',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
  b.onResolve({filter:/^\.\/viator-admission\.server\.ts$/},()=>({path:'admission',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='empty'?'':`export const createViatorAdmission=()=>{throw new Error('Explicit synthetic admission required')};export const viatorRetryAfter=()=>60;`}));
 }}]});
 return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const {ViatorAffiliateClient}=await bundle('lib/easyt/viator-affiliate.server.ts');
const configuration={environment:'sandbox',apiBaseUrl:'https://diagnostic.invalid',apiKey:'synthetic-placeholder'};
const destination={canonicalPlaceId:'synthetic',name:'Synthetic',country:'France'};
function client(events:any[],overrides:any={}) {
 return new ViatorAffiliateClient(configuration,{cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'synthetic'}),
  admission:{claim:async()=>({admitted:true,token:'never-log-this-permit'}),release:async()=>{},cooldown:async()=>{}},request:async()=>Response.json({products:[]}),diagnostics:(event:any)=>events.push(event),...overrides});
}
test('diagnostics distinguish admission, provider and permit-release without changing empty success',async()=>{
 const events:any[]=[];assert.deepEqual(await client(events).searchActivities({destination}),[]);
 assert.deepEqual(events.map(e=>[e.stage,e.outcome]),[['admission','started'],['admission','completed'],['provider','started'],['provider','completed'],['permit-release','started'],['permit-release','completed']]);
 assert.ok(events.every(e=>e.operation==='product-search'&&Number.isFinite(e.elapsedMs)));
});
test('an admission rejection logs its safe stage and still dispatches zero provider calls',async()=>{
 const events:any[]=[];let calls=0;
 const error=Object.assign(new Error('secret email@example.test and raw connection string'),{name:'NeonDbError',code:'42P01'});
 await assert.rejects(client(events,{admission:{claim:async()=>{throw error},release:async()=>{},cooldown:async()=>{}},request:async()=>{calls++;return Response.json({products:[]})}}).searchActivities({destination}),(e:any)=>e.category==='unavailable'&&e.lookupAttempted===false);
 assert.equal(calls,0);assert.ok(events.some(e=>e.stage==='admission'&&e.outcome==='failed'));
});
test('a slow release leaves provider completion visible while the original timeout remains enforced',async()=>{
 const events:any[]=[];
 await assert.rejects(client(events,{timeoutMs:5,admission:{claim:async()=>({admitted:true,token:'never-log-this-permit'}),release:async()=>new Promise(r=>setTimeout(r,25)),cooldown:async()=>{}}}).searchActivities({destination}),(e:any)=>e.category==='timeout');
 assert.ok(events.some(e=>e.stage==='provider'&&e.outcome==='completed'));
 assert.ok(events.some(e=>e.stage==='permit-release'&&e.outcome==='started'));
 assert.ok(events.some(e=>e.stage==='request-boundary'&&e.outcome==='timeout'));
 await new Promise(r=>setTimeout(r,30));
 assert.ok(events.some(e=>e.stage==='permit-release'&&e.outcome==='completed'));
});
test('diagnostic sink failure cannot change provider outcome',async()=>{
 assert.deepEqual(await client([],{diagnostics:()=>{throw new Error('sink unavailable')}}).searchActivities({destination}),[]);
});
test('the logging boundary emits only allowlisted metadata and ignores raw exception content',async()=>{
 const module=existsSync('lib/easyt/activity-search-diagnostics.server.ts')?await bundle('lib/easyt/activity-search-diagnostics.server.ts'):{};
 assert.equal(typeof module.createActivitySearchDiagnostics,'function');
 const lines:string[]=[];const logger=module.createActivitySearchDiagnostics((line:string)=>lines.push(line));
 logger.record({stage:'admission',operation:'product-search',outcome:'failed',elapsedMs:12.4,error:{name:'NeonDbError',code:'42P01',message:'email@example.test token=secret coordinates=40.4165,-3.70256',stack:'raw payload',cause:{name:'Error',code:'ECONNRESET',message:'raw DSN'}}});
 logger.record({stage:'untrusted personal data',operation:'email@example.test',outcome:'raw payload',elapsedMs:NaN,error:{name:'email@example.test',code:'secret'}});
 const records=lines.map(line=>JSON.parse(line));
 assert.match(logger.correlationId,/^[0-9a-f-]{36}$/);
 assert.equal(records[0].correlationId,logger.correlationId);assert.equal(records[0].errorName,'NeonDbError');assert.equal(records[0].errorCode,'42P01');assert.equal(records[0].causeCode,'ECONNRESET');
 assert.doesNotMatch(lines.join('\n'),/email@example|secret|40\.4165|3\.70256|raw payload|raw DSN|untrusted personal/);
 assert.deepEqual(Object.keys(records[0]).sort(),['event','correlationId','stage','operation','outcome','elapsedMs','errorName','errorCode','causeName','causeCode'].sort());
});
