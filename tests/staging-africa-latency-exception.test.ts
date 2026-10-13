import assert from 'node:assert/strict';
import test from 'node:test';
import { isStagingAfricaLatencyException } from './helpers/staging-africa-latency.ts';
const staging = { MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION: '1', GITHUB_ACTIONS: 'true', GITHUB_REF_NAME: 'staging' };
test('staging exception admits only the two approved Africa acceptance contexts', () => {
  assert.equal(isStagingAfricaLatencyException('Africa',1440,'return_to_start',staging),true);
  assert.equal(isStagingAfricaLatencyException('Africa',390,'one_way',staging),true);
  assert.equal(isStagingAfricaLatencyException('Africa',1440,'return_to_start',{...staging,GITHUB_REF_NAME:'codex/staging-africa-latency-exception'}),true);
});
for (const [label,area,width,type,env] of [
  ['main','Africa',1440,'return_to_start',{...staging,GITHUB_REF_NAME:'main'}],
  ['other branch','Africa',1440,'return_to_start',{...staging,GITHUB_REF_NAME:'codex/other'}],
  ['local','Africa',1440,'return_to_start',{...staging,GITHUB_ACTIONS:undefined}],
  ['flag absent','Africa',1440,'return_to_start',{...staging,MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION:undefined}],
  ['flag false','Africa',1440,'return_to_start',{...staging,MORROVIA_STAGING_AFRICA_LATENCY_EXCEPTION:'0'}],
  ['South Korea','South Korea',1440,'return_to_start',staging],
  ['Japan','Japan',1440,'return_to_start',staging],
  ['other width','Africa',768,'return_to_start',staging],
  ['unapproved desktop type','Africa',1440,'one_way',staging],
  ['unapproved mobile type','Africa',390,'return_to_start',staging],
] as const) test(`staging timing exception refuses ${label}`,()=>assert.equal(isStagingAfricaLatencyException(area,width,type,env),false));
