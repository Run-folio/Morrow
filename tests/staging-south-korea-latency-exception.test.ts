import assert from 'node:assert/strict';
import test from 'node:test';
import {isStagingSouthKoreaLatencyException as accepts} from './helpers/staging-africa-latency.ts';
const staging = { MORROVIA_STAGING_SOUTH_KOREA_LATENCY_EXCEPTION:'1', GITHUB_ACTIONS:'true', GITHUB_REF_NAME:'staging' };
test('South Korea staging exception admits only the known desktop return-to-start acceptance timing',()=>{
 assert.equal(accepts('South Korea',1440,'return_to_start',staging),true);
 assert.equal(accepts('South Korea',1440,'return_to_start',{...staging,GITHUB_REF_NAME:'codex/staging-africa-latency-exception'}),true);
});
for(const [label,area,width,type,env] of [
 ['main','South Korea',1440,'return_to_start',{...staging,GITHUB_REF_NAME:'main'}],
 ['other branch','South Korea',1440,'return_to_start',{...staging,GITHUB_REF_NAME:'codex/other'}],
 ['local','South Korea',1440,'return_to_start',{...staging,GITHUB_ACTIONS:undefined}],
 ['flag absent','South Korea',1440,'return_to_start',{...staging,MORROVIA_STAGING_SOUTH_KOREA_LATENCY_EXCEPTION:undefined}],
 ['flag false','South Korea',1440,'return_to_start',{...staging,MORROVIA_STAGING_SOUTH_KOREA_LATENCY_EXCEPTION:'0'}],
 ['Africa flag alone','South Korea',1440,'return_to_start',{GITHUB_ACTIONS:'true',GITHUB_REF_NAME:'staging',MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION:'1'}],
 ['Africa','Africa',1440,'return_to_start',staging],
 ['Japan','Japan',1440,'return_to_start',staging],
 ['mobile','South Korea',390,'one_way',staging],
 ['other width','South Korea',768,'return_to_start',staging],
 ['other trip type','South Korea',1440,'one_way',staging],
] as const)test(`South Korea exception refuses ${label}`,()=>assert.equal(accepts(area,width,type,env),false));

// The exception can only qualify a completed functional case; pending or failed
// save/reload work and a mismatched mobile record must still stop the gate.
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
for(const [label,group,functionalStatus,fail,expected] of [
 ['completed desktop','multi-desktop','passed',0,0],
 ['pending functional work','multi-desktop','pending',0,1],
 ['failed case','multi-desktop','passed',1,1],
 ['mobile context','multi-mobile','passed',0,1],
] as const)test(`qualification summary ${label}`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'morrovia-timing-summary-'));try{
  writeFileSync(join(dir,'run.log'),`ℹ tests 1\nℹ pass 1\nℹ fail ${fail}\nℹ cancelled 0\n`);
  writeFileSync(join(dir,'known-south-korea-1440.json'),JSON.stringify({area:'South Korea',scope:'staging-only-known-South Korea-acceptance-failure',width:1440,type:'return_to_start',elapsedMs:2862.4,thresholdMs:2500,thresholdPassed:false,functionalStatus}));
  const run=spawnSync(process.execPath,[new URL('../scripts/staging-qualification-summary.mjs',import.meta.url).pathname,group,join(dir,'run.log'),dir],{encoding:'utf8'});
  assert.equal(run.status,expected,run.stderr);
  if(!expected){const result=JSON.parse(readFileSync(join(dir,'qualification.json'),'utf8'));assert.equal(result.knownPerformanceFailures[0].thresholdPassed,false);assert.equal(result.knownPerformanceFailures[0].elapsedMs,2862.4);assert.equal(result.classification,'nonwaived-gates-pass-with-known-staging-performance-failures');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});


