import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('real API request adapters retain incoming source version and reject future documents',()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','--loader',fileURLToPath(new URL('./helpers/batch14-repository-loader.mjs',import.meta.url)),fileURLToPath(new URL('./helpers/batch14-server-scenarios.ts',import.meta.url))],{encoding:'utf8',env:{...process.env,BATCH14_API_MOCK:'1'}});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
test('repository reads decode supported rows and expose unsupported stored versions',()=>{
 const result=spawnSync(process.execPath,['--experimental-strip-types','--loader',fileURLToPath(new URL('./helpers/batch14-repository-loader.mjs',import.meta.url)),fileURLToPath(new URL('./helpers/batch14-server-scenarios.ts',import.meta.url)),'repository'],{encoding:'utf8',env:{...process.env,BATCH14_API_MOCK:'0'}});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
