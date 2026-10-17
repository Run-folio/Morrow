import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {userInfo} from 'node:os';
import test from 'node:test';
import pg from 'pg';
import {build} from 'esbuild';

// Explicitly opt in to this disposable, Unix-socket-only local database. Never
// read DATABASE_URL or accept a hosted database in this test.
const socket=process.env.MORROVIA_VIATOR_TEST_SOCKET;
test('SQL admission serializes independent workers, finite windows, leases and cooldown',{skip:!socket},async()=>{
 assert.equal(socket,'/tmp/morrovia-guest-viator-pg/socket');
 const schema=`viator_fixture_${process.pid}`;
 const admin=new pg.Pool({host:socket,port:55432,database:'postgres',user:userInfo().username,max:1});
 const workers=new pg.Pool({host:socket,port:55432,database:'postgres',user:userInfo().username,max:20,options:`-c search_path=${schema},pg_catalog`});
 await admin.query(`create schema ${schema}`);
 try {
  await workers.query("create table fixture_clock(instant timestamptz not null); insert into fixture_clock values('2026-10-17T00:00:00Z')");
  await workers.query("create function clock_timestamp() returns timestamptz language sql volatile as 'select instant from fixture_clock'");
  await workers.query(readFileSync('db/migrations/0016_morrovia_viator_budget.sql','utf8'));
  const claim=async(scope:string)=>{
   const token=randomUUID();
   const {rows}=await workers.query('select * from morrovia_viator_claim($1,$2::uuid)',[scope,token]);
   return {...rows[0],token};
  };
  const release=(scope:string,token:string)=>workers.query('update morrovia_viator_budget set leases=leases-$2 where scope=$1',[scope,token]);
  const raced=await Promise.all(Array.from({length:40},()=>claim('race')));
  const admitted=raced.filter(result=>result.admitted);
  assert.equal(admitted.length,2,'forty workers cannot exceed two global slots');
  const {rows:[counter]}=await workers.query("select cardinality(attempts) as day_attempts,(select count(*)::integer from unnest(attempts) a where a>clock_timestamp()-interval '60 seconds') as minute_attempts from morrovia_viator_budget where scope=$1",['race']);
  assert.deepEqual(counter,{minute_attempts:2,day_attempts:2});
  await release('race',admitted[0].token);
  const lastSlot=await Promise.all(Array.from({length:20},()=>claim('race')));
  assert.equal(lastSlot.filter(result=>result.admitted).length,1,'last slot must be atomic');
  await workers.query("update morrovia_viator_budget set leases=jsonb_build_object('expired',extract(epoch from clock_timestamp()-interval '1 second')) where scope='race'");
  assert.equal((await claim('race')).admitted,true,'dead lease recovers capacity');

  const initial=await claim('minute');await release('minute',initial.token);
  for(let i=1;i<20;i++){const permit=await claim('minute');assert.equal(permit.admitted,true);await release('minute',permit.token);}
  const minuteDenied=await claim('minute');assert.equal(minuteDenied.admitted,false);assert.ok(minuteDenied.retry_after_seconds>=1&&minuteDenied.retry_after_seconds<=60);
  await workers.query("update fixture_clock set instant=instant+interval '61 seconds'");
  assert.equal((await claim('minute')).admitted,true);
  await workers.query("update morrovia_viator_budget set attempts=array_fill(clock_timestamp()-interval '120 seconds',array[1000]),leases='{}' where scope='minute'");
  const dayDenied=await claim('minute');assert.equal(dayDenied.admitted,false);assert.ok(dayDenied.retry_after_seconds>86000);
  await workers.query("update fixture_clock set instant=instant+interval '25 hours'");
  assert.equal((await claim('minute')).admitted,true);
  await workers.query("update morrovia_viator_budget set leases='{}',cooldown_until=clock_timestamp()+interval '120 seconds' where scope='minute'");
  const cooled=await claim('minute');assert.equal(cooled.admitted,false);assert.ok(cooled.retry_after_seconds>=119);
  assert.equal((await claim('separate-production-environment')).admitted,true,'environments have separate budgets');
  const firstBoundary=await claim('rolling-boundary');await release('rolling-boundary',firstBoundary.token);
  await workers.query("update fixture_clock set instant=instant+interval '59 seconds'");
  for(let i=1;i<20;i++){const permit=await claim('rolling-boundary');assert.equal(permit.admitted,true);await release('rolling-boundary',permit.token);}
  await workers.query("update fixture_clock set instant=instant+interval '2 seconds'");
  const boundaryAllowed=await claim('rolling-boundary');assert.equal(boundaryAllowed.admitted,true);await release('rolling-boundary',boundaryAllowed.token);
  assert.equal((await claim('rolling-boundary')).admitted,false,'nineteen recent attempts plus one current attempt exhaust a trailing minute across reset');
  // Run the real default client+SQL adapter. Only its database transport uses
  // pg instead of Neon HTTP, and its provider transport is synthetic.
  const compiled=await build({entryPoints:['lib/easyt/viator-affiliate.server.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'local-sql-transport',setup(b){
   b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));
   b.onResolve({filter:/^\.\/database\.ts$/},()=>({path:'database',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='empty'?'':`export function getEasyTDatabase(){return globalThis.__viatorLocalSql;}`}));
  }}]});
  (globalThis as any).__viatorLocalSql=async(strings:TemplateStringsArray,...values:unknown[])=>{
   const query=strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,'');
   return (await workers.query(query,values)).rows;
  };
  const priorOrigin=process.env.NEXT_PUBLIC_APP_URL;process.env.NEXT_PUBLIC_APP_URL='https://disposable-viator.test';
  try {
   let dispatched=0;let finish!:()=>void;
   const pending=new Promise<void>(resolve=>{finish=resolve;});
   const instances=await Promise.all(Array.from({length:10},(_,i)=>import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text+'\n// isolated worker '+i).toString('base64')}`)));
   const results=instances.map(({ViatorAffiliateClient})=>new ViatorAffiliateClient({environment:'sandbox',apiBaseUrl:'https://synthetic.invalid',apiKey:'synthetic-only'},
    {cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>{dispatched++;await pending;return Response.json({products:[]});}})
    .searchActivities({destination:{canonicalPlaceId:'paris',name:'Paris',country:'France'}}).catch((error:any)=>error.category));
   for(let i=0;i<100&&dispatched<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
   assert.equal(dispatched,2);finish();const outcomes=await Promise.all(results);
   assert.equal(outcomes.filter(value=>Array.isArray(value)).length,2);
   assert.equal(outcomes.filter(value=>value==='rate_limited').length,8);
   const {rows:[actual]}=await workers.query("select cardinality(attempts) as day_attempts,(select count(*)::integer from unnest(attempts) a where a>clock_timestamp()-interval '60 seconds') as minute_attempts,leases from morrovia_viator_budget where scope='https://disposable-viator.test|sandbox'");
   assert.deepEqual(actual,{minute_attempts:2,day_attempts:2,leases:{}});
   const {ViatorAffiliateClient}=instances[0];
   const throttled=new ViatorAffiliateClient({environment:'sandbox',apiBaseUrl:'https://synthetic.invalid',apiKey:'synthetic-only'},
    {cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>new Response('',{status:429,headers:{'retry-after':'86400'}})});
   const input={destination:{canonicalPlaceId:'paris',name:'Paris',country:'France'}};
   await assert.rejects(throttled.searchActivities(input),(error:any)=>error.category==='rate_limited'&&error.retryAfterSeconds===86400);
   const {rows:[cooldown]}=await workers.query("select extract(epoch from cooldown_until-clock_timestamp())::integer as remaining from morrovia_viator_budget where scope='https://disposable-viator.test|sandbox'");
   assert.equal(cooldown.remaining,86400);
   await workers.query("update fixture_clock set instant=instant+interval '3601 seconds'");
   await assert.rejects(throttled.searchActivities(input),(error:any)=>error.category==='rate_limited'&&error.lookupAttempted===false);
   process.env.NEXT_PUBLIC_APP_URL='https://disposable-long-cooldown.test';
   const huge=new ViatorAffiliateClient({environment:'sandbox',apiBaseUrl:'https://synthetic.invalid',apiKey:'synthetic-only'},
    {cache:new Map(),resolveDestination:(d:any)=>({...d,providerDestinationId:'479'}),request:async()=>new Response('',{status:429,headers:{'retry-after':'99999999999999999999'}})});
   await assert.rejects(huge.searchActivities(input),(error:any)=>error.category==='rate_limited');
   const {rows:[indefinite]}=await workers.query("select cooldown_until='infinity'::timestamptz as held from morrovia_viator_budget where scope='https://disposable-long-cooldown.test|sandbox'");
   assert.equal(indefinite.held,true);await assert.rejects(huge.searchActivities(input),(error:any)=>error.category==='rate_limited'&&error.lookupAttempted===false);
  } finally {
   if(priorOrigin===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=priorOrigin;
   delete (globalThis as any).__viatorLocalSql;
  }
  console.log('40-worker race=2; last-slot race=1; minute=20; day=1000; expired lease recovered; cooldown blocks; environment isolated');
 } finally {
  await workers.end();await admin.query(`drop schema ${schema} cascade`);await admin.end();
 }
});
