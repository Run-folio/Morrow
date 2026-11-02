import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('ordinary GET preserves acknowledged promotion through first edit and protects competing recovery',()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','--loader',fileURLToPath(new URL('./helpers/batch14-repository-loader.mjs',import.meta.url)),fileURLToPath(new URL('./helpers/trip-read-stability-scenarios.mjs',import.meta.url))],{
  encoding:'utf8',env:{...process.env,BATCH14_API_MOCK:'0',BATCH14_DATABASE_MODE:'fixture',BATCH14_RESOLVER_MODE:'read-stability'},
 });
 assert.equal(result.status,0,result.stdout+result.stderr);
});