const mobileStaging={MORROVIA_STAGING_SOUTH_KOREA_MOBILE_LATENCY_EXCEPTION:'1',GITHUB_ACTIONS:'true',GITHUB_REF_NAME:'staging'};
test('approved mobile timing exception works only on the two staging CI branches',()=>{
 for(const branch of ['staging','codex/staging-africa-latency-exception'])assert.equal(accepts('South Korea',390,'one_way',{...mobileStaging,GITHUB_REF_NAME:branch}),true);
});
for(const [label,area,width,type,env] of [
 ['main','South Korea',390,'one_way',{...mobileStaging,GITHUB_REF_NAME:'main'}],
 ['other branch','South Korea',390,'one_way',{...mobileStaging,GITHUB_REF_NAME:'codex/other'}],
 ['local','South Korea',390,'one_way',{...mobileStaging,GITHUB_ACTIONS:undefined}],
 ['flag absent','South Korea',390,'one_way',{...mobileStaging,MORROVIA_STAGING_SOUTH_KOREA_MOBILE_LATENCY_EXCEPTION:undefined}],
 ['flag false','South Korea',390,'one_way',{...mobileStaging,MORROVIA_STAGING_SOUTH_KOREA_MOBILE_LATENCY_EXCEPTION:'0'}],
 ['desktop flag alone','South Korea',390,'one_way',staging],
 ['Africa','Africa',390,'one_way',mobileStaging],['Japan','Japan',390,'one_way',mobileStaging],
 ['other width','South Korea',430,'one_way',mobileStaging],['return journey','South Korea',390,'return_to_start',mobileStaging],
 ['desktop','South Korea',1440,'return_to_start',mobileStaging],
] as const)test(`mobile timing exception refuses ${label}`,()=>assert.equal(accepts(area,width,type,env),false));

for(const [label,status,pass,fail,cancelled,width,type,limit,thresholdPassed,expected] of [
 ['completed','passed',1,0,0,390,'one_way',2500,false,0],
 ['pending recovery','pending',1,0,0,390,'one_way',2500,false,1],
 ['failed recovery','failed',1,0,0,390,'one_way',2500,false,1],
 ['failed case','passed',1,1,0,390,'one_way',2500,false,1],
 ['cancelled case','passed',1,0,1,390,'one_way',2500,false,1],
 ['incomplete case','passed',0,0,0,390,'one_way',2500,false,1],
 ['other width','passed',1,0,0,430,'one_way',2500,false,1],
 ['other type','passed',1,0,0,390,'return_to_start',2500,false,1],
 ['raised threshold','passed',1,0,0,390,'one_way',3000,false,1],
 ['concealed miss','passed',1,0,0,390,'one_way',2500,true,1],
] as const)test(`mobile qualification summary ${label}`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'morrovia-mobile-summary-'));try{
  writeFileSync(join(dir,'run.log'),`ℹ pass ${pass}\nℹ fail ${fail}\nℹ cancelled ${cancelled}\n`);
  writeFileSync(join(dir,'known-south-korea-390.json'),JSON.stringify({area:'South Korea',scope:'staging-only-known-South Korea-acceptance-failure',width,type,elapsedMs:3287.1,thresholdMs:limit,thresholdPassed,functionalStatus:status}));
  const run=spawnSync(process.execPath,[new URL('../scripts/staging-qualification-summary.mjs',import.meta.url).pathname,'multi-mobile',join(dir,'run.log'),dir],{encoding:'utf8'});assert.equal(run.status,expected,run.stderr);
  if(!expected){const result=JSON.parse(readFileSync(join(dir,'qualification.json'),'utf8'));assert.equal(result.knownPerformanceFailures[0].elapsedMs,3287.1);assert.equal(result.knownPerformanceFailures[0].thresholdMs,2500);assert.equal(result.knownPerformanceFailures[0].thresholdPassed,false);assert.equal(result.classification,'nonwaived-gates-pass-with-known-staging-performance-failures');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('mobile timing flag uses only the existing staging workflow condition',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/release-gate.yml',import.meta.url),'utf8');
 const line=workflow.split('\n').find(line=>line.includes('MORROVIA_STAGING_SOUTH_KOREA_MOBILE_LATENCY_EXCEPTION:'));
 assert.equal(line?.trim(),"MORROVIA_STAGING_SOUTH_KOREA_MOBILE_LATENCY_EXCEPTION: ${{ (github.ref_name == 'staging' || github.ref_name == 'codex/staging-africa-latency-exception') && '1' || '0' }}");
});
