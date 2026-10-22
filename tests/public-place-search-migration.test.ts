import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';
test('staging migration is guarded, additive and grants no public write/execute authority',()=>{
 const sql=readFileSync('db/migrations/0017_morrovia_place_research.sql','utf8');
 assert.match(sql,/current_database\(\) is distinct from 'morrovia_staging'/);
 assert.doesNotMatch(sql,/app\.morrovia_environment|alter database|alter role|alter system/i);
 assert.match(sql,/create table if not exists public\.morrovia_deployment_metadata/i);
 assert.match(sql,/endpoint_host='ep-fancy-credit-ar0ithc8\.c-4\.us-west-2\.aws\.neon\.tech'/);
 assert.match(sql,/on conflict\s*\(deployment_key\)\s*do nothing/i);
 assert.match(sql,/not exists\s*\(select 1 from public\.morrovia_deployment_metadata/gi);
 assert.doesNotMatch(sql,/\b(drop|truncate|grant)\b/i);assert.doesNotMatch(sql,/\b(?:alter|update|delete from|insert into)\s+(?:public\.)?(?:easyt_|user\b|session\b|account\b)/i);
 assert.match(sql,/for update/i);assert.match(sql,/total_reserved_micro_usd\s*\+\s*p_upper_micro_usd/);assert.match(sql,/total_limit_micro_usd between 0 and 1000000/);assert.match(sql,/interval '24 hours'/);assert.match(sql,/interval '60 seconds'/);assert.match(sql,/revoke all on function[\s\S]*from public/i);
 assert.doesNotMatch(sql,/total_reserved_micro_usd\s*=\s*0/);assert.match(sql,/status in \('reviewed','revoked'\)/);
});
