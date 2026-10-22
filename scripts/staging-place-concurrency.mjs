import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {assertStagingConnectionTarget,assertStagingDeploymentMetadata,STAGING_METADATA_QUERY,STAGING_DEPLOYMENT_TARGET} from '../lib/easyt/staging-deployment-target.mjs';

const schema='morrovia_place_research_qualification_20261022';
const table=`${schema}.morrovia_place_research_budget`;
const fn=`${schema}.morrovia_place_research_claim`;
const scope='morrovia:place-research:staging';
export const reviewedQualificationFunctionBody=readFileSync(new URL('../db/migrations/0017_morrovia_place_research.sql',import.meta.url),'utf8').split('as $claim$')[1].split('$claim$;')[0].replaceAll('public.',schema+'.').trim();

/** Opt-in qualification only: existing process configuration; no env-file/credential retrieval. */
export async function runStagingPlaceConcurrency({databaseUrl,confirmed=false,createClient=options=>new Client(options)}) {
  assert.equal(confirmed,true,'Explicit isolated concurrency qualification required');
  assertStagingConnectionTarget(databaseUrl);
  assert.equal(new URL(databaseUrl).hostname,STAGING_DEPLOYMENT_TARGET.endpoint_host,'Qualification requires the reviewed direct endpoint');
  const clients=[0,1].map(()=>createClient({connectionString:databaseUrl,connectionTimeoutMillis:5000,query_timeout:5000,statement_timeout:5000}));
  const [a,b]=clients;let touched=false,cleanupFailed=false;
  try {
    await Promise.all(clients.map(client=>client.connect()));
    for(const client of clients)assertStagingDeploymentMetadata((await client.query(STAGING_METADATA_QUERY)).rows);
    const prerequisites=(await a.query(`select pg_get_userbyid(n.nspowner)=current_user as owns_schema,
      pg_get_userbyid(p.proowner)=current_user as owns_function,p.prosecdef=false as invoker_function,
      p.prosrc as function_body,p.proconfig as function_settings,p.proargnames as argument_names,
      p.proretset and p.prorettype='record'::regtype and p.prokind='f' and p.provolatile='v' and p.pronargdefaults=0 and l.lanname='plpgsql' as expected_function_metadata
      from pg_namespace n join pg_proc p on p.pronamespace=n.oid join pg_language l on l.oid=p.prolang
      where n.nspname=$1 and p.oid=$2::regprocedure`,[schema,`${fn}(text,uuid,text,bigint,text)`])).rows;
    assert.equal(prerequisites.length,1,'Reviewed isolated qualification objects required');
    const installed=prerequisites[0];
    assert.ok(installed.owns_schema&&installed.owns_function&&installed.invoker_function&&installed.expected_function_metadata,'Reviewed isolated qualification objects required');
    assert.equal(installed.function_body.trim(),reviewedQualificationFunctionBody,'Installed function must exactly match reviewed migration body');
    assert.deepEqual(installed.argument_names,['p_scope','p_reservation','p_policy_version','p_upper_micro_usd','p_review_reference','admitted','reservation_id','reserved_micro_usd','policy_version']);
    assert.deepEqual(installed.function_settings?.map(value=>value.replace(/\s/g,'')),[`search_path=pg_catalog,${schema}`]);
    const existing=(await a.query(`select enabled from ${table} where scope=$1`,[scope])).rows;
    assert.ok(existing.length<=1&&existing.every(row=>row.enabled===false),'Qualification policy must start disabled');
    // This exact isolated table is never read by the application admission adapter.
    touched=true;
    await a.query(`insert into ${table}(scope,enabled,policy_version,review_reference,qualified_until,total_limit_micro_usd,daily_limit_micro_usd)
      values($1,true,'luna-place-v1','concurrency-qualification',clock_timestamp()+interval '1 minute',250000,250000)
      on conflict(scope) do update set enabled=true,policy_version='luna-place-v1',review_reference='concurrency-qualification',
      qualified_until=clock_timestamp()+interval '1 minute',total_limit_micro_usd=250000,daily_limit_micro_usd=250000,
      total_reserved_micro_usd=0,claims='[]',leases='{}',minute_limit=4`,[scope]);
    await a.query('begin');await b.query('begin');
    const [pidA,pidB]=await Promise.all(clients.map(async client=>(await client.query('select pg_backend_pid() as pid')).rows[0].pid));
    assert.notEqual(pidA,pidB,'Independent backend sessions required');
    const claim=`select admitted,reserved_micro_usd from ${fn}($1,$2::uuid,'luna-place-v1',250000,'concurrency-qualification')`;
    const first=(await a.query(claim,[scope,randomUUID()])).rows[0];assert.equal(first?.admitted,true);
    let finished=false;
    const pending=b.query(claim,[scope,randomUUID()]).then(value=>{finished=true;return {value};},()=>{finished=true;return {error:true};});
    const deadline=Date.now()+1500;let blocked=false;
    while(Date.now()<deadline&&!finished){
      const row=(await a.query('select $1::integer=any(pg_blocking_pids($2::integer)) as blocked',[pidA,pidB])).rows[0];
      if(row?.blocked){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(blocked&&!finished,'Second backend must demonstrably wait on first backend lock');
    await a.query('commit');const second=await pending;assert.ok('value' in second,'Second claim failed');
    assert.equal(second.value.rows[0]?.admitted,false);await b.query('commit');
    const state=(await a.query(`select total_reserved_micro_usd,jsonb_array_length(claims) as claim_count from ${table} where scope=$1`,[scope])).rows[0];
    assert.equal(Number(state.total_reserved_micro_usd),250000);assert.equal(state.claim_count,1);
    return {passed:true,independentBackends:true,observedLockWait:true,admitted:1,denied:1,reservedMicroUsd:250000,paidCalls:0};
  } finally {
    await Promise.all(clients.map(client=>client.query('rollback').catch(()=>{})));
    if(touched)try{await a.query(`update ${table} set enabled=false,total_limit_micro_usd=0,daily_limit_micro_usd=0 where scope=$1`,[scope]);}catch{cleanupFailed=true;}
    await Promise.all(clients.map(client=>client.end().catch(()=>{})));
    if(cleanupFailed)throw new Error('Qualification cleanup failed; inspect isolated test policy');
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    assert.equal(process.env.MORROVIA_ENVIRONMENT,'staging','Explicit staging environment required');
    assert.notEqual(process.env.MORROVIA_PLACE_RESEARCH_ENABLED,'true','Live AI must remain disabled');
    console.log(JSON.stringify(await runStagingPlaceConcurrency({databaseUrl:process.env.DATABASE_URL,confirmed:process.env.MORROVIA_PLACE_RESEARCH_CONCURRENCY_TESTS==='1'})));
  }catch{console.error('Isolated staging concurrency qualification failed; no credentials are included in this diagnostic.');process.exitCode=1;}
}
