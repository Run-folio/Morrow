import assert from 'node:assert/strict';
import test from 'node:test';
import {assertStagingConnectionTarget,assertStagingDeploymentMetadata,STAGING_DEPLOYMENT_TARGET,STAGING_METADATA_QUERY} from '../lib/easyt/staging-deployment-target.mjs';
import {createVerifiedStagingPlaceQuery} from '../lib/easyt/public-place-durable.server.ts';
import {verifyStagingDatabase} from '../scripts/staging-safety.mjs';
const url='postgresql://fixture@ep-fancy-credit-ar0ithc8.c-4.us-west-2.aws.neon.tech/morrovia_staging?sslmode=require';
const metadata={...STAGING_DEPLOYMENT_TARGET,connected_database:'morrovia_staging',verification_reference:'review-20261022',verified_at:'2026-10-01T00:00:00Z'};
test('only reviewed direct or pooled staging route with explicit TLS can connect',()=>{
 assert.equal(assertStagingConnectionTarget(url),STAGING_DEPLOYMENT_TARGET);
 assert.equal(assertStagingConnectionTarget(url.replace('.c-4.','-pooler.c-4.')),STAGING_DEPLOYMENT_TARGET);
 for(const value of [undefined,'',url.replace('/morrovia_staging','/neondb'),url.replace('ep-fancy-credit-ar0ithc8','ep-fancy-credit-ar0ithc8-other'),url.replace('.tech/','.tech:5433/'),url.replace('postgresql:','https:'),url.replace('?sslmode=require',''),url.replace('require','disable'),url+'&host=production.invalid',url+'&hostaddr=127.0.0.1',url+'&dbname=neondb',url+'&options=-csearch_path=evil',url+'&sslmode=require',url+'&sslrootcert=unreviewed',url+'#fragment'])assert.throws(()=>assertStagingConnectionTarget(value),/Verified staging connection required/);
});
test('metadata attests every pinned field and actual database; absent/ambiguous/future data rejects',()=>{
 assert.doesNotThrow(()=>assertStagingDeploymentMetadata([metadata]));
 for(const rows of [[],[metadata,metadata],...[...Object.keys(STAGING_DEPLOYMENT_TARGET),'connected_database'].map(key=>[{...metadata,[key]:'wrong'}]),[{...metadata,verification_reference:''}],[{...metadata,verified_at:'invalid'}],[{...metadata,verified_at:'2999-01-01'}]])assert.throws(()=>assertStagingDeploymentMetadata(rows),/Verified staging deployment metadata required/);
});
test('wrong target initializes no driver; missing metadata cannot issue application SQL',async()=>{
 let factories=0,queries=0;
 const getDatabase=async()=>{factories++;return {query:async()=>{queries++;return [];}}};
 await assert.rejects(createVerifiedStagingPlaceQuery({environment:{DATABASE_URL:url+'&host=wrong'},getDatabase})('select 1',[],new AbortController().signal));
 assert.equal(factories,0);
 await assert.rejects(createVerifiedStagingPlaceQuery({environment:{DATABASE_URL:url},getDatabase})('select 1',[],new AbortController().signal));
 assert.equal(factories,1);assert.equal(queries,1);
});
test('driver receives exactly captured validated connection and metadata precedes every query',async()=>{
 const environment={DATABASE_URL:url};const calls:string[]=[];let captured='';
 const query=createVerifiedStagingPlaceQuery({environment,getDatabase:async value=>{captured=value;environment.DATABASE_URL='postgresql://production.invalid/neondb';return {query:async text=>{calls.push(text);return text===STAGING_METADATA_QUERY?[metadata]:[{ok:true}];}};}});
 assert.deepEqual(await query('select application_fixture',[],new AbortController().signal),[{ok:true}]);assert.equal(captured,url);assert.deepEqual(calls,[STAGING_METADATA_QUERY,'select application_fixture']);
});
test('metadata outage or cancellation prevents work; failed preflight closes its client',async()=>{
 const controller=new AbortController();let work=0;
 await assert.rejects(createVerifiedStagingPlaceQuery({environment:{DATABASE_URL:url},getDatabase:async()=>({query:async text=>{if(text===STAGING_METADATA_QUERY){controller.abort();return [metadata];}work++;return [];}})})('select fixture',[],controller.signal));assert.equal(work,0);
 let closed=0;
 await assert.rejects(verifyStagingDatabase({databaseUrl:url},{createClient:()=>({connect:async()=>{},query:async()=>({rows:[]}),end:async()=>{closed++;}})}));assert.equal(closed,1);
});
