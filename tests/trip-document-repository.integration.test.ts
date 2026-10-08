import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const configured=Boolean(process.env.MORROVIA_TEST_DATABASE_URL)&&process.env.MORROVIA_TEST_DATABASE_DISPOSABLE==='1';
for(const resolverMode of ['identity','actual'])test(`actual SQL (${resolverMode} resolver): CAS, protected source versions, promotion${resolverMode==='actual'?' and A17 pending work':''}`, {skip:!configured?'MANUAL HOSTED VERIFICATION REQUIRED: actual repository CAS/source-version transaction not executed':false},async()=>{
 const {default:pg}=await import('pg');const client=new pg.Client({connectionString:process.env.MORROVIA_TEST_DATABASE_URL});
 const schema=`batch14_${randomUUID().replaceAll('-','')}`;await client.connect();
 try{
  const extension=await client.query("select 1 from pg_extension where extname='pgcrypto'");assert.equal(extension.rowCount,1,'Required pgcrypto must already exist; this runner never installs extensions.');
  await client.query(`create schema "${schema}"`);await client.query(`set search_path to "${schema}", public`);
  for(const name of ['0001_easyt_foundation.sql','0011_easyt_leg_endpoints.sql','0013_easyt_leg_end_endpoint.sql']){
   const source=await readFile(new URL('../db/migrations/'+name,import.meta.url),'utf8');await client.query(source.replace(/^create extension[^;]+;\s*/im,''));
  }
  const output=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
   const child=spawn(process.execPath,['--experimental-strip-types','--loader',fileURLToPath(new URL('./helpers/batch14-repository-loader.mjs',import.meta.url)),fileURLToPath(new URL('./helpers/batch14-repository-scenarios.ts',import.meta.url))],{env:{...process.env,BATCH14_DATABASE_MODE:'disposable',BATCH14_API_MOCK:'0',BATCH14_TEST_SCHEMA:schema,BATCH14_RESOLVER_MODE:resolverMode}});
   let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('close',code=>resolve({code,output}));
  });assert.equal(output.code,0,output.output);console.log(output.output);
 }finally{await client.query(`drop schema if exists "${schema}" cascade`);await client.end();}
});
